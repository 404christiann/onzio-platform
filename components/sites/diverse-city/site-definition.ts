import { academyHref } from "./routes";

export const diverseCitySite = {
  id: "diverse-city",
  admin: {
    branding: { showFooterTagline: true },
    about: { closingCtaHref: academyHref("schedule"), showLogoPage: false, chooseClosingCtaDestination: false },
    programs: { routeVisible: true, showSlugField: false, allowCreation: false, showPageCopyEditor: false },
    tryouts: { routeVisible: true, showProgramAndHeroFields: false, showHeroImageField: true },
    contact: { routeVisible: true, showGenericHeroEditor: false, showContactPreviewSkeleton: true },
    sponsors: { showFooterPlacement: false },
    schedule: { showMatchSponsorFields: false },
    roster: { showInlineSeasonStats: false },
    standings: { useSampleFallback: false, preview: "academy-table", titleShowsOnNextMatch: true },
    // shopPageShows/homeFeatureShows: what AcademyShopPage and
    // AcademyHomeShopFeature render (they save up to 6 photos and 8 bullets).
    shop: { variants: ["home"], showHomeFeature: true, preview: "club-page", initialSurface: "shop", shopPageShows: { photos: 2, bullets: 2 }, homeFeatureShows: { photos: 2 } },
    homepage: { previewShell: "site-shell" },
  },
} as const;

export type DiverseCitySite = typeof diverseCitySite;
