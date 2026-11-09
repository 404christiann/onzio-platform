import { describe, expect, it } from "vitest";
import {
  ADMIN_HOME_JOBS,
  ADMIN_MORE_ROWS,
  ADMIN_NAVIGATION_MANIFEST,
  ADMIN_ROUTE_MANIFEST,
  getAdminGroupForPathname,
  getReimaginedPageTitle,
  getVisibleAdminHomeJobs,
  getVisibleAdminMoreRows,
  getVisibleAdminNavigation,
  getVisibleAdminQuickActions,
  getVisibleAdminRoutes,
  type AdminRouteAccessContext,
} from "@/lib/admin-route-manifest";

const OWNER_ACCESS: AdminRouteAccessContext = {
  role: "owner",
  presentationTemplateKey: "academy@1",
  isBillingAuthorized: true,
  canMutateContent: true,
  storeEnabled: true,
};

const ADMIN_ACCESS: AdminRouteAccessContext = {
  ...OWNER_ACCESS,
  role: "admin",
  isBillingAuthorized: false,
};

function visibleIds(context: AdminRouteAccessContext) {
  return getVisibleAdminRoutes(context).map((route) => route.id);
}

function navigationIds(context: AdminRouteAccessContext) {
  return getVisibleAdminNavigation(context).flatMap((entry) =>
    entry.type === "link"
      ? [entry.route.id]
      : entry.routes.map((route) => route.id),
  );
}

describe("strict admin route manifest", () => {
  it("declares each protected destination exactly once", () => {
    expect(ADMIN_ROUTE_MANIFEST).toHaveLength(18);
    expect(new Set(ADMIN_ROUTE_MANIFEST.map((route) => route.id)).size).toBe(
      18,
    );
    expect(new Set(ADMIN_ROUTE_MANIFEST.map((route) => route.href)).size).toBe(
      18,
    );
  });

  it("locks the exact navigation hierarchy with Registrations before Analytics", () => {
    expect(ADMIN_NAVIGATION_MANIFEST).toEqual([
      { type: "link", routeId: "dashboard" },
      {
        type: "group",
        id: "website",
        label: "Website",
        iconKey: "website",
        routeIds: [
          "homepage",
          "programs",
          "tryouts",
          "shop",
          "about",
          "sponsors",
          "contact",
        ],
      },
      {
        type: "group",
        id: "competition",
        label: "Competition",
        iconKey: "competition",
        routeIds: [
          "seasons",
          "roster",
          "schedule",
          "match-stats",
          "standings",
        ],
      },
      { type: "link", routeId: "registrations" },
      { type: "link", routeId: "analytics" },
      {
        type: "group",
        id: "club-settings",
        label: "Club Settings",
        iconKey: "club-settings",
        routeIds: ["branding", "team-access"],
      },
      { type: "link", routeId: "payments" },
    ]);
  });

  it("presents one Stats destination searchable by match and season terminology", () => {
    const stats = getVisibleAdminRoutes(OWNER_ACCESS).filter(route => route.href === "/admin/stats");
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ id: "match-stats", label: "Stats", groupId: "competition" });
    expect(stats[0].searchKeywords).toEqual(expect.arrayContaining(["match stats", "season stats", "season totals"]));
    expect(getVisibleAdminRoutes(OWNER_ACCESS).some(route => route.href === "/admin/season-stats")).toBe(false);
    expect(navigationIds(OWNER_ACCESS).filter(id => id === "match-stats")).toHaveLength(1);
  });

  it("keeps feature metadata dormant on only the existing three routes", () => {
    expect(
      ADMIN_ROUTE_MANIFEST.flatMap((route) =>
        "feature" in route ? [[route.id, route.feature]] : [],
      ),
    ).toEqual([
      ["programs", "programs"],
      ["tryouts", "tryouts"],
      ["contact", "contact"],
    ]);

    const mutable = visibleIds(OWNER_ACCESS);
    const readOnly = visibleIds({ ...OWNER_ACCESS, canMutateContent: false });
    expect(readOnly).toEqual(mutable);
  });

  it("fails closed without a protected owner or admin role", () => {
    const context = { ...OWNER_ACCESS, role: null };
    expect(getVisibleAdminRoutes(context)).toEqual([]);
    expect(getVisibleAdminNavigation(context)).toEqual([]);
    expect(getVisibleAdminQuickActions(context)).toEqual([]);
  });

  it("shows Team Access only to owners and Payments only to billing-authorized owners", () => {
    expect(visibleIds(OWNER_ACCESS)).toContain("team-access");
    expect(visibleIds(OWNER_ACCESS)).toContain("payments");

    expect(
      visibleIds({ ...OWNER_ACCESS, isBillingAuthorized: false }),
    ).toContain("team-access");
    expect(
      visibleIds({ ...OWNER_ACCESS, isBillingAuthorized: false }),
    ).not.toContain("payments");

    expect(visibleIds(ADMIN_ACCESS)).not.toContain("team-access");
    expect(visibleIds(ADMIN_ACCESS)).not.toContain("payments");
    expect(
      visibleIds({ ...ADMIN_ACCESS, isBillingAuthorized: true }),
    ).not.toContain("payments");
  });

  it("keeps shared routes visible for active sites", () => {
    for (const presentationTemplateKey of ["academy@1", "clubhouse@1"] as const) {
      const ids = visibleIds({ ...OWNER_ACCESS, presentationTemplateKey });
      expect(ids).toEqual(expect.arrayContaining(["match-stats", "analytics", "registrations"]));
    }
  });

  it("shows public page editors only where their tenant public routes render", () => {
    expect(visibleIds(OWNER_ACCESS)).toEqual(expect.arrayContaining(["programs", "tryouts"]));
    for (const template of ["clubhouse@1", null, "future-template@1"] as const) {
      const ids = visibleIds({ ...OWNER_ACCESS, presentationTemplateKey: template });
      expect(ids).not.toContain("programs");
      expect(ids).not.toContain("tryouts");
    }
  });

  it.each([
    ["owner", "academy@1"],
    ["admin", "academy@1"],
    ["owner", "clubhouse@1"],
    ["admin", "clubhouse@1"],
    ["owner", "future-template@1"],
  ] as const)(
    "keeps Registrations visible for the %s role on %s",
    (role, presentationTemplateKey) => {
      expect(
        visibleIds({
          ...OWNER_ACCESS,
          role,
          presentationTemplateKey,
          isBillingAuthorized: role === "owner",
        }),
      ).toContain("registrations");
    },
  );

  it("attaches search keywords only to already-visible route objects", () => {
    for (const route of ADMIN_ROUTE_MANIFEST) {
      expect("searchKeywords" in route).toBe(false);
    }

    const visible = getVisibleAdminRoutes({
      ...ADMIN_ACCESS,
      presentationTemplateKey: "clubhouse@1",
    });
    expect(visible.every((route) => route.searchKeywords.length > 0)).toBe(
      true,
    );
    expect(visible.map((route) => route.id)).not.toContain("programs");
    expect(visible.map((route) => route.id)).not.toContain("team-access");
    expect(visible.map((route) => route.id)).not.toContain("payments");

    const visibleSearchIndex = JSON.stringify(visible);
    expect(visibleSearchIndex).not.toContain("offerings");
    expect(visibleSearchIndex).toContain("game statistics");
    expect(visibleSearchIndex).toContain("player statistics");
    expect(visibleSearchIndex).not.toContain("permissions");
    expect(visibleSearchIndex).not.toContain("invoices");
  });

  it("separates readable routes from mutation-gated quick actions", () => {
    const readOnlyOwner = {
      ...OWNER_ACCESS,
      canMutateContent: false,
    };
    expect(visibleIds(readOnlyOwner)).toEqual(visibleIds(OWNER_ACCESS));
    expect(
      getVisibleAdminQuickActions(readOnlyOwner).map((action) => action.id),
    ).toEqual(["payments"]);

    expect(
      getVisibleAdminQuickActions(ADMIN_ACCESS).map((action) => action.id),
    ).toEqual(["registrations", "manage-roster", "manage-schedule"]);
    expect(
      getVisibleAdminQuickActions(OWNER_ACCESS).map((action) => action.id),
    ).toEqual([
      "registrations",
      "manage-roster",
      "manage-schedule",
      "payments",
    ]);
  });

  it("resolves only visible active-route groups with segment-safe matching", () => {
    expect(
      getAdminGroupForPathname("/admin/homepage", OWNER_ACCESS),
    ).toBe("website");
    expect(
      getAdminGroupForPathname("/admin/roster/player-1", OWNER_ACCESS),
    ).toBe("competition");
    expect(
      getAdminGroupForPathname("/admin/members", OWNER_ACCESS),
    ).toBe("club-settings");
    expect(
      getAdminGroupForPathname("/admin/members", ADMIN_ACCESS),
    ).toBeNull();
    expect(
      getAdminGroupForPathname("/admin/tryouts", {
        ...OWNER_ACCESS,
        presentationTemplateKey: "clubhouse@1",
      }),
    ).toBeNull();
    expect(
      getAdminGroupForPathname("/admin/roster-preview", OWNER_ACCESS),
    ).toBeNull();
  });
});

// ADMIN-RE-05 (deliberate update): the reimagined home's jobs and More rows
// are part of the manifest now, locked here as exact arrays like the sidebar.
describe("reimagined home jobs and More rows", () => {
  const REIMAGINED: AdminRouteAccessContext = {
    ...OWNER_ACCESS,
    adminPortal: "reimagined",
    adminFlags: {},
    hasLiveSignUps: true,
  };
  const jobIds = (context: AdminRouteAccessContext) =>
    getVisibleAdminHomeJobs(context).map((job) => job.id);
  const rowIds = (context: AdminRouteAccessContext) =>
    getVisibleAdminMoreRows(context).map((row) => row.id);

  it("locks the four jobs, their glossary labels and the old pages they open until each job ships", () => {
    expect(ADMIN_HOME_JOBS).toEqual([
      { id: "enter-score", label: "Enter a score", routeId: "schedule", hue: "amber", hint: "games-needing-score", needsContentMutation: true },
      { id: "add-game", label: "Add a game", routeId: "schedule", hue: "blue", needsContentMutation: true },
      { id: "see-registrations", label: "See registrations", routeId: "registrations", hue: "green", hint: "new-sign-ups", needsLiveSignUps: true },
      { id: "edit-website", label: "Edit my website", routeId: "homepage", hue: "coral", needsContentMutation: true },
    ]);
    expect(getVisibleAdminHomeJobs(REIMAGINED).map((job) => [job.label, job.href])).toEqual([
      ["Enter a score", "/admin/schedule"],
      ["Add a game", "/admin/schedule"],
      ["See registrations", "/admin/registrations"],
      ["Edit my website", "/admin/homepage"],
    ]);
  });

  it("locks the More rows in glossary words and order", () => {
    expect(ADMIN_MORE_ROWS.map((row) => [row.label, row.routeId])).toEqual([
      ["Team roster", "roster"],
      ["This season", "seasons"],
      ["League table", "standings"],
      ["Programs", "programs"],
      ["Tryouts", "tryouts"],
      ["Sponsors", "sponsors"],
      ["Shop", "shop"],
      ["Your club", "branding"],
      ["How the team is doing", "analytics"],
      ["Payments and plan", "payments"],
      ["Who can sign in", "team-access"],
      ["Sign-up forms", "registrations"],
    ]);
    expect(getVisibleAdminMoreRows(REIMAGINED).map((row) => row.href)).toEqual([
      "/admin/roster",
      "/admin/seasons",
      "/admin/standings",
      "/admin/programs",
      "/admin/tryouts",
      "/admin/sponsors",
      "/admin/shop",
      "/admin/branding",
      "/admin/analytics",
      "/admin/payments",
      "/admin/members",
    ]);
  });

  it("shows nothing from the home outside the reimagined admin", () => {
    for (const adminPortal of [undefined, "classic"] as const) {
      expect(getVisibleAdminHomeJobs({ ...REIMAGINED, adminPortal })).toEqual([]);
      expect(getVisibleAdminMoreRows({ ...REIMAGINED, adminPortal })).toEqual([]);
    }
    expect(getVisibleAdminHomeJobs({ ...REIMAGINED, role: null })).toEqual([]);
    expect(getVisibleAdminMoreRows({ ...REIMAGINED, role: null })).toEqual([]);
  });

  it("has four jobs with a live sign-up form, otherwise three and a quiet Sign-up forms row", () => {
    expect(jobIds(REIMAGINED)).toContain("see-registrations");
    expect(rowIds(REIMAGINED)).not.toContain("sign-up-forms");

    const quiet = { ...REIMAGINED, hasLiveSignUps: false };
    expect(jobIds(quiet)).toEqual(["enter-score", "add-game", "edit-website"]);
    expect(rowIds(quiet).at(-1)).toBe("sign-up-forms");
    expect(getVisibleAdminMoreRows(quiet).at(-1)).toMatchObject({ label: "Sign-up forms", href: "/admin/registrations" });
    // Missing means no live form: the quiet row, never a lost page.
    expect(rowIds({ ...REIMAGINED, hasLiveSignUps: undefined })).toContain("sign-up-forms");
  });

  it("hides the jobs that change the website while content changes are paused", () => {
    const paused = { ...REIMAGINED, canMutateContent: false };
    expect(jobIds(paused)).toEqual(["see-registrations"]);
    expect(rowIds(paused)).toEqual(rowIds(REIMAGINED));
  });

  it("hides owner-only rows from helpers and Payments without billing access", () => {
    const helper = { ...REIMAGINED, role: "admin" as const, isBillingAuthorized: false };
    expect(rowIds(helper)).not.toContain("who-can-sign-in");
    expect(rowIds(helper)).not.toContain("payments-and-plan");
    expect(jobIds(helper)).toEqual(jobIds(REIMAGINED));
    expect(rowIds({ ...REIMAGINED, isBillingAuthorized: false })).not.toContain("payments-and-plan");
    expect(rowIds({ ...REIMAGINED, isBillingAuthorized: false })).toContain("who-can-sign-in");
  });

  it("follows codeSiteAdminFor: Programs and Tryouts rows only where the website has those pages", () => {
    expect(rowIds(REIMAGINED)).toEqual(expect.arrayContaining(["programs", "tryouts"]));
    for (const presentationTemplateKey of ["clubhouse@1", null, "future-template@1"] as const) {
      const ids = rowIds({ ...REIMAGINED, presentationTemplateKey });
      expect(ids).not.toContain("programs");
      expect(ids).not.toContain("tryouts");
      expect(ids).toContain("team-roster");
    }
  });

  it("keeps Shop for the store-off club, as the classic admin does", () => {
    expect(rowIds({ ...REIMAGINED, storeEnabled: false })).toContain("shop");
  });

  it("titles each page in the top bar with its More name, otherwise its own name", () => {
    expect(getReimaginedPageTitle("/admin/roster", REIMAGINED)).toBe("Team roster");
    expect(getReimaginedPageTitle("/admin/roster/player-1", REIMAGINED)).toBe("Team roster");
    expect(getReimaginedPageTitle("/admin/branding", REIMAGINED)).toBe("Your club");
    expect(getReimaginedPageTitle("/admin/members", REIMAGINED)).toBe("Who can sign in");
    expect(getReimaginedPageTitle("/admin/registrations", REIMAGINED)).toBe("Sign-up forms");
    expect(getReimaginedPageTitle("/admin/schedule", REIMAGINED)).toBe("Schedule");
    expect(getReimaginedPageTitle("/admin/stats", REIMAGINED)).toBe("Stats");
    expect(getReimaginedPageTitle("/admin/members", { ...REIMAGINED, role: "admin" })).toBe("Club admin");
    expect(getReimaginedPageTitle("/admin/nowhere", REIMAGINED)).toBe("Club admin");
  });
});
