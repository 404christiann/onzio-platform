import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createServiceRoleClient: vi.fn(), rpc: vi.fn(), remove: vi.fn(), update: vi.fn(),
  queueLimit: vi.fn(), queueEq: vi.fn(), assetSingle: vi.fn() }));
vi.mock("@/lib/supabase-service-role", () => ({ createServiceRoleClient: mocks.createServiceRoleClient }));

import { processQueuedMediaCleanup } from "@/lib/media-cleanup";

const clubId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";
const path = `${clubId}/homepage/${assetId}.webp`;
const row = { id: 10, club_id: clubId, storage_bucket: "onzio-media", storage_path: path, attempts: 0 };

function chain(final: string, result: (...args: unknown[]) => unknown) {
  const self: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["select", "is", "lte", "order", "eq"]) self[method] = () => self;
  self[final] = result;
  return self;
}

beforeEach(() => {
  vi.clearAllMocks();
  const queue = chain("limit", mocks.queueLimit);
  queue.update = mocks.update;
  queue.eq = (...args: unknown[]) => { mocks.queueEq(...args); return queue; };
  const asset = chain("maybeSingle", mocks.assetSingle);
  mocks.update.mockImplementation(() => ({ eq: () => Promise.resolve({ error: null }) }));
  mocks.queueLimit.mockResolvedValue({ data: [row], error: null });
  mocks.assetSingle.mockResolvedValue({ data: { id: assetId, status: "orphaned", deleted_at: "2026-09-24T00:00:00Z" }, error: null });
  mocks.rpc.mockResolvedValue({ data: { status: "retired", storagePath: path, idempotent: true }, error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.createServiceRoleClient.mockReturnValue({
    schema: () => ({ from: (table: string) => table === "media_cleanup_queue" ? queue : asset, rpc: mocks.rpc }),
    storage: { from: () => ({ remove: mocks.remove }) },
  });
});

describe("durable media cleanup worker", () => {
  it("deletes and completes an orphaned, still-unreferenced public asset", async () => {
    await expect(processQueuedMediaCleanup()).resolves.toEqual({ inspected: 1, removed: 1, failed: 0 });
    expect(mocks.rpc).toHaveBeenCalledWith("retire_unreferenced_media_asset", {
      p_club_id: clubId, p_asset_id: assetId, p_actor_id: null,
    });
    expect(mocks.remove).toHaveBeenCalledWith([path]);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ attempts: 1, last_error: null,
      completed_at: expect.any(String) }));
  });

  it("keeps a referenced asset and reschedules the retry", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "referenced" }, error: null });
    await expect(processQueuedMediaCleanup()).resolves.toEqual({ inspected: 1, removed: 0, failed: 1 });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ attempts: 1,
      last_error: "ASSET_REFERENCED", next_attempt_at: expect.any(String) }));
  });

  it("does not delete a public asset that is no longer retired", async () => {
    mocks.assetSingle.mockResolvedValue({ data: { id: assetId, status: "published", deleted_at: null }, error: null });
    await expect(processQueuedMediaCleanup()).resolves.toEqual({ inspected: 1, removed: 0, failed: 1 });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("limits queued retries to the requested local club", async () => {
    await processQueuedMediaCleanup({ clubId });
    expect(mocks.queueEq).toHaveBeenCalledWith("club_id", clubId);
  });
});
