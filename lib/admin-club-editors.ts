/**
 * Which admin editor a club gets, chosen by club slug (not by template), so a redesigned editor can ship for one club
 * while every other club keeps the classic one. RC-ADMIN-4c: Rose City's Club settings (Branding and Team access)
 * run on the editor kit.
 */
export type ClubSettingsEditor = "classic" | "kit";

const CLUB_EDITORS: Readonly<Record<string, Readonly<{ clubSettings: ClubSettingsEditor }>>> = {
  "rose-city": { clubSettings: "kit" },
};

export function clubSettingsEditorFor(club: Readonly<{ slug: string }>): ClubSettingsEditor {
  return Object.prototype.hasOwnProperty.call(CLUB_EDITORS, club.slug) ? CLUB_EDITORS[club.slug].clubSettings : "classic";
}
