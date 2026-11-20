import { fetchClubIdentity } from "@/lib/cinematic-identity";
import type { Fixture } from "@/lib/data";
import { fetchSchedule, fetchSiteSocialLinks } from "@/lib/queries";
import type { supabase } from "@/lib/supabase";
import { nextHomeFixture } from "./next-home-fixture";
import { cinematicDisplaySocialLinks, cinematicSocialPlatform } from "./social-platform";

/** `youtubeChannel` is the club's YouTube link from Branding: where the watch line goes when no game-day stream link is set. */
export type KnowBeforeYouGoMatch = { loading: boolean; fixture: Fixture | null; clubShortName: string; youtubeChannel?: string };

/** The match box for Know Before You Go: Schedule's next home match, the club's short name and its YouTube channel. */
export async function loadKnowBeforeYouGoMatch(clubId: string, timeZone: string, now: Date, client?: typeof supabase): Promise<KnowBeforeYouGoMatch> {
  // Social links are optional here: if they fail to load, the watch line just has no fallback link.
  const socials = fetchSiteSocialLinks(clubId, client).catch(() => []);
  const [fixtures, identity, links] = await Promise.all([fetchSchedule(undefined, clubId, client), fetchClubIdentity(clubId, client), socials]);
  const youtubeChannel = cinematicDisplaySocialLinks(links).find(link => cinematicSocialPlatform(link) === "youtube" && link.href.startsWith("https://"))?.href ?? "";
  return { loading: false, fixture: nextHomeFixture(fixtures, now, timeZone), clubShortName: identity?.shortName ?? "", youtubeChannel };
}
