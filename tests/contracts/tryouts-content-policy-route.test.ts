import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractError } from "@/lib/contract-error";
import { buildTryoutMutationPayload, emptyTryoutDraft } from "@/lib/tryout-admin";

const mocks = vi.hoisted(() => ({
  authorizeAdminAccess: vi.fn(), authorizeMutation: vi.fn(), createClient: vi.fn(),
  getClubContext: vi.fn(), requireFreshClubSession: vi.fn(),
  retirePublishedMedia: vi.fn(), resolveMediaReferences: vi.fn(),
  loadLinkedOpenRegistrationForms: vi.fn(), rpc: vi.fn(), schema: vi.fn(), formsResult: vi.fn(),
}));
vi.mock("@/lib/authorization", () => ({ authorizeAdminAccess: mocks.authorizeAdminAccess, authorizeMutation: mocks.authorizeMutation }));
vi.mock("@/lib/auth-session", () => ({ requireFreshClubSession: mocks.requireFreshClubSession }));
vi.mock("@/lib/club-context", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/lib/supabase-server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/media-processing", () => ({ retirePublishedMedia: mocks.retirePublishedMedia }));
vi.mock("@/lib/media-assets", () => ({ resolveMediaReferences: mocks.resolveMediaReferences }));
vi.mock("@/lib/queries", () => ({ loadLinkedOpenRegistrationForms: mocks.loadLinkedOpenRegistrationForms }));

const clubId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const operationId = "33333333-3333-4333-8333-333333333333";
const assetId = "44444444-4444-4444-8444-444444444444";
const snapshot = () => ({ revision: "1", page: {}, events: [] });
const payload = () => ({ operationId, expectedRevision: "0", page: { intro_with_tryouts: " Current evaluations ", intro_no_tryouts: "More soon" },
  events: [{ ...buildTryoutMutationPayload(emptyTryoutDraft(0)), id: null, sort_order: 0,
    program_id: "55555555-5555-4555-8555-555555555555", registration_form_id: "66666666-6666-4666-8666-666666666666", hero_media_asset_id: assetId,
    eyebrow: "PLAY", headline: "First team", intro: "Join us", eligibility_copy: "Adults", what_to_expect_copy: "Small games", preparation_copy: "Bring boots", event_date: "2026-12-01", location: "Park", cost_text: "Free", cta_label: "Join", registration_href: "https://registration.example.test/form", closed_message: "More soon" }], deletedIds: [] });
const request = (method: "GET" | "POST", body?: unknown, operation?: string) => new Request(
  `https://alpha.example/api/admin/tryouts-page${operation ? `?operationId=${operation}` : ""}`,
  { method, headers: { host: "alpha.example", ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireFreshClubSession.mockResolvedValue({ userId });
  mocks.getClubContext.mockResolvedValue({ id: clubId, role: "owner", lifecycle: "active", presentationTemplateKey: "academy@1" });
  mocks.authorizeAdminAccess.mockResolvedValue({ allowed: true });
  mocks.authorizeMutation.mockResolvedValue({ allowed: true });
  mocks.retirePublishedMedia.mockResolvedValue({ status: "retired" });
  mocks.resolveMediaReferences.mockImplementation(async (events: unknown) => events);
  mocks.loadLinkedOpenRegistrationForms.mockResolvedValue(new Map());
  mocks.formsResult.mockResolvedValue({ data: [], error: null });
  const forms = { select: () => ({ eq: () => ({ eq: () => ({ limit: mocks.formsResult }) }) }) };
  mocks.schema.mockReturnValue({ rpc: mocks.rpc, from: () => forms });
  mocks.createClient.mockResolvedValue({ schema: mocks.schema });
  mocks.rpc.mockResolvedValue({ data: snapshot(), error: null });
});

afterEach(() => vi.restoreAllMocks());

describe("exported Tryouts handlers separate content maintenance from display", () => {
  for (const role of ["owner", "admin"]) {
    it.each([undefined, "cinematic@1", "heritage@1", "academy@1", "clubhouse@1", "editorial@1"])(`allows ${role} maintenance under %s`, async presentationTemplateKey => {
      mocks.getClubContext.mockResolvedValue({ id: clubId, role, lifecycle: "active", presentationTemplateKey });
      const { GET, POST } = await import("@/app/api/admin/tryouts-page/route");
      const read = await GET(request("GET")); expect(read.status).toBe(200); expect(read.headers.get("Cache-Control")).toBe("no-store");
      const body = payload(), saved = await POST(request("POST", body)); expect(saved.status).toBe(200); expect(saved.headers.get("Cache-Control")).toBe("no-store");
      expect(mocks.rpc).toHaveBeenNthCalledWith(1, "load_tryouts_page", { p_club_id: clubId, p_operation_id: null });
      expect(mocks.rpc).toHaveBeenNthCalledWith(2, "save_tryouts_page", { p_club_id: clubId, p_request: body });
      expect(mocks.authorizeMutation).toHaveBeenCalledWith(expect.objectContaining({ feature: "tryouts", memberships: [{ userId, clubId, role, status: "active" }] }));
      expect(await saved.json()).toMatchObject({ events: [], registrationForms: {} });
    });
  }
  it.each(["session", "expired", "tenant", "tenant exception", "authorization"])("denies %s before SQL on load, status and save", async kind => {
    if (kind === "session" || kind === "expired") mocks.requireFreshClubSession.mockRejectedValue(new ContractError(kind === "expired" ? "SESSION_EXPIRED" : "AUTHENTICATION_REQUIRED"));
    if (kind === "tenant") mocks.getClubContext.mockResolvedValue(null); if (kind === "tenant exception") mocks.getClubContext.mockRejectedValue(new Error("missing"));
    if (kind === "authorization") { mocks.authorizeMutation.mockRejectedValue(new ContractError("NOT_AUTHORIZED")); mocks.authorizeAdminAccess.mockRejectedValue(new ContractError("NOT_AUTHORIZED")); }
    const { GET, POST } = await import("@/app/api/admin/tryouts-page/route");
    for (const response of [await GET(request("GET")), await GET(request("GET", undefined, operationId)), await POST(request("POST", payload()))]) expect(response.status).toBe(kind === "session" ? 401 : kind.startsWith("tenant") ? 404 : 403);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.retirePublishedMedia).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([{ origin: "https://foreign.example" }, { "sec-fetch-site": "cross-site" }])("denies cross-site save (%#)", async headers => {
    const { POST } = await import("@/app/api/admin/tryouts-page/route");
    expect((await POST(new Request("https://alpha.example/api/admin/tryouts-page", { method: "POST", headers: { host: "alpha.example", ...headers }, body: JSON.stringify(payload()) }))).status).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it.each(["root extra", "page extra", "page missing", "event extra", "event missing", "event scalar", "operation UUID", "media UUID", "revision", "events ceiling", "deleted ceiling", "duplicate", "overlap", "order", "null"])("rejects strict %s before SQL", async kind => {
    const body: any = payload(); body.page = { intro_with_tryouts: "Intro", intro_no_tryouts: "More soon" };
    if (kind === "root extra") body.club_id = "foreign"; if (kind === "page extra") body.page.extra = "bad"; if (kind === "page missing") delete body.page.intro_no_tryouts;
    if (kind === "event extra") body.events[0].extra = "bad"; if (kind === "event missing") delete body.events[0].headline; if (kind === "event scalar") body.events = [false];
    if (kind === "operation UUID") body.operationId = "bad"; if (kind === "media UUID") body.events[0].hero_media_asset_id = "bad"; if (kind === "revision") body.expectedRevision = "-1";
    if (kind === "events ceiling") body.events = Array.from({ length: 501 }, (_, sort_order) => ({ ...body.events[0], sort_order })); if (kind === "deleted ceiling") body.deletedIds = Array(501).fill(assetId);
    if (kind === "duplicate") body.events = [{ ...body.events[0], id: assetId }, { ...body.events[0], id: assetId, sort_order: 1 }];
    if (kind === "overlap") { body.events[0].id = assetId; body.deletedIds = [assetId]; } if (kind === "order") body.events[0].sort_order = 1;
    const { POST } = await import("@/app/api/admin/tryouts-page/route"); expect((await POST(request("POST", kind === "null" ? null : body))).status).toBe(400); expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it.each(["eyebrow", "headline", "intro", "eligibility_copy", "what_to_expect_copy", "preparation_copy", "location", "cost_text", "cta_label", "registration_href", "closed_message"])("preserves strict event %s types and bounds", async field => {
    const max: Record<string, number> = { eyebrow: 80, headline: 80, intro: 320, eligibility_copy: 2000, what_to_expect_copy: 2000, preparation_copy: 2000, location: 160, cost_text: 120, cta_label: 40, registration_href: 2048, closed_message: 320 };
    const { POST } = await import("@/app/api/admin/tryouts-page/route");
    for (const value of [null, false, 123, {}, [], "x".repeat(max[field] + 1)]) { const body: any = payload(); body.events[0][field] = value; expect((await POST(request("POST", body))).status).toBe(400); }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["//evil.test", "/\\evil.test", "javascript:alert(1)", "data:text/html,a", "tel:123", "https://", " https://example.test"])("rejects unsafe HTTP href %s", async registration_href => {
    const body: any = payload(); body.events[0].registration_href = registration_href; const { POST } = await import("@/app/api/admin/tryouts-page/route"); expect((await POST(request("POST", body))).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([null, 0, true, {}, [], "", "-1", "abc", "1".repeat(21)].map(value => ({ value })))("denies malformed revision $value before session", async ({ value }) => {
    const { POST } = await import("@/app/api/admin/tryouts-page/route"); expect((await POST(request("POST", { ...payload(), expectedRevision: value }))).status).toBe(400); expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it.each(["intro_with_tryouts", "intro_no_tryouts"])("preserves strict page %s types and bounds", async field => {
    const { POST } = await import("@/app/api/admin/tryouts-page/route");
    for (const value of [null, false, 123, {}, [], "x".repeat(321)]) { const body: any = payload(); body.page[field] = value; expect((await POST(request("POST", body))).status).toBe(400); }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["", "/noncatalog-registration", "/registration?team=first#form", "http://registration.example.test/form", "https://registration.example.test/form", "mailto:club@example.test", "mailto:invalid", "/path with-space"])("retains existing HTTP destination acceptance %s", async registration_href => {
    const body = payload(); body.events[0].registration_href = registration_href; const { POST } = await import("@/app/api/admin/tryouts-page/route"); expect((await POST(request("POST", body))).status).toBe(200); expect(mocks.rpc).toHaveBeenCalledWith("save_tryouts_page", { p_club_id: clubId, p_request: body });
  });
  it("preserves the existing HTTP date-shape boundary for later SQL calendar validation", async () => {
    const body = payload(); body.events[0].event_date = "2026-02-30"; const { POST } = await import("@/app/api/admin/tryouts-page/route"); expect((await POST(request("POST", body))).status).toBe(200); expect(mocks.rpc).toHaveBeenCalledWith("save_tryouts_page", { p_club_id: clubId, p_request: body });
  });
  it.each([["TRYOUTS_CHANGED", 409], ["OPERATION_REUSED", 409], ["NOT_AUTHORIZED", 403], ["PAGE_UNAVAILABLE", 404], ["INVALID_TRYOUTS_PAYLOAD", 400], ["INVALID_TRYOUTS_EVENT", 400], ["unknown", 500]] as const)("preserves SQL error %s mapping", async (message, status) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined); mocks.rpc.mockResolvedValue({ data: null, error: { code: "22023", message } }); const { GET, POST } = await import("@/app/api/admin/tryouts-page/route");
    for (const response of [await GET(request("GET")), await POST(request("POST", payload()))]) expect(response.status).toBe(status); expect(mocks.retirePublishedMedia).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON and lookup UUID before session", async () => {
    const { GET, POST } = await import("@/app/api/admin/tryouts-page/route"); expect((await GET(request("GET", undefined, "invalid"))).status).toBe(400); expect((await POST(new Request("https://alpha.example/api/admin/tryouts-page", { method: "POST", body: "{" }))).status).toBe(400); expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
