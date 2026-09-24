import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(), schema: vi.fn(), rpc: vi.fn(), from: vi.fn(), remove: vi.fn(),
  queueMediaCleanup: vi.fn(),
}));
vi.mock("@/lib/supabase-service-role", () => ({ createServiceRoleClient: mocks.createServiceRoleClient }));
vi.mock("@/lib/media-cleanup", () => ({ queueMediaCleanup: mocks.queueMediaCleanup }));

import { deleteRetiredHomepageUpload, retirePublishedMedia } from "@/lib/media-processing";

const clubId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";
const actorId = "33333333-3333-4333-8333-333333333333";
const storagePath = `${clubId}/homepage/${assetId}.webp`;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createServiceRoleClient.mockReturnValue({ schema: mocks.schema, storage: { from: mocks.from } });
  mocks.schema.mockReturnValue({ rpc: mocks.rpc });
  mocks.from.mockReturnValue({ remove: mocks.remove });
});

describe("reference-safe media retirement", () => {
  it("leaves Storage untouched when another page references an asset", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "referenced" }, error: null });
    await expect(retirePublishedMedia({ clubId, actorId, assetId }))
      .resolves.toEqual({ status: "referenced", cleanupQueued: false, idempotent: false });
    expect(mocks.rpc).toHaveBeenCalledWith("retire_unreferenced_media_asset", {
      p_club_id: clubId, p_actor_id: actorId, p_asset_id: assetId,
    });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("queues a failed published object deletion with the allowed reason", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "retired", storagePath, idempotent: false }, error: null });
    mocks.remove.mockResolvedValue({ error: { message: "Storage unavailable" } });
    mocks.queueMediaCleanup.mockResolvedValue(undefined);
    await expect(retirePublishedMedia({ clubId, actorId, assetId }))
      .resolves.toEqual({ status: "retired", cleanupQueued: true, idempotent: false });
    expect(mocks.queueMediaCleanup).toHaveBeenCalledWith({ clubId, storageBucket: "onzio-media", storagePath,
      reason: "published-object-retirement" });
  });

  it("does not claim a Homepage retry was queued if the ledger rejects it", async () => {
    mocks.remove.mockResolvedValue({ error: { message: "Storage unavailable" } });
    mocks.queueMediaCleanup.mockRejectedValue(new Error("Unable to queue media cleanup"));
    await expect(deleteRetiredHomepageUpload({ clubId, storagePath })).rejects.toThrow("Unable to queue media cleanup");
  });
});
