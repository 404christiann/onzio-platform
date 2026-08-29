import { describe, expect, it } from "vitest";
import {
  ADMIN_NAVIGATION_MANIFEST,
  ADMIN_ROUTE_MANIFEST,
  getAdminGroupForPathname,
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
    expect(ADMIN_ROUTE_MANIFEST).toHaveLength(19);
    expect(new Set(ADMIN_ROUTE_MANIFEST.map((route) => route.id)).size).toBe(
      19,
    );
    expect(new Set(ADMIN_ROUTE_MANIFEST.map((route) => route.href)).size).toBe(
      19,
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
          "season-stats",
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

  it("hides exactly four routes for editorial and keeps Registrations visible", () => {
    const context = {
      ...OWNER_ACCESS,
      presentationTemplateKey: "editorial@1",
    };
    const editorialIds = visibleIds(context);
    const hiddenIds = ADMIN_ROUTE_MANIFEST.map((route) => route.id).filter(
      (id) => !editorialIds.includes(id),
    );

    expect(hiddenIds).toEqual([
      "programs",
      "match-stats",
      "season-stats",
      "analytics",
    ]);
    expect(editorialIds).toContain("registrations");
    expect(editorialIds).toContain("about");
    expect(navigationIds(context)).toEqual(editorialIds);
  });

  it.each([
    ["owner", "academy@1"],
    ["admin", "academy@1"],
    ["owner", "clubhouse@1"],
    ["admin", "editorial@1"],
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
      presentationTemplateKey: "editorial@1",
    });
    expect(visible.every((route) => route.searchKeywords.length > 0)).toBe(
      true,
    );
    expect(visible.map((route) => route.id)).not.toContain("programs");
    expect(visible.map((route) => route.id)).not.toContain("team-access");
    expect(visible.map((route) => route.id)).not.toContain("payments");

    const visibleSearchIndex = JSON.stringify(visible);
    expect(visibleSearchIndex).not.toContain("offerings");
    expect(visibleSearchIndex).not.toContain("game statistics");
    expect(visibleSearchIndex).not.toContain("player statistics");
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
      getAdminGroupForPathname("/admin/stats", {
        ...OWNER_ACCESS,
        presentationTemplateKey: "editorial@1",
      }),
    ).toBeNull();
    expect(
      getAdminGroupForPathname("/admin/roster-preview", OWNER_ACCESS),
    ).toBeNull();
  });
});
