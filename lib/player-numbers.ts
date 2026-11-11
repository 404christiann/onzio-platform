// ADMIN-RE-11c-2 (design cd-after-game; group 1 decisions 2, 6, 7): one game's
// player numbers, entered right after Enter a score. Up front: Played, Goals,
// Assists, Yellow, Red (keepers: Played, Saves, Goals let in). Minutes, starts,
// tackles, offsides, fouls, fouled and clean sheet wait under "More numbers".
// These numbers add up into the season totals (decision 0001,
// onzio.player_season_totals).

export const PLAYER_NUMBER_LIMITS = {
  /** Mirrors the match tables' CHECK (mins between 0 and 300). */
  mins: 300,
  /** No database ceiling; the steppers stop here so a slip of the thumb stays small. */
  count: 99,
} as const;

export const FIELD_NUMBER_KEYS = [
  "goals",
  "assists",
  "yellow",
  "red",
  "mins",
  "tackles",
  "offsides",
  "fouls",
  "fouls_suffered",
] as const;

export const KEEPER_NUMBER_KEYS = ["saves", "goals_against", "yellow", "red", "mins", "clean_sheets"] as const;

export type FieldNumberKey = (typeof FIELD_NUMBER_KEYS)[number];
export type KeeperNumberKey = (typeof KEEPER_NUMBER_KEYS)[number];

export type FieldNumbers = { played: boolean; starts: boolean } & Record<FieldNumberKey, number>;
export type KeeperNumbers = { played: boolean; starts: boolean } & Record<KeeperNumberKey, number>;

export type PlayerGroup = "gk" | "def" | "mid" | "fwd";

export const GROUP_LABELS: Record<PlayerGroup, string> = {
  gk: "Goalkeepers",
  def: "Defenders",
  mid: "Midfielders",
  fwd: "Forwards",
};

export const GROUP_ORDER: readonly PlayerGroup[] = ["gk", "def", "mid", "fwd"];

export type NumbersPlayer =
  | { id: string; name: string; number: number | null; group: PlayerGroup; keeper: false; numbers: FieldNumbers }
  | { id: string; name: string; number: number | null; group: PlayerGroup; keeper: true; numbers: KeeperNumbers };

export function emptyFieldNumbers(): FieldNumbers {
  return {
    played: false,
    starts: false,
    goals: 0,
    assists: 0,
    yellow: 0,
    red: 0,
    mins: 0,
    tackles: 0,
    offsides: 0,
    fouls: 0,
    fouls_suffered: 0,
  };
}

export function emptyKeeperNumbers(): KeeperNumbers {
  return { played: false, starts: false, saves: 0, goals_against: 0, yellow: 0, red: 0, mins: 0, clean_sheets: 0 };
}

export function groupFor(position: string | null | undefined, keeper: boolean): PlayerGroup {
  if (keeper) return "gk";
  switch ((position ?? "").trim().toLowerCase()) {
    case "goalkeeper":
      return "gk";
    case "defender":
      return "def";
    case "midfielder":
      return "mid";
    default:
      return "fwd";
  }
}

function count(value: unknown, max: number): number {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) ? Math.min(max, Math.max(0, number)) : 0;
}

/** A saved row (or nothing) as the numbers the list edits. */
export function fieldNumbersFrom(row: Record<string, unknown> | undefined): FieldNumbers {
  const numbers = emptyFieldNumbers();
  if (!row) return numbers;
  for (const key of FIELD_NUMBER_KEYS) {
    numbers[key] = count(row[key], key === "mins" ? PLAYER_NUMBER_LIMITS.mins : Number.MAX_SAFE_INTEGER);
  }
  numbers.starts = row.starts === true;
  numbers.played = row.played === true || hasFieldNumbers(numbers);
  return numbers;
}

export function keeperNumbersFrom(row: Record<string, unknown> | undefined): KeeperNumbers {
  const numbers = emptyKeeperNumbers();
  if (!row) return numbers;
  for (const key of KEEPER_NUMBER_KEYS) {
    numbers[key] = count(row[key], key === "mins" ? PLAYER_NUMBER_LIMITS.mins : Number.MAX_SAFE_INTEGER);
  }
  numbers.starts = row.starts === true;
  numbers.played = row.played === true || hasKeeperNumbers(numbers);
  return numbers;
}

export function hasFieldNumbers(numbers: FieldNumbers): boolean {
  return numbers.starts || FIELD_NUMBER_KEYS.some((key) => numbers[key] > 0);
}

export function hasKeeperNumbers(numbers: KeeperNumbers): boolean {
  return numbers.starts || KEEPER_NUMBER_KEYS.some((key) => numbers[key] > 0);
}

/**
 * Decision 7: any number marks the player as played; Played can also be set
 * on its own. Turning Played off clears the player's numbers, so the switch and
 * the row never disagree (the database also sets played from any number).
 */
export function setFieldNumber(
  numbers: FieldNumbers,
  key: "played" | "starts" | FieldNumberKey,
  value: number | boolean,
): FieldNumbers {
  if (key === "played") return value ? { ...numbers, played: true } : emptyFieldNumbers();
  const next = { ...numbers, [key]: value } as FieldNumbers;
  if (value === true || (typeof value === "number" && value > 0)) next.played = true;
  return next;
}

export function setKeeperNumber(
  numbers: KeeperNumbers,
  key: "played" | "starts" | KeeperNumberKey,
  value: number | boolean,
): KeeperNumbers {
  if (key === "played") return value ? { ...numbers, played: true } : emptyKeeperNumbers();
  const next = { ...numbers, [key]: value } as KeeperNumbers;
  if (value === true || (typeof value === "number" && value > 0)) next.played = true;
  return next;
}

export type GoalSummary = {
  /** Goals the list accounts for: scorers, plus the gap when "Own goal or not sure" is on. */
  added: number;
  /** The club's own score for the game. */
  of: number;
  /** More goals entered than the score. */
  over: boolean;
  /** Every goal accounted for, and not over. */
  ok: boolean;
};

/** Decision 6: a warning, never a block. "2 of 3 goals added". */
export function goalSummary(ourScore: number, scorers: number, ownGoalOrUnsure: boolean): GoalSummary {
  const of = Math.max(0, ourScore);
  const over = scorers > of;
  const added = !over && ownGoalOrUnsure ? of : scorers;
  return { added, of, over, ok: !over && added >= of };
}

export function goalsOf(players: readonly NumbersPlayer[]): number {
  return players.reduce((sum, player) => sum + (player.keeper ? 0 : player.numbers.goals), 0);
}

export function assistsOf(players: readonly NumbersPlayer[]): number {
  return players.reduce((sum, player) => sum + (player.keeper ? 0 : player.numbers.assists), 0);
}

/**
 * What one save sends. Every row carries every column, so a bulk upsert never
 * fills a missing column with null, and `played` is always explicit.
 */
export function saveRows(players: readonly NumbersPlayer[], matchId: string) {
  const field: Record<string, unknown>[] = [];
  const keepers: Record<string, unknown>[] = [];
  for (const player of players) {
    if (player.keeper) keepers.push({ player_id: player.id, match_id: matchId, ...player.numbers });
    else field.push({ player_id: player.id, match_id: matchId, ...player.numbers });
  }
  return { field, keepers };
}

/** "Sam Lee" for "  Sam   Lee " (the MAP's worst-case names). */
export function tidyName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}
