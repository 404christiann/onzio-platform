import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BunnyStreamError, createVideo, deleteVideo, findOrCreateCollection, getVideo,
  isMp4FallbackReady, listCollectionVideos, tusUploadAuthorization, videoReadiness, type BunnyVideo,
} from "@/lib/bunny-stream";

const KEY = "test-secret-key-123";
const fetchStub = vi.fn();
const res = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const video = (over: Partial<BunnyVideo> = {}): BunnyVideo => ({
  guid: "g1", collectionId: "c1", status: 4, availableResolutions: ["480p", "720p"], hasMP4Fallback: true, width: 1280, height: 720, storageSize: 0, dateUploaded: "", ...over,
});

beforeEach(() => { fetchStub.mockReset(); vi.stubGlobal("fetch", fetchStub); vi.stubEnv("BUNNY_STREAM_API_KEY", KEY); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("bunny stream client", () => {
  it("finds an exact-name collection without creating one", async () => {
    fetchStub.mockResolvedValueOnce(res(200, { items: [{ guid: "other", name: "club-abc-extra" }, { guid: "c1", name: "club-abc" }] }));
    expect(await findOrCreateCollection("abc")).toBe("c1");
    expect(fetchStub).toHaveBeenCalledOnce();
    const [url, init] = fetchStub.mock.calls[0];
    expect(url).toBe("https://video.bunnycdn.com/library/723074/collections?search=club-abc&itemsPerPage=100");
    expect(init.headers).toMatchObject({ AccessKey: KEY, accept: "application/json" });
  });

  it("creates the collection when none matches exactly", async () => {
    fetchStub.mockResolvedValueOnce(res(200, { items: [{ guid: "x", name: "club-abcd" }] })).mockResolvedValueOnce(res(200, { guid: "new" }));
    expect(await findOrCreateCollection("abc")).toBe("new");
    expect(fetchStub.mock.calls[1][1]).toMatchObject({ method: "POST", body: JSON.stringify({ name: "club-abc" }) });
  });

  it("creates a video in a collection", async () => {
    fetchStub.mockResolvedValueOnce(res(200, { guid: "v1" }));
    expect(await createVideo({ title: "t", collectionId: "c1" })).toBe("v1");
    expect(fetchStub.mock.calls[0][0]).toBe("https://video.bunnycdn.com/library/723074/videos");
  });

  it("getVideo returns null on 404 and parses fields", async () => {
    fetchStub.mockResolvedValueOnce(res(404));
    expect(await getVideo("g1")).toBeNull();
    fetchStub.mockResolvedValueOnce(res(200, { guid: "g1", collectionId: "c1", status: 4, availableResolutions: "240p,720p", hasMP4Fallback: true, width: 1, height: 2, storageSize: 3_000_000_000, dateUploaded: "2026-01-01T00:00:00Z" }));
    expect(await getVideo("g1")).toMatchObject({ availableResolutions: ["240p", "720p"], hasMP4Fallback: true, collectionId: "c1", storageSize: 3_000_000_000, dateUploaded: "2026-01-01T00:00:00Z" });
    fetchStub.mockResolvedValueOnce(res(200, { guid: "g2" }));
    expect(await getVideo("g2")).toMatchObject({ storageSize: 0, dateUploaded: "" });
  });

  it("lists collection videos", async () => {
    fetchStub.mockResolvedValueOnce(res(200, { items: [{ guid: "a", status: 4, storageSize: 42, dateUploaded: "2026-01-01T00:00:00Z" }, { guid: "b" }] }));
    expect(await listCollectionVideos("c1")).toEqual([
      { guid: "a", status: 4, storageSize: 42, dateUploaded: "2026-01-01T00:00:00Z" },
      { guid: "b", status: 0, storageSize: 0, dateUploaded: "" },
    ]);
    expect(fetchStub.mock.calls[0][0]).toContain("/videos?collection=c1&itemsPerPage=100");
  });

  it("deleteVideo treats 404 as already deleted and throws typed errors otherwise", async () => {
    fetchStub.mockResolvedValueOnce(res(404));
    expect(await deleteVideo("g1")).toBe(true);
    fetchStub.mockResolvedValueOnce(res(500));
    const error = await deleteVideo("g1").catch((e) => e);
    expect(error).toBeInstanceOf(BunnyStreamError);
    expect(error.status).toBe(500);
    expect(error.message).not.toContain(KEY);
  });

  it("signs the tus authorization and never returns the key", () => {
    const auth = tusUploadAuthorization("vid", 1234);
    expect(auth).toEqual({
      endpoint: "https://video.bunnycdn.com/tusupload", libraryId: "723074", videoId: "vid", expire: 1234,
      signature: createHash("sha256").update(`723074${KEY}1234vid`).digest("hex"),
    });
    expect(JSON.stringify(auth)).not.toContain(KEY);
  });

  describe("readiness", () => {
    it("is ready only when finished, fallback, 720p and the HEAD succeeds", async () => {
      fetchStub.mockResolvedValueOnce(new Response(null, { status: 200 }));
      expect(await isMp4FallbackReady(video())).toBe(true);
      expect(fetchStub.mock.calls[0][0]).toBe("https://vz-dab9684b-901.b-cdn.net/g1/play_720p.mp4");
      expect(fetchStub.mock.calls[0][1]).toMatchObject({ method: "HEAD" });
    });
    it("stays processing when the HEAD is not 2xx or throws", async () => {
      fetchStub.mockResolvedValueOnce(new Response(null, { status: 404 }));
      expect(await videoReadiness(video())).toBe("processing");
      fetchStub.mockRejectedValueOnce(new Error("net"));
      expect(await videoReadiness(video())).toBe("processing");
    });
    it("maps failure, low resolution and in-progress states without a HEAD", async () => {
      expect(await videoReadiness(video({ status: 5 }))).toBe("failed");
      expect(await videoReadiness(video({ status: 6 }))).toBe("failed");
      expect(await videoReadiness(video({ availableResolutions: ["480p"] }))).toBe("resolution_too_low");
      expect(await videoReadiness(video({ status: 3 }))).toBe("processing");
      expect(await videoReadiness(video({ hasMP4Fallback: false }))).toBe("processing");
      expect(fetchStub).not.toHaveBeenCalled();
    });
  });
});
