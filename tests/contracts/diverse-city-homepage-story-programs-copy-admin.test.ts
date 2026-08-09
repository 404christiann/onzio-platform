import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_TABLE_FEATURES,
  adminDataRequestSchema,
  SINGLETON_TABLES,
} from "@/lib/admin-data-contract";
import {
  DEFAULT_ACADEMY_FOOTER_TAGLINE,
  FOOTER_TAGLINE_LIMIT,
  resolveFooterTagline,
  validateFooterTagline,
} from "@/lib/club-branding";
import type {
  DBHomepageStorySection,
  DBProgramsPageContent,
} from "@/lib/db-types";
import {
  buildHomepageStoryMutationPayload,
  emptyHomepageStoryDraft,
  homepageStoryToDraft,
  validateHomepageStoryDraft,
} from "@/lib/homepage-content";
import {
  defaultHomepageStoryContent,
  HOMEPAGE_STORY_LIMITS,
  resolveHomepageStorySection,
} from "@/lib/homepage-story-content";
import {
  buildProgramsPageMutationPayload,
  emptyProgramsPageDraft,
  programsPageToDraft,
  validateProgramsPageDraft,
  type ProgramsPageDraft,
} from "@/lib/program-admin";
import {
  defaultProgramsPageContent,
  PROGRAMS_PAGE_LIMITS,
  resolveProgramsPageContent,
} from "@/lib/programs-page-content";

const ROOT = resolve(__dirname, "../..");
const CLUB_NAME = "Diverse City FC";

function source(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

function storyRow(
  overrides: Partial<DBHomepageStorySection> = {},
): Partial<DBHomepageStorySection> {
  return {
    club_id: "11111111-1111-4111-8111-111111111111",
    visible: true,
    heading: "",
    body_primary: "",
    body_secondary: "",
    cta_label: "",
    updated_at: "2026-08-08T00:00:00Z",
    ...overrides,
  };
}

function programsPageRow(
  overrides: Partial<DBProgramsPageContent> = {},
): Partial<DBProgramsPageContent> {
  return {
    club_id: "11111111-1111-4111-8111-111111111111",
    pathway_eyebrow: "",
    pathway_heading: "",
    pathway_intro: "",
    hero_eyebrow: "",
    hero_headline_line_one: "",
    hero_headline_line_two: "",
    hero_intro: "",
    closing_heading_line_one: "",
    closing_heading_line_two: "",
    closing_body: "",
    closing_cta_label: "",
    updated_at: "2026-08-08T00:00:00Z",
    ...overrides,
  };
}

describe("homepage story copy is real admin content", () => {
  it("falls back to the approved academy@1 wording when a club has changed nothing", () => {
    const story = resolveHomepageStorySection(storyRow(), CLUB_NAME);
    expect(story).toEqual({
      visible: true,
      ...defaultHomepageStoryContent(CLUB_NAME),
    });
  });

  it("renders the section for a club with no row at all", () => {
    // No deploy-time seed exists for this table, so "no row" must mean "render
    // the approved template", not "render nothing".
    expect(resolveHomepageStorySection(null, CLUB_NAME).visible).toBe(true);
    expect(resolveHomepageStorySection(undefined, CLUB_NAME).heading).toBe(
      "Developing the next generation",
    );
  });

  it("keeps the default tenant-neutral by naming the club from data", () => {
    expect(defaultHomepageStoryContent("Alpha FC").bodyPrimary).toContain(
      "Alpha FC",
    );
    expect(defaultHomepageStoryContent(CLUB_NAME).bodyPrimary).toContain(
      CLUB_NAME,
    );
    expect(defaultHomepageStoryContent("  ").bodyPrimary).toContain("The club");
  });

  it("prefers every stored value over the template default", () => {
    const story = resolveHomepageStorySection(
      storyRow({
        heading: "Building the next chapter",
        body_primary: "We coach, mentor, and compete.",
        body_secondary: "Every athlete belongs here.",
        cta_label: "Read more",
      }),
      CLUB_NAME,
    );
    expect(story).toEqual({
      visible: true,
      heading: "Building the next chapter",
      bodyPrimary: "We coach, mentor, and compete.",
      bodySecondary: "Every athlete belongs here.",
      ctaLabel: "Read more",
    });
  });

  it("treats whitespace-only copy as unset rather than rendering a blank band", () => {
    expect(
      resolveHomepageStorySection(storyRow({ heading: "   " }), CLUB_NAME)
        .heading,
    ).toBe(defaultHomepageStoryContent(CLUB_NAME).heading);
  });

  it("hides the band only on an explicit stored false", () => {
    expect(
      resolveHomepageStorySection(storyRow({ visible: false }), CLUB_NAME)
        .visible,
    ).toBe(false);
  });

  it("round-trips every field through the admin draft", () => {
    const row = storyRow({
      visible: false,
      heading: "Building the next chapter",
      body_primary: "We coach, mentor, and compete.",
      body_secondary: "Every athlete belongs here.",
      cta_label: "Read more",
    });
    const payload = buildHomepageStoryMutationPayload(
      homepageStoryToDraft(row, CLUB_NAME),
    );
    expect(payload).toEqual({
      visible: false,
      heading: "Building the next chapter",
      body_primary: "We coach, mentor, and compete.",
      body_secondary: "Every athlete belongs here.",
      cta_label: "Read more",
    });
    expect(payload).not.toHaveProperty("club_id");
  });

  it("shows and saves the resolved template default for a brand-new draft", () => {
    // Christian found the placeholder-only pattern confusing (2026-08-09):
    // the box looked empty even though the live page showed real text. The
    // draft now carries the resolved default as a real, editable value, and
    // an unedited save writes that literal text -- his explicit choice over
    // preserving the old "stays blank forever" auto-update behavior.
    const defaults = defaultHomepageStoryContent(CLUB_NAME);
    expect(
      buildHomepageStoryMutationPayload(emptyHomepageStoryDraft(CLUB_NAME)),
    ).toEqual({
      visible: true,
      heading: defaults.heading,
      body_primary: defaults.bodyPrimary,
      body_secondary: defaults.bodySecondary,
      cta_label: defaults.ctaLabel,
    });
  });

  it("still lets a club explicitly blank a field to fall back to future template updates", () => {
    // The escape hatch survives: clearing the box to "" and saving is still
    // the way to opt back into "always show whatever the template currently
    // says" for that one field.
    expect(
      buildHomepageStoryMutationPayload({
        ...emptyHomepageStoryDraft(CLUB_NAME),
        heading: "",
      }),
    ).toMatchObject({ heading: "" });
  });

  it.each([
    ["heading", HOMEPAGE_STORY_LIMITS.heading],
    ["bodyPrimary", HOMEPAGE_STORY_LIMITS.bodyPrimary],
    ["bodySecondary", HOMEPAGE_STORY_LIMITS.bodySecondary],
    ["ctaLabel", HOMEPAGE_STORY_LIMITS.ctaLabel],
  ] as const)("rejects %s beyond %i characters", (field, maximum) => {
    const draft = emptyHomepageStoryDraft(CLUB_NAME);
    expect(
      validateHomepageStoryDraft({ ...draft, [field]: "x".repeat(maximum + 1) })[
        field
      ],
    ).toBeTruthy();
    expect(
      validateHomepageStoryDraft({ ...draft, [field]: "x".repeat(maximum) })[
        field
      ],
    ).toBeUndefined();
  });
});

describe("programs page copy is real admin content", () => {
  it("falls back to the approved academy@1 wording when a club has changed nothing", () => {
    expect(resolveProgramsPageContent(programsPageRow(), CLUB_NAME)).toEqual(
      defaultProgramsPageContent(CLUB_NAME),
    );
    expect(resolveProgramsPageContent(null, CLUB_NAME)).toEqual(
      defaultProgramsPageContent(CLUB_NAME),
    );
  });

  it("keeps every default tenant-neutral by naming the club from data", () => {
    const alpha = defaultProgramsPageContent("Alpha FC");
    expect(alpha.pathwayIntro).toContain("Alpha FC");
    expect(alpha.heroIntro).toContain("Alpha FC");
    expect(alpha.closingBody).toContain("Alpha FC");
    expect(JSON.stringify(alpha)).not.toContain("Diverse City");
  });

  it("prefers every stored value over the template default", () => {
    const stored = programsPageRow({
      pathway_eyebrow: "What we run",
      pathway_heading: "Somewhere for everyone.",
      pathway_intro: "Four programs, one pathway.",
      hero_eyebrow: "Programs",
      hero_headline_line_one: "Every level.",
      hero_headline_line_two: "Every athlete.",
      hero_intro: "From grassroots to amateur.",
      closing_heading_line_one: "Start",
      closing_heading_line_two: "here.",
      closing_body: "Get in touch and we will place your athlete.",
      closing_cta_label: "Talk to us",
    });
    expect(resolveProgramsPageContent(stored, CLUB_NAME)).toEqual({
      pathwayEyebrow: "What we run",
      pathwayHeading: "Somewhere for everyone.",
      pathwayIntro: "Four programs, one pathway.",
      heroEyebrow: "Programs",
      heroHeadlineLineOne: "Every level.",
      heroHeadlineLineTwo: "Every athlete.",
      heroIntro: "From grassroots to amateur.",
      closingHeadingLineOne: "Start",
      closingHeadingLineTwo: "here.",
      closingBody: "Get in touch and we will place your athlete.",
      closingCtaLabel: "Talk to us",
    });
  });

  it("round-trips every field through the admin draft", () => {
    const row = programsPageRow({
      pathway_heading: "Somewhere for everyone.",
      hero_headline_line_one: "Every level.",
      closing_cta_label: "Talk to us",
    });
    const payload = buildProgramsPageMutationPayload(programsPageToDraft(row));
    expect(payload).toMatchObject({
      pathway_heading: "Somewhere for everyone.",
      hero_headline_line_one: "Every level.",
      closing_cta_label: "Talk to us",
    });
    expect(payload).not.toHaveProperty("club_id");
    // Every column the migration created is carried, so a save never silently
    // drops a field a club edited.
    expect(Object.keys(payload).sort()).toEqual(
      [
        "closing_body",
        "closing_cta_label",
        "closing_heading_line_one",
        "closing_heading_line_two",
        "hero_eyebrow",
        "hero_headline_line_one",
        "hero_headline_line_two",
        "hero_intro",
        "pathway_eyebrow",
        "pathway_heading",
        "pathway_intro",
      ].sort(),
    );
  });

  it.each(
    Object.keys(PROGRAMS_PAGE_LIMITS) as Array<keyof ProgramsPageDraft>,
  )("rejects %s beyond its ceiling", (field) => {
    const maximum = PROGRAMS_PAGE_LIMITS[field];
    const draft = emptyProgramsPageDraft();
    expect(
      validateProgramsPageDraft({
        ...draft,
        [field]: "x".repeat(maximum + 1),
      })[field],
    ).toBeTruthy();
    expect(
      validateProgramsPageDraft({ ...draft, [field]: "x".repeat(maximum) })[
        field
      ],
    ).toBeUndefined();
  });
});

describe("footer tagline is real admin content", () => {
  it("falls back to the approved wording and prefers a stored value", () => {
    expect(resolveFooterTagline("")).toBe(DEFAULT_ACADEMY_FOOTER_TAGLINE);
    expect(resolveFooterTagline(null)).toBe(DEFAULT_ACADEMY_FOOTER_TAGLINE);
    expect(resolveFooterTagline("   ")).toBe(DEFAULT_ACADEMY_FOOTER_TAGLINE);
    expect(resolveFooterTagline("Play. Belong. Grow.")).toBe(
      "Play. Belong. Grow.",
    );
  });

  it("keeps the two-line lockup as a line break, not markup", () => {
    expect(DEFAULT_ACADEMY_FOOTER_TAGLINE).toContain("\n");
    expect(DEFAULT_ACADEMY_FOOTER_TAGLINE).not.toContain("<br");
  });

  it("mirrors the database ceiling", () => {
    expect(validateFooterTagline("x".repeat(FOOTER_TAGLINE_LIMIT))).toBeNull();
    expect(
      validateFooterTagline("x".repeat(FOOTER_TAGLINE_LIMIT + 1)),
    ).toMatch(/characters or fewer/);
  });
});

describe("new content tables in the admin data contract", () => {
  function request(table: string, overrides: Record<string, unknown> = {}) {
    return adminDataRequestSchema.safeParse({
      table,
      operation: "upsert",
      columns: "*",
      filters: [],
      ...overrides,
    });
  }

  it("gates each table behind the right feature", () => {
    expect(ADMIN_TABLE_FEATURES.homepage_story_section).toBe("homepage");
    expect(ADMIN_TABLE_FEATURES.programs_page_content).toBe("programs");
  });

  it("treats both as per-club singletons", () => {
    expect(SINGLETON_TABLES.has("homepage_story_section")).toBe(true);
    expect(SINGLETON_TABLES.has("programs_page_content")).toBe(true);
  });

  it("accepts a well-formed save for each table", () => {
    expect(
      request("homepage_story_section", {
        payload: buildHomepageStoryMutationPayload(
          emptyHomepageStoryDraft(CLUB_NAME),
        ),
      }).success,
    ).toBe(true);
    expect(
      request("programs_page_content", {
        payload: buildProgramsPageMutationPayload(emptyProgramsPageDraft()),
      }).success,
    ).toBe(true);
  });

  it("mirrors every database ceiling so an over-long field is a field error, not a 23514", () => {
    expect(
      request("homepage_story_section", {
        payload: { heading: "x".repeat(HOMEPAGE_STORY_LIMITS.heading) },
      }).success,
    ).toBe(true);
    expect(
      request("homepage_story_section", {
        payload: { heading: "x".repeat(HOMEPAGE_STORY_LIMITS.heading + 1) },
      }).success,
    ).toBe(false);
    expect(
      request("programs_page_content", {
        payload: { hero_intro: "x".repeat(PROGRAMS_PAGE_LIMITS.heroIntro + 1) },
      }).success,
    ).toBe(false);
    expect(
      request("programs_page_content", {
        payload: {
          closing_cta_label: "x".repeat(
            PROGRAMS_PAGE_LIMITS.closingCtaLabel + 1,
          ),
        },
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown column on either table", () => {
    expect(
      request("homepage_story_section", { payload: { video_url: "https://x.test" } })
        .success,
    ).toBe(false);
    expect(
      request("programs_page_content", { payload: { pathway_video: "x" } })
        .success,
    ).toBe(false);
  });

  it("rejects a client-supplied tenant identity", () => {
    expect(
      request("homepage_story_section", {
        payload: {
          club_id: "11111111-1111-4111-8111-111111111111",
          heading: "Forged",
        },
      }).success,
    ).toBe(false);
    expect(
      request("programs_page_content", {
        payload: {
          club_id: "11111111-1111-4111-8111-111111111111",
          hero_intro: "Forged",
        },
      }).success,
    ).toBe(false);
  });
});

describe("academy@1 surfaces render stored content, not literals", () => {
  const story = source("components/DevelopingNextGeneration.tsx");
  const pathway = source("components/AcademyProgramsPathway.tsx");
  const programsPage = source("components/AcademyProgramsPage.tsx");
  const footer = source("components/Footer.tsx");

  it("no longer hardcodes the homepage story copy", () => {
    for (const literal of [
      "Developing the next generation",
      "combines professional-level coaching",
      "leading inclusive soccer organizations",
      "Our Story",
    ]) {
      expect(
        story.includes(literal),
        `${literal} must come from admin content, not component source`,
      ).toBe(false);
    }
    expect(story).toContain("fetchHomepageStorySection");
    expect(story).toContain("story.bodyPrimary");
  });

  it("keeps the story section off the Behind the Rose singleton", () => {
    // Both sections are mounted on the same academy homepage; sharing one row
    // would render the same copy twice.
    expect(story).not.toContain("behind_the_rose");
    expect(story).not.toContain("BehindTheRose");
    expect(story).toContain("homepage-story-content");
    expect(source("components/BehindTheRose.tsx")).not.toContain(
      "homepage_story_section",
    );
  });

  it("keeps the story video out of admin scope", () => {
    // Text and images only: the Bunny Stream reel stays a constant (DCFC-D131).
    expect(story).toContain("DIVERSE_CITY_STORY_VIDEO");
    expect(story).not.toContain("video_url");
  });

  it("no longer hardcodes the programs band copy", () => {
    for (const literal of [
      "A pathway for every player.",
      "offers programs designed around development",
    ]) {
      expect(pathway.includes(literal), literal).toBe(false);
    }
    for (const literal of [
      "One pathway.",
      "Every athlete belongs.",
      "connects youth development",
      "Find your",
      "Find Your Program",
    ]) {
      expect(programsPage.includes(literal), literal).toBe(false);
    }
    expect(pathway).toContain("content.pathwayIntro");
    expect(programsPage).toContain("copy.heroIntro");
    expect(programsPage).toContain("copy.closingBody");
  });

  it("no longer hardcodes the footer tagline", () => {
    expect(footer).not.toContain("One Club. One Community.");
    expect(footer).not.toContain("Endless Opportunities.");
    expect(footer).toContain("footerTagline");
  });

  it("keeps program-detail template chrome as component source on purpose", () => {
    // The round-two audit classified these as chrome, not content: they label
    // sections whose substance is already per-program admin data
    // (programs.body, programs.highlights), and they read identically for any
    // academy@1 club. This test is the record of that decision — if a later
    // session decides to make them editable, it should change this
    // deliberately rather than by accident.
    const detail = source("components/AcademyProgramDetailPage.tsx");
    for (const chrome of [
      "The Program",
      "Grow through the game.",
      "Program Focus",
      "Development with purpose.",
      "Explore other programs.",
    ]) {
      expect(detail, `${chrome} is template chrome and stays in source`).toContain(
        chrome,
      );
    }
  });

  it("keeps no club's name written into a shared academy@1 template", () => {
    for (const path of [
      "components/DevelopingNextGeneration.tsx",
      "components/AcademyProgramsPathway.tsx",
      "components/AcademyProgramsPage.tsx",
      "components/Footer.tsx",
      "lib/homepage-story-content.ts",
      "lib/programs-page-content.ts",
      "lib/club-branding.ts",
    ]) {
      expect(
        source(path).includes("Diverse City FC"),
        `${path} must take the club name as data, not a literal`,
      ).toBe(false);
    }
  });

  it("exposes every new field in the admin forms", () => {
    const homepageAdmin = source("app/admin/(protected)/homepage/page.tsx");
    for (const field of [
      "storyFields",
      "bodyPrimary",
      "bodySecondary",
      "ctaLabel",
      "homepage_story_section",
    ]) {
      expect(
        homepageAdmin,
        `${field} must be editable in /admin/homepage`,
      ).toContain(field);
    }

    const programsAdmin = source("app/admin/(protected)/programs/page.tsx");
    for (const field of [
      "pathwayEyebrow",
      "pathwayHeading",
      "pathwayIntro",
      "heroEyebrow",
      "heroHeadlineLineOne",
      "heroHeadlineLineTwo",
      "heroIntro",
      "closingHeadingLineOne",
      "closingHeadingLineTwo",
      "closingBody",
      "closingCtaLabel",
      "programs_page_content",
    ]) {
      expect(
        programsAdmin,
        `${field} must be editable in /admin/programs`,
      ).toContain(field);
    }

    const brandingAdmin = source("app/admin/(protected)/branding/page.tsx");
    expect(brandingAdmin).toContain("footer_tagline");
    expect(brandingAdmin).toContain("footerTagline");
  });
});
