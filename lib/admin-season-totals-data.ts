import type { SupabaseClient } from "@supabase/supabase-js";
import { groupFor, tidyName, type PlayerGroup } from "@/lib/player-numbers";
import {
  FIELD_TOTAL_KEYS,
  KEEPER_TOTAL_KEYS,
  sumGames,
  type FieldTotalKey,
  type KeeperTotalKey,
  type Numbers,
} from "@/lib/season-totals";

// ADMIN-RE-11c-2 (design cd-season-totals; decision 0001, group 1 decision 3):
// the Season totals page. For each player in the season: the totals visitors
// see (onzio.*_season_totals), what the season's games add up to, and what is
// added by hand (onzio.*_season_adjustments), so the page can say "5 from games
// · 2 added by hand" and keep an adjustment from taking a total below 0. Reads
// go through the signed-in person's own client and are scoped to the club.

type Base = { id: string; name: string; number: number | null; group: PlayerGroup; gamesPlayed: number };

export type TotalsPlayer =
  | (Base & {
      keeper: false;
      total: Numbers<FieldTotalKey>;
      fromGames: Numbers<FieldTotalKey>;
      added: Numbers<FieldTotalKey>;
    })
  | (Base & {
      keeper: true;
      total: Numbers<KeeperTotalKey>;
      fromGames: Numbers<KeeperTotalKey>;
      added: Numbers<KeeperTotalKey>;
    });

export type TotalsSeason = { id: string; label: string; active: boolean };

export type SeasonTotalsData =
  | { status: "ready"; season: TotalsSeason; players: TotalsPlayer[]; gamesEntered: number }
  | { status: "no-season" }
  | { status: "error" };

const PAGE = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pick<K extends string>(row: Record<string, unknown> | undefined, keys: readonly K[]): Numbers<K> {
  return Object.fromEntries(keys.map((key) => [key, Number(row?.[key] ?? 0) || 0])) as Numbers<K>;
}

type Onzio = ReturnType<SupabaseClient["schema"]>;

async function readAll(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<Record<string, unknown>[] | null> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await build(from, from + PAGE - 1);
    if (page.error) return null;
    const data = (page.data ?? []) as Record<string, unknown>[];
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

async function readSeasonGames(onzio: Onzio, clubId: string, seasonId: string) {
  const matches = await readAll((from, to) =>
    onzio.from("matches").select("id").eq("club_id", clubId).eq("season_id", seasonId).order("id").range(from, to),
  );
  if (!matches) return null;
  const ids = matches.map((row) => row.id as string);
  if (ids.length === 0) return { field: [], keepers: [] };
  const [field, keepers] = await Promise.all(
    (["player_match_stats", "goalkeeper_match_stats"] as const).map((table) =>
      readAll((from, to) =>
        onzio.from(table).select("*").eq("club_id", clubId).in("match_id", ids).order("id").range(from, to),
      ),
    ),
  );
  if (!field || !keepers) return null;
  return { field, keepers };
}

export async function loadSeasonTotals(
  supabase: SupabaseClient,
  clubId: string,
  askedSeasonId?: string,
): Promise<SeasonTotalsData> {
  try {
    const onzio = supabase.schema("onzio");
    const seasons = await onzio.from("seasons").select("id,label,active").eq("club_id", clubId);
    if (seasons.error) return { status: "error" };
    const list = (seasons.data ?? []) as TotalsSeason[];
    const season =
      (askedSeasonId && UUID.test(askedSeasonId) ? list.find((row) => row.id === askedSeasonId) : undefined) ??
      list.find((row) => row.active) ??
      null;
    if (!season) return { status: "no-season" };

    const [fieldTotals, keeperTotals, fieldAdded, keeperAdded, games] = await Promise.all([
      readAll((from, to) =>
        onzio.from("player_season_totals").select("*").eq("club_id", clubId).eq("season_id", season.id).order("player_id").range(from, to),
      ),
      readAll((from, to) =>
        onzio.from("goalkeeper_season_totals").select("*").eq("club_id", clubId).eq("season_id", season.id).order("player_id").range(from, to),
      ),
      readAll((from, to) =>
        onzio.from("player_season_adjustments").select("*").eq("club_id", clubId).eq("season_id", season.id).order("player_id").range(from, to),
      ),
      readAll((from, to) =>
        onzio.from("goalkeeper_season_adjustments").select("*").eq("club_id", clubId).eq("season_id", season.id).order("player_id").range(from, to),
      ),
      readSeasonGames(onzio, clubId, season.id),
    ]);
    if (!fieldTotals || !keeperTotals || !fieldAdded || !keeperAdded || !games) return { status: "error" };

    const ids = [...new Set([...fieldTotals, ...keeperTotals].map((row) => row.player_id as string))];
    const people = ids.length
      ? await onzio.from("players").select("id,name,number,position").eq("club_id", clubId).in("id", ids)
      : { data: [], error: null };
    if (people.error) return { status: "error" };
    const byId = new Map(
      ((people.data ?? []) as { id: string; name: string; number: number | null; position: string | null }[]).map(
        (row) => [row.id, row],
      ),
    );

    const fieldSums = sumGames(games.field, FIELD_TOTAL_KEYS);
    const keeperSums = sumGames(games.keepers, KEEPER_TOTAL_KEYS);
    const fieldAdj = new Map(fieldAdded.map((row) => [row.player_id as string, row]));
    const keeperAdj = new Map(keeperAdded.map((row) => [row.player_id as string, row]));

    const players: TotalsPlayer[] = [];
    for (const row of keeperTotals) {
      const person = byId.get(row.player_id as string);
      if (!person) continue;
      players.push({
        id: person.id,
        name: tidyName(person.name),
        number: person.number,
        group: "gk",
        gamesPlayed: Number(row.games_played ?? 0),
        keeper: true,
        total: pick(row, KEEPER_TOTAL_KEYS),
        fromGames: keeperSums.get(person.id) ?? pick(undefined, KEEPER_TOTAL_KEYS),
        added: pick(keeperAdj.get(person.id), KEEPER_TOTAL_KEYS),
      });
    }
    for (const row of fieldTotals) {
      const person = byId.get(row.player_id as string);
      if (!person) continue;
      players.push({
        id: person.id,
        name: tidyName(person.name),
        number: person.number,
        group: groupFor(person.position, false),
        gamesPlayed: Number(row.games_played ?? 0),
        keeper: false,
        total: pick(row, FIELD_TOTAL_KEYS),
        fromGames: fieldSums.get(person.id) ?? pick(undefined, FIELD_TOTAL_KEYS),
        added: pick(fieldAdj.get(person.id), FIELD_TOTAL_KEYS),
      });
    }
    players.sort(
      (a, b) => (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name),
    );

    const entered = new Set(
      [...games.field, ...games.keepers].filter((row) => row.played === true).map((row) => row.match_id as string),
    );
    return { status: "ready", season, players, gamesEntered: entered.size };
  } catch {
    return { status: "error" };
  }
}
