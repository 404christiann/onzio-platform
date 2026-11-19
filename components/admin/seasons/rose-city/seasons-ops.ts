import { createClient } from "@/lib/admin-client";
import {
  FIELD_TOTAL_COLUMNS,
  KEEPER_TOTAL_COLUMNS,
  seasonDeleteState,
  type SeasonDeleteState,
  type SeasonListItem,
} from "@/lib/admin-seasons-list";
import { nextSeasonAfter } from "@/lib/season-label";

// RC-ADMIN-4b-seasons: the three writes of the Seasons page, unchanged from ClassicSeasonsPage (same tables,
// same order, same payloads through POST /api/admin/data). Each returns an error message, or null when it worked.
// ("A season created but its player rows not seeded" is reported as `partial`: the season exists.)

export type SeasonsWriteResult = { error: string | null; partial?: boolean };

type Client = ReturnType<typeof createClient>;

async function readDeleteState(supabase: Client, seasonId: string): Promise<SeasonDeleteState> {
  const [matchesResult, fieldResult, gkResult] = await Promise.all([
    supabase.from("matches").select("id", { count: "exact", head: true }).eq("season_id", seasonId),
    supabase.from("player_season_totals").select(FIELD_TOTAL_COLUMNS).eq("season_id", seasonId),
    supabase.from("goalkeeper_season_totals").select(KEEPER_TOTAL_COLUMNS).eq("season_id", seasonId),
  ]);
  const queryError = matchesResult.error ?? fieldResult.error ?? gkResult.error;
  if (queryError) throw new Error(queryError.message);
  return seasonDeleteState(
    matchesResult.count ?? 0,
    (fieldResult.data ?? []) as Record<string, unknown>[],
    (gkResult.data ?? []) as Record<string, unknown>[],
  );
}

export async function setActiveSeason(seasonId: string): Promise<SeasonsWriteResult> {
  const supabase = createClient();
  // Deactivate all first; this order is required by the single-active partial unique index.
  const { error: deactivateError } = await supabase
    .from("seasons")
    .update({ active: false })
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (deactivateError) return { error: deactivateError.message };
  const { error: activateError } = await supabase.from("seasons").update({ active: true }).eq("id", seasonId);
  if (activateError) return { error: activateError.message };
  return { error: null };
}

/** `newest` is the latest season on the page: the next one follows its name. */
export async function createNextSeason(newest: SeasonListItem): Promise<SeasonsWriteResult> {
  const supabase = createClient();
  const next = nextSeasonAfter(newest);

  const { data: newSeason, error: seasonError } = await supabase
    .from("seasons")
    .insert([{ label: next.label, start_year: next.start_year, end_year: next.end_year, active: false }])
    .select()
    .single();
  if (seasonError || !newSeason) return { error: seasonError?.message ?? "Failed to create season" };

  const { data: players, error: playersError } = await supabase.from("players").select("id, position").eq("active", true);
  if (playersError) {
    return { error: `Season created, but players could not be loaded for stat seeding: ${playersError.message}`, partial: true };
  }

  const fieldPlayers = (players ?? []).filter((player: { id: string; position: string }) => player.position !== "Goalkeeper");
  const goalkeepers = (players ?? []).filter((player: { id: string; position: string }) => player.position === "Goalkeeper");
  const [fieldSeedResult, goalkeeperSeedResult] = await Promise.all([
    fieldPlayers.length > 0
      ? supabase.from("player_season_stats").insert(fieldPlayers.map((player: { id: string }) => ({
          player_id: player.id,
          season_id: newSeason.id,
          goals: 0, assists: 0, tackles: 0, starts: 0,
          yellow: 0, red: 0, mins: 0, offsides: 0, fouls: 0, fouls_suffered: 0,
        })))
      : Promise.resolve({ error: null }),
    goalkeepers.length > 0
      ? supabase.from("goalkeeper_season_stats").insert(goalkeepers.map((player: { id: string }) => ({
          player_id: player.id,
          season_id: newSeason.id,
          goals_against: 0, saves: 0, clean_sheets: 0,
          starts: 0, yellow: 0, red: 0, mins: 0,
        })))
      : Promise.resolve({ error: null }),
  ]);

  const seedError = fieldSeedResult.error ?? goalkeeperSeedResult.error;
  if (seedError) return { error: `Season created, but some player stats were not seeded: ${seedError.message}`, partial: true };
  return { error: null };
}

export async function deleteSeason(seasonId: string): Promise<SeasonsWriteResult> {
  const supabase = createClient();
  try {
    const guard = await readDeleteState(supabase, seasonId);
    if (!guard.deletable) return { error: guard.reason };

    const { error: fieldDeleteError } = await supabase.from("player_season_stats").delete().eq("season_id", seasonId);
    if (fieldDeleteError) throw new Error(fieldDeleteError.message);
    const { error: goalkeeperDeleteError } = await supabase.from("goalkeeper_season_stats").delete().eq("season_id", seasonId);
    if (goalkeeperDeleteError) throw new Error(goalkeeperDeleteError.message);
    const { error: seasonDeleteError } = await supabase.from("seasons").delete().eq("id", seasonId);
    if (seasonDeleteError) throw new Error(seasonDeleteError.message);
    return { error: null };
  } catch (deleteError) {
    return { error: deleteError instanceof Error ? deleteError.message : "Failed to delete season" };
  }
}
