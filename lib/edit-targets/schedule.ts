import type { EditTargetRegistry } from "@/lib/admin-edit-targets";

/**
 * Click-to-field targets for the Rose City Schedule editor (/admin/schedule), UI-PREVIEW-CLICK-SCHEDULE. Spread into
 * EDIT_TARGET_REGISTRY. The registry's sections are the match dialog's sections (MATCH_SECTIONS); every field is a row field
 * keyed by the match's key (a saved match's id, or `new:N` for an unsaved one, which editTargetRowId turns into `new_N`),
 * because the registry is static and the matches are not.
 *
 * The Match Summary has lists with no stable ids (events, stats, officials, kit rows are plain objects), so its list rows are
 * keyed by position INSIDE one match: the row id is `<matchKey>-<index>` and the field says which list (`eventMinute`,
 * `statLabel`, ...). Nothing outside the dialog refers to those ids, and every render rebuilds them from the live rows.
 * The four list groups (`timeline`, `statistics`, `officials`, `kit`) are keyed by the match alone and focus the group's first control.
 */
export const SCHEDULE_MATCH_FIELDS = [
  "season", "homeAway", "date", "time", "competition", "leagueLogo",
  "opponent", "opponentShortName", "opponentLogo",
  "venue", "address", "city", "state",
] as const;
export const SCHEDULE_RESULT_FIELDS = ["clubScore", "opponentScore", "replayVideo", "attendance"] as const;
export const SCHEDULE_SUMMARY_GROUP_FIELDS = ["timeline", "statistics", "officials", "kit"] as const;
export const SCHEDULE_SUMMARY_LINEUP_FIELDS = ["clubStarting", "clubBench", "clubStaff", "opponentStarting", "opponentBench", "opponentStaff"] as const;
/** Fields on a list row of the summary: keyed `<matchKey>-<index>`. */
export const SCHEDULE_SUMMARY_ROW_FIELDS = [
  "eventMinute", "eventTeam", "eventType", "eventPlayer", "eventDetail",
  "statLabel", "statClub", "statOpponent",
  "officialRole", "officialName",
  "kitItem", "kitColor",
] as const;
export const SCHEDULE_SPONSOR_FIELDS = ["name", "link", "logo"] as const;

export const SCHEDULE_EDIT_TARGETS: EditTargetRegistry = {
  schedule: {
    route: "/admin/schedule",
    sections: {
      match: { rowFields: SCHEDULE_MATCH_FIELDS },
      result: { rowFields: SCHEDULE_RESULT_FIELDS },
      summary: { rowFields: [...SCHEDULE_SUMMARY_GROUP_FIELDS, ...SCHEDULE_SUMMARY_LINEUP_FIELDS, ...SCHEDULE_SUMMARY_ROW_FIELDS] },
      sponsor: { rowFields: SCHEDULE_SPONSOR_FIELDS },
    },
  },
};
