import { normalizeDisplayName, DISPLAY_NAME_MAX_LENGTH } from "@/lib/admin-greeting";
import { clubTimeZoneOrDefault, clubToday } from "@/lib/club-time";

// ADMIN-RE-18: the words and shapes on "Who can sign in" (design: cd-signin-final).
// Pure functions, so the worst-case data from the design's break-ui fixtures
// (long names and emails, one-letter and non-Latin names, no name) is covered by
// unit tests. Nothing here reads a database or sends anything.

/** One person on the list, as /api/admin/members returns them. */
export type SignInPerson = {
  userId: string;
  email: string;
  displayName: string | null;
  /** From Supabase Auth; null until they sign in for the first time. */
  lastSignInAt: string | null;
};

export const EMAIL_MAX_LENGTH = 254;
const NEVER = "Hasn't signed in yet";

const DAY_MS = 86_400_000;
const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const SHORT_DATE_YEAR = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });

function dayNumber(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) / DAY_MS;
}

/**
 * "Signed in Tue" / "Hasn't signed in yet". Days are the club's own days
 * (decision 0014), so a sign-in at 11 pm Sunday in Chicago is Sunday for the
 * Chicago owner whatever the server's clock says. Today and yesterday in words,
 * the weekday for the last six days, then the short date.
 */
export function lastSignInLabel(
  lastSignInAt: string | null | undefined,
  timeZone: string,
  now: Date = new Date(),
): string {
  if (!lastSignInAt) return NEVER;
  const when = new Date(lastSignInAt);
  if (Number.isNaN(when.getTime())) return NEVER;
  const zone = clubTimeZoneOrDefault(timeZone);
  const signedInDay = clubToday(zone, when);
  const today = clubToday(zone, now);
  const age = dayNumber(today) - dayNumber(signedInDay);
  if (age <= 0) return "Signed in today";
  if (age === 1) return "Signed in yesterday";
  const date = new Date(`${signedInDay}T00:00:00Z`);
  if (age < 7) return `Signed in ${WEEKDAY.format(date)}`;
  const sameYear = signedInDay.slice(0, 4) === today.slice(0, 4);
  return `Signed in ${(sameYear ? SHORT_DATE : SHORT_DATE_YEAR).format(date)}`;
}

const SEGMENTER = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("en", { granularity: "grapheme" }) : null;
const LETTER_OR_NUMBER = /[\p{L}\p{N}]/u;

function graphemes(text: string): string[] {
  return SEGMENTER ? Array.from(SEGMENTER.segment(text), (part) => part.segment) : [...text];
}

/** The first letter or number of `text`, by character, or "" when it has none. */
function firstLetter(text: string): string {
  return graphemes(text).find((segment) => LETTER_OR_NUMBER.test(segment)) ?? "";
}

/**
 * One or two letters for the avatar disc. From the name when it has a letter
 * (an emoji or a symbol is skipped, so "🦊 Fox" is "F"), otherwise from the part
 * of the email before the "@". A bare dot, never a "?" or a blank disc.
 */
export function avatarLetters(name: string | null | undefined, email: string): string {
  const fromName = (name ?? "")
    .split(/\s+/)
    .map(firstLetter)
    .filter(Boolean)
    .slice(0, 2)
    .join("");
  if (fromName) return fromName.toUpperCase();
  return (firstLetter(email.split("@")[0] ?? "") || "•").toUpperCase();
}

/** "Sam" for "Sam Okafor"; the email itself when nobody has a name. */
export function firstNameOf(name: string | null | undefined, email: string): string {
  return name?.trim().split(/\s+/)[0] || email;
}

/** A long address keeps its start and its domain: konstantin.oberhauser-wet…@example.org */
export function middleEmail(email: string, max = 40): string {
  if (email.length <= max) return email;
  const at = email.lastIndexOf("@");
  const domain = at > 0 ? email.slice(at) : "";
  const tail = domain.length > 22 ? domain.slice(-22) : domain;
  if (!tail) return `${email.slice(0, Math.max(1, max - 1))}…`;
  const keep = Math.max(1, max - tail.length - 1);
  return `${email.slice(0, keep)}…${tail}`;
}

export type AddSomeoneProblems = {
  name: "missing" | "noLetter" | "tooLong" | null;
  email: "missing" | "invalid" | "tooLong" | "already" | null;
};

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * What stops "Send sign-in code" from being pressed. The name rules are the
 * saved-name rules (normalizeDisplayName: a letter or number, at most 120
 * characters counted as the database counts them); the email rules are the
 * members route's (a real address, at most 254). A person who can already sign
 * in is caught here so nothing is sent.
 */
export function addSomeoneProblems(
  input: { name: string; email: string },
  people: ReadonlyArray<Pick<SignInPerson, "email">>,
): AddSomeoneProblems {
  const trimmedName = input.name.trim();
  let name: AddSomeoneProblems["name"] = null;
  if (!trimmedName) name = "missing";
  else if (normalizeDisplayName(input.name) === null) {
    name = [...trimmedName].length > DISPLAY_NAME_MAX_LENGTH ? "tooLong" : "noLetter";
  }

  const email = input.email.trim();
  let emailProblem: AddSomeoneProblems["email"] = null;
  if (!email) emailProblem = "missing";
  else if (email.length > EMAIL_MAX_LENGTH) emailProblem = "tooLong";
  else if (!EMAIL_SHAPE.test(email)) emailProblem = "invalid";
  else if (people.some((person) => person.email.trim().toLowerCase() === email.toLowerCase())) {
    emailProblem = "already";
  }
  return { name, email: emailProblem };
}

export type SignInAction = "load" | "add" | "resend" | "remove" | "undo" | "name";
export type SignInMessageTone = "warning" | "destructive";

const WHO_MAX = 40;

function shortWho(who: string): string {
  const text = who.trim() || "them";
  return [...text].length > WHO_MAX ? `${[...text].slice(0, WHO_MAX - 1).join("")}…` : text;
}

/**
 * Every code /api/admin/members can return, as a sentence an owner can act on.
 * A code never reaches the screen. "warning" means nothing changed and trying
 * again later can work; "destructive" means the request itself was refused.
 */
export function signInMessage(
  code: unknown,
  action: SignInAction,
  who: string,
): { text: string; tone: SignInMessageTone } {
  const name = shortWho(who);
  switch (code) {
    case "AUTHENTICATION_REQUIRED":
      return { text: "You're signed out. Sign in again, then retry this.", tone: "warning" };
    case "SESSION_EXPIRED":
      return { text: "Your session expired. Sign in again and retry this.", tone: "warning" };
    case "OWNER_REQUIRED":
    case "CLUB_MEMBER_REQUIRED":
      return { text: "Only a club owner can change who can sign in.", tone: "destructive" };
    case "INVALID_MEMBERSHIP_INPUT":
      return { text: "That email address isn't valid. Check it and try again.", tone: "destructive" };
    case "INVALID_DISPLAY_NAME":
      return { text: "A name needs a letter or number and at most 120 characters.", tone: "destructive" };
    case "AUTH_IDENTITY_LOOKUP_FAILED":
      return { text: "We couldn't look that person up. Nothing changed. Try again in a minute.", tone: "warning" };
    case "AUTH_PROVISIONING_FAILED":
      return { text: "We couldn't set that person up. Check the email address and try again.", tone: "warning" };
    case "MEMBERSHIP_READ_FAILED":
      return { text: "We couldn't load who can sign in. Nothing changed. Try again in a minute.", tone: "warning" };
    case "OWNER_TRANSFER_OPERATOR_REQUIRED":
      return { text: "Only Onzio can change who the owner is.", tone: "destructive" };
    case "MEMBERSHIP_EXISTS":
      return {
        text: action === "undo" ? `${name} can already sign in.` : "That person can already sign in.",
        tone: "destructive",
      };
    case "MEMBERSHIP_MUTATION_FAILED":
      return { text: "We couldn't save that. Nothing changed. Try again in a minute.", tone: "warning" };
    case "AUTH_CODE_RATE_LIMITED":
      return {
        text:
          action === "add"
            ? "A sign-in code was sent a moment ago. Wait a minute, then try again."
            : `A code was sent to ${name} a moment ago. Wait a minute, then send it again.`,
        tone: "warning",
      };
    case "AUTH_CODE_DELIVERY_FAILED":
      return {
        text:
          action === "add"
            ? "We couldn't send the code, so nobody was added. Try again."
            : `We couldn't send the code to ${name}. Try again in a minute.`,
        tone: "warning",
      };
    case "MEMBERSHIP_AUDIT_FAILED":
      return { text: "We couldn't record that change, so it was undone. Try again in a minute.", tone: "warning" };
    case "MEMBERSHIP_REQUIRED":
    case "MEMBERSHIP_INACTIVE":
      return { text: `${name} is no longer on the list. Refresh the page to see who can sign in now.`, tone: "destructive" };
    case "MEMBERSHIP_UNDO_UNAVAILABLE":
      return { text: `It's too late to undo that. Use Add someone to put ${name} back.`, tone: "destructive" };
    case "MEMBERSHIP_ROLLBACK_FAILED":
      return { text: "Something went wrong and we can't be sure what was saved. Refresh the page to see who can sign in now.", tone: "warning" };
    default:
      return {
        text:
          action === "load"
            ? "We couldn't load who can sign in. Try again in a minute."
            : "Something went wrong and that didn't go through. Try again, and contact Onzio if it keeps happening.",
        tone: "warning",
      };
  }
}
