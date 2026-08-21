import type { DBTryout, DBTryoutsPageContent } from "@/lib/db-types";
import { normalizePublicHref } from "@/lib/public-link";
import {
  resolveTryoutsPageContent,
  TRYOUTS_PAGE_LIMITS,
} from "@/lib/tryouts-page-content";

export type TryoutStatus = "upcoming" | "open" | "closed";

/**
 * One tryout event as edited in /admin/tryouts.
 *
 * `eyebrow`, `intro`, `eligibilityCopy`, `whatToExpectCopy`, and
 * `preparationCopy` no longer have inputs in the editor and no longer render on
 * the public page. They stay on the draft — and stay in
 * `buildTryoutMutationPayload` — deliberately: this repo's discipline is to
 * hide retired UI without dropping the column, and keeping them here means any
 * value a club already stored round-trips through a save untouched rather than
 * being silently blanked. `headline` is the editor's single "Name" field.
 */
export type TryoutDraft = {
  id: string | null;
  programId: string | null;
  status: TryoutStatus;
  eyebrow: string;
  headline: string;
  intro: string;
  heroMediaAssetId: string | null;
  heroMediaPreviewUrl: string;
  eligibilityCopy: string;
  whatToExpectCopy: string;
  preparationCopy: string;
  eventDate: string;
  location: string;
  costText: string;
  ctaLabel: string;
  registrationHref: string;
  registrationFormId: string | null;
  closedMessage: string;
  sortOrder: number;
};

export type TryoutValidationErrors = Partial<
  Record<
    | "eyebrow"
    | "headline"
    | "intro"
    | "eligibilityCopy"
    | "whatToExpectCopy"
    | "preparationCopy"
    | "eventDate"
    | "location"
    | "costText"
    | "ctaLabel"
    | "registrationHref"
    | "closedMessage",
    string
  >
>;

export function emptyTryoutDraft(sortOrder = 0): TryoutDraft {
  return {
    id: null,
    programId: null,
    status: "upcoming",
    eyebrow: "",
    headline: "",
    intro: "",
    heroMediaAssetId: null,
    heroMediaPreviewUrl: "",
    eligibilityCopy: "",
    whatToExpectCopy: "",
    preparationCopy: "",
    eventDate: "",
    location: "",
    costText: "",
    ctaLabel: "",
    registrationHref: "",
    registrationFormId: null,
    closedMessage: "",
    sortOrder,
  };
}

/**
 * A `tryouts` row as /api/admin/data returns it on select: stored columns plus
 * the hero delivery URL the route resolves from `hero_media_asset_id` (see
 * ADMIN_SELECT_MEDIA_REFERENCES). Absent when no published hero is attached.
 */
export type AdminTryoutRow = DBTryout & { hero_media_url?: string };

export function tryoutToDraft(row: AdminTryoutRow): TryoutDraft {
  return {
    id: row.id,
    programId: row.program_id,
    status:
      row.status === "open" || row.status === "closed"
        ? row.status
        : "upcoming",
    eyebrow: row.eyebrow,
    headline: row.headline,
    intro: row.intro,
    heroMediaAssetId: row.hero_media_asset_id,
    heroMediaPreviewUrl: row.hero_media_url ?? "",
    eligibilityCopy: row.eligibility_copy,
    whatToExpectCopy: row.what_to_expect_copy,
    preparationCopy: row.preparation_copy,
    eventDate: row.event_date ?? "",
    location: row.location,
    costText: row.cost_text,
    ctaLabel: row.cta_label,
    registrationHref: row.registration_href,
    registrationFormId: row.registration_form_id,
    closedMessage: row.closed_message,
    sortOrder: row.sort_order,
  };
}

function lengthError(
  value: string,
  maximum: number,
  label: string,
): string | undefined {
  return value.length > maximum
    ? `${label} must be ${maximum} characters or fewer.`
    : undefined;
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function validateTryoutDraft(
  draft: TryoutDraft,
): TryoutValidationErrors {
  const errors: TryoutValidationErrors = {};
  for (const [field, value, maximum, label] of [
    ["eyebrow", draft.eyebrow, 80, "Eyebrow"],
    // Surfaced in the editor as "Name" since the eyebrow/headline pair was
    // merged into one field; the column is still `headline`.
    ["headline", draft.headline, 80, "Name"],
    ["intro", draft.intro, 320, "Introduction"],
    ["eligibilityCopy", draft.eligibilityCopy, 2_000, "Eligibility"],
    ["whatToExpectCopy", draft.whatToExpectCopy, 2_000, "What to expect"],
    ["preparationCopy", draft.preparationCopy, 2_000, "Preparation"],
    ["location", draft.location, 160, "Location"],
    ["costText", draft.costText, 120, "Cost"],
    ["ctaLabel", draft.ctaLabel, 40, "CTA label"],
    ["closedMessage", draft.closedMessage, 320, "Closed message"],
  ] as const) {
    const error = lengthError(value, maximum, label);
    if (error) errors[field] = error;
  }

  const eventDate = draft.eventDate.trim();
  if (eventDate && !isCalendarDate(eventDate)) {
    errors.eventDate = "Enter a valid calendar date or leave it blank for TBA.";
  }

  const href = draft.registrationHref.trim();
  const label = draft.ctaLabel.trim();
  if (href.length > 2_048) {
    errors.registrationHref =
      "Registration destination must be 2048 characters or fewer.";
  } else if (href && !normalizePublicHref(href)) {
    errors.registrationHref =
      "Use an HTTPS, HTTP, mailto, or single-slash local destination.";
  }
  if (href && !label) {
    errors.ctaLabel = "Add a CTA label or remove the registration destination.";
  }

  return errors;
}

export function buildTryoutMutationPayload(
  draft: TryoutDraft,
): Record<string, unknown> {
  const eventDate = draft.eventDate.trim();
  return {
    program_id: draft.programId,
    status: draft.status,
    eyebrow: draft.eyebrow.trim(),
    headline: draft.headline.trim(),
    intro: draft.intro.trim(),
    hero_media_asset_id: draft.heroMediaAssetId,
    eligibility_copy: draft.eligibilityCopy.trim(),
    what_to_expect_copy: draft.whatToExpectCopy.trim(),
    preparation_copy: draft.preparationCopy.trim(),
    event_date: eventDate || null,
    location: draft.location.trim(),
    cost_text: draft.costText.trim(),
    cta_label: draft.ctaLabel.trim(),
    registration_href: draft.registrationHref.trim(),
    registration_form_id: draft.registrationFormId,
    closed_message: draft.closedMessage.trim(),
    sort_order: draft.sortOrder,
  };
}

/**
 * Turns an unsaved editor draft back into the row shape the public tryouts
 * mapper expects, so /admin/tryouts can preview a draft through the real
 * component and the real content rules. Trimming matches
 * buildTryoutMutationPayload exactly — the preview must show what saving would
 * publish, not what is currently typed.
 */
export function tryoutDraftToRow(draft: TryoutDraft): AdminTryoutRow {
  return {
    ...(buildTryoutMutationPayload(draft) as Omit<DBTryout, "id" | "club_id">),
    id: draft.id ?? "draft-tryout",
    club_id: "",
    hero_media_url: draft.heroMediaPreviewUrl,
  } as AdminTryoutRow;
}

/**
 * The two /tryouts page intro paragraphs as edited in /admin/tryouts.
 *
 * Like the program registration fields, empty is preserved: it means "use the
 * approved template wording" (lib/tryouts-page-content.ts), which is what the
 * form shows as each input's placeholder.
 */
export type TryoutsPageDraft = {
  introWithTryouts: string;
  introNoTryouts: string;
};

export type TryoutsPageValidationErrors = Partial<
  Record<keyof TryoutsPageDraft, string>
>;

const TRYOUTS_PAGE_FIELD_LABELS: Record<keyof TryoutsPageDraft, string> = {
  introWithTryouts: "Intro shown when tryouts are published",
  introNoTryouts: "Intro shown when none are published",
};

export function emptyTryoutsPageDraft(): TryoutsPageDraft {
  return resolveTryoutsPageContent(null);
}

/**
 * Shows the resolved template default as a real, editable value rather than
 * a placeholder hint (Christian found the placeholder-only pattern
 * confusing, 2026-08-09). This is a display/editing convenience only: a club
 * that clears a field back to empty and saves still gets the "use the live
 * template default" blank state, since resolveTryoutsPageContent treats
 * blank exactly as it always has.
 */
export function tryoutsPageToDraft(
  row: Partial<DBTryoutsPageContent> | null | undefined,
): TryoutsPageDraft {
  return resolveTryoutsPageContent(row);
}

export function validateTryoutsPageDraft(
  draft: TryoutsPageDraft,
): TryoutsPageValidationErrors {
  const errors: TryoutsPageValidationErrors = {};
  for (const field of Object.keys(draft) as Array<keyof TryoutsPageDraft>) {
    const error = lengthError(
      draft[field],
      TRYOUTS_PAGE_LIMITS[field],
      TRYOUTS_PAGE_FIELD_LABELS[field],
    );
    if (error) errors[field] = error;
  }
  return errors;
}

export function buildTryoutsPageMutationPayload(
  draft: TryoutsPageDraft,
): Record<string, unknown> {
  return {
    intro_with_tryouts: draft.introWithTryouts.trim(),
    intro_no_tryouts: draft.introNoTryouts.trim(),
  };
}

export function moveTryout(
  tryouts: readonly TryoutDraft[],
  index: number,
  delta: -1 | 1,
): TryoutDraft[] {
  const destination = index + delta;
  if (
    index < 0 ||
    index >= tryouts.length ||
    destination < 0 ||
    destination >= tryouts.length
  ) {
    return tryouts as TryoutDraft[];
  }
  const next = tryouts.map((tryout) => ({ ...tryout }));
  [next[index], next[destination]] = [next[destination], next[index]];
  return next.map((tryout, sortOrder) => ({ ...tryout, sortOrder }));
}
