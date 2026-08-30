import type { DBTryoutsPageContent } from "@/lib/db-types";

/**
 * Resolved copy for the two /tryouts page intro paragraphs
 * (components/AcademyTryoutsPage.tsx).
 *
 * The tryout events themselves are not here — they are rows in onzio.tryouts,
 * already editable at /admin/tryouts. This is only the page-level wording
 * wrapped around them, which is why it is a per-club singleton rather than
 * more columns on a per-event row: neither sentence belongs to any one event.
 */
export type TryoutsPageContent = {
  introWithTryouts: string;
  introNoTryouts: string;
};

export const TRYOUTS_PAGE_LIMITS = {
  introWithTryouts: 320,
  introNoTryouts: 320,
} as const;

/**
 * Approved wording, previously hardcoded in AcademyTryoutsPage.
 *
 * Neither sentence names the club, so unlike the programs-page defaults these
 * need no `clubName` interpolation to stay tenant-neutral.
 */
export const DEFAULT_TRYOUTS_PAGE_CONTENT: TryoutsPageContent = {
  introWithTryouts:
    "Review current club evaluations below. Registration, waivers, and participant information stay with the club's external provider.",
  introNoTryouts:
    "Tryout dates and locations are still being finalized. Register your interest below to stay informed once details are announced.",
};

function orDefault(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

/** Resolves a stored tryouts-page row against the template defaults. */
export function resolveTryoutsPageContent(
  row: Partial<DBTryoutsPageContent> | null | undefined,
): TryoutsPageContent {
  return {
    introWithTryouts: orDefault(
      row?.intro_with_tryouts,
      DEFAULT_TRYOUTS_PAGE_CONTENT.introWithTryouts,
    ),
    introNoTryouts: orDefault(
      row?.intro_no_tryouts,
      DEFAULT_TRYOUTS_PAGE_CONTENT.introNoTryouts,
    ),
  };
}
