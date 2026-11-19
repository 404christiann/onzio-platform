import type { ComponentType, ReactNode } from "react";
import { diverseCitySite } from "@/components/sites/diverse-city/site-definition";
import { roseCitySite } from "@/components/sites/rose-city/site-definition";
import { codeSiteFor, type CodeSiteInput } from "@/lib/code-site";

/**
 * The admin editors a club's site package supplies in place of the shared (default) ones. A shared page does one
 * lookup, `siteFor(club)?.adminEditors?.<page> ?? DefaultEditor`, and never branches on a club or template itself.
 */
export type SiteAdminEditors = {
  /** The Branding editor (/admin/branding). */
  branding?: ComponentType;
  /** The frame around Club settings (title, tabs, Save). Branding supplies its own; Team access renders inside it. */
  clubSettingsFrame?: ComponentType<{ active: "branding" | "team"; children: ReactNode }>;
};
export type SiteDefinition = { id: string; adminEditors?: SiteAdminEditors };

// Rose City is chosen by slug: its template key may not be read in new code (tests/architecture/template-selectors).
const SITES_BY_SLUG: Readonly<Record<string, SiteDefinition>> = { [roseCitySite.id]: roseCitySite };

export function siteFor(club: CodeSiteInput & Readonly<{ slug: string }>): SiteDefinition | null {
  if (Object.prototype.hasOwnProperty.call(SITES_BY_SLUG, club.slug)) return SITES_BY_SLUG[club.slug];
  return codeSiteFor(club) === diverseCitySite.id ? diverseCitySite : null;
}
