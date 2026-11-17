import { formatClubDate } from "@/lib/club-time";
import type { FieldStats, GoalkeeperStats } from "@/lib/data";

// ADMIN-RE-19: the pure part of "How the team is doing" (design: cd-analytics-a,
// the season game by game, and cd-analytics-b, one player at a time). Counting,
// scaling and wording only: no React and no data access, so every rule here can
// be checked against the design's own numbers. The page loads the same stored
// scores and player numbers the classic Analytics page reads.

const numberFormat = new Intl.NumberFormat("en-US");

/** 1204 -> "1,204". Anything that is not a finite number reads as 0. */
export function formatCount(value: number): string {
  return numberFormat.format(Number.isFinite(value) ? value : 0);
}

function plural(count: number, one: string, many: string): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}

export const goalsWords = (count: number) => plural(count, "goal", "goals");
export const assistsWords = (count: number) => plural(count, "assist", "assists");

// ── The season, game by game ─────────────────────────────────────────────────

/** A game with both scores entered. `date` is a plain "YYYY-MM-DD". */
export type ResultGame = {
  id: string;
  date: string;
  opponent: string;
  /** Goals our team scored. */
  us: number;
  /** Goals let in. */
  them: number;
};

export type GameResult = "won" | "drew" | "lost";

export function gameResult(game: Pick<ResultGame, "us" | "them">): GameResult {
  if (game.us > game.them) return "won";
  if (game.us < game.them) return "lost";
  return "drew";
}

const RESULT_WORDS: Record<GameResult, string> = { won: "Won", drew: "Drew", lost: "Lost" };
export const resultWord = (result: GameResult) => RESULT_WORDS[result];

/** "4–2", with an en dash. */
export function scoreLine(game: Pick<ResultGame, "us" | "them">): string {
  return `${formatCount(game.us)}–${formatCount(game.them)}`;
}

function oldestFirst<T extends Pick<ResultGame, "date" | "id">>(games: readonly T[]): T[] {
  return [...games].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export type SeasonRecord = {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  scored: number;
  letIn: number;
  /** Games in a row, up to the latest, without a loss. */
  unbeaten: number;
};

export function seasonRecord(games: readonly ResultGame[]): SeasonRecord {
  const record: SeasonRecord = { played: 0, won: 0, drawn: 0, lost: 0, scored: 0, letIn: 0, unbeaten: 0 };
  for (const game of oldestFirst(games)) {
    const result = gameResult(game);
    record.played += 1;
    record.scored += game.us;
    record.letIn += game.them;
    if (result === "won") record.won += 1;
    else if (result === "drew") record.drawn += 1;
    else record.lost += 1;
    record.unbeaten = result === "lost" ? 0 : record.unbeaten + 1;
  }
  return record;
}

/** "8 won · 3 drawn · 1 lost" */
export function recordLine(record: Pick<SeasonRecord, "won" | "drawn" | "lost">): string {
  return `${formatCount(record.won)} won · ${formatCount(record.drawn)} drawn · ${formatCount(record.lost)} lost`;
}

/** Shown from three games on, so a first win is not called a streak. */
const UNBEATEN_FROM = 3;

export function unbeatenLine(record: Pick<SeasonRecord, "played" | "unbeaten">): string {
  if (record.unbeaten < UNBEATEN_FROM) return "";
  if (record.unbeaten === record.played) return `Unbeaten in all ${formatCount(record.played)} games`;
  return `Unbeaten in the last ${formatCount(record.unbeaten)} games`;
}

/** The last `count` games, oldest first, so the chart reads left to right in time. */
export function chartGames(games: readonly ResultGame[], count: number): ResultGame[] {
  return oldestFirst(games).slice(-Math.max(0, count));
}

/** Room for the bars: scored rises above the line, let in hangs below it. */
export const BAR_ROOM = { up: 80, down: 40 } as const;
const BAR_UNIT = 20;

/**
 * Pixels per goal. The design's 20px while the tallest bar fits its room,
 * smaller when a score is so high it would not, so no bar leaves the chart.
 */
export function barScale(games: readonly Pick<ResultGame, "us" | "them">[]): number {
  const mostFor = Math.max(0, ...games.map((game) => game.us));
  const mostAgainst = Math.max(0, ...games.map((game) => game.them));
  return Math.min(
    BAR_UNIT,
    mostFor > 0 ? BAR_ROOM.up / mostFor : BAR_UNIT,
    mostAgainst > 0 ? BAR_ROOM.down / mostAgainst : BAR_UNIT,
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthOf(date: string): string {
  const match = /^\d{4}-(\d{2})-\d{2}$/.exec(date);
  return (match && MONTHS[Number(match[1]) - 1]) || "";
}

/**
 * The words under each column. Wide: the month's name under its first game.
 * Narrow (phone): the first and the last date only.
 */
export function monthLabels(games: readonly ResultGame[], layout: "wide" | "narrow"): string[] {
  return games.map((game, index) => {
    if (layout === "narrow") {
      return index === 0 || index === games.length - 1 ? (formatClubDate(game.date, "short") ?? "") : "";
    }
    const month = monthOf(game.date);
    return index === 0 || monthOf(games[index - 1]!.date) !== month ? month : "";
  });
}

// ── One player ───────────────────────────────────────────────────────────────

/** What a player did in one game, in words. Keepers add saves and goals let in. */
export function didWords(row: { goals: number; assists: number; saves?: number; goalsAgainst?: number }): string {
  const parts: string[] = [];
  if (row.goals > 0) parts.push(goalsWords(row.goals));
  if (row.assists > 0) parts.push(assistsWords(row.assists));
  if ((row.saves ?? 0) > 0) parts.push(plural(row.saves!, "save", "saves"));
  if ((row.goalsAgainst ?? 0) > 0) parts.push(`${formatCount(row.goalsAgainst!)} let in`);
  return parts.join(", ") || "–";
}

/** Minutes out of 90 as 0–1. Extra time or bad data stops at the end of the track. */
export function minutesFraction(mins: number): number {
  if (!Number.isFinite(mins) || mins <= 0) return 0;
  return Math.min(1, mins / 90);
}

/** "Played 11 of 12 games". The team's total never reads lower than the player's own. */
export function playedLine(played: number, teamGames: number): string {
  const total = Math.max(played, teamGames);
  if (total === 0) return "No games played yet";
  return `Played ${formatCount(played)} of ${formatCount(total)} ${total === 1 ? "game" : "games"}`;
}

export type RadarAxis = {
  label: string;
  value: number;
  /** The number as people read it ("1,204"). */
  text: string;
  /** 0–1: the player's number against the best on the team in their position. */
  ratio: number;
};

function axis(label: string, value: number, best: number): RadarAxis {
  const safe = Number.isFinite(value) && value > 0 ? value : 0;
  return {
    label,
    value: safe,
    text: formatCount(safe),
    // A team with no numbers has a best of 0: sit at the centre rather than divide by it.
    ratio: best > 0 ? Math.min(1, safe / best) : 0,
  };
}

const bestOf = (values: number[]) => Math.max(0, ...values.filter((value) => Number.isFinite(value)));

/**
 * The six corners, clockwise from the top: attacking on the top and right, work
 * on the left. A corner reaches the edge where the player is the best of their
 * position on the team.
 */
export function fieldRadar(player: FieldStats, cohort: readonly FieldStats[]): RadarAxis[] {
  const all = [...cohort, player];
  const corner = (label: string, pick: (stats: FieldStats) => number) =>
    axis(label, pick(player), bestOf(all.map(pick)));
  return [
    corner("Goals", (s) => s.goals),
    corner("Assists", (s) => s.assists),
    corner("Fouls won", (s) => s.foulsSuffered),
    corner("Tackles", (s) => s.tackles),
    corner("Minutes", (s) => s.mins),
    corner("Starts", (s) => s.starts),
  ];
}

/** Keepers get four corners: what a keeper does, against the team's best keeper. */
export function keeperRadar(player: GoalkeeperStats, cohort: readonly GoalkeeperStats[]): RadarAxis[] {
  const all = [...cohort, player];
  const corner = (label: string, pick: (stats: GoalkeeperStats) => number) =>
    axis(label, pick(player), bestOf(all.map(pick)));
  return [
    corner("Saves", (s) => s.saves),
    corner("Clean sheets", (s) => s.cleanSheets),
    corner("Starts", (s) => s.starts),
    corner("Minutes", (s) => s.mins),
  ];
}

/** The chart in words, for a screen reader: "Goals 11, Assists 4, …". */
export function radarSummary(axes: readonly RadarAxis[]): string {
  return axes.map((a) => `${a.label} ${a.text}`).join(", ");
}

/** Smallest radius of the shape, so a player with no numbers still shows a dot of shape. */
export const RADAR_FLOOR = 0.08;

/**
 * Where each corner sits on a 100 × 100 chart: the first at the top, then
 * clockwise. `floor` keeps a ratio of 0 off the exact centre.
 */
export function radarPoints(ratios: readonly number[], floor: number): { x: number; y: number }[] {
  const count = ratios.length;
  return ratios.map((ratio, index) => {
    const safe = Number.isFinite(ratio) ? Math.min(1, Math.max(floor, ratio)) : floor;
    const angle = ((-90 + (360 / count) * index) * Math.PI) / 180;
    return { x: 50 + Math.cos(angle) * 50 * safe, y: 50 + Math.sin(angle) * 50 * safe };
  });
}

const letterSegmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
const LETTER_OR_NUMBER = /[\p{L}\p{N}]/u;

/** The first letter or number of a word, whole, skipping emoji and marks. */
function firstLetter(word: string): string {
  const characters = letterSegmenter ? [...letterSegmenter.segment(word)].map((part) => part.segment) : Array.from(word);
  return characters.find((character) => LETTER_OR_NUMBER.test(character)) ?? "";
}

/**
 * Letters for a player's avatar: the first letter of the first and last word
 * that have one. An emoji is never used (it would draw a broken initial);
 * a name with no letter at all gives "?".
 */
export function avatarInitials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .map(firstLetter)
    .filter(Boolean);
  if (letters.length === 0) return "?";
  const first = letters[0]!;
  return (letters.length === 1 ? first : `${first}${letters[letters.length - 1]}`).toUpperCase();
}
