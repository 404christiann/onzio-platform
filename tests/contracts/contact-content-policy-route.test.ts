import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractError } from "@/lib/contract-error";

const mocks = vi.hoisted(() => ({
  authorizeAdminAccess: vi.fn(), authorizeMutation: vi.fn(), createClient: vi.fn(), getClubContext: vi.fn(),
  requireFreshClubSession: vi.fn(), retirePublishedMedia: vi.fn(), rpc: vi.fn(), fetchContactContent: vi.fn(), schema: vi.fn(),
}));
vi.mock("@/lib/authorization", () => ({ authorizeAdminAccess: mocks.authorizeAdminAccess, authorizeMutation: mocks.authorizeMutation }));
vi.mock("@/lib/auth-session", () => ({ requireFreshClubSession: mocks.requireFreshClubSession }));
vi.mock("@/lib/club-context", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/lib/supabase-server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/media-processing", () => ({ retirePublishedMedia: mocks.retirePublishedMedia }));
vi.mock("@/lib/queries", () => ({ fetchContactContent: mocks.fetchContactContent }));
const clubId = "11111111-1111-4111-8111-111111111111", userId = "22222222-2222-4222-8222-222222222222";
const operationId = "33333333-3333-4333-8333-333333333333", assetId = "44444444-4444-4444-8444-444444444444";
const profile = { public_email: "hello@example.test", public_phone: "312 731 9479", service_area: " Chicago ", hours: "Weekdays" };
const page = { eyebrow: " CONTACT ", headline: "Talk to the club", intro: "Everyone is welcome.", hero_media_asset_id: assetId };
function body() { return { operationId, expectedRevision: "0", profile: { ...profile }, page: { ...page } }; }
function snapshot(extra: Record<string, unknown> = {}) { return { revision: "2", profile: { ...profile }, page: { ...page }, ...extra }; }
function request(payload?: unknown, headers: Record<string, string> = {}, query = "") {
  return new Request(`https://alpha.example/api/admin/contact-editor${query}`, { method: payload === undefined ? "GET" : "POST", headers: { host: "alpha.example", ...headers }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
}
const scoped = { rpc: function(this: unknown, ...args: unknown[]) {
  expect(this).toBe(scoped); return mocks.rpc(...args);
} };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireFreshClubSession.mockResolvedValue({ userId });
  mocks.getClubContext.mockResolvedValue({ id: clubId, role: "owner", lifecycle: "active", presentationTemplateKey: "cinematic@1", storeEnabled: false });
  mocks.authorizeAdminAccess.mockResolvedValue({ allowed: true }); mocks.authorizeMutation.mockResolvedValue({ allowed: true });
  mocks.retirePublishedMedia.mockResolvedValue({ status: "retired" });
  mocks.schema.mockReturnValue(scoped); mocks.createClient.mockResolvedValue({ schema: mocks.schema });
  mocks.rpc.mockImplementation(async () => ({ data: snapshot(), error: null }));
  mocks.fetchContactContent.mockResolvedValue({ page: { heroMediaUrl: "/media/contact.webp" }, socialLinks: [{ id: "social", platform: "instagram", url: "https://instagram.com/club" }] });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("exported Contact handlers separate maintenance from display", () => {
  for (const role of ["owner", "admin"]) {
    it.each([undefined, "cinematic@1", "heritage@1", "academy@1", "clubhouse@1", "editorial@1"])(`lets ${role} load and save with %s display`, async presentationTemplateKey => {
      mocks.getClubContext.mockResolvedValue({ id: clubId, role, lifecycle: "active", presentationTemplateKey });
      const { GET, POST } = await import("@/app/api/admin/contact-editor/route");
      const read = await GET(request()); expect(read.status).toBe(200); expect(read.headers.get("Cache-Control")).toBe("no-store");
      expect(mocks.rpc).toHaveBeenLastCalledWith("load_contact_editor", { p_club_id: clubId, p_operation_id: null });
      expect(await read.json()).toMatchObject({ heroMediaUrl: "/media/contact.webp", socialLinks: [{ platform: "instagram" }] });
      const payload = body(); const saved = await POST(request(payload)); expect(saved.status).toBe(200); expect(saved.headers.get("Cache-Control")).toBe("no-store");
      expect(mocks.rpc).toHaveBeenLastCalledWith("save_contact_editor", { p_club_id: clubId, p_request: payload });
      expect(mocks.authorizeMutation).toHaveBeenLastCalledWith(expect.objectContaining({ userId, feature: "contact", payload, memberships: [{ userId, clubId, role, status: "active" }] }));
      expect(mocks.schema).toHaveBeenCalledWith("onzio"); expect(mocks.fetchContactContent).toHaveBeenCalledWith(clubId, scoped);
    });
  }
  it.each(["authentication", "expired", "unknown session", "tenant missing", "tenant exception", "authorization", "unknown authorization"])("denies %s before SQL dispatch on GET and POST", async kind => {
    if (kind === "authentication") mocks.requireFreshClubSession.mockRejectedValue(new ContractError("AUTHENTICATION_REQUIRED"));
    if (kind === "expired") mocks.requireFreshClubSession.mockRejectedValue(new ContractError("SESSION_EXPIRED"));
    if (kind === "unknown session") mocks.requireFreshClubSession.mockRejectedValue(new Error("session failure"));
    if (kind === "tenant missing") mocks.getClubContext.mockResolvedValue(null);
    if (kind === "tenant exception") mocks.getClubContext.mockRejectedValue(new Error("tenant failure"));
    if (kind === "authorization" || kind === "unknown authorization") {
      const error = kind === "authorization" ? new ContractError("NOT_AUTHORIZED") : new Error("authorization failure");
      mocks.authorizeAdminAccess.mockRejectedValue(error); mocks.authorizeMutation.mockRejectedValue(error);
    }
    const { GET, POST } = await import("@/app/api/admin/contact-editor/route");
    for (const response of [await GET(request()), await POST(request(body()))]) expect(response.status).toBe(kind === "authentication" || kind === "unknown session" ? 401 : kind.startsWith("tenant") ? 404 : 403);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.retirePublishedMedia).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([{ origin: "https://foreign.example" }, { "sec-fetch-site": "cross-site" }])("denies CSRF before session or SQL (%#)", async headers => {
    const { POST } = await import("@/app/api/admin/contact-editor/route");
    expect((await POST(request(body(), headers))).status).toBe(403); expect(mocks.createClient).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("uses forwarded tenant host for same-origin checks", async () => {
    const { POST } = await import("@/app/api/admin/contact-editor/route");
    expect((await POST(request(body(), { origin: "https://alpha.example" }))).status).toBe(200);
    expect(mocks.getClubContext).toHaveBeenCalledWith({ hostname: "alpha.example", userId });
  });
  it.each(["root extra", "profile extra", "page extra", "profile missing", "page missing", "operation UUID", "media UUID", "revision", "email", "phone", "null", "array"])("rejects strict %s before SQL", async kind => {
    const payload: any = body();
    if (kind === "root extra") payload.club_id = "foreign";
    if (kind === "profile extra") payload.profile.forged = "value";
    if (kind === "page extra") payload.page.forged = "value";
    if (kind === "profile missing") delete payload.profile.hours;
    if (kind === "page missing") delete payload.page.intro;
    if (kind === "operation UUID") payload.operationId = "invalid";
    if (kind === "media UUID") payload.page.hero_media_asset_id = "invalid";
    if (kind === "revision") payload.expectedRevision = "-1";
    if (kind === "email") payload.profile.public_email = "invalid-email";
    if (kind === "phone") payload.profile.public_phone = "invalid phone";
    const { POST } = await import("@/app/api/admin/contact-editor/route");
    const response = await POST(request(kind === "null" ? null : kind === "array" ? [] : payload));
    expect(response.status).toBe(400); expect((await response.json()).error.code).toBe("INVALID_CONTACT_PAYLOAD"); expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it.each([null, 0, true, {}, [], "", "-1", "abc", "1".repeat(21)].map(value => ({ value })))("rejects malformed revision $value before SQL", async ({ value }) => {
    const { POST } = await import("@/app/api/admin/contact-editor/route");
    expect((await POST(request({ ...body(), expectedRevision: value }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["public_email", "public_phone", "service_area", "hours", "eyebrow", "headline", "intro"])("rejects text type and overflow for %s", async field => {
    const section = field in profile ? "profile" : "page", max: Record<string, number> = { public_email: 254, public_phone: 40, service_area: 120, hours: 200, eyebrow: 80, headline: 80, intro: 320 };
    const { POST } = await import("@/app/api/admin/contact-editor/route");
    for (const value of [null, false, 2, {}, [], "x".repeat(max[field] + 1)]) {
      const payload: any = body(); payload[section][field] = value;
      expect((await POST(request(payload))).status).toBe(400);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON and operation lookup UUID before session", async () => {
    const { POST, GET } = await import("@/app/api/admin/contact-editor/route");
    expect((await POST(new Request("https://alpha.example/api/admin/contact-editor", { method: "POST", body: "{" }))).status).toBe(400);
    expect((await GET(request(undefined, {}, "?operationId=invalid"))).status).toBe(400); expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it.each([["CONTACT_CHANGED", 409], ["OPERATION_REUSED", 409], ["NOT_AUTHORIZED", 403], ["PAGE_UNAVAILABLE", 404], ["INVALID_CONTACT_PAYLOAD", 400], ["INVALID_CONTACT_MEDIA", 400], ["unexpected SQL error", 500]] as const)("maps SQL %s to %s without cleanup", async (code, status) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "22023", message: code } });
    const { GET, POST } = await import("@/app/api/admin/contact-editor/route");
    for (const response of [await GET(request()), await POST(request(body()))]) {
      expect(response.status).toBe(status); expect((await response.json()).error.code).toBe(status === 500 ? "DATABASE_OPERATION_FAILED" : code);
    }
    expect(mocks.retirePublishedMedia).not.toHaveBeenCalled(); expect(mocks.fetchContactContent).not.toHaveBeenCalled();
  });
  it.each(["no data", "throw"])("handles SQL %s as an unconfirmed save without cleanup", async kind => {
    if (kind === "throw") mocks.rpc.mockRejectedValue(new Error("unavailable")); else mocks.rpc.mockResolvedValue({ data: null, error: null });
    const { POST } = await import("@/app/api/admin/contact-editor/route"); expect((await POST(request(body()))).status).toBe(500); expect(mocks.retirePublishedMedia).not.toHaveBeenCalled();
  });
  it("retries committed receipt cleanup on GET while preserving metadata and SQL binding", async () => {
    mocks.rpc.mockResolvedValue({ data: snapshot({ operation: { status: "committed", receipt: snapshot({ retiredMediaAssetIds: [assetId] }) } }), error: null });
    const { GET } = await import("@/app/api/admin/contact-editor/route");
    const response = await GET(request(undefined, {}, `?operationId=${operationId}`)); expect(response.status).toBe(200);
    const result = await response.json(); expect(result.operation.receipt.retiredMediaAssetIds).toBeUndefined(); expect(result.heroMediaUrl).toBe("/media/contact.webp");
    expect(mocks.rpc).toHaveBeenLastCalledWith("load_contact_editor", { p_club_id: clubId, p_operation_id: operationId });
    expect(mocks.retirePublishedMedia).toHaveBeenCalledWith({ clubId, actorId: userId, assetId });
  });
  it("returns committed POST receipt despite cleanup failure and strips cleanup metadata", async () => {
    mocks.rpc.mockResolvedValue({ data: snapshot({ retiredMediaAssetIds: [assetId] }), error: null }); mocks.retirePublishedMedia.mockRejectedValue(new Error("cleanup failure"));
    const { POST } = await import("@/app/api/admin/contact-editor/route"); const response = await POST(request(body()));
    expect(response.status).toBe(200); expect((await response.json()).retiredMediaAssetIds).toBeUndefined(); expect(mocks.retirePublishedMedia).toHaveBeenCalledWith({ clubId, actorId: userId, assetId });
  });
  it("never cleans an uncommitted lookup and preserves empty hydration defaults", async () => {
    mocks.rpc.mockResolvedValue({ data: snapshot({ operation: { status: "not-committed" } }), error: null }); mocks.fetchContactContent.mockResolvedValue({ page: null, socialLinks: [] });
    const { GET } = await import("@/app/api/admin/contact-editor/route"); const response = await GET(request(undefined, {}, `?operationId=${operationId}`));
    expect(await response.json()).toMatchObject({ operation: { status: "not-committed" }, heroMediaUrl: "", socialLinks: [] }); expect(mocks.retirePublishedMedia).not.toHaveBeenCalled();
  });
});
