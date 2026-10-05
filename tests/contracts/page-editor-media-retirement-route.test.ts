import { beforeEach, describe, expect, it, vi } from "vitest";

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

const clubId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const operationId = "33333333-3333-4333-8333-333333333333";
const assetId = "44444444-4444-4444-8444-444444444444";
const programId = "55555555-5555-4555-8555-555555555555";
const cases = [
  {
    page: "Shop", rpc: "load_shop_page", path: `/api/admin/shop?surface=shop&operationId=${operationId}`,
    snapshot: () => ({ revision: "1", designRevision: "1", templateKey: "academy@1", surface: "shop",
      sections: [], photos: [], photoRows: [], purchase: null, media: [] }),
    get: async (request: Request) => (await import("@/app/api/admin/shop/route")).GET(request),
  },
  {
    page: "Programs", rpc: "load_program_page", path: `/api/admin/programs-page?programId=${programId}&operationId=${operationId}`,
    snapshot: () => ({ program: { id: programId }, gallery: [] }),
    get: async (request: Request) => (await import("@/app/api/admin/programs-page/route")).GET(request),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireFreshClubSession.mockResolvedValue({ userId });
  mocks.getClubContext.mockResolvedValue({ id: clubId, role: "owner", lifecycle: "active", presentationTemplateKey: "academy@1", storeEnabled: true });
  mocks.authorizeAdminAccess.mockResolvedValue({ allowed: true });
  mocks.authorizeMutation.mockResolvedValue({ allowed: true });
  mocks.retirePublishedMedia.mockResolvedValue({ status: "retired" });
  mocks.createClient.mockResolvedValue({ schema: () => ({ rpc: mocks.rpc }) });
});

for (const target of cases) {
  describe(`${target.page} committed receipt media cleanup`, () => {
    const request = () => new Request(`https://alpha.example${target.path}`, { headers: { host: "alpha.example" } });
    const committed = () => ({ ...target.snapshot(), operation: { status: "committed", receipt: {
      ...target.snapshot(), retiredMediaAssetIds: [assetId],
    } } });

    it("retires removed media when GET recovers a committed operation", async () => {
      mocks.rpc.mockResolvedValue({ data: committed(), error: null });
      const response = await target.get(request());
      expect(response.status).toBe(200);
      expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(target.rpc, expect.objectContaining({ p_club_id: clubId, p_operation_id: operationId }));
      expect(mocks.retirePublishedMedia).toHaveBeenCalledExactlyOnceWith({ clubId, actorId: userId, assetId });
      const result = await response.json();
      expect(result.operation).toEqual({ status: "committed", receipt: target.snapshot() });
    });

    it("preserves the committed result and retries cleanup on a subsequent receipt GET", async () => {
      mocks.rpc.mockImplementation(async () => ({ data: committed(), error: null }));
      mocks.retirePublishedMedia.mockRejectedValueOnce(new Error("temporary storage failure"));
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        expect((await target.get(request())).status).toBe(200);
        expect((await target.get(request())).status).toBe(200);
        expect(mocks.retirePublishedMedia).toHaveBeenCalledTimes(2);
        expect(mocks.retirePublishedMedia).toHaveBeenLastCalledWith({ clubId, actorId: userId, assetId });
      } finally { log.mockRestore(); }
    });

    it("does not retire anything for an uncommitted operation", async () => {
      mocks.rpc.mockResolvedValue({ data: { ...target.snapshot(), operation: { status: "not-committed" } }, error: null });
      expect((await target.get(request())).status).toBe(200);
      expect(mocks.retirePublishedMedia).not.toHaveBeenCalled();
    });
  });
}
