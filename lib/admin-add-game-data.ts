import type { SupabaseClient } from "@supabase/supabase-js";
import { clubToday } from "@/lib/club-time";

// ADMIN-RE-07: what "Add a game" needs on first paint. Read with the signed-in
// person's own client (RLS is the boundary) and scoped to the club. Only
// schedule columns are selected; nothing personal.

export type AddGameSeason = { id: string; label: string; active: boolean };

export type AddGameMatch = {
  id: string;
  seasonId: string;
  date: string;
  time: string;
  opponent: string;
  home: boolean;
  venue: string;
};

export type AddGameData = {
  seasons: AddGameSeason[];
  /** Today onward, soonest first, every season (the page shows the picked one). */
  upcoming: AddGameMatch[];
  /** The club's recent distinct venues, newest first: the "Last used" chips. */
  recentVenues: string[];
};

/** How many "Last used" chips the form offers. */
export const RECENT_VENUE_LIMIT = 3;
/** Recent games read to find distinct venues. */
const RECENT_VENUE_SCAN = 50;
/** Upcoming games read for "Coming up". */
export const UPCOMING_LIMIT = 200;

type MatchRow = {
  id: string;
  season_id: string;
  date: string;
  time: string | null;
  opponent: string;
  home: boolean;
  venue: string | null;
};

export function toAddGameMatch(row: MatchRow): AddGameMatch {
  return {
    id: row.id,
    seasonId: row.season_id,
    date: row.date,
    time: (row.time ?? "").slice(0, 5),
    opponent: row.opponent,
    home: row.home,
    venue: row.venue ?? "",
  };
}

/** Distinct, non-blank venues in the order given, compared without case or outer spaces. */
export function distinctVenues(venues: ReadonlyArray<string | null>, limit = RECENT_VENUE_LIMIT): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of venues) {
    const venue = (raw ?? "").trim();
    const key = venue.toLocaleLowerCase("en-US");
    if (!venue || seen.has(key)) continue;
    seen.add(key);
    result.push(venue);
    if (result.length === limit) break;
  }
  return result;
}

/** Soonest first: by date, then kickoff time. */
export function compareMatches(a: AddGameMatch, b: AddGameMatch): number {
  return a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date);
}

export const MATCH_COLUMNS = "id,season_id,date,time,opponent,home,venue";

export async function loadAddGameData(
  supabase: SupabaseClient,
  clubId: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<AddGameData> {
  const onzio = supabase.schema("onzio");
  const [seasons, upcoming, recent] = await Promise.all([
    onzio
      .from("seasons")
      .select("id,label,active")
      .eq("club_id", clubId)
      .order("start_year", { ascending: false })
      .order("label", { ascending: true }),
    onzio
      .from("matches")
      .select(MATCH_COLUMNS)
      .eq("club_id", clubId)
      .gte("date", clubToday(timeZone, now))
      .order("date", { ascending: true })
      .order("time", { ascending: true })
      .limit(UPCOMING_LIMIT),
    onzio
      .from("matches")
      .select("venue")
      .eq("club_id", clubId)
      .neq("venue", "")
      .order("date", { ascending: false })
      .order("time", { ascending: false })
      .limit(RECENT_VENUE_SCAN),
  ]);
  if (seasons.error) throw seasons.error;

  return {
    seasons: ((seasons.data ?? []) as AddGameSeason[]).map(({ id, label, active }) => ({ id, label, active })),
    // A failed side read leaves the form usable: no list, no chips.
    upcoming: upcoming.error ? [] : ((upcoming.data ?? []) as MatchRow[]).map(toAddGameMatch),
    recentVenues: recent.error
      ? []
      : distinctVenues(((recent.data ?? []) as Array<{ venue: string | null }>).map((row) => row.venue)),
  };
}
