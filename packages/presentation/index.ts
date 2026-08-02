import { z } from "zod";

export type PresentationSurface = "mockup" | "operator_preview" | "production";
export type TemplateKey =
  | "cinematic@1"
  | "heritage@1"
  | "clubhouse@1"
  | "academy@1";
export type TemplateId = "cinematic" | "heritage" | "clubhouse" | "academy";
export type ProvenanceStatus =
  | "verified_public_source"
  | "club_supplied"
  | "operator_approved"
  | "sample"
  | "unresolved";

export type PresentationErrorCode =
  | "PRESENTATION_INVALID_SCHEMA"
  | "PRESENTATION_UNKNOWN_TEMPLATE"
  | "PRESENTATION_UNKNOWN_FONT_PACK"
  | "PRESENTATION_UNKNOWN_SECTION"
  | "PRESENTATION_UNKNOWN_ROUTE"
  | "PRESENTATION_UNKNOWN_MODULE"
  | "PRESENTATION_UNSUPPORTED_SECTION"
  | "PRESENTATION_UNSAFE_CONFIGURATION";

export class PresentationError extends Error {
  readonly code: PresentationErrorCode;

  constructor(code: PresentationErrorCode, message: string) {
    super(message);
    this.name = "PresentationError";
    this.code = code;
  }
}

const semanticColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "colors must be normalized hex values")
  .transform((value) => value.toUpperCase());

const provenanceStatusSchema = z.enum([
  "verified_public_source",
  "club_supplied",
  "operator_approved",
  "sample",
  "unresolved",
]);

const provenancedValueSchema = z.object({
  value: z.unknown(),
  status: provenanceStatusSchema,
  sourceRef: z.string().min(1).max(500).optional(),
  suppliedBy: z.string().min(1).max(200).optional(),
  reviewedBy: z.string().min(1).max(200).optional(),
  reviewedAt: z.string().datetime().optional(),
  notes: z.string().max(1_000).optional(),
});

const sectionSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  type: z.string().regex(/^[a-z]+\.[a-z0-9-]+$/),
  enabled: z.boolean(),
  emptyBehavior: z.enum(["hide", "fallback", "error"]),
  config: z.record(z.string(), z.unknown()).default({}),
  provenance: z.record(z.string(), provenancedValueSchema).optional(),
});

const documentSchema = z.object({
  schemaVersion: z.literal(1),
  template: z.object({
    id: z.enum(["cinematic", "heritage", "clubhouse", "academy"]),
    version: z.literal(1),
  }),
  fontPack: z.string(),
  theme: z.object({
    surface: z.object({
      canvas: semanticColor,
      elevated: semanticColor,
      subtle: semanticColor,
      inverse: semanticColor,
    }),
    text: z.object({
      primary: semanticColor,
      secondary: semanticColor,
      muted: semanticColor,
      inverse: semanticColor,
    }),
    action: z.object({
      primary: semanticColor,
      primaryHover: semanticColor,
      primaryText: semanticColor,
      secondary: semanticColor,
    }),
    border: z.object({
      subtle: semanticColor,
      strong: semanticColor,
    }),
    status: z.object({
      success: semanticColor,
      warning: semanticColor,
      danger: semanticColor,
    }),
    accent: z
      .object({
        one: semanticColor.optional(),
        two: semanticColor.optional(),
      })
      .optional(),
  }),
  modules: z.record(z.string(), z.boolean()),
  homepage: z.object({
    sections: z.array(sectionSchema).min(1),
  }),
  navigation: z.object({
    groups: z.array(
      z.object({
        id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        label: z.string().min(1).max(80).nullable(),
        routes: z.array(z.string()).min(1),
      }),
    ),
  }),
  metadata: z.object({
    recommendationId: z.string().min(1).nullable(),
    createdBy: z.string().uuid(),
    createdAt: z.string().datetime(),
    sourceArtifact: z.string().min(1).nullable(),
  }),
});

export type PresentationDocument = z.infer<typeof documentSchema>;
export type ProvenancedValue<T> = Omit<
  z.infer<typeof provenancedValueSchema>,
  "value"
> & { value: T };

export type SectionRegistration = {
  type: string;
  version: 1;
  scope: "shared" | "cinematic" | "heritage" | "clubhouse" | "academy";
  contentDomain: string;
  compatibleTemplates: TemplateKey[];
  requiredModule: string | null;
  requiredEntitlement: "starter" | "pro" | null;
  cardinality: "single" | "many";
  emptyBehavior: "hide" | "fallback" | "error";
  productionProvenance: ProvenanceStatus[];
};

export type TemplateRegistration = {
  id: TemplateId;
  version: 1;
  key: TemplateKey;
  displayName: string;
  originNote: string;
  defaultFontPack: string;
  compatibleFontPacks: string[];
  defaultSections: string[];
  supportedSections: string[];
  defaultRoutes: string[];
  supportedRoutes: string[];
  supportedModules: string[];
};

export type ValidationIssue = {
  code: PresentationErrorCode | "PRESENTATION_WARNING";
  path: string;
  message: string;
};

export type ValidationReport = {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};

export type CompatibilityReport = {
  fromTemplate: TemplateKey;
  toTemplate: TemplateKey;
  mappedSections: string[];
  disabledSections: string[];
  mappedRoutes: string[];
  disabledRoutes: string[];
  missingModules: string[];
  preservedUnsupported: {
    sections: PresentationDocument["homepage"]["sections"];
    routes: string[];
  };
};

export type PlaceholderSuggestion = {
  sectionType: string;
  reason: string;
};

export type ReadinessRecommendation = {
  recommendedTemplate: TemplateKey;
  scoreBand: "limited" | "developing" | "strong";
  realApprovedPhotoCount: number;
  reasons: string[];
  warnings: string[];
  suggestedPlaceholderAssignments: PlaceholderSuggestion[];
  evaluatedAt: string;
};

export type ReadinessPhoto = {
  id: string;
  kind: "photo" | "logo" | "sponsor" | "graphic";
  approved: boolean;
  duplicateOf: string | null;
  accessible: boolean;
  sample: boolean;
};

export type FontPackRegistration = {
  key: string;
  displayName: string;
  compatibleTemplates: TemplateKey[];
};

export const fontPacks: Record<string, FontPackRegistration> = {
  "bebas-inter": {
    key: "bebas-inter",
    displayName: "Bebas Neue + Inter",
    compatibleTemplates: [
      "cinematic@1",
      "heritage@1",
      "clubhouse@1",
      "academy@1",
    ],
  },
  "archivo-sora": {
    key: "archivo-sora",
    displayName: "Archivo + Sora",
    compatibleTemplates: ["heritage@1"],
  },
  "geist": {
    key: "geist",
    displayName: "Geist",
    compatibleTemplates: ["clubhouse@1"],
  },
  // DCFC-D104: no existing pack matched the approved academy@1 type stack --
  // Montserrat headings, Inter body/UI, DM Sans desktop navigation.
  "montserrat-inter-dmsans": {
    key: "montserrat-inter-dmsans",
    displayName: "Montserrat + Inter + DM Sans",
    compatibleTemplates: ["academy@1"],
  },
} as const;

export const routeRegistry = {
  home: { path: "/" },
  roster: { path: "/roster" },
  schedule: { path: "/schedule" },
  club: { path: "/club/about" },
  "club-logo": { path: "/club/logo" },
  store: { path: "/shop" },
  sponsors: { path: "/sponsors" },
  staff: { path: "/staff" },
  standings: { path: "/standings" },
  stats: { path: "/stats" },
  tryouts: { path: "/tryouts" },
  programs: { path: "/programs" },
  contact: { path: "/contact" },
} as const;

export const moduleRegistry = {
  roster: { entitlement: "starter" },
  schedule: { entitlement: "starter" },
  store: { entitlement: "starter" },
  sponsors: { entitlement: "starter" },
  staff: { entitlement: "pro" },
  affiliations: { entitlement: "starter" },
  standings: { entitlement: "pro" },
  stats: { entitlement: "pro" },
  expandedProfiles: { entitlement: "pro" },
  seasons: { entitlement: "pro" },
  tryouts: { entitlement: "pro" },
  // DCFC-D108: Programs is Pro-only, Contact is Starter-accessible. These must
  // stay in agreement with the onzio_private.club_has_feature allowlist -- see
  // the entitlement-agreement contract in
  // tests/contracts/diverse-city-domains.test.ts.
  programs: { entitlement: "pro" },
  contact: { entitlement: "starter" },
  analytics: { entitlement: "pro" },
} as const;

export const sectionRegistry: Record<string, SectionRegistration> = {
  "shared.next-match": {
    type: "shared.next-match",
    version: 1,
    scope: "shared",
    contentDomain: "matches",
    compatibleTemplates: ["cinematic@1", "heritage@1", "clubhouse@1", "academy@1"],
    requiredModule: "schedule",
    requiredEntitlement: "starter",
    cardinality: "single",
    emptyBehavior: "hide",
    productionProvenance: ["verified_public_source", "club_supplied", "operator_approved"],
  },
  "shared.history": {
    type: "shared.history",
    version: 1,
    scope: "shared",
    contentDomain: "about",
    compatibleTemplates: ["cinematic@1", "heritage@1", "clubhouse@1", "academy@1"],
    requiredModule: null,
    requiredEntitlement: null,
    cardinality: "single",
    emptyBehavior: "hide",
    productionProvenance: ["verified_public_source", "club_supplied", "operator_approved"],
  },
  "cinematic.hero": {
    type: "cinematic.hero",
    version: 1,
    scope: "cinematic",
    contentDomain: "homepage",
    compatibleTemplates: ["cinematic@1"],
    requiredModule: null,
    requiredEntitlement: null,
    cardinality: "single",
    emptyBehavior: "error",
    productionProvenance: ["verified_public_source", "club_supplied", "operator_approved"],
  },
  "cinematic.gallery": {
    type: "cinematic.gallery",
    version: 1,
    scope: "cinematic",
    contentDomain: "media_assets",
    compatibleTemplates: ["cinematic@1"],
    requiredModule: null,
    requiredEntitlement: null,
    cardinality: "single",
    emptyBehavior: "hide",
    productionProvenance: ["verified_public_source", "club_supplied", "operator_approved"],
  },
  "heritage.identity": {
    type: "heritage.identity",
    version: 1,
    scope: "heritage",
    contentDomain: "site_branding",
    compatibleTemplates: ["heritage@1"],
    requiredModule: null,
    requiredEntitlement: null,
    cardinality: "single",
    emptyBehavior: "error",
    productionProvenance: ["verified_public_source", "club_supplied", "operator_approved"],
  },
  "heritage.affiliations": {
    type: "heritage.affiliations",
    version: 1,
    scope: "heritage",
    contentDomain: "site_sponsor_logos",
    compatibleTemplates: ["heritage@1"],
    requiredModule: "affiliations",
    requiredEntitlement: "starter",
    cardinality: "single",
    emptyBehavior: "hide",
    productionProvenance: ["verified_public_source", "club_supplied", "operator_approved"],
  },
  "clubhouse.hero": {
    type: "clubhouse.hero",
    version: 1,
    scope: "clubhouse",
    contentDomain: "homepage",
    compatibleTemplates: ["clubhouse@1"],
    requiredModule: null,
    requiredEntitlement: null,
    cardinality: "single",
    emptyBehavior: "error",
    productionProvenance: ["verified_public_source", "club_supplied", "operator_approved"],
  },
  // academy@1 sections (DCFC-203). Each maps to a content domain that already
  // exists -- no section is registered against a domain the schema cannot
  // supply. Deliberately excluded: a video-backed hero, because the approved
  // video capability (DCFC-D105, Bunny.net Stream) is not built; and the
  // Special Olympics registration carousel, whose generalization to "any
  // program" DOMAIN-DESIGN.md explicitly leaves undecided.
  "academy.hero": {
    type: "academy.hero",
    version: 1,
    scope: "academy",
    contentDomain: "homepage_hero_content",
    compatibleTemplates: ["academy@1"],
    requiredModule: null,
    requiredEntitlement: null,
    cardinality: "single",
    emptyBehavior: "hide",
    productionProvenance: ["verified_public_source", "club_supplied", "operator_approved"],
  },
  "academy.kit-feature": {
    type: "academy.kit-feature",
    version: 1,
    scope: "academy",
    contentDomain: "shop_kit_section",
    compatibleTemplates: ["academy@1"],
    requiredModule: "store",
    requiredEntitlement: "starter",
    cardinality: "single",
    emptyBehavior: "hide",
    productionProvenance: ["verified_public_source", "club_supplied", "operator_approved"],
  },
  "academy.partners": {
    type: "academy.partners",
    version: 1,
    scope: "academy",
    contentDomain: "site_sponsor_logos",
    compatibleTemplates: ["academy@1"],
    requiredModule: "sponsors",
    requiredEntitlement: "starter",
    cardinality: "single",
    emptyBehavior: "hide",
    productionProvenance: ["verified_public_source", "club_supplied", "operator_approved"],
  },
  "academy.standings": {
    type: "academy.standings",
    version: 1,
    scope: "academy",
    contentDomain: "league_standings",
    compatibleTemplates: ["academy@1"],
    requiredModule: "standings",
    requiredEntitlement: "pro",
    cardinality: "single",
    emptyBehavior: "hide",
    productionProvenance: ["verified_public_source", "club_supplied", "operator_approved"],
  },
  "academy.programs-pathway": {
    type: "academy.programs-pathway",
    version: 1,
    scope: "academy",
    contentDomain: "programs",
    compatibleTemplates: ["academy@1"],
    requiredModule: "programs",
    requiredEntitlement: "pro",
    cardinality: "single",
    emptyBehavior: "hide",
    productionProvenance: ["verified_public_source", "club_supplied", "operator_approved"],
  },
  "clubhouse.slideshow": {
    type: "clubhouse.slideshow",
    version: 1,
    scope: "clubhouse",
    contentDomain: "homepage_slideshow_photos",
    compatibleTemplates: ["clubhouse@1"],
    requiredModule: null,
    requiredEntitlement: null,
    cardinality: "single",
    emptyBehavior: "hide",
    productionProvenance: ["verified_public_source", "club_supplied", "operator_approved"],
  },
  "clubhouse.kits": {
    type: "clubhouse.kits",
    version: 1,
    scope: "clubhouse",
    contentDomain: "shop_kit_photos",
    compatibleTemplates: ["clubhouse@1"],
    requiredModule: "store",
    requiredEntitlement: "starter",
    cardinality: "single",
    emptyBehavior: "hide",
    productionProvenance: ["verified_public_source", "club_supplied", "operator_approved"],
  },
  "clubhouse.partners": {
    type: "clubhouse.partners",
    version: 1,
    scope: "clubhouse",
    contentDomain: "site_sponsor_logos",
    compatibleTemplates: ["clubhouse@1"],
    requiredModule: "sponsors",
    requiredEntitlement: "starter",
    cardinality: "single",
    emptyBehavior: "hide",
    productionProvenance: ["verified_public_source", "club_supplied", "operator_approved"],
  },
};

export const templateRegistry: Record<TemplateKey, TemplateRegistration> = {
  "cinematic@1": {
    id: "cinematic",
    version: 1,
    key: "cinematic@1",
    displayName: "Cinematic",
    originNote: "Based on the approved Rose City visual system.",
    defaultFontPack: "bebas-inter",
    compatibleFontPacks: ["bebas-inter"],
    defaultSections: ["cinematic.hero", "shared.next-match", "cinematic.gallery"],
    supportedSections: [
      "cinematic.hero",
      "shared.next-match",
      "shared.history",
      "cinematic.gallery",
    ],
    defaultRoutes: ["home", "roster", "schedule", "club", "club-logo", "store"],
    supportedRoutes: ["home", "roster", "schedule", "club", "club-logo", "store", "sponsors"],
    supportedModules: ["roster", "schedule", "store", "sponsors", "standings", "affiliations"],
  },
  "heritage@1": {
    id: "heritage",
    version: 1,
    key: "heritage@1",
    displayName: "Heritage",
    originNote: "Based on the approved Deportivo Olimpico visual system.",
    defaultFontPack: "archivo-sora",
    compatibleFontPacks: ["archivo-sora", "bebas-inter"],
    defaultSections: ["heritage.identity", "shared.next-match", "shared.history", "heritage.affiliations"],
    supportedSections: [
      "heritage.identity",
      "shared.next-match",
      "shared.history",
      "heritage.affiliations",
    ],
    defaultRoutes: [
      "home",
      "roster",
      "schedule",
      "club",
      "sponsors",
      "store",
      "standings",
      "stats",
      "tryouts",
    ],
    supportedRoutes: [
      "home",
      "roster",
      "schedule",
      "club",
      "sponsors",
      "store",
      "standings",
      "stats",
      "tryouts",
    ],
    supportedModules: [
      "roster",
      "schedule",
      "store",
      "sponsors",
      "standings",
      "tryouts",
      "analytics",
      "affiliations",
    ],
  },
  "clubhouse@1": {
    id: "clubhouse",
    version: 1,
    key: "clubhouse@1",
    displayName: "Clubhouse",
    originNote: "Based on the approved Lions prospect mockup visual system.",
    defaultFontPack: "geist",
    compatibleFontPacks: ["geist", "bebas-inter"],
    defaultSections: [
      "clubhouse.hero",
      "shared.next-match",
      "clubhouse.slideshow",
      "clubhouse.kits",
      "shared.history",
      "clubhouse.partners",
    ],
    supportedSections: [
      "clubhouse.hero",
      "shared.next-match",
      "clubhouse.slideshow",
      "clubhouse.kits",
      "shared.history",
      "clubhouse.partners",
    ],
    defaultRoutes: ["home", "roster", "schedule", "store"],
    supportedRoutes: [
      "home",
      "roster",
      "schedule",
      "club",
      "store",
      "sponsors",
      "staff",
      "stats",
    ],
    supportedModules: [
      "roster",
      "schedule",
      "store",
      "sponsors",
      "staff",
      "stats",
      "expandedProfiles",
      "seasons",
      "analytics",
      "affiliations",
    ],
  },
  // DCFC-D104: the approved Diverse City visual does not map to cinematic@1,
  // so it becomes its own neutral reusable template following the clubhouse@1
  // extraction precedent. It is a platform template, not a Diverse City one --
  // any club may be assigned it.
  "academy@1": {
    id: "academy",
    version: 1,
    key: "academy@1",
    displayName: "Academy",
    originNote:
      "Based on the approved Diverse City FC prospect visual system (pinned snapshot 5bbdfa3).",
    defaultFontPack: "montserrat-inter-dmsans",
    compatibleFontPacks: ["montserrat-inter-dmsans", "bebas-inter"],
    defaultSections: [
      "academy.hero",
      "academy.kit-feature",
      "shared.next-match",
      "shared.history",
      "academy.partners",
      "academy.standings",
      "academy.programs-pathway",
    ],
    supportedSections: [
      "academy.hero",
      "academy.kit-feature",
      "shared.next-match",
      "shared.history",
      "academy.partners",
      "academy.standings",
      "academy.programs-pathway",
    ],
    defaultRoutes: ["home", "roster", "schedule", "club", "programs", "store", "contact"],
    supportedRoutes: [
      "home",
      "roster",
      "schedule",
      "club",
      "programs",
      "store",
      "sponsors",
      "standings",
      "tryouts",
      "contact",
    ],
    supportedModules: [
      "roster",
      "schedule",
      "store",
      "sponsors",
      "standings",
      "programs",
      "tryouts",
      "contact",
      "affiliations",
    ],
  },
};

export function templateKey(
  template: Pick<PresentationDocument["template"], "id" | "version">,
): TemplateKey {
  return `${template.id}@${template.version}` as TemplateKey;
}

export function parsePresentationDocument(
  input: unknown,
  options: { surface: PresentationSurface },
): PresentationDocument {
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues.find((candidate) =>
      candidate.path.join(".").startsWith("template.id"),
    );
    if (issue) {
      throw new PresentationError(
        "PRESENTATION_UNKNOWN_TEMPLATE",
        "Unknown presentation template.",
      );
    }
    throw new PresentationError(
      "PRESENTATION_INVALID_SCHEMA",
      parsed.error.issues[0]?.message ?? "Invalid presentation document.",
    );
  }

  const report = validatePresentationDocument(parsed.data, options);
  if (!report.valid) {
    const first = report.errors[0];
    throw new PresentationError(
      first.code as PresentationErrorCode,
      first.message,
    );
  }

  return parsed.data;
}

export function validatePresentationDocument(
  document: PresentationDocument,
  options: { surface: PresentationSurface },
): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const key = templateKey(document.template);
  const template = templateRegistry[key];

  if (!template) {
    errors.push(issue("PRESENTATION_UNKNOWN_TEMPLATE", "template", "Unknown template."));
    return { valid: false, errors, warnings };
  }

  const fontPack = fontPacks[document.fontPack as keyof typeof fontPacks];
  if (!fontPack || !fontPack.compatibleTemplates.includes(key)) {
    errors.push(
      issue(
        "PRESENTATION_UNKNOWN_FONT_PACK",
        "fontPack",
        "Font pack is not registered for this template.",
      ),
    );
  }

  for (const moduleKey of Object.keys(document.modules)) {
    if (!(moduleKey in moduleRegistry)) {
      errors.push(issue("PRESENTATION_UNKNOWN_MODULE", `modules.${moduleKey}`, "Unknown module."));
    } else if (document.modules[moduleKey] && !template.supportedModules.includes(moduleKey)) {
      warnings.push(
        issue(
          "PRESENTATION_WARNING",
          `modules.${moduleKey}`,
          "Module is registered but not supported by this template.",
        ),
      );
    }
  }

  for (const [index, section] of document.homepage.sections.entries()) {
    const sectionPath = `homepage.sections.${index}`;
    const registration = sectionRegistry[section.type];
    if (!registration) {
      errors.push(
        issue("PRESENTATION_UNKNOWN_SECTION", `${sectionPath}.type`, "Unknown section type."),
      );
      continue;
    }
    if (!registration.compatibleTemplates.includes(key)) {
      errors.push(
        issue(
          "PRESENTATION_UNSUPPORTED_SECTION",
          `${sectionPath}.type`,
          "Section is not compatible with the selected template.",
        ),
      );
    }
    if (hasUnsafeConfiguration(section.config)) {
      errors.push(
        issue(
          "PRESENTATION_UNSAFE_CONFIGURATION",
          `${sectionPath}.config`,
          "Section configuration cannot contain arbitrary CSS, HTML, JavaScript, URLs, or storage paths.",
        ),
      );
    }
    if (options.surface === "production" && hasProductionBlockedProvenance(section)) {
      errors.push(
        issue(
          "PRESENTATION_UNSAFE_CONFIGURATION",
          `${sectionPath}.provenance`,
          "Sample or unresolved provenance cannot reach production.",
        ),
      );
    }
  }

  const seenRoutes = new Set<string>();
  for (const [groupIndex, group] of document.navigation.groups.entries()) {
    for (const [routeIndex, route] of group.routes.entries()) {
      const routePath = `navigation.groups.${groupIndex}.routes.${routeIndex}`;
      if (!(route in routeRegistry)) {
        errors.push(issue("PRESENTATION_UNKNOWN_ROUTE", routePath, "Unknown route."));
        continue;
      }
      if (!template.supportedRoutes.includes(route)) {
        errors.push(issue("PRESENTATION_UNKNOWN_ROUTE", routePath, "Route is not supported by this template."));
      }
      if (seenRoutes.has(route)) {
        errors.push(issue("PRESENTATION_UNKNOWN_ROUTE", routePath, "Duplicate route."));
      }
      seenRoutes.add(route);
    }
  }

  if (
    contrastRatio(document.theme.text.primary, document.theme.surface.canvas) < 4.5 ||
    contrastRatio(document.theme.action.primaryText, document.theme.action.primary) < 3
  ) {
    errors.push(
      issue(
        "PRESENTATION_UNSAFE_CONFIGURATION",
        "theme",
        "Semantic foreground/background contrast is insufficient.",
      ),
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function switchPresentationTemplate(
  source: PresentationDocument,
  target: { id: TemplateId; version: 1 },
): { document: PresentationDocument; report: CompatibilityReport } {
  const fromTemplate = templateKey(source.template);
  const toTemplate = templateKey(target);
  const targetRegistration = templateRegistry[toTemplate];
  if (!targetRegistration) {
    throw new PresentationError(
      "PRESENTATION_UNKNOWN_TEMPLATE",
      "Cannot switch to an unknown template.",
    );
  }

  const mappedSections = source.homepage.sections.filter((section) =>
    targetRegistration.supportedSections.includes(section.type),
  );
  const disabledSections = source.homepage.sections
    .filter((section) => !targetRegistration.supportedSections.includes(section.type))
    .map((section) => ({ ...section, enabled: false }));
  const sourceRoutes = source.navigation.groups.flatMap((group) => group.routes);
  const mappedRoutes = sourceRoutes.filter((route) =>
    targetRegistration.supportedRoutes.includes(route),
  );
  const disabledRoutes = sourceRoutes.filter(
    (route) => !targetRegistration.supportedRoutes.includes(route),
  );

  const nextSections =
    mappedSections.length > 0
      ? mappedSections
      : targetRegistration.defaultSections.map((type) => ({
          id: type.replace(".", "-"),
          type,
          enabled: true,
          emptyBehavior: sectionRegistry[type].emptyBehavior,
          config: {},
        }));

  const document: PresentationDocument = {
    ...source,
    template: target,
    fontPack: targetRegistration.compatibleFontPacks.includes(source.fontPack)
      ? source.fontPack
      : targetRegistration.defaultFontPack,
    homepage: { sections: nextSections },
    navigation: {
      groups: [
        {
          id: "main",
          label: null,
          routes: mappedRoutes.length > 0 ? mappedRoutes : targetRegistration.defaultRoutes,
        },
      ],
    },
  };

  return {
    document,
    report: {
      fromTemplate,
      toTemplate,
      mappedSections: mappedSections.map((section) => section.type),
      disabledSections: disabledSections.map((section) => section.type),
      mappedRoutes,
      disabledRoutes,
      missingModules: Object.keys(source.modules).filter(
        (moduleKey) => !targetRegistration.supportedModules.includes(moduleKey),
      ),
      preservedUnsupported: {
        sections: disabledSections,
        routes: disabledRoutes,
      },
    },
  };
}

export function evaluatePresentationReadiness(input: {
  photos: ReadinessPhoto[];
  evaluatedAt: string;
}): ReadinessRecommendation {
  const realApprovedPhotoCount = input.photos.filter(
    (photo) =>
      photo.kind === "photo" &&
      photo.approved &&
      photo.duplicateOf === null &&
      photo.accessible &&
      !photo.sample,
  ).length;

  if (realApprovedPhotoCount >= 6) {
    return {
      recommendedTemplate: "cinematic@1",
      scoreBand: "strong",
      realApprovedPhotoCount,
      reasons: [
        "Six or more real approved club photos can support the image-led cinematic rhythm.",
      ],
      warnings: [],
      suggestedPlaceholderAssignments: [],
      evaluatedAt: input.evaluatedAt,
    };
  }

  if (realApprovedPhotoCount >= 2) {
    return {
      recommendedTemplate: "clubhouse@1",
      scoreBand: "developing",
      realApprovedPhotoCount,
      reasons: [
        "The club has enough real media for a crest-led home presentation with a focused matchday slideshow.",
      ],
      warnings: ["Cinematic gallery sections should remain hidden until more real photos are approved."],
      suggestedPlaceholderAssignments: [],
      evaluatedAt: input.evaluatedAt,
    };
  }

  return {
    recommendedTemplate: "heritage@1",
    scoreBand: "limited",
    realApprovedPhotoCount,
    reasons: [
      "The club has fewer than two real approved photos, so crest, typography, history, and affiliations should carry the presentation.",
    ],
    warnings: ["Placeholders are preview-only and cannot be published."],
    suggestedPlaceholderAssignments: [
      {
        sectionType: "clubhouse.hero",
        reason: "Use protected preview placeholders only while real imagery is collected.",
      },
    ],
    evaluatedAt: input.evaluatedAt,
  };
}

export function recordTemplateOverride(
  recommendation: ReadinessRecommendation,
  decision: {
    selectedTemplate: TemplateKey;
    operatorUserId: string;
    reason: string;
    decidedAt: string;
  },
) {
  return {
    recommendation,
    selectedTemplate: decision.selectedTemplate,
    operatorUserId: decision.operatorUserId,
    reason: decision.reason,
    decidedAt: decision.decidedAt,
    override: decision.selectedTemplate !== recommendation.recommendedTemplate,
  };
}

function issue(
  code: ValidationIssue["code"],
  path: string,
  message: string,
): ValidationIssue {
  return { code, path, message };
}

function hasUnsafeConfiguration(value: unknown): boolean {
  if (typeof value === "string") {
    return /<[^>]+>|javascript:|data:|https?:\/\/|\/storage\/|className|style/i.test(value);
  }
  if (Array.isArray(value)) return value.some(hasUnsafeConfiguration);
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, nested]) =>
      /html|css|class|style|script|url|href|src|path/i.test(key) ||
      hasUnsafeConfiguration(nested),
    );
  }
  return false;
}

function hasProductionBlockedProvenance(
  section: PresentationDocument["homepage"]["sections"][number],
): boolean {
  return Object.values(section.provenance ?? {}).some((entry) =>
    entry.status === "sample" || entry.status === "unresolved",
  );
}

function contrastRatio(foreground: string, background: string): number {
  const light = relativeLuminance(foreground);
  const dark = relativeLuminance(background);
  const lighter = Math.max(light, dark);
  const darker = Math.min(light, dark);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: string): number {
  const [r, g, b] = color
    .slice(1)
    .match(/[0-9A-F]{2}/gi)!
    .map((channel) => {
      const value = Number.parseInt(channel, 16) / 255;
      return value <= 0.03928
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
