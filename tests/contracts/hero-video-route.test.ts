import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  authorizeAdminAccess: vi.fn(), authorizeMutation: vi.fn(), createClient: vi.fn(), getClubContext: vi.fn(),
  requireFreshClubSession: vi.fn(), getHeroVideoState: vi.fn(), startHeroVideoUpload: vi.fn(),
  finalizeHeroVideo: vi.fn(), revertHeroVideo: vi.fn(), rpc: vi.fn(),
}));
vi.mock("@/lib/authorization", () => ({ authorizeAdminAccess: m.authorizeAdminAccess, authorizeMutation: m.authorizeMutation }));
vi.mock("@/lib/auth-session", () => ({ requireFreshClubSession: m.requireFreshClubSession }));
vi.mock("@/lib/club-context", () => ({ getClubContext: m.getClubContext }));
vi.mock("@/lib/supabase-server", () => ({ createClient: m.createClient }));
// The real module stays importable (its HeroVideoError and limits are the ones the route sees); only the entry points are
// spies, so one test can hand `startHeroVideoUpload` back to the real service with a stubbed service-role client.
vi.mock("@/lib/supabase-service-role", () => ({
  createServiceRoleClient: () => ({ schema: () => ({ rpc: m.rpc }) }),
}));
vi.mock("@/lib/hero-video-swap", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/hero-video-swap")>();
  return { ...actual, getHeroVideoState: m.getHeroVideoState, startHeroVideoUpload: m.startHeroVideoUpload, finalizeHeroVideo: m.finalizeHeroVideo, revertHeroVideo: m.revertHeroVideo };
});

import { GET, POST } from "@/app/api/admin/homepage/hero-video/route";
import { HERO_VIDEO_MAX_SECONDS, HeroVideoError } from "@/lib/hero-video-swap";
import { ContractError } from "@/lib/contract-error";

const clubId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const G1 = "33333333-3333-4333-8333-333333333333";
const G2 = "44444444-4444-4444-8444-444444444444";
const fetchStub = vi.fn();

function req(method: "GET" | "POST", body?: unknown, headers: Record<string, string> = {}) {
  return new Request("https://alpha.example/api/admin/homepage/hero-video", {
    method, headers: { host: "alpha.example", ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}
const start = { action: "start", fileName: "a.mp4", fileSize: 1000, mimeType: "video/mp4" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchStub);
  vi.stubEnv("BUNNY_STREAM_API_KEY", "k");
  m.createClient.mockResolvedValue({});
  m.requireFreshClubSession.mockResolvedValue({ userId });
  m.getClubContext.mockResolvedValue({ id: clubId, role: "owner", presentationTemplateKey: "cinematic@2" });
  m.authorizeAdminAccess.mockResolvedValue({ allowed: true });
  m.authorizeMutation.mockResolvedValue({ clubId, actorId: userId });
});
afterEach(() => { expect(fetchStub).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("hero video route", () => {
  it("401 without a session, with no-store", async () => {
    m.requireFreshClubSession.mockRejectedValue(new Error("x"));
    const r = await GET(req("GET"));
    expect(r.status).toBe(401);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(m.getHeroVideoState).not.toHaveBeenCalled();
  });
  it("403 when authorization fails (GET and POST)", async () => {
    m.authorizeAdminAccess.mockRejectedValue(new ContractError("NOT_AUTHORIZED"));
    expect((await GET(req("GET"))).status).toBe(403);
    m.authorizeMutation.mockRejectedValue(new Error("no"));
    expect((await POST(req("POST", start))).status).toBe(403);
    expect(m.startHeroVideoUpload).not.toHaveBeenCalled();
  });
  it("404 for unknown tenant and non-cinematic templates", async () => {
    m.getClubContext.mockResolvedValue(null);
    expect((await GET(req("GET"))).status).toBe(404);
    m.getClubContext.mockResolvedValue({ id: clubId, role: "owner", presentationTemplateKey: "academy@1" });
    const r = await POST(req("POST", start));
    expect(r.status).toBe(404);
    expect((await r.json()).code).toBe("HERO_VIDEO_NOT_AVAILABLE");
    expect(m.startHeroVideoUpload).not.toHaveBeenCalled();
  });
  it("refuses cross-origin and cross-site POSTs before anything else", async () => {
    expect((await POST(req("POST", start, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(req("POST", start, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect(m.requireFreshClubSession).not.toHaveBeenCalled();
  });
  it("503 VIDEO_NOT_CONFIGURED without the key, before the counter", async () => {
    vi.stubEnv("BUNNY_STREAM_API_KEY", "");
    const r = await POST(req("POST", start));
    expect(r.status).toBe(503);
    expect((await r.json()).code).toBe("VIDEO_NOT_CONFIGURED");
    expect(m.startHeroVideoUpload).not.toHaveBeenCalled();
    expect((await POST(req("POST", { action: "finalize", videoGuid: G1 }))).status).toBe(503);
  });
  it.each([
    ["bad json", "{"], ["unknown action", { action: "nope" }], ["extra key", { ...start, clubId }],
    ["uppercase guid", { action: "finalize", videoGuid: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" }],
    ["non-uuid", { action: "finalize", videoGuid: "abc" }], ["revert missing target", { action: "revert", expectedLiveGuid: G1 }],
    ["zero duration", { ...start, durationSeconds: 0 }], ["negative duration", { ...start, durationSeconds: -5 }],
    ["string duration", { ...start, durationSeconds: "600" }], ["null duration", { ...start, durationSeconds: null }],
    ["duration on finalize", { action: "finalize", videoGuid: G1, durationSeconds: 5 }],
  ])("400 for %s", async (_l, body) => {
    const r = await POST(req("POST", body));
    expect(r.status).toBe(400);
    expect(m.authorizeMutation).not.toHaveBeenCalled();
  });
  it("GET returns state", async () => {
    const state = { liveGuid: G1, previousGuid: "", replacesUsedToday: 1, replacesPerDay: 5, maxBytes: 1 };
    m.getHeroVideoState.mockResolvedValue(state);
    const r = await GET(req("GET"));
    expect([r.status, await r.json()]).toEqual([200, state]);
    expect(m.getHeroVideoState).toHaveBeenCalledWith(clubId);
  });
  it("start uses the server club id and passes lib errors through as {code,message}", async () => {
    m.startHeroVideoUpload.mockResolvedValue({ videoGuid: G1, upload: {}, maxBytes: 1 });
    expect((await POST(req("POST", start))).status).toBe(200);
    expect(m.startHeroVideoUpload).toHaveBeenCalledWith(clubId, { fileName: "a.mp4", fileSize: 1000, mimeType: "video/mp4" });
    m.startHeroVideoUpload.mockRejectedValue(new HeroVideoError(429, "DAILY_LIMIT", "Limit."));
    const r = await POST(req("POST", start));
    expect([r.status, await r.json()]).toEqual([429, { code: "DAILY_LIMIT", message: "Limit." }]);
  });
  describe("start duration", () => {
    it("is optional: an omitted duration reaches the service as no duration at all", async () => {
      m.startHeroVideoUpload.mockResolvedValue({ videoGuid: G1, upload: {}, maxBytes: 1 });
      expect((await POST(req("POST", start))).status).toBe(200);
      expect(m.startHeroVideoUpload.mock.calls[0][1]).not.toHaveProperty("durationSeconds");
    });
    it.each([[HERO_VIDEO_MAX_SECONDS], [90.25]])("passes a declared duration of %s seconds through to the service", async (durationSeconds) => {
      m.startHeroVideoUpload.mockResolvedValue({ videoGuid: G1, upload: {}, maxBytes: 1 });
      expect((await POST(req("POST", { ...start, durationSeconds }))).status).toBe(200);
      expect(m.startHeroVideoUpload).toHaveBeenCalledWith(clubId, { fileName: "a.mp4", fileSize: 1000, mimeType: "video/mp4", durationSeconds });
    });
    it("a declared duration of 601 seconds answers 422 VIDEO_TOO_LONG from the real service, without touching the daily counter or Bunny", async () => {
      const actual = await vi.importActual<typeof import("@/lib/hero-video-swap")>("@/lib/hero-video-swap");
      m.startHeroVideoUpload.mockImplementation(actual.startHeroVideoUpload);
      const r = await POST(req("POST", { ...start, durationSeconds: 601 }));
      expect(r.status).toBe(422);
      expect(await r.json()).toEqual({ code: "VIDEO_TOO_LONG", message: "That video is longer than 10 minutes. Choose a shorter clip." });
      expect(m.rpc).not.toHaveBeenCalled();
      expect(fetchStub).not.toHaveBeenCalled();
    });
  });
  it("finalize relays 202 and 200", async () => {
    m.finalizeHeroVideo.mockResolvedValueOnce({ httpStatus: 202, body: { status: "processing" } });
    const a = await POST(req("POST", { action: "finalize", videoGuid: G1 }));
    expect([a.status, await a.json()]).toEqual([202, { status: "processing" }]);
    m.finalizeHeroVideo.mockResolvedValueOnce({ httpStatus: 200, body: { status: "live", liveGuid: G1, previousGuid: G2 } });
    expect((await POST(req("POST", { action: "finalize", videoGuid: G1 }))).status).toBe(200);
  });
  it("revert works without Bunny configured and maps conflicts", async () => {
    vi.stubEnv("BUNNY_STREAM_API_KEY", "");
    m.revertHeroVideo.mockResolvedValueOnce({ status: "live", liveGuid: G2, previousGuid: G1 });
    expect((await POST(req("POST", { action: "revert", expectedLiveGuid: G1, targetGuid: G2 }))).status).toBe(200);
    expect(m.revertHeroVideo).toHaveBeenCalledWith(clubId, { expectedLiveGuid: G1, targetGuid: G2 });
    m.revertHeroVideo.mockRejectedValueOnce(new HeroVideoError(409, "HERO_VIDEO_CHANGED", "x"));
    expect((await POST(req("POST", { action: "revert", expectedLiveGuid: G1, targetGuid: G2 }))).status).toBe(409);
  });
  it("hides unexpected errors behind a generic 502", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    m.finalizeHeroVideo.mockRejectedValue(new Error("secret detail k"));
    const r = await POST(req("POST", { action: "finalize", videoGuid: G1 }));
    expect(r.status).toBe(502);
    expect(JSON.stringify(await r.json())).not.toContain("secret");
  });
});
