import type { ComponentType } from "react";
import { roseCitySite } from "@/components/sites/rose-city/site-definition";
import { siteFor } from "@/lib/site-for";
import RoseCityHomePage from "@/components/sites/rose-city/RoseCityHomePage";

/** Server-rendered public pages a club's site package supplies in place of the shared client pages. Server-only. */
export type SitePublicPages = { home?: ComponentType<any> };
const PUBLIC_PAGES: Readonly<Record<string, SitePublicPages>> = { [roseCitySite.id]: { home: RoseCityHomePage } };
export function publicPagesFor(club: Parameters<typeof siteFor>[0]): SitePublicPages | null {
  const site = siteFor(club);
  return site ? PUBLIC_PAGES[site.id] ?? null : null;
}
