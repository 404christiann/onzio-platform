import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The removed reimagined admin's addresses still send a classic club where they always did (lib/retired-admin-route.ts).
const page = (route: string) => readFileSync(resolve(process.cwd(), "app/admin/(protected)", route, "page.tsx"), "utf8");

describe("retired reimagined-admin addresses", () => {
  it.each([
    ["add-game", 'redirectRetiredAdminRoute("/admin/schedule", false)'],
    ["club", 'redirectRetiredAdminRoute("/admin/branding")'],
    ["games", 'redirectRetiredAdminRoute("/admin/schedule")'],
    ["games/players/[playerId]", 'redirectRetiredAdminRoute("/admin/schedule")'],
    ["programs-and-sign-ups", 'redirectRetiredAdminRoute("/admin")'],
    ["website", 'redirectRetiredAdminRoute("/admin/homepage")'],
    ["score", 'redirectRetiredAdminRoute("/admin/schedule")'],
    ["score/[matchId]", 'redirectRetiredAdminRoute("/admin/stats?view=match")'],
    ["seasons/totals", 'redirectRetiredAdminRoute("/admin/stats?view=season")'],
    ["your-club", 'redirectRetiredAdminRoute("/admin/branding")'],
  ])("%s redirects as before", (route, call) => {
    expect(page(route)).toContain(call);
  });

  it("sign-ups is not found where Registrations is hidden, else goes to Registrations", () => {
    const source = page("sign-ups");
    expect(source).toContain('isAdminRouteHiddenForClub(club.slug, "registrations")) notFound()');
    expect(source).toContain('redirect("/admin/registrations")');
  });

  it("programs-and-tryouts goes to Tryouts, else Programs, else the dashboard", () => {
    expect(page("programs-and-tryouts")).toContain(
      'redirect(site?.tryouts.routeVisible ? "/admin/tryouts" : site?.programs.routeVisible ? "/admin/programs" : "/admin")',
    );
  });

  it("checks the session, club and role before redirecting", () => {
    const helper = readFileSync(resolve(process.cwd(), "lib/retired-admin-route.ts"), "utf8");
    expect(helper).toContain("requireFreshClubSession(supabase)");
    expect(helper).toContain('redirect("/admin/login?error=not_authorized")');
  });
});
