export const diverseCitySite = {
  id: "diverse-city",
  admin: {
    about: { closingCtaHref: "/schedule", showLogoPage: false, chooseClosingCtaDestination: false },
    programs: { routeVisible: true, showSlugField: false, allowCreation: false, showPageCopyEditor: false },
    tryouts: { routeVisible: true, showProgramAndHeroFields: false, showHeroImageField: true },
    contact: { routeVisible: true, showGenericHeroEditor: false, showContactPreviewSkeleton: true },
    sponsors: { showFooterPlacement: false },
    schedule: { showMatchSponsorFields: false },
    roster: { showInlineSeasonStats: false },
    standings: { useSampleFallback: false, preview: "academy-table" },
    shop: { variants: ["home"], showHomeFeature: true, preview: "academy", initialSurface: "shop" },
    homepage: {
      previewShell: "academy",
      slideshowVariant: "none",
      heroVariant: "editable",
      editableSections: ["hero", "story"],
      heroEditableFields: [
        "eyebrow", "headline_line_one", "headline_line_two", "intro",
        "primary_cta_label", "primary_cta_href", "secondary_cta_label", "secondary_cta_href",
      ],
      photoCaptionEditable: false,
      storyTextTarget: null,
      shopTargetSurface: "home",
      programsTarget: { owner: "programs", editorHref: "/admin/programs" },
    },
  },
} as const;

export type DiverseCitySite = typeof diverseCitySite;
