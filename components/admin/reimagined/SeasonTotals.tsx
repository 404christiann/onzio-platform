"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { AdminModal } from "@/components/admin/AdminModal";
import { ChevronRight, IconAdd, IconRemove, IconSuccess } from "@/components/admin/icons";
import { NumberStepper } from "@/components/ui/number-stepper";
import type { TotalsPlayer, TotalsSeason } from "@/lib/admin-season-totals-data";
import { GROUP_LABELS, GROUP_ORDER } from "@/lib/player-numbers";
import { SEASON_ADJUSTMENT_LIMIT, type TotalKey } from "@/lib/season-totals";
import { TopBarTitle } from "./TopBar";
import styles from "./season-totals.module.css";

// ADMIN-RE-11c-2: Season totals (design cd-season-totals; decision 0001, group 1
// decision 3). Every number is the season's player numbers added up, so no cell
// is a field. "Adjust" adds numbers for games that were never entered game by
// game; the row then says "5 from games · 2 added by hand". An adjustment may be
// negative down to what the games give, so a total never goes below 0 (the
// database refuses it too). Saving goes through POST /api/admin/data.

type Column = { key: TotalKey; label: string; short: string };

const FIELD_COLUMNS: readonly Column[] = [
  { key: "goals", label: "Goals", short: "Goals" },
  { key: "assists", label: "Assists", short: "Assists" },
  { key: "yellow", label: "Yellow cards", short: "Yellow" },
  { key: "red", label: "Red cards", short: "Red" },
  { key: "mins", label: "Minutes", short: "Mins" },
];

const KEEPER_COLUMNS: readonly Column[] = [
  { key: "saves", label: "Saves", short: "Saves" },
  { key: "goals_against", label: "Goals let in", short: "Let in" },
  { key: "clean_sheets", label: "Clean sheets", short: "Clean" },
  { key: "mins", label: "Minutes", short: "Mins" },
];

const FIELD_MORE: readonly Column[] = [
  { key: "starts", label: "Starts", short: "Starts" },
  { key: "mins", label: "Minutes", short: "Mins" },
  { key: "tackles", label: "Tackles", short: "Tackles" },
  { key: "offsides", label: "Offsides", short: "Offsides" },
  { key: "fouls", label: "Fouls", short: "Fouls" },
  { key: "fouls_suffered", label: "Fouled", short: "Fouled" },
];

const KEEPER_MORE: readonly Column[] = [
  { key: "starts", label: "Starts", short: "Starts" },
  { key: "mins", label: "Minutes", short: "Mins" },
  { key: "yellow", label: "Yellow cards", short: "Yellow" },
  { key: "red", label: "Red cards", short: "Red" },
];

const FIELD_UP_FRONT: readonly Column[] = FIELD_COLUMNS.filter((column) => column.key !== "mins");
const KEEPER_UP_FRONT: readonly Column[] = KEEPER_COLUMNS.filter((column) => column.key !== "mins");

const format = new Intl.NumberFormat("en-US");

function value(numbers: object, key: TotalKey): number {
  return (numbers as Record<string, number>)[key] ?? 0;
}

function noun(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** "5 from games · 2 added by hand" for every number with a part added by hand. */
export function handLines(player: TotalsPlayer): string[] {
  const columns = player.keeper ? [...KEEPER_COLUMNS, ...KEEPER_MORE] : [...FIELD_COLUMNS, ...FIELD_MORE];
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const column of columns) {
    if (seen.has(column.key)) continue;
    seen.add(column.key);
    const hand = value(player.added, column.key);
    if (hand === 0) continue;
    const games = value(player.fromGames, column.key);
    const handText = hand > 0 ? `${format.format(hand)} added by hand` : `${format.format(-hand)} taken off by hand`;
    lines.push(`${column.label}: ${format.format(games)} from games · ${handText}`);
  }
  return lines;
}

export function SeasonTotals({
  season,
  players,
  gamesEntered,
  canSave,
  savedText,
  backHref,
}: {
  season: TotalsSeason;
  players: TotalsPlayer[];
  gamesEntered: number;
  canSave: boolean;
  savedText: string;
  backHref: string;
}) {
  const [open, setOpen] = useState<TotalsPlayer | null>(null);
  const [savedFor, setSavedFor] = useState<string | null>(null);

  return (
    <div className={styles.page} data-admin-page="season-totals">
      <TopBarTitle title="Season totals" />
      <header className={styles.head}>
        <Link href={backHref} className={styles.backLink}>
          Back to This season
        </Link>
        <h1 className={styles.title}>Season totals</h1>
        <p className={styles.sub}>
          <span className={styles.season} title={season.label}>
            {season.label}
          </span>
          {season.active ? null : <span className={styles.offSite}>Not on your website</span>}
        </p>
        <p className={styles.lead}>
          Added up from {format.format(gamesEntered)} {noun(gamesEntered, "game’s", "games’")} player numbers. Use
          Adjust for games that aren’t in Onzio.
        </p>
      </header>

      {savedFor ? (
        <p className={styles.saved} role="status" data-testid="totals-saved">
          <IconSuccess className="size-5" aria-hidden="true" />
          {savedText}
        </p>
      ) : null}
      {!canSave ? (
        <p className={styles.notice}>Changes to your website are paused right now, so totals can’t be adjusted.</p>
      ) : null}

      {players.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No players in {season.label} yet</p>
          <p className={styles.emptyText}>Players added to the season show up here with their totals.</p>
        </div>
      ) : (
        GROUP_ORDER.map((group) => {
          const members = players.filter((player) => player.group === group);
          if (members.length === 0) return null;
          const columns = group === "gk" ? KEEPER_COLUMNS : FIELD_COLUMNS;
          return (
            <section key={group} className={styles.group} aria-labelledby={`totals-${group}`}>
              <h2 id={`totals-${group}`} className={styles.groupHead}>
                {GROUP_LABELS[group]} · {format.format(members.length)}
              </h2>
              <div className={styles.table} role="table" aria-labelledby={`totals-${group}`}>
                <div className={styles.headRow} role="row" data-keeper={group === "gk" || undefined}>
                  <span role="columnheader">Player</span>
                  <span role="columnheader">Played</span>
                  {columns.map((column) => (
                    <span key={column.key} role="columnheader" title={column.label}>
                      {column.short}
                    </span>
                  ))}
                  <span role="columnheader" className={styles.srOnly}>
                    Adjust
                  </span>
                </div>
                {members.map((player) => (
                  <TotalsRow
                    key={player.id}
                    player={player}
                    columns={columns}
                    canSave={canSave}
                    onAdjust={() => {
                      setSavedFor(null);
                      setOpen(player);
                    }}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}

      {open ? (
        <AdjustSheet
          key={open.id}
          player={open}
          seasonId={season.id}
          gamesEntered={gamesEntered}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setSavedFor(open.id);
            setOpen(null);
          }}
        />
      ) : null}
    </div>
  );
}

function TotalsRow({
  player,
  columns,
  canSave,
  onAdjust,
}: {
  player: TotalsPlayer;
  columns: readonly Column[];
  canSave: boolean;
  onAdjust: () => void;
}) {
  const lines = handLines(player);
  return (
    <div className={styles.row} role="row" data-keeper={player.keeper || undefined} data-player={player.id}>
      <span className={styles.who} role="cell">
        {player.number !== null ? <span className={styles.shirt}>#{player.number}</span> : null}
        <span className={styles.name} title={player.name}>
          {player.name}
        </span>
      </span>
      <span className={styles.cell} role="cell">
        <span className={styles.cellLabel}>Played</span>
        <span className={styles.cellValue}>{format.format(player.gamesPlayed)}</span>
      </span>
      {columns.map((column) => (
        <span key={column.key} className={styles.cell} role="cell" data-hand={value(player.added, column.key) !== 0 || undefined}>
          <span className={styles.cellLabel}>{column.short}</span>
          <span className={styles.cellValue} data-testid={`total-${column.key}`}>
            {format.format(value(player.total, column.key))}
          </span>
        </span>
      ))}
      <span className={styles.adjustCell} role="cell">
        <button
          type="button"
          className={styles.adjust}
          disabled={!canSave}
          onClick={onAdjust}
          aria-label={`Adjust ${player.name}`}
        >
          Adjust
        </button>
      </span>
      {lines.length ? (
        <span className={styles.hand} role="cell" data-testid="hand-lines">
          {lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
      ) : null}
    </div>
  );
}

function AdjustSheet({
  player,
  seasonId,
  gamesEntered,
  onClose,
  onSaved,
}: {
  player: TotalsPlayer;
  seasonId: string;
  gamesEntered: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [added, setAdded] = useState<Record<string, number>>({ ...(player.added as Record<string, number>) });
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const titleId = useId();
  const moreId = useId();
  const upFront = player.keeper ? KEEPER_UP_FRONT : FIELD_UP_FRONT;
  const moreColumns = player.keeper ? KEEPER_MORE : FIELD_MORE;
  const changed = Object.keys(added).some((key) => added[key] !== value(player.added, key as TotalKey));

  async function save() {
    if (busy || !changed) return;
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch("/api/admin/data", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          table: player.keeper ? "goalkeeper_season_adjustments" : "player_season_adjustments",
          operation: "upsert",
          onConflict: "player_id,season_id",
          columns: "player_id",
          payload: [{ player_id: player.id, season_id: seasonId, ...added }],
        }),
      });
      const body = (await response.json().catch(() => null)) as { data?: unknown } | null;
      if (!response.ok || !Array.isArray(body?.data) || body.data.length !== 1) {
        setProblem("The numbers weren’t saved. Check your connection and try again.");
        setBusy(false);
        return;
      }
      router.refresh();
      onSaved();
    } catch {
      setProblem("The numbers weren’t saved. Check your connection and try again.");
      setBusy(false);
    }
  }

  const stepper = (column: Column) => {
    const games = value(player.fromGames, column.key);
    const current = added[column.key] ?? 0;
    const word = column.label.toLowerCase();
    return (
      <div key={column.key} className={styles.step} role="group" aria-label={`${column.label} added by hand`}>
        <span className={styles.stepLabel}>{column.label}</span>
        <NumberStepper
          className={styles.stepper}
          value={current}
          // A total never goes below 0: take off at most what the games give.
          min={Math.max(-SEASON_ADJUSTMENT_LIMIT, -games)}
          max={SEASON_ADJUSTMENT_LIMIT}
          disabled={busy}
          onChange={(next) => setAdded((prev) => ({ ...prev, [column.key]: next }))}
          aria-label={`${column.label} added by hand for ${player.name}`}
          decrementLabel={`Take one from ${word} for ${player.name}`}
          incrementLabel={`Add one to ${word} for ${player.name}`}
          decrementIcon={<IconRemove className="size-5" aria-hidden="true" />}
          incrementIcon={<IconAdd className="size-5" aria-hidden="true" />}
        />
        <span className={styles.stepNote}>
          Total {format.format(games + current)} · {format.format(games)} from games
        </span>
      </div>
    );
  };

  return (
    <AdminModal
      open
      onClose={onClose}
      className={styles.sheet}
      backdropClassName={styles.backdrop}
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className={styles.sheetTitle}>
        Add numbers for games that aren’t in Onzio
      </h2>
      <p className={styles.sheetWho} title={player.name}>
        {player.number !== null ? `#${player.number} ` : ""}
        {player.name}
      </p>
      <p className={styles.sheetText}>
        These add on top of the {format.format(gamesEntered)} {noun(gamesEntered, "game", "games")} you entered.
      </p>
      <div className={styles.steps}>{upFront.map(stepper)}</div>
      <button
        type="button"
        className={styles.moreButton}
        aria-expanded={more}
        aria-controls={moreId}
        onClick={() => setMore((value) => !value)}
      >
        More numbers
        <ChevronRight className={styles.moreCaret} data-open={more || undefined} aria-hidden="true" />
      </button>
      {more ? (
        <div id={moreId} className={styles.steps}>
          {moreColumns.map(stepper)}
        </div>
      ) : null}
      {problem ? (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      ) : null}
      <div className={styles.sheetActions}>
        <button type="button" className={styles.primary} disabled={busy || !changed} onClick={() => void save()}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className={styles.secondary} disabled={busy} onClick={onClose}>
          Cancel
        </button>
      </div>
    </AdminModal>
  );
}
