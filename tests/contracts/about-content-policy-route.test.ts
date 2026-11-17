import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractError } from "@/lib/contract-error";

const mocks = vi.hoisted(() => ({
  authorizeAdminAccess: vi.fn(), authorizeMutation: vi.fn(), createClient: vi.fn(), getClubContext: vi.fn(),
  requireFreshClubSession: vi.fn(), retirePublishedMedia: vi.fn(), rpc: vi.fn(), from: vi.fn(),
  insert: vi.fn(), update: vi.fn(), upsert: vi.fn(), loadAboutDestinationOptions: vi.fn(),
}));
vi.mock("@/lib/authorization", () => ({ authorizeAdminAccess: mocks.authorizeAdminAccess, authorizeMutation: mocks.authorizeMutation }));
vi.mock("@/lib/auth-session", () => ({ requireFreshClubSession: mocks.requireFreshClubSession }));
vi.mock("@/lib/club-context", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/lib/supabase-server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/media-processing", () => ({ retirePublishedMedia: mocks.retirePublishedMedia }));
vi.mock("@/lib/media-assets", () => ({ resolveMediaReferences: async (rows: unknown[]) => rows }));
vi.mock("@/lib/about-editor/destinations", () => ({ loadAboutDestinationOptions: mocks.loadAboutDestinationOptions }));
const clubId = "11111111-1111-4111-8111-111111111111", userId = "22222222-2222-4222-8222-222222222222";
const operationId = "33333333-3333-4333-8333-333333333333", assetId = "44444444-4444-4444-8444-444444444444";
const destinations = ["/", "/roster", "/schedule", "/club/about", "/club/logo", "/shop", "/sponsors", "/staff", "/standings", "/stats", "/tryouts", "/programs", "/contact"];
const about = { hero_title: "Maintained", story_paragraphs: [], feature_image_url: "", values_heading: "Values", values: [], closing_text: "Join", closing_cta_label: "Contact", closing_cta_href: "/contact" };
const logo = { annotated_image_url: "", map_image_url: "", features: [{ title: "Badge", description: "Our badge", patch_url: "", icon_url: "", icon_size: 70, icon_scale: 1 }], color_cards: [] };
function body(page = "about", content: Record<string, unknown> = page === "about" ? about : logo) {
  return { operationId, page, expectedRevision: "0", designRevision: "before", content };
}
function snapshot(page = "about", extra: Record<string, unknown> = {}) {
  return { page, revision: "1", designRevision: "before", content: page === "about" ? { ...about } : { ...logo }, ...extra };
}
function request(path: string, payload?: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://alpha.example/api/admin/${path}`, { method: payload ? "POST" : "GET", headers: { host: "alpha.example", ...headers }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  mocks.requireFreshClubSession.mockResolvedValue({ userId });
  mocks.getClubContext.mockResolvedValue({ id: clubId, role: "owner", lifecycle: "active", presentationTemplateKey: "academy@1", storeEnabled: false });
  mocks.authorizeAdminAccess.mockResolvedValue({ allowed: true }); mocks.authorizeMutation.mockResolvedValue({ allowed: true });
  mocks.retirePublishedMedia.mockResolvedValue({ status: "retired" });
  mocks.loadAboutDestinationOptions.mockResolvedValue([]);
  const query: any = { then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [{ hero_title: "Persisted" }], error: null }).then(resolve) };
  for (const name of ["select", "eq", "in", "order", "limit", "range", "single", "maybeSingle"]) query[name] = () => query;
  mocks.insert.mockReturnValue(query); mocks.update.mockReturnValue(query); mocks.upsert.mockReturnValue(query);
  mocks.from.mockReturnValue({ insert: mocks.insert, update: mocks.update, upsert: mocks.upsert });
  mocks.createClient.mockResolvedValue({ schema: () => ({ rpc: mocks.rpc, from: mocks.from }) });
  mocks.rpc.mockImplementation(async (name, args) => ({ data: snapshot(args.p_page ?? args.p_request?.page, name === "load_about_editor" ? { operation: { status: "not-committed" } } : {}), error: null }));
});

afterEach(() => vi.unstubAllEnvs());

describe("dedicated About and Logo route content policy", () => {
  it.each(destinations)("saves hidden trusted destination %s with exact SQL request", async href => {
    const payload = body("about", { ...about, closing_cta_href: href });
    const { POST } = await import("@/app/api/admin/about-editor/route");
    const response = await POST(request("about-editor", payload));
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "load_about_editor", { p_club_id: clubId, p_page: "about", p_operation_id: operationId });
    expect(mocks.rpc).toHaveBeenLastCalledWith("save_about_editor", { p_club_id: clubId, p_request: payload });
    expect(mocks.loadAboutDestinationOptions).not.toHaveBeenCalled();
  });
  it.each(["academy@1", "editorial@1"])("loads and saves nonempty hidden Logo under %s", async template => {
    mocks.getClubContext.mockResolvedValue({ id: clubId, role: "admin", presentationTemplateKey: template, storeEnabled: false });
    const { GET, POST } = await import("@/app/api/admin/about-editor/route");
    expect((await GET(request("about-editor?page=logo"))).status).toBe(200);
    const response = await POST(request("about-editor", body("logo")));
    expect(response.status).toBe(200); expect((await response.json()).content.features[0].title).toBe("Badge");
    expect(mocks.rpc).toHaveBeenLastCalledWith("save_about_editor", { p_club_id: clubId, p_request: body("logo") });
  });
  it.each(["", "//evil.test", "https://evil.test", "javascript:alert(1)", "/admin", "/contact?x=1", "/contact#x", "/contact/", " /contact", "/%63ontact", "/Contact"])("rejects fresh untrusted href %j before save", async href => {
    const { POST } = await import("@/app/api/admin/about-editor/route");
    const response = await POST(request("about-editor", body("about", { ...about, closing_cta_href: href })));
    expect(response.status).toBe(400); expect((await response.json()).error.code).toBe("INVALID_ABOUT_DESTINATION");
    expect(mocks.rpc.mock.calls.every(([name]) => name !== "save_about_editor")).toBe(true);
  });
  it("passes committed retries to original-hash SQL before fresh media and destination checks", async () => {
    const payload = { ...body("about", { ...about, closing_cta_href: "/formerly-trusted", feature_image_url: `https://foreign.test/storage/v1/object/public/onzio-media/${clubId}/about/${assetId}.png` }), retiredMediaUrls: ["https://foreign.test/old.png"] };
    mocks.rpc.mockImplementation(async name => ({ data: name === "load_about_editor" ? snapshot("about", { operation: { status: "committed", receipt: snapshot() } }) : snapshot(), error: null }));
    const { POST } = await import("@/app/api/admin/about-editor/route");
    expect((await POST(request("about-editor", payload))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenLastCalledWith("save_about_editor", { p_club_id: clubId, p_request: payload });
    expect(mocks.loadAboutDestinationOptions).not.toHaveBeenCalled();
  });
  it.each(["ABOUT_CHANGED", "DESIGN_CHANGED", "OPERATION_REUSED"])("preserves SQL %s conflict and cleanup boundary", async code => {
    mocks.rpc.mockImplementation(async name => name === "load_about_editor" ? { data: snapshot("about", { operation: { status: "committed", receipt: snapshot() } }), error: null } : { data: null, error: { code: "PT409", message: code } });
    const { POST } = await import("@/app/api/admin/about-editor/route");
    const response = await POST(request("about-editor", body()));
    expect(response.status).toBe(409); expect((await response.json()).error.code).toBe(code);
    expect(mocks.retirePublishedMedia).not.toHaveBeenCalled();
  });
  it("denies fresh foreign media before SQL save", async () => {
    const payload = body("about", { ...about, feature_image_url: `https://evil.test/storage/v1/object/public/onzio-media/${clubId}/about/${assetId}.png` });
    const { POST } = await import("@/app/api/admin/about-editor/route");
    const response = await POST(request("about-editor", payload));
    expect(response.status).toBe(400); expect((await response.json()).error.code).toBe("INVALID_ABOUT_MEDIA");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("passes fresh normalized media on the trusted origin and club unchanged to SQL", async () => {
    const payload = body("about", { ...about, feature_image_url: `http://127.0.0.1:54321/storage/v1/object/public/onzio-media/${clubId}/about/${assetId}.png` });
    const { POST } = await import("@/app/api/admin/about-editor/route");
    expect((await POST(request("about-editor", payload))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenLastCalledWith("save_about_editor", { p_club_id: clubId, p_request: payload });
  });
  it("denies fresh normalized media for another club on the trusted origin", async () => {
    const payload = body("about", { ...about, feature_image_url: `http://127.0.0.1:54321/storage/v1/object/public/onzio-media/55555555-5555-4555-8555-555555555555/about/${assetId}.png` });
    const { POST } = await import("@/app/api/admin/about-editor/route");
    const response = await POST(request("about-editor", payload));
    expect(response.status).toBe(400); expect((await response.json()).error.code).toBe("INVALID_ABOUT_MEDIA");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("denies a fresh nested Logo image on a foreign origin", async () => {
    const payload = body("logo", { ...logo, features: [{ ...logo.features[0], patch_url: `https://evil.test/storage/v1/object/public/onzio-media/${clubId}/about/${assetId}.png` }] });
    const { POST } = await import("@/app/api/admin/about-editor/route");
    const response = await POST(request("about-editor", payload));
    expect(response.status).toBe(400); expect((await response.json()).error.code).toBe("INVALID_ABOUT_MEDIA");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["authentication", "membership", "tenant"])("denies missing %s before receipt lookup", async kind => {
    if (kind === "authentication") mocks.requireFreshClubSession.mockRejectedValue(new ContractError("AUTHENTICATION_REQUIRED"));
    if (kind === "membership") mocks.authorizeMutation.mockRejectedValue(new ContractError("MEMBERSHIP_REQUIRED"));
    if (kind === "tenant") mocks.getClubContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/admin/about-editor/route");
    expect((await POST(request("about-editor", body()))).status).toBe(kind === "tenant" ? 404 : 403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([{ origin: "https://foreign.test" }, { "sec-fetch-site": "cross-site" }])("denies cross-site mutation (%#)", async headers => {
    const { POST } = await import("@/app/api/admin/about-editor/route");
    expect((await POST(request("about-editor", body(), headers))).status).toBe(403); expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it.each(["extra envelope", "nested extra", "nonstring href"])("denies malformed %s before any RPC", async kind => {
    const payload = kind === "extra envelope" ? { ...body(), club_id: clubId } : body("about", kind === "nested extra" ? { ...about, values: [{ title: "Value", description: "", forged: true }] } : { ...about, closing_cta_href: null });
    const { POST } = await import("@/app/api/admin/about-editor/route");
    expect((await POST(request("about-editor", payload))).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("finishes receipt cleanup without changing the save payload", async () => {
    mocks.rpc.mockImplementation(async name => ({ data: name === "load_about_editor" ? snapshot("logo", { operation: { status: "not-committed" } }) : snapshot("logo", { retiredMediaAssetIds: [assetId] }), error: null }));
    const { POST } = await import("@/app/api/admin/about-editor/route");
    const response = await POST(request("about-editor", body("logo")));
    expect(response.status).toBe(200); expect(mocks.retirePublishedMedia).toHaveBeenCalledExactlyOnceWith({ clubId, actorId: userId, assetId });
    expect((await response.json()).cleanupPending).toBe(false);
    expect(mocks.rpc).toHaveBeenLastCalledWith("save_about_editor", { p_club_id: clubId, p_request: body("logo") });
  });
});

describe("generic About mutation content policy", () => {
  it.each(destinations)("writes canonical %s despite hidden navigation and Store", async href => {
    const { POST } = await import("@/app/api/admin/data/route");
    const response = await POST(request("data", { table: "about_page_content", operation: "upsert", payload: { closing_cta_href: href } }));
    expect(response.status).toBe(200); expect(mocks.upsert).toHaveBeenCalledWith({ club_id: clubId, closing_cta_href: href }, expect.anything());
    expect(mocks.loadAboutDestinationOptions).not.toHaveBeenCalled();
  });
  it.each(["insert", "update", "upsert"])("retains partial %s without destination", async operation => {
    const { POST } = await import("@/app/api/admin/data/route");
    expect((await POST(request("data", { table: "about_page_content", operation, payload: { hero_title: "Maintained" } }))).status).toBe(200);
    expect(mocks[operation as "insert" | "update" | "upsert"]).toHaveBeenCalledWith({ club_id: clubId, hero_title: "Maintained" }, ...(operation === "upsert" ? [expect.anything()] : []));
    expect(mocks.loadAboutDestinationOptions).not.toHaveBeenCalled();
  });
  it.each([null, 1, false, [], {}, "", "/admin", "https://evil.test", "//evil.test", "/contact?x=1", "/contact#x", "/Contact"])("rejects invalid generic href %j without writes", async href => {
    const { POST } = await import("@/app/api/admin/data/route");
    expect((await POST(request("data", { table: "about_page_content", operation: "upsert", payload: { closing_cta_href: href } }))).status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("validates each batch row before any generic write", async () => {
    const { POST } = await import("@/app/api/admin/data/route");
    expect((await POST(request("data", { table: "about_page_content", operation: "insert", payload: [{ closing_cta_href: "/contact" }, { closing_cta_href: "/admin" }] }))).status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("preserves current authorization before generic writes", async () => {
    mocks.authorizeMutation.mockRejectedValue(new ContractError("MEMBERSHIP_REQUIRED"));
    const { POST } = await import("@/app/api/admin/data/route");
    expect((await POST(request("data", { table: "about_page_content", operation: "upsert", payload: { closing_cta_href: "/contact" } }))).status).toBe(403);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
