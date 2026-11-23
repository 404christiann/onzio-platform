import { editTarget, editTargetRowId, resolveEditTarget, type EditTargetId, type ResolvedEditTarget } from "@/lib/admin-edit-targets";
import {
  SCHEDULE_MATCH_FIELDS, SCHEDULE_RESULT_FIELDS, SCHEDULE_SPONSOR_FIELDS, SCHEDULE_SUMMARY_GROUP_FIELDS, SCHEDULE_SUMMARY_LINEUP_FIELDS, SCHEDULE_SUMMARY_ROW_FIELDS,
} from "@/lib/edit-targets/schedule";
import type { EditTargetStamp } from "@/components/admin/ui/editor-kit/editTargets";
import { MATCH_SECTIONS, type MatchSectionId } from "./rose-city-schedule-model";

/**
 * Click-to-field for the Rose City Schedule editor (UI-PREVIEW-CLICK-SCHEDULE). The ids are declared in EDIT_TARGET_REGISTRY
 * ("schedule", lib/edit-targets/schedule.ts): the registry's sections are the match dialog's sections and every field is keyed
 * by the match's key, never by its position in the list. RoseCityMatchFields and MatchSummaryFields stamp the same ids on the
 * dialog's controls; matchThumbStamps puts them on the public nodes inside ONE match's card, found through that match's own
 * `data-fixture-id`, so the next match the preview also draws (hidden by CSS) can never be mistaken for it.
 */
export type MatchField = (typeof SCHEDULE_MATCH_FIELDS)[number] | (typeof SCHEDULE_RESULT_FIELDS)[number] | (typeof SCHEDULE_SPONSOR_FIELDS)[number]
  | (typeof SCHEDULE_SUMMARY_GROUP_FIELDS)[number] | (typeof SCHEDULE_SUMMARY_LINEUP_FIELDS)[number];
export type SummaryRowField = (typeof SCHEDULE_SUMMARY_ROW_FIELDS)[number];

/** The dialog section each field lives in. A click opens that section, not always Match. */
export const MATCH_FIELD_SECTION: Readonly<Record<MatchField, MatchSectionId>> = {
  ...Object.fromEntries(SCHEDULE_MATCH_FIELDS.map(field => [field, "match"])),
  ...Object.fromEntries(SCHEDULE_RESULT_FIELDS.map(field => [field, "result"])),
  ...Object.fromEntries([...SCHEDULE_SUMMARY_GROUP_FIELDS, ...SCHEDULE_SUMMARY_LINEUP_FIELDS].map(field => [field, "summary"])),
  ...Object.fromEntries(SCHEDULE_SPONSOR_FIELDS.map(field => [field, "sponsor"])),
} as Record<MatchField, MatchSectionId>;
// "name"/"link"/"logo" are the sponsor's; the match's own logos are leagueLogo and opponentLogo, so no field name repeats across sections.

export const matchTarget = (matchKey: string, field: MatchField): EditTargetId => editTarget("schedule", MATCH_FIELD_SECTION[field], field, matchKey);

/** A list row of the Match Summary. The draft's rows have no id, so the row is the match key plus the row's index in its own list. */
export const summaryRowTarget = (matchKey: string, field: SummaryRowField, index: number): EditTargetId =>
  editTarget("schedule", "summary", field, `${editTargetRowId(matchKey)}-${index}`);

/** The dialog section a declared Schedule target opens, or undefined for no target (or one that is not Schedule's): the dialog opens on Match. */
export function matchSectionOf(target: string | undefined): MatchSectionId | undefined {
  const resolved = resolveEditTarget(target);
  return resolved?.editor === "schedule" ? MATCH_SECTIONS.find(section => section.id === resolved.section)?.id : undefined;
}

/** Whether a declared field belongs to this match's card: only the card's own match (never a summary row, which the card does not draw). */
export function matchOwnsTarget(matchKey: string, target: ResolvedEditTarget): boolean {
  return target.editor === "schedule" && target.row === editTargetRowId(matchKey);
}

const attr = (value: string) => value.replace(/[\\"]/g, "\\$&");
const fixed = (id: EditTargetId) => () => id;

/**
 * Where one match's fields show on its card (the public Schedule row for that match), found through the match's own
 * `data-fixture-id`. The card draws the Next match too when the preview needs it for "Next" styling, hidden by CSS: it is
 * never reached by these selectors. Competition and the league logo share a cell, the logo is the inner node.
 */
export function matchThumbStamps(matchKey: string): EditTargetStamp[] {
  const own = `.fixture-item[data-fixture-id="${attr(matchKey)}"]`;
  const at = (selector: string, field: MatchField): EditTargetStamp => ({ selector: `${own} ${selector}`, target: fixed(matchTarget(matchKey, field)) });
  return [
    at(".fixture-date", "date"),
    at(".opponent-title h2", "opponent"),
    at(".schedule-opponent-crest", "opponentLogo"),
    at(".home-away", "homeAway"),
    at(".fixture-venue-name", "venue"),
    at(".fixture-directions", "address"),
    at(".fixture-kickoff", "time"),
    at(".fixture-league", "competition"),
    at(".fixture-league img", "leagueLogo"),
    at(".fixture-result", "clubScore"),
    at(".fixture-summary", "timeline"),
    at(".fixture-watch", "replayVideo"),
    at(".match-sponsor", "name"),
    at(".match-sponsor img", "logo"),
  ];
}
