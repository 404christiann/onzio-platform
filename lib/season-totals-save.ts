import type { createClient } from "@/lib/admin-client";
import {
  adjustmentFor,
  adjustmentProblem,
  FIELD_TOTAL_KEYS,
  KEEPER_TOTAL_KEYS,
  sumGames,
  type FieldTotalKey,
  type KeeperTotalKey,
  type Numbers,
} from "@/lib/season-totals";

// ADMIN-RE-11c: the classic Season stats page and the classic roster's per-player
// panel still let an owner type a season total. What they type is kept as the
// part added by hand: typed - the season's match stats. Both save through the
// admin data route like before.

type AdminClient = ReturnType<typeof createClient>;
const PAGE = 1000;

export type SeasonGames = {
  field: Map<string, Numbers<FieldTotalKey>>;
  keepers: Map<string, Numbers<KeeperTotalKey>>;
};

/** Every saved match stats row for the season's games, added up per player. */
export async function loadSeasonGames(supabase: AdminClient, seasonId: string): Promise<SeasonGames> {
  const matches = await supabase.from("matches").select("id").eq("season_id", seasonId).order("id");
  if (matches.error) throw new Error(matches.error.message);
  const ids = ((matches.data ?? []) as { id: string }[]).map((match) => match.id);

  async function rows(table: "player_match_stats" | "goalkeeper_match_stats"): Promise<Record<string, unknown>[]> {
    const all: Record<string, unknown>[] = [];
    if (ids.length === 0) return all;
    for (let from = 0; ; from += PAGE) {
      const page = await supabase.from(table).select("*").in("match_id", ids).order("id").range(from, from + PAGE - 1);
      if (page.error) throw new Error(page.error.message);
      const data = (page.data ?? []) as Record<string, unknown>[];
      all.push(...data);
      if (data.length < PAGE) return all;
    }
  }

  const [field, keepers] = await Promise.all([rows("player_match_stats"), rows("goalkeeper_match_stats")]);
  return { field: sumGames(field, FIELD_TOTAL_KEYS), keepers: sumGames(keepers, KEEPER_TOTAL_KEYS) };
}

export type TypedTotals = {
  playerId: string;
  name: string;
  keeper: boolean;
  typed: Record<string, number>;
  /** False when the player is shown for the season but has no season row yet. */
  inSeason: boolean;
};

/**
 * Saves typed totals as adjustments. Players not yet in the season get their
 * season row first, and so does every player in `join` (shown for the season
 * but not changed). Returns the problem to show, or null when everything saved.
 */
export async function saveSeasonTotals(
  supabase: AdminClient,
  seasonId: string,
  entries: readonly TypedTotals[],
  join: readonly { playerId: string; keeper: boolean }[] = [],
): Promise<string | null> {
  // Read the games now, not when the page loaded, so a game saved meanwhile counts.
  const games = await loadSeasonGames(supabase, seasonId);
  const field: Record<string, unknown>[] = [];
  const keepers: Record<string, unknown>[] = [];
  const newField: Record<string, unknown>[] = [];
  const newKeepers: Record<string, unknown>[] = [];

  for (const entry of entries) {
    const adjustment = entry.keeper
      ? adjustmentFor(entry.typed, games.keepers.get(entry.playerId), KEEPER_TOTAL_KEYS)
      : adjustmentFor(entry.typed, games.field.get(entry.playerId), FIELD_TOTAL_KEYS);
    const problem = entry.keeper
      ? adjustmentProblem(adjustment as Numbers<KeeperTotalKey>, KEEPER_TOTAL_KEYS)
      : adjustmentProblem(adjustment as Numbers<FieldTotalKey>, FIELD_TOTAL_KEYS);
    if (problem) return `${entry.name}: ${problem}`;
    (entry.keeper ? keepers : field).push({ player_id: entry.playerId, season_id: seasonId, ...adjustment });
    if (!entry.inSeason) {
      (entry.keeper ? newKeepers : newField).push({ player_id: entry.playerId, season_id: seasonId });
    }
  }

  for (const player of join) {
    (player.keeper ? newKeepers : newField).push({ player_id: player.playerId, season_id: seasonId });
  }

  const [joinField, joinKeepers] = await Promise.all([
    newField.length > 0
      ? supabase.from("player_season_stats").upsert(newField, { onConflict: "player_id,season_id" })
      : Promise.resolve({ error: null }),
    newKeepers.length > 0
      ? supabase.from("goalkeeper_season_stats").upsert(newKeepers, { onConflict: "player_id,season_id" })
      : Promise.resolve({ error: null }),
  ]);
  const joinError = joinField.error ?? joinKeepers.error;
  if (joinError) return joinError.message;

  const [savedField, savedKeepers] = await Promise.all([
    field.length > 0
      ? supabase.from("player_season_adjustments").upsert(field, { onConflict: "player_id,season_id" })
      : Promise.resolve({ error: null }),
    keepers.length > 0
      ? supabase.from("goalkeeper_season_adjustments").upsert(keepers, { onConflict: "player_id,season_id" })
      : Promise.resolve({ error: null }),
  ]);
  const saveError = savedField.error ?? savedKeepers.error;
  return saveError ? saveError.message : null;
}
