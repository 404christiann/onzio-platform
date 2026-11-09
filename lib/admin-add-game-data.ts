import type { SupabaseClient } from "@supabase/supabase-js";
import { clubToday } from "@/lib/club-time";
import { MATCH_TEXT_LIMITS } from "@/lib/match-text-limits";

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

/** A sponsor the "Sponsor?" question offers. */
export type AddGameSponsor = {
  name: string;
  logoUrl: string | null;
  logoAssetId: string | null;
  /** Only the latest game's sponsor has one; Sponsors-page sponsors have none. */
  link: string | null;
  from: "last-game" | "sponsors-page";
};

/** What a new game against this opponent reuses (ADMIN-RE-07b). */
export type AddGameOpponent = {
  /** opponentKey(name) */
  key: string;
  shortName: string | null;
  logoUrl: string | null;
  logoAssetId: string | null;
};

export type AddGameData = {
  seasons: AddGameSeason[];
  /** Today onward, soonest first, every season (the page shows the picked one). */
  upcoming: AddGameMatch[];
  /** The club's recent distinct venues, newest first: the "Last used" chips. */
  recentVenues: string[];
  /** The latest game's sponsor first (pre-filled), then the Sponsors page's. Empty where match sponsors are hidden. */
  sponsors: AddGameSponsor[];
  /** One entry per opponent the club has played with a short name or logo to reuse. */
  opponents: AddGameOpponent[];
};

/** How many "Last used" chips the form offers. */
export const RECENT_VENUE_LIMIT = 3;
/** Recent games read to find distinct venues. */
const RECENT_VENUE_SCAN = 50;
/** Upcoming games read for "Coming up". */
export const UPCOMING_LIMIT = 200;
/** Past games read per page, and pages at most, to remember opponents. */
const OPPONENT_PAGE = 1000;
const OPPONENT_PAGES = 5;

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

/** The same name whatever the case or outer spaces. */
function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase("en-US");
}

/** The same opponent whatever the case or outer spaces. */
export const opponentKey = nameKey;

function filled(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

type OpponentRow = {
  opponent: string;
  opponent_short_name: string | null;
  opponent_logo_url: string | null;
  opponent_logo_asset_id: string | null;
};

/**
 * Rows newest first. Each opponent keeps the newest short name and the newest
 * logo it was given, so a game added without them (the RE-07 form) does not
 * make the club lose them. A short name over the limit is not reused, because
 * a new game could not be saved with it.
 */
export function rememberOpponents(rows: readonly OpponentRow[]): AddGameOpponent[] {
  const byKey = new Map<string, AddGameOpponent>();
  for (const row of rows) {
    const key = opponentKey(row.opponent ?? "");
    if (!key) continue;
    const entry = byKey.get(key) ?? { key, shortName: null, logoUrl: null, logoAssetId: null };
    const shortName = filled(row.opponent_short_name);
    if (!entry.shortName && shortName && shortName.length <= MATCH_TEXT_LIMITS.opponent_short_name) {
      entry.shortName = shortName;
    }
    const logoUrl = filled(row.opponent_logo_url);
    if (!entry.logoUrl && logoUrl) {
      entry.logoUrl = logoUrl;
      entry.logoAssetId = row.opponent_logo_asset_id ?? null;
    }
    byKey.set(key, entry);
  }
  return [...byKey.values()].filter((entry) => entry.shortName || entry.logoUrl);
}

/** The columns a new game takes from an earlier game against the same opponent. */
export function opponentCarry(
  opponents: readonly AddGameOpponent[],
  name: string,
): Partial<Record<"opponent_short_name" | "opponent_logo_url" | "opponent_logo_asset_id", string | null>> {
  const key = opponentKey(name);
  const known = key ? opponents.find((entry) => entry.key === key) : undefined;
  if (!known) return {};
  return {
    ...(known.shortName ? { opponent_short_name: known.shortName } : {}),
    ...(known.logoUrl
      ? { opponent_logo_url: known.logoUrl, opponent_logo_asset_id: known.logoAssetId }
      : {}),
  };
}

type LatestSponsorRow = {
  sponsor_name: string | null;
  sponsor_logo_url: string | null;
  sponsor_logo_asset_id: string | null;
  sponsor_link: string | null;
};

type SponsorLogoRow = { name: string | null; logo_url: string | null; media_asset_id: string | null };

/** What a game's latest sponsor is called when it was saved with a logo but no name. */
export const UNNAMED_SPONSOR = "Sponsor from your last game";

/**
 * The latest game's sponsor (with its link) first, then each Sponsors-page
 * sponsor once (no link). A Sponsors-page sponsor with the latest game's name
 * is that same sponsor, so it is not offered twice.
 */
export function sponsorChoices(
  latest: LatestSponsorRow | null,
  sponsorsPage: readonly SponsorLogoRow[],
): AddGameSponsor[] {
  const choices: AddGameSponsor[] = [];
  const seen = new Set<string>();
  const latestName = filled(latest?.sponsor_name);
  const latestLogo = filled(latest?.sponsor_logo_url);
  if (latest && (latestName || latestLogo)) {
    choices.push({
      name: latestName ?? UNNAMED_SPONSOR,
      logoUrl: latestLogo,
      logoAssetId: latestLogo ? latest.sponsor_logo_asset_id ?? null : null,
      link: filled(latest.sponsor_link),
      from: "last-game",
    });
    if (latestName) seen.add(nameKey(latestName));
  }
  for (const row of sponsorsPage) {
    const name = filled(row.name);
    if (!name || seen.has(nameKey(name))) continue;
    seen.add(nameKey(name));
    const logoUrl = filled(row.logo_url);
    choices.push({
      name,
      logoUrl,
      logoAssetId: logoUrl ? row.media_asset_id ?? null : null,
      link: null,
      from: "sponsors-page",
    });
  }
  return choices;
}

/** The sponsor columns a new game is saved with; null for "No sponsor". */
export function sponsorPayload(sponsor: AddGameSponsor | null) {
  return {
    sponsor_name: sponsor && sponsor.name !== UNNAMED_SPONSOR ? sponsor.name : null,
    sponsor_logo_url: sponsor?.logoUrl ?? null,
    sponsor_logo_asset_id: sponsor?.logoUrl ? sponsor.logoAssetId : null,
    sponsor_link: sponsor?.link ?? null,
  };
}

async function readOpponentRows(supabase: SupabaseClient, clubId: string): Promise<OpponentRow[]> {
  const rows: OpponentRow[] = [];
  for (let page = 0; page < OPPONENT_PAGES; page += 1) {
    const { data, error } = await supabase
      .schema("onzio")
      .from("matches")
      .select("opponent,opponent_short_name,opponent_logo_url,opponent_logo_asset_id")
      .eq("club_id", clubId)
      .or("opponent_short_name.not.is.null,opponent_logo_url.not.is.null")
      .order("date", { ascending: false })
      .order("time", { ascending: false })
      .order("id", { ascending: true })
      .range(page * OPPONENT_PAGE, (page + 1) * OPPONENT_PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as OpponentRow[]));
    if ((data ?? []).length < OPPONENT_PAGE) break;
  }
  return rows;
}

async function readSponsors(supabase: SupabaseClient, clubId: string): Promise<AddGameSponsor[]> {
  const onzio = supabase.schema("onzio");
  const [latest, logos] = await Promise.all([
    onzio
      .from("matches")
      .select("sponsor_name,sponsor_logo_url,sponsor_logo_asset_id,sponsor_link")
      .eq("club_id", clubId)
      .order("date", { ascending: false })
      .order("time", { ascending: false })
      .limit(1)
      .maybeSingle(),
    onzio
      .from("site_sponsor_logos")
      .select("name,logo_url,media_asset_id")
      .eq("club_id", clubId)
      .order("placement", { ascending: true })
      .order("sort_order", { ascending: true }),
  ]);
  // A failed read offers less, never someone else's sponsor.
  return sponsorChoices(
    latest.error ? null : ((latest.data ?? null) as LatestSponsorRow | null),
    logos.error ? [] : ((logos.data ?? []) as SponsorLogoRow[]),
  );
}

export async function loadAddGameData(
  supabase: SupabaseClient,
  clubId: string,
  timeZone: string,
  { showSponsors, now = new Date() }: { showSponsors: boolean; now?: Date },
): Promise<AddGameData> {
  const onzio = supabase.schema("onzio");
  const [seasons, upcoming, recent, opponents, sponsors] = await Promise.all([
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
    // Side reads: when they fail the form still works, it just reuses nothing.
    readOpponentRows(supabase, clubId).then(rememberOpponents, () => []),
    showSponsors ? readSponsors(supabase, clubId).catch(() => []) : Promise.resolve([]),
  ]);
  if (seasons.error) throw seasons.error;

  return {
    seasons: ((seasons.data ?? []) as AddGameSeason[]).map(({ id, label, active }) => ({ id, label, active })),
    // A failed side read leaves the form usable: no list, no chips.
    upcoming: upcoming.error ? [] : ((upcoming.data ?? []) as MatchRow[]).map(toAddGameMatch),
    recentVenues: recent.error
      ? []
      : distinctVenues(((recent.data ?? []) as Array<{ venue: string | null }>).map((row) => row.venue)),
    sponsors,
    opponents,
  };
}
