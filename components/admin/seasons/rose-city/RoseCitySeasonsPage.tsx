"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AdminConfirmDialog } from "@/components/admin/ui/AdminConfirmDialog";
import { PageFrame } from "@/components/admin/ui/editor-kit";
import { IconAdd } from "@/components/admin/icons";
import type { SeasonDeleteState, SeasonListItem } from "@/lib/admin-seasons-list";
import { nextSeasonAfter } from "@/lib/season-label";
import { createNextSeason, deleteSeason, setActiveSeason, type SeasonsWriteResult } from "./seasons-ops";
import styles from "./seasons.module.css";

// RC-ADMIN-4b-seasons: Rose City's Seasons page on the editor kit (design: rose-city-admin-wave4/seasons).
// A list with "Make active", "Delete" and "Create <next> season"; no fields and no page Save, because each
// action writes at once, exactly as the classic page does (ClassicSeasonsPage). The list arrives from the
// server in the first paint, so there is no loading state and nothing on the page moves after it loads.
// Diverse City keeps ClassicSeasonsPage.

const CRUMBS = [{ label: "Competition" }];

type Pending = { kind: "active" | "delete"; season: SeasonListItem } | { kind: "create" } | null;

export function seasonRange(season: Pick<SeasonListItem, "start_year" | "end_year">): string {
  return season.start_year === season.end_year ? String(season.start_year) : `${season.start_year} – ${season.end_year}`;
}

export default function RoseCitySeasonsPage({
  seasons,
  deleteStates,
  hasStandings,
}: {
  seasons: SeasonListItem[];
  deleteStates: Record<string, SeasonDeleteState>;
  /** Standings is hidden for Rose City; the copy mentions the league table only for a club that has it. */
  hasStandings: boolean;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [working, setWorking] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const busy = working || refreshing;
  const active = seasons.find((season) => season.active);
  const newest = seasons[0];
  const next = newest ? nextSeasonAfter(newest) : null;
  const nextTaken = next ? seasons.some((season) => season.label === next.label) : false;

  async function run(message: string, done: string, action: () => Promise<SeasonsWriteResult>) {
    setWorking(true);
    setError(null);
    setStatus(message);
    const result = await action();
    if (result.error) setError(result.error);
    setStatus(!result.error || result.partial ? done : "");
    // A season that was created but not fully seeded is still on the server: show it either way.
    if (!result.error || result.partial) startRefresh(() => router.refresh());
    setWorking(false);
    setPending(null);
  }

  function confirm() {
    if (!pending) return;
    if (pending.kind === "create") {
      if (!newest || !next) return;
      void run("Creating season…", `${next.label} season created`, () => createNextSeason(newest));
    } else if (pending.kind === "active") {
      const season = pending.season;
      void run("Updating seasons…", `${season.label} is now the active season`, () => setActiveSeason(season.id));
    } else {
      const season = pending.season;
      void run("Deleting season…", `${season.label} season deleted`, () => deleteSeason(season.id));
    }
  }

  const pagesThatSwitch = hasStandings ? "Roster, Schedule, Stats and Standings" : "Roster, Schedule and Stats";

  return (
    <PageFrame
      title="Seasons"
      breadcrumb={CRUMBS}
      description="Create seasons, choose which one is active, and keep past records."
    >
      <p className="sr-only" role="status">{status}</p>

      <div className={styles.tiles} data-season-tiles="">
        <div className={styles.tile}>
          <span className={styles.tileLabel}>Active season</span>
          <strong className={styles.tileValue}>{active?.label ?? "Not set"}</strong>
        </div>
        <div className={styles.tile}>
          <span className={styles.tileLabel}>Season records</span>
          <strong className={styles.tileValue}>{seasons.length}</strong>
        </div>
      </div>

      <p className={styles.note}>
        The active season is what {pagesThatSwitch} show.
        {hasStandings ? " Each season has its own league table." : ""}
      </p>

      {error && <p role="alert" className={styles.error}>Error: {error}</p>}

      {seasons.length === 0 ? (
        <p className={styles.empty}>No seasons have been set up yet. Contact Onzio to create your first season.</p>
      ) : (
        <ul className={styles.list} aria-label="Seasons">
          {seasons.map((season) => {
            const state = deleteStates[season.id];
            const canDelete = state?.deletable === true;
            return (
              <li key={season.id} className={styles.row} data-active={season.active || undefined} data-season-id={season.id}>
                <div className={styles.text}>
                  <h2 className={styles.name}>
                    {season.label} season
                    {season.active && <span className={styles.chip}>Active</span>}
                  </h2>
                  <p className={styles.meta}>
                    {seasonRange(season)}
                    {state && ` · ${state.matchCount} ${state.matchCount === 1 ? "match" : "matches"} · ${state.statRowCount} player stat ${state.statRowCount === 1 ? "row" : "rows"}`}
                  </p>
                  {!season.active && state && (
                    <p className={styles.guard} data-deletable={canDelete || undefined}>{state.reason}</p>
                  )}
                </div>
                {!season.active && (
                  <div className={styles.actions}>
                    <button type="button" className={`admin-press ${styles.button}`} disabled={busy} onClick={() => setPending({ kind: "active", season })}>
                      Make active
                    </button>
                    <button
                      type="button"
                      className={`admin-press ${styles.button}`}
                      data-danger=""
                      disabled={busy || !canDelete}
                      title={state?.reason}
                      onClick={() => setPending({ kind: "delete", season })}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {next && (
        <div className={styles.create}>
          <button
            type="button"
            className={`admin-press ${styles.button}`}
            data-primary=""
            disabled={busy || nextTaken}
            onClick={() => setPending({ kind: "create" })}
          >
            <IconAdd size={16} aria-hidden="true" />
            Create {next.label} season
          </button>
          <span className={styles.hint}>
            {nextTaken ? `A ${next.label} season already exists.` : "The next season’s name follows the newest one."}
          </span>
        </div>
      )}

      <AdminConfirmDialog
        open={pending?.kind === "active"}
        title={pending?.kind === "active" ? `Make ${pending.season.label} the active season?` : ""}
        confirmLabel={pending?.kind === "active" ? `Make ${pending.season.label} active` : "Make active"}
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={confirm}
      >
        {pending?.kind === "active" && (
          <p>
            {pagesThatSwitch} switch from {active ? active.label : "no season"} to {pending.season.label} on the admin and on your website. You can switch back any time.
          </p>
        )}
      </AdminConfirmDialog>

      <AdminConfirmDialog
        open={pending?.kind === "delete"}
        title={pending?.kind === "delete" ? `Delete the ${pending.season.label} season?` : ""}
        confirmLabel="Delete season"
        destructive
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={confirm}
      >
        <p>It has no matches or recorded stats. Its empty player rows are removed too. This can’t be undone.</p>
      </AdminConfirmDialog>

      <AdminConfirmDialog
        open={pending?.kind === "create"}
        title={next ? `Create the ${next.label} season?` : ""}
        confirmLabel="Create season"
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={confirm}
      >
        {next && (
          <p>
            Creates {next.label} and adds every active player with zero stats. {active ? `${active.label} stays active` : "The current season stays as it is"} until you change it. A new season can be deleted until it has matches or recorded stats.
          </p>
        )}
      </AdminConfirmDialog>
    </PageFrame>
  );
}
