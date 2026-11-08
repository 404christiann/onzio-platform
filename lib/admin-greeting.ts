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
