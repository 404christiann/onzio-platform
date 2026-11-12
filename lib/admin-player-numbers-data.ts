import type { SupabaseClient } from "@supabase/supabase-js";
import { formatGameDay } from "@/lib/admin-score-data";
import { formatClubTime } from "@/lib/club-time";
import {
  fieldNumbersFrom,
  groupFor,
  keeperNumbersFrom,
  tidyName,
  type NumbersPlayer,
} from "@/lib/player-numbers";

// ADMIN-RE-11c-2: what the "Player numbers" page for one game shows. The
// players are the ones in the game's season (a season totals row, the same rule
// as the old Match stats page), each with what is already saved for this game.
// Reads go through the signed-in person's own client (RLS is the boundary) and
// are scoped to the club. No personal details beyond a player's name and shirt
// number, which the public roster already shows.

export type NumbersGame = {
  id: string;
  seasonId: string;
  seasonLabel: string;
  opponent: string;
  home: boolean;
  /** "Sat, Nov 8 · 10:00 AM · League". */
  when: string;
  ourScore: number | null;
  theirScore: number | null;
};

export type PlayerNumbersData =
  | { status: "ready"; game: NumbersGame; players: NumbersPlayer[] }
  | { status: "missing" }
  | { status: "error" };

type MatchRow = {
  id: string;
  season_id: string;
  date: string;
  time: string | null;
  opponent: string;
  home: boolean;
  competition: string | null;
  rose_city_score: number | null;
  opponent_score: number | null;
};

type PlayerRow = { id: string; name: string; number: number | null; position: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isGameId(value: string): boolean {
  return UUID.test(value);
}

function byShirtThenName(a: NumbersPlayer, b: NumbersPlayer): number {
  const an = a.number ?? Number.MAX_SAFE_INTEGER;
  const bn = b.number ?? Number.MAX_SAFE_INTEGER;
  return an - bn || a.name.localeCompare(b.name);
}

export async function loadPlayerNumbers(
  supabase: SupabaseClient,
  clubId: string,
  matchId: string,
): Promise<PlayerNumbersData> {
  if (!isGameId(matchId)) return { status: "missing" };
  try {
    const onzio = supabase.schema("onzio");
    const match = await onzio
      .from("matches")
      .select("id,season_id,date,time,opponent,home,competition,rose_city_score,opponent_score")
      .eq("club_id", clubId)
      .eq("id", matchId)
      .maybeSingle();
    if (match.error) return { status: "error" };
    const row = match.data as MatchRow | null;
    if (!row) return { status: "missing" };

    const [season, field, keepers, fieldSaved, keeperSaved] = await Promise.all([
      onzio.from("seasons").select("label").eq("club_id", clubId).eq("id", row.season_id).maybeSingle(),
      onzio.from("player_season_stats").select("player_id").eq("club_id", clubId).eq("season_id", row.season_id),
      onzio.from("goalkeeper_season_stats").select("player_id").eq("club_id", clubId).eq("season_id", row.season_id),
      onzio.from("player_match_stats").select("*").eq("club_id", clubId).eq("match_id", matchId),
      onzio.from("goalkeeper_match_stats").select("*").eq("club_id", clubId).eq("match_id", matchId),
    ]);
    if (season.error || field.error || keepers.error || fieldSaved.error || keeperSaved.error) {
      return { status: "error" };
    }

    const fieldIds = new Set(((field.data ?? []) as { player_id: string }[]).map((r) => r.player_id));
    const keeperIds = new Set(((keepers.data ?? []) as { player_id: string }[]).map((r) => r.player_id));
    const ids = [...new Set([...fieldIds, ...keeperIds])];
    const people = ids.length
      ? await onzio.from("players").select("id,name,number,position").eq("club_id", clubId).in("id", ids)
      : { data: [], error: null };
    if (people.error) return { status: "error" };

    const savedField = new Map(
      ((fieldSaved.data ?? []) as Record<string, unknown>[]).map((r) => [r.player_id as string, r]),
    );
    const savedKeeper = new Map(
      ((keeperSaved.data ?? []) as Record<string, unknown>[]).map((r) => [r.player_id as string, r]),
    );

    const players: NumbersPlayer[] = ((people.data ?? []) as PlayerRow[]).map((person) => {
      const base = { id: person.id, name: tidyName(person.name), number: person.number };
      // A player with a keeper totals row is entered as a keeper, the old Match stats page's rule.
      if (keeperIds.has(person.id)) {
        return { ...base, group: "gk", keeper: true, numbers: keeperNumbersFrom(savedKeeper.get(person.id)) };
      }
      return {
        ...base,
        group: groupFor(person.position, false),
        keeper: false,
        numbers: fieldNumbersFrom(savedField.get(person.id)),
      };
    });
    players.sort(byShirtThenName);

    const day = formatGameDay(row.date);
    return {
      status: "ready",
      game: {
        id: row.id,
        seasonId: row.season_id,
        seasonLabel: (season.data as { label: string } | null)?.label ?? "",
        opponent: row.opponent,
        home: row.home,
        when: [day, formatClubTime(row.time), row.competition?.trim() || ""].filter(Boolean).join(" · "),
        ourScore: row.rose_city_score,
        theirScore: row.opponent_score,
      },
      players,
    };
  } catch {
    return { status: "error" };
  }
}
