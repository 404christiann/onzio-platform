import { STATS_POSITIONS, type StatsFieldGroup, type StatsPlayer } from "../types";
import {
  FIELD_TOTAL_KEYS,
  KEEPER_TOTAL_KEYS,
  adjustmentFor,
  adjustmentProblem,
  type FieldTotalKey,
  type KeeperTotalKey,
  type Numbers,
} from "@/lib/season-totals";
import type { SeasonGames, TypedTotals } from "@/lib/season-totals-save";

/**
 * Rose City's Stats editor: the pure pieces. The match save sends the rows the classic editor sent
 * (one row for every player, same keys in the same order) and the season save is the classic
 * `saveSeasonTotals`, so the payloads do not change.
 */

export type MatchFieldRow = {
  starts: boolean; mins: number; goals: number; assists: number; tackles: number;
  offsides: number; fouls: number; fouls_suffered: number; yellow: number; red: number;
};
export type MatchKeeperRow = {
  starts: boolean; mins: number; goals_against: number; saves: number; clean_sheets: number; yellow: number; red: number;
};
export type MatchRow = MatchFieldRow | MatchKeeperRow;
export type MatchRows = Record<string, MatchRow>;

export type SeasonFieldRow = {
  goals: number; assists: number; tackles: number; offsides: number; fouls: number; fouls_suffered: number;
  starts: number; yellow: number; red: number; mins: number;
};
export type SeasonKeeperRow = {
  goals_against: number; saves: number; clean_sheets: number; starts: number; yellow: number; red: number; mins: number;
};
export type SeasonRow = SeasonFieldRow | SeasonKeeperRow;
export type SeasonRows = Record<string, SeasonRow>;

export type StatsMode = "match" | "season";
export type StatsColumn = { key: string; label: string; abbr: string };

export const isKeeper = (player: StatsPlayer) => player.position === "Goalkeeper";
export const isKeeperRow = (row: MatchRow): row is MatchKeeperRow => "saves" in row;

export const defaultMatchRow = (player: StatsPlayer): MatchRow => isKeeper(player)
  ? { starts: false, mins: 0, goals_against: 0, saves: 0, clean_sheets: 0, yellow: 0, red: 0 }
  : { starts: false, mins: 0, goals: 0, assists: 0, tackles: 0, offsides: 0, fouls: 0, fouls_suffered: 0, yellow: 0, red: 0 };

export const defaultSeasonRow = (player: StatsPlayer): SeasonRow => isKeeper(player)
  ? { goals_against: 0, saves: 0, clean_sheets: 0, starts: 0, yellow: 0, red: 0, mins: 0 }
  : { goals: 0, assists: 0, tackles: 0, offsides: 0, fouls: 0, fouls_suffered: 0, starts: 0, yellow: 0, red: 0, mins: 0 };

type DataRow = Record<string, unknown>;

/** Every player starts from zeros; saved rows overlay them, field rows first and keepers after. Same coercions as the classic editor. */
export function matchRowsFromData(players: readonly StatsPlayer[], fieldData: readonly DataRow[], keeperData: readonly DataRow[]): MatchRows {
  const map: MatchRows = {};
  players.forEach((player) => { map[player.id] = defaultMatchRow(player); });
  fieldData.forEach((r) => {
    map[r.player_id as string] = {
      starts: Boolean(r.starts), mins: Number(r.mins), goals: Number(r.goals), assists: Number(r.assists), tackles: Number(r.tackles),
      offsides: Number(r.offsides ?? 0), fouls: Number(r.fouls ?? 0), fouls_suffered: Number(r.fouls_suffered ?? 0),
      yellow: Number(r.yellow), red: Number(r.red),
    };
  });
  keeperData.forEach((r) => {
    map[r.player_id as string] = {
      starts: Boolean(r.starts), mins: Number(r.mins), goals_against: Number(r.goals_against), saves: Number(r.saves),
      clean_sheets: Number(r.clean_sheets), yellow: Number(r.yellow), red: Number(r.red),
    };
  });
  return map;
}

/** The two upserts of a match save: a row for every player in the season, whether or not it changed. */
export function buildMatchSaveRows(players: readonly StatsPlayer[], stats: MatchRows, matchId: string) {
  const fieldRows: Record<string, unknown>[] = [];
  const keeperRows: Record<string, unknown>[] = [];
  players.forEach((player) => {
    const row = stats[player.id];
    if (!row) return;
    if (isKeeper(player) && isKeeperRow(row)) keeperRows.push({ player_id: player.id, match_id: matchId, ...row });
    else if (!isKeeperRow(row)) fieldRows.push({ player_id: player.id, match_id: matchId, ...row });
  });
  return { fieldRows, keeperRows };
}

export function seasonRowsFromData(players: readonly StatsPlayer[], fieldRows: readonly DataRow[], keeperRows: readonly DataRow[]): SeasonRows {
  const map: SeasonRows = {};
  players.forEach((player) => { map[player.id] = defaultSeasonRow(player); });
  fieldRows.forEach((r) => {
    map[r.player_id as string] = {
      goals: Number(r.goals), assists: Number(r.assists), tackles: Number(r.tackles), offsides: Number(r.offsides ?? 0),
      fouls: Number(r.fouls ?? 0), fouls_suffered: Number(r.fouls_suffered ?? 0), starts: Number(r.starts),
      yellow: Number(r.yellow), red: Number(r.red), mins: Number(r.mins),
    };
  });
  keeperRows.forEach((r) => {
    map[r.player_id as string] = {
      goals_against: Number(r.goals_against), saves: Number(r.saves), clean_sheets: Number(r.clean_sheets),
      starts: Number(r.starts), yellow: Number(r.yellow), red: Number(r.red), mins: Number(r.mins),
    };
  });
  return map;
}

/** What `saveSeasonTotals` is given: changed players as typed totals, and shown-but-unchanged players that still need a season row. */
export function seasonSaveInput(
  players: readonly StatsPlayer[],
  stats: SeasonRows,
  dirtyIds: ReadonlySet<string>,
  seasonRowIds: ReadonlySet<string>,
): { entries: TypedTotals[]; join: { playerId: string; keeper: boolean }[] } {
  return {
    entries: players.filter((p) => dirtyIds.has(p.id) && stats[p.id]).map((p) => ({
      playerId: p.id, name: p.name, keeper: isKeeper(p), typed: stats[p.id] as Record<string, number>, inSeason: seasonRowIds.has(p.id),
    })),
    join: players.filter((p) => !seasonRowIds.has(p.id) && !dirtyIds.has(p.id)).map((p) => ({ playerId: p.id, keeper: isKeeper(p) })),
  };
}

export const dirtyPlayers = (players: readonly StatsPlayer[], current: Record<string, object>, baseline: Record<string, object>) =>
  new Set(players.filter((p) => JSON.stringify(current[p.id]) !== JSON.stringify(baseline[p.id])).map((p) => p.id));

/** From the season's saved matches: how much of a typed total is added up, and how much was added by hand. */
export function seasonSplit(player: StatsPlayer, key: string, typed: number, games: SeasonGames | null) {
  const sums = isKeeper(player) ? games?.keepers.get(player.id) : games?.field.get(player.id);
  const fromMatches = (sums as Record<string, number> | undefined)?.[key] ?? 0;
  return { fromMatches, byHand: typed - fromMatches };
}

/** The classic save's own refusal for a typed total, so the dialog can say it before Apply. Null when it can save. */
export function seasonTotalsProblem(player: StatsPlayer, typed: Record<string, number>, games: SeasonGames | null): string | null {
  const adjustment = isKeeper(player)
    ? adjustmentFor(typed, games?.keepers.get(player.id), KEEPER_TOTAL_KEYS)
    : adjustmentFor(typed, games?.field.get(player.id), FIELD_TOTAL_KEYS);
  const problem = isKeeper(player)
    ? adjustmentProblem(adjustment as Numbers<KeeperTotalKey>, KEEPER_TOTAL_KEYS)
    : adjustmentProblem(adjustment as Numbers<FieldTotalKey>, FIELD_TOTAL_KEYS);
  return problem ? `${player.name}: ${problem}` : null;
}

const FIELD_COLUMNS: StatsColumn[] = [
  { key: "mins", label: "Minutes played", abbr: "Min" }, { key: "goals", label: "Goals", abbr: "G" }, { key: "assists", label: "Assists", abbr: "A" },
  { key: "tackles", label: "Tackles", abbr: "Tkl" }, { key: "offsides", label: "Offsides", abbr: "Off" }, { key: "fouls", label: "Fouls committed", abbr: "Fls" },
  { key: "fouls_suffered", label: "Fouls suffered", abbr: "FS" }, { key: "yellow", label: "Yellow cards", abbr: "Y" }, { key: "red", label: "Red cards", abbr: "R" },
];
const KEEPER_COLUMNS: StatsColumn[] = [
  { key: "mins", label: "Minutes played", abbr: "Min" }, { key: "goals_against", label: "Goals conceded", abbr: "GA" }, { key: "saves", label: "Saves", abbr: "Sv" },
  { key: "clean_sheets", label: "Clean sheets", abbr: "CS" }, { key: "yellow", label: "Yellow cards", abbr: "Y" }, { key: "red", label: "Red cards", abbr: "R" },
];

/** Table columns for one kind of player. "Started" leads in a match; "Starts" ends a season's totals. */
export function statsColumns(mode: StatsMode, keeper: boolean): StatsColumn[] {
  const rest = keeper ? KEEPER_COLUMNS : FIELD_COLUMNS;
  return mode === "match"
    ? [{ key: "starts", label: "Started the match", abbr: "St" }, ...rest]
    : [...rest, { key: "starts", label: "Starts", abbr: "St" }];
}

/** One line for the phone list: a player's most telling numbers. */
export function statsSummary(mode: StatsMode, player: StatsPlayer, row: Record<string, number | boolean> | undefined): string {
  const n = (key: string) => Number(row?.[key] ?? 0);
  const minutes = `${n("mins")} min`;
  const start = mode === "match" ? (row?.starts ? "Started · " : "") : "";
  return isKeeper(player)
    ? `${start}${minutes} · ${n("saves")} saves · ${n("goals_against")} conceded`
    : `${start}${minutes} · ${n("goals")} G · ${n("assists")} A · ${n("yellow")} Y`;
}

export const cellText = (mode: StatsMode, key: string, value: number | boolean | undefined): string =>
  key === "starts" && mode === "match" ? (value ? "Yes" : "–") : String(Number(value ?? 0));

const POSITION_ORDER = new Map<string, number>(STATS_POSITIONS.map((position, index) => [position, index]));
/** Field players first by position then shirt number, keepers apart. */
export function splitPlayers(players: readonly StatsPlayer[]) {
  const field = players.filter((p) => !isKeeper(p))
    .sort((a, b) => (POSITION_ORDER.get(a.position) ?? 0) - (POSITION_ORDER.get(b.position) ?? 0) || a.number - b.number);
  const keepers = players.filter(isKeeper).sort((a, b) => a.number - b.number);
  return { field, keepers };
}

/** The dialog's groups for one player: the classic editor's own labels and limits. */
export function statsFieldGroups(mode: StatsMode, player: StatsPlayer): StatsFieldGroup[] {
  const match = mode === "match";
  const time: StatsFieldGroup = { id: "time", label: "Playing time", fields: match ? [
    { key: "starts", label: "Started the match", ariaLabel: "started the match", kind: "boolean", hint: "In the starting lineup" },
    { key: "mins", label: "Minutes played", ariaLabel: "minutes", max: 300, hint: "0–300 minutes, including extra time" },
  ] : [
    { key: "starts", label: "Starts", ariaLabel: "starts", hint: "Matches started" },
    { key: "mins", label: "Minutes played", ariaLabel: "minutes", hint: "Total time on the pitch" },
  ] };
  const discipline: StatsFieldGroup = { id: "discipline", label: "Discipline", fields: [
    { key: "yellow", label: "Yellow cards", ariaLabel: "yellow cards" },
    { key: "red", label: "Red cards", ariaLabel: "red cards" },
  ] };
  if (isKeeper(player)) return [time, { id: "keeper", label: "Goalkeeping", fields: [
    { key: "goals_against", label: "Goals conceded", ariaLabel: "goals against", hint: "Goals allowed" },
    { key: "saves", label: "Saves", ariaLabel: "saves", hint: "Shots stopped" },
    { key: "clean_sheets", label: "Clean sheets", ariaLabel: "clean sheets", hint: match ? "Match with no goals conceded" : "Matches with no goals conceded" },
  ] }, discipline];
  return [time, { id: "attack", label: "Goals & assists", fields: [
    { key: "goals", label: "Goals", ariaLabel: "goals", hint: match ? "Scored this match" : "Scored this season" },
    { key: "assists", label: "Assists", ariaLabel: "assists", hint: "Goals you helped create" },
  ] }, { id: "defending", label: "Defending", fields: [
    { key: "tackles", label: "Tackles", ariaLabel: "tackles" },
    { key: "offsides", label: "Offsides", ariaLabel: "offsides" },
    { key: "fouls", label: "Fouls committed", ariaLabel: "fouls" },
    { key: "fouls_suffered", label: "Fouls suffered", ariaLabel: "fouls suffered", hint: "Fouls won by this player" },
  ] }, discipline];
}

/** Parse what was typed into a number box: whole, never below 0, never above the field's own limit. Empty reads as 0. */
export function parseCount(text: string, max?: number): number {
  const parsed = Math.trunc(Number(text));
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(max ?? Infinity, Math.max(0, parsed));
}
