import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTeamAnalytics, type TeamAnalyticsData } from "@/lib/admin-analytics-data";
import type { ResultGame, SeasonRecord } from "@/lib/admin-analytics-view";
import { SCORE_GRACE_MINUTES, newSignUpsSince } from "@/lib/admin-home-data";
import { clubToday, formatClubDate, formatClubTime, isKickoffPast, parseKickoffTime } from "@/lib/club-time";

// ADMIN-RE-24b: what the new home shows beyond the job counts (design:
// admin-plain-search-two-clubs.html): the game a score is missing for, the next
// game, which forms the new sign-ups came through, and the season at a glance.
// Same rules as lib/admin-home-data.ts: the signed-in person's own client,
// every query scoped to the club, club time, and nothing personal (game names,
// form titles and counts only). Each part fails on its own; a failed part is
// left off the home rather than shown wrong.

export type BoardGame = {
  id: string;
  date: string;
  time: string | null;
  opponent: string;
  home: boolean | null;
  competition: string | null;
  venue: string | null;
};

export type HomeBoard = {
  /** The oldest game still missing a score (two hours after kickoff, club time). */
  missingScore: BoardGame | null;
  nextGame: BoardGame | null | "unknown";
  /** Titles of the forms this week's paid sign-ups came through, busiest first. */
  newSignUpForms: string[];
  season:
    | { status: "ready"; label: string; record: SeasonRecord; topScorer: { name: string; goals: number } | null; recent: ResultGame[] }
    | { status: "no-season" }
    | { status: "error" };
};

type MatchRow = BoardGame & { rose_city_score: number | null; opponent_score: number | null };

const MATCH_COLUMNS = "id,date,time,opponent,home,competition,venue,rose_city_score,opponent_score";

async function readSeasonGames(supabase: SupabaseClient, clubId: string): Promise<MatchRow[] | null> {
  const onzio = supabase.schema("onzio");
  const season = await onzio.from("seasons").select("id").eq("club_id", clubId).eq("active", true).maybeSingle();
  if (season.error) return null;
  const seasonId = (season.data as { id: string } | null)?.id;
  if (!seasonId) return [];
  const { data, error } = await onzio
    .from("matches")
    .select(MATCH_COLUMNS)
    .eq("club_id", clubId)
    .eq("season_id", seasonId)
    .order("date", { ascending: true })
    .order("time", { ascending: true, nullsFirst: false })
    .limit(500);
  if (error) return null;
  return (data ?? []) as MatchRow[];
}

function toBoardGame(row: MatchRow): BoardGame {
  return {
    id: row.id,
    date: row.date,
    time: row.time,
    opponent: row.opponent,
    home: row.home,
    competition: row.competition,
    venue: row.venue,
  };
}

/** The oldest game past its grace with no score, and the next game not yet kicked off. */
export function pickBoardGames(
  rows: readonly MatchRow[],
  timeZone: string,
  now: Date = new Date(),
): { missingScore: BoardGame | null; nextGame: BoardGame | null } {
  const today = clubToday(timeZone, now);
  const unscored = (row: MatchRow) => row.rose_city_score === null && row.opponent_score === null;
  // Same day, real kickoff order ("9:00 AM" before "10:00 AM"; the column is text).
  const kickoff = (row: MatchRow) => {
    const { hours, minutes } = parseKickoffTime(row.time);
    return hours * 60 + minutes;
  };
  const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date) || kickoff(a) - kickoff(b));
  const missing = ordered.find(
    (row) => unscored(row) && row.date <= today && isKickoffPast(row.date, row.time, timeZone, SCORE_GRACE_MINUTES, now),
  );
  // A game today with no time yet ("TBD") is still to come all day.
  const stillToCome = (row: MatchRow) =>
    row.date > today || (row.date === today && (!formatClubTime(row.time) || !isKickoffPast(row.date, row.time, timeZone, 0, now)));
  const next = ordered.find((row) => unscored(row) && stillToCome(row));
  return { missingScore: missing ? toBoardGame(missing) : null, nextGame: next ? toBoardGame(next) : null };
}

async function readNewSignUpForms(supabase: SupabaseClient, clubId: string, timeZone: string, now: Date): Promise<string[]> {
  const onzio = supabase.schema("onzio");
  const forms = await onzio.from("registration_forms").select("id,title").eq("club_id", clubId).is("archived_at", null);
  if (forms.error) return [];
  const titles = new Map(((forms.data ?? []) as { id: string; title: string }[]).map((form) => [form.id, form.title]));
  if (titles.size === 0) return [];
  const counts = new Map<string, number>();
  const pageSize = 500;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await onzio
      .from("registrations")
      .select("form_id")
      .eq("club_id", clubId)
      .eq("status", "paid")
      .gte("submitted_at", newSignUpsSince(timeZone, now))
      .order("id", { ascending: true })
      .range(start, start + pageSize - 1);
    if (error) return [];
    const page = (data ?? []) as { form_id: string }[];
    for (const row of page) if (titles.has(row.form_id)) counts.set(row.form_id, (counts.get(row.form_id) ?? 0) + 1);
    if (page.length < pageSize) break;
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => titles.get(id) as string);
}

export async function loadHomeBoard(
  supabase: SupabaseClient,
  clubId: string,
  timeZone: string,
  now: Date = new Date(),
  options: {
    /** RE-19's season read when the caller already has it (the Games tab). */
    team?: TeamAnalyticsData;
    /** False where the forms behind new sign-ups are not shown (the Games tab). */
    signUps?: boolean;
  } = {},
): Promise<HomeBoard> {
  const [games, forms, analytics] = await Promise.allSettled([
    readSeasonGames(supabase, clubId),
    options.signUps === false ? Promise.resolve([]) : readNewSignUpForms(supabase, clubId, timeZone, now),
    options.team ?? loadTeamAnalytics(supabase, clubId),
  ]);
  const rows = games.status === "fulfilled" ? games.value : null;
  const picked = rows ? pickBoardGames(rows, timeZone, now) : null;
  let season: HomeBoard["season"] = { status: "error" };
  if (analytics.status === "fulfilled") {
    const data = analytics.value;
    if (data.status === "ready") {
      const scorers = data.groups.flatMap((group) => group.players).filter((player) => player.goals > 0);
      const top = scorers.sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name))[0];
      season = {
        status: "ready",
        label: data.season.label,
        record: data.record,
        topScorer: top ? { name: top.name, goals: top.goals } : null,
        recent: data.games.slice(-8),
      };
    } else {
      season = data;
    }
  }
  return {
    missingScore: picked?.missingScore ?? null,
    nextGame: picked ? picked.nextGame : "unknown",
    newSignUpForms: forms.status === "fulfilled" ? forms.value : [],
    season,
  };
}

// ---------- Words (pure, shared by the home and the Games tab) ----------

const countFormat = new Intl.NumberFormat("en-US");
const plural = new Intl.PluralRules("en-US");

/** "Nothing needs you right now", "1 thing needs you", "3 things need you". */
export function needsSummary(count: number): string {
  if (count < 1) return "Nothing needs you right now";
  return plural.select(count) === "one" ? "1 thing needs you" : `${countFormat.format(count)} things need you`;
}

/** "Sat, Nov 7 · Home · UPSL Midwest Central" for a game row. */
export function gameLine(game: BoardGame, extra: "venue" | "competition" = "competition"): string {
  const parts = [formatClubDate(game.date, "weekday-short")];
  const time = formatClubTime(game.time);
  if (extra === "venue" && time) parts.push(time);
  if (game.home !== null) parts.push(game.home ? "Home" : "Away");
  if (extra === "venue" && game.venue) parts.push(game.venue);
  if (game.competition) parts.push(game.competition);
  return parts.filter(Boolean).join(" · ");
}

/** "vs Westside Strikers" at home, "at Westside Strikers" away. */
export function versus(game: Pick<BoardGame, "opponent" | "home">): string {
  return `${game.home === false ? "at" : "vs"} ${game.opponent}`;
}

/** "3 new sign-ups this week" and the forms they came through. */
export function signUpsNeed(count: number, forms: readonly string[]): { title: string; sub: string } {
  const words = plural.select(count) === "one" ? "new sign-up" : "new sign-ups";
  const shown = forms.slice(0, 2);
  const more = forms.length - shown.length;
  return {
    title: `${countFormat.format(count)} ${words} this week`,
    sub: shown.length ? `${shown.join(", ")}${more > 0 ? ` and ${countFormat.format(more)} more` : ""}` : "From your sign-up forms",
  };
}

/** "W8 D3 L1" for the glance card; the full words go to screen readers. */
export function recordShort(record: Pick<SeasonRecord, "won" | "drawn" | "lost">): string {
  return `W${record.won} D${record.drawn} L${record.lost}`;
}

/** Heights (0–1) for the results bars: scored above the line, let in below, on one scale. */
export function resultBars(games: readonly ResultGame[]): { id: string; up: number; down: number; label: string }[] {
  const most = Math.max(1, ...games.flatMap((game) => [game.us, game.them]));
  return games.map((game) => ({
    id: game.id,
    up: game.us / most,
    down: game.them / most,
    label: `${game.us}–${game.them} ${game.opponent}`,
  }));
}

/** The oldest game still missing a score, for the player page's "Enter score" row. */
export async function readMissingScoreGame(
  supabase: SupabaseClient,
  clubId: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<BoardGame | null> {
  try {
    const rows = await readSeasonGames(supabase, clubId);
    return rows ? pickBoardGames(rows, timeZone, now).missingScore : null;
  } catch {
    return null;
  }
}
