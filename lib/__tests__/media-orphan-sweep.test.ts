import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveSweepMode,
  runMediaOrphanSweep,
  SWEEP_MAX_RETIREMENTS_PER_CLUB,
  SWEEP_MAX_RETIREMENTS_PER_RUN,
  type SweepDeps,
} from "@/lib/media-orphan-sweep";

type Club = { clubId: string; slug: string; published: number; referencedCount: number; pinned: any[]; waiting: any[]; candidates: any[] };

let counter = 0;
function candidates(clubId: string, n: number) {
  return Array.from({ length: n }, () => {
    counter += 1;
    const assetId = `asset-${counter}`;
    return { assetId, path: `${clubId}/homepage/${assetId}.webp`, surface: "homepage", publishedAt: "2026-11-01T00:00:00Z", unreferencedSince: "2026-11-02T00:00:00Z" };
  });
}
function club(clubId: string, o: { published: number; candidates: number; pinned?: number }): Club {
  return {
    clubId, slug: clubId, published: o.published, referencedCount: 0,
    pinned: Array.from({ length: o.pinned ?? 0 }, (_, i) => ({ assetId: `pin-${clubId}-${i}`, path: `${clubId}/branding/pin-${i}.webp` })),
    waiting: [], candidates: candidates(clubId, o.candidates),
  };
}

type Opts = {
  retire?: (args: any) => { data?: any; error?: any };
  copyError?: (path: string) => any;
  removeError?: boolean;
  trash?: Record<string, Array<{ name: string; id?: string; created_at?: string }>>;
};

function harness(clubs: Club[], opts: Opts = {}) {
  const calls: string[] = [];
  const retireCalls: any[] = [];
  const removed: Array<{ bucket: string; paths: string[] }> = [];
  const audit: any[] = [];
  const queue = vi.fn(async (_input: any) => {});
  const service = {
    schema: () => ({
      rpc: async (name: string, args: any) => {
        calls.push(`rpc:${name}`);
        if (name === "media_orphan_sweep_scan") {
          return { data: { graceSeconds: 86400, scannedAt: "2026-11-19T00:00:00Z", clubs, strayObjects: 3 }, error: null };
        }
        retireCalls.push(args);
        return opts.retire ? { error: null, ...opts.retire(args) } : { data: { status: "retired", storagePath: "x" }, error: null };
      },
      from: (table: string) => ({
        insert: async (rows: any[]) => {
          calls.push(`insert:${table}`);
          audit.push(...rows);
          return { error: null };
        },
      }),
    }),
    storage: {
      from: (bucket: string) => ({
        copy: async (from: string, to: string, o: any) => {
          calls.push(`copy:${from}`);
          expect(to).toBe(from);
          expect(o).toEqual({ destinationBucket: "onzio-media-trash" });
          const error = opts.copyError?.(from);
          return error ? { data: null, error } : { data: { path: to }, error: null };
        },
        remove: async (paths: string[]) => {
          calls.push(`remove:${bucket}:${paths[0]}`);
          removed.push({ bucket, paths });
          if (opts.removeError && bucket === "onzio-media") return { data: null, error: { message: "boom" } };
          return { data: paths.map((name) => ({ name })), error: null };
        },
        list: async (prefix: string) => {
          calls.push(`list:${bucket}:${prefix}`);
          const trash = opts.trash ?? {};
          return { data: trash[prefix] ?? [], error: null };
        },
      }),
    },
  };
  const deps: SweepDeps = {
    service: service as never,
    queueCleanup: queue as never,
    now: () => new Date("2026-11-19T00:00:00Z"),
    runId: "run-1",
  };
  return { deps, calls, retireCalls, removed, audit, queue };
}

const silence = () => { vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); };
const original = process.env.MEDIA_ORPHAN_SWEEP_MODE;
afterEach(() => {
  vi.restoreAllMocks();
  if (original === undefined) delete process.env.MEDIA_ORPHAN_SWEEP_MODE; else process.env.MEDIA_ORPHAN_SWEEP_MODE = original;
});

describe("mode", () => {
  it("is dry-run unless the value is exactly off or enforce", () => {
    expect(resolveSweepMode(undefined)).toBe("dry-run");
    expect(resolveSweepMode("")).toBe("dry-run");
    expect(resolveSweepMode("yes")).toBe("dry-run");
    expect(resolveSweepMode("dry-run")).toBe("dry-run");
    expect(resolveSweepMode("off")).toBe("off");
    expect(resolveSweepMode("enforce")).toBe("enforce");
    expect(resolveSweepMode(" Enforce ")).toBe("enforce");
  });

  it("does nothing at all when off", async () => {
    silence();
    const h = harness([club("a", { published: 10, candidates: 2 })]);
    const result = await runMediaOrphanSweep({ ...h.deps, mode: "off" });
    expect(h.calls).toEqual([]);
    expect(result).toMatchObject({ mode: "off", clubs: 0, candidates: 0, retired: 0 });
  });

  it("runs as dry-run when the variable is unset", async () => {
    silence();
    delete process.env.MEDIA_ORPHAN_SWEEP_MODE;
    const h = harness([club("a", { published: 10, candidates: 2 })]);
    const result = await runMediaOrphanSweep(h.deps);
    expect(result.mode).toBe("dry-run");
    expect(h.retireCalls).toHaveLength(0);
  });

  it("runs as enforce when the variable says so", async () => {
    silence();
    process.env.MEDIA_ORPHAN_SWEEP_MODE = "enforce";
    const h = harness([club("a", { published: 100, candidates: 1 })]);
    expect((await runMediaOrphanSweep(h.deps)).mode).toBe("enforce");
    expect(h.retireCalls).toHaveLength(1);
  });
});

describe("dry-run", () => {
  it("never copies, removes, retires, queues or lists the trash, even with candidates", async () => {
    silence();
    const h = harness([club("a", { published: 10, candidates: 8, pinned: 2 }), club("b", { published: 100, candidates: 5 })]);
    const result = await runMediaOrphanSweep({ ...h.deps, mode: "dry-run" });
    expect(h.calls.filter((c) => /^(copy|remove|list):/.test(c))).toEqual([]);
    expect(h.calls.filter((c) => c === "rpc:retire_unreferenced_media_asset")).toEqual([]);
    expect(h.queue).not.toHaveBeenCalled();
    expect(result).toMatchObject({ mode: "dry-run", retired: 0, skipped: 0, failed: 0, trashPurged: 0, halted: false, candidates: 13, pinned: 2 });
  });

  it("flags a club over 30% and a run over 200 candidates without applying the halt", async () => {
    silence();
    const h = harness([club("a", { published: 10, candidates: 4 }), club("b", { published: 1000, candidates: 150 }), club("c", { published: 1000, candidates: 60 })]);
    const result = await runMediaOrphanSweep({ ...h.deps, mode: "dry-run" });
    expect(result).toMatchObject({ wouldHaltRun: true, halted: false, candidates: 214 });
    const byClub = Object.fromEntries(h.audit.filter((r) => r.club_id).map((r) => [r.club_id, r.payload]));
    expect(byClub.a.wouldHaltClub).toBe(true);
    expect(byClub.b.wouldHaltClub).toBe(false);
    expect(byClub.a.candidates).toHaveLength(4);
    expect(byClub.a.halted).toBeUndefined();
  });

  it("lists pinned assets as pinned and persists one row per club plus a summary", async () => {
    silence();
    const h = harness([club("a", { published: 10, candidates: 1, pinned: 3 })]);
    await runMediaOrphanSweep({ ...h.deps, mode: "dry-run" });
    expect(h.audit).toHaveLength(2);
    const [clubRow, summaryRow] = h.audit;
    expect(clubRow).toMatchObject({ club_id: "a", actor_type: "system", operation: "media.orphan_sweep_report", resource_type: "media_sweep", resource_id: "run-1" });
    expect(clubRow.payload).toMatchObject({ mode: "dry-run", graceHours: 24, published: 10, wouldHaltClub: false });
    expect(clubRow.payload.pinned).toHaveLength(3);
    expect(clubRow.payload.candidates.map((c: any) => c.assetId)).not.toContain(clubRow.payload.pinned[0].assetId);
    expect(summaryRow).toMatchObject({ club_id: null, resource_id: "run-1" });
    expect(summaryRow.payload).toMatchObject({ mode: "dry-run", strayObjects: 3 });
  });
});

describe("enforce", () => {
  it("copies to the trash before it retires, and removes the public object last", async () => {
    silence();
    const c = club("a", { published: 100, candidates: 1 });
    const path = c.candidates[0].path;
    const h = harness([c]);
    const result = await runMediaOrphanSweep({ ...h.deps, mode: "enforce" });
    const order = h.calls.filter((x) => x.endsWith(path) || x === "rpc:retire_unreferenced_media_asset");
    expect(order).toEqual([`copy:${path}`, "rpc:retire_unreferenced_media_asset", `remove:onzio-media:${path}`]);
    expect(h.retireCalls[0]).toEqual({ p_club_id: "a", p_asset_id: c.candidates[0].assetId, p_actor_id: null });
    expect(result.retired).toBe(1);
    expect(h.audit[0].payload.retired).toEqual([{ assetId: c.candidates[0].assetId, path }]);
  });

  it("deletes the trash copy and records a skip when the asset is referenced again", async () => {
    silence();
    const c = club("a", { published: 100, candidates: 1 });
    const path = c.candidates[0].path;
    const h = harness([c], { retire: () => ({ data: { status: "referenced" } }) });
    const result = await runMediaOrphanSweep({ ...h.deps, mode: "enforce" });
    expect(h.removed).toContainEqual({ bucket: "onzio-media-trash", paths: [path] });
    expect(h.removed.filter((r) => r.bucket === "onzio-media")).toEqual([]);
    expect(result).toMatchObject({ retired: 0, skipped: 1 });
    expect(h.audit[0].payload.skipped).toEqual([{ assetId: c.candidates[0].assetId, path, reason: "referenced" }]);
  });

  it("does the same for an asset that is no longer published", async () => {
    silence();
    const h = harness([club("a", { published: 100, candidates: 1 })], { retire: () => ({ data: { status: "not-published" } }) });
    const result = await runMediaOrphanSweep({ ...h.deps, mode: "enforce" });
    expect(result.skipped).toBe(1);
    expect(h.removed.map((r) => r.bucket)).toEqual(["onzio-media-trash"]);
  });

  it("does not retire when the trash copy fails", async () => {
    silence();
    const h = harness([club("a", { published: 100, candidates: 1 })], { copyError: () => ({ message: "storage down" }) });
    const result = await runMediaOrphanSweep({ ...h.deps, mode: "enforce" });
    expect(h.retireCalls).toHaveLength(0);
    expect(result).toMatchObject({ retired: 0, failed: 1 });
  });

  it("treats an existing trash copy as copied", async () => {
    silence();
    const h = harness([club("a", { published: 100, candidates: 1 })], { copyError: () => ({ message: "The resource already exists" }) });
    expect((await runMediaOrphanSweep({ ...h.deps, mode: "enforce" })).retired).toBe(1);
  });

  it("queues the removal for retry when the public object cannot be removed", async () => {
    silence();
    const c = club("a", { published: 100, candidates: 1 });
    const h = harness([c], { removeError: true });
    const result = await runMediaOrphanSweep({ ...h.deps, mode: "enforce" });
    expect(h.queue).toHaveBeenCalledWith({ clubId: "a", storageBucket: "onzio-media", storagePath: c.candidates[0].path, reason: "published-object-retirement" });
    expect(result.retired).toBe(1);
  });

  it("retires at most 25 per club and 50 per run", async () => {
    silence();
    expect(SWEEP_MAX_RETIREMENTS_PER_CLUB).toBe(25);
    expect(SWEEP_MAX_RETIREMENTS_PER_RUN).toBe(50);
    const h = harness([
      club("a", { published: 1000, candidates: 30 }),
      club("b", { published: 1000, candidates: 30 }),
      club("c", { published: 1000, candidates: 30 }),
    ]);
    const result = await runMediaOrphanSweep({ ...h.deps, mode: "enforce" });
    expect(result.retired).toBe(50);
    expect(h.retireCalls.filter((a) => a.p_club_id === "a")).toHaveLength(25);
    expect(h.retireCalls.filter((a) => a.p_club_id === "b")).toHaveLength(25);
    expect(h.retireCalls.filter((a) => a.p_club_id === "c")).toHaveLength(0);
    const byClub = Object.fromEntries(h.audit.filter((r) => r.club_id).map((r) => [r.club_id, r.payload]));
    expect(byClub.a.deferred).toBe(5);
    expect(byClub.c.deferred).toBe(30);
  });

  it("skips a club whose candidates exceed 30% of its published assets, and only that club", async () => {
    silence();
    const h = harness([club("a", { published: 10, candidates: 4 }), club("b", { published: 10, candidates: 3 }), club("c", { published: 100, candidates: 2 })]);
    const result = await runMediaOrphanSweep({ ...h.deps, mode: "enforce" });
    expect(h.retireCalls.filter((a) => a.p_club_id === "a")).toHaveLength(0);
    expect(h.retireCalls.filter((a) => a.p_club_id === "b")).toHaveLength(3);
    expect(h.retireCalls.filter((a) => a.p_club_id === "c")).toHaveLength(2);
    expect(result.retired).toBe(5);
    const byClub = Object.fromEntries(h.audit.filter((r) => r.club_id).map((r) => [r.club_id, r.payload]));
    expect(byClub.a).toMatchObject({ halted: true, wouldHaltClub: true });
    expect(byClub.b.halted).toBe(false);
  });

  it("halts the whole run when candidates exceed 200", async () => {
    silence();
    const h = harness([club("a", { published: 1000, candidates: 120 }), club("b", { published: 1000, candidates: 81 })]);
    const result = await runMediaOrphanSweep({ ...h.deps, mode: "enforce" });
    expect(result).toMatchObject({ halted: true, wouldHaltRun: true, retired: 0, candidates: 201 });
    expect(h.calls.filter((c) => /^(copy|remove):/.test(c))).toEqual([]);
    expect(h.retireCalls).toHaveLength(0);
    // The run exactly at the limit still goes ahead.
    const ok = harness([club("a", { published: 1000, candidates: 100 }), club("b", { published: 1000, candidates: 100 })]);
    expect((await runMediaOrphanSweep({ ...ok.deps, mode: "enforce" })).halted).toBe(false);
  });

  it("purges only trash older than 30 days", async () => {
    silence();
    const day = 24 * 60 * 60 * 1000;
    const now = new Date("2026-11-19T00:00:00Z").getTime();
    const h = harness([], {
      trash: {
        "": [{ name: "club-1" }],
        "club-1": [{ name: "homepage" }],
        "club-1/homepage": [
          { name: "old.webp", id: "1", created_at: new Date(now - 31 * day).toISOString() },
          { name: "new.webp", id: "2", created_at: new Date(now - 29 * day).toISOString() },
        ],
      },
    });
    const result = await runMediaOrphanSweep({ ...h.deps, mode: "enforce" });
    expect(h.removed).toEqual([{ bucket: "onzio-media-trash", paths: ["club-1/homepage/old.webp"] }]);
    expect(result.trashPurged).toBe(1);
  });
});
