import type { DBSiteSponsorLogo, SponsorLogoPlacement } from "@/lib/db-types";
import { onzioMediaStoragePathFromPublicUrl } from "@/lib/media-url";

export const MAX_CAROUSEL_SPONSORS = 10;
export const MAX_FOOTER_SPONSORS = 6;

const SPONSOR_BASE =
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/sponsors`;

function sponsorLogo(filename: string) {
  return `${SPONSOR_BASE}/${encodeURIComponent(filename)}`;
}

export const DEFAULT_CAROUSEL_SPONSORS: DBSiteSponsorLogo[] = [
  { id: "default-carousel-chronic", placement: "carousel", name: "Chronic Tacos", logo_url: sponsorLogo("Rose City FC 2027 Official Sponsor Chronic Tacos Logo Website.png"), sort_order: 0, created_at: "" },
  { id: "default-carousel-modern", placement: "carousel", name: "Modern Woodmen", logo_url: sponsorLogo("Rose City FC 2027 Official Sponsor Modern Woodmen Logo Website white.png"), sort_order: 1, created_at: "" },
  { id: "default-carousel-nikys", placement: "carousel", name: "Niky's Sports", logo_url: sponsorLogo("Rose City FC 2027 Official Sponsor Niky's Sports Logo Website white & blue.png"), sort_order: 2, created_at: "" },
  { id: "default-carousel-planted", placement: "carousel", name: "Planted Beauty Rx", logo_url: sponsorLogo("Rose City FC 2027 Official Sponsor Planted Beauty Logo Website green.png"), sort_order: 3, created_at: "" },
  { id: "default-carousel-tepito", placement: "carousel", name: "Tepito Coffee", logo_url: "/images/partners/tepitoSponsor.png", sort_order: 4, created_at: "" },
  { id: "default-carousel-packshot", placement: "carousel", name: "The Pack Shot Agency", logo_url: sponsorLogo("Rose City FC 2027 Official Sponsor The Packshot Agency Logo Website white.png"), sort_order: 5, created_at: "" },
];

export const DEFAULT_FOOTER_SPONSORS: DBSiteSponsorLogo[] = [
  { ...DEFAULT_CAROUSEL_SPONSORS[0], id: "default-footer-chronic", placement: "footer", sort_order: 0 },
  { ...DEFAULT_CAROUSEL_SPONSORS[1], id: "default-footer-modern", placement: "footer", sort_order: 1 },
  { ...DEFAULT_CAROUSEL_SPONSORS[2], id: "default-footer-nikys", placement: "footer", sort_order: 2 },
  { ...DEFAULT_CAROUSEL_SPONSORS[3], id: "default-footer-planted", placement: "footer", sort_order: 3 },
  { ...DEFAULT_CAROUSEL_SPONSORS[4], id: "default-footer-tepito", placement: "footer", sort_order: 4 },
  { ...DEFAULT_CAROUSEL_SPONSORS[5], id: "default-footer-packshot", placement: "footer", sort_order: 5 },
];

export type DraftSponsorLogo = {
  id: string | null;
  name: string;
  logo_url: string;
};

export type SponsorLogoDiff = {
  toDelete: DBSiteSponsorLogo[];
  toInsert: Array<{ placement: SponsorLogoPlacement; name: string; logo_url: string; sort_order: number }>;
  toUpdate: Array<{ id: string; name: string; logo_url: string; sort_order: number }>;
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

export function diffSponsorLogos(
  placement: SponsorLogoPlacement,
  original: DBSiteSponsorLogo[],
  draft: DraftSponsorLogo[],
): SponsorLogoDiff {
  const draftIds = new Set(
    draft
      .filter((logo) => logo.id !== null)
      .map((logo) => logo.id as string),
  );
  const originalById = new Map(original.map((logo) => [logo.id, logo]));

  const toDelete = original.filter((logo) => !draftIds.has(logo.id));
  const toInsert: SponsorLogoDiff["toInsert"] = [];
  const toUpdate: SponsorLogoDiff["toUpdate"] = [];

  draft.forEach((logo, index) => {
    const name = logo.name.trim() || `Sponsor ${index + 1}`;

    if (logo.id === null) {
      toInsert.push({ placement, name, logo_url: logo.logo_url, sort_order: index });
      return;
    }

    const originalLogo = originalById.get(logo.id);
    if (!originalLogo) return;
    if (
      originalLogo.name !== name ||
      originalLogo.logo_url !== logo.logo_url ||
      originalLogo.sort_order !== index
    ) {
      toUpdate.push({ id: logo.id, name, logo_url: logo.logo_url, sort_order: index });
    }
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
