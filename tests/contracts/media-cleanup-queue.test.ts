import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ upsert: vi.fn(), from: vi.fn(), schema: vi.fn(), createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/supabase-service-role", () => ({ createServiceRoleClient: mocks.createServiceRoleClient }));

import { queueMediaCleanup } from "@/lib/media-cleanup";

const clubId = "11111111-1111-4111-8111-111111111111";
const storagePath = `${clubId}/homepage/22222222-2222-4222-8222-222222222222.webp`;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createServiceRoleClient.mockReturnValue({ schema: mocks.schema });
  mocks.schema.mockReturnValue({ from: mocks.from });
  mocks.from.mockReturnValue({ upsert: mocks.upsert });
});

describe("media cleanup retry queue", () => {
  it("reports an insertion error instead of claiming a retry was queued", async () => {
    mocks.upsert.mockResolvedValue({ error: { message: "constraint rejected reason" } });
    await expect(queueMediaCleanup({ clubId, storageBucket: "onzio-media", storagePath, reason: "unsaved-homepage-upload" }))
      .rejects.toThrow("Unable to queue media cleanup: constraint rejected reason");
  });

  it("passes only after the retry ledger accepts the row", async () => {
    mocks.upsert.mockResolvedValue({ error: null });
    await expect(queueMediaCleanup({ clubId, storageBucket: "onzio-media", storagePath, reason: "unsaved-homepage-upload" }))
      .resolves.toBeUndefined();
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ reason: "unsaved-homepage-upload", storage_path: storagePath,
      completed_at: null, last_error: null }),
      { onConflict: "storage_bucket,storage_path" });
  });
});
