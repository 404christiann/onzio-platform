import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/supabase-service-role", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

import {
  STAGING_LIST_PAGE_SIZE,
  STAGING_REMOVE_BATCH_SIZE,
  cleanupAbandonedStagingMedia,
} from "@/lib/media-cleanup";

const clubId = "11111111-1111-4111-8111-111111111111";
const now = Date.now();
const OLD = new Date(now - 48 * 3600_000).toISOString();
const NEW = new Date(now - 3600_000).toISOString();

type Obj = { name: string; created_at: string | null; withId?: boolean };

/** Fake staging bucket whose list results shift when objects are removed, as
 * the real offset-based storage API does. */
function fakeStorage(files: Map<string, Obj>) {
  const listCalls: Array<{ prefix: string; offset: number }> = [];
  const removeCalls: string[][] = [];
  const bucket = {
    list: vi.fn(async (prefix: string, opts: { limit: number; offset: number }) => {
      listCalls.push({ prefix, offset: opts.offset });
      const base = prefix ? `${prefix}/` : "";
      const children = new Map<string, unknown>();
      for (const [path, obj] of [...files].sort(([a], [b]) => (a < b ? -1 : 1))) {
        if (!path.startsWith(base)) continue;
        const rest = path.slice(base.length);
        const [head, ...tail] = rest.split("/");
        if (tail.length) children.set(head, { name: head });
        else children.set(head, { name: head, id: obj.withId === false ? null : "id", created_at: obj.created_at, metadata: { size: 1 } });
      }
      const sorted = [...children.values()] as Array<{ name: string }>;
      sorted.sort((a, b) => (a.name < b.name ? -1 : 1));
      return { data: sorted.slice(opts.offset, opts.offset + opts.limit), error: null };
    }),
    remove: vi.fn(async (paths: string[]) => {
      removeCalls.push([...paths]);
      for (const p of paths) files.delete(p);
      return { data: [], error: null };
    }),
  };
  mocks.createServiceRoleClient.mockReturnValue({
    storage: { from: () => bucket },
    schema: () => ({
      from: () => {
        const q: Record<string, unknown> = {};
        for (const m of ["select", "is", "lte", "order", "eq"]) q[m] = () => q;
        q.limit = async () => ({ data: [], error: null });
        return q;
      },
    }),
  });
  return { bucket, listCalls, removeCalls };
}

function populate(count: number, createdAt: string, kind: string, startAt = 0): Map<string, Obj> {
  const files = new Map<string, Obj>();
  for (let i = startAt; i < startAt + count; i += 1) {
    const name = `${String(i).padStart(5, "0")}.webp`;
    files.set(`${clubId}/${kind}/${name}`, { name, created_at: createdAt });
  }
  return files;
}

beforeEach(() => vi.clearAllMocks());

describe("abandoned staging cleanup with shifting list pages", () => {
  it("deletes every eligible file across 3+ pages and keeps ineligible ones", async () => {
    const total = STAGING_LIST_PAGE_SIZE * 3 + 57; // 357 old files, interleaved by name
    const files = new Map<string, Obj>();
    const keep = new Set<string>();
    for (let i = 0; i < total; i += 1) {
      const name = `${String(i).padStart(5, "0")}.webp`;
      const path = `${clubId}/homepage/${name}`;
      // every 7th is too new, every 11th has no created_at: both must survive
      const tooNew = i % 7 === 0;
      const noDate = !tooNew && i % 11 === 0;
      files.set(path, { name, created_at: tooNew ? NEW : noDate ? null : OLD });
      if (tooNew || noDate) keep.add(path);
    }
    // a second folder under the club, and a file too deep to be walked
    for (const [path, obj] of populate(120, OLD, "news")) files.set(path, obj);
    files.set(`${clubId}/a/b/c/d/deep.webp`, { name: "deep.webp", created_at: OLD });
    keep.add(`${clubId}/a/b/c/d/deep.webp`);
    const expectedDeleted = files.size - keep.size;
    const { removeCalls } = fakeStorage(files);

    const result = await cleanupAbandonedStagingMedia();

    expect(result).toMatchObject({ removed: expectedDeleted, failed: 0, hasMore: false });
    expect([...files.keys()].sort()).toEqual([...keep].sort());
    const deleted = removeCalls.flat();
    expect(new Set(deleted).size).toBe(deleted.length); // nothing deleted twice
    expect(deleted.every((p) => !keep.has(p))).toBe(true);
  });

  it("removes in multi-path batches that respect the batch size boundary", async () => {
    const total = STAGING_REMOVE_BATCH_SIZE * 2 + 1; // 201
    const files = populate(total, OLD, "homepage");
    const { removeCalls } = fakeStorage(files);

    const result = await cleanupAbandonedStagingMedia();

    expect(removeCalls.map((c) => c.length)).toEqual([100, 100, 1]);
    expect(result).toMatchObject({ removed: total, hasMore: false });
    expect(files.size).toBe(0);
  });

  it("makes one exact batch when eligible files equal the batch size", async () => {
    const files = populate(STAGING_REMOVE_BATCH_SIZE, OLD, "homepage");
    const { removeCalls } = fakeStorage(files);
    await cleanupAbandonedStagingMedia();
    expect(removeCalls.map((c) => c.length)).toEqual([100]);
  });

  it("stops at the per-run file bound, reports hasMore, and finishes on the next run", async () => {
    const files = populate(350, OLD, "homepage");
    const { removeCalls } = fakeStorage(files);

    const first = await cleanupAbandonedStagingMedia({ maxFilesPerRun: 250 });
    expect(first).toMatchObject({ removed: 250, failed: 0, hasMore: true });
    expect(removeCalls.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(files.size).toBe(100);

    const second = await cleanupAbandonedStagingMedia({ maxFilesPerRun: 250 });
    expect(second).toMatchObject({ removed: 100, hasMore: false });
    expect(files.size).toBe(0);
  });

  it("stops at the list-call bound without deleting anything unlisted", async () => {
    const files = populate(500, OLD, "homepage");
    const { listCalls } = fakeStorage(files);

    const result = await cleanupAbandonedStagingMedia({ maxListCalls: 3 });

    // root + club + two pages of homepage would need 4 calls; only 3 allowed
    expect(listCalls.length).toBeLessThanOrEqual(3);
    expect(result.hasMore).toBe(true);
    expect(files.size).toBeGreaterThan(0);
  });

  it("queues every file of a failed batch for retry and counts them as failed", async () => {
    // queue paths must parse as <club>/<surface>/<uuid>.<ext>
    const files = new Map<string, Obj>();
    for (let i = 1; i <= 3; i += 1) {
      const name = `2222222${i}-2222-4222-8222-222222222222.webp`;
      files.set(`${clubId}/homepage/${name}`, { name, created_at: OLD });
    }
    const { bucket } = fakeStorage(files);
    bucket.remove.mockResolvedValueOnce({ data: null, error: { message: "boom" } } as never);
    const upsert = vi.fn(() => Promise.resolve({ error: null }));
    mocks.createServiceRoleClient.mockReturnValue({
      storage: { from: () => bucket },
      schema: () => ({
        from: (table: string) => {
          if (table === "media_cleanup_queue") {
            const q: Record<string, unknown> = { upsert };
            for (const m of ["select", "is", "lte", "order", "eq"]) q[m] = () => q;
            q.limit = async () => ({ data: [], error: null });
            return q;
          }
          throw new Error("unexpected table");
        },
      }),
    });

    const result = await cleanupAbandonedStagingMedia();

    expect(result).toMatchObject({ removed: 0, failed: 3 });
    expect(upsert).toHaveBeenCalledTimes(3);
    expect(files.size).toBe(3);
  });
});
