import type { SupabaseClient } from "@supabase/supabase-js";
import { gameNeedsScore } from "@/lib/admin-home-data";
import { clubToday, formatClubTime } from "@/lib/club-time";

// ADMIN-RE-06: what the Enter a score page shows. The same rule as the home's
// "N games need a score" hint (lib/admin-home-data.ts): a game in the active
// season with neither score, two hours after kickoff in club time. Reads go
// through the signed-in person's own client (RLS is the boundary) and are
// scoped to the club. Matches hold no personal details.

/** How many scored games "Earlier results" lists. */
export const EARLIER_RESULTS_LIMIT = 10;

export type ScoreGame = {
  id: string;
  opponent: string;
  home: boolean;
  /** "Sat, Nov 8 · 10:00 AM · League": date, time and competition when present. */
  when: string;
  /** "Sat, Nov 8", for Earlier results. */
  day: string;
  ourScore: number | null;
  theirScore: number | null;
};

export type ScorePageData =
  | { status: "ready"; seasonLabel: string | null; needScore: ScoreGame[]; earlier: ScoreGame[] }
  | { status: "error" };

type MatchRow = {
  id: string;
  date: string;
  time: string | null;
  opponent: string;
  home: boolean;
  competition: string | null;
  rose_city_score: number | null;
  opponent_score: number | null;
};

const MATCH_COLUMNS = "id,date,time,opponent,home,competition,rose_city_score,opponent_score";

const dayFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** A plain date as "Sat, Nov 8". The date is the club's own, so no zone shift. */
export function formatGameDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(parsed.getTime())
    ? dayFormat.format(parsed)
    : "";
}

function toGame(row: MatchRow): ScoreGame {
  const day = formatGameDay(row.date);
  const when = [day, formatClubTime(row.time), row.competition?.trim() || ""].filter(Boolean).join(" · ");
  return {
    id: row.id,
    opponent: row.opponent,
    home: row.home,
    when,
    day,
    ourScore: row.rose_city_score,
    theirScore: row.opponent_score,
  };
}

/** "Won 3–1", "Drew 1–1", "Lost 1–2"; null until both scores are in. */
export function resultLabel(ourScore: number | null, theirScore: number | null): string | null {
  if (ourScore === null || theirScore === null) return null;
  const outcome = ourScore > theirScore ? "Won" : ourScore < theirScore ? "Lost" : "Drew";
  return `${outcome} ${ourScore}–${theirScore}`;
}

export async function loadScorePageData(
  supabase: SupabaseClient,
  clubId: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<ScorePageData> {
  try {
    const onzio = supabase.schema("onzio");
    const season = await onzio
      .from("seasons")
      .select("id,label")
      .eq("club_id", clubId)
      .eq("active", true)
      .maybeSingle();
    if (season.error) return { status: "error" };
    const active = season.data as { id: string; label: string } | null;
    if (!active) return { status: "ready", seasonLabel: null, needScore: [], earlier: [] };

    const today = clubToday(timeZone, now);
    const [unscored, scored] = await Promise.all([
      onzio
        .from("matches")
        .select(MATCH_COLUMNS)
        .eq("club_id", clubId)
        .eq("season_id", active.id)
        .is("rose_city_score", null)
        .is("opponent_score", null)
        .lte("date", today)
        .order("date", { ascending: false })
        .order("time", { ascending: false }),
      onzio
        .from("matches")
        .select(MATCH_COLUMNS)
        .eq("club_id", clubId)
        .eq("season_id", active.id)
        .not("rose_city_score", "is", null)
        .not("opponent_score", "is", null)
        .order("date", { ascending: false })
        .order("time", { ascending: false })
        .limit(EARLIER_RESULTS_LIMIT),
    ]);
    if (unscored.error || scored.error) return { status: "error" };

    const needScore = ((unscored.data ?? []) as MatchRow[])
      // The home's rule: an untimed game today waits until tomorrow (ADMIN-RE-24d).
      .filter((row) => gameNeedsScore(row.date, row.time, timeZone, now))
      .map(toGame);
    const earlier = ((scored.data ?? []) as MatchRow[]).map(toGame);
    return { status: "ready", seasonLabel: active.label, needScore, earlier };
  } catch {
    return { status: "error" };
  }
}
