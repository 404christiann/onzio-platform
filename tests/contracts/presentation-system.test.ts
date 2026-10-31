import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { expectContractError, loadContract } from "../helpers/contract";
import { presentationDocumentForTemplate } from "../helpers/presentation-fixture";

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

function validEditorialDocument() {
  return {
    ...validCinematicDocument(),
    template: { id: "editorial", version: 1 },
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
      staff: true,
      tryouts: true,
      contact: true,
    },
    homepage: {
      sections: [
        {
          id: "hero-main",
          type: "editorial.hero",
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
          type: "editorial.slideshow",
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
      ],
    },
    navigation: {
      groups: [
        {
          id: "main",
          label: null,
          routes: [
            "home",
            "club",
            "roster",
            "schedule",
            "tryouts",
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

  it("accepts a pinned editorial document for the Lions editorial template", async () => {
    const { parsePresentationDocument } = await loadPresentation();
    const parsed = parsePresentationDocument(validEditorialDocument(), {
      surface: "production",
    });

    expect(parsed.template).toEqual({ id: "editorial", version: 1 });
    expect(parsed.fontPack).toBe("geist");
    expect(parsed.homepage.sections.map((section) => section.type)).toEqual([
      "editorial.hero",
      "shared.next-match",
      "editorial.slideshow",
      "shared.history",
    ]);
    expect(parsed.navigation.groups[0]?.routes).toEqual([
      "home",
      "club",
      "roster",
      "schedule",
      "tryouts",
      "store",
      "contact",
    ]);
  });

  it("accepts exactly the font packs each template registers", async () => {
    const { parsePresentationDocument, validatePresentationDocument, templateRegistry, fontPacks } =
      await loadPresentation();
    const accepted: Record<string, string[]> = {
      "cinematic@1": ["bebas-inter"],
      "heritage@1": ["archivo-sora", "bebas-inter"],
      "clubhouse@1": ["geist", "bebas-inter"],
      "academy@1": ["montserrat-inter-dmsans", "bebas-inter"],
      "editorial@1": ["geist", "bebas-inter"],
    };
    expect(Object.keys(templateRegistry).sort()).toEqual(Object.keys(accepted).sort());
    const source = parsePresentationDocument(validAcademyDocument(), { surface: "production" });

    for (const template of Object.values(templateRegistry)) {
      const document = presentationDocumentForTemplate(source, template.id);
      for (const fontPack of new Set([...Object.keys(fontPacks), ...Object.values(accepted).flat(), "comic-sans"])) {
        const report = validatePresentationDocument(
          { ...document, fontPack },
          { surface: "production" },
        );
        expect(
          report.errors.map((error) => error.code),
          `${template.key} with ${fontPack}`,
        ).toEqual(
          accepted[template.key].includes(fontPack) ? [] : ["PRESENTATION_UNKNOWN_FONT_PACK"],
        );
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

  it("returns a deterministic validation report", async () => {
    const { parsePresentationDocument, validatePresentationDocument } =
      await loadPresentation();
    const source = parsePresentationDocument(validCinematicDocument(), {
      surface: "operator_preview",
    });

    const validation = validatePresentationDocument(source, {
      surface: "operator_preview",
    });
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.warnings).toEqual([]);
  });
});

describe("browser fixture documents", () => {
  const templateIds = ["academy", "editorial", "clubhouse", "cinematic", "heritage"] as const;

  it.each(templateIds)(
    "publishes a production-valid %s document from the seeded Academy shape",
    async (templateId) => {
      const { parsePresentationDocument } = await loadPresentation();
      const seeded = {
        ...validAcademyDocument(),
        homepage: {
          sections: [
            { id: "hero-main", type: "academy.hero", enabled: true, emptyBehavior: "hide", config: {} },
            { id: "programs-pathway", type: "academy.programs-pathway", enabled: true, emptyBehavior: "hide", config: {} },
          ],
        },
      };
      const source = parsePresentationDocument(seeded, { surface: "production" });
      const target = parsePresentationDocument(
        presentationDocumentForTemplate(source, templateId),
        { surface: "production" },
      );
      expect(target.template).toEqual({ id: templateId, version: 1 });
    },
  );
});
