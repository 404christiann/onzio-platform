import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContractError } from "@/lib/contract-error";

const mocks = vi.hoisted(() => ({
  authorizeAdminAccess: vi.fn(), authorizeMutation: vi.fn(), createClient: vi.fn(),
  getClubContext: vi.fn(), requireFreshClubSession: vi.fn(), retirePublishedMedia: vi.fn(), rpc: vi.fn(),
}));
vi.mock("@/lib/authorization", () => ({ authorizeAdminAccess: mocks.authorizeAdminAccess, authorizeMutation: mocks.authorizeMutation }));
vi.mock("@/lib/auth-session", () => ({ requireFreshClubSession: mocks.requireFreshClubSession }));
vi.mock("@/lib/club-context", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/lib/supabase-server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/media-processing", () => ({ retirePublishedMedia: mocks.retirePublishedMedia }));
vi.mock("@/lib/media-assets", () => ({ resolveMediaReferences: async (rows: unknown[]) => rows }));
vi.mock("@/lib/queries", () => ({ loadLinkedOpenRegistrationForms: async () => new Map() }));

const clubId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const operationId = "33333333-3333-4333-8333-333333333333";
const assetId = "44444444-4444-4444-8444-444444444444";
const programId = "55555555-5555-4555-8555-555555555555";
const program = { slug: "new", nav_label: "New", display_title: "New", kicker: "", summary: "", body: "", highlights: [], layout_variant: "statement_band",
  hero_media_asset_id: null, detail_media_asset_id: null, external_cta_label: "", external_cta_href: "", registration_form_id: null, registration_enabled: false,
  registration_eyebrow: "", registration_headline: "", registration_body: "", registration_pending_body: "", registration_pending_label: "", status: "active", sort_order: 0 };
const cases = [
  { label: "Shop", path: "shop?surface=shop", template: "editorial@1", rpc: "save_shop_page", cleanup: true,
    body: { operationId, surface: "shop", expectedRevision: "0", designRevision: "before", variants: { home: { section: {
      eyebrow: "", title: "Kit", description: "", bullet_points: [], store_note: "", cta_label: "", cta_link: "",
    }, photos: [{ rowId: null, assetId, order: 0 }] } } },
    snapshot: () => ({ revision: "1", designRevision: "before", templateKey: "editorial@1", surface: "shop", sections: [], photos: [], photoRows: [], purchase: null, media: [] }),
    route: () => import("@/app/api/admin/shop/route") },
  { label: "Tryouts", path: "tryouts-page", template: "clubhouse@1", rpc: "save_tryouts_page", cleanup: true,
    body: { operationId, expectedRevision: "0", page: null, events: [], deletedIds: [] },
    snapshot: () => ({ revision: "1", page: {}, events: [] }), route: () => import("@/app/api/admin/tryouts-page/route") },
  { label: "Program page", path: `programs-page?programId=${programId}`, template: "clubhouse@1", rpc: "save_program_page", cleanup: true,
    body: { operationId, programId: null, expected: { programUpdatedAt: null, gallery: [] }, program, gallery: [] },
    snapshot: () => ({ program: { id: programId }, gallery: [] }), route: () => import("@/app/api/admin/programs-page/route") },
  { label: "Programs directory", path: "programs-directory", template: "clubhouse@1", rpc: "save_program_directory", cleanup: false,
    body: { operationId, expected: [], programs: [] }, snapshot: () => ({ programs: [] }), route: () => import("@/app/api/admin/programs-directory/route") },
];
function request(path: string, body?: unknown, recovering = false) {
  return new Request(`https://alpha.example/api/admin/${path}`, { method: body ? "POST" : "GET",
    headers: { host: "alpha.example", ...(body ? { "Content-Type": "application/json" } : {}), ...(recovering ? { "X-Editor-Recovery": "1" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireFreshClubSession.mockResolvedValue({ userId });
  mocks.authorizeAdminAccess.mockResolvedValue({ allowed: true });
  mocks.authorizeMutation.mockResolvedValue({ allowed: true });
  mocks.retirePublishedMedia.mockResolvedValue({ status: "retired" });
  const forms = { select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) };
  mocks.createClient.mockResolvedValue({ schema: () => ({ rpc: mocks.rpc, from: () => forms }) });
});
for (const target of cases) describe(`${target.label} receipt recovery after page availability changes`, () => {
  beforeEach(() => mocks.getClubContext.mockResolvedValue({ id: clubId, role: "owner", lifecycle: "active", presentationTemplateKey: target.template, storeEnabled: false }));

  it("preserves zero-RPC rejection for fresh unavailable GET and POST", async () => {
    const { GET, POST } = await target.route();
    expect((await GET(request(target.path))).status).toBe(404);
    expect((await POST(request(target.path, target.body))).status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.retirePublishedMedia).not.toHaveBeenCalled();
    expect(mocks.authorizeAdminAccess).toHaveBeenCalledTimes(1);
    expect(mocks.authorizeMutation).toHaveBeenCalledTimes(1);
  });

  it("recovers an actor receipt and finishes its pending media cleanup", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...target.snapshot(), operation: { status: "committed", receipt: {
      ...target.snapshot(), ...(target.cleanup ? { retiredMediaAssetIds: [assetId] } : {}),
    } } }, error: null });
    const { GET } = await target.route();
    const response = await GET(request(`${target.path}${target.path.includes("?") ? "&" : "?"}operationId=${operationId}`));
    expect(response.status).toBe(200);
    expect((await response.json()).operation).toEqual({ status: "committed", receipt: target.snapshot() });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    if (target.cleanup) expect(mocks.retirePublishedMedia).toHaveBeenCalledExactlyOnceWith({ clubId, actorId: userId, assetId });
    else expect(mocks.retirePublishedMedia).not.toHaveBeenCalled();
  });

  it("routes an explicitly marked exact retry to the hash-checking save RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...target.snapshot(), ...(target.cleanup ? { retiredMediaAssetIds: [assetId] } : {}) }, error: null });
    const { POST } = await target.route();
    const response = await POST(request(target.path, target.body, true));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(target.rpc, { p_club_id: clubId, p_request: target.body });
    if (target.cleanup) expect(mocks.retirePublishedMedia).toHaveBeenCalledExactlyOnceWith({ clubId, actorId: userId, assetId });
  });

  it("does not turn recovery intent into authorization for a new operation", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "PAGE_UNAVAILABLE", code: "22023" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { POST } = await target.route();
      const response = await POST(request(target.path, target.body, true));
      expect(response.status).toBe(404);
      expect((await response.json()).error.code).toBe("PAGE_UNAVAILABLE");
      expect(mocks.retirePublishedMedia).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });

  it("rejects a changed payload through the RPC instead of treating it as the committed retry", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "OPERATION_REUSED", code: "PT409" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { POST } = await target.route();
      const response = await POST(request(target.path, target.body, true));
      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe("OPERATION_REUSED");
      expect(mocks.retirePublishedMedia).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });

  it("checks current authorization before attempting receipt recovery", async () => {
    mocks.authorizeAdminAccess.mockRejectedValue(new ContractError("MEMBERSHIP_REQUIRED"));
    mocks.authorizeMutation.mockRejectedValue(new ContractError("MEMBERSHIP_REQUIRED"));
    const { GET, POST } = await target.route();
    expect((await GET(request(`${target.path}${target.path.includes("?") ? "&" : "?"}operationId=${operationId}`))).status).toBe(403);
    expect((await POST(request(target.path, target.body, true))).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
