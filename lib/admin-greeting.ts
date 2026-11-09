// ADMIN-RE-01: how the reimagined admin names a person. onzio.club_members.display_name
// is optional, so every place that shows a person must work without one.

/** The home's greeting: "Hi Marco" when a name is saved, "Welcome back" when not. */
export function adminGreeting(displayName: string | null | undefined): string {
  const first = displayName?.trim().split(/\s+/)[0];
  return first ? `Hi ${first}` : "Welcome back";
}

/** How a person appears in a list: their saved name, otherwise their sign-in email. */
export function memberLabel(displayName: string | null | undefined, email: string): string {
  return displayName?.trim() || email;
}

/** Longest saved name, matching the database check club_members_display_name_length. */
export const DISPLAY_NAME_MAX_LENGTH = 120;

/**
 * ADMIN-RE-04: the name as it is saved. Trims, folds line breaks, tabs and runs of
 * spaces into one space, and counts characters the way Postgres char_length does
 * (code points), so a name that passes here always passes the database check.
 * Returns null for a blank or too-long name.
 */
export function normalizeDisplayName(raw: string): string | null {
  const name = raw.replace(/[\s\p{Cc}]+/gu, " ").trim();
  const length = [...name].length;
  return length >= 1 && length <= DISPLAY_NAME_MAX_LENGTH ? name : null;
}
