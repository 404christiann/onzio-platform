import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HERO_POSTER_MIN_WIDTH } from "@/lib/hero-video-lifecycle";
import { heroPosterAssetId } from "@/lib/hero-video-poster-id";

const m = vi.hoisted(() => ({
  getVideo: vi.fn(), fetchVideoThumbnail: vi.fn(), systemPhotoExists: vi.fn(), publishSystemPhoto: vi.fn(), retirePublishedMedia: vi.fn(),
}));
vi.mock("@/lib/bunny-stream", () => ({ getVideo: m.getVideo }));
vi.mock("@/lib/bunny-thumbnail", () => ({ fetchVideoThumbnail: m.fetchVideoThumbnail }));
vi.mock("@/lib/media-processing", () => ({
  systemPhotoExists: m.systemPhotoExists, publishSystemPhoto: m.publishSystemPhoto, retirePublishedMedia: m.retirePublishedMedia,
}));

const CLUB = "11111111-1111-4111-8111-111111111111";
const GUID = "00000000-0000-4000-8000-000000000001";
const COL = "col-1";

describe("preparing a poster", () => {
  const asset = heroPosterAssetId(CLUB, GUID);
  const base = { clubId: CLUB, videoGuid: GUID, collectionId: COL };
  const recent = { landedAt: new Date(Date.now() - 60_000).toISOString() };
  const old = { landedAt: new Date(Date.now() - 3_600_000).toISOString() };
  const bytes = Buffer.from("jpeg-bytes");
  let errors: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    errors = vi.spyOn(console, "error").mockImplementation(() => {});
    m.systemPhotoExists.mockResolvedValue(false);
    m.getVideo.mockResolvedValue({ guid: GUID, collectionId: COL, thumbnailFileName: "thumbnail.jpg" });
    m.fetchVideoThumbnail.mockResolvedValue({ status: "ok", bytes });
    m.publishSystemPhoto.mockResolvedValue({ assetId: asset, storagePath: "p", idempotent: false });
    m.retirePublishedMedia.mockResolvedValue({ status: "retired", cleanupQueued: false, idempotent: false });
  });

  async function load() {
    return import("@/lib/hero-video-poster");
  }

  it("fetches the still Bunny named, publishes it as a homepage photograph under the deterministic id, and returns that id", async () => {
    const { prepareHeroPoster } = await load();
    expect(await prepareHeroPoster({ ...base, timing: recent })).toEqual({ status: "ready", assetId: asset });
    expect(m.fetchVideoThumbnail).toHaveBeenCalledWith(GUID, "thumbnail.jpg");
    expect(m.publishSystemPhoto).toHaveBeenCalledWith({
      clubId: CLUB, surface: "homepage", assetId: asset, bytes, minimumWidth: HERO_POSTER_MIN_WIDTH, source: "hero-video-poster",
    });
    expect(errors).not.toHaveBeenCalled();
  });

  it("a poster that already exists is ready at once: nothing is fetched or processed twice", async () => {
    m.systemPhotoExists.mockResolvedValue(true);
    const { prepareHeroPoster } = await load();
    expect(await prepareHeroPoster({ ...base, timing: old })).toEqual({ status: "ready", assetId: asset });
    expect(m.getVideo).not.toHaveBeenCalled();
    expect(m.fetchVideoThumbnail).not.toHaveBeenCalled();
    expect(m.publishSystemPhoto).not.toHaveBeenCalled();
  });

  it("refuses a video that is missing or sits in another club's collection, before any request to the CDN", async () => {
    const { prepareHeroPoster } = await load();
    m.getVideo.mockResolvedValueOnce(null);
    expect(await prepareHeroPoster({ ...base, timing: recent })).toEqual({ status: "unavailable", reason: "VIDEO_MISSING" });
    m.getVideo.mockResolvedValueOnce({ guid: GUID, collectionId: "someone-else", thumbnailFileName: "thumbnail.jpg" });
    expect(await prepareHeroPoster({ ...base, timing: recent })).toEqual({ status: "unavailable", reason: "NOT_CLUB_VIDEO" });
    expect(m.fetchVideoThumbnail).not.toHaveBeenCalled();
    expect(m.publishSystemPhoto).not.toHaveBeenCalled();
  });

  it("a still that is not there yet is processing inside the grace and unavailable after it", async () => {
    m.fetchVideoThumbnail.mockResolvedValue({ status: "transient", reason: "NOT_FOUND" });
    const { prepareHeroPoster } = await load();
    expect(await prepareHeroPoster({ ...base, timing: recent })).toEqual({ status: "processing" });
    expect(await prepareHeroPoster({ ...base, timing: old })).toEqual({ status: "unavailable", reason: "NOT_FOUND" });
    expect(await prepareHeroPoster({ ...base, timing: {} })).toEqual({ status: "unavailable", reason: "NOT_FOUND" });
    expect(m.publishSystemPhoto).not.toHaveBeenCalled();
  });

  it("a permanent refusal is unavailable at once, even inside the grace", async () => {
    m.fetchVideoThumbnail.mockResolvedValue({ status: "permanent", reason: "FORBIDDEN" });
    const { prepareHeroPoster } = await load();
    expect(await prepareHeroPoster({ ...base, timing: recent })).toEqual({ status: "unavailable", reason: "FORBIDDEN" });
  });

  it("a rejected image (not an image, too small) or a failed publish is unavailable with the reason code, and never throws", async () => {
    const { prepareHeroPoster } = await load();
    m.publishSystemPhoto.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "MEDIA_TOO_SMALL" }));
    expect(await prepareHeroPoster({ ...base, timing: recent })).toEqual({ status: "unavailable", reason: "MEDIA_TOO_SMALL" });
    m.publishSystemPhoto.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "SIGNATURE_MISMATCH" }));
    expect(await prepareHeroPoster({ ...base, timing: recent })).toEqual({ status: "unavailable", reason: "SIGNATURE_MISMATCH" });
    m.publishSystemPhoto.mockRejectedValueOnce(new Error("storage down"));
    expect(await prepareHeroPoster({ ...base, timing: recent })).toEqual({ status: "unavailable", reason: "PUBLISH_FAILED" });
  });

  it("anything unexpected, in the Stream API call or the existence check, is unavailable and never a throw", async () => {
    const { prepareHeroPoster } = await load();
    m.getVideo.mockRejectedValueOnce(new Error("down"));
    expect(await prepareHeroPoster({ ...base, timing: recent })).toEqual({ status: "unavailable", reason: "POSTER_FAILED" });
    m.systemPhotoExists.mockRejectedValueOnce(new Error("db down"));
    expect(await prepareHeroPoster({ ...base, timing: recent })).toEqual({ status: "unavailable", reason: "POSTER_FAILED" });
  });

  it("logs one line per failure with the club id and a reason code, and nothing else", async () => {
    m.fetchVideoThumbnail.mockResolvedValue({ status: "permanent", reason: "FORBIDDEN" });
    const { prepareHeroPoster } = await load();
    await prepareHeroPoster({ ...base, timing: recent });
    expect(errors).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledWith("hero poster unavailable", { clubId: CLUB, reason: "FORBIDDEN" });
    expect(JSON.stringify(errors.mock.calls)).not.toMatch(/https?:|referer|b-cdn/i);
  });

  it("retiring goes through the reference-checked retire for the deterministic id, with no actor, and never throws", async () => {
    const { retireHeroPoster } = await load();
    await retireHeroPoster(CLUB, GUID);
    expect(m.retirePublishedMedia).toHaveBeenCalledWith({ clubId: CLUB, actorId: null, assetId: asset });
    m.retirePublishedMedia.mockRejectedValueOnce(Object.assign(new Error("n"), { code: "MEDIA_ASSET_NOT_FOUND" }));
    await expect(retireHeroPoster(CLUB, GUID)).resolves.toBeUndefined();
    expect(errors).not.toHaveBeenCalled();
    m.retirePublishedMedia.mockRejectedValueOnce(new Error("db down"));
    await expect(retireHeroPoster(CLUB, GUID)).resolves.toBeUndefined();
    expect(errors).toHaveBeenCalledWith("hero poster cleanup failed", { clubId: CLUB, reason: "unknown" });
  });
});

describe("image-library hazards", () => {
  it("a media pipeline that fails to load costs the poster, not the caller", async () => {
    vi.resetModules();
    vi.doMock("@/lib/bunny-stream", () => ({ getVideo: vi.fn() }));
    vi.doMock("@/lib/media-processing", () => { throw new Error("libvips failed to load"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { prepareHeroPoster, retireHeroPoster } = await import("@/lib/hero-video-poster");
    expect(await prepareHeroPoster({ clubId: CLUB, videoGuid: GUID, collectionId: COL, timing: {} })).toEqual({ status: "unavailable", reason: "POSTER_FAILED" });
    await expect(retireHeroPoster(CLUB, GUID)).resolves.toBeUndefined();
    vi.doUnmock("@/lib/media-processing");
    vi.doUnmock("@/lib/bunny-stream");
  });

  it("the swap and poster modules have no static import of sharp or the media pipeline", () => {
    for (const file of ["lib/hero-video-swap.ts", "lib/hero-video-poster.ts", "lib/hero-video-poster-id.ts", "lib/bunny-thumbnail.ts"]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/^\s*import[^;]*from\s+["']sharp["']/m);
      expect(source, file).not.toMatch(/^\s*import[^;]*from\s+["']@\/lib\/media-processing["']/m);
    }
    expect(readFileSync("lib/hero-video-poster.ts", "utf8")).toMatch(/await import\("@\/lib\/media-processing"\)/);
  });

  it("libvips is traced into every route that can make or retire a poster", () => {
    const config = readFileSync("next.config.mjs", "utf8");
    for (const route of ["/api/webhooks/bunny-stream", "/api/cron/hero-video", "/api/admin/homepage/hero-video"]) {
      expect(config, route).toContain(`"${route}": ["./node_modules/@img/sharp-libvips-*/**/*"]`);
    }
  });

  it("the webhook may run long enough to fetch and process a still", () => {
    expect(readFileSync("app/api/webhooks/bunny-stream/route.ts", "utf8")).toMatch(/export const maxDuration = 60;/);
  });
});
