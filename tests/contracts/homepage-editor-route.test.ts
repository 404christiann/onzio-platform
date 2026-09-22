import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadContract } from "../helpers/contract";
import { homepageDraft, saveRequest } from "../fixtures/homepage-editor";

const mocks = vi.hoisted(() => ({
  authorizeAdminAccess: vi.fn(),
  authorizeMutation: vi.fn(),
  createClient: vi.fn(),
  getClubContext: vi.fn(),
  requireFreshClubSession: vi.fn(),
  retirePublishedMedia: vi.fn(),
  rpc: vi.fn(),
  schema: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({
  authorizeAdminAccess: mocks.authorizeAdminAccess,
  authorizeMutation: mocks.authorizeMutation,
}));
vi.mock("@/lib/auth-session", () => ({
  requireFreshClubSession: mocks.requireFreshClubSession,
}));
vi.mock("@/lib/club-context", () => ({
  getClubContext: mocks.getClubContext,
}));
vi.mock("@/lib/supabase-server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/media-processing", () => ({
  retirePublishedMedia: mocks.retirePublishedMedia,
}));

const clubId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const operationId = "33333333-3333-4333-8333-333333333333";

type Route = {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
};

async function route() {
  return loadContract<Route>("@/app/api/admin/homepage/route", "GET").then(async () => {
    const imported = await vi.importActual<Route>("@/app/api/admin/homepage/route");
    return imported;
  });
}

function snapshot() {
  return {
    revision: "revision-2",
    designRevision: "design-2",
    design: {
      templateKey: "academy@1",
      slideshowVariant: "none",
      heroVariant: "editable",
    },
    content: homepageDraft(),
    media: [],
    videoSource: { provider: "bunny", id: "video-1" },
  };
}

function request(method: "GET" | "POST", body?: unknown, options: { origin?: string; operationId?: string } = {}) {
  const url = new URL("https://alpha.example/api/admin/homepage");
  if (options.operationId) url.searchParams.set("operationId", options.operationId);
  return new Request(url, {
    method,
    headers: {
      host: "alpha.example",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.origin ? { origin: options.origin } : {}),
    },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireFreshClubSession.mockResolvedValue({ userId, claims: {} });
  mocks.getClubContext.mockResolvedValue({ id: clubId, lifecycle: "active", role: "owner" });
  mocks.authorizeAdminAccess.mockResolvedValue({ allowed: true, role: "owner" });
  mocks.authorizeMutation.mockResolvedValue({ clubId, actorId: userId });
  mocks.rpc.mockResolvedValue({ data: snapshot(), error: null });
  mocks.schema.mockReturnValue({ rpc: mocks.rpc });
  mocks.createClient.mockResolvedValue({ schema: mocks.schema });
  mocks.retirePublishedMedia.mockResolvedValue({ status: "retired", cleanupQueued: false, idempotent: false });
});

describe("homepage admin route contract", () => {
  it("never calls the RPC for an unauthenticated request", async () => {
    mocks.requireFreshClubSession.mockRejectedValue(new Error("UNAUTHENTICATED"));
    const { GET } = await route();

    const response = await GET(request("GET"));

    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown tenant", () => mocks.getClubContext.mockResolvedValue(null)],
    ["authorization failure", () => mocks.authorizeAdminAccess.mockRejectedValue(new Error("FORBIDDEN"))],
  ])("never calls the RPC for %s", async (_label, configure) => {
    configure();
    const { GET } = await route();

    const response = await GET(request("GET"));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("loads a tenant-scoped homepage and passes an optional trusted operation ID", async () => {
    const { GET } = await route();

    const response = await GET(request("GET", undefined, { operationId }));

    expect(response.status).toBe(200);
    expect(mocks.schema).toHaveBeenCalledWith("onzio");
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("load_homepage", {
      p_club_id: clubId,
      p_operation_id: operationId,
    });
    expect(await response.json()).toEqual(snapshot());
  });

  it("surfaces a load failure without fabricating an empty draft", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "read failed" } });
    const { GET } = await route();

    const response = await GET(request("GET"));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toMatchObject({ error: { code: "DATABASE_OPERATION_FAILED" } });
    expect(JSON.stringify(body)).not.toContain('"content":{}');
  });

  it("rejects malformed JSON and forged tenant input before any RPC", async () => {
    const { POST } = await route();
    const malformed = await POST(request("POST", "{"));
    expect(malformed.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();

    const forged = await POST(request("POST", { ...saveRequest(), club_id: "99999999-9999-4999-8999-999999999999" }));
    expect(forged.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects cross-origin POSTs before authorization or RPC", async () => {
    const { POST } = await route();

    const response = await POST(request("POST", saveRequest(), { origin: "https://evil.example" }));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("uses the tenant Host when Next exposes an internal localhost request URL", async () => {
    const { POST } = await route();
    const response = await POST(new Request("http://localhost:3110/api/admin/homepage", {
      method: "POST",
      headers: { host: "alpha.localhost:3110", origin: "http://alpha.localhost:3110", "content-type": "application/json" },
      body: JSON.stringify(saveRequest()),
    }));
    expect(response.status).toBe(200);
    expect(mocks.getClubContext).toHaveBeenCalledWith({ hostname: "alpha.localhost:3110", userId });
  });

  it("maps Postgres SQLSTATE plus a fixed exception message to a safe conflict", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PT409", message: "DESIGN_CHANGED" } });
    const { POST } = await route();
    const response = await POST(request("POST", saveRequest()));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "DESIGN_CHANGED" } });
  });

  it("rejects a source-video property from the save schema", async () => {
    const { POST } = await route();

    const response = await POST(request("POST", { ...saveRequest(), videoSource: "https://evil.example/video" }));

    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("saves once through the tenant RPC without direct table writes", async () => {
    const { POST } = await route();
    const payload = saveRequest();

    const response = await POST(request("POST", payload));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("save_homepage", {
      p_club_id: clubId,
      p_request: payload,
    });
    expect(mocks.schema.mock.results[0]?.value.from).toBeUndefined();
    expect(await response.json()).toEqual(snapshot());
  });

  it.each(["CONTENT_CHANGED", "OPERATION_REUSED"] as const)("maps SQL %s to 409 without retrying", async (code) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message: "conflict" } });
    const { POST } = await route();

    const response = await POST(request("POST", saveRequest()));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code } });
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it("retires a photo asset the save just stopped referencing and never exposes the bookkeeping field", async () => {
    const assetId = "44444444-4444-4444-8444-444444444444";
    mocks.rpc.mockResolvedValue({ data: { ...snapshot(), retiredMediaAssetIds: [assetId] }, error: null });
    const { POST } = await route();

    const response = await POST(request("POST", saveRequest()));

    expect(response.status).toBe(200);
    expect(mocks.retirePublishedMedia).toHaveBeenCalledExactlyOnceWith({ clubId, actorId: userId, assetId });
    expect(await response.json()).toEqual(snapshot());
  });

  it("never calls retirement for a load, and never turns cleanup failure into a reported save failure", async () => {
    mocks.retirePublishedMedia.mockRejectedValue(new Error("storage unavailable"));
    const assetId = "55555555-5555-4555-8555-555555555555";
    mocks.rpc.mockResolvedValue({ data: { ...snapshot(), retiredMediaAssetIds: [assetId] }, error: null });
    const { GET, POST } = await route();

    const saveResponse = await POST(request("POST", saveRequest()));
    expect(saveResponse.status).toBe(200);
    expect(await saveResponse.json()).toEqual(snapshot());
    expect(mocks.retirePublishedMedia).toHaveBeenCalledOnce();

    mocks.retirePublishedMedia.mockClear();
    const loadResponse = await GET(request("GET"));
    expect(loadResponse.status).toBe(200);
    expect(mocks.retirePublishedMedia).not.toHaveBeenCalled();
  });
});
