import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractError } from "@/lib/contract-error";
import type { MediaAuthorization } from "@/lib/media-authorization-token";

// A failed finalize used to leave its staged file in onzio-upload-staging forever. Once the upload's
// reservation is spent (consumed, expired or rejected), nothing can ever finalize that file again, so it
// is removed, or queued for removal when Storage refuses. A file whose reservation is still live, or
// whose state is unknown, is left for the retry that may still use it.

const consume = vi.hoisted(() => vi.fn());
const queueCleanup = vi.hoisted(() => vi.fn());
const storage = vi.hoisted(() => ({
  staged: Buffer.alloc(0) as Buffer<ArrayBufferLike>,
  removed: [] as string[][],
  removeError: null as { message: string } | null,
  publishError: null as { message: string } | null,
}));

vi.mock("@/lib/media-quota", () => ({
  consumeMediaUploadReservation: consume,
  getMediaUsage: vi.fn(),
}));
vi.mock("@/lib/media-cleanup", () => ({ queueMediaCleanup: queueCleanup }));
vi.mock("@/lib/supabase-service-role", () => {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: null, error: null }),
    insert: async () => ({ error: null }),
    delete: () => query,
  };
  return {
    createServiceRoleClient: () => ({
      schema: () => ({ from: () => query }),
      storage: {
        from: (bucket: string) => ({
          download: async () => ({ data: new Blob([new Uint8Array(storage.staged)]), error: null }),
          upload: async () => ({ error: bucket === "onzio-media" ? storage.publishError : null }),
          remove: async (paths: string[]) => {
            if (bucket === "onzio-upload-staging") storage.removed.push(paths);
            return { error: bucket === "onzio-upload-staging" ? storage.removeError : null };
          },
        }),
      },
    }),
  };
});

const CLUB = "11111111-1111-4111-8111-111111111111";
const UPLOAD = "22222222-2222-4222-8222-222222222222";
const STAGING_PATH = `${CLUB}/about/${UPLOAD}.png`;

function authorization(): MediaAuthorization {
  return {
    version: 1,
    uploadId: UPLOAD,
    clubId: CLUB,
    actorId: "33333333-3333-4333-8333-333333333333",
    surface: "about",
    kind: "graphic",
    fileName: "crest.png",
    mimeType: "image/png",
    claimedSize: 10_000_000,
    stagingPath: STAGING_PATH,
    expiresAt: Date.now() + 60_000,
  };
}

async function png(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 0.5 } } })
    .png()
    .toBuffer();
}

async function finalize() {
  const { publishAuthorizedMedia } = await import("@/lib/media-processing");
  return publishAuthorizedMedia(authorization());
}

beforeEach(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  storage.staged = await png();
  storage.removed = [];
  storage.removeError = null;
  storage.publishError = null;
  consume.mockResolvedValue(undefined);
  queueCleanup.mockResolvedValue(undefined);
});

afterEach(() => {
  consume.mockReset();
  queueCleanup.mockReset();
});

describe("a failed finalize removes its staged file", () => {
  it("removes the staged file when the image cannot be read", async () => {
    storage.staged = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
    await expect(finalize()).rejects.toMatchObject({ code: "CORRUPT_IMAGE" });
    expect(storage.removed).toEqual([[STAGING_PATH]]);
  });

  it("removes the staged file when the bytes are not the type that was claimed", async () => {
    storage.staged = Buffer.from("not an image at all, just text");
    await expect(finalize()).rejects.toMatchObject({ code: "SIGNATURE_MISMATCH" });
    expect(storage.removed).toEqual([[STAGING_PATH]]);
  });

  it("removes the staged file when publishing the processed image fails", async () => {
    storage.publishError = { message: "storage down" };
    await expect(finalize()).rejects.toThrow(/storage down/);
    expect(storage.removed).toEqual([[STAGING_PATH]]);
  });

  it("removes the staged file when its reservation has expired", async () => {
    consume.mockRejectedValueOnce(new ContractError("UPLOAD_AUTHORIZATION_EXPIRED"));
    await expect(finalize()).rejects.toMatchObject({ code: "UPLOAD_AUTHORIZATION_EXPIRED" });
    expect(storage.removed).toEqual([[STAGING_PATH]]);
  });

  it("removes the staged file when it is larger than the reservation", async () => {
    consume.mockRejectedValueOnce(new ContractError("MEDIA_SIZE_MISMATCH"));
    await expect(finalize()).rejects.toMatchObject({ code: "MEDIA_SIZE_MISMATCH" });
    expect(storage.removed).toEqual([[STAGING_PATH]]);
  });

  it("queues the staged file for removal when Storage refuses to delete it", async () => {
    storage.staged = Buffer.from("not an image at all, just text");
    storage.removeError = { message: "storage busy" };
    await expect(finalize()).rejects.toMatchObject({ code: "SIGNATURE_MISMATCH" });
    expect(queueCleanup).toHaveBeenCalledWith({
      clubId: CLUB,
      storageBucket: "onzio-upload-staging",
      storagePath: STAGING_PATH,
      reason: "abandoned-staging-object",
    });
  });

  it("still reports the original refusal when removing the staged file also fails", async () => {
    storage.staged = Buffer.from("not an image at all, just text");
    storage.removeError = { message: "storage busy" };
    queueCleanup.mockRejectedValueOnce(new Error("queue down"));
    await expect(finalize()).rejects.toMatchObject({ code: "SIGNATURE_MISMATCH" });
  });
});

describe("the cleanup queue reasons", () => {
  it("are exactly the ones the database constraint accepts", async () => {
    const { readFileSync } = await import("node:fs");
    const { MEDIA_CLEANUP_REASONS } = await vi.importActual<typeof import("@/lib/media-cleanup")>("@/lib/media-cleanup");
    const sql = readFileSync("supabase/migrations/20260924154404_media_reference_safe_retirement.sql", "utf8");
    const check = sql.slice(sql.lastIndexOf("add constraint media_cleanup_queue_reason_check"));
    const allowed = [...check.slice(0, check.indexOf(";")).matchAll(/'([a-z-]+)'/g)].map((match) => match[1]);
    expect([...MEDIA_CLEANUP_REASONS].sort()).toEqual(allowed.sort());
  });
});

describe("a finalize that may still be retried keeps its staged file", () => {
  it("keeps the file when another finalize already used the reservation", async () => {
    consume.mockRejectedValueOnce(new ContractError("MEDIA_RESERVATION_USED"));
    await expect(finalize()).rejects.toMatchObject({ code: "MEDIA_RESERVATION_USED" });
    expect(storage.removed).toEqual([]);
  });

  it("keeps the file when the reservation could not be checked", async () => {
    consume.mockRejectedValueOnce(new Error("Unable to use the upload reservation: connection reset"));
    await expect(finalize()).rejects.toThrow(/connection reset/);
    expect(storage.removed).toEqual([]);
    expect(queueCleanup).not.toHaveBeenCalled();
  });

  it("removes the staged file exactly once after a successful publish", async () => {
    await expect(finalize()).resolves.toMatchObject({ status: "finalized", idempotent: false });
    expect(storage.removed).toEqual([[STAGING_PATH]]);
  });
});
