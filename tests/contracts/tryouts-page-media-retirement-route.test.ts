import { beforeEach, describe, expect, it, vi } from "vitest";
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
const payload = () => ({ operationId, expectedRevision: "0", page: null,
  events: [{ ...buildTryoutMutationPayload(emptyTryoutDraft(0)), id: null, sort_order: 0 }], deletedIds: [] });
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

describe("Tryouts event photo retirement", () => {
  it("does not call Tryouts RPCs for a design without a public Tryouts route", async () => {
    mocks.getClubContext.mockResolvedValue({ id: clubId, role: "owner", lifecycle: "active", presentationTemplateKey: "clubhouse@1" });
    const { GET, POST } = await import("@/app/api/admin/tryouts-page/route");
    expect((await GET(request("GET"))).status).toBe(404);
    expect((await POST(request("POST", payload()))).status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("retires old saved photos after the atomic Save and hides the receipt bookkeeping", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...snapshot(), retiredMediaAssetIds: [assetId] }, error: null });
    const { POST } = await import("@/app/api/admin/tryouts-page/route");
    const response = await POST(request("POST", payload()));
    expect(response.status).toBe(200);
    expect(mocks.retirePublishedMedia).toHaveBeenCalledExactlyOnceWith({ clubId, actorId: userId, assetId });
    expect(await response.json()).toEqual({ ...snapshot(), registrationForms: {} });
  });

  it("retries retirement from a committed operation receipt after response loss", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...snapshot(), operation: { status: "committed", receipt: {
      ...snapshot(), retiredMediaAssetIds: [assetId],
    } } }, error: null });
    const { GET } = await import("@/app/api/admin/tryouts-page/route");
    const response = await GET(request("GET", undefined, operationId));
    expect(response.status).toBe(200);
    expect(mocks.retirePublishedMedia).toHaveBeenCalledExactlyOnceWith({ clubId, actorId: userId, assetId });
    expect((await response.json()).operation.receipt.retiredMediaAssetIds).toBeUndefined();
  });

  it.each(["query", "hydration"])("keeps a confirmed Save successful if form %s fails", async (failure) => {
    if (failure === "query") mocks.formsResult.mockResolvedValue({ data: null, error: { message: "temporary read failure" } });
    else mocks.loadLinkedOpenRegistrationForms.mockRejectedValue(new Error("temporary hydration failure"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { POST } = await import("@/app/api/admin/tryouts-page/route");
      const response = await POST(request("POST", payload()));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(snapshot());
      expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("save_tryouts_page", { p_club_id: clubId, p_request: payload() });
    } finally { log.mockRestore(); }
  });

  it("returns a committed receipt even if registration previews cannot refresh", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...snapshot(), operation: { status: "committed", receipt: snapshot() } }, error: null });
    mocks.formsResult.mockResolvedValue({ data: null, error: { message: "temporary read failure" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { GET } = await import("@/app/api/admin/tryouts-page/route");
      const response = await GET(request("GET", undefined, operationId));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ...snapshot(), operation: { status: "committed", receipt: snapshot() } });
    } finally { log.mockRestore(); }
  });

  it("rejects an incomplete initial load if registration previews are unavailable", async () => {
    mocks.formsResult.mockResolvedValue({ data: null, error: { message: "temporary read failure" } });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { GET } = await import("@/app/api/admin/tryouts-page/route");
      const response = await GET(request("GET"));
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ error: { code: "DATABASE_OPERATION_FAILED" } });
    } finally { log.mockRestore(); }
  });

  it("keeps the Save successful if physical cleanup fails", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...snapshot(), retiredMediaAssetIds: [assetId] }, error: null });
    mocks.retirePublishedMedia.mockRejectedValue(new Error("storage unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await import("@/app/api/admin/tryouts-page/route");
    const response = await POST(request("POST", payload()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...snapshot(), registrationForms: {} });
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});
