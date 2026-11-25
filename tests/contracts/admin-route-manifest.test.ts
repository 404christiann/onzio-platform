import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ADMIN_NAVIGATION_MANIFEST,
  ADMIN_ROUTE_MANIFEST,
  getAdminBreadcrumb,
  getAdminGroupForPathname,
  getWebsiteHubSections,
  isWebsiteHubVisible,
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
    // The cinematic@2-only News editor (RC2027-NEWS) is the 19th; the nine other
    // Rose City editors (CLASSIC-RC-FIX) are the 20th to 28th; All website pages
    // (the Website hub, RC-ADMIN-01) is the 29th; Sponsor Insights in the
    // sidebar (TELEMETRY-06) is the 30th.
    expect(ADMIN_ROUTE_MANIFEST).toHaveLength(30);
    expect(new Set(ADMIN_ROUTE_MANIFEST.map((route) => route.id)).size).toBe(
      30,
    );
    expect(new Set(ADMIN_ROUTE_MANIFEST.map((route) => route.href)).size).toBe(
      30,
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
      { type: "link", routeId: "insights" },
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

  it("never repeats a crumb in a Website trail and keys crumbs by position", () => {
    const context = { ...OWNER_ACCESS, presentationTemplateKey: "cinematic@2" };
    expect(getAdminBreadcrumb("/admin/partners", context)).toEqual(["Website", "Partners"]);
    expect(getAdminBreadcrumb("/admin/stadium", context)).toEqual(["Website", "Tickets and stadium", "Robinson Stadium"]);
    const websiteRoutes = getVisibleAdminRoutes(context).filter((route) => route.groupId === "website");
    expect(websiteRoutes.length).toBeGreaterThan(0);
    for (const route of websiteRoutes) {
      const trail = getAdminBreadcrumb(route.href, context);
      expect(trail, route.id).not.toBeNull();
      expect(new Set(trail).size, `${route.id}: ${trail?.join(" / ")}`).toBe(trail?.length);
    }
    // Source guard (no DOM env in this repo): a text-only key duplicates whenever two crumbs share a label.
    for (const file of ["components/AdminShell.tsx", "components/admin/ui/editor-kit/PageFrame.tsx"]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/key=\{crumb(\.label)?\}/);
      expect(source, file).toMatch(/key=\{`\$\{index\}-\$\{crumb/);
    }
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
