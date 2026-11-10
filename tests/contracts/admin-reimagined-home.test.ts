import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { adminGreeting } from "@/lib/admin-greeting";
import { gamesNeedingScoreHint, newSignUpsHint } from "@/lib/admin-home-data";

// ADMIN-RE-05: the reimagined home and shell. Behaviour of the jobs and More
// rows is pinned in tests/contracts/admin-route-manifest.test.ts and the
// loader's in lib/__tests__/admin-home-data.test.ts; this file pins where
// things run, what they may read, and what the shell renders.

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const page = source("app/admin/(protected)/page.tsx");
const layout = source("app/admin/(protected)/layout.tsx");
const loader = source("lib/admin-home-data.ts");
const dir = "components/admin/reimagined";
const components = Object.fromEntries(
  readdirSync(resolve(process.cwd(), dir))
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => [name, source(`${dir}/${name}`)]),
);

describe("reimagined home (ADMIN-RE-05)", () => {
  it("renders only for a reimagined club, after the classic dashboard's own session and club checks", () => {
    expect(page).not.toContain('"use client"');
    expect(page).toContain("requireFreshClubSession(supabase)");
    expect(page).toContain("getClubContext({");
    expect(page).toContain("const portal = await readAdminPortal(supabase, club.id);");
    expect(page).toMatch(/if \(portal\.portal === "reimagined"\) \{\s*return \(\s*<ReimaginedHomeContent/);
    // The classic dashboard is untouched for every other club.
    expect(page).toContain("getVisibleAdminQuickActions");
    expect(page).toContain("<DashboardIntro clubName={club.name} />");
  });

  it("builds the jobs from the manifest with the same capability predicates", () => {
    expect(page).toContain("getVisibleAdminHomeJobs(access)");
    // ADMIN-RE-24: the More list's pages moved under the tabs.
    expect(page).not.toContain("getVisibleAdminMoreRows");
    expect(page).toContain("hasLiveSignUps: home.hasLiveSignUps");
    expect(page).toContain("adminPortal: portal.portal");
    expect(page).toContain('club.role === "owner" && club.lifecycle !== "archived"');
    expect(page).toContain("contentPaused={!routeAccess.canMutateContent}");
    expect(page).toContain("...routeAccess,");
    expect(page).toContain("adminGreeting(displayName)");
  });

  it("shows the club line, the greeting and the question from the design", () => {
    const home = components["ReimaginedHome.tsx"];
    expect(home).toContain('" · Club admin"');
    expect(home).toContain("What do you want to do?");
    expect(home).toMatch(/<h1[^>]*>\s*\{greeting\}\s*<\/h1>/);
    expect(home).toContain("title={clubName}");
    // One line with an ellipsis for long club names.
    const css = source(`${dir}/reimagined.module.css`);
    expect(css).toMatch(/\.clubName \{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/);
  });

  it("greets by first name, or says Welcome back without one", () => {
    expect(adminGreeting("Andrea Lopez")).toBe("Hi Andrea");
    expect(adminGreeting(null)).toBe("Welcome back");
    expect(adminGreeting("   ")).toBe("Welcome back");
  });

  it("words the hints with plural rules and thousands separators", () => {
    expect(gamesNeedingScoreHint(1)).toBe("1 game needs a score");
    expect(gamesNeedingScoreHint(12)).toBe("12 games need a score");
    expect(gamesNeedingScoreHint(0)).toBeNull();
    expect(newSignUpsHint(3)).toBe("3 new");
    expect(newSignUpsHint(1284)).toBe("1,284 new");
  });

  it("keeps home reads server-side, user-scoped, tenant-scoped and free of personal details", () => {
    expect(loader).not.toContain('"use client"');
    expect(loader).toContain('.schema("onzio")');
    expect(loader).toContain('.eq("club_id", clubId)');
    expect(loader).not.toMatch(/createServiceRoleClient|supabase-service-role|SUPABASE_SERVICE_ROLE_KEY/);
    expect(loader).not.toMatch(/registrant_|guardian_|answers|status_token_hash|email|phone/);
    // Its own name only, through club_members_self_read.
    expect(loader).toContain('.select("display_name")');
    expect(loader).toContain('.eq("user_id", userId)');
  });

  it("counts the way the plan says: club time, two hours after kickoff, seven paid days, paged", () => {
    expect(loader).toContain("export const SCORE_GRACE_MINUTES = 120;");
    expect(loader).toContain("export const NEW_SIGN_UP_DAYS = 7;");
    expect(loader).toContain('from "@/lib/club-time"');
    expect(loader).toContain('.is("rose_city_score", null)');
    expect(loader).toContain('.is("opponent_score", null)');
    expect(loader).toContain('.eq("status", "paid")');
    expect(loader).toContain('.order("id", { ascending: true })');
    expect(loader).toContain(".range(start, start + pageSize - 1)");
    expect(loader).toContain('.is("archived_at", null)');
  });

  it("uses only the approved admin icon set", () => {
    for (const [name, code] of Object.entries(components)) {
      expect(code, name).not.toMatch(/from "lucide-react"|@heroicons|react-icons|@remixicon/);
      expect(code, name).not.toMatch(/<svg[\s>]/);
    }
    expect(components["HomeJobs.tsx"]).toContain('from "@/components/admin/icons"');
    expect(components["MoreList.tsx"]).toContain('from "@/components/admin/icons"');
    expect(source(`${dir}/tabIcons.ts`)).toContain('from "@/components/admin/icons"');
  });
});

describe("reimagined shell (ADMIN-RE-05, tabs since ADMIN-RE-24)", () => {
  it("is picked by the layout from the fail-safe portal read", () => {
    expect(layout).toContain('portal.portal === "reimagined"');
    expect(layout).toContain("<ReimaginedShell tabs={shell.tabs} targets={shell.targets} dots={shell.dots}>");
    expect(layout).toContain("<AdminShell>{children}</AdminShell>");
    // Tabs and dots are worked out on the server; a failed count shows no dot.
    expect(layout).toContain("getVisibleAdminTabs(access)");
    expect(layout).toContain(".catch(() => null)");
  });

  it("puts a page bar with a way back to the tab, the title and an actions slot on every other page", () => {
    const bar = components["TopBar.tsx"];
    expect(bar).toContain("href={back.href}");
    expect(bar).toMatch(/aria-hidden="true" \/>\s*\{back\.label\}\s*<\/Link>/);
    expect(bar).toContain("export function useTopBarActions()");
    expect(bar).toContain("export function TopBarActions(");
    expect(bar).toContain("createPortal(children, slot)");
    expect(bar).toContain("export function useLeaveGuard(");
    const shell = components["ReimaginedShell.tsx"];
    expect(shell).toContain("isAdminTabPage(pathname)");
    expect(shell).toContain("<TopBar title={getReimaginedPageTitle(pathname)} />");
    // Tabs are real links; the current one says so.
    expect(shell).toContain("aria-current=");
    expect(shell).toContain('<nav aria-label="Club admin"');
    // The account menu stays reachable; billing notices still show.
    expect(shell).toContain("<AccountMenu");
    expect(shell).toContain('club.publicAccess === "suspended"');
    expect(shell).toContain('club.publicAccess === "grace"');
  });

  it("still provides a closed sidebar context, which the homepage editor reads", () => {
    expect(source("components/admin/homepage/HomepageEditor.tsx")).toContain("useSidebar()");
    const shell = components["ReimaginedShell.tsx"];
    expect(shell).toMatch(/<SidebarProvider\s+open=\{false\}\s+onOpenChange=\{KEEP_CLOSED\}/);
    expect(shell).not.toMatch(/<Sidebar[\s>]/);
  });

  it("asks nothing about the club's template (the selector ratchet)", () => {
    for (const [name, code] of Object.entries(components)) {
      expect(code, name).not.toContain("presentationTemplateKey");
    }
  });

  it("never gives the reimagined client shell the service role or tenant-resolution columns", () => {
    for (const [name, code] of Object.entries(components)) {
      expect(code, name).not.toMatch(/service-role|SERVICE_ROLE/);
    }
    expect(source("lib/club-context.ts")).not.toMatch(/admin_portal|admin_flags|time_zone|display_name/);
  });

  it("keeps the classic skeleton for classic clubs and its own for reimagined ones", () => {
    expect(page).toContain("<HomeFallback classic={<DashboardSkeleton />} reimagined={<ReimaginedHomeSkeleton />} />");
    expect(components["HomeFallback.tsx"]).toContain('useAdminPortal().portal === "reimagined"');
  });
});
