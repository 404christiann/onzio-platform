"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { AdminModal } from "@/components/admin/AdminModal";
import {
  IconAdd,
  IconCaretDown,
  IconCheck,
  IconDelete,
  IconEdit,
  IconRoster,
  IconSchedule,
  IconStandings,
  IconWarning,
} from "@/components/admin/icons";
import { Spinner } from "@/components/ui/spinner";
import {
  deleteVerdict,
  statRowHasNumbers,
  type HubSeason,
  type SeasonsHubData,
} from "@/lib/admin-seasons-data";
import {
  SEASON_NAME_MAX,
  seasonNameProblem,
  seasonNameProblemText,
} from "@/lib/season-label";
import styles from "./seasons.module.css";

// ADMIN-RE-11a: "This season" (design: cd-season-final, dc-club-home). The
// Seasons page is the hub: the season the website shows, its numbers, and the
// quiet way to start the next one. Starting a season suggests a name (Spring
// then Fall, or the next years), asks "Show <season> on your website now?",
// and leaves a calm "ready · Show it" note when the answer is not yet. Every
// write goes through POST /api/admin/data, which resolves the club and checks
// the session itself.

type ReadyHub = Extract<SeasonsHubData, { status: "ready" }>;

export type SeasonsHubLinks = {
  league: string | null;
  totals: string | null;
  games: string | null;
};

type Step = "closed" | "start" | "ask" | "delete";
type DataResult = { ok: true; data: unknown; count: number | null } | { ok: false; message: string };

const numbers = new Intl.NumberFormat("en-US");
const plural = new Intl.PluralRules("en-US");
const noun = (n: number, one: string, other: string) => (plural.select(n) === "one" ? one : other);
const ordinal = (n: number) => `${n}${[, "st", "nd", "rd"][(n % 100 >> 3) ^ 1 && n % 10] || "th"}`;

/** Players get a totals row at zero in a new season, a batch at a time. */
const SEED_BATCH = 200;
const ZERO_FIELD = {
  goals: 0, assists: 0, tackles: 0, starts: 0, yellow: 0, red: 0, mins: 0, offsides: 0, fouls: 0, fouls_suffered: 0,
};
const ZERO_KEEPER = { goals_against: 0, saves: 0, clean_sheets: 0, starts: 0, yellow: 0, red: 0, mins: 0 };

async function adminData(request: Record<string, unknown>): Promise<DataResult> {
  try {
    const response = await fetch("/api/admin/data", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    const body = (await response.json().catch(() => null)) as {
      data?: unknown;
      count?: number | null;
      error?: { message?: unknown } | null;
    } | null;
    if (!response.ok || !body || body.error) {
      const message = body?.error?.message;
      return { ok: false, message: typeof message === "string" && message.length < 200 ? message : "" };
    }
    return { ok: true, data: body.data ?? null, count: body.count ?? null };
  } catch {
    return { ok: false, message: "" };
  }
}

const CONNECTION = "Check your connection and try again.";
const isDuplicate = (message: string) => /duplicate|unique/i.test(message);

export function SeasonsHub({
  data,
  canChange,
  savedText,
  links,
}: {
  data: ReadyHub;
  canChange: boolean;
  /** The hold-aware label from lib/save-status.ts (decision 2), worked out on the server. */
  savedText: string;
  links: SeasonsHubLinks;
}) {
  const router = useRouter();
  const { seasons, shown, viewed, ready, suggestion } = data;
  const [step, setStep] = useState<Step>("closed");
  const [name, setName] = useState(suggestion.label);
  const [busy, setBusy] = useState<null | "start" | "show" | "delete">(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; label: string; warning: string | null } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const hintId = useId();
  const stepRef = useRef<Step>(step);
  stepRef.current = step;

  const first = seasons.length === 0;
  const takenNames = seasons.map((season) => season.label);
  const nameProblem = seasonNameProblem(name, takenNames);
  const nameProblemText = nameProblem ? seasonNameProblemText(nameProblem, name) : null;
  const count = [...name.trim()].length;

  // The suggestion changes after a season is started; the next dialog starts from it.
  useEffect(() => {
    if (stepRef.current === "closed") setName(suggestion.label);
  }, [suggestion.label]);

  function openStart() {
    setName(suggestion.label);
    setProblem(null);
    setStep("start");
  }

  function closeDialog() {
    if (busy) return;
    setStep("closed");
    setProblem(null);
  }

  async function startSeason() {
    if (busy || nameProblem) return;
    setBusy("start");
    setProblem(null);
    setStatus(null);
    const label = name.trim();
    const season = await adminData({
      table: "seasons",
      operation: "insert",
      columns: "id,label",
      payload: { label, start_year: suggestion.startYear, end_year: suggestion.endYear, active: false },
      single: "single",
    });
    const row = season.ok ? (season.data as { id?: unknown; label?: unknown } | null) : null;
    if (!season.ok || typeof row?.id !== "string") {
      setProblem(
        season.ok
          ? `The season was not started. ${CONNECTION}`
          : isDuplicate(season.message)
            ? seasonNameProblemText("taken", label)
            : season.message
              ? `The season was not started: ${season.message}`
              : `The season was not started. ${CONNECTION}`,
      );
      setBusy(null);
      return;
    }

    const warning = await seedTotals(row.id);
    setCreated({ id: row.id, label, warning });
    setBusy(null);
    setStep("ask");
    router.refresh();
  }

  async function switchTo(season: { id: string; label: string }) {
    if (busy) return;
    setBusy("show");
    setPageError(null);
    setStatus(null);
    const previous = shown;
    // The single-active index needs the old season switched off first.
    if (previous && previous.id !== season.id) {
      const off = await adminData({
        table: "seasons",
        operation: "update",
        columns: "id",
        payload: { active: false },
        filters: [{ kind: "eq", column: "id", value: previous.id }],
      });
      if (!off.ok) return failedSwitch(season.label);
    }
    const on = await adminData({
      table: "seasons",
      operation: "update",
      columns: "id",
      payload: { active: true },
      filters: [{ kind: "eq", column: "id", value: season.id }],
    });
    const changed = on.ok && Array.isArray(on.data) && on.data.length === 1;
    if (!changed) {
      if (previous && previous.id !== season.id) {
        await adminData({
          table: "seasons",
          operation: "update",
          columns: "id",
          payload: { active: true },
          filters: [{ kind: "eq", column: "id", value: previous.id }],
        });
      }
      return failedSwitch(season.label);
    }
    setBusy(null);
    setStep("closed");
    setCreated(null);
    setStatus(savedText);
    // Back to the page for the season now shown.
    router.replace("/admin/seasons");
    router.refresh();
  }

  function failedSwitch(label: string) {
    setBusy(null);
    setStep("closed");
    setPageError(`${label} was not switched on. ${CONNECTION}`);
  }

  async function deleteViewed(season: HubSeason) {
    if (busy) return;
    setBusy("delete");
    setProblem(null);
    setStatus(null);
    // Look again just before deleting: a game or a number may have arrived since the page loaded.
    const [matches, field, keepers] = await Promise.all([
      adminData({
        table: "matches", operation: "select", columns: "id", count: "exact", head: true,
        filters: [{ kind: "eq", column: "season_id", value: season.id }],
      }),
      adminData({
        table: "player_season_stats", operation: "select",
        columns: "player_id,season_id,goals,assists,tackles,offsides,fouls,fouls_suffered,starts,yellow,red,mins",
        filters: [{ kind: "eq", column: "season_id", value: season.id }], limit: 1000,
      }),
      adminData({
        table: "goalkeeper_season_stats", operation: "select",
        columns: "player_id,season_id,goals_against,saves,clean_sheets,starts,yellow,red,mins",
        filters: [{ kind: "eq", column: "season_id", value: season.id }], limit: 1000,
      }),
    ]);
    if (!matches.ok || !field.ok || !keepers.ok) {
      setProblem(`${season.label} was not deleted. ${CONNECTION}`);
      setBusy(null);
      return;
    }
    const rows = [
      ...((field.data ?? []) as Record<string, unknown>[]),
      ...((keepers.data ?? []) as Record<string, unknown>[]),
    ];
    const verdict = deleteVerdict(season, {
      matches: matches.count ?? 0,
      rowsWithNumbers: rows.filter(statRowHasNumbers).length,
      statRows: rows.length,
    });
    if (!verdict.deletable) {
      setProblem(`${season.label} has games or player numbers now, so it was kept.`);
      setBusy(null);
      router.refresh();
      return;
    }
    const steps: Record<string, unknown>[] = [
      { table: "player_season_stats", operation: "delete", columns: "player_id", filters: [{ kind: "eq", column: "season_id", value: season.id }] },
      { table: "goalkeeper_season_stats", operation: "delete", columns: "player_id", filters: [{ kind: "eq", column: "season_id", value: season.id }] },
      { table: "seasons", operation: "delete", columns: "id", filters: [{ kind: "eq", column: "id", value: season.id }] },
    ];
    for (const request of steps) {
      const result = await adminData(request);
      if (!result.ok) {
        setProblem(`${season.label} was not deleted. ${CONNECTION}`);
        setBusy(null);
        router.refresh();
        return;
      }
    }
    setBusy(null);
    setStep("closed");
    setStatus(`${season.label} was deleted.`);
    router.replace("/admin/seasons");
    router.refresh();
  }

  const viewingPast = viewed !== null && shown !== null && viewed.id !== shown.id;
  const viewingUnshown = viewed !== null && !viewed.active;
  const askSub = shown
    ? `Until you switch, your website keeps showing ${shown.label}.`
    : "Your website has no season to show yet.";

  return (
    <div className={styles.page} data-admin-page="seasons">
      {ready && canChange ? (
        <div className={styles.banner} data-testid="season-ready-note">
          <span className={styles.bannerIcon}>
            <IconSchedule className="size-5" aria-hidden="true" />
          </span>
          <p className={styles.bannerText}>
            <b>
              <span className={styles.bannerName} title={ready.label}>{ready.label}</span>
              <span className={styles.bannerReady}> is ready</span>
            </b>
            <span className={styles.bannerLine}> · Show it on your website</span>
          </p>
          <button
            type="button"
            className={styles.bannerButton}
            disabled={busy !== null}
            onClick={() => void switchTo(ready)}
          >
            {busy === "show" ? <Spinner className="size-4" /> : null}
            Show it
          </button>
        </div>
      ) : null}

      <header className={styles.head}>
        <div className={styles.titles}>
          <h1 className={styles.title}>This season</h1>
          <p className={styles.sub}>
            {first
              ? "The season your website shows."
              : viewingPast || (viewingUnshown && viewed)
                ? `You’re looking at ${viewed!.label}. ${shown ? `Your website shows ${shown.label}.` : "Your website shows no season yet."}`
                : "The season your website shows."}
          </p>
        </div>
        {viewed ? <SeasonSwitcher seasons={seasons} viewed={viewed} /> : null}
      </header>

      {status ? (
        <p className={styles.status} role="status" data-testid="seasons-status">
          <IconCheck className="size-4" aria-hidden="true" />
          {status}
        </p>
      ) : null}
      {pageError ? (
        <p className={styles.alert} role="alert">
          <IconWarning className="size-4" aria-hidden="true" />
          {pageError}
        </p>
      ) : null}

      {first ? (
        <section className={styles.empty} aria-labelledby="seasons-empty-title" data-testid="seasons-empty">
          <span className={styles.emptyIcon}>
            <IconSchedule className="size-6" aria-hidden="true" />
          </span>
          <h2 id="seasons-empty-title" className={styles.emptyTitle}>No seasons yet</h2>
          <p className={styles.emptyText}>
            Start your first season to add games and player numbers. Your website shows the season you choose.
          </p>
          {canChange ? (
            <button type="button" className={styles.primary} onClick={openStart}>
              <IconAdd className="size-4" aria-hidden="true" />
              Start your first season
            </button>
          ) : (
            <p className={styles.quietNote}>Starting a season is paused while changes to your website are paused.</p>
          )}
        </section>
      ) : viewed ? (
        <>
          <div className={styles.cards}>
            <HubCard
              icon={<IconStandings className="size-6" aria-hidden="true" />}
              label="League table"
              main={
                data.league
                  ? `You’re ${ordinal(data.league.rank)} of ${numbers.format(data.league.of)} · ${numbers.format(data.league.points)} ${noun(data.league.points, "point", "points")}`
                  : "No league table yet"
              }
              note="One table for every season"
              button="Update the table"
              href={links.league}
            />
            <HubCard
              icon={<IconRoster className="size-6" aria-hidden="true" />}
              label="Player totals"
              main={
                data.players === 0
                  ? "No player totals yet"
                  : `${numbers.format(data.players)} ${noun(data.players, "player", "players")} this season`
              }
              button="See totals"
              href={links.totals}
            />
            <HubCard
              icon={<IconSchedule className="size-6" aria-hidden="true" />}
              label="Games"
              main={
                data.gamesTotal === 0
                  ? "No games yet"
                  : `${numbers.format(data.gamesPlayed)} played so far`
              }
              note={
                data.gamesTotal > data.gamesPlayed
                  ? `${numbers.format(data.gamesTotal - data.gamesPlayed)} still to play`
                  : undefined
              }
              button="See games"
              href={links.games}
            />
          </div>

          {viewingUnshown && canChange ? (
            <div className={styles.switchRow}>
              <p className={styles.footLine}>{viewed.label} is not on your website.</p>
              <button
                type="button"
                className={styles.tonal}
                disabled={busy !== null}
                onClick={() => void switchTo(viewed)}
              >
                {busy === "show" ? <Spinner className="size-4" /> : null}
                Show it on your website
              </button>
            </div>
          ) : null}

          {canChange ? (
            <div className={styles.foot}>
              <div className={styles.footText}>
                {ready ? (
                  <>
                    <p className={styles.footTitle} title={ready.label}>{ready.label} has been started</p>
                    <p className={styles.footLine}>Player totals are at zero. It is not on your website yet.</p>
                  </>
                ) : (
                  <>
                    <p className={styles.footTitle}>Next season</p>
                    <p className={styles.footLine}>Starts with player totals at zero. {viewed.label} is kept.</p>
                  </>
                )}
              </div>
              {ready ? (
                <span className={styles.started}>
                  <IconCheck className="size-4" aria-hidden="true" />
                  Started
                </span>
              ) : (
                <button type="button" className={styles.ghost} onClick={openStart}>
                  <IconAdd className="size-4" aria-hidden="true" />
                  Start next season
                </button>
              )}
            </div>
          ) : (
            <p className={styles.quietNote}>Starting and switching seasons is paused while changes to your website are paused.</p>
          )}

          {canChange && data.deleteVerdict?.deletable ? (
            <div className={styles.deleteRow}>
              <p className={styles.footLine}>{viewed.label} has no games and no player numbers.</p>
              <button
                type="button"
                className={styles.danger}
                onClick={() => {
                  setProblem(null);
                  setStep("delete");
                }}
              >
                <IconDelete className="size-4" aria-hidden="true" />
                Delete this season
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      <AdminModal
        open={step === "start"}
        onClose={closeDialog}
        aria-labelledby="start-season-title"
        initialFocus={nameRef}
        backdropClassName={styles.scrim}
        className={styles.dialog}
      >
        <h2 id="start-season-title" className={styles.dialogTitle}>
          {first ? "Start your first season?" : "Start next season?"}
        </h2>
        <div className={styles.nameBlock} data-error={nameProblem ? "" : undefined}>
          <label htmlFor={nameId} className={styles.nameLabel}>Season name</label>
          <input
            ref={nameRef}
            id={nameId}
            className={styles.nameInput}
            value={name}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={nameProblem ? true : undefined}
            aria-describedby={hintId}
            onChange={(event) => {
              setName(event.target.value);
              setProblem(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void startSeason();
              }
            }}
          />
          <div className={styles.nameMeta}>
            <p id={hintId} className={nameProblem || problem ? styles.hintError : styles.hint} role={nameProblem || problem ? "alert" : undefined}>
              <IconEdit className="size-4" aria-hidden="true" />
              <span>
                {problem ??
                  nameProblemText ??
                  (first ? "Suggested from this year. Change it if you like." : `Suggested from ${seasons[0]?.label ?? ""}. Change it if you like.`)}
              </span>
            </p>
            <span className={styles.counter} data-over={count > SEASON_NAME_MAX ? "" : undefined} aria-hidden="true">
              {count} / {SEASON_NAME_MAX}
            </span>
          </div>
        </div>
        <ul className={styles.ticks}>
          <li><span className={styles.tick}><IconCheck className="size-3.5" aria-hidden="true" /></span>Player totals start at zero for every active player</li>
          {shown ? <li><span className={styles.tick}><IconCheck className="size-3.5" aria-hidden="true" /></span><span className={styles.tickText}>{shown.label} is kept and can still be corrected</span></li> : null}
        </ul>
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={closeDialog} disabled={busy !== null}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.go}
            disabled={busy !== null || nameProblem !== null}
            onClick={() => void startSeason()}
          >
            {busy === "start" ? (
              <>
                <Spinner className="size-4" />
                Starting…
              </>
            ) : (
              "Start season"
            )}
          </button>
        </div>
      </AdminModal>

      <AdminModal
        open={step === "ask"}
        onClose={() => {
          if (busy) return;
          setStep("closed");
        }}
        aria-labelledby="show-season-title"
        backdropClassName={styles.scrim}
        className={styles.dialog}
      >
        <h2 id="show-season-title" className={styles.dialogTitle}>
          Show {created?.label ?? "it"} on your website now?
        </h2>
        <p className={styles.dialogSub}>{askSub}</p>
        {created?.warning ? (
          <p className={styles.hintError} role="alert">
            <IconWarning className="size-4" aria-hidden="true" />
            <span>{created.warning}</span>
          </p>
        ) : null}
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={() => setStep("closed")} disabled={busy !== null}>
            Not yet
          </button>
          <button
            type="button"
            className={styles.go}
            disabled={busy !== null || !created}
            onClick={() => created && void switchTo(created)}
          >
            {busy === "show" ? (
              <>
                <Spinner className="size-4" />
                Switching…
              </>
            ) : (
              "Yes, switch"
            )}
          </button>
        </div>
      </AdminModal>

      <AdminModal
        open={step === "delete"}
        onClose={() => {
          if (busy) return;
          setStep("closed");
        }}
        aria-labelledby="delete-season-title"
        backdropClassName={styles.scrim}
        className={styles.dialog}
      >
        <h2 id="delete-season-title" className={styles.dialogTitle}>
          Delete {viewed?.label ?? "this season"}?
        </h2>
        <p className={styles.dialogSub}>It has no games and no player numbers. This can’t be undone.</p>
        {problem ? (
          <p className={styles.hintError} role="alert">
            <IconWarning className="size-4" aria-hidden="true" />
            <span>{problem}</span>
          </p>
        ) : null}
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={() => setStep("closed")} disabled={busy !== null}>
            Keep it
          </button>
          <button
            type="button"
            className={styles.goDanger}
            disabled={busy !== null}
            onClick={() => viewed && void deleteViewed(viewed)}
          >
            {busy === "delete" ? (
              <>
                <Spinner className="size-4" />
                Deleting…
              </>
            ) : (
              "Delete season"
            )}
          </button>
        </div>
      </AdminModal>
    </div>
  );
}

function HubCard({
  icon,
  label,
  main,
  note,
  button,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  main: string;
  note?: string;
  button: string;
  href: string | null;
}) {
  return (
    <div className={styles.card}>
      <span className={styles.cardHead}>
        <span className={styles.cardIcon}>{icon}</span>
        <span className={styles.cardLabel}>{label}</span>
      </span>
      <span className={styles.cardText}>
        <span className={styles.cardMain}>{main}</span>
        <span className={styles.cardNote}>{note ?? " "}</span>
      </span>
      {href ? (
        <Link href={href} className={styles.tonal}>
          {button}
        </Link>
      ) : null}
    </div>
  );
}

/** The quiet past-season switcher: a pill that is a plain label with one season, a menu with more. */
function SeasonSwitcher({ seasons, viewed }: { seasons: readonly HubSeason[]; viewed: HubSeason }) {
  const router = useRouter();
  if (seasons.length < 2) {
    return (
      <span className={styles.switch} title={viewed.label} data-testid="season-switcher-static">
        <span className={styles.switchText}>{viewed.label}</span>
      </span>
    );
  }
  return (
    <label className={styles.switch} data-testid="season-switcher">
      <span className="sr-only">Season</span>
      <select
        className={styles.switchSelect}
        value={viewed.id}
        title={viewed.label}
        onChange={(event) => router.push(`/admin/seasons?season=${event.target.value}`)}
      >
        {seasons.map((season) => (
          <option key={season.id} value={season.id}>
            {season.label}
            {season.active ? " · on your website" : ""}
          </option>
        ))}
      </select>
      <IconCaretDown className={styles.switchCaret} aria-hidden="true" />
    </label>
  );
}

/**
 * A new season starts with every active player's totals at zero. Returns a
 * plain-words warning when some rows could not be made, or null.
 */
async function seedTotals(seasonId: string): Promise<string | null> {
  const players = await adminData({
    table: "players",
    operation: "select",
    columns: "id,position",
    filters: [{ kind: "eq", column: "active", value: true }],
    limit: 1000,
  });
  const warning = "Some player totals could not be set up. Open Player totals to check them.";
  if (!players.ok || !Array.isArray(players.data)) return warning;
  const rows = players.data as { id: string; position: string }[];
  const field = rows.filter((player) => player.position !== "Goalkeeper");
  const keepers = rows.filter((player) => player.position === "Goalkeeper");
  const batches: Record<string, unknown>[] = [];
  for (let i = 0; i < field.length; i += SEED_BATCH) {
    batches.push({
      table: "player_season_stats",
      operation: "insert",
      columns: "player_id",
      payload: field.slice(i, i + SEED_BATCH).map((player) => ({ player_id: player.id, season_id: seasonId, ...ZERO_FIELD })),
    });
  }
  for (let i = 0; i < keepers.length; i += SEED_BATCH) {
    batches.push({
      table: "goalkeeper_season_stats",
      operation: "insert",
      columns: "player_id",
      payload: keepers.slice(i, i + SEED_BATCH).map((player) => ({ player_id: player.id, season_id: seasonId, ...ZERO_KEEPER })),
    });
  }
  const results = await Promise.all(batches.map((request) => adminData(request)));
  return results.every((result) => result.ok) ? null : warning;
}
