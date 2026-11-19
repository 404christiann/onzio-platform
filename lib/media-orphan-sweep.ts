import { queueMediaCleanup } from "@/lib/media-cleanup";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

// RC-ADMIN-10d: the orphan-media sweep. A daily cron calls runMediaOrphanSweep.
//
// Modes (MEDIA_ORPHAN_SWEEP_MODE): "off" does nothing; "dry-run" (the default, also for an unset
// or unknown value) only keeps the unreferenced_since clock and records the report; "enforce"
// also retires candidates. Dry-run never copies, removes, retires or queues anything.
//
// The database decides what is unreferenced (onzio.media_orphan_sweep_scan, which counts pins and
// the media_reference_columns registry as references). Retirement re-checks references under its
// own lock (onzio.retire_unreferenced_media_asset), so a link added after the scan wins.

export type SweepMode = "off" | "dry-run" | "enforce";

export const SWEEP_GRACE_HOURS = 24;
export const SWEEP_MAX_RETIREMENTS_PER_RUN = 50;
export const SWEEP_MAX_RETIREMENTS_PER_CLUB = 25;
/** A club whose candidates exceed this share of its published assets is skipped. */
export const SWEEP_CLUB_HALT_RATIO = 0.3;
/** More candidates than this across all clubs halts the whole run. */
export const SWEEP_RUN_HALT_CANDIDATES = 200;
export const SWEEP_TRASH_BUCKET = "onzio-media-trash";
export const SWEEP_TRASH_RETENTION_DAYS = 30;
const TRASH_LIST_PAGE_SIZE = 100;
const TRASH_REMOVE_BATCH_SIZE = 100;
const TRASH_MAX_LIST_CALLS = 200;
const TRASH_TIME_BUDGET_MS = 15_000;

export function resolveSweepMode(raw: string | undefined = process.env.MEDIA_ORPHAN_SWEEP_MODE): SweepMode {
  const value = raw?.trim().toLowerCase();
  if (value === "off" || value === "enforce") return value;
  return "dry-run";
}

type PinnedAsset = { assetId: string; path: string };
type WaitingAsset = { assetId: string; path: string; surface: string; unreferencedSince: string };
type CandidateAsset = WaitingAsset & { publishedAt: string };

type ScanClub = {
  clubId: string;
  slug: string;
  published: number;
  referencedCount: number;
  pinned: PinnedAsset[];
  waiting: WaitingAsset[];
  candidates: CandidateAsset[];
};

type ScanResult = {
  graceSeconds: number;
  scannedAt: string;
  clubs: ScanClub[];
  strayObjects: number | null;
};

export type SweepClubReport = {
  mode: SweepMode;
  graceHours: number;
  published: number;
  referencedCount: number;
  pinned: PinnedAsset[];
  waiting: WaitingAsset[];
  candidates: CandidateAsset[];
  wouldHaltClub: boolean;
  /** Enforce only. */
  retired?: PinnedAsset[];
  skipped?: Array<PinnedAsset & { reason: string }>;
  failed?: Array<PinnedAsset & { reason: string }>;
  deferred?: number;
  halted?: boolean;
};

export type SweepResult = {
  mode: SweepMode;
  runId: string;
  graceHours: number;
  clubs: number;
  published: number;
  pinned: number;
  waiting: number;
  candidates: number;
  wouldHaltRun: boolean;
  strayObjects: number | null;
  retired: number;
  skipped: number;
  failed: number;
  trashPurged: number;
  halted: boolean;
};

type Service = ReturnType<typeof createServiceRoleClient>;

export type SweepDeps = {
  service?: Service;
  mode?: SweepMode;
  now?: () => Date;
  queueCleanup?: typeof queueMediaCleanup;
  runId?: string;
};

function log(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...data }));
}

function isDuplicateCopy(error: { message?: string } | null): boolean {
  return Boolean(error?.message && /already exists|duplicate/i.test(error.message));
}

export async function runMediaOrphanSweep(deps: SweepDeps = {}): Promise<SweepResult> {
  const mode = deps.mode ?? resolveSweepMode();
  const runId = deps.runId ?? crypto.randomUUID();
  const now = deps.now ?? (() => new Date());
  const empty: SweepResult = {
    mode, runId, graceHours: SWEEP_GRACE_HOURS, clubs: 0, published: 0, pinned: 0, waiting: 0,
    candidates: 0, wouldHaltRun: false, strayObjects: null, retired: 0, skipped: 0, failed: 0,
    trashPurged: 0, halted: false,
  };
  if (mode === "off") {
    log("media.orphan_sweep_off", { runId });
    return empty;
  }

  const service = deps.service ?? createServiceRoleClient();
  const queueCleanup = deps.queueCleanup ?? queueMediaCleanup;
  const onzio = service.schema("onzio");

  const { data, error } = await onzio.rpc("media_orphan_sweep_scan", {
    p_grace: `${SWEEP_GRACE_HOURS} hours`,
  });
  if (error || !data) throw new Error(`Unable to scan for orphaned media: ${error?.message ?? "empty result"}`);
  const scan = data as ScanResult;

  const totalCandidates = scan.clubs.reduce((sum, club) => sum + club.candidates.length, 0);
  const wouldHaltRun = totalCandidates > SWEEP_RUN_HALT_CANDIDATES;
  const haltRun = mode === "enforce" && wouldHaltRun;

  const reports = new Map<string, SweepClubReport>();
  let retiredTotal = 0;
  let skippedTotal = 0;
  let failedTotal = 0;

  for (const club of scan.clubs) {
    const wouldHaltClub = club.published > 0 && club.candidates.length > club.published * SWEEP_CLUB_HALT_RATIO;
    const report: SweepClubReport = {
      mode,
      graceHours: SWEEP_GRACE_HOURS,
      published: club.published,
      referencedCount: club.referencedCount,
      pinned: club.pinned,
      waiting: club.waiting,
      candidates: club.candidates,
      wouldHaltClub,
    };
    reports.set(club.clubId, report);
    if (mode !== "enforce") continue;

    report.retired = [];
    report.skipped = [];
    report.failed = [];
    report.deferred = 0;
    report.halted = haltRun || wouldHaltClub;
    if (report.halted) continue;

    let clubRetired = 0;
    for (const candidate of club.candidates) {
      if (clubRetired >= SWEEP_MAX_RETIREMENTS_PER_CLUB || retiredTotal >= SWEEP_MAX_RETIREMENTS_PER_RUN) {
        report.deferred = (report.deferred ?? 0) + 1;
        continue;
      }
      const ref = { assetId: candidate.assetId, path: candidate.path };
      const outcome = await retireCandidate(service, club.clubId, ref, queueCleanup);
      if (outcome.status === "retired") {
        report.retired.push(ref);
        clubRetired += 1;
        retiredTotal += 1;
      } else if (outcome.status === "skipped") {
        report.skipped.push({ ...ref, reason: outcome.reason });
        skippedTotal += 1;
      } else {
        report.failed.push({ ...ref, reason: outcome.reason });
        failedTotal += 1;
      }
    }
  }

  let trashPurged = 0;
  if (mode === "enforce") {
    try {
      trashPurged = await purgeTrash(service, now());
    } catch (caught) {
      console.error(JSON.stringify({
        event: "media.orphan_sweep_trash_purge_failed",
        runId,
        message: caught instanceof Error ? caught.message : "unknown",
      }));
    }
  }

  const summary: SweepResult = {
    ...empty,
    clubs: scan.clubs.length,
    published: scan.clubs.reduce((sum, club) => sum + club.published, 0),
    pinned: scan.clubs.reduce((sum, club) => sum + club.pinned.length, 0),
    waiting: scan.clubs.reduce((sum, club) => sum + club.waiting.length, 0),
    candidates: totalCandidates,
    wouldHaltRun,
    strayObjects: scan.strayObjects ?? null,
    retired: retiredTotal,
    skipped: skippedTotal,
    failed: failedTotal,
    trashPurged,
    halted: haltRun,
  };

  for (const club of scan.clubs) {
    log("media.orphan_sweep_club", { runId, clubId: club.clubId, slug: club.slug, ...reports.get(club.clubId) });
  }
  log("media.orphan_sweep_run", { ...summary });

  // Vercel Hobby keeps logs for about an hour, so every run's report is also kept in the audit
  // log: one row per club and one summary row with no club.
  const rows = [
    ...scan.clubs.map((club) => ({
      club_id: club.clubId,
      actor_user_id: null,
      actor_type: "system",
      operation: "media.orphan_sweep_report",
      resource_type: "media_sweep",
      resource_id: runId,
      payload: reports.get(club.clubId) as unknown as Record<string, unknown>,
    })),
    {
      club_id: null,
      actor_user_id: null,
      actor_type: "system",
      operation: "media.orphan_sweep_report",
      resource_type: "media_sweep",
      resource_id: runId,
      payload: { ...summary } as unknown as Record<string, unknown>,
    },
  ];
  const { error: auditError } = await onzio.from("audit_events").insert(rows);
  if (auditError) throw new Error(`Unable to record the orphan sweep report: ${auditError.message}`);

  return summary;
}

type Outcome =
  | { status: "retired" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

/** Copy to trash, retire in the database, then remove the public object. The trash copy comes
 * first, so a file is never gone from both places. */
async function retireCandidate(
  service: Service,
  clubId: string,
  asset: PinnedAsset,
  queueCleanup: typeof queueMediaCleanup,
): Promise<Outcome> {
  const media = service.storage.from("onzio-media");
  const trash = service.storage.from(SWEEP_TRASH_BUCKET);

  let { error: copyError } = await media.copy(asset.path, asset.path, { destinationBucket: SWEEP_TRASH_BUCKET });
  if (copyError && isDuplicateCopy(copyError)) {
    // A copy left by an earlier failed run may be close to the 30-day purge, which runs later in
    // this same run. Replace it so the trash always holds a fresh copy of a file retired today.
    const { error: staleError } = await trash.remove([asset.path]);
    if (staleError) return { status: "failed", reason: "TRASH_COPY_FAILED" };
    ({ error: copyError } = await media.copy(asset.path, asset.path, { destinationBucket: SWEEP_TRASH_BUCKET }));
  }
  if (copyError) {
    return { status: "failed", reason: "TRASH_COPY_FAILED" };
  }

  const { data, error } = await service.schema("onzio").rpc("retire_unreferenced_media_asset", {
    p_club_id: clubId,
    p_asset_id: asset.assetId,
    p_actor_id: null,
  });
  let status = (data as { status?: string } | null)?.status;
  if (error || !status) {
    // The call may have committed before the error reached us. Read the asset back: if it is
    // already retired, finish the job (remove the public object) instead of leaking it.
    const { data: row, error: readError } = await service.schema("onzio").from("media_assets")
      .select("status, deleted_at").eq("club_id", clubId).eq("id", asset.assetId).maybeSingle();
    const retiredRow = row as { status?: string; deleted_at?: string | null } | null;
    if (readError || retiredRow?.status !== "orphaned" || !retiredRow.deleted_at) {
      // The outcome is unknown, so keep the trash copy; it expires with the rest of the trash.
      return { status: "failed", reason: "RETIRE_FAILED" };
    }
    status = "retired";
  }

  if (status !== "retired") {
    await trash.remove([asset.path]);
    return { status: "skipped", reason: status };
  }

  const { error: removeError } = await media.remove([asset.path]);
  if (removeError) {
    try {
      await queueCleanup({
        clubId,
        storageBucket: "onzio-media",
        storagePath: asset.path,
        reason: "published-object-retirement",
      });
    } catch {
      return { status: "failed", reason: "REMOVE_AND_QUEUE_FAILED" };
    }
  }
  return { status: "retired" };
}

type ListEntry = { name: string; id?: string | null; created_at?: string | null; metadata?: Record<string, unknown> | null };

/** Delete trash objects older than the retention. Paths are club/surface/file, so folders are
 * listed fully before anything is removed (listings are offset-based). */
async function purgeTrash(service: Service, now: Date): Promise<number> {
  const bucket = service.storage.from(SWEEP_TRASH_BUCKET);
  const cutoff = new Date(now.getTime() - SWEEP_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const deadline = Date.now() + TRASH_TIME_BUDGET_MS;
  let listCalls = 0;
  const expired: string[] = [];

  async function walk(prefix: string, depth: number): Promise<void> {
    if (depth > 3) return;
    const folders: string[] = [];
    let offset = 0;
    while (listCalls < TRASH_MAX_LIST_CALLS && Date.now() < deadline) {
      listCalls += 1;
      const { data, error } = await bucket.list(prefix, {
        limit: TRASH_LIST_PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(`Unable to list trash: ${error.message}`);
      const entries = (data ?? []) as ListEntry[];
      for (const entry of entries) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (!entry.id && !entry.metadata) {
          folders.push(path);
        } else if (entry.created_at && new Date(entry.created_at) < cutoff) {
          expired.push(path);
        }
      }
      if (entries.length < TRASH_LIST_PAGE_SIZE) break;
      offset += entries.length;
    }
    for (const folder of folders) await walk(folder, depth + 1);
  }

  await walk("", 0);
  let removed = 0;
  for (let i = 0; i < expired.length; i += TRASH_REMOVE_BATCH_SIZE) {
    const batch = expired.slice(i, i + TRASH_REMOVE_BATCH_SIZE);
    const { data, error } = await bucket.remove(batch);
    if (error) throw new Error(`Unable to purge trash: ${error.message}`);
    removed += Array.isArray(data) ? data.length : batch.length;
  }
  return removed;
}
