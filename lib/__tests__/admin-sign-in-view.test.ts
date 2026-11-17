import { describe, expect, it } from "vitest";
import {
  addSomeoneProblems,
  avatarLetters,
  firstNameOf,
  lastSignInLabel,
  middleEmail,
  signInMessage,
  type SignInPerson,
} from "@/lib/admin-sign-in-view";

// ADMIN-RE-18: the words and shapes on "Who can sign in". Pure functions, so the
// worst-case data (break-ui) is checked here without a browser.

const NOW = new Date("2026-11-09T18:00:00Z"); // Monday 10:00 in Los Angeles
const LA = "America/Los_Angeles";

describe("lastSignInLabel", () => {
  it("says a person who never signed in has not signed in yet", () => {
    expect(lastSignInLabel(null, LA, NOW)).toBe("Hasn't signed in yet");
    expect(lastSignInLabel("not a date", LA, NOW)).toBe("Hasn't signed in yet");
  });

  it("names the weekday for the last six days, today and yesterday in words", () => {
    expect(lastSignInLabel("2026-11-09T16:00:00Z", LA, NOW)).toBe("Signed in today");
    expect(lastSignInLabel("2026-11-08T20:00:00Z", LA, NOW)).toBe("Signed in yesterday");
    expect(lastSignInLabel("2026-11-03T18:00:00Z", LA, NOW)).toBe("Signed in Tue");
    expect(lastSignInLabel("2026-11-07T18:00:00Z", LA, NOW)).toBe("Signed in Sat");
  });

  it("switches to the short date after a week, with the year only when it is not this year", () => {
    expect(lastSignInLabel("2026-11-02T18:00:00Z", LA, NOW)).toBe("Signed in Nov 2");
    expect(lastSignInLabel("2026-03-14T18:00:00Z", LA, NOW)).toBe("Signed in Mar 14");
    expect(lastSignInLabel("2025-12-31T18:00:00Z", LA, NOW)).toBe("Signed in Dec 31, 2025");
  });

  it("counts days in the club's own time zone, not the browser's or UTC", () => {
    // 07:30 UTC on Nov 9 is still Sunday night in Los Angeles and already Monday morning in Berlin.
    const justAfterUtcMidnight = new Date("2026-11-09T07:30:00Z"); // 23:30 Sunday in LA, 01:30 Monday in Berlin
    expect(lastSignInLabel("2026-11-09T06:00:00Z", LA, justAfterUtcMidnight)).toBe("Signed in today");
    expect(lastSignInLabel("2026-11-09T06:00:00Z", "Europe/Berlin", justAfterUtcMidnight)).toBe("Signed in today");
    expect(lastSignInLabel("2026-11-08T20:00:00Z", "Europe/Berlin", justAfterUtcMidnight)).toBe("Signed in yesterday");
  });

  it("treats a sign-in a little in the future (clock skew) as today", () => {
    expect(lastSignInLabel("2026-11-09T18:05:00Z", LA, NOW)).toBe("Signed in today");
  });

  it("falls back to the default time zone for an unreadable zone", () => {
    expect(lastSignInLabel("2026-11-03T18:00:00Z", "Mars/Phobos", NOW)).toBe("Signed in Tue");
  });
});

describe("avatarLetters", () => {
  it("uses the first letter of up to two words of the name", () => {
    expect(avatarLetters("Dana Ruiz", "dana@x.co")).toBe("DR");
    expect(avatarLetters("Konstantin Oberhauser-Wettstein", "k@x.co")).toBe("KO");
    expect(avatarLetters("Jo", "a@b.co")).toBe("J");
  });

  it("works for one-letter, non-Latin and emoji names without a blank or a '?' disc", () => {
    expect(avatarLetters("J", "j@x.co")).toBe("J");
    expect(avatarLetters("王秀英", "w@x.co")).toBe("王");
    expect(avatarLetters("🦊 Fox", "fox@x.org")).toBe("F");
    expect(avatarLetters("Ólafur Darri Ólafsson", "o@x.test")).toBe("ÓD");
  });

  it("falls back to the email when there is no name, and to a plain dot when there is nothing", () => {
    expect(avatarLetters(null, "coach.pat@gmail.com")).toBe("C");
    expect(avatarLetters("  ", "first.last+billing@example.com")).toBe("F");
    expect(avatarLetters(null, "")).toBe("•");
  });
});

describe("firstNameOf", () => {
  it("is the first word of the name, or the email when there is no name", () => {
    expect(firstNameOf("Sam Okafor", "sam@x.co")).toBe("Sam");
    expect(firstNameOf(null, "coach.pat@gmail.com")).toBe("coach.pat@gmail.com");
    expect(firstNameOf("   ", "a@b.co")).toBe("a@b.co");
  });
});

describe("middleEmail", () => {
  it("leaves a short address alone", () => {
    expect(middleEmail("a@b.co")).toBe("a@b.co");
  });

  it("keeps the start and the end of a very long address", () => {
    const long = "konstantin.oberhauser-wettstein@eastside-united-youth-soccer-association.example.org";
    const out = middleEmail(long, 40);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.startsWith("konstantin")).toBe(true);
    expect(out.endsWith("example.org")).toBe(true);
    expect(out).toContain("…");
  });

  it("never returns a longer string than it was given", () => {
    const text = "x".repeat(300);
    expect(middleEmail(text, 40).length).toBeLessThanOrEqual(40);
    const noAt = middleEmail("y".repeat(80), 40);
    expect(noAt.length).toBeLessThanOrEqual(40);
  });
});

describe("addSomeoneProblems", () => {
  const people = [{ email: "dana.ruiz@gmail.com" }] as Array<Pick<SignInPerson, "email">>;

  it("needs a name and an email before anything can be sent", () => {
    expect(addSomeoneProblems({ name: "", email: "" }, people)).toEqual({ name: "missing", email: "missing" });
    expect(addSomeoneProblems({ name: "   ", email: "a@b.co" }, people).name).toBe("missing");
  });

  it("rejects a name with no letter or number, and a name over 120 characters", () => {
    expect(addSomeoneProblems({ name: "!!!", email: "a@b.co" }, people).name).toBe("noLetter");
    expect(addSomeoneProblems({ name: "x".repeat(121), email: "a@b.co" }, people).name).toBe("tooLong");
    expect(addSomeoneProblems({ name: "x".repeat(120), email: "a@b.co" }, people).name).toBeNull();
  });

  it("counts a name the way the database does, by characters (an emoji is one)", () => {
    expect(addSomeoneProblems({ name: `A${"🦊".repeat(119)}`, email: "a@b.co" }, people).name).toBeNull();
    expect(addSomeoneProblems({ name: `A${"🦊".repeat(120)}`, email: "a@b.co" }, people).name).toBe("tooLong");
  });

  it("does not accept a name that is only emoji, as the server would not", () => {
    expect(addSomeoneProblems({ name: "🦊🦊", email: "a@b.co" }, people).name).toBe("noLetter");
  });

  it("rejects an email that is not an address or is over 254 characters", () => {
    expect(addSomeoneProblems({ name: "Jo", email: "nope" }, people).email).toBe("invalid");
    expect(addSomeoneProblems({ name: "Jo", email: "a b@c.co" }, people).email).toBe("invalid");
    expect(addSomeoneProblems({ name: "Jo", email: `${"a".repeat(250)}@b.co` }, people).email).toBe("tooLong");
  });

  it("says so when the person can already sign in, whatever the capitals or spaces", () => {
    expect(addSomeoneProblems({ name: "Dana", email: " Dana.Ruiz@Gmail.com " }, people).email).toBe("already");
  });

  it("is clear for a good name and email", () => {
    expect(addSomeoneProblems({ name: "Jordan Lee", email: "jordan.lee@gmail.com" }, people)).toEqual({
      name: null,
      email: null,
    });
  });
});

describe("signInMessage", () => {
  it("explains a rate-limited resend as a wait, not a failure", () => {
    const resend = signInMessage("AUTH_CODE_RATE_LIMITED", "resend", "Sam");
    expect(resend.tone).toBe("warning");
    expect(resend.text).toMatch(/wait a minute/i);
    expect(resend.text).toContain("Sam");
    expect(resend.text).not.toMatch(/adding/i);
    expect(signInMessage("AUTH_CODE_RATE_LIMITED", "add", "Jordan").text).toMatch(/wait a minute/i);
  });

  it("says too late to undo, and how to put the person back", () => {
    const text = signInMessage("MEMBERSHIP_UNDO_UNAVAILABLE", "undo", "Sam").text;
    expect(text).toMatch(/too late/i);
    expect(text).toMatch(/Add someone/);
  });

  it("never shows a raw code, for any code the route can return or one it cannot", () => {
    const codes = [
      "AUTHENTICATION_REQUIRED",
      "SESSION_EXPIRED",
      "OWNER_REQUIRED",
      "INVALID_MEMBERSHIP_INPUT",
      "AUTH_IDENTITY_LOOKUP_FAILED",
      "AUTH_PROVISIONING_FAILED",
      "MEMBERSHIP_READ_FAILED",
      "OWNER_TRANSFER_OPERATOR_REQUIRED",
      "MEMBERSHIP_EXISTS",
      "MEMBERSHIP_MUTATION_FAILED",
      "AUTH_CODE_RATE_LIMITED",
      "AUTH_CODE_DELIVERY_FAILED",
      "MEMBERSHIP_AUDIT_FAILED",
      "MEMBERSHIP_REQUIRED",
      "MEMBERSHIP_INACTIVE",
      "MEMBERSHIP_UNDO_UNAVAILABLE",
      "MEMBERSHIP_ROLLBACK_FAILED",
      "CLUB_MEMBER_REQUIRED",
      "INVALID_DISPLAY_NAME",
      "MEMBERSHIP_FAILED",
      "SOMETHING_NEW",
      undefined,
    ];
    for (const action of ["add", "resend", "remove", "undo", "name", "load"] as const) {
      for (const code of codes) {
        const { text } = signInMessage(code, action, "Sam");
        expect(text).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
        expect(text.length).toBeGreaterThan(10);
      }
    }
  });

  it("trims a very long who-name so the message stays readable", () => {
    const long = "w".repeat(200);
    const { text } = signInMessage("AUTH_CODE_RATE_LIMITED", "resend", long);
    expect(text.length).toBeLessThan(160);
  });
});
