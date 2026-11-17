import { formatClubDate } from "@/lib/club-time";
import { createClient } from "@/lib/admin-client";
import { MATCH_TEXT_LIMITS } from "@/lib/match-text-limits";
import { deleteStorageUrls } from "@/lib/storage-cleanup";
import { EMPTY_MATCH_SUMMARY, type MatchSummary } from "@/lib/match-summary";

export type Match = {
  id: string;
  date: string;
  time: string;
  opponent: string;
  opponent_short_name: string | null;
  opponent_logo_url: string | null;
  competition: string | null;
  league_logo_url: string | null;
  sponsor_name: string | null;
  sponsor_logo_url: string | null;
  sponsor_link: string | null;
  home: boolean;
  venue: string;
  address: string | null;
  city: string | null;
  state: string | null;
  rose_city_score: number | null;
  opponent_score: number | null;
  replay_video_url: string | null;
  attendance: number | null;
  /** Stored Match Summary (lib/match-summary.ts); read safely when a match is opened. */
  summary: unknown;
  season_id: string;
};

export type FormState = Omit<Match, "id" | "summary"> & { summary: MatchSummary };

export type ResultFilter = "all" | "home" | "away" | "missing";

export function emptyForm(seasonId = ""): FormState {
  return {
    date: "", time: "", opponent: "", opponent_short_name: null, opponent_logo_url: null, competition: "", league_logo_url: null,
    sponsor_name: null, sponsor_logo_url: null, sponsor_link: null,
    home: true, venue: "", address: "", city: "", state: "",
    rose_city_score: null, opponent_score: null, replay_video_url: null, attendance: null, summary: structuredClone(EMPTY_MATCH_SUMMARY), season_id: seasonId,
  };
}

// ADMIN-RE-07c: /api/admin/data and the database hold every saved game to
// these text limits (lib/match-text-limits.ts) and cap a score at 99.
export const MAX_MATCH_SCORE = 99;
const MATCH_FIELD_LABELS: Record<keyof typeof MATCH_TEXT_LIMITS, string> = {
  opponent: "Opponent name",
  opponent_short_name: "Short name",
  venue: "Venue name",
  competition: "Competition",
  address: "Street address",
  city: "City",
  state: "State",
};

export function matchTooLong(form: FormState): string | null {
  for (const field of Object.keys(MATCH_TEXT_LIMITS) as Array<keyof typeof MATCH_TEXT_LIMITS>) {
    const value = form[field];
    if (typeof value === "string" && value.length > MATCH_TEXT_LIMITS[field]) {
      return `${MATCH_FIELD_LABELS[field]} can be at most ${MATCH_TEXT_LIMITS[field]} characters.`;
    }
  }
  return null;
}

export function normalizeScore(value: number | null): number | null {
  return value === null || Number.isNaN(value) ? null : value;
}

export function parseDateInput(value: string): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

export function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** "2026-03-15" -> "March 2026". Never shifts a day relative to the plain date
 * stored on the match (lib/club-time.ts). Falls back to a literal "Undated"
 * bucket for a match saved without a date. */
export function monthGroupKey(dateValue: string): string {
  return formatClubDate(dateValue, "month-year") ?? "Undated";
}

export function hasResult(match: Pick<Match, "rose_city_score" | "opponent_score">): boolean {
  return match.rose_city_score !== null && match.opponent_score !== null;
}

/** "2026-03-14" -> "Sat 14". Used in the row list, where the month is
 * already established by the group header above it. */
export function formatRowDate(dateValue: string): string {
  return formatClubDate(dateValue, "weekday-day") ?? "No date";
}

/** "2026-03-14" -> "Sat 14 Mar". Used in the edit panel, which has no
 * surrounding month context of its own. */
export function formatShortDate(dateValue: string): string {
  return formatClubDate(dateValue, "weekday-day-month") ?? "No date";
}

/** "18:00" -> "6:00 PM" */
export function formatTime12h(timeValue: string): string {
  if (!timeValue) return "";
  const [hourStr, minStr] = timeValue.split(":");
  const minutes = parseInt(minStr ?? "0", 10);
  let hours = parseInt(hourStr ?? "", 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return timeValue;
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${String(minutes).padStart(2, "0")} ${ampm}`;
}

export const LOGO_FILE_GUIDANCE = "Choose a PNG or WebP logo.";

export function logoUploadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.includes("UNSUPPORTED_MEDIA_TYPE")) return LOGO_FILE_GUIDANCE;
  return error instanceof Error ? error.message : "Upload failed";
}

export async function uploadPhoto(file: File, bucket: string, folder: string): Promise<string> {
  const supabase = createClient();
  const extension = file.name.split(".").pop() ?? "jpg";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file);
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteUnusedMatchImageUrls({
  bucket,
  urls,
  column,
  allowedPrefixes,
}: {
  bucket: string;
  urls: Array<string | null | undefined>;
  column: "opponent_logo_url" | "sponsor_logo_url" | "league_logo_url";
  allowedPrefixes: string[];
}) {
  const supabase = createClient();
  const unusedUrls: string[] = [];

  for (const url of urls) {
    if (!url) continue;
    const { count, error } = await supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq(column, url);
    if (error) throw new Error(error.message);
    if ((count ?? 0) === 0) unusedUrls.push(url);
  }

  await deleteStorageUrls(bucket, unusedUrls, allowedPrefixes);
}

