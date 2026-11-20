import type { Fixture } from "@/lib/data";
import type { DBSiteSponsorLogo } from "@/lib/db-types";
import { fetchClubIdentity } from "@/lib/cinematic-identity";
import { fetchHomepageContent, fetchSchedule, fetchShopKitContent, fetchSiteSponsorLogos, type HomepageContent, type ShopKitContent } from "@/lib/queries";
import { latestResultFixture, nextHomeFixture } from "./next-home-fixture";

type Client = Parameters<typeof fetchHomepageContent>[1];

/**
 * Everything the cinematic home body needs for a complete first paint. Computed on the server so the page
 * never swaps a loading line for content after hydration. A null field means that read failed or found nothing,
 * and only that section degrades.
 */
export type CinematicHomeInitialData = {
  homepage: HomepageContent | null;
  fixture: Fixture | null;
  latest: Fixture | null;
  clubLabel: string;
  shop: ShopKitContent | null;
  sponsors: DBSiteSponsorLogo[];
};

const degrade = <T,>(label: string, fallback: T) => (error: unknown): T => { console.error(`Cinematic home ${label}:`, error); return fallback; };

export async function loadCinematicHomeData(clubId: string, client: Client, now = new Date()): Promise<CinematicHomeInitialData> {
  const [homepage, schedule, shop, sponsors] = await Promise.all([
    fetchHomepageContent(clubId, client).catch(degrade<HomepageContent | null>("content", null)),
    Promise.all([fetchSchedule(undefined, clubId, client), fetchClubIdentity(clubId, client)]).catch(degrade<null>("schedule", null)),
    fetchShopKitContent("home", "home", clubId, client).catch(degrade<ShopKitContent | null>("shop", null)),
    fetchSiteSponsorLogos("carousel", clubId, client).catch(degrade<DBSiteSponsorLogo[]>("sponsors", [])),
  ]);
  const [fixtures, identity] = schedule ?? [[] as Fixture[], null];
  return {
    homepage,
    fixture: nextHomeFixture(fixtures, now, identity?.timeZone || "UTC"),
    latest: latestResultFixture(fixtures),
    clubLabel: identity?.initials || "",
    shop,
    sponsors,
  };
}
