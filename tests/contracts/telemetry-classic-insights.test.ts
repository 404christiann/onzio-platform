import { createElement, isValidElement, type ComponentProps, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminPortalSettings } from "@/lib/admin-portal";
import type { ClubContext } from "@/lib/club-context";

// TELEMETRY-06: Sponsor Insights (/admin/insights and its monthly report) opens
// for an owner or admin of a club with admin_flags.sponsor_insights, on the
// classic admin as well as the reimagined one, and the classic sidebar lists it.
// Everything below the session, club, portal and data reads is real: the gate,
// the tab page loader, both pages and the classic shell.

const mocks = vi.hoisted(() => ({
  club: null as unknown,
  portal: null as unknown,
  pathname: "/admin",
  loadInsightsData: vi.fn(),
  readReportMonths: vi.fn(),
  readMonthlyReportRows: vi.fn(),
}));

class Redirect extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}

vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "club.example" }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/supabase-server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/supabase-browser", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }), signOut: async () => undefined } }),
}));
vi.mock("@/lib/auth-session", () => ({ requireFreshClubSession: async () => ({ userId: "user-1" }) }));
vi.mock("@/lib/club-context", () => ({ getClubContext: async () => mocks.club }));
vi.mock("@/lib/admin-portal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin-portal")>()),
  readAdminPortal: async () => mocks.portal,
}));
vi.mock("@/lib/admin-home-data", () => ({
  loadAdminHomeData: async () => ({ gamesNeedingScore: null, newSignUps: null, hasLiveSignUps: false }),
}));
vi.mock("@/lib/telemetry/insights-data", () => ({ loadInsightsData: mocks.loadInsightsData }));
vi.mock("@/lib/telemetry/report-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telemetry/report-data")>()),
  readReportMonths: mocks.readReportMonths,
  readMonthlyReportRows: mocks.readMonthlyReportRows,
  readReportClubLogo: async () => "",
}));
vi.mock("@/components/ClubBrandingProvider", () => ({ useClubBranding: () => ({ clubLogoUrl: null }) }));

import AdminShell from "@/components/AdminShell";
import { AdminPortalProvider } from "@/components/admin/AdminPortalProvider";
import { AdminThemeProvider } from "@/components/admin/AdminThemeProvider";
import { ClubContextProvider } from "@/components/ClubContextProvider";
import { UnsavedGuardContext } from "@/components/admin/ui/useUnsavedGuard";
import InsightsTabPage from "@/app/admin/(protected)/insights/page";
import MonthlySponsorReportPage from "@/app/admin/(protected)/insights/report/page";
import { loadAdminTabPage } from "@/lib/admin-tab-page";
import {
  canSeeSponsorInsights,
  getVisibleAdminNavigation,
  getVisibleAdminRoutes,
  type AdminRouteAccessContext,
} from "@/lib/admin-route-manifest";
import { getAdminTabTargets, getVisibleAdminTabs, SPONSOR_INSIGHTS_FLAG } from "@/lib/admin-tabs";

const FLAG_ON = { [SPONSOR_INSIGHTS_FLAG]: true } as const;

function club(overrides: Partial<ClubContext> = {}): ClubContext {
  return {
    id: "club-1",
    slug: "harbor",
    name: "Harbor FC",
    primaryDomain: "harbor.example",
    lifecycle: "active",
    publicAccess: "live",
    kind: "customer",
    stripePriceId: null,
    tier: "pro",
    role: "owner",
    primaryColor: "#123456",
    secondaryColor: null,
    presentationTemplateKey: "clubhouse@1",
    storeEnabled: false, publicPageVisibility: {},
    ...overrides,
  };
}

function portal(kind: "classic" | "reimagined", flags: Record<string, boolean> = FLAG_ON): AdminPortalSettings {
  return { portal: kind, flags, timeZone: "America/Los_Angeles", timeZoneConfirmed: true };
}

function access(overrides: Partial<AdminRouteAccessContext> = {}): AdminRouteAccessContext {
  return {
    role: "owner",
    presentationTemplateKey: "clubhouse@1",
    clubSlug: "harbor",
    isBillingAuthorized: true,
    canMutateContent: true,
    storeEnabled: false,
    adminPortal: "classic",
    adminFlags: FLAG_ON,
    ...overrides,
  };
}

async function html(page: Promise<ReactElement | null>): Promise<string> {
  const element = await page;
  return isValidElement(element) ? renderToStaticMarkup(element) : "";
}

const insightsPage = (search: Record<string, string> = {}) =>
  html(InsightsTabPage({ searchParams: Promise.resolve(search) }));
const reportPage = (search: Record<string, string> = {}) =>
  html(MonthlySponsorReportPage({ searchParams: Promise.resolve(search) }));

async function redirectOf(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    if (error instanceof Redirect) return error.url;
    throw error;
  }
}

function setClub(clubValue: ClubContext, portalValue: AdminPortalSettings) {
  mocks.club = clubValue;
  mocks.portal = portalValue;
}

beforeEach(() => {
  mocks.pathname = "/admin";
  mocks.loadInsightsData.mockReset().mockResolvedValue({ status: "no-rollups" });
  mocks.readReportMonths.mockReset().mockResolvedValue({ status: "ready", months: [] });
  mocks.readMonthlyReportRows.mockReset().mockResolvedValue({ status: "error" });
});

describe("the Sponsor Insights gate", () => {
  it("opens for an owner or admin with the flag on, on either admin", () => {
    for (const role of ["owner", "admin"] as const) {
      for (const adminPortal of ["classic", "reimagined", undefined] as const) {
        expect(canSeeSponsorInsights(access({ role, adminPortal })), `${role} ${adminPortal}`).toBe(true);
      }
    }
  });

  it("stays shut without the flag set to exactly true", () => {
    expect(canSeeSponsorInsights(access({ adminFlags: {} }))).toBe(false);
    expect(canSeeSponsorInsights(access({ adminFlags: undefined }))).toBe(false);
    expect(canSeeSponsorInsights(access({ adminFlags: { [SPONSOR_INSIGHTS_FLAG]: false } }))).toBe(false);
    expect(canSeeSponsorInsights(access({ adminFlags: { sponsorInsights: true } }))).toBe(false);
  });

  it("stays shut for someone who is not an owner or admin", () => {
    expect(canSeeSponsorInsights(access({ role: null }))).toBe(false);
  });
});

describe("classic sidebar", () => {
  const navIds = (context: AdminRouteAccessContext) =>
    getVisibleAdminNavigation(context).map((entry) => (entry.type === "link" ? entry.route.id : entry.id));

  it("lists Insights after Analytics for an owner or admin with the flag on", () => {
    for (const role of ["owner", "admin"] as const) {
      const ids = navIds(access({ role }));
      expect(ids).toContain("insights");
      expect(ids.indexOf("insights")).toBe(ids.indexOf("analytics") + 1);
      expect(getVisibleAdminRoutes(access({ role })).find((route) => route.id === "insights")?.href).toBe("/admin/insights");
    }
  });

  it("hides Insights without the flag and leaves every other row as it was", () => {
    const withFlag = navIds(access());
    const withoutFlag = navIds(access({ adminFlags: {} }));
    expect(withoutFlag).not.toContain("insights");
    expect(withFlag.filter((id) => id !== "insights")).toEqual(withoutFlag);
    // Before TELEMETRY-06 the classic shell passed no flags at all.
    expect(getVisibleAdminNavigation(access({ adminFlags: {} }))).toEqual(
      getVisibleAdminNavigation(access({ adminFlags: undefined })),
    );
  });

  it("shows nothing to someone who is not an owner or admin", () => {
    expect(navIds(access({ role: null }))).toEqual([]);
  });

  function shell(adminFlags: Record<string, boolean>) {
    mocks.pathname = "/admin/insights";
    const guard = { register: () => () => undefined, requestNavigation: () => true };
    const page = createElement(UnsavedGuardContext.Provider, { value: guard }, createElement(AdminShell, null, "page"));
    const settings = { ...portal("classic"), flags: adminFlags };
    // The providers type children as a required prop; createElement passes them as arguments.
    const portalProps = { settings, isOwner: true } as ComponentProps<typeof AdminPortalProvider>;
    const themeProps = { initialTheme: "light" } as ComponentProps<typeof AdminThemeProvider>;
    const clubProps = { club: club() } as ComponentProps<typeof ClubContextProvider>;
    const withPortal = createElement(AdminPortalProvider, portalProps, page);
    const withTheme = createElement(AdminThemeProvider, themeProps, withPortal);
    return renderToStaticMarkup(createElement(ClubContextProvider, clubProps, withTheme));
  }

  it("renders the Insights link in the classic shell when the flag is on", () => {
    const markup = shell(FLAG_ON);
    expect(markup).toMatch(/<a[^>]*href="\/admin\/insights"[^>]*>[\s\S]*?<span>Insights<\/span>/);
    expect(markup).toContain('data-active="true"');
  });

  it("renders no Insights link in the classic shell when the flag is off", () => {
    const markup = shell({});
    expect(markup).not.toContain('href="/admin/insights"');
    expect(markup).toContain('href="/admin/analytics"');
  });
});

describe("reimagined admin keeps its Insights tab", () => {
  it("shows the tab with the flag on, and no sidebar row for the same page", () => {
    const context = access({ adminPortal: "reimagined" });
    expect(getVisibleAdminTabs(context).map((tab) => tab.id)).toContain("insights");
    expect(getVisibleAdminRoutes(context).map((route) => route.id)).not.toContain("insights");
    expect(getAdminTabTargets(context).filter((target) => target.href === "/admin/insights")).toEqual([
      { href: "/admin/insights", tab: "insights" },
    ]);
  });

  it("has no tab without the flag", () => {
    expect(getVisibleAdminTabs(access({ adminPortal: "reimagined", adminFlags: {} })).map((tab) => tab.id)).not.toContain(
      "insights",
    );
  });

  it("renders the tab page with the flag on and sends a club without it to /admin", async () => {
    setClub(club(), portal("reimagined"));
    expect(await insightsPage()).toContain('data-admin-tab-page="insights"');
    setClub(club(), portal("reimagined", {}));
    expect(await redirectOf(() => insightsPage())).toBe("/admin");
    expect(await redirectOf(() => reportPage())).toBe("/admin");
  });
});

describe("Insights on the classic admin", () => {
  it.each(["owner", "admin"] as const)("renders both pages for a classic %s with the flag on", async (role) => {
    setClub(club({ role }), portal("classic"));

    const insights = await insightsPage();
    expect(insights).toContain('data-admin-insights-page="classic"');
    expect(insights).toMatch(/<h1[^>]*>No visits yet<\/h1>/);
    expect(insights).toContain('data-testid="insights-waiting"');
    expect(insights).not.toContain("data-admin-tab-page");

    const report = await reportPage();
    expect(report).toContain("No visits yet");
    expect(report).not.toContain("data-admin-tab-page");
  });

  it("shows a held club's waiting state without reading its numbers", async () => {
    setClub(club({ slug: "rose-city" }), portal("classic"));
    const markup = await insightsPage();
    expect(markup).toContain("data-held");
    expect(mocks.loadInsightsData).not.toHaveBeenCalled();
  });

  it("sends a classic club without the flag to /admin, like any tab it does not have", async () => {
    setClub(club(), portal("classic", {}));
    expect(await redirectOf(() => insightsPage())).toBe("/admin");
    expect(await redirectOf(() => reportPage())).toBe("/admin");
    expect(mocks.loadInsightsData).not.toHaveBeenCalled();
    expect(mocks.readReportMonths).not.toHaveBeenCalled();
  });

  it("denies someone who is not an owner or admin even with the flag on", async () => {
    setClub(club({ role: null }), portal("classic"));
    expect(await redirectOf(() => insightsPage())).toBe("/admin/login?error=not_authorized");
    expect(await redirectOf(() => reportPage())).toBe("/admin/login?error=not_authorized");
  });

  it("still sends a classic club from every other tab to its classic page", async () => {
    setClub(club(), portal("classic"));
    expect(await redirectOf(() => loadAdminTabPage("games"))).toBe("/admin/schedule");
    expect(await redirectOf(() => loadAdminTabPage("website"))).toBe("/admin/homepage");
    expect(await redirectOf(() => loadAdminTabPage("club"))).toBe("/admin/branding");
    expect(await redirectOf(() => loadAdminTabPage("programs"))).toBe("/admin");
    expect(await redirectOf(() => loadAdminTabPage("home"))).toBe("/admin");
  });

  const month = "2026-10";
  const [seen, few, unseen] = ["a", "b", "c"].map((letter) => `${letter.repeat(8)}-0000-4000-8000-000000000000`);

  function seedMonth() {
    mocks.readReportMonths.mockResolvedValue({ status: "ready", months: [month] });
    mocks.readMonthlyReportRows.mockResolvedValue({
      status: "ready",
      totals: [{ local_date: "2026-10-05", views: 500, visitors: 300, visits: 350, engaged_ms: 0, engaged_views: 0, dropped: 0 }],
      sponsorRows: [
        { local_date: "2026-10-05", sponsor_id: seen, logo_views: 1234567, logo_viewers: 900000, clicks: 0 },
        { local_date: "2026-10-05", sponsor_id: few, logo_views: 50, logo_viewers: 40, clicks: 2 },
      ],
      sponsors: [
        { id: unseen, name: "Rose Quarter Dental", logo_url: null },
        { id: few, name: "Tepito Tacos", logo_url: null },
        { id: seen, name: "PacificNorthwestOrthopedicSportsMedicineGroup", logo_url: null },
      ],
      matches: [],
    });
    setClub(club(), portal("classic"));
  }

  it("answers what each sponsor got in the month, most seen first, with no NaN or Infinity", async () => {
    seedMonth();
    const insights = await insightsPage({ month });
    expect(insights).toMatch(/<h1[^>]*>Your sponsors were seen 1,234,617 times in [A-Z][a-z]+/);
    const order = ["PacificNorthwestOrthopedicSportsMedicineGroup", "Tepito Tacos", "Rose Quarter Dental"].map((name) =>
      insights.indexOf(name),
    );
    expect(order.every((at, index) => at > 0 && (index === 0 || at > order[index - 1]))).toBe(true);
    expect(insights).toContain("1,234,567");
    expect(insights).toContain("4.0%");
    expect(insights).toContain("No click rate: the logo was not seen");
    expect(insights).toContain("All sponsors");
    expect(insights).toContain('href="/admin/insights/report?month=2026-10&amp;sponsor=all"');
    expect(insights).not.toMatch(/NaN|Infinity|undefined/);

    const all = await reportPage({ month, sponsor: "all" });
    expect(all).toContain("data-report-summary");
    expect(all).toContain("1,234,617 logo views");

    const one = await reportPage({ month, sponsor: few });
    expect(one).not.toContain("data-report-summary");
    expect(one).toContain("Tepito Tacos");
    // Only the picked sponsor's page prints; the others are just picker options.
    const pages = one.slice(one.indexOf("data-sponsor-report"));
    expect(pages).toContain("Tepito Tacos");
    expect(pages).not.toContain("PacificNorthwestOrthopedicSportsMedicineGroup");
  });

  it("says when the visitor numbers fail to load, and keeps the sponsor table and link builder", async () => {
    seedMonth();
    mocks.loadInsightsData.mockResolvedValue({ status: "error" });
    const insights = await insightsPage({ month });
    expect(insights).toContain('data-insights-visitors="error"');
    expect(insights).toMatch(/role="alert"[^>]*>These numbers could not be loaded/);
    expect(insights).toContain("data-sponsor-table");
    expect(insights).toContain('data-testid="campaign-link-builder"');
  });
});
