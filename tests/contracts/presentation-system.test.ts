import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { expectContractError, loadContract } from "../helpers/contract";

type PresentationExports = typeof import("@/packages/presentation");

async function loadPresentation(): Promise<PresentationExports> {
  await loadContract<PresentationExports["parsePresentationDocument"]>(
    "@/packages/presentation",
    "parsePresentationDocument",
  );
  return import("@/packages/presentation");
}

function validCinematicDocument() {
  return {
    schemaVersion: 1,
    template: { id: "cinematic", version: 1 },
    fontPack: "bebas-inter",
    theme: {
      surface: {
        canvas: "#07120D",
        elevated: "#102219",
        subtle: "#172820",
        inverse: "#F7F3E8",
      },
      text: {
        primary: "#F7F3E8",
        secondary: "#DDE7DF",
        muted: "#B8C3BB",
        inverse: "#07120D",
      },
      action: {
        primary: "#12A140",
        primaryHover: "#0E8334",
        primaryText: "#FFFFFF",
        secondary: "#E7001B",
      },
      border: { subtle: "#2A3B31", strong: "#F7F3E8" },
      status: {
        success: "#12A140",
        warning: "#D69E2E",
        danger: "#D14343",
      },
      accent: { one: "#E7001B", two: "#F7F3E8" },
    },
    modules: {
      roster: true,
      schedule: true,
      standings: true,
      store: true,
      sponsors: true,
      tryouts: false,
      analytics: false,
      affiliations: true,
    },
    homepage: {
      sections: [
        {
          id: "hero-main",
          type: "cinematic.hero",
          enabled: true,
          emptyBehavior: "error",
          config: {},
        },
        {
          id: "next-match",
          type: "shared.next-match",
          enabled: true,
          emptyBehavior: "hide",
          config: {},
        },
        {
          id: "gallery-main",
          type: "cinematic.gallery",
          enabled: true,
          emptyBehavior: "hide",
          config: {},
        },
      ],
    },
    navigation: {
      groups: [
        {
          id: "main",
          label: null,
          routes: ["home", "roster", "schedule", "club"],
        },
        {
          id: "support",
          label: "Support",
          routes: ["store", "sponsors"],
        },
      ],
    },
    metadata: {
      recommendationId: null,
      createdBy: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      createdAt: "2026-07-29T00:00:00.000Z",
      sourceArtifact: null,
    },
  };
}

function validClubhouseDocument() {
  return {
    ...validCinematicDocument(),
    template: { id: "clubhouse", version: 1 },
    fontPack: "geist",
    theme: {
      surface: {
        canvas: "#1B2958",
        elevated: "#FFFFFF",
        subtle: "#F7F5F1",
        inverse: "#F0F0F0",
      },
      text: {
        primary: "#F0F0F0",
        secondary: "#C8CDD8",
        muted: "#687083",
        inverse: "#18213A",
      },
      action: {
        primary: "#F0F0F0",
        primaryHover: "#DADDE5",
        primaryText: "#1B2958",
        secondary: "#AD3234",
      },
      border: { subtle: "#35426B", strong: "#F0F0F0" },
      status: {
        success: "#12A140",
        warning: "#D69E2E",
        danger: "#AD3234",
      },
      accent: { one: "#AD3234", two: "#F0F0F0" },
    },
    modules: {
      roster: true,
      schedule: true,
      store: true,
      sponsors: true,
      staff: true,
      stats: true,
      expandedProfiles: true,
      seasons: true,
      analytics: true,
      affiliations: true,
    },
    homepage: {
      sections: [
        {
          id: "hero-main",
          type: "clubhouse.hero",
          enabled: true,
          emptyBehavior: "error",
          config: {},
        },
        {
          id: "next-match",
          type: "shared.next-match",
          enabled: true,
          emptyBehavior: "hide",
          config: {},
        },
        {
          id: "matchday-slideshow",
          type: "clubhouse.slideshow",
          enabled: true,
          emptyBehavior: "hide",
          config: {},
        },
        {
          id: "kits",
          type: "clubhouse.kits",
          enabled: true,
          emptyBehavior: "hide",
          config: {},
        },
        {
          id: "club-story",
          type: "shared.history",
          enabled: true,
          emptyBehavior: "hide",
          config: {},
        },
        {
          id: "partners",
          type: "clubhouse.partners",
          enabled: true,
          emptyBehavior: "hide",
          config: {},
        },
      ],
    },
    navigation: {
      groups: [
        {
          id: "main",
          label: null,
          routes: ["home", "roster", "schedule", "store"],
        },
      ],
    },
  };
}

function validAcademyDocument() {
  return {
    ...validCinematicDocument(),
    template: { id: "academy", version: 1 },
    fontPack: "montserrat-inter-dmsans",
    modules: {
      roster: true,
      schedule: true,
      store: true,
      sponsors: true,
      standings: true,
      programs: true,
      tryouts: true,
      contact: true,
      affiliations: true,
    },
    homepage: {
      sections: [
        {
          id: "hero-main",
          type: "academy.hero",
          enabled: true,
          emptyBehavior: "hide",
          config: {},
        },
        {
          id: "kit-feature",
          type: "academy.kit-feature",
          enabled: true,
          emptyBehavior: "hide",
          config: {},
        },
        {
          id: "next-match",
          type: "shared.next-match",
          enabled: true,
          emptyBehavior: "hide",
          config: {},
        },
        {
          id: "club-story",
          type: "shared.history",
          enabled: true,
          emptyBehavior: "hide",
          config: {},
        },
        {
          id: "partners",
          type: "academy.partners",
          enabled: true,
          emptyBehavior: "hide",
          config: {},
        },
        {
          id: "standings",
          type: "academy.standings",
          enabled: true,
          emptyBehavior: "hide",
          config: {},
        },
        {
          id: "programs-pathway",
          type: "academy.programs-pathway",
          enabled: true,
          emptyBehavior: "hide",
          config: {},
        },
      ],
    },
    navigation: {
      groups: [
        {
          id: "main",
          label: null,
          routes: [
            "home",
            "roster",
            "schedule",
            "club",
            "programs",
            "store",
            "contact",
          ],
        },
      ],
    },
  };
}

describe("Phase 9.1 presentation baselines", () => {
  it("records reviewable Rose City and Deportivo baseline inventories", async () => {
    const roseCity = await readFile(
      resolve("docs/phase-9/baselines/rose-city-cinematic-baseline.md"),
      "utf8",
    );
    const deportivo = await readFile(
      resolve("docs/phase-9/baselines/deportivo-heritage-baseline.md"),
      "utf8",
    );

    expect(roseCity).toContain("Desktop Baseline");
    expect(roseCity).toContain("Mobile Baseline");
    expect(roseCity).toContain("cinematic@1");
    expect(deportivo).toContain("Starter Behavior");
    expect(deportivo).toContain("Pro Behavior");
    expect(deportivo).toContain("heritage@1");
  });
});

describe("Phase 9.2 presentation schema and registries", () => {
  it("accepts a pinned cinematic document that uses registered sections and tokens", async () => {
    const { parsePresentationDocument } = await loadPresentation();
    const parsed = parsePresentationDocument(validCinematicDocument(), {
      surface: "production",
    });
    expect(parsed.template).toEqual({ id: "cinematic", version: 1 });
    expect(parsed.homepage.sections.map((section) => section.type)).toEqual([
      "cinematic.hero",
      "shared.next-match",
      "cinematic.gallery",
    ]);
  });

  it("accepts a pinned clubhouse document for the Lions mockup-derived Pro template", async () => {
    const { parsePresentationDocument } = await loadPresentation();
    const parsed = parsePresentationDocument(validClubhouseDocument(), {
      surface: "production",
    });

    expect(parsed.template).toEqual({ id: "clubhouse", version: 1 });
    expect(parsed.fontPack).toBe("geist");
    expect(parsed.homepage.sections.map((section) => section.type)).toEqual([
      "clubhouse.hero",
      "shared.next-match",
      "clubhouse.slideshow",
      "clubhouse.kits",
      "shared.history",
      "clubhouse.partners",
    ]);
    expect(parsed.navigation.groups[0]?.routes).toEqual([
      "home",
      "roster",
      "schedule",
      "store",
    ]);
  });

  it("accepts a pinned academy document for the Diverse City-derived Pro template", async () => {
    const { parsePresentationDocument } = await loadPresentation();
    const parsed = parsePresentationDocument(validAcademyDocument(), {
      surface: "production",
    });

    expect(parsed.template).toEqual({ id: "academy", version: 1 });
    expect(parsed.fontPack).toBe("montserrat-inter-dmsans");
    expect(parsed.homepage.sections.map((section) => section.type)).toEqual([
      "academy.hero",
      "academy.kit-feature",
      "shared.next-match",
      "shared.history",
      "academy.partners",
      "academy.standings",
      "academy.programs-pathway",
    ]);
    expect(parsed.navigation.groups[0]?.routes).toEqual([
      "home",
      "roster",
      "schedule",
      "club",
      "programs",
      "store",
      "contact",
    ]);
  });

  it("keeps template and font-pack compatibility registrations bidirectionally consistent", async () => {
    const { fontPacks, templateRegistry } = await loadPresentation();

    for (const [templateKey, template] of Object.entries(templateRegistry)) {
      for (const fontPackKey of template.compatibleFontPacks) {
        expect(
          fontPacks[fontPackKey],
          `${templateKey} references the unregistered font pack ${fontPackKey}`,
        ).toBeDefined();
        expect(
          fontPacks[fontPackKey]?.compatibleTemplates,
          `${templateKey} accepts ${fontPackKey}, but ${fontPackKey} does not accept ${templateKey}`,
        ).toContain(templateKey);
      }
    }

    for (const [fontPackKey, fontPack] of Object.entries(fontPacks)) {
      for (const templateKey of fontPack.compatibleTemplates) {
        expect(
          templateRegistry[templateKey],
          `${fontPackKey} references the unregistered template ${templateKey}`,
        ).toBeDefined();
        expect(
          templateRegistry[templateKey]?.compatibleFontPacks,
          `${fontPackKey} accepts ${templateKey}, but ${templateKey} does not accept ${fontPackKey}`,
        ).toContain(fontPackKey);
      }
    }
  });

  it("fails closed for unknown template, section, route, module, and font keys", async () => {
    const { parsePresentationDocument } = await loadPresentation();

    await expectContractError(
      () =>
        parsePresentationDocument(
          { ...validCinematicDocument(), template: { id: "rose-city", version: 1 } },
          { surface: "production" },
        ),
      "PRESENTATION_UNKNOWN_TEMPLATE",
    );

    await expectContractError(
      () =>
        parsePresentationDocument(
          {
            ...validCinematicDocument(),
            homepage: {
              sections: [
                {
                  id: "unsafe",
                  type: "shared.raw-react-component",
                  enabled: true,
                  emptyBehavior: "hide",
                  config: {},
                },
              ],
            },
          },
          { surface: "production" },
        ),
      "PRESENTATION_UNKNOWN_SECTION",
    );

    await expectContractError(
      () =>
        parsePresentationDocument(
          {
            ...validCinematicDocument(),
            navigation: {
              groups: [{ id: "main", label: null, routes: ["home", "debug"] }],
            },
          },
          { surface: "production" },
        ),
      "PRESENTATION_UNKNOWN_ROUTE",
    );
  });

  it("rejects arbitrary CSS, HTML, URLs, and sample provenance on production surfaces", async () => {
    const { parsePresentationDocument } = await loadPresentation();

    await expectContractError(
      () =>
        parsePresentationDocument(
          {
            ...validCinematicDocument(),
            homepage: {
              sections: [
                {
                  id: "hero-main",
                  type: "cinematic.hero",
                  enabled: true,
                  emptyBehavior: "error",
                  config: { className: "bg-red-500", html: "<script />" },
                  provenance: {
                    headline: { value: "Sample headline", status: "sample" },
                  },
                },
              ],
            },
          },
          { surface: "production" },
        ),
      "PRESENTATION_UNSAFE_CONFIGURATION",
    );
  });

  it("returns deterministic validation and compatibility reports", async () => {
    const {
      parsePresentationDocument,
      validatePresentationDocument,
      switchPresentationTemplate,
    } = await loadPresentation();
    const source = parsePresentationDocument(validCinematicDocument(), {
      surface: "operator_preview",
    });

    const validation = validatePresentationDocument(source, {
      surface: "operator_preview",
    });
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.warnings).toEqual([]);

    const switched = switchPresentationTemplate(source, {
      id: "heritage",
      version: 1,
    });
    expect(switched.document.template).toEqual({ id: "heritage", version: 1 });
    expect(switched.report.mappedSections).toContain("shared.next-match");
    expect(switched.report.disabledSections).toEqual([
      "cinematic.hero",
      "cinematic.gallery",
    ]);
    expect(switched.report.preservedUnsupported.sections).toHaveLength(2);

    const clubhouse = switchPresentationTemplate(source, {
      id: "clubhouse",
      version: 1,
    });
    expect(clubhouse.document.template).toEqual({ id: "clubhouse", version: 1 });
    expect(clubhouse.document.fontPack).toBe("bebas-inter");
    expect(clubhouse.report.mappedSections).toContain("shared.next-match");
    expect(clubhouse.report.disabledSections).toEqual([
      "cinematic.hero",
      "cinematic.gallery",
    ]);
  });

  it("evaluates readiness from real approved club photos only and explains overrides", async () => {
    const { evaluatePresentationReadiness, recordTemplateOverride } =
      await loadPresentation();

    const limited = evaluatePresentationReadiness({
      photos: [
        { id: "logo", kind: "logo", approved: true, duplicateOf: null, accessible: true, sample: false },
        { id: "sample", kind: "photo", approved: true, duplicateOf: null, accessible: true, sample: true },
      ],
      evaluatedAt: "2026-07-29T00:00:00.000Z",
    });
    expect(limited.recommendedTemplate).toBe("heritage@1");
    expect(limited.scoreBand).toBe("limited");
    expect(limited.realApprovedPhotoCount).toBe(0);
    expect(limited.suggestedPlaceholderAssignments.length).toBeGreaterThan(0);

    const strong = evaluatePresentationReadiness({
      photos: Array.from({ length: 6 }, (_, index) => ({
        id: `photo-${index}`,
        kind: "photo" as const,
        approved: true,
        duplicateOf: null,
        accessible: true,
        sample: false,
      })),
      evaluatedAt: "2026-07-29T00:00:00.000Z",
    });
    expect(strong.recommendedTemplate).toBe("cinematic@1");
    expect(strong.scoreBand).toBe("strong");

    const developing = evaluatePresentationReadiness({
      photos: Array.from({ length: 5 }, (_, index) => ({
        id: `photo-${index}`,
        kind: "photo" as const,
        approved: true,
        duplicateOf: null,
        accessible: true,
        sample: false,
      })),
      evaluatedAt: "2026-07-29T00:00:00.000Z",
    });
    expect(developing.recommendedTemplate).toBe("clubhouse@1");
    expect(developing.scoreBand).toBe("developing");

    expect(
      recordTemplateOverride(strong, {
        selectedTemplate: "heritage@1",
        operatorUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
        reason: "Christian approved heritage for this club launch.",
        decidedAt: "2026-07-29T00:01:00.000Z",
      }),
    ).toMatchObject({
      recommendation: strong,
      selectedTemplate: "heritage@1",
      override: true,
    });
  });
});
