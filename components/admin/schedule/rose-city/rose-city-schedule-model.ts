import type { Fixture } from "@/lib/data";
import { EMPTY_MATCH_SUMMARY, matchSummaryColumns, readMatchSummary } from "@/lib/match-summary";
import { matchReplayEmbedUrl } from "@/lib/youtube-embed";
import {
  MAX_MATCH_SCORE, matchTooLong, normalizeScore, formatShortDate, hasResult, type FormState, type Match,
} from "@/components/admin/schedule/schedule-model";

/**
 * Pure rules for the Rose City Schedule editor. The validation and the write payloads are the ones the classic
 * Schedule page builds today for a cinematic@2 club (app/admin/(protected)/schedule/page.tsx), so the same edit sends
 * the same bytes. tests/contracts/rose-city-schedule-editor.test.ts compares them with a transcription of that code.
 */

export const MATCH_SECTIONS = [
  { id: "match", title: "Match" },
  { id: "result", title: "Result and stream" },
  { id: "summary", title: "Match summary" },
  { id: "sponsor", title: "Presented by" },
] as const;
export type MatchSectionId = (typeof MATCH_SECTIONS)[number]["id"];

/** A match key is the match id; a match not saved yet has a "new:" key. */
export const NEW_KEY_PREFIX = "new:";
export const isNewKey = (key: string) => key.startsWith(NEW_KEY_PREFIX);

/** The form the classic editor opens for a saved match (startEdit in the classic page). */
export function formFromMatch(m: Match): FormState {
  return {
    date: m.date, time: m.time, opponent: m.opponent,
    opponent_short_name: m.opponent_short_name,
    opponent_logo_url: m.opponent_logo_url, competition: m.competition ?? "",
    league_logo_url: m.league_logo_url ?? null,
    sponsor_name: m.sponsor_name, sponsor_logo_url: m.sponsor_logo_url,
    sponsor_link: m.sponsor_link,
    home: m.home, venue: m.venue, address: m.address ?? "",
    city: m.city ?? "", state: m.state ?? "",
    rose_city_score: m.rose_city_score, opponent_score: m.opponent_score,
    replay_video_url: m.replay_video_url ?? null,
    attendance: m.attendance ?? null,
    summary: readMatchSummary(m.summary) ?? structuredClone(EMPTY_MATCH_SUMMARY),
    season_id: m.season_id,
  };
}

/** The first thing wrong with a match, in the words the classic editor uses, or null. */
export function validateMatchForm(form: FormState): string | null {
  if (!form.season_id) return "Season is required.";
  if (!form.date)     return "Date is required.";
  if (!form.time)     return "Time is required.";
  if (!form.opponent.trim()) return "Opponent is required.";
  if (!form.venue.trim())    return "Venue is required.";
  const tooLong = matchTooLong(form);
  if (tooLong) return tooLong;
  if ([form.rose_city_score, form.opponent_score].some((score) => score !== null && score > MAX_MATCH_SCORE)) {
    return `Scores can be at most ${MAX_MATCH_SCORE}.`;
  }
  const roseCityScore = form.rose_city_score;
  const opponentScore = form.opponent_score;
  const hasRoseCityScore = roseCityScore !== null;
  const hasOpponentScore = opponentScore !== null;
  if (hasRoseCityScore !== hasOpponentScore) {
    return "Enter both scores, or leave both blank.";
  }
  if (
    (roseCityScore !== null && (!Number.isInteger(roseCityScore) || roseCityScore < 0)) ||
    (opponentScore !== null && (!Number.isInteger(opponentScore) || opponentScore < 0))
  ) {
    return "Scores must be whole numbers of 0 or higher.";
  }
  if (form.sponsor_logo_url && !form.sponsor_name?.trim()) {
    return "Sponsor name is required when a sponsor logo is uploaded.";
  }
  if (form.sponsor_link?.trim()) {
    try {
      const sponsorUrl = new URL(form.sponsor_link);
      if (!['http:', 'https:'].includes(sponsorUrl.protocol)) throw new Error();
    } catch {
      return "Sponsor website link must be a valid http or https address.";
    }
  }
  if (matchReplayEmbedUrl(form.replay_video_url ?? "") === null) {
    return "The stream or replay video must be a YouTube video link, like https://youtu.be/…";
  }
  if (form.attendance !== null && (!Number.isInteger(form.attendance) || form.attendance < 0)) {
    return "Attendance must be a whole number of 0 or higher.";
  }
  return null;
}

/**
 * The row a save writes, for insert and update alike. Key order matters: it is what the classic page sends for a
 * cinematic@2 club (summaryColumnsFor with isCinematic, then the trimmed overrides).
 */
export function buildMatchWrite(form: FormState) {
  const { summary, attendance, ...rest } = form;
  return {
    ...rest, attendance, ...matchSummaryColumns(summary),
    address: form.address?.trim() || null,
    city: form.city?.trim() || null,
    state: form.state?.trim() || null,
    rose_city_score: normalizeScore(form.rose_city_score),
    opponent_score: normalizeScore(form.opponent_score),
    opponent_short_name: form.opponent_short_name?.trim() || null,
    competition: form.competition?.trim() || null,
    sponsor_name: form.sponsor_name?.trim() || null,
    sponsor_logo_url: form.sponsor_logo_url?.trim() || null,
    sponsor_link: form.sponsor_link?.trim() || null,
    replay_video_url: matchReplayEmbedUrl(form.replay_video_url ?? "") || null,
  };
}

export const sameForm = (a: FormState, b: FormState) => JSON.stringify(a) === JSON.stringify(b);

/** Keys whose draft differs from its starting form, in the order given. */
export function changedKeys(order: readonly string[], drafts: Record<string, FormState>, baselines: Record<string, FormState>): string[] {
  return order.filter(key => drafts[key] && baselines[key] && !sameForm(drafts[key], baselines[key]));
}

/** What the public Schedule shows for this form: the same mapping lib/queries.ts mapFixture applies to the saved row. */
export function fixtureFromForm(id: string, form: FormState): Fixture {
  const row = buildMatchWrite(form);
  return {
    id, date: row.date, time: row.time, opponent: row.opponent,
    opponentShortName: row.opponent_short_name,
    opponentLogoUrl: row.opponent_logo_url, competition: row.competition,
    sponsorName: row.sponsor_name, sponsorLogoUrl: row.sponsor_logo_url,
    sponsorLink: row.sponsor_link,
    home: row.home, venue: row.venue, address: row.address ?? undefined,
    city: row.city, state: row.state,
    roseCityScore: row.rose_city_score,
    opponentScore: row.opponent_score,
    attendance: row.attendance,
    scorers: row.scorers ?? [],
    leagueLogoUrl: row.league_logo_url,
    replayVideoUrl: row.replay_video_url,
    summary: row.summary,
  };
}

export function matchTitle(form: Pick<FormState, "home" | "opponent">, max = 40) {
  const name = form.opponent.trim() || "Opponent";
  return `${form.home ? "vs" : "@"} ${name.length > max ? `${name.slice(0, max - 1)}…` : name}`;
}

export function matchLabel(form: FormState) {
  return `${matchTitle(form)}${form.date ? ` · ${formatShortDate(form.date)}` : ""}`;
}

/** "12 events · 16 stats" from the summary the list already reads, or null when nothing is filled in. */
export function summaryLine(form: FormState): string | null {
  const { events, stats } = form.summary;
  if (!events.length && !stats.length) return null;
  const part = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return [events.length ? part(events.length, "event") : null, stats.length ? part(stats.length, "stat") : null].filter(Boolean).join(" · ");
}

/** The saved row's fields after a save, so the list shows them before the reload answers. */
export function matchRowAfterSave(id: string, form: FormState): Match {
  const row = buildMatchWrite(form);
  return {
    id, date: row.date, time: row.time, opponent: row.opponent, opponent_short_name: row.opponent_short_name,
    opponent_logo_url: row.opponent_logo_url, competition: row.competition, league_logo_url: row.league_logo_url,
    sponsor_name: row.sponsor_name, sponsor_logo_url: row.sponsor_logo_url, sponsor_link: row.sponsor_link,
    home: row.home, venue: row.venue, address: row.address, city: row.city, state: row.state,
    rose_city_score: row.rose_city_score, opponent_score: row.opponent_score, replay_video_url: row.replay_video_url,
    attendance: row.attendance, summary: row.summary, season_id: row.season_id,
  };
}

export { hasResult };
