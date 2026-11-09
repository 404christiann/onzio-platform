import type { SupabaseClient } from "@supabase/supabase-js";
import {
  clubKickoffInstant,
  clubToday,
  DEFAULT_CLUB_TIME_ZONE,
  isKickoffPast,
} from "@/lib/club-time";

// ADMIN-RE-05: the numbers behind the reimagined home's big jobs. Reads go
// through the signed-in person's own client (RLS is the boundary), every query
// is scoped to the club, and nothing personal is selected: ids, dates, form ids
// and statuses only. Dates are the club's own (lib/club-time.ts).

/** A game needs a score once kickoff is this far behind us, in club time. */
export const SCORE_GRACE_MINUTES = 120;
/** Decision 10: "N new" counts paid sign-ups from the last seven days, in club time. */
export const NEW_SIGN_UP_DAYS = 7;

export type AdminHomeData = {
  /** Null when it could not be read: the tile shows no hint rather than a wrong one. */
  gamesNeedingScore: number | null;
  newSignUps: number | null;
  /** A non-archived sign-up form that is open or already has sign-ups. */
  hasLiveSignUps: boolean;
};

type Onzio = ReturnType<SupabaseClient["schema"]>;

function shiftPlainDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** The first moment of the seven-day window: midnight, club time, six days before today. */
export function newSignUpsSince(timeZone: string, now: Date = new Date()): string {
  const firstDay = shiftPlainDate(clubToday(timeZone, now), -(NEW_SIGN_UP_DAYS - 1));
  return clubKickoffInstant(firstDay, "00:00", timeZone).toISOString();
}

async function countGamesNeedingScore(
  onzio: Onzio,
  clubId: string,
  timeZone: string,
  now: Date,
): Promise<number | null> {
  const season = await onzio
    .from("seasons")
    .select("id")
    .eq("club_id", clubId)
    .eq("active", true)
    .maybeSingle();
  if (season.error) return null;
  const seasonId = (season.data as { id: string } | null)?.id;
  if (!seasonId) return 0;

  const { data, error } = await onzio
    .from("matches")
    .select("id,date,time")
    .eq("club_id", clubId)
    .eq("season_id", seasonId)
    .is("rose_city_score", null)
    .is("opponent_score", null)
    .lte("date", clubToday(timeZone, now))
    .order("date", { ascending: true });
  if (error) return null;
  return ((data ?? []) as Array<{ date: string; time: string | null }>).filter((match) =>
    isKickoffPast(match.date, match.time, timeZone, SCORE_GRACE_MINUTES, now),
  ).length;
}

async function countNewSignUps(
  onzio: Onzio,
  clubId: string,
  currentFormIds: ReadonlySet<string>,
  since: string,
): Promise<number> {
  const pageSize = 500;
  let count = 0;
  for (let start = 0; ; start += pageSize) {
    // Stable ordering keeps successive .range() windows from skipping or
    // double-counting rows (the same rule as readAllPaidRegistrations).
    const { data, error } = await onzio
      .from("registrations")
      .select("form_id")
      .eq("club_id", clubId)
      .eq("status", "paid")
      .gte("submitted_at", since)
      .order("id", { ascending: true })
      .range(start, start + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as Array<{ form_id: string }>;
    count += page.filter((row) => currentFormIds.has(row.form_id)).length;
    if (page.length < pageSize) return count;
  }
}

async function formsHaveSignUps(onzio: Onzio, clubId: string, formIds: string[]): Promise<boolean> {
  if (formIds.length === 0) return false;
  const { data, error } = await onzio
    .from("registrations")
    .select("id")
    .eq("club_id", clubId)
    .in("form_id", formIds)
    .in("status", ["paid", "refunded"])
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

async function readSignUps(
  onzio: Onzio,
  clubId: string,
  timeZone: string,
  now: Date,
): Promise<Pick<AdminHomeData, "newSignUps" | "hasLiveSignUps">> {
  const forms = await onzio
    .from("registration_forms")
    .select("id,status")
    .eq("club_id", clubId)
    .is("archived_at", null);
  // Unknown forms: no hint, and the quiet "Sign-up forms" row in More still
  // reaches the page.
  if (forms.error) return { newSignUps: null, hasLiveSignUps: false };
  const rows = (forms.data ?? []) as Array<{ id: string; status: string }>;
  const currentFormIds = new Set(rows.map((form) => form.id));

  const [newSignUps, hasLiveSignUps] = await Promise.allSettled([
    currentFormIds.size
      ? countNewSignUps(onzio, clubId, currentFormIds, newSignUpsSince(timeZone, now))
      : Promise.resolve(0),
    rows.some((form) => form.status === "open")
      ? Promise.resolve(true)
      : formsHaveSignUps(onzio, clubId, [...currentFormIds]),
  ]);
  return {
    newSignUps: newSignUps.status === "fulfilled" ? newSignUps.value : null,
    hasLiveSignUps: hasLiveSignUps.status === "fulfilled" ? hasLiveSignUps.value : false,
  };
}

export async function loadAdminHomeData(
  supabase: SupabaseClient,
  clubId: string,
  timeZone: string = DEFAULT_CLUB_TIME_ZONE,
  now: Date = new Date(),
): Promise<AdminHomeData> {
  const onzio = supabase.schema("onzio");
  const [games, signUps] = await Promise.allSettled([
    countGamesNeedingScore(onzio, clubId, timeZone, now),
    readSignUps(onzio, clubId, timeZone, now),
  ]);
  return {
    gamesNeedingScore: games.status === "fulfilled" ? games.value : null,
    ...(signUps.status === "fulfilled"
      ? signUps.value
      : { newSignUps: null, hasLiveSignUps: false }),
  };
}

/**
 * The signed-in person's own saved name for the greeting. RLS policy
 * club_members_self_read lets a member read only their own row; any problem
 * means no name, and the home says "Welcome back".
 */
export async function readOwnDisplayName(
  supabase: SupabaseClient,
  clubId: string,
  userId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .schema("onzio")
      .from("club_members")
      .select("display_name")
      .eq("club_id", clubId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (error || !data) return null;
    const name = (data as { display_name: unknown }).display_name;
    return typeof name === "string" && name.trim() ? name : null;
  } catch {
    return null;
  }
}

const countFormat = new Intl.NumberFormat("en-US");
const pluralRules = new Intl.PluralRules("en-US");

/** "1 game needs a score", "1,284 games need a score"; nothing for zero or unknown. */
export function gamesNeedingScoreHint(count: number | null): string | null {
  if (count === null || count < 1) return null;
  const phrase = pluralRules.select(count) === "one" ? "game needs" : "games need";
  return `${countFormat.format(count)} ${phrase} a score`;
}

/** "3 new", "1,284 new"; nothing for zero or unknown. */
export function newSignUpsHint(count: number | null): string | null {
  if (count === null || count < 1) return null;
  return `${countFormat.format(count)} new`;
}
