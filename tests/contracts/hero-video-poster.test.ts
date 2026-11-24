import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bunnyVideoThumbnailUrl } from "@/lib/bunny-video";
import { BUNNY_THUMBNAIL_MAX_BYTES, fetchVideoThumbnail } from "@/lib/bunny-thumbnail";
import { HERO_POSTER_FRAME_MS, HERO_POSTER_MIN_WIDTH } from "@/lib/hero-video-lifecycle";
import { heroPosterAssetId } from "@/lib/hero-video-poster-id";
import { isUuid } from "@/lib/storage-path";

const CLUB = "11111111-1111-4111-8111-111111111111";
const OTHER_CLUB = "22222222-2222-4222-8222-222222222222";
const GUID = "00000000-0000-4000-8000-000000000001";
const OTHER_GUID = "00000000-0000-4000-8000-000000000002";

describe("hero poster asset id", () => {
  it("is stable for a club and video, and shaped as a UUIDv5 the media paths accept", () => {
    const id = heroPosterAssetId(CLUB, GUID);
    expect(heroPosterAssetId(CLUB, GUID)).toBe(id);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(isUuid(id)).toBe(true);
  });
  it("differs per club and per video, and ignores letter case", () => {
    const id = heroPosterAssetId(CLUB, GUID);
    expect(heroPosterAssetId(OTHER_CLUB, GUID)).not.toBe(id);
    expect(heroPosterAssetId(CLUB, OTHER_GUID)).not.toBe(id);
    expect(heroPosterAssetId(CLUB.toUpperCase(), GUID.toUpperCase())).toBe(id);
  });
  it("is a pinned value, so a recipe change is a deliberate act (bump v1 in the name)", () => {
    expect(heroPosterAssetId(CLUB, GUID)).toBe(heroPosterAssetId(CLUB, GUID));
    expect(readFileSync("lib/hero-video-poster-id.ts", "utf8")).toContain("hero-poster/v1/");
  });
  it("loads no image library and no database client", () => {
    const source = readFileSync("lib/hero-video-poster-id.ts", "utf8");
    expect(source).not.toMatch(/from "sharp"|supabase-service-role|media-processing/);
  });
});

describe("the poster frame", () => {
  it("is 1.0 s in, one constant, and the still must be wide enough to run full-bleed", () => {
    expect(HERO_POSTER_FRAME_MS).toBe(1000);
    expect(HERO_POSTER_MIN_WIDTH).toBe(1280);
  });
});

describe("Bunny thumbnail URL", () => {
  it("is the fixed pull-zone host, the guid and the named file", () => {
    expect(bunnyVideoThumbnailUrl(GUID, "thumbnail.jpg")).toBe(`https://vz-dab9684b-901.b-cdn.net/${GUID}/thumbnail.jpg`);
    expect(bunnyVideoThumbnailUrl(GUID, "thumbnail_0001.jpg")).toBe(`https://vz-dab9684b-901.b-cdn.net/${GUID}/thumbnail_0001.jpg`);
  });
  it("falls back to thumbnail.jpg when the name is missing or has anything odd in it", () => {
    for (const name of [undefined, null, "", "../x.jpg", "a/b.jpg", "a b.jpg", "x.jpg?y=1", ".hidden", "a..b.jpg", "x".repeat(200)]) {
      expect(bunnyVideoThumbnailUrl(GUID, name)).toBe(`https://vz-dab9684b-901.b-cdn.net/${GUID}/thumbnail.jpg`);
    }
  });
  it("refuses a value that is not a Bunny guid, so nothing else can shape the request", () => {
    for (const bad of ["", "g1", "../etc/passwd", `${GUID}/x`, "http://evil.test"]) expect(bunnyVideoThumbnailUrl(bad)).toBeNull();
  });
});

describe("fetching the thumbnail from the CDN", () => {
  const fetchStub = vi.fn();
  const image = (bytes = 100, status = 200, headers: Record<string, string> = {}) => new Response(Buffer.alloc(bytes, 1), { status, headers });
  beforeEach(() => {
    fetchStub.mockReset();
    vi.stubGlobal("fetch", fetchStub);
    vi.stubEnv("BUNNY_STREAM_API_KEY", "library-access-key");
    vi.stubEnv("BUNNY_STREAM_CDN_REFERER", "https://referer.test/");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("sends a Referer and never the AccessKey, follows no redirect and has a time limit", async () => {
    fetchStub.mockResolvedValueOnce(image(50));
    const result = await fetchVideoThumbnail(GUID, "thumbnail.jpg");
    expect(result).toEqual({ status: "ok", bytes: expect.any(Buffer) });
    const [url, init] = fetchStub.mock.calls[0];
    expect(url).toBe(`https://vz-dab9684b-901.b-cdn.net/${GUID}/thumbnail.jpg`);
    expect(init.method).toBe("GET");
    expect(init.redirect).toBe("manual");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers).toMatchObject({ referer: "https://referer.test/" });
    expect(JSON.stringify(init.headers)).not.toMatch(/accesskey|library-access-key/i);
  });
  it("takes the Referer from BUNNY_STREAM_CDN_REFERER, else from the production site Vercel names, else makes no request", async () => {
    vi.stubEnv("BUNNY_STREAM_CDN_REFERER", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "site.example.test");
    fetchStub.mockResolvedValueOnce(image(10));
    await fetchVideoThumbnail(GUID);
    expect(fetchStub.mock.calls[0][1].headers.referer).toBe("https://site.example.test/");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    fetchStub.mockClear();
    expect(await fetchVideoThumbnail(GUID)).toEqual({ status: "permanent", reason: "NO_REFERER" });
    expect(fetchStub).not.toHaveBeenCalled();
  });
  it("makes no request for a value that is not a Bunny guid", async () => {
    expect(await fetchVideoThumbnail("../x")).toEqual({ status: "permanent", reason: "BAD_REQUEST" });
    expect(fetchStub).not.toHaveBeenCalled();
  });
  it.each([
    [404, { status: "transient", reason: "NOT_FOUND" }],
    [500, { status: "transient", reason: "UNAVAILABLE" }],
    [503, { status: "transient", reason: "UNAVAILABLE" }],
    [403, { status: "permanent", reason: "FORBIDDEN" }],
    [401, { status: "permanent", reason: "FORBIDDEN" }],
    [301, { status: "permanent", reason: "REDIRECTED" }],
    [302, { status: "permanent", reason: "REDIRECTED" }],
  ])("maps HTTP %s to a typed result", async (status, expected) => {
    fetchStub.mockResolvedValueOnce(new Response(null, { status }));
    expect(await fetchVideoThumbnail(GUID)).toEqual(expected);
  });
  it("a timeout or a dropped connection is transient", async () => {
    fetchStub.mockRejectedValueOnce(Object.assign(new Error("t"), { name: "TimeoutError" }));
    expect(await fetchVideoThumbnail(GUID)).toEqual({ status: "transient", reason: "TIMEOUT" });
    fetchStub.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await fetchVideoThumbnail(GUID)).toEqual({ status: "transient", reason: "UNAVAILABLE" });
  });
  it("holds the byte cap, by header and by what actually arrives", async () => {
    fetchStub.mockResolvedValueOnce(image(10, 200, { "content-length": String(BUNNY_THUMBNAIL_MAX_BYTES + 1) }));
    expect(await fetchVideoThumbnail(GUID)).toEqual({ status: "permanent", reason: "TOO_LARGE" });
    fetchStub.mockResolvedValueOnce(image(BUNNY_THUMBNAIL_MAX_BYTES + 1));
    expect(await fetchVideoThumbnail(GUID)).toEqual({ status: "permanent", reason: "TOO_LARGE" });
  });
  it("lives apart from the Stream API client, which stays free of CDN requests", () => {
    expect(readFileSync("lib/bunny-stream.ts", "utf8")).not.toMatch(/bunny-thumbnail|b-cdn\.net/);
    expect(readFileSync("lib/bunny-thumbnail.ts", "utf8")).not.toMatch(/AccessKey\s*:|BUNNY_STREAM_API_KEY|apiKey\(/);
  });
});
