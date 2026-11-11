// ADMIN-RE-11c (decision 0001): a player's season totals are their saved player
// numbers added up over the season's games, plus an adjustment typed by hand for
// games that were never entered game by game. The database works the totals out
// (onzio.player_season_totals / onzio.goalkeeper_season_totals); this module holds
// the pieces the admin needs to turn a typed total back into an adjustment.

/** Mirrors the CHECKs in 20261110160000_season_totals_add_up.sql: every number, either way. */
export const SEASON_ADJUSTMENT_LIMIT = 9_999;

export const FIELD_TOTAL_KEYS = [
  "goals",
  "assists",
  "tackles",
  "starts",
  "yellow",
  "red",
  "mins",
  "offsides",
  "fouls",
  "fouls_suffered",
] as const;

export const KEEPER_TOTAL_KEYS = [
  "goals_against",
  "saves",
  "clean_sheets",
  "starts",
  "yellow",
  "red",
  "mins",
] as const;

export type FieldTotalKey = (typeof FIELD_TOTAL_KEYS)[number];
export type KeeperTotalKey = (typeof KEEPER_TOTAL_KEYS)[number];
export type TotalKey = FieldTotalKey | KeeperTotalKey;
export type Numbers<K extends string = TotalKey> = Record<K, number>;

function zero<K extends string>(keys: readonly K[]): Numbers<K> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Numbers<K>;
}

function count(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

/**
 * Adds up saved player numbers per player, the way the totals views do: every
 * number is summed, except `starts`, which is a yes/no per game and counts the
 * games started.
 */
export function sumGames<K extends TotalKey>(
  rows: readonly Record<string, unknown>[],
  keys: readonly K[],
): Map<string, Numbers<K>> {
  const sums = new Map<string, Numbers<K>>();
  for (const row of rows) {
    const playerId = row.player_id;
    if (typeof playerId !== "string") continue;
    const sum = sums.get(playerId) ?? zero(keys);
    for (const key of keys) {
      sum[key] += key === "starts" ? (row.starts === true ? 1 : 0) : count(row[key]);
    }
    sums.set(playerId, sum);
  }
  return sums;
}

/**
 * The adjustment that makes a player's totals what was typed: typed - games.
 * Negative where the games already give more than was typed (Christian,
 * 2026-11-10: "Keep today's numbers").
 */
export function adjustmentFor<K extends TotalKey>(
  typed: Partial<Numbers<K>>,
  games: Partial<Numbers<K>> | undefined,
  keys: readonly K[],
): Numbers<K> {
  const adjustment = zero(keys);
  for (const key of keys) adjustment[key] = count(typed[key]) - count(games?.[key]);
  return adjustment;
}

/** Why an adjustment can't be saved, in the words the admin shows; null when it can. */
export function adjustmentProblem<K extends TotalKey>(adjustment: Numbers<K>, keys: readonly K[]): string | null {
  for (const key of keys) {
    if (Math.abs(adjustment[key]) > SEASON_ADJUSTMENT_LIMIT) {
      const limit = SEASON_ADJUSTMENT_LIMIT.toLocaleString("en-US");
      return key === "mins" ? `Minutes added by hand stop at ${limit}.` : `Numbers added by hand stop at ${limit}.`;
    }
  }
  return null;
}
