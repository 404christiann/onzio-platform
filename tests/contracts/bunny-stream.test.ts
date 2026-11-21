import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as bunnyStream from "@/lib/bunny-stream";
import {
  BunnyStreamError, createVideo, deleteVideo, findOrCreateCollection, getVideo,
  listCollectionVideos, tusUploadAuthorization, HERO_VIDEO_RESOLUTIONS, videoReadiness,
} from "@/lib/bunny-stream";

const KEY = "test-secret-key-123";
const fetchStub = vi.fn();
const res = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

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

  it("getVideo maps Bunny's length (seconds), with 0 for missing or unusable values", async () => {
    fetchStub.mockResolvedValueOnce(res(200, { guid: "g1", length: 601 }));
    expect((await getVideo("g1"))?.length).toBe(601);
    fetchStub.mockResolvedValueOnce(res(200, { guid: "g1", length: 1234.5 }));
    expect((await getVideo("g1"))?.length).toBe(1234.5);
    fetchStub.mockResolvedValueOnce(res(200, { guid: "g1" }));
    expect((await getVideo("g1"))?.length).toBe(0);
    fetchStub.mockResolvedValueOnce(res(200, { guid: "g1", length: "not a number" }));
    expect((await getVideo("g1"))?.length).toBe(0);
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
      endpoint: "https://video.bunnycdn.com/tusupload", libraryId: "723074", videoId: "vid", expire: 1234, enabledResolutions: "240p,360p,480p,720p",
      signature: createHash("sha256").update(`723074${KEY}1234vid`).digest("hex"),
    });
    expect(auth.enabledResolutions).toBe(HERO_VIDEO_RESOLUTIONS);
    expect(JSON.stringify(auth)).not.toContain(KEY);
  });

  describe("readiness comes from the Stream API only, never the CDN", () => {
    // Video API VideoModelStatus: 0 Created, 1 Uploaded, 2 Processing, 3 Transcoding, 4 Finished, 5 Error, 6 UploadFailed, 7 JitSegmenting, 8 JitPlaylistsCreated.
    const apiVideo = (over: Record<string, unknown> = {}) => res(200, {
      guid: "g1", collectionId: "c1", status: 4, availableResolutions: "240p,360p,480p,720p", hasMP4Fallback: true, encodeProgress: 100, ...over,
    });
    const readinessFromApi = async (over: Record<string, unknown> = {}) => {
      fetchStub.mockResolvedValueOnce(apiVideo(over));
      const fetched = await getVideo("g1");
      return videoReadiness(fetched!);
    };
    const urls = () => fetchStub.mock.calls.map((call) => new URL(String(call[0])));
    afterEach(() => {
      // Whatever a test did, no request may have gone to a pull zone (*.b-cdn.net): the CDN has security on and answers 403.
      expect(urls().filter((url) => url.hostname.endsWith(".b-cdn.net"))).toEqual([]);
      expect(urls().every((url) => url.hostname === "video.bunnycdn.com")).toBe(true);
    });

    it("is ready when Bunny says Finished (4), with a 720p rendition and an MP4 fallback", async () => {
      expect(await readinessFromApi()).toEqual({ status: "ready" });
      expect(fetchStub).toHaveBeenCalledOnce();
      expect(String(fetchStub.mock.calls[0][0])).toBe("https://video.bunnycdn.com/library/723074/videos/g1");
      expect(fetchStub.mock.calls[0][1]).toMatchObject({ method: "GET", headers: { AccessKey: KEY } });
    });
    it("reads the 720p rendition from Bunny's comma-separated availableResolutions", async () => {
      expect(await readinessFromApi({ availableResolutions: "720p" })).toEqual({ status: "ready" });
      expect(await readinessFromApi({ availableResolutions: "240p, 720p " })).toEqual({ status: "ready" });
    });
    it.each([[0, "Created"], [1, "Uploaded"], [2, "Processing"], [3, "Transcoding"], [7, "JitSegmenting"], [8, "JitPlaylistsCreated"]])(
      "is still encoding at video status %s (%s), even with a 720p rendition and a fallback flag", async (status) => {
        expect(await readinessFromApi({ status })).toEqual({ status: "not_ready", reason: "encoding" });
      });
    it("never treats video status 3 as finished: the webhook's Finished is 3, the video's Transcoding is 3", async () => {
      expect(await readinessFromApi({ status: 3, availableResolutions: "240p,360p,480p,720p", hasMP4Fallback: true })).toEqual({ status: "not_ready", reason: "encoding" });
    });
    it("fails with mp4_missing when Finished has 720p but no MP4 fallback", async () => {
      expect(await readinessFromApi({ hasMP4Fallback: false })).toEqual({ status: "failed", reason: "mp4_missing" });
      expect(await readinessFromApi({ hasMP4Fallback: undefined })).toEqual({ status: "failed", reason: "mp4_missing" });
    });
    it("fails with resolution_missing when Finished has no 720p rendition", async () => {
      expect(await readinessFromApi({ availableResolutions: "240p,360p,480p" })).toEqual({ status: "failed", reason: "resolution_missing" });
      expect(await readinessFromApi({ availableResolutions: "" })).toEqual({ status: "failed", reason: "resolution_missing" });
      expect(await readinessFromApi({ availableResolutions: null })).toEqual({ status: "failed", reason: "resolution_missing" });
      expect(await readinessFromApi({ availableResolutions: "7200p,1720p" })).toEqual({ status: "failed", reason: "resolution_missing" });
    });
    it("reports the missing resolution before the missing fallback", async () => {
      expect(await readinessFromApi({ availableResolutions: "480p", hasMP4Fallback: false })).toEqual({ status: "failed", reason: "resolution_missing" });
    });
    it.each([[5, "Error"], [6, "UploadFailed"]])("fails at video status %s (%s)", async (status) => {
      expect(await readinessFromApi({ status })).toEqual({ status: "failed", reason: "failed" });
    });
    it("keeps waiting on a status it does not know instead of failing a video", async () => {
      expect(await readinessFromApi({ status: 99 })).toEqual({ status: "not_ready", reason: "encoding" });
    });
    it("throws on an API error so the webhook answers 5xx and the cron moves on, without the key", async () => {
      fetchStub.mockResolvedValueOnce(res(500));
      const error = await getVideo("g1").catch((e) => e);
      expect(error).toBeInstanceOf(BunnyStreamError);
      expect(error.status).toBe(500);
      expect(error.message).not.toContain(KEY);
      fetchStub.mockResolvedValueOnce(res(403));
      expect((await getVideo("g1").catch((e) => e)).status).toBe(403);
      fetchStub.mockRejectedValueOnce(new Error("network down"));
      await expect(getVideo("g1")).rejects.toThrow("network down");
    });
    it("a 404 is a missing video, not an error", async () => {
      fetchStub.mockResolvedValueOnce(res(404));
      expect(await getVideo("g1")).toBeNull();
    });
    it("classifying a fetched video makes no request of its own", () => {
      const fetched = { guid: "g1", collectionId: "c1", status: 4, availableResolutions: ["720p"], hasMP4Fallback: true, width: 1280, height: 720, storageSize: 0, length: 0, dateUploaded: "", encodeProgress: 100 };
      expect(videoReadiness(fetched)).toEqual({ status: "ready" });
      expect(fetchStub).not.toHaveBeenCalled();
    });
    it("has no CDN probe left in the client", () => {
      expect(bunnyStream).not.toHaveProperty("isMp4FallbackReady");
      const source = readFileSync("lib/bunny-stream.ts", "utf8");
      expect(source).not.toMatch(/HEAD/);
      expect(source).not.toMatch(/b-cdn\.net|bunnyVideoMp4Url|bunny-video"/);
      // The one request this module makes is the authenticated Stream API call.
      expect(source.match(/\bfetch\(/g)).toHaveLength(1);
    });
  });
});
