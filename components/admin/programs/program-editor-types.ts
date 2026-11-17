import type { DBProgram, DBProgramMedia, DBRegistrationForm } from "@/lib/db-types";
import type { ProgramDraft, ProgramValidationErrors, ProgramsPageDraft } from "@/lib/program-admin";

export type MediaRole = "hero" | "detail";
export type RegistrationFormOption = Pick<DBRegistrationForm, "id" | "title" | "status">;
export type ProgramPageView = "directory" | "detail" | "manage";
export type SavedProgramPage = { program: DBProgram; gallery: DBProgramMedia[] };
export type DirectorySaveRequest = { operationId: string; expected: Array<{ id: string | null; updatedAt: string | undefined }>; programs: Array<{ id: string | null; sortOrder: number; status: "active" | "hidden" }> };

/**
 * The per-program editor is split into three tabs instead of one flat list of
 * ~15 fields. Registration was the field group that was hardest to find in the
 * flat form — it sat below the highlights, the media, and the layout controls —
 * so isolating it is the point of the split. Nothing moved between the database
 * and the page; this is purely how the same fields are arranged.
 */
export type ProgramEditorTab = "content" | "media" | "registration";

export const PROGRAM_EDITOR_TABS: Array<{ id: ProgramEditorTab; label: string }> = [
  { id: "content", label: "Content" },
  { id: "media", label: "Media" },
  { id: "registration", label: "Registration" },
];

export const PROGRAM_EDITOR_TAB_ORDER: ProgramEditorTab[] = [
  "content",
  "media",
  "registration",
];

/** Matches the copy in the Layout variant <select> below, for the "This
 * program" summary panel in the left rail. */
export const LAYOUT_VARIANT_LABELS: Record<ProgramDraft["layoutVariant"], string> = {
  statement_band: "Statement band",
  detail_focus: "Detail focus",
};

/** "This program" panel's hero/detail row: which of the two optional media
 * roles are set, without inventing a new field — both booleans already live
 * on the draft. */
export function summarizeHeroDetailMedia(draft: ProgramDraft): {
  label: string;
  complete: boolean;
} {
  const hasHero = Boolean(draft.heroMediaAssetId);
  const hasDetail = Boolean(draft.detailMediaAssetId);
  if (hasHero && hasDetail) return { label: "Both set", complete: true };
  if (hasHero) return { label: "Hero only", complete: false };
  if (hasDetail) return { label: "Detail only", complete: false };
  return { label: "Neither set", complete: false };
}

/**
 * Which tab owns each validation error, so a failed save can reveal the field
 * it is complaining about instead of leaving "Review the highlighted fields"
 * pointing at a panel the admin cannot see.
 */
export const PROGRAM_FIELD_TABS: Record<
  keyof ProgramValidationErrors,
  ProgramEditorTab
> = {
  slug: "content",
  navLabel: "content",
  displayTitle: "content",
  kicker: "content",
  summary: "content",
  body: "content",
  highlights: "content",
  externalCtaLabel: "registration",
  externalCtaHref: "registration",
  registrationEyebrow: "registration",
  registrationHeadline: "registration",
  registrationBody: "registration",
  registrationPendingBody: "registration",
  registrationPendingLabel: "registration",
};

/**
 * The programs-page copy editor (a per-club singleton, separate from any one
 * program) is grouped into the same three bands the public templates render
 * it into. Rail wiring, per-section dirty tracking, and the dynamic save
 * label follow the pattern piloted on app/admin/(protected)/homepage/page.tsx.
 */
export type PageCopySection = "homepageBand" | "pageHeader" | "closingBand";

export const PAGE_COPY_SECTION_ORDER: PageCopySection[] = [
  "homepageBand",
  "pageHeader",
  "closingBand",
];

export const PAGE_COPY_SECTION_LABELS: Record<PageCopySection, string> = {
  homepageBand: "Homepage band",
  pageHeader: "Page header",
  closingBand: "Closing band",
};

export const PAGE_COPY_FIELD_SECTIONS: Record<keyof ProgramsPageDraft, PageCopySection> = {
  pathwayEyebrow: "homepageBand",
  pathwayHeading: "homepageBand",
  pathwayIntro: "homepageBand",
  heroEyebrow: "pageHeader",
  heroHeadlineLineOne: "pageHeader",
  heroHeadlineLineTwo: "pageHeader",
  heroIntro: "pageHeader",
  closingHeadingLineOne: "closingBand",
  closingHeadingLineTwo: "closingBand",
  closingBody: "closingBand",
  closingCtaLabel: "closingBand",
};

