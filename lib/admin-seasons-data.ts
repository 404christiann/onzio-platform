import type { SupabaseClient } from "@supabase/supabase-js";
import {
  firstSeasonAfterNothing,
  newestSeasonFirst,
  nextSeasonAfter,
} from "@/lib/season-label";

// ADMIN-RE-11a: what the Seasons hub shows (design: cd-season-final,
// dc-club-home). Reads go through the signed-in person's own client (RLS is the
// boundary) and are scoped to the club. Nothing here selects a personal detail:
// seasons, counts and the league table's points only.

export type HubSeason = {
  id: string;
  label: string;
  startYear: number;
  endYear: number;
  active: boolean;
  createdAt: string;
};

export type SeasonSuggestion = { label: string; startYear: number; endYear: number };

export type DeleteCounts = { matches: number; rowsWithNumbers: number; statRows: number };

export type DeleteVerdict =
  | { deletable: true }
  | { deletable: false; reason: "shown" | "games" | "numbers" };

export type LeagueSummary = { rank: number; of: number; points: number };

export type SeasonsHubData =
  | { status: "error" }
  | {
      status: "ready";
      /** Newest first. */
      seasons: HubSeason[];
      /** The season the website shows, when there is one. */
      shown: HubSeason | null;
      /** The season whose numbers the page is showing: the one asked for, else the shown one. */
      viewed: HubSeason | null;
      /** A season that exists but the website is not showing yet ("ready · Show it"). */
      ready: HubSeason | null;
      suggestion: SeasonSuggestion;
      league: LeagueSummary | null;
      /** Players with a totals row in the viewed season. */
      players: number;
      gamesPlayed: number;
      gamesTotal: number;
      deleteVerdict: DeleteVerdict | null;
    };

type SeasonRow = {
  id: string;
  label: string;
  start_year: number;
  end_year: number;
  active: boolean;
  created_at: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toHubSeason(row: SeasonRow): HubSeason {
  return {
    id: row.id,
    label: row.label,
    startYear: row.start_year,
    endYear: row.end_year,
    active: row.active,
    createdAt: row.created_at,
  };
}

const forSorting = (season: HubSeason) => ({
  label: season.label,
  start_year: season.startYear,
  end_year: season.endYear,
  created_at: season.createdAt,
});

/** Newest first, with Fall ahead of Spring of the same year. */
export function sortSeasons(seasons: readonly HubSeason[]): HubSeason[] {
  return [...seasons].sort((a, b) => newestSeasonFirst(forSorting(a), forSorting(b)));
}

/**
 * The newest season, when the website is not showing it and it is newer than
 * the one it shows (or nothing is shown yet). An older season nobody ever
 * switched on is history, not "ready".
 */
export function readySeason(seasons: readonly HubSeason[]): HubSeason | null {
  const [newest] = sortSeasons(seasons);
  if (!newest || newest.active) return null;
  const shown = seasons.find((season) => season.active);
  if (!shown) return newest;
  return newestSeasonFirst(forSorting(newest), forSorting(shown)) < 0 ? newest : null;
}

/** The season the page opens on: the one asked for if it is this club's, else the shown one, else the newest. */
export function pickViewedSeason(seasons: readonly HubSeason[], asked: string | undefined): HubSeason | null {
  if (asked && UUID.test(asked)) {
    const match = seasons.find((season) => season.id === asked);
    if (match) return match;
  }
  return seasons.find((season) => season.active) ?? sortSeasons(seasons)[0] ?? null;
}

/** The name and years "Start next season" fills in. `today` is the club's own date. */
export function suggestionFor(seasons: readonly HubSeason[], today: string): SeasonSuggestion {
  const [newest] = sortSeasons(seasons);
  const next = newest
    ? nextSeasonAfter({ label: newest.label, start_year: newest.startYear, end_year: newest.endYear })
    : firstSeasonAfterNothing(today);
  return { label: next.label, startYear: next.start_year, endYear: next.end_year };
}

/** True when a stat row has any figure other than zero (the ids do not count). */
export function statRowHasNumbers(row: Record<string, unknown>): boolean {
  return Object.entries(row).some(
    ([key, value]) => key !== "player_id" && key !== "season_id" && Number(value ?? 0) !== 0,
  );
}

/** A season can be deleted only while it is empty and the website is not showing it. */
export function deleteVerdict(season: HubSeason, counts: DeleteCounts): DeleteVerdict {
  if (season.active) return { deletable: false, reason: "shown" };
  if (counts.matches > 0) return { deletable: false, reason: "games" };
  if (counts.rowsWithNumbers > 0) return { deletable: false, reason: "numbers" };
  return { deletable: true };
}

/** Our place in the league table and our points; null when there is no table or our team is not in it. */
export function leagueSummary(rows: readonly { is_club: boolean; points: number }[]): LeagueSummary | null {
  const index = rows.findIndex((row) => row.is_club);
  if (index < 0) return null;
  return { rank: index + 1, of: rows.length, points: rows[index].points };
}

const FIELD_STAT_COLUMNS =
  "player_id,season_id,goals,assists,tackles,offsides,fouls,fouls_suffered,starts,yellow,red,mins";
const KEEPER_STAT_COLUMNS = "player_id,season_id,goals_against,saves,clean_sheets,starts,yellow,red,mins";

export async function loadSeasonsHub(
  supabase: SupabaseClient,
  clubId: string,
  today: string,
  askedSeasonId?: string,
): Promise<SeasonsHubData> {
  try {
    const onzio = supabase.schema("onzio");
    const seasonsResult = await onzio
      .from("seasons")
      .select("id,label,start_year,end_year,active,created_at")
      .eq("club_id", clubId);
    if (seasonsResult.error) return { status: "error" };

    const seasons = sortSeasons(((seasonsResult.data ?? []) as SeasonRow[]).map(toHubSeason));
    const shown = seasons.find((season) => season.active) ?? null;
    const viewed = pickViewedSeason(seasons, askedSeasonId);
    const base = {
      status: "ready" as const,
      seasons,
      shown,
      viewed,
      ready: readySeason(seasons),
      suggestion: suggestionFor(seasons, today),
    };
    if (!viewed) {
      return { ...base, league: null, players: 0, gamesPlayed: 0, gamesTotal: 0, deleteVerdict: null };
    }

    const [league, total, played, field, keepers] = await Promise.all([
      onzio
        .from("league_standings")
        .select("is_club,points,sort_order")
        .eq("club_id", clubId)
        .order("sort_order", { ascending: true }),
      onzio.from("matches").select("id", { count: "exact", head: true }).eq("club_id", clubId).eq("season_id", viewed.id),
      onzio
        .from("matches")
        .select("id", { count: "exact", head: true })
        .eq("club_id", clubId)
        .eq("season_id", viewed.id)
        .not("rose_city_score", "is", null)
        .not("opponent_score", "is", null),
      onzio.from("player_season_stats").select(FIELD_STAT_COLUMNS).eq("club_id", clubId).eq("season_id", viewed.id),
      onzio.from("goalkeeper_season_stats").select(KEEPER_STAT_COLUMNS).eq("club_id", clubId).eq("season_id", viewed.id),
    ]);
    if (league.error || total.error || played.error || field.error || keepers.error) {
      return { status: "error" };
    }

    const statRows = [
      ...((field.data ?? []) as unknown as Record<string, unknown>[]),
      ...((keepers.data ?? []) as unknown as Record<string, unknown>[]),
    ];
    const counts: DeleteCounts = {
      matches: total.count ?? 0,
      rowsWithNumbers: statRows.filter(statRowHasNumbers).length,
      statRows: statRows.length,
    };
    return {
      ...base,
      league: leagueSummary((league.data ?? []) as { is_club: boolean; points: number }[]),
      players: counts.statRows,
      gamesPlayed: played.count ?? 0,
      gamesTotal: counts.matches,
      deleteVerdict: deleteVerdict(viewed, counts),
    };
  } catch {
    return { status: "error" };
  }
}
