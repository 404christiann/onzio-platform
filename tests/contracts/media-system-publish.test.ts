import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  existing: null as null | { data: unknown; error: unknown },
  insertErrors: {} as Record<string, { message: string; code?: string } | null>,
  uploadError: null as null | { message: string; statusCode?: string },
  inserts: [] as Array<[string, Row]>,
  deletes: [] as string[],
  uploads: [] as Array<{ bucket: string; path: string; options: Record<string, unknown> }>,
  removes: [] as Array<{ bucket: string; paths: string[] }>,
  reservation: vi.fn(),
}));

vi.mock("@/lib/media-quota", () => ({ consumeMediaUploadReservation: h.reservation, getMediaUsage: vi.fn() }));
vi.mock("@/lib/media-cleanup", () => ({ queueMediaCleanup: vi.fn() }));
vi.mock("@/lib/supabase-service-role", () => ({
  createServiceRoleClient: () => ({
    schema: () => ({
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        for (const name of ["select", "eq", "is"]) chain[name] = () => chain;
        chain.maybeSingle = () => Promise.resolve(h.existing ?? { data: null, error: null });
        chain.insert = (row: Row) => {
          h.inserts.push([table, row]);
          return Promise.resolve({ error: h.insertErrors[table] ?? null });
        };
        chain.delete = () => ({ eq: () => { h.deletes.push(table); return Promise.resolve({ error: null }); } });
        return chain;
      },
    }),
    storage: {
      from: (bucket: string) => ({
        upload: (path: string, _bytes: Buffer, options: Record<string, unknown>) => {
          h.uploads.push({ bucket, path, options });
          return Promise.resolve({ error: h.uploadError });
        },
        remove: (paths: string[]) => { h.removes.push({ bucket, paths }); return Promise.resolve({ error: null }); },
      }),
    },
  }),
}));

import { publishSystemPhoto, systemPhotoExists } from "@/lib/media-processing";

const CLUB = "11111111-1111-4111-8111-111111111111";
const ASSET = "33333333-3333-4333-8333-333333333333";
const PATH = `${CLUB}/homepage/${ASSET}.webp`;
const jpeg = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: { r: 20, g: 90, b: 160 } } }).jpeg().toBuffer();
const input = async (over: Record<string, unknown> = {}) => ({
  clubId: CLUB, surface: "homepage" as const, assetId: ASSET, bytes: await jpeg(1920, 1080), minimumWidth: 1280, source: "hero-video-poster", ...over,
});
const failure = async (promise: Promise<unknown>) => (await promise.then(() => null, (error) => error)) as { code?: string; message: string } | null;

beforeEach(() => {
  h.existing = null;
  h.insertErrors = {};
  h.uploadError = null;
  h.inserts = [];
  h.deletes = [];
  h.uploads = [];
  h.removes = [];
  h.reservation.mockReset();
});

describe("publishSystemPhoto", () => {
  it("publishes a normalized WebP at <club>/homepage/<id>.webp with the standard cache header and no overwrite", async () => {
    const result = await publishSystemPhoto(await input());
    expect(result).toEqual({ assetId: ASSET, storagePath: PATH, idempotent: false });
    expect(h.uploads).toHaveLength(1);
    expect(h.uploads[0]).toMatchObject({ bucket: "onzio-media", path: PATH, options: { contentType: "image/webp", cacheControl: "2678400", upsert: false } });
    expect(h.uploads.some((upload) => upload.bucket === "onzio-upload-staging")).toBe(false);
  });

  it("writes a published photograph row with no creator, and one media.publish audit event with sizes and a source, no URL or key", async () => {
    await publishSystemPhoto(await input());
    const [, row] = h.inserts.find(([table]) => table === "media_assets")!;
    expect(row).toMatchObject({
      id: ASSET, club_id: CLUB, storage_bucket: "onzio-media", storage_path: PATH, surface: "homepage", media_kind: "photograph",
      mime_type: "image/webp", status: "published", created_by: null,
    });
    expect(row.checksum_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Number(row.width)).toBeLessThanOrEqual(2400);
    const [, audit] = h.inserts.find(([table]) => table === "audit_events")!;
    expect(audit).toMatchObject({ club_id: CLUB, actor_user_id: null, actor_type: "media_processor", operation: "media.publish", resource_type: "media_asset", resource_id: ASSET });
    expect(audit.payload).toMatchObject({ surface: "homepage", media_kind: "photo", source: "hero-video-poster" });
    expect(JSON.stringify(audit)).not.toMatch(/https?:|key|token/i);
  });

  it("takes no upload reservation, so a rate limit can never hold a video back", async () => {
    await publishSystemPhoto(await input());
    expect(h.reservation).not.toHaveBeenCalled();
  });

  it("rejects bytes that are not a JPEG before anything is written", async () => {
    const html = Buffer.from("<html><script>alert(1)</script></html>");
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900"/></svg>');
    for (const bytes of [html, svg, Buffer.from("not an image at all"), Buffer.alloc(0)]) {
      const error = await failure(publishSystemPhoto(await input({ bytes })));
      expect(error, bytes.toString().slice(0, 20)).not.toBeNull();
    }
    expect(h.uploads).toHaveLength(0);
    expect(h.inserts).toHaveLength(0);
  });

  it("rejects a PNG, since the still Bunny serves is a JPEG named thumbnail.jpg", async () => {
    const png = await sharp({ create: { width: 1920, height: 1080, channels: 3, background: "#123456" } }).png().toBuffer();
    expect(await failure(publishSystemPhoto(await input({ bytes: png })))).not.toBeNull();
    expect(h.uploads).toHaveLength(0);
  });

  it("rejects a still narrower than the minimum with MEDIA_TOO_SMALL, and writes nothing", async () => {
    const error = await failure(publishSystemPhoto(await input({ bytes: await jpeg(1279, 720) })));
    expect(error?.code).toBe("MEDIA_TOO_SMALL");
    expect((await failure(publishSystemPhoto(await input({ bytes: await jpeg(640, 360) }))))?.code).toBe("MEDIA_TOO_SMALL");
    expect(await failure(publishSystemPhoto(await input({ bytes: await jpeg(1280, 720) })))).toBeNull();
    expect(h.uploads).toHaveLength(1);
  });

  it("an asset that is already published is a success that fetches, stores and writes nothing again", async () => {
    h.existing = { data: { storage_path: PATH }, error: null };
    expect(await publishSystemPhoto(await input())).toEqual({ assetId: ASSET, storagePath: PATH, idempotent: true });
    expect(h.uploads).toHaveLength(0);
    expect(h.inserts).toHaveLength(0);
  });

  it("an object left by a try that crashed before its row was written is reused, and the row is then written", async () => {
    h.uploadError = { message: "The resource already exists", statusCode: "409" };
    expect(await publishSystemPhoto(await input())).toMatchObject({ assetId: ASSET, idempotent: false });
    expect(h.inserts.map(([table]) => table)).toEqual(["media_assets", "audit_events"]);
    expect(h.removes).toHaveLength(0);
  });

  it("another finisher winning the row race (23505) is the same asset: success, no cleanup, no second audit event", async () => {
    h.insertErrors.media_assets = { message: "duplicate key value", code: "23505" };
    expect(await publishSystemPhoto(await input())).toEqual({ assetId: ASSET, storagePath: PATH, idempotent: true });
    expect(h.removes).toHaveLength(0);
    expect(h.inserts.filter(([table]) => table === "audit_events")).toHaveLength(0);
  });

  it("a failed row insert removes the object it just uploaded and fails closed", async () => {
    h.insertErrors.media_assets = { message: "boom" };
    const error = await failure(publishSystemPhoto(await input()));
    expect(error?.code).toBe("FINALIZATION_ROLLED_BACK");
    expect(h.removes).toEqual([{ bucket: "onzio-media", paths: [PATH] }]);
  });

  it("a failed audit insert takes the row and the object back out", async () => {
    h.insertErrors.audit_events = { message: "boom" };
    const error = await failure(publishSystemPhoto(await input()));
    expect(error?.code).toBe("FINALIZATION_ROLLED_BACK");
    expect(h.deletes).toEqual(["media_assets"]);
    expect(h.removes).toEqual([{ bucket: "onzio-media", paths: [PATH] }]);
  });

  it("a storage failure other than a duplicate fails without writing a row", async () => {
    h.uploadError = { message: "storage unavailable", statusCode: "500" };
    expect(await failure(publishSystemPhoto(await input()))).toMatchObject({ message: expect.stringContaining("Unable to publish") });
    expect(h.inserts).toHaveLength(0);
  });

  it("builds the path from the club and asset ids only, and refuses a surface that is not a media surface", async () => {
    expect(await failure(publishSystemPhoto(await input({ surface: "../etc" })))).not.toBeNull();
    expect(h.uploads).toHaveLength(0);
  });
});

describe("systemPhotoExists", () => {
  it("is true only for a published, undeleted asset of this club", async () => {
    h.existing = { data: { id: ASSET }, error: null };
    expect(await systemPhotoExists(CLUB, ASSET)).toBe(true);
    h.existing = { data: null, error: null };
    expect(await systemPhotoExists(CLUB, ASSET)).toBe(false);
  });
  it("throws on a database error, so the caller reports an unavailable poster, not a missing one", async () => {
    h.existing = { data: null, error: { message: "down" } };
    await expect(systemPhotoExists(CLUB, ASSET)).rejects.toThrow("Unable to check system media");
  });
});
