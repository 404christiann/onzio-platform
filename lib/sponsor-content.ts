import type { DBSiteSponsorLogo, SponsorLogoPlacement } from "@/lib/db-types";
import { onzioMediaStoragePathFromPublicUrl } from "@/lib/media-url";

export const MAX_CAROUSEL_SPONSORS = 10;
export const MAX_FOOTER_SPONSORS = 6;

const SPONSOR_BASE =
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/sponsors`;

function sponsorLogo(filename: string) {
  return `${SPONSOR_BASE}/${encodeURIComponent(filename)}`;
}

const HOMEPAGE_ONLY = { show_on_homepage: true, show_in_footer: false, website_url: null } as const;

export const DEFAULT_CAROUSEL_SPONSORS: DBSiteSponsorLogo[] = [
  { id: "default-carousel-chronic", placement: "carousel", name: "Chronic Tacos", logo_url: sponsorLogo("Rose City FC 2027 Official Sponsor Chronic Tacos Logo Website.png"), sort_order: 0, created_at: "", ...HOMEPAGE_ONLY },
  { id: "default-carousel-modern", placement: "carousel", name: "Modern Woodmen", logo_url: sponsorLogo("Rose City FC 2027 Official Sponsor Modern Woodmen Logo Website white.png"), sort_order: 1, created_at: "", ...HOMEPAGE_ONLY },
  { id: "default-carousel-nikys", placement: "carousel", name: "Niky's Sports", logo_url: sponsorLogo("Rose City FC 2027 Official Sponsor Niky's Sports Logo Website white & blue.png"), sort_order: 2, created_at: "", ...HOMEPAGE_ONLY },
  { id: "default-carousel-planted", placement: "carousel", name: "Planted Beauty Rx", logo_url: sponsorLogo("Rose City FC 2027 Official Sponsor Planted Beauty Logo Website green.png"), sort_order: 3, created_at: "", ...HOMEPAGE_ONLY },
  { id: "default-carousel-tepito", placement: "carousel", name: "Tepito Coffee", logo_url: "/images/partners/tepitoSponsor.png", sort_order: 4, created_at: "", ...HOMEPAGE_ONLY },
  { id: "default-carousel-packshot", placement: "carousel", name: "The Pack Shot Agency", logo_url: sponsorLogo("Rose City FC 2027 Official Sponsor The Packshot Agency Logo Website white.png"), sort_order: 5, created_at: "", ...HOMEPAGE_ONLY },
];

export const DEFAULT_FOOTER_SPONSORS: DBSiteSponsorLogo[] = [
  { ...DEFAULT_CAROUSEL_SPONSORS[0], id: "default-footer-chronic", placement: "footer", show_on_homepage: false, show_in_footer: true, sort_order: 0 },
  { ...DEFAULT_CAROUSEL_SPONSORS[1], id: "default-footer-modern", placement: "footer", show_on_homepage: false, show_in_footer: true, sort_order: 1 },
  { ...DEFAULT_CAROUSEL_SPONSORS[2], id: "default-footer-nikys", placement: "footer", show_on_homepage: false, show_in_footer: true, sort_order: 2 },
  { ...DEFAULT_CAROUSEL_SPONSORS[3], id: "default-footer-planted", placement: "footer", show_on_homepage: false, show_in_footer: true, sort_order: 3 },
  { ...DEFAULT_CAROUSEL_SPONSORS[4], id: "default-footer-tepito", placement: "footer", show_on_homepage: false, show_in_footer: true, sort_order: 4 },
  { ...DEFAULT_CAROUSEL_SPONSORS[5], id: "default-footer-packshot", placement: "footer", show_on_homepage: false, show_in_footer: true, sort_order: 5 },
];

/** A sponsor name holds 60 characters (database CHECK site_sponsor_logos_name_length). */
export const SPONSOR_NAME_LIMIT = 60;
/** Their website holds 2,048 characters (database CHECK site_sponsor_logos_website_url_shape). */
export const SPONSOR_WEBSITE_LIMIT = 2_048;

/** The column for each place a logo can show. */
export const SPONSOR_PLACEMENT_SWITCH = {
  carousel: "show_on_homepage",
  footer: "show_in_footer",
} as const satisfies Record<SponsorLogoPlacement, keyof DBSiteSponsorLogo>;

export type DraftSponsorLogo = {
  id: string | null;
  name: string;
  logo_url: string;
};

type SponsorSwitches = { show_on_homepage?: boolean; show_in_footer?: boolean };

export type SponsorRowChanges = Partial<
  Pick<DBSiteSponsorLogo, "name" | "logo_url" | "sort_order" | "website_url" | "show_on_homepage" | "show_in_footer">
>;

export type SponsorLogoDiff = {
  /** Rows to delete: shown nowhere after this save. */
  toDelete: DBSiteSponsorLogo[];
  toInsert: Array<{ name: string; logo_url: string; sort_order: number } & SponsorSwitches & { website_url?: string | null }>;
  toUpdate: Array<{ id: string; changes: SponsorRowChanges }>;
};

export function sponsorLimitForPlacement(placement: SponsorLogoPlacement): number {
  return placement === "carousel" ? MAX_CAROUSEL_SPONSORS : MAX_FOOTER_SPONSORS;
}

export function canAddSponsorLogo(placement: SponsorLogoPlacement, count: number): boolean {
  return count < sponsorLimitForPlacement(placement);
}

export function defaultSponsorLogosForPlacement(placement: SponsorLogoPlacement): DBSiteSponsorLogo[] {
  return placement === "carousel" ? DEFAULT_CAROUSEL_SPONSORS : DEFAULT_FOOTER_SPONSORS;
}

/** The sponsors one place shows, in order. */
export function sponsorsForPlacement(
  placement: SponsorLogoPlacement,
  sponsors: readonly DBSiteSponsorLogo[],
): DBSiteSponsorLogo[] {
  const column = SPONSOR_PLACEMENT_SWITCH[placement];
  return sponsors.filter((sponsor) => sponsor[column]);
}

/** A name for a saved row: trimmed, cut at 60, never blank. */
export function savedSponsorName(name: string, index: number): string {
  return cutToCharacters(name.trim() || `Sponsor ${index + 1}`, SPONSOR_NAME_LIMIT).trim();
}

/** Characters as the database counts them (code points), not UTF-16 units. */
export function characterCount(text: string): number {
  return Array.from(text).length;
}

function cutToCharacters(text: string, limit: number): string {
  return Array.from(text).slice(0, limit).join("");
}

/** A name from a file name ("kims-hardware_logo.png" → "kims hardware logo"), within 60. */
export function sponsorNameFromFile(fileName: string): string {
  return cutToCharacters(fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim(), SPONSOR_NAME_LIMIT).trim();
}

/**
 * The classic Sponsors page edits one place at a time (the Carousel or Footer
 * tab) over the one list (ADMIN-RE-15). Removing a logo from a place turns that
 * place's switch off, and deletes the row only when no other place shows it.
 * The place's logos keep the positions they held in the list, in the tab's new
 * order; new logos go to the end.
 */
export function diffSponsorLogos(
  placement: SponsorLogoPlacement,
  all: readonly DBSiteSponsorLogo[],
  draft: readonly DraftSponsorLogo[],
): SponsorLogoDiff {
  const column = SPONSOR_PLACEMENT_SWITCH[placement];
  const otherColumn = SPONSOR_PLACEMENT_SWITCH[placement === "carousel" ? "footer" : "carousel"];
  const shown = sponsorsForPlacement(placement, all);
  const draftIds = new Set(draft.flatMap((logo) => (logo.id === null ? [] : [logo.id])));

  const toDelete: SponsorLogoDiff["toDelete"] = [];
  const toUpdate: SponsorLogoDiff["toUpdate"] = [];
  for (const row of shown) {
    if (draftIds.has(row.id)) continue;
    if (row[otherColumn]) toUpdate.push({ id: row.id, changes: { [column]: false } });
    else toDelete.push(row);
  }

  const kept = draft.filter((logo) => logo.id !== null && shown.some((row) => row.id === logo.id));
  const slots = shown
    .filter((row) => draftIds.has(row.id))
    .map((row) => row.sort_order)
    .sort((a, b) => a - b);
  const byId = new Map(all.map((row) => [row.id, row]));
  kept.forEach((logo, index) => {
    const row = byId.get(logo.id as string)!;
    const name = savedSponsorName(logo.name, draft.indexOf(logo));
    const changes: SponsorRowChanges = {};
    if (row.name !== name) changes.name = name;
    if (row.logo_url !== logo.logo_url) changes.logo_url = logo.logo_url;
    if (row.sort_order !== slots[index]) changes.sort_order = slots[index];
    if (Object.keys(changes).length) toUpdate.push({ id: row.id, changes });
  });

  let next = all.reduce((highest, row) => Math.max(highest, row.sort_order), -1) + 1;
  const toInsert: SponsorLogoDiff["toInsert"] = [];
  draft.forEach((logo, index) => {
    if (logo.id !== null) return;
    toInsert.push({
      name: savedSponsorName(logo.name, index),
      logo_url: logo.logo_url,
      sort_order: next++,
      show_on_homepage: column === "show_on_homepage",
      show_in_footer: column === "show_in_footer",
    });
  });

  return { toDelete, toInsert, toUpdate };
}

/** One sponsor on the one-list page (ADMIN-RE-15), as it is being edited. */
export type SponsorDraft = {
  /** Stable for React: the row id, or a temporary key for a logo not saved yet. */
  key: string;
  id: string | null;
  name: string;
  logo_url: string;
  /** What is typed in "Their website", as typed. */
  website: string;
  homepage: boolean;
  footer: boolean;
};

export function sponsorDraftFromRow(row: DBSiteSponsorLogo): SponsorDraft {
  return {
    key: row.id,
    id: row.id,
    name: row.name,
    logo_url: row.logo_url,
    website: row.website_url ?? "",
    homepage: row.show_on_homepage,
    footer: row.show_in_footer,
  };
}

export type SponsorWebsite = { ok: true; value: string | null } | { ok: false; message: string };

/**
 * "Their website" as it is saved: blank is none; an address without
 * http(s):// gets https://. Spaces, other schemes and addresses without a dot
 * are refused with a plain message.
 */
export function normalizeSponsorWebsite(input: string): SponsorWebsite {
  const text = input.trim();
  if (text === "") return { ok: true, value: null };
  const value = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  if (!/^https?:\/\/[^\s]+$/i.test(value)) {
    return { ok: false, message: "Use a web address like theirshop.com." };
  }
  let host = "";
  try {
    host = new URL(value).hostname;
  } catch {
    return { ok: false, message: "Use a web address like theirshop.com." };
  }
  if (!host.includes(".") || host.startsWith(".") || host.endsWith(".")) {
    return { ok: false, message: "Use a web address like theirshop.com." };
  }
  if (value.length > SPONSOR_WEBSITE_LIMIT) {
    return { ok: false, message: "That address is too long." };
  }
  return { ok: true, value };
}

/** The website as a card shows it: the domain only, cut with "…". */
export function sponsorWebsiteDomain(link: string, max = 30): string {
  const host = link.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0] ?? "";
  return host.length > max ? `${host.slice(0, max - 1)}…` : host;
}

export type SponsorListCounts = { homepage: number; footer: number };

export function sponsorListCounts(drafts: readonly Pick<SponsorDraft, "homepage" | "footer">[]): SponsorListCounts {
  return {
    homepage: drafts.filter((sponsor) => sponsor.homepage).length,
    footer: drafts.filter((sponsor) => sponsor.footer).length,
  };
}

export type SponsorDraftProblem = { key: string; field: "name" | "website"; message: string };

/** What blocks a save: a blank or long name, a website that is not one, a place over its limit. */
export function sponsorListProblems(drafts: readonly SponsorDraft[], footerShown: boolean): {
  fields: SponsorDraftProblem[];
  homepageOver: boolean;
  footerOver: boolean;
} {
  const fields: SponsorDraftProblem[] = [];
  for (const sponsor of drafts) {
    const name = sponsor.name.trim();
    if (name === "") fields.push({ key: sponsor.key, field: "name", message: "Give this sponsor a name." });
    else if (characterCount(sponsor.name) > SPONSOR_NAME_LIMIT) {
      fields.push({ key: sponsor.key, field: "name", message: `Names stop at ${SPONSOR_NAME_LIMIT} characters.` });
    }
    const website = normalizeSponsorWebsite(sponsor.website);
    if (!website.ok) fields.push({ key: sponsor.key, field: "website", message: website.message });
  }
  const counts = sponsorListCounts(drafts);
  return {
    fields,
    homepageOver: counts.homepage > MAX_CAROUSEL_SPONSORS,
    footerOver: footerShown && counts.footer > MAX_FOOTER_SPONSORS,
  };
}

/**
 * The writes one Save of the one-list page makes: the list's order is the
 * order on the page; a sponsor removed from the page is deleted. Call only
 * when sponsorListProblems found nothing.
 */
export function diffSponsorList(
  original: readonly DBSiteSponsorLogo[],
  drafts: readonly SponsorDraft[],
): SponsorLogoDiff {
  const ids = new Set(drafts.flatMap((sponsor) => (sponsor.id === null ? [] : [sponsor.id])));
  const byId = new Map(original.map((row) => [row.id, row]));
  const toDelete = original.filter((row) => !ids.has(row.id));
  const toInsert: SponsorLogoDiff["toInsert"] = [];
  const toUpdate: SponsorLogoDiff["toUpdate"] = [];

  drafts.forEach((sponsor, index) => {
    const website = normalizeSponsorWebsite(sponsor.website);
    const websiteUrl = website.ok ? website.value : null;
    const name = savedSponsorName(sponsor.name, index);
    if (sponsor.id === null) {
      toInsert.push({
        name,
        logo_url: sponsor.logo_url,
        sort_order: index,
        show_on_homepage: sponsor.homepage,
        show_in_footer: sponsor.footer,
        website_url: websiteUrl,
      });
      return;
    }
    const row = byId.get(sponsor.id);
    if (!row) return;
    const changes: SponsorRowChanges = {};
    if (row.name !== name) changes.name = name;
    if (row.logo_url !== sponsor.logo_url) changes.logo_url = sponsor.logo_url;
    if (row.sort_order !== index) changes.sort_order = index;
    if ((row.website_url ?? null) !== websiteUrl) changes.website_url = websiteUrl;
    if (row.show_on_homepage !== sponsor.homepage) changes.show_on_homepage = sponsor.homepage;
    if (row.show_in_footer !== sponsor.footer) changes.show_in_footer = sponsor.footer;
    if (Object.keys(changes).length) toUpdate.push({ id: row.id, changes });
  });

  return { toDelete, toInsert, toUpdate };
}

export function sponsorStoragePathFromPublicUrl(url: string): string | null {
  const onzioPath = onzioMediaStoragePathFromPublicUrl(url, "branding");
  if (onzioPath) return onzioPath;
  try {
    const parsed = new URL(url);
    const marker = "/storage/v1/object/public/sponsors/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex === -1) return null;
    const path = decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
    return path.startsWith("site-sponsors/") ? path : null;
  } catch {
    return null;
  }
}
