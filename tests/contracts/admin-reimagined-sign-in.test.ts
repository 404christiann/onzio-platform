import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getReimaginedPageTitle,
  getVisibleAdminMoreRows,
  type AdminRouteAccessContext,
} from "@/lib/admin-route-manifest";

// ADMIN-RE-18 (screen): "Who can sign in" (design: cd-signin-final; decisions
// 0010 and 0013). The server half is on main (PR #101). This file pins where the
// new screen parts from the classic Team access page, that it only talks to the
// existing members route, that every action stays owner-only, and the rules the
// break-ui check set (long names and emails, no helpers, many helpers,
// never-signed-in, rate-limited resend).

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const page = source("app/admin/(protected)/members/page.tsx");
const screen = source("components/admin/reimagined/SignInPeople.tsx");
const css = source("components/admin/reimagined/sign-in.module.css");
const view = source("lib/admin-sign-in-view.ts");
const route = source("app/api/admin/members/route.ts");

function section(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  expect(from, `Missing: ${start}`).toBeGreaterThanOrEqual(0);
  expect(to, `Missing: ${end}`).toBeGreaterThan(from);
  return text.slice(from, to);
}

describe("the members page keeps both admins working (ADMIN-RE-18)", () => {
  it("shows the new screen only for a club on the reimagined admin", () => {
    expect(page).toContain('import { useAdminPortal } from "@/components/admin/AdminPortalProvider"');
    expect(page).toContain('useAdminPortal().portal === "reimagined"');
    expect(page).toContain("<SignInPeople");
  });

  it("leaves the classic Team access page as it was", () => {
    expect(page).toContain('title="Team access"');
    expect(page).toContain("otherOwners.map(");
    expect(page).toContain('body: JSON.stringify({ action: "add", email })');
    expect(page).toContain("function ClassicMembersPage");
  });
});

describe("the screen only uses the existing members route (ADMIN-RE-18)", () => {
  it("never touches Supabase, the service role or any other endpoint", () => {
    expect(screen).not.toMatch(/supabase|service-role|SERVICE_ROLE|createClient/);
    const urls = [...screen.matchAll(/["'`](\/api\/[^"'`]+)["'`]/g)].map((match) => match[1]);
    expect(new Set(urls)).toEqual(new Set(["/api/admin/members"]));
  });

  it("calls add (with the name), remove, resend-code, undo-remove and set-name", () => {
    for (const action of ["add", "remove", "resend-code", "undo-remove", "set-name"]) {
      expect(screen, action).toContain(`"${action}"`);
    }
    expect(screen).toMatch(/action:\s*"add"[\s\S]{0,120}displayName/);
  });

  it("matches the route: the same actions, and the codes it can return all have words", () => {
    for (const action of ["add", "remove", "resend-code", "undo-remove", "set-name"]) {
      expect(route).toContain(`z.literal("${action}")`);
    }
    // Every code the route itself names has its own sentence; anything else it
    // returns (MEMBERSHIP_FAILED, a library code) lands on the plain default.
    const named = ["OWNER_REQUIRED", "CLUB_MEMBER_REQUIRED", "INVALID_MEMBERSHIP_INPUT", "INVALID_DISPLAY_NAME", "AUTHENTICATION_REQUIRED"];
    for (const code of named) {
      expect(route, code).toContain(code);
      expect(view, code).toContain(`"${code}"`);
    }
    expect(view).toContain('"AUTH_CODE_RATE_LIMITED"');
    expect(view).toContain('"MEMBERSHIP_UNDO_UNAVAILABLE"');
    expect(view).toContain('"MEMBERSHIP_ROLLBACK_FAILED"');
  });
});

describe("who may do what (ADMIN-RE-18)", () => {
  it("shows the actions only to an owner, and asks no question of the server for anyone else", () => {
    expect(screen).toContain('club.role === "owner"');
    expect(screen).toContain("Only a club owner can change who can sign in");
    const gate = section(screen, "if (!isOwner)", "return (");
    expect(gate).not.toContain("fetch(");
  });

  it("offers no Remove and no resend on an owner's row, only on a helper's", () => {
    const owner = section(screen, "function OwnerRow", "function HelperRow");
    expect(owner).not.toMatch(/Remove|resend|Send the code again/);
    expect(owner).toContain("Only Onzio can change");
    const helper = section(screen, "function HelperRow", "function Dialog");
    expect(helper).toContain("Remove access");
    expect(helper).toContain("Send the code again");
  });

  it("lists every owner, you first (decision 0013)", () => {
    expect(screen).toContain("owners");
    expect(screen).toContain("You · owner");
    expect(screen).toMatch(/"Owner"/);
  });
});

describe("what each row says (ADMIN-RE-18)", () => {
  it("shows the last sign-in or that they have not signed in, from the members route", () => {
    expect(screen).toContain("lastSignInLabel(");
    expect(screen).toContain("lastSignInAt");
    expect(view).toContain("Hasn't signed in yet");
    expect(view).toContain("Signed in ");
  });

  it("puts 'Send the code again' on a person who has never signed in", () => {
    expect(screen).toContain("Send the code again");
    expect(screen).toContain("Code sent");
  });

  it("asks for a name before adding, and offers 'Add a name' for a person without one", () => {
    expect(screen).toContain("Their name");
    expect(screen).toContain("Their email");
    expect(screen).toContain("Add a name");
    expect(screen).toContain("Send sign-in code");
    expect(screen).toContain("We’ll email them a sign-in code. They can’t see payments.");
  });

  it("shows the helper count and what helpers can and can't do", () => {
    expect(screen).toContain("Helpers can:");
    expect(screen).toContain("Helpers can’t:");
    expect(screen).toContain("No helpers yet");
  });
});

describe("remove with undo (ADMIN-RE-18)", () => {
  it("removes in one tap and offers Undo until the server's undo window ends", () => {
    expect(screen).toContain("undoUntil");
    expect(screen).toContain("can’t sign in any more");
    expect(screen).toContain("Undo");
    expect(screen).toContain('"undo-remove"');
  });

  it("says plainly when it is too late to undo", () => {
    expect(view).toContain("too late to undo");
  });
});

describe("the break-ui rules (ADMIN-RE-18)", () => {
  it("breaks an unbreakable name or email instead of pushing the page wide", () => {
    expect(css).toMatch(/overflow-wrap:\s*anywhere/);
    expect(css).toContain("min-width: 0");
    expect(css).toContain("text-overflow: ellipsis");
    expect(screen).toContain("title={");
    expect(screen).toContain("middleEmail(");
  });

  it("counts the name as it is typed and stops at the database limit", () => {
    expect(screen).toContain("DISPLAY_NAME_MAX_LENGTH");
    expect(view).toContain("DISPLAY_NAME_MAX_LENGTH");
    expect(view).toContain("EMAIL_MAX_LENGTH");
  });

  it("works on a phone and in dark mode, and moves less when asked to", () => {
    expect(css).toContain("@media (min-width: 640px)");
    expect(css).toContain('[data-admin-theme="dark"]');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it("tells a screen reader about success, and about a problem", () => {
    expect(screen).toContain('role="status"');
    expect(screen).toContain('role="alert"');
    expect(screen).toContain("aria-label");
  });
});

describe("the home menu already leads here (ADMIN-RE-18)", () => {
  const context = (role: "owner" | "admin") =>
    ({ role, canMutateContent: true, adminPortal: "reimagined" }) as unknown as AdminRouteAccessContext;

  it("lists Who can sign in for an owner, and not for an admin", () => {
    const row = getVisibleAdminMoreRows(context("owner")).find((candidate) => candidate.id === "who-can-sign-in");
    expect(row?.href).toBe("/admin/members");
    expect(row?.label).toBe("Who can sign in");
    expect(getVisibleAdminMoreRows(context("admin")).some((candidate) => candidate.id === "who-can-sign-in")).toBe(false);
    expect(getReimaginedPageTitle("/admin/members")).toBe("Who can sign in");
  });

  it("changes no tenant select and adds no migration", () => {
    expect(source("lib/club-context.ts")).not.toMatch(/admin_portal|admin_flags|time_zone/);
  });
});
