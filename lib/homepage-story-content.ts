import type { DBHomepageStorySection } from "@/lib/db-types";

/**
 * Resolved copy for the academy@1 homepage story band
 * (components/DevelopingNextGeneration.tsx).
 */
export type HomepageStoryContent = {
  visible: boolean;
  heading: string;
  bodyPrimary: string;
  bodySecondary: string;
  ctaLabel: string;
};

export const HOMEPAGE_STORY_LIMITS = {
  heading: 120,
  bodyPrimary: 1_200,
  bodySecondary: 1_200,
  ctaLabel: 40,
} as const;

/**
 * Template defaults for the homepage story band.
 *
 * These are the approved academy@1 strings that used to be hardcoded inside
 * `components/DevelopingNextGeneration.tsx`. They live here for the same reason
 * `DEFAULT_PROGRAM_REGISTRATION_CONTENT` and `DEFAULT_HOMEPAGE_HERO_CONTENT` do:
 * a club that has never touched a field still renders the approved wording, so
 * an empty column stays a legitimate "unset" value rather than a blank band —
 * and no deploy-time data seed is needed to preserve today's output.
 *
 * `bodyPrimary` is a function of the club name rather than a literal because
 * the sentence names the club. Writing one tenant's name into a shared
 * academy@1 default is the exact latent bug round one found in
 * `AcademySponsorsPage`; a club that saves its own text overrides this entirely.
 */
export function defaultHomepageStoryContent(
  clubName: string,
): Omit<HomepageStoryContent, "visible"> {
  const club = clubName.trim() || "The club";
  return {
    heading: "Developing the next generation",
    bodyPrimary: `${club} combines professional-level coaching, mentorship, and community support to help athletes progress from grassroots soccer to elite competition. The pathway emphasizes character, leadership, and personal growth.`,
    bodySecondary:
      "The club’s vision is to become one of the nation’s leading inclusive soccer organizations while ensuring every athlete has a meaningful opportunity to succeed.",
    ctaLabel: "Our Story",
  };
}

function orDefault(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

/**
 * Resolves a stored homepage story row against the template defaults.
 *
 * A missing row resolves to `visible: true` plus the defaults, which is what
 * keeps the section rendering exactly as it did when the copy was hardcoded.
 * Only an explicit stored `visible = false` hides it.
 */
export function resolveHomepageStorySection(
  row: Partial<DBHomepageStorySection> | null | undefined,
  clubName: string,
): HomepageStoryContent {
  const defaults = defaultHomepageStoryContent(clubName);
  return {
    visible: row ? row.visible !== false : true,
    heading: orDefault(row?.heading, defaults.heading),
    bodyPrimary: orDefault(row?.body_primary, defaults.bodyPrimary),
    bodySecondary: orDefault(row?.body_secondary, defaults.bodySecondary),
    ctaLabel: orDefault(row?.cta_label, defaults.ctaLabel),
  };
}
