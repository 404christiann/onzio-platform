import type { DBProgramsPageContent } from "@/lib/db-types";

/**
 * Resolved copy for the three academy@1 programs prose bands: the homepage
 * pathway block (components/AcademyProgramsPathway.tsx) and the /programs hero
 * and closing band (components/AcademyProgramsPage.tsx).
 *
 * The programs themselves are not here — they are rows in onzio.programs,
 * already editable at /admin/programs. This is only the copy wrapped around
 * them.
 */
export type ProgramsPageContent = {
  pathwayEyebrow: string;
  pathwayHeading: string;
  pathwayIntro: string;
  heroEyebrow: string;
  heroHeadlineLineOne: string;
  heroHeadlineLineTwo: string;
  heroIntro: string;
  closingHeadingLineOne: string;
  closingHeadingLineTwo: string;
  closingBody: string;
  closingCtaLabel: string;
};

export const PROGRAMS_PAGE_LIMITS = {
  pathwayEyebrow: 80,
  pathwayHeading: 120,
  pathwayIntro: 320,
  heroEyebrow: 80,
  heroHeadlineLineOne: 80,
  heroHeadlineLineTwo: 80,
  heroIntro: 320,
  closingHeadingLineOne: 80,
  closingHeadingLineTwo: 80,
  closingBody: 320,
  closingCtaLabel: 40,
} as const;

/**
 * Approved academy@1 wording, previously hardcoded in the two components.
 *
 * Every string that names the club is built from `clubName` rather than a
 * literal, so the default stays tenant-neutral for any future academy@1 club
 * — the same fix round one applied to `AcademySponsorsPage`'s intro.
 */
export function defaultProgramsPageContent(
  clubName: string,
): ProgramsPageContent {
  const club = clubName.trim() || "The club";
  return {
    pathwayEyebrow: "Our Programs",
    pathwayHeading: "A pathway for every player.",
    pathwayIntro: `From first competitive steps to high-level amateur soccer, ${club} offers programs designed around development, inclusion, and opportunity.`,
    heroEyebrow: "Our Programs",
    heroHeadlineLineOne: "One pathway.",
    heroHeadlineLineTwo: "Every athlete belongs.",
    heroIntro: `${club} connects youth development, specialized programming, and high-level competition. Every program helps athletes grow in confidence, skill, teamwork, and character.`,
    closingHeadingLineOne: "Find your",
    closingHeadingLineTwo: "pathway.",
    closingBody: `Contact ${club} to find the program that best fits your athlete’s goals and support needs.`,
    closingCtaLabel: "Find Your Program",
  };
}

function orDefault(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

/** Resolves a stored programs-page row against the template defaults. */
export function resolveProgramsPageContent(
  row: Partial<DBProgramsPageContent> | null | undefined,
  clubName: string,
): ProgramsPageContent {
  const defaults = defaultProgramsPageContent(clubName);
  return {
    pathwayEyebrow: orDefault(row?.pathway_eyebrow, defaults.pathwayEyebrow),
    pathwayHeading: orDefault(row?.pathway_heading, defaults.pathwayHeading),
    pathwayIntro: orDefault(row?.pathway_intro, defaults.pathwayIntro),
    heroEyebrow: orDefault(row?.hero_eyebrow, defaults.heroEyebrow),
    heroHeadlineLineOne: orDefault(
      row?.hero_headline_line_one,
      defaults.heroHeadlineLineOne,
    ),
    // The second hero line renders in the sky accent colour; a club that wants
    // a single-line headline clears it, so an empty stored value here is only
    // replaced by the default when the row itself is absent.
    heroHeadlineLineTwo: orDefault(
      row?.hero_headline_line_two,
      defaults.heroHeadlineLineTwo,
    ),
    heroIntro: orDefault(row?.hero_intro, defaults.heroIntro),
    closingHeadingLineOne: orDefault(
      row?.closing_heading_line_one,
      defaults.closingHeadingLineOne,
    ),
    closingHeadingLineTwo: orDefault(
      row?.closing_heading_line_two,
      defaults.closingHeadingLineTwo,
    ),
    closingBody: orDefault(row?.closing_body, defaults.closingBody),
    closingCtaLabel: orDefault(
      row?.closing_cta_label,
      defaults.closingCtaLabel,
    ),
  };
}
