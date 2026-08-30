import { describe, expect, it } from "vitest";
import { loadContract } from "../helpers/contract";

type PresentationExports = typeof import("@/packages/presentation");

async function loadPresentation(): Promise<PresentationExports> {
  await loadContract<PresentationExports["parsePresentationDocument"]>(
    "@/packages/presentation",
    "parsePresentationDocument",
  );
  return import("@/packages/presentation");
}

// Pinned snapshots of the pre-existing clubhouse@1 and academy@1 template
// registrations, copied verbatim from packages/presentation/index.ts before
// the editorial@1 (E2) change. This file exists to prove the E2 registry
// addition was purely additive -- it must not mutate any field on any
// pre-existing template or section registration.
const CLUBHOUSE_TEMPLATE_SNAPSHOT = {
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
};

const ACADEMY_TEMPLATE_SNAPSHOT = {
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
  defaultRoutes: [
    "home",
    "roster",
    "schedule",
    "club",
    "programs",
    "store",
    "contact",
  ],
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
};

const SHARED_NEXT_MATCH_SNAPSHOT_MINUS_TEMPLATES = {
  type: "shared.next-match",
  version: 1,
  scope: "shared",
  contentDomain: "matches",
  requiredModule: "schedule",
  requiredEntitlement: "starter",
  cardinality: "single",
  emptyBehavior: "hide",
  productionProvenance: [
    "verified_public_source",
    "club_supplied",
    "operator_approved",
  ],
};

const SHARED_HISTORY_SNAPSHOT_MINUS_TEMPLATES = {
  type: "shared.history",
  version: 1,
  scope: "shared",
  contentDomain: "about",
  requiredModule: null,
  requiredEntitlement: null,
  cardinality: "single",
  emptyBehavior: "hide",
  productionProvenance: [
    "verified_public_source",
    "club_supplied",
    "operator_approved",
  ],
};

describe("Phase E2 editorial@1 registry isolation", () => {
  it("leaves the pre-existing clubhouse@1 template registration byte-identical", async () => {
    const { templateRegistry } = await loadPresentation();
    expect(templateRegistry["clubhouse@1"]).toEqual(
      CLUBHOUSE_TEMPLATE_SNAPSHOT,
    );
  });

  it("leaves the pre-existing academy@1 template registration byte-identical", async () => {
    const { templateRegistry } = await loadPresentation();
    expect(templateRegistry["academy@1"]).toEqual(ACADEMY_TEMPLATE_SNAPSHOT);
  });

  it("registers editorial@1 in the template registry", async () => {
    const { templateRegistry } = await loadPresentation();
    expect(templateRegistry["editorial@1"]).toBeDefined();
    expect(templateRegistry["editorial@1"]?.id).toBe("editorial");
    expect(templateRegistry["editorial@1"]?.version).toBe(1);
    expect(templateRegistry["editorial@1"]?.key).toBe("editorial@1");
  });

  it("additively extends shared.next-match and shared.history to include editorial@1 without changing any other field", async () => {
    const { sectionRegistry } = await loadPresentation();

    const nextMatch = sectionRegistry["shared.next-match"];
    expect(nextMatch).toBeDefined();
    const { compatibleTemplates: nextMatchTemplates, ...nextMatchRest } =
      nextMatch!;
    expect(nextMatchRest).toEqual(SHARED_NEXT_MATCH_SNAPSHOT_MINUS_TEMPLATES);
    expect(nextMatchTemplates).toEqual(
      expect.arrayContaining([
        "cinematic@1",
        "heritage@1",
        "clubhouse@1",
        "academy@1",
        "editorial@1",
      ]),
    );
    expect(nextMatchTemplates).toContain("editorial@1");

    const history = sectionRegistry["shared.history"];
    expect(history).toBeDefined();
    const { compatibleTemplates: historyTemplates, ...historyRest } =
      history!;
    expect(historyRest).toEqual(SHARED_HISTORY_SNAPSHOT_MINUS_TEMPLATES);
    expect(historyTemplates).toEqual(
      expect.arrayContaining([
        "cinematic@1",
        "heritage@1",
        "clubhouse@1",
        "academy@1",
        "editorial@1",
      ]),
    );
    expect(historyTemplates).toContain("editorial@1");
  });

  it("does not leak editorial@1 into academy-only or clubhouse-only sections", async () => {
    const { sectionRegistry } = await loadPresentation();

    expect(sectionRegistry["academy.kit-feature"]?.compatibleTemplates).toEqual(
      ["academy@1"],
    );
    expect(
      sectionRegistry["academy.kit-feature"]?.compatibleTemplates,
    ).not.toContain("editorial@1");

    expect(sectionRegistry["clubhouse.kits"]?.compatibleTemplates).toEqual([
      "clubhouse@1",
    ]);
    expect(sectionRegistry["clubhouse.kits"]?.compatibleTemplates).not.toContain(
      "editorial@1",
    );

    expect(sectionRegistry["clubhouse.hero"]?.compatibleTemplates).toEqual([
      "clubhouse@1",
    ]);
    expect(sectionRegistry["academy.hero"]?.compatibleTemplates).toEqual([
      "academy@1",
    ]);
    expect(sectionRegistry["academy.partners"]?.compatibleTemplates).toEqual([
      "academy@1",
    ]);
    expect(sectionRegistry["academy.standings"]?.compatibleTemplates).toEqual([
      "academy@1",
    ]);
    expect(
      sectionRegistry["academy.programs-pathway"]?.compatibleTemplates,
    ).toEqual(["academy@1"]);
    expect(sectionRegistry["clubhouse.slideshow"]?.compatibleTemplates).toEqual(
      ["clubhouse@1"],
    );
    expect(sectionRegistry["clubhouse.partners"]?.compatibleTemplates).toEqual(
      ["clubhouse@1"],
    );
  });

  it("registers editorial.hero and editorial.slideshow scoped only to editorial@1", async () => {
    const { sectionRegistry } = await loadPresentation();

    expect(sectionRegistry["editorial.hero"]).toMatchObject({
      type: "editorial.hero",
      version: 1,
      scope: "editorial",
      contentDomain: "homepage",
      compatibleTemplates: ["editorial@1"],
      requiredModule: null,
      requiredEntitlement: null,
      cardinality: "single",
      emptyBehavior: "error",
    });

    expect(sectionRegistry["editorial.slideshow"]).toMatchObject({
      type: "editorial.slideshow",
      version: 1,
      scope: "editorial",
      contentDomain: "homepage_slideshow_photos",
      compatibleTemplates: ["editorial@1"],
      requiredModule: null,
      requiredEntitlement: null,
      cardinality: "single",
      emptyBehavior: "hide",
    });
  });
});
