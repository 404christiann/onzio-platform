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

// Pinned registrations for the two shared active templates (cinematic@2 is Rose City only).
const CLUBHOUSE_TEMPLATE_SNAPSHOT = {
  id: "clubhouse",
  version: 1,
  key: "clubhouse@1",
  displayName: "Clubhouse",
  originNote: "Based on the approved Lions prospect mockup visual system.",
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

describe("active template registry", () => {
  it("keeps the clubhouse@1 registration unchanged", async () => {
    const { templateRegistry } = await loadPresentation();
    expect(templateRegistry["clubhouse@1"]).toEqual(CLUBHOUSE_TEMPLATE_SNAPSHOT);
  });

  it("keeps the academy@1 registration unchanged", async () => {
    const { templateRegistry } = await loadPresentation();
    expect(templateRegistry["academy@1"]).toEqual(ACADEMY_TEMPLATE_SNAPSHOT);
  });

  it("exposes only cinematic@2 (Rose City), clubhouse and academy for new assignments", async () => {
    const { templateRegistry, activeTemplateRegistration, isActiveTemplateKey } = await loadPresentation();
    expect(Object.keys(templateRegistry).sort()).toEqual(["academy@1", "cinematic@2", "clubhouse@1"]);
    expect(activeTemplateRegistration("clubhouse@1")).toEqual(CLUBHOUSE_TEMPLATE_SNAPSHOT);
    expect(activeTemplateRegistration("academy@1")).toEqual(ACADEMY_TEMPLATE_SNAPSHOT);
    for (const key of ["cinematic@1", "heritage@1", "editorial@1", null]) {
      expect(isActiveTemplateKey(key)).toBe(false);
      expect(activeTemplateRegistration(key)).toBeNull();
    }
  });

  it("preserves shared sections for active templates without retired compatibility", async () => {
    const { sectionRegistry } = await loadPresentation();
    const nextMatch = sectionRegistry["shared.next-match"];
    const { compatibleTemplates: nextMatchTemplates, ...nextMatchRest } = nextMatch;
    expect(nextMatchRest).toEqual(SHARED_NEXT_MATCH_SNAPSHOT_MINUS_TEMPLATES);
    expect(nextMatchTemplates).toEqual(["cinematic@2", "clubhouse@1", "academy@1"]);

    const history = sectionRegistry["shared.history"];
    const { compatibleTemplates: historyTemplates, ...historyRest } = history;
    expect(historyRest).toEqual(SHARED_HISTORY_SNAPSHOT_MINUS_TEMPLATES);
    expect(historyTemplates).toEqual(["clubhouse@1", "academy@1"]);
  });

  it("keeps active sections scoped and cinematic sections scoped to cinematic@2", async () => {
    const { sectionRegistry } = await loadPresentation();
    expect(sectionRegistry["clubhouse.hero"]?.compatibleTemplates).toEqual(["clubhouse@1"]);
    expect(sectionRegistry["academy.hero"]?.compatibleTemplates).toEqual(["academy@1"]);
    expect(sectionRegistry["cinematic.hero"]?.type).toBe("cinematic.hero");
    expect(sectionRegistry["cinematic.gallery"]?.type).toBe("cinematic.gallery");
    expect(sectionRegistry["cinematic.hero"]?.compatibleTemplates).toEqual(["cinematic@2"]);
    expect(sectionRegistry["cinematic.gallery"]?.compatibleTemplates).toEqual(["cinematic@2"]);
    expect(sectionRegistry["heritage.identity"]).toBeUndefined();
    expect(sectionRegistry["editorial.hero"]).toBeUndefined();
  });
});
