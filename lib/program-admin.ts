import type {
  DBProgram,
  DBProgramMedia,
  DBProgramsPageContent,
} from "@/lib/db-types";
import { normalizePublicHref } from "@/lib/public-link";
import {
  normalizeProgramMedia,
  PROGRAM_MEDIA_LIMITS,
  PROGRAM_REGISTRATION_LIMITS,
  resolveProgramRegistration,
} from "@/lib/program-content";
import { PROGRAMS_PAGE_LIMITS } from "@/lib/programs-page-content";
import type { ProgramContent } from "@/lib/queries";

/** One row of a program's ordered gallery, as edited in /admin/programs. */
export type ProgramMediaDraft = {
  id: string | null;
  url: string;
  mediaAssetId: string | null;
  alt: string;
  sortOrder: number;
};

export type ProgramDraft = {
  id: string | null;
  slug: string;
  navLabel: string;
  displayTitle: string;
  kicker: string;
  summary: string;
  body: string;
  highlights: string[];
  layoutVariant: "statement_band" | "detail_focus";
  heroMediaAssetId: string | null;
  detailMediaAssetId: string | null;
  heroMediaPreviewUrl: string;
  detailMediaPreviewUrl: string;
  externalCtaLabel: string;
  externalCtaHref: string;
  registrationEnabled: boolean;
  registrationEyebrow: string;
  registrationHeadline: string;
  registrationBody: string;
  registrationPendingBody: string;
  registrationPendingLabel: string;
  status: "active" | "hidden";
  sortOrder: number;
};

export type ProgramValidationErrors = Partial<
  Record<
    | "slug"
    | "navLabel"
    | "displayTitle"
    | "kicker"
    | "summary"
    | "body"
    | "highlights"
    | "externalCtaLabel"
    | "externalCtaHref"
    | "registrationEyebrow"
    | "registrationHeadline"
    | "registrationBody"
    | "registrationPendingBody"
    | "registrationPendingLabel",
    string
  >
>;

export function emptyProgramDraft(sortOrder = 0): ProgramDraft {
  return {
    id: null,
    slug: "",
    navLabel: "",
    displayTitle: "",
    kicker: "",
    summary: "",
    body: "",
    highlights: [],
    layoutVariant: "statement_band",
    heroMediaAssetId: null,
    detailMediaAssetId: null,
    heroMediaPreviewUrl: "",
    detailMediaPreviewUrl: "",
    externalCtaLabel: "",
    externalCtaHref: "",
    registrationEnabled: false,
    registrationEyebrow: "",
    registrationHeadline: "",
    registrationBody: "",
    registrationPendingBody: "",
    registrationPendingLabel: "",
    status: "active",
    sortOrder,
  };
}

function programHighlights(value: DBProgram["highlights"]): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/**
 * A `programs` row as /api/admin/data returns it on select: the stored columns
 * plus the delivery URLs the route resolves from the media asset references
 * (see ADMIN_SELECT_MEDIA_REFERENCES). Both URL fields are absent when the
 * program has no published media attached.
 */
export type AdminProgramRow = DBProgram & {
  hero_media_url?: string | null;
  detail_media_url?: string | null;
};

export function programToDraft(row: AdminProgramRow): ProgramDraft {
  // The registration copy fields show the real template default as a real,
  // editable value rather than a placeholder hint that vanishes on focus —
  // Christian found the placeholder-only pattern confusing (2026-08-09). This
  // is a display/editing convenience only: an admin who clears a field back
  // to empty and saves still gets the "use the live template default" blank
  // state, since the resolver used here treats blank exactly as it always
  // has (lib/program-content.ts's resolveProgramRegistration).
  const registration = resolveProgramRegistration(row);
  return {
    id: row.id,
    slug: row.slug,
    navLabel: row.nav_label,
    displayTitle: row.display_title,
    kicker: row.kicker,
    summary: row.summary,
    body: row.body,
    highlights: programHighlights(row.highlights),
    layoutVariant:
      row.layout_variant === "detail_focus" ? "detail_focus" : "statement_band",
    heroMediaAssetId: row.hero_media_asset_id,
    detailMediaAssetId: row.detail_media_asset_id,
    heroMediaPreviewUrl: row.hero_media_url ?? "",
    detailMediaPreviewUrl: row.detail_media_url ?? "",
    externalCtaLabel: row.external_cta_label,
    externalCtaHref: row.external_cta_href,
    registrationEnabled: row.registration_enabled === true,
    registrationEyebrow: registration.eyebrow,
    registrationHeadline: registration.headline,
    registrationBody: registration.body,
    registrationPendingBody: registration.pendingBody,
    registrationPendingLabel: registration.pendingLabel,
    status: row.status === "hidden" ? "hidden" : "active",
    sortOrder: row.sort_order,
  };
}

export function programMediaToDraft(row: DBProgramMedia): ProgramMediaDraft {
  return {
    id: row.id,
    url: row.url,
    mediaAssetId: row.media_asset_id,
    alt: row.alt,
    sortOrder: row.sort_order,
  };
}

export function buildProgramMediaMutationPayload(
  draft: ProgramMediaDraft,
  programId: string,
): Record<string, unknown> {
  return {
    program_id: programId,
    url: draft.url.trim(),
    media_asset_id: draft.mediaAssetId,
    alt: draft.alt.trim(),
    sort_order: draft.sortOrder,
  };
}

/**
 * Returns a message when the gallery cannot be saved, or null when it can.
 * Mirrors the CHECK constraints on onzio.program_media plus the admin-side
 * ceiling on gallery size.
 */
export function validateProgramMedia(
  media: readonly ProgramMediaDraft[],
): string | null {
  if (media.length > PROGRAM_MEDIA_LIMITS.items) {
    return `A program gallery holds at most ${PROGRAM_MEDIA_LIMITS.items} images.`;
  }
  if (media.some((item) => !item.url.trim() && !item.mediaAssetId)) {
    return "Every gallery image needs an uploaded file.";
  }
  if (media.some((item) => item.alt.trim().length > PROGRAM_MEDIA_LIMITS.alt)) {
    return `Image descriptions must be ${PROGRAM_MEDIA_LIMITS.alt} characters or fewer.`;
  }
  return null;
}

export function moveProgramMedia(
  media: readonly ProgramMediaDraft[],
  index: number,
  delta: -1 | 1,
): ProgramMediaDraft[] {
  const destination = index + delta;
  if (
    index < 0 ||
    index >= media.length ||
    destination < 0 ||
    destination >= media.length
  ) {
    return media as ProgramMediaDraft[];
  }
  const next = media.map((item) => ({ ...item }));
  [next[index], next[destination]] = [next[destination], next[index]];
  return next.map((item, sortOrder) => ({ ...item, sortOrder }));
}

function textLengthError(
  value: string,
  maximum: number,
  label: string,
): string | undefined {
  return value.length > maximum
    ? `${label} must be ${maximum} characters or fewer.`
    : undefined;
}

export function validateProgramDraft(
  draft: ProgramDraft,
): ProgramValidationErrors {
  const errors: ProgramValidationErrors = {};
  const slug = draft.slug.trim();
  const title = draft.displayTitle.trim();
  if (!slug) {
    errors.slug = "Slug is required.";
  } else if (slug.length > 64 || !/^[a-z][a-z0-9-]*$/.test(slug)) {
    errors.slug =
      "Use lowercase letters, numbers, and hyphens, beginning with a letter.";
  }
  if (!title) {
    errors.displayTitle = "Display title is required.";
  } else if (title.length > 120) {
    errors.displayTitle = "Display title must be 120 characters or fewer.";
  }

  for (const [field, value, maximum, label] of [
    ["navLabel", draft.navLabel, 40, "Navigation label"],
    ["kicker", draft.kicker, 80, "Kicker"],
    ["summary", draft.summary, 320, "Summary"],
    ["body", draft.body, 6_000, "Body"],
    ["externalCtaLabel", draft.externalCtaLabel, 40, "CTA label"],
    [
      "registrationEyebrow",
      draft.registrationEyebrow,
      PROGRAM_REGISTRATION_LIMITS.eyebrow,
      "Registration eyebrow",
    ],
    [
      "registrationHeadline",
      draft.registrationHeadline,
      PROGRAM_REGISTRATION_LIMITS.headline,
      "Registration headline",
    ],
    [
      "registrationBody",
      draft.registrationBody,
      PROGRAM_REGISTRATION_LIMITS.body,
      "Registration body",
    ],
    [
      "registrationPendingBody",
      draft.registrationPendingBody,
      PROGRAM_REGISTRATION_LIMITS.pendingBody,
      "Registration pending body",
    ],
    [
      "registrationPendingLabel",
      draft.registrationPendingLabel,
      PROGRAM_REGISTRATION_LIMITS.pendingLabel,
      "Registration pending label",
    ],
  ] as const) {
    const error = textLengthError(value, maximum, label);
    if (error) errors[field] = error;
  }

  if (
    draft.highlights.length > 200 ||
    draft.highlights.some((highlight) => highlight.trim().length > 320)
  ) {
    errors.highlights =
      "Highlights are limited to 200 items and 320 characters per item.";
  }

  const ctaLabel = draft.externalCtaLabel.trim();
  const ctaHref = draft.externalCtaHref.trim();
  if (ctaLabel && !ctaHref) {
    errors.externalCtaHref = "Add a CTA destination or remove the CTA label.";
  } else if (!ctaLabel && ctaHref) {
    errors.externalCtaLabel = "Add a CTA label or remove the destination.";
  }
  if (ctaHref.length > 2_048) {
    errors.externalCtaHref = "CTA destination must be 2048 characters or fewer.";
  } else if (ctaHref && !normalizePublicHref(ctaHref)) {
    errors.externalCtaHref =
      "Use an HTTPS, HTTP, mailto, or single-slash local destination.";
  }

  return errors;
}

export function buildProgramMutationPayload(
  draft: ProgramDraft,
): Record<string, unknown> {
  return {
    slug: draft.slug.trim(),
    nav_label: draft.navLabel.trim(),
    display_title: draft.displayTitle.trim(),
    kicker: draft.kicker.trim(),
    summary: draft.summary.trim(),
    body: draft.body.trim(),
    highlights: draft.highlights
      .map((highlight) => highlight.trim())
      .filter(Boolean),
    layout_variant: draft.layoutVariant,
    hero_media_asset_id: draft.heroMediaAssetId,
    detail_media_asset_id: draft.detailMediaAssetId,
    external_cta_label: draft.externalCtaLabel.trim(),
    external_cta_href: draft.externalCtaHref.trim(),
    registration_enabled: draft.registrationEnabled,
    // Empty is preserved deliberately: it means "use the academy@1 template
    // default" (lib/program-content.ts), not "render nothing".
    registration_eyebrow: draft.registrationEyebrow.trim(),
    registration_headline: draft.registrationHeadline.trim(),
    registration_body: draft.registrationBody.trim(),
    registration_pending_body: draft.registrationPendingBody.trim(),
    registration_pending_label: draft.registrationPendingLabel.trim(),
    status: draft.status,
    sort_order: draft.sortOrder,
  };
}

/**
 * Turns an unsaved editor draft plus its gallery into the shape the public
 * program detail template consumes, so /admin/programs can preview a draft
 * through the real component and the real content rules instead of a second
 * copy that can drift.
 *
 * Field values are taken from `buildProgramMutationPayload`, so the trimming
 * matches a save exactly — the preview shows what publishing would produce,
 * not what is currently typed. Registration copy and gallery images go through
 * the same resolvers `mapProgram` uses in lib/queries.ts, which is what makes a
 * blank registration field preview its template default and an unsaved,
 * just-uploaded image appear in the slideshow.
 */
export function programDraftToContent(
  draft: ProgramDraft,
  gallery: readonly ProgramMediaDraft[] = [],
): ProgramContent {
  const payload = buildProgramMutationPayload(draft) as Record<string, unknown>;
  const href = normalizePublicHref(String(payload.external_cta_href ?? ""));
  const label = String(payload.external_cta_label ?? "");
  return {
    id: draft.id ?? "draft-program",
    slug: String(payload.slug ?? ""),
    navLabel: String(payload.nav_label ?? ""),
    displayTitle: String(payload.display_title ?? ""),
    kicker: String(payload.kicker ?? ""),
    summary: String(payload.summary ?? ""),
    body: String(payload.body ?? ""),
    highlights: (payload.highlights as string[]) ?? [],
    layoutVariant: draft.layoutVariant,
    heroMediaUrl: draft.heroMediaPreviewUrl,
    detailMediaUrl: draft.detailMediaPreviewUrl,
    externalCta: href && label ? { label, href } : null,
    registration: resolveProgramRegistration({
      registration_enabled: draft.registrationEnabled,
      registration_eyebrow: String(payload.registration_eyebrow ?? ""),
      registration_headline: String(payload.registration_headline ?? ""),
      registration_body: String(payload.registration_body ?? ""),
      registration_pending_body: String(
        payload.registration_pending_body ?? "",
      ),
      registration_pending_label: String(
        payload.registration_pending_label ?? "",
      ),
    }),
    media: normalizeProgramMedia(
      gallery.map((item, index) => ({
        id: item.id ?? `draft-media-${index}`,
        url: item.url,
        alt: item.alt,
        sort_order: index,
      })),
    ),
    sortOrder: draft.sortOrder,
  };
}

/**
 * The three programs prose bands as edited in /admin/programs.
 *
 * Like the registration fields, empty is preserved: it means "use the approved
 * academy@1 wording" (lib/programs-page-content.ts), which is what the form
 * shows as each input's placeholder.
 */
export type ProgramsPageDraft = {
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

export type ProgramsPageValidationErrors = Partial<
  Record<keyof ProgramsPageDraft, string>
>;

const PROGRAMS_PAGE_FIELD_LABELS: Record<keyof ProgramsPageDraft, string> = {
  pathwayEyebrow: "Homepage band eyebrow",
  pathwayHeading: "Homepage band heading",
  pathwayIntro: "Homepage band intro",
  heroEyebrow: "Programs page eyebrow",
  heroHeadlineLineOne: "Programs page headline line 1",
  heroHeadlineLineTwo: "Programs page headline line 2",
  heroIntro: "Programs page intro",
  closingHeadingLineOne: "Closing heading line 1",
  closingHeadingLineTwo: "Closing heading line 2",
  closingBody: "Closing paragraph",
  closingCtaLabel: "Closing button label",
};

export function emptyProgramsPageDraft(): ProgramsPageDraft {
  return {
    pathwayEyebrow: "",
    pathwayHeading: "",
    pathwayIntro: "",
    heroEyebrow: "",
    heroHeadlineLineOne: "",
    heroHeadlineLineTwo: "",
    heroIntro: "",
    closingHeadingLineOne: "",
    closingHeadingLineTwo: "",
    closingBody: "",
    closingCtaLabel: "",
  };
}

export function programsPageToDraft(
  row: Partial<DBProgramsPageContent> | null | undefined,
): ProgramsPageDraft {
  if (!row) return emptyProgramsPageDraft();
  return {
    pathwayEyebrow: row.pathway_eyebrow ?? "",
    pathwayHeading: row.pathway_heading ?? "",
    pathwayIntro: row.pathway_intro ?? "",
    heroEyebrow: row.hero_eyebrow ?? "",
    heroHeadlineLineOne: row.hero_headline_line_one ?? "",
    heroHeadlineLineTwo: row.hero_headline_line_two ?? "",
    heroIntro: row.hero_intro ?? "",
    closingHeadingLineOne: row.closing_heading_line_one ?? "",
    closingHeadingLineTwo: row.closing_heading_line_two ?? "",
    closingBody: row.closing_body ?? "",
    closingCtaLabel: row.closing_cta_label ?? "",
  };
}

export function validateProgramsPageDraft(
  draft: ProgramsPageDraft,
): ProgramsPageValidationErrors {
  const errors: ProgramsPageValidationErrors = {};
  for (const field of Object.keys(draft) as Array<keyof ProgramsPageDraft>) {
    const maximum = PROGRAMS_PAGE_LIMITS[field];
    const error = textLengthError(
      draft[field],
      maximum,
      PROGRAMS_PAGE_FIELD_LABELS[field],
    );
    if (error) errors[field] = error;
  }
  return errors;
}

export function buildProgramsPageMutationPayload(
  draft: ProgramsPageDraft,
): Record<string, unknown> {
  return {
    pathway_eyebrow: draft.pathwayEyebrow.trim(),
    pathway_heading: draft.pathwayHeading.trim(),
    pathway_intro: draft.pathwayIntro.trim(),
    hero_eyebrow: draft.heroEyebrow.trim(),
    hero_headline_line_one: draft.heroHeadlineLineOne.trim(),
    hero_headline_line_two: draft.heroHeadlineLineTwo.trim(),
    hero_intro: draft.heroIntro.trim(),
    closing_heading_line_one: draft.closingHeadingLineOne.trim(),
    closing_heading_line_two: draft.closingHeadingLineTwo.trim(),
    closing_body: draft.closingBody.trim(),
    closing_cta_label: draft.closingCtaLabel.trim(),
  };
}

export function moveProgram(
  programs: readonly ProgramDraft[],
  index: number,
  delta: -1 | 1,
): ProgramDraft[] {
  const destination = index + delta;
  if (index < 0 || index >= programs.length || destination < 0 || destination >= programs.length) {
    return programs as ProgramDraft[];
  }
  const next = programs.map((program) => ({ ...program }));
  [next[index], next[destination]] = [next[destination], next[index]];
  return next.map((program, sortOrder) => ({ ...program, sortOrder }));
}

export function moveHighlight(
  highlights: readonly string[],
  index: number,
  delta: -1 | 1,
): string[] {
  const destination = index + delta;
  if (index < 0 || index >= highlights.length || destination < 0 || destination >= highlights.length) {
    return highlights as string[];
  }
  const next = [...highlights];
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}
