import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fieldRadar,
  keeperRadar,
  seasonRecord,
  type RadarAxis,
  type ResultGame,
  type SeasonRecord,
} from "@/lib/admin-analytics-view";
import type { FieldStats, GoalkeeperStats } from "@/lib/data";

// ADMIN-RE-19: what "How the team is doing" shows (design: cd-analytics-a, -b).
// Reads go through the signed-in person's own client (RLS is the boundary) and
// are scoped to the club and to the season the website shows. Nothing personal
// is selected: games, scores, and the names and numbers the public roster
// already shows. The page's one-player-at-a-time game log is fetched on demand
// with fetchPlayerMatchLog in lib/queries.ts, the function the classic page uses.

export type PlayerPosition = "Goalkeeper" | "Defender" | "Midfielder" | "Forward";

export const POSITION_ORDER: readonly PlayerPosition[] = ["Goalkeeper", "Defender", "Midfielder", "Forward"];

export type GameDetail = {
  scorers: { playerId: string; name: string; count: number }[];
  assisters: { playerId: string; name: string; count: number }[];
};

export type AnalyticsPlayer = {
  id: string;
  name: string;
  number: number;
  position: PlayerPosition;
  keeper: boolean;
  axes: RadarAxis[];
  goals: number;
  saves: number;
};

export type PositionGroup = { position: PlayerPosition; players: AnalyticsPlayer[] };

export type TeamAnalytics = {
  season: { id: string; label: string };
  /** Games with both scores, oldest first. */
  games: ResultGame[];
  record: SeasonRecord;
  /** Keyed by game id. */
  details: Record<string, GameDetail>;
  groups: PositionGroup[];
};

export type TeamAnalyticsData =
  | { status: "error" }
  | { status: "no-season" }
  | ({ status: "ready" } & TeamAnalytics);

type MatchRow = {
  id: string;
  date: string;
  opponent: string;
  rose_city_score: number | null;
  opponent_score: number | null;
};
type MatchStatRow = { match_id: string; player_id: string; goals: number | null; assists: number | null };
type PlayerRow = { id: string; name: string; position: string; number: number; active: boolean | null };
type FieldSeasonRow = {
  player_id: string;
  goals: number | null;
  assists: number | null;
  tackles: number | null;
  starts: number | null;
  yellow: number | null;
  red: number | null;
  mins: number | null;
  offsides: number | null;
  fouls: number | null;
  fouls_suffered: number | null;
};
type KeeperSeasonRow = {
  player_id: string;
  goals_against: number | null;
  saves: number | null;
  clean_sheets: number | null;
  starts: number | null;
  yellow: number | null;
  red: number | null;
  mins: number | null;
};

export type TeamAnalyticsRows = {
  season: { id: string; label: string };
  matches: MatchRow[];
  matchStats: MatchStatRow[];
  players: PlayerRow[];
  fieldSeason: FieldSeasonRow[];
  keeperSeason: KeeperSeasonRow[];
};

const n = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const isScore = (value: number | null): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;
const isPosition = (value: string): value is PlayerPosition => (POSITION_ORDER as readonly string[]).includes(value);

const byCountThenName = (a: { name: string; count: number }, b: { name: string; count: number }) =>
  b.count - a.count || a.name.localeCompare(b.name);

function fieldStats(row: FieldSeasonRow | undefined): FieldStats {
  return {
    goals: n(row?.goals),
    assists: n(row?.assists),
    tackles: n(row?.tackles),
    starts: n(row?.starts),
    yellow: n(row?.yellow),
    red: n(row?.red),
    mins: n(row?.mins),
    offsides: n(row?.offsides),
    fouls: n(row?.fouls),
    foulsSuffered: n(row?.fouls_suffered),
  };
}

function keeperStats(row: KeeperSeasonRow | undefined): GoalkeeperStats {
  return {
    goalsAgainst: n(row?.goals_against),
    saves: n(row?.saves),
    cleanSheets: n(row?.clean_sheets),
    starts: n(row?.starts),
    yellow: n(row?.yellow),
    red: n(row?.red),
    mins: n(row?.mins),
  };
}

export function buildTeamAnalytics(input: TeamAnalyticsRows): TeamAnalytics {
  const games: ResultGame[] = input.matches
    .filter((m) => isScore(m.rose_city_score) && isScore(m.opponent_score))
    .map((m) => ({ id: m.id, date: m.date, opponent: m.opponent, us: m.rose_city_score!, them: m.opponent_score! }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));

  const names = new Map(input.players.map((p) => [p.id, p.name]));
  const details: Record<string, GameDetail> = Object.fromEntries(
    games.map((g) => [g.id, { scorers: [], assisters: [] } satisfies GameDetail]),
  );
  const goals = new Map<string, Map<string, number>>();
  const assists = new Map<string, Map<string, number>>();
  const add = (into: Map<string, Map<string, number>>, matchId: string, playerId: string, count: number) => {
    if (count <= 0) return;
    const inner = into.get(matchId) ?? new Map<string, number>();
    inner.set(playerId, (inner.get(playerId) ?? 0) + count);
    into.set(matchId, inner);
  };
  for (const row of input.matchStats) {
    if (!details[row.match_id] || !names.has(row.player_id)) continue;
    add(goals, row.match_id, row.player_id, n(row.goals));
    add(assists, row.match_id, row.player_id, n(row.assists));
  }
  const lines = (from: Map<string, number> | undefined) =>
    [...(from ?? [])]
      .map(([playerId, count]) => ({ playerId, name: names.get(playerId)!, count }))
      .sort(byCountThenName);
  for (const game of games) {
    details[game.id] = { scorers: lines(goals.get(game.id)), assisters: lines(assists.get(game.id)) };
  }

  const fieldById = new Map(input.fieldSeason.map((r) => [r.player_id, r]));
  const keeperById = new Map(input.keeperSeason.map((r) => [r.player_id, r]));
  const active = input.players.filter((p) => p.active !== false && isPosition(p.position));

  const groups: PositionGroup[] = POSITION_ORDER.map((position) => {
    const inPosition = active.filter((p) => p.position === position);
    const keeper = position === "Goalkeeper";
    const cohortField = inPosition.map((p) => fieldStats(fieldById.get(p.id)));
    const cohortKeeper = inPosition.map((p) => keeperStats(keeperById.get(p.id)));
    const players = inPosition
      .map((p): AnalyticsPlayer => {
        const field = fieldStats(fieldById.get(p.id));
        const gk = keeperStats(keeperById.get(p.id));
        return {
          id: p.id,
          name: p.name,
          number: p.number,
          position,
          keeper,
          axes: keeper ? keeperRadar(gk, cohortKeeper) : fieldRadar(field, cohortField),
          goals: field.goals,
          saves: gk.saves,
        };
      })
      .sort((a, b) => a.number - b.number || a.name.localeCompare(b.name));
    return { position, players };
  }).filter((group) => group.players.length > 0);

  return {
    season: input.season,
    games,
    record: seasonRecord(games),
    details,
    groups,
  };
}

/** The player the page opens on: the team's top scorer, else the first player listed. */
export function defaultPlayerId(groups: readonly PositionGroup[]): string | null {
  const everyone = groups.flatMap((group) => group.players);
  const top = everyone
    .filter((player) => !player.keeper)
    .reduce<AnalyticsPlayer | null>((best, player) => (!best || player.goals > best.goals ? player : best), null);
  return (top && top.goals > 0 ? top : everyone[0])?.id ?? null;
}

const PAGE = 1000;

/** Every row of a club-scoped table: the API returns at most a page at a time. */
async function readAll<T>(read: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[] | null> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1);
    if (error) return null;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const FIELD_COLUMNS = "player_id,goals,assists,tackles,starts,yellow,red,mins,offsides,fouls,fouls_suffered";
const KEEPER_COLUMNS = "player_id,goals_against,saves,clean_sheets,starts,yellow,red,mins";

/** The season the website shows, with its results and players; "no-season" before one is shown. */
export async function loadTeamAnalytics(supabase: SupabaseClient, clubId: string): Promise<TeamAnalyticsData> {
  try {
    const onzio = supabase.schema("onzio");
    const seasonResult = await onzio
      .from("seasons")
      .select("id,label")
      .eq("club_id", clubId)
      .eq("active", true)
      .order("start_year", { ascending: false })
      .limit(1);
    if (seasonResult.error) return { status: "error" };
    const season = ((seasonResult.data ?? []) as { id: string; label: string }[])[0];
    if (!season) return { status: "no-season" };

    const [matches, players, fieldSeason, keeperSeason] = await Promise.all([
      readAll<MatchRow>((from, to) =>
        onzio
          .from("matches")
          .select("id,date,opponent,rose_city_score,opponent_score")
          .eq("club_id", clubId)
          .eq("season_id", season.id)
          .order("id")
          .range(from, to),
      ),
      readAll<PlayerRow>((from, to) =>
        onzio.from("players").select("id,name,position,number,active").eq("club_id", clubId).order("id").range(from, to),
      ),
      readAll<FieldSeasonRow>((from, to) =>
        onzio
          .from("player_season_totals")
          .select(FIELD_COLUMNS)
          .eq("club_id", clubId)
          .eq("season_id", season.id)
          .order("player_id")
          .range(from, to),
      ),
      readAll<KeeperSeasonRow>((from, to) =>
        onzio
          .from("goalkeeper_season_totals")
          .select(KEEPER_COLUMNS)
          .eq("club_id", clubId)
          .eq("season_id", season.id)
          .order("player_id")
          .range(from, to),
      ),
    ]);
    if (!matches || !players || !fieldSeason || !keeperSeason) return { status: "error" };

    // Only the numbers of games that have a result, and only goals and assists
    const resultIds = matches
      .filter((m) => isScore(m.rose_city_score) && isScore(m.opponent_score))
      .map((m) => m.id);
    const matchStats =
      resultIds.length === 0
        ? []
        : await readAll<MatchStatRow>((from, to) =>
            onzio
              .from("player_match_stats")
              .select("match_id,player_id,goals,assists")
              .eq("club_id", clubId)
              .in("match_id", resultIds)
              .or("goals.gt.0,assists.gt.0")
              .order("id")
              .range(from, to),
          );
    if (!matchStats) return { status: "error" };

    return {
      status: "ready",
      ...buildTeamAnalytics({ season, matches, matchStats, players, fieldSeason, keeperSeason }),
    };
  } catch {
    return { status: "error" };
  }
}
