import type { DBProgram } from "@/lib/db-types";
import { normalizePublicHref } from "@/lib/public-link";

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
    | "externalCtaHref",
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
    status: "active",
    sortOrder,
  };
}

function programHighlights(value: DBProgram["highlights"]): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

export function programToDraft(row: DBProgram): ProgramDraft {
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
    heroMediaPreviewUrl: "",
    detailMediaPreviewUrl: "",
    externalCtaLabel: row.external_cta_label,
    externalCtaHref: row.external_cta_href,
    status: row.status === "hidden" ? "hidden" : "active",
    sortOrder: row.sort_order,
  };
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
    status: draft.status,
    sort_order: draft.sortOrder,
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
