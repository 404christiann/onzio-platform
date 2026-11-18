import { describe, expect, it } from "vitest";
import {
  ADMIN_HOME_JOBS,
  ADMIN_MORE_ROWS,
  ADMIN_NAVIGATION_MANIFEST,
  ADMIN_ROUTE_MANIFEST,
  getAdminBreadcrumb,
  getAdminGroupForPathname,
  getWebsiteHubSections,
  isWebsiteHubVisible,
  getAdminHomeJobHref,
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

// The nine Rose City (cinematic@2) editors that used to have no sidebar row.
const CINEMATIC_EDITORS = [
  { id: "stadium", label: "Stadium" },
  { id: "foothill-transit", label: "Foothill Transit" },
  { id: "chick-fil-a", label: "Chick-fil-A" },
  { id: "tickets", label: "Tickets" },
  { id: "season-membership", label: "Season Membership" },
  { id: "know-before-you-go", label: "Know Before You Go" },
  { id: "policies", label: "Policies" },
  { id: "partners", label: "Partners" },
  { id: "injury-report", label: "Injury Report" },
] as const;
const CINEMATIC_EDITOR_IDS = CINEMATIC_EDITORS.map((editor) => editor.id);

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
    // ADMIN-RE-12c (deliberate): Programs and tryouts is the 23rd; the
    // cinematic@2-only News editor (RC2027-NEWS) is the 24th; the nine other
    // Rose City editors (CLASSIC-RC-FIX) are the 25th to 33rd; All website pages
    // (the Website hub, RC-ADMIN-01) is the 34th.
    expect(ADMIN_ROUTE_MANIFEST).toHaveLength(34);
    expect(new Set(ADMIN_ROUTE_MANIFEST.map((route) => route.id)).size).toBe(
      34,
    );
    expect(new Set(ADMIN_ROUTE_MANIFEST.map((route) => route.href)).size).toBe(
      34,
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
          "news",
          ...CINEMATIC_EDITOR_IDS,
          "website-pages",
        ],
        hub: {
          sidebarRouteIds: ["homepage", "shop", "about", "news", "website-pages"],
          hubRouteId: "website-pages",
          headings: [
            { id: "pages", label: "Pages", routeIds: ["homepage", "programs", "tryouts", "shop", "about", "contact", "news"] },
            {
              id: "tickets-and-stadium",
              label: "Tickets and stadium",
              routeIds: ["tickets", "season-membership", "know-before-you-go", "stadium", "foothill-transit", "chick-fil-a", "policies"],
            },
            { id: "partners", label: "Partners", routeIds: ["sponsors", "partners", "injury-report"] },
          ],
        },
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

  it("shows the News editor only for cinematic@2 (RC2027-NEWS)", () => {
    expect(visibleIds({ ...OWNER_ACCESS, presentationTemplateKey: "cinematic@2" })).toContain("news");
    for (const presentationTemplateKey of ["academy@1", "clubhouse@1", null] as const) {
      expect(visibleIds({ ...OWNER_ACCESS, presentationTemplateKey })).not.toContain("news");
    }
  });

  it("gives each Rose City editor a Website row, for cinematic@2 only", () => {
    for (const role of [OWNER_ACCESS, ADMIN_ACCESS]) {
      const cinematic = { ...role, presentationTemplateKey: "cinematic@2" };
      expect(visibleIds(cinematic)).toEqual(expect.arrayContaining(CINEMATIC_EDITOR_IDS));
      const website = getVisibleAdminNavigation(cinematic).find((entry) => entry.type === "group" && entry.id === "website");
      // The Hub: the sidebar lists four pages and the hub row; the editors sit behind the hub page.
      expect(website?.type === "group" ? website.routes.map((row) => row.id) : []).toEqual(["homepage", "shop", "about", "news", "website-pages"]);
      const rows = website?.type === "group" ? (website.overflowRoutes ?? []) : [];
      for (const editor of CINEMATIC_EDITORS) {
        expect(rows.find((row) => row.id === editor.id)).toMatchObject({
          label: editor.label,
          href: `/admin/${editor.id}`,
          groupId: "website",
        });
      }
    }
    for (const presentationTemplateKey of ["academy@1", "clubhouse@1", "editorial@1", "future-template@1", null] as const) {
      const context = { ...OWNER_ACCESS, presentationTemplateKey };
      for (const id of CINEMATIC_EDITOR_IDS) {
        expect(visibleIds(context)).not.toContain(id);
        expect(navigationIds(context)).not.toContain(id);
      }
    }
  });

  it("lists every Rose City Website row on the hub page under Pages, Tickets and stadium and Partners", () => {
    const context = { ...OWNER_ACCESS, presentationTemplateKey: "cinematic@2" };
    const sections = getWebsiteHubSections(context);
    expect(sections.map((section) => [section.label, section.routes.map((route) => route.id)])).toEqual([
      ["Pages", ["homepage", "programs", "tryouts", "shop", "about", "contact", "news"].filter((id) => visibleIds(context).includes(id as never))],
      ["Tickets and stadium", ["tickets", "season-membership", "know-before-you-go", "stadium", "foothill-transit", "chick-fil-a", "policies"]],
      ["Partners", ["sponsors", "partners", "injury-report"]],
    ]);
    // Every visible Website row except the hub row itself appears exactly once, and none is lost.
    const listed = sections.flatMap((section) => section.routes.map((route) => route.id));
    const website = getVisibleAdminRoutes(context).filter((route) => route.groupId === "website" && route.id !== "website-pages");
    expect([...listed].sort()).toEqual(website.map((route) => route.id).sort());
    expect(new Set(listed).size).toBe(listed.length);
    expect(listed).not.toContain("website-pages");
  });

  it("highlights the hub row's pages and names Website > group > page in the top bar", () => {
    const context = { ...OWNER_ACCESS, presentationTemplateKey: "cinematic@2" };
    expect(getAdminBreadcrumb("/admin/stadium", context)).toEqual(["Website", "Tickets and stadium", "Robinson Stadium"]);
    expect(getAdminBreadcrumb("/admin/season-membership", context)).toEqual(["Website", "Tickets and stadium", "Season Ticket Membership"]);
    expect(getAdminBreadcrumb("/admin/policies", context)).toEqual(["Website", "Tickets and stadium", "Stadium Guidelines & Fan Code"]);
    // Foothill Transit, Chick-fil-A, Know Before You Go, Tickets, Partners and Injury Report already match their page headings.
    expect(getAdminBreadcrumb("/admin/foothill-transit", context)?.[2]).toBe("Foothill Transit");
    // The sidebar and search keep the short label.
    expect(getVisibleAdminRoutes(context).find((route) => route.id === "stadium")?.label).toBe("Stadium");
    expect(getAdminBreadcrumb("/admin/injury-report", context)).toEqual(["Website", "Partners", "Injury Report"]);
    expect(getAdminBreadcrumb("/admin/news/anything", context)).toEqual(["Website", "Pages", "News"]);
    expect(getAdminBreadcrumb("/admin/website-pages", context)).toEqual(["Website", "All website pages"]);
    expect(getAdminBreadcrumb("/admin/roster", context)).toBeNull();
    const website = getVisibleAdminNavigation(context).find((entry) => entry.type === "group" && entry.id === "website");
    const overflow = website?.type === "group" ? website.overflowRoutes?.map((route) => route.id) : [];
    expect(overflow).toEqual(expect.arrayContaining(["stadium", "tickets", "policies", "sponsors", "contact"]));
    expect(overflow).not.toContain("homepage");
    // Search and the flat route list still know every route.
    expect(visibleIds(context)).toEqual(expect.arrayContaining([...CINEMATIC_EDITOR_IDS, "website-pages", "sponsors", "contact"]));
  });

  it("opens the hub page for a cinematic@2 club", () => {
    expect(isWebsiteHubVisible({ ...OWNER_ACCESS, presentationTemplateKey: "cinematic@2" })).toBe(true);
  });

  it("shows the hub only to cinematic@2 clubs", () => {
    for (const presentationTemplateKey of ["academy@1", "clubhouse@1", "editorial@1", "future-template@1", null] as const) {
      const context = { ...OWNER_ACCESS, presentationTemplateKey };
      expect(visibleIds(context)).not.toContain("website-pages");
      expect(navigationIds(context)).not.toContain("website-pages");
      expect(getWebsiteHubSections(context)).toEqual([]);
      // The page refuses it (notFound) on exactly this check.
      expect(isWebsiteHubVisible(context)).toBe(false);
      expect(getAdminBreadcrumb("/admin/homepage", context)).toBeNull();
    }
  });

  it("leaves every other club's Website group exactly as it was: one flat list, no headings", () => {
    for (const presentationTemplateKey of ["academy@1", "clubhouse@1", "editorial@1", "future-template@1", null] as const) {
      for (const base of [OWNER_ACCESS, ADMIN_ACCESS]) {
        const context = { ...base, presentationTemplateKey };
        const navigation = getVisibleAdminNavigation(context);
        for (const entry of navigation) {
          if (entry.type !== "group") continue;
          expect(entry).not.toHaveProperty("overflowRoutes");
          expect(Object.keys(entry)).toEqual(["type", "id", "label", "iconKey", "routes"]);
        }
        const website = navigation.find((entry) => entry.type === "group" && entry.id === "website");
        expect(website?.type === "group" ? website.routes.map((route) => route.id) : []).toEqual(
          ["homepage", "programs", "tryouts", "shop", "about", "sponsors", "contact"].filter((id) => visibleIds(context).includes(id as never)),
        );
      }
    }
  });

  it("highlights the Website group and names the page on each Rose City editor", () => {
    const context = { ...OWNER_ACCESS, presentationTemplateKey: "cinematic@2" };
    for (const editor of CINEMATIC_EDITORS) {
      expect(getAdminGroupForPathname(`/admin/${editor.id}`, context)).toBe("website");
      expect(getAdminGroupForPathname(`/admin/${editor.id}/anything`, context)).toBe("website");
      expect(getReimaginedPageTitle(`/admin/${editor.id}`)).toBe(editor.label);
    }
    // A club that is not cinematic@2 does not light a group for those paths.
    expect(getAdminGroupForPathname("/admin/stadium", OWNER_ACCESS)).toBeNull();
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
      { id: "enter-score", label: "Enter a score", routeId: "score", hue: "amber", hint: "games-needing-score", needsContentMutation: true },
      { id: "add-game", label: "Add a game", routeId: "add-game", hue: "blue", needsContentMutation: true },
      { id: "see-registrations", label: "See registrations", routeId: "sign-ups", hue: "green", hint: "new-sign-ups", needsLiveSignUps: true },
      { id: "edit-website", label: "Edit my website", routeId: "homepage", hue: "coral", needsContentMutation: true },
    ]);
    expect(getVisibleAdminHomeJobs(REIMAGINED).map((job) => [job.label, job.href])).toEqual([
      ["Enter a score", "/admin/score"],
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
      // ADMIN-RE-12c (deliberate): one row for both (group 2 decision 1).
      ["Programs and tryouts", "programs-and-tryouts"],
      ["Homepage", "homepage"],
      ["About page", "about"],
      ["Contact page", "contact"],
      ["Sponsors", "sponsors"],
      ["Shop", "shop"],
      ["Your club", "your-club"],
      ["How the team is doing", "analytics"],
      ["Payments and plan", "payments"],
      ["Who can sign in", "team-access"],
      ["Sign-up forms", "registrations"],
    ]);
    expect(getVisibleAdminMoreRows(REIMAGINED).map((row) => row.href)).toEqual([
      "/admin/roster",
      "/admin/seasons",
      "/admin/schedule",
      "/admin/stats",
      "/admin/standings",
      "/admin/programs-and-tryouts",
      "/admin/about",
      "/admin/contact",
      "/admin/sponsors",
      "/admin/shop",
      "/admin/your-club",
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
    // ADMIN-RE-07 (deliberate update): Games is always a row, since no job
    // opens the old schedule page now that Enter a score and Add a game have
    // their own pages.
    expect(rowIds(REIMAGINED)).toContain("games");
    expect(rowIds(REIMAGINED)).not.toContain("homepage");
    expect(rowIds(paused)).toEqual([
      "team-roster",
      "this-season",
      "games",
      "player-numbers",
      "league-table",
      "programs-and-tryouts",
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
      // ADMIN-RE-14 (deliberate): Your club replaces the classic Branding page
      // for the same data (decision 0006), so Branding is no longer a row.
      // ADMIN-RE-12c (deliberate): the classic Programs and Tryouts pages are
      // opened from Programs and tryouts ("Edit the page", and the page-wide
      // words links), not from More.
      const fromProgramsAndTryouts = fromHome.has("/admin/programs-and-tryouts")
        ? ["/admin/programs", "/admin/tryouts"]
        : [];
      const missing = getVisibleAdminRoutes({ ...context, adminPortal: "classic" })
        .map((route) => route.href)
        .filter((href) => !fromHome.has(href) && href !== "/admin/branding" && !fromProgramsAndTryouts.includes(href));
      expect(missing).toEqual([]);
      expect(fromHome.has("/admin/your-club")).toBe(true);
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

  it("follows codeSiteAdminFor: Programs and tryouts and Contact page rows only where the website has those pages", () => {
    expect(rowIds(REIMAGINED)).toEqual(expect.arrayContaining(["programs-and-tryouts", "contact-page"]));
    expect(getVisibleAdminMoreRows(REIMAGINED).find((row) => row.id === "programs-and-tryouts")).toEqual({
      id: "programs-and-tryouts",
      label: "Programs and tryouts",
      href: "/admin/programs-and-tryouts",
      iconKey: "tryouts",
    });
    for (const presentationTemplateKey of ["clubhouse@1", null, "future-template@1"] as const) {
      const ids = rowIds({ ...REIMAGINED, presentationTemplateKey });
      expect(ids).not.toContain("programs-and-tryouts");
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
    expect(getReimaginedPageTitle("/admin/your-club")).toBe("Your club");
    // ADMIN-RE-14: Branding is the classic page again; its row moved to /admin/your-club.
    expect(getReimaginedPageTitle("/admin/branding")).toBe("Branding");
    expect(getReimaginedPageTitle("/admin/members")).toBe("Who can sign in");
    expect(getReimaginedPageTitle("/admin/registrations")).toBe("Sign-up forms");
    expect(getReimaginedPageTitle("/admin/sign-ups")).toBe("Registrations");
    expect(getReimaginedPageTitle("/admin/schedule")).toBe("Games");
    expect(getReimaginedPageTitle("/admin/score")).toBe("Enter a score");
    expect(getReimaginedPageTitle("/admin/stats")).toBe("Player numbers");
    expect(getReimaginedPageTitle("/admin/homepage")).toBe("Homepage");
    expect(getReimaginedPageTitle("/admin/about")).toBe("About page");
    expect(getReimaginedPageTitle("/admin/contact")).toBe("Contact page");
    expect(getReimaginedPageTitle("/admin/add-game")).toBe("Add a game");
    expect(getReimaginedPageTitle("/admin")).toBe("Club admin");
    expect(getReimaginedPageTitle("/admin/roster-preview")).toBe("Club admin");
    expect(getReimaginedPageTitle("/admin/nowhere")).toBe("Club admin");
  });

  it("gives a job's address for links between job pages (ADMIN-RE-06)", () => {
    for (const job of ADMIN_HOME_JOBS) {
      expect(getAdminHomeJobHref(job.id)).toBe(ADMIN_ROUTE_MANIFEST.find((route) => route.id === job.routeId)?.href);
    }
    expect(getAdminHomeJobHref("enter-score")).toBe("/admin/score");
  });

  it("keeps the Enter a score page out of a classic club's admin (ADMIN-RE-06)", () => {
    const score = ADMIN_ROUTE_MANIFEST.find((route) => route.id === "score");
    expect(score).toEqual({
      id: "score",
      label: "Enter a score",
      href: "/admin/score",
      iconKey: "schedule",
      groupId: "competition",
      reimaginedOnly: true,
    });
    expect(visibleIds(OWNER_ACCESS)).not.toContain("score");
    expect(visibleIds({ ...OWNER_ACCESS, adminPortal: "classic" })).not.toContain("score");
    expect(navigationIds(REIMAGINED)).not.toContain("score");
    expect(visibleIds(REIMAGINED)).toContain("score");
    expect(visibleIds(ADMIN_ACCESS)).not.toContain("score");
    expect(visibleIds({ ...ADMIN_ACCESS, adminPortal: "reimagined" })).toContain("score");
    expect(visibleIds({ ...REIMAGINED, role: null })).toEqual([]);
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
