import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContractError } from "@/lib/contract-error";

const mocks = vi.hoisted(() => ({
  authorizeMutation: vi.fn(), createClient: vi.fn(), getClubContext: vi.fn(),
  requireFreshClubSession: vi.fn(), rpc: vi.fn(), schema: vi.fn(),
  deleteRetiredHomepageUpload: vi.fn(),
}));
vi.mock("@/lib/authorization", () => ({ authorizeMutation: mocks.authorizeMutation }));
vi.mock("@/lib/auth-session", () => ({ requireFreshClubSession: mocks.requireFreshClubSession }));
vi.mock("@/lib/club-context", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/lib/supabase-server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/media-processing", () => ({ deleteRetiredHomepageUpload: mocks.deleteRetiredHomepageUpload }));

const clubId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const path = `${clubId}/homepage/${assetId}.webp`;
const request = (origin = "https://alpha.example") => new Request("https://alpha.example/api/admin/homepage/upload-cleanup", {
  method: "POST", headers: { host: "alpha.example", origin, "content-type": "application/json" }, body: JSON.stringify({ assetId }),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireFreshClubSession.mockResolvedValue({ userId });
  mocks.getClubContext.mockResolvedValue({ id: clubId, role: "owner", lifecycle: "active" });
  mocks.authorizeMutation.mockResolvedValue({ clubId, actorId: userId });
  mocks.rpc.mockResolvedValue({ data: { status: "referenced" }, error: null });
  mocks.schema.mockReturnValue({ rpc: mocks.rpc });
  mocks.createClient.mockResolvedValue({ schema: mocks.schema });
  mocks.deleteRetiredHomepageUpload.mockResolvedValue({ cleanupQueued: false });
});

describe("unsaved Homepage upload cleanup route", () => {
  it("rejects a cross-origin request before authentication or database access", async () => {
    const { POST } = await import("@/app/api/admin/homepage/upload-cleanup/route");
    const response = await POST(request("https://other.example"));
    expect(response.status).toBe(403);
    expect(mocks.requireFreshClubSession).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("stops at tenant authorization and does not retire an asset", async () => {
    mocks.authorizeMutation.mockRejectedValue(new ContractError("NOT_AUTHORIZED"));
    const { POST } = await import("@/app/api/admin/homepage/upload-cleanup/route");
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.deleteRetiredHomepageUpload).not.toHaveBeenCalled();
  });

  it("leaves a concurrently referenced asset and its object untouched", async () => {
    const { POST } = await import("@/app/api/admin/homepage/upload-cleanup/route");
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("retire_unreferenced_homepage_upload", { p_club_id: clubId, p_asset_id: assetId });
    expect(mocks.deleteRetiredHomepageUpload).not.toHaveBeenCalled();
  });

  it("deletes Storage only after the database retires the exact unreferenced asset", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "retired", storagePath: path }, error: null });
    const { POST } = await import("@/app/api/admin/homepage/upload-cleanup/route");
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.deleteRetiredHomepageUpload).toHaveBeenCalledExactlyOnceWith({ clubId, storagePath: path });
  });
});
