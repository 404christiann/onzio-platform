import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeAdminAccess: vi.fn(), authorizeMutation: vi.fn(), createClient: vi.fn(),
  getClubContext: vi.fn(), requireFreshClubSession: vi.fn(), retirePublishedMedia: vi.fn(),
  resolveMediaReferences: vi.fn(), rpc: vi.fn(),
}));
vi.mock("@/lib/authorization", () => ({ authorizeAdminAccess: mocks.authorizeAdminAccess, authorizeMutation: mocks.authorizeMutation }));
vi.mock("@/lib/auth-session", () => ({ requireFreshClubSession: mocks.requireFreshClubSession }));
vi.mock("@/lib/club-context", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/lib/supabase-server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/media-processing", () => ({ retirePublishedMedia: mocks.retirePublishedMedia }));
vi.mock("@/lib/media-assets", () => ({ resolveMediaReferences: mocks.resolveMediaReferences }));

const clubId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const operationId = "33333333-3333-4333-8333-333333333333";
const programId = "44444444-4444-4444-8444-444444444444";
const onzio = { rpc: mocks.rpc };
const references = [
  { assetId: "hero_media_asset_id", url: "hero_media_url" },
  { assetId: "detail_media_asset_id", url: "detail_media_url" },
];
const url = (assetId: string) => `https://media.example/storage/v1/object/public/onzio-media/${clubId}/programs/${assetId}.webp`;
const row = (prefix: string) => ({ id: programId, updated_at: `${prefix}-baseline`, display_title: prefix,
  hero_media_asset_id: `${prefix}-hero`, detail_media_asset_id: `${prefix}-detail` });
const hydrated = (prefix: string) => ({ ...row(prefix), hero_media_url: url(`${prefix}-hero`), detail_media_url: url(`${prefix}-detail`) });
const gallery = (prefix: string) => [{ id: `${prefix}-gallery-row`, updated_at: `${prefix}-gallery-baseline`,
  media_asset_id: `${prefix}-gallery`, url: "", alt: `${prefix} alt`, sort_order: 0 }];
const hydratedGallery = (prefix: string) => gallery(prefix).map(item => ({ ...item, url: url(`${prefix}-gallery`) }));
function request(path: string, body?: unknown) {
  return new Request(`https://alpha.example/api/admin/${path}`, {
    method: body ? "POST" : "GET", headers: { host: "alpha.example", ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireFreshClubSession.mockResolvedValue({ userId });
  mocks.getClubContext.mockResolvedValue({ id: clubId, role: "owner", lifecycle: "active", presentationTemplateKey: "academy@1" });
  mocks.authorizeAdminAccess.mockResolvedValue({ allowed: true });
  mocks.authorizeMutation.mockResolvedValue({ allowed: true });
  mocks.createClient.mockResolvedValue({ schema: () => onzio });
  mocks.retirePublishedMedia.mockResolvedValue({ status: "retired" });
  mocks.resolveMediaReferences.mockImplementation(async (rows: Record<string, unknown>[], tenant: string, refs: typeof references, client: unknown) => {
    expect(tenant).toBe(clubId);
    expect(client).toBe(onzio);
    return rows.map(source => {
      const result = { ...source };
      for (const ref of refs) if (typeof source[ref.assetId] === "string") result[ref.url] = url(source[ref.assetId] as string);
      return result;
    });
  });
});

describe("Programs directory media hydration", () => {
  it("hydrates a concurrently introduced row from the current RPC snapshot", async () => {
    mocks.rpc.mockResolvedValue({ data: { programs: [row("new")] }, error: null });
    const { GET } = await import("@/app/api/admin/programs-directory/route");
    const response = await GET(request("programs-directory"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ programs: [hydrated("new")] });
    expect(mocks.resolveMediaReferences).toHaveBeenCalledExactlyOnceWith([row("new")], clubId, references, onzio);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("load_program_directory", { p_club_id: clubId, p_operation_id: null });
  });

  it("hydrates current and committed receipt rows without mixing their content or baselines", async () => {
    mocks.rpc.mockResolvedValue({ data: { programs: [row("current")], operation: { status: "committed", receipt: { programs: [row("saved")] } } }, error: null });
    const { GET } = await import("@/app/api/admin/programs-directory/route");
    const response = await GET(request(`programs-directory?operationId=${operationId}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ programs: [hydrated("current")], operation: { status: "committed", receipt: { programs: [hydrated("saved")] } } });
    expect(mocks.resolveMediaReferences).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("hydrates saved directory rows returned by POST", async () => {
    mocks.rpc.mockResolvedValue({ data: { programs: [row("saved")] }, error: null });
    const { POST } = await import("@/app/api/admin/programs-directory/route");
    const response = await POST(request("programs-directory", { operationId, expected: [], programs: [] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ programs: [hydrated("saved")] });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("save_program_directory", { p_club_id: clubId, p_request: { operationId, expected: [], programs: [] } });
  });

  it("hydrates only the current snapshot for an uncommitted operation", async () => {
    mocks.rpc.mockResolvedValue({ data: { programs: [row("new")], operation: { status: "not-committed" } }, error: null });
    const { GET } = await import("@/app/api/admin/programs-directory/route");
    const response = await GET(request(`programs-directory?operationId=${operationId}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ programs: [hydrated("new")], operation: { status: "not-committed" } });
    expect(mocks.resolveMediaReferences).toHaveBeenCalledTimes(1);
  });
});

describe("Program page media hydration", () => {
  it("hydrates newly introduced hero/detail/gallery assets on a conflict reload", async () => {
    mocks.rpc.mockResolvedValue({ data: { program: row("new"), gallery: gallery("new") }, error: null });
    const { GET } = await import("@/app/api/admin/programs-page/route");
    const response = await GET(request(`programs-page?programId=${programId}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ program: hydrated("new"), gallery: hydratedGallery("new") });
    expect(mocks.resolveMediaReferences).toHaveBeenNthCalledWith(1, [row("new")], clubId, references, onzio);
    expect(mocks.resolveMediaReferences).toHaveBeenNthCalledWith(2, gallery("new"), clubId, [{ assetId: "media_asset_id", url: "url" }], onzio);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("hydrates each committed receipt's own program/gallery and retains retirement", async () => {
    mocks.rpc.mockResolvedValue({ data: { program: row("current"), gallery: gallery("current"), operation: { status: "committed", receipt: {
      program: row("saved"), gallery: gallery("saved"), retiredMediaAssetIds: ["old-asset"],
    } } }, error: null });
    const { GET } = await import("@/app/api/admin/programs-page/route");
    const response = await GET(request(`programs-page?programId=${programId}&operationId=${operationId}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ program: hydrated("current"), gallery: hydratedGallery("current"), operation: { status: "committed", receipt: {
      program: hydrated("saved"), gallery: hydratedGallery("saved"),
    } } });
    expect(mocks.retirePublishedMedia).toHaveBeenCalledExactlyOnceWith({ clubId, actorId: userId, assetId: "old-asset" });
    expect(mocks.resolveMediaReferences).toHaveBeenCalledTimes(4);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("hydrates a confirmed newly saved page using the returned rows", async () => {
    mocks.rpc.mockResolvedValue({ data: { program: row("saved"), gallery: gallery("saved") }, error: null });
    const { POST } = await import("@/app/api/admin/programs-page/route");
    const program = { slug: "new", nav_label: "New", display_title: "New", kicker: "", summary: "", body: "", highlights: [], layout_variant: "statement_band",
      hero_media_asset_id: null, detail_media_asset_id: null, external_cta_label: "", external_cta_href: "", registration_form_id: null, registration_enabled: false,
      registration_eyebrow: "", registration_headline: "", registration_body: "", registration_pending_body: "", registration_pending_label: "", status: "active", sort_order: 0 };
    const response = await POST(request("programs-page", { operationId, programId: null, expected: { programUpdatedAt: null, gallery: [] }, program, gallery: [] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ program: hydrated("saved"), gallery: hydratedGallery("saved") });
    expect(mocks.resolveMediaReferences).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("preserves an empty new-page snapshot", async () => {
    mocks.rpc.mockResolvedValue({ data: { program: null, gallery: [] }, error: null });
    const { GET } = await import("@/app/api/admin/programs-page/route");
    const response = await GET(request("programs-page"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ program: null, gallery: [] });
    expect(mocks.resolveMediaReferences).toHaveBeenCalledExactlyOnceWith([], clubId, [{ assetId: "media_asset_id", url: "url" }], onzio);
  });
});
