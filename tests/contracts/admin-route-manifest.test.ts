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
    expect(ADMIN_ROUTE_MANIFEST).toHaveLength(20);
    expect(new Set(ADMIN_ROUTE_MANIFEST.map((route) => route.id)).size).toBe(
      20,
    );
    expect(new Set(ADMIN_ROUTE_MANIFEST.map((route) => route.href)).size).toBe(
      20,
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
      { id: "add-game", label: "Add a game", routeId: "add-game", hue: "blue", needsContentMutation: true },
      { id: "see-registrations", label: "See registrations", routeId: "sign-ups", hue: "green", hint: "new-sign-ups", needsLiveSignUps: true },
      { id: "edit-website", label: "Edit my website", routeId: "homepage", hue: "coral", needsContentMutation: true },
    ]);
    expect(getVisibleAdminHomeJobs(REIMAGINED).map((job) => [job.label, job.href])).toEqual([
      ["Enter a score", "/admin/schedule"],
      ["Add a game", "/admin/add-game"],
      ["See registrations", "/admin/sign-ups"],
      ["Edit my website", "/admin/homepage"],
    ]);
  });

  it("locks the More rows in glossary words and order", () => {
    expect(ADMIN_MORE_ROWS.map((row) => [row.label, row.routeId])).toEqual([
      ["Team roster", "roster"],
      ["This season", "seasons"],
      ["Games", "schedule"],
      ["Player numbers", "match-stats"],
      ["League table", "standings"],
      ["Programs", "programs"],
      ["Tryouts", "tryouts"],
      ["Homepage", "homepage"],
      ["About page", "about"],
      ["Contact page", "contact"],
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
      "/admin/stats",
      "/admin/standings",
      "/admin/programs",
      "/admin/tryouts",
      "/admin/about",
      "/admin/contact",
      "/admin/sponsors",
      "/admin/shop",
      "/admin/branding",
      "/admin/analytics",
      "/admin/payments",
      "/admin/members",
      "/admin/registrations",
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

  // ADMIN-RE-08 (deliberate update): See registrations opens /admin/sign-ups
  // now, so Sign-up forms stays in More whether or not a form is live.
  it("has four jobs with a live sign-up form, otherwise three, and always a Sign-up forms row", () => {
    expect(jobIds(REIMAGINED)).toContain("see-registrations");
    expect(rowIds(REIMAGINED).at(-1)).toBe("sign-up-forms");

    const quiet = { ...REIMAGINED, hasLiveSignUps: false };
    expect(jobIds(quiet)).toEqual(["enter-score", "add-game", "edit-website"]);
    expect(rowIds(quiet).at(-1)).toBe("sign-up-forms");
    expect(getVisibleAdminMoreRows(quiet).at(-1)).toMatchObject({ label: "Sign-up forms", href: "/admin/registrations" });
    expect(rowIds({ ...REIMAGINED, hasLiveSignUps: undefined })).toContain("sign-up-forms");
  });

  it("hides the jobs that change the website while content changes are paused, and keeps their pages in More", () => {
    const paused = { ...REIMAGINED, canMutateContent: false };
    expect(jobIds(paused)).toEqual(["see-registrations"]);
    expect(rowIds(REIMAGINED)).not.toContain("games");
    expect(rowIds(REIMAGINED)).not.toContain("homepage");
    expect(rowIds(paused)).toEqual([
      "team-roster",
      "this-season",
      "games",
      "player-numbers",
      "league-table",
      "programs",
      "tryouts",
      "homepage",
      "about-page",
      "contact-page",
      "sponsors",
      "shop",
      "your-club",
      "how-the-team-is-doing",
      "payments-and-plan",
      "who-can-sign-in",
      "sign-up-forms",
    ]);
    expect(getVisibleAdminMoreRows(paused).filter((row) => row.id === "games" || row.id === "homepage")).toEqual([
      { id: "games", label: "Games", href: "/admin/schedule", iconKey: "schedule" },
      { id: "homepage", label: "Homepage", href: "/admin/homepage", iconKey: "homepage" },
    ]);
  });

  it("reaches every page the classic sidebar shows, whatever the club's state", () => {
    const states: AdminRouteAccessContext[] = [
      REIMAGINED,
      { ...REIMAGINED, canMutateContent: false },
      { ...REIMAGINED, hasLiveSignUps: false },
      { ...REIMAGINED, role: "admin", isBillingAuthorized: false },
      { ...REIMAGINED, presentationTemplateKey: "clubhouse@1" },
    ];
    for (const context of states) {
      const fromHome = new Set([
        ...getVisibleAdminHomeJobs(context).map((job) => job.href),
        ...getVisibleAdminMoreRows(context).map((row) => row.href),
        "/admin",
      ]);
      // The classic sidebar's pages; the reimagined-only job pages (ADMIN-RE-06
      // onward) are reached through their own tiles when those apply.
      const missing = getVisibleAdminRoutes({ ...context, adminPortal: "classic" })
        .map((route) => route.href)
        .filter((href) => !fromHome.has(href));
      expect(missing).toEqual([]);
    }
  });

  it("hides owner-only rows from helpers and Payments without billing access", () => {
    const helper = { ...REIMAGINED, role: "admin" as const, isBillingAuthorized: false };
    expect(rowIds(helper)).not.toContain("who-can-sign-in");
    expect(rowIds(helper)).not.toContain("payments-and-plan");
    expect(jobIds(helper)).toEqual(jobIds(REIMAGINED));
    expect(rowIds({ ...REIMAGINED, isBillingAuthorized: false })).not.toContain("payments-and-plan");
    expect(rowIds({ ...REIMAGINED, isBillingAuthorized: false })).toContain("who-can-sign-in");
  });

  it("follows codeSiteAdminFor: Programs, Tryouts and Contact page rows only where the website has those pages", () => {
    expect(rowIds(REIMAGINED)).toEqual(expect.arrayContaining(["programs", "tryouts", "contact-page"]));
    for (const presentationTemplateKey of ["clubhouse@1", null, "future-template@1"] as const) {
      const ids = rowIds({ ...REIMAGINED, presentationTemplateKey });
      expect(ids).not.toContain("programs");
      expect(ids).not.toContain("tryouts");
      expect(ids).not.toContain("contact-page");
      expect(ids).toEqual(expect.arrayContaining(["team-roster", "about-page", "player-numbers"]));
    }
  });

  it("keeps Shop for the store-off club, as the classic admin does", () => {
    expect(rowIds({ ...REIMAGINED, storeEnabled: false })).toContain("shop");
  });

  it("titles each page in the top bar with its More name, otherwise its own name", () => {
    expect(getReimaginedPageTitle("/admin/roster")).toBe("Team roster");
    expect(getReimaginedPageTitle("/admin/roster/player-1")).toBe("Team roster");
    expect(getReimaginedPageTitle("/admin/branding")).toBe("Your club");
    expect(getReimaginedPageTitle("/admin/members")).toBe("Who can sign in");
    expect(getReimaginedPageTitle("/admin/registrations")).toBe("Sign-up forms");
    expect(getReimaginedPageTitle("/admin/sign-ups")).toBe("Registrations");
    expect(getReimaginedPageTitle("/admin/schedule")).toBe("Games");
    expect(getReimaginedPageTitle("/admin/stats")).toBe("Player numbers");
    expect(getReimaginedPageTitle("/admin/homepage")).toBe("Homepage");
    expect(getReimaginedPageTitle("/admin/about")).toBe("About page");
    expect(getReimaginedPageTitle("/admin/contact")).toBe("Contact page");
    expect(getReimaginedPageTitle("/admin/add-game")).toBe("Add a game");
    expect(getReimaginedPageTitle("/admin")).toBe("Club admin");
    expect(getReimaginedPageTitle("/admin/roster-preview")).toBe("Club admin");
    expect(getReimaginedPageTitle("/admin/nowhere")).toBe("Club admin");
  });
});

// ADMIN-RE-08 (deliberate update): See registrations opens its own page,
// /admin/sign-ups, which exists only in the reimagined admin.
describe("the See registrations page route", () => {
  it("is visible to owners and admins of a reimagined club only, never in the classic sidebar or search", () => {
    for (const role of ["owner", "admin"] as const) {
      const reimagined = { ...OWNER_ACCESS, role, adminPortal: "reimagined" as const };
      expect(visibleIds(reimagined)).toContain("sign-ups");
      for (const adminPortal of [undefined, "classic"] as const) {
        expect(visibleIds({ ...reimagined, adminPortal })).not.toContain("sign-ups");
        expect(navigationIds({ ...reimagined, adminPortal })).not.toContain("sign-ups");
      }
    }
    expect(navigationIds({ ...OWNER_ACCESS, adminPortal: "reimagined" })).not.toContain("sign-ups");
    expect(ADMIN_ROUTE_MANIFEST.find((route) => route.id === "sign-ups")).toMatchObject({
      href: "/admin/sign-ups",
      label: "Registrations",
      reimaginedOnly: true,
    });
  });

  it("keeps the old forms page in More as Sign-up forms, and the tile on the new page", () => {
    const quiet: AdminRouteAccessContext = { ...OWNER_ACCESS, adminPortal: "reimagined", hasLiveSignUps: false };
    expect(getVisibleAdminMoreRows(quiet).at(-1)).toMatchObject({ label: "Sign-up forms", href: "/admin/registrations" });
    expect(getVisibleAdminHomeJobs({ ...quiet, hasLiveSignUps: true }).find((job) => job.id === "see-registrations")?.href).toBe(
      "/admin/sign-ups",
    );
  });
});

// ADMIN-RE-07 (deliberate update): Add a game opens its own page,
// /admin/add-game, which exists only in the reimagined admin.
describe("the Add a game page route", () => {
  const REIMAGINED: AdminRouteAccessContext = { ...OWNER_ACCESS, adminPortal: "reimagined", adminFlags: {} };

  it("declares Add a game as a reimagined-only page outside the sidebar groups", () => {
    expect(ADMIN_ROUTE_MANIFEST.find((route) => route.id === "add-game")).toEqual({
      id: "add-game",
      label: "Add a game",
      href: "/admin/add-game",
      iconKey: "schedule",
      groupId: null,
      reimaginedOnly: true,
    });
    expect(JSON.stringify(ADMIN_NAVIGATION_MANIFEST)).not.toContain("add-game");
  });

  it("is visible only in the reimagined admin, to owners and helpers alike", () => {
    for (const adminPortal of [undefined, "classic"] as const) {
      expect(visibleIds({ ...OWNER_ACCESS, adminPortal })).not.toContain("add-game");
    }
    expect(visibleIds(REIMAGINED)).toContain("add-game");
    expect(visibleIds({ ...REIMAGINED, role: "admin", isBillingAuthorized: false })).toContain("add-game");
    expect(visibleIds({ ...REIMAGINED, role: null })).toEqual([]);
    expect(navigationIds(REIMAGINED)).not.toContain("add-game");
  });
});
