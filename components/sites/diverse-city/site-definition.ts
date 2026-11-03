import { academyHref } from "./routes";

export const diverseCitySite = {
  id: "diverse-city",
  admin: {
    about: { closingCtaHref: academyHref("schedule"), showLogoPage: false, chooseClosingCtaDestination: false },
    programs: { routeVisible: true, showSlugField: false, allowCreation: false, showPageCopyEditor: false },
    tryouts: { routeVisible: true, showProgramAndHeroFields: false, showHeroImageField: true },
    contact: { routeVisible: true, showGenericHeroEditor: false, showContactPreviewSkeleton: true },
    sponsors: { showFooterPlacement: false },
    schedule: { showMatchSponsorFields: false },
    roster: { showInlineSeasonStats: false },
    standings: { useSampleFallback: false, preview: "academy-table" },
    shop: { variants: ["home"], showHomeFeature: true, preview: "club-page", initialSurface: "shop" },
    homepage: { previewShell: "site-shell" },
  },
} as const;

export type DiverseCitySite = typeof diverseCitySite;
