import { headers } from "next/headers";
import type { MetadataRoute } from "next";
import { getClubContextBySlug } from "@/lib/club-context";
import { SITE_INDEXABLE_HEADER } from "@/lib/robots";

// Pages every club serves with a 200. Template-specific pages (cinematic
// tickets/stadium/news, Academy programs) are not listed: choosing them means
// asking which template a club uses, which the template-selector ratchet
// forbids here; crawlers reach them from the home page's links.
const COMMON_PAGES = ["/", "/roster", "/schedule", "/stats", "/sponsors", "/staff", "/club/about"];

// The club's public pages on its canonical host, or nothing: the same
// middleware decision that drives the robots header and robots.txt.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const slug = requestHeaders.get("x-onzio-club-slug");
  if (requestHeaders.get(SITE_INDEXABLE_HEADER) !== "1" || !host || !slug) return [];

  const club = await getClubContextBySlug(slug);
  const paths = club.storeEnabled ? [...COMMON_PAGES, "/shop"] : COMMON_PAGES;
  return paths.map((path) => ({ url: `https://${host}${path === "/" ? "" : path}` }));
}
