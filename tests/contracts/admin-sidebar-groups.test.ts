import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_NAVIGATION_MANIFEST,
  ADMIN_ROUTE_MANIFEST,
  getVisibleAdminNavigation,
  type AdminRouteAccessContext,
} from "@/lib/admin-route-manifest";

const source = readFileSync(
  resolve(process.cwd(), "components/AdminShell.tsx"),
  "utf8",
);

const OWNER_ACCESS: AdminRouteAccessContext = {
  role: "owner",
  presentationTemplateKey: "academy@1",
  isBillingAuthorized: true,
  canMutateContent: true,
};

describe("admin sidebar grouped navigation", () => {
  it("declares exactly the three approved collapsible groups", () => {
    expect(
      ADMIN_NAVIGATION_MANIFEST.filter((entry) => entry.type === "group").map(
        (entry) => entry.label,
      ),
    ).toEqual(["Website", "Competition", "Club Settings"]);
  });

  it("keeps exact child membership and ordering per group", () => {
    const groups = ADMIN_NAVIGATION_MANIFEST.filter(
      (entry) => entry.type === "group",
    );
    expect(groups.map((entry) => entry.routeIds)).toEqual([
      ["homepage", "programs", "tryouts", "shop", "about", "sponsors", "contact"],
      ["seasons", "roster", "schedule", "match-stats", "season-stats", "standings"],
      ["branding", "team-access"],
    ]);
  });

  it("orders Dashboard, Website, Competition, Registrations, Analytics, Club Settings, Payments", () => {
    const labelsByRouteId = new Map(
      ADMIN_ROUTE_MANIFEST.map((route) => [route.id, route.label]),
    );
    expect(
      ADMIN_NAVIGATION_MANIFEST.map((entry) =>
        entry.type === "group"
          ? entry.label
          : labelsByRouteId.get(entry.routeId),
      ),
    ).toEqual([
      "Dashboard",
      "Website",
      "Competition",
      "Registrations",
      "Analytics",
      "Club Settings",
      "Payments",
    ]);
  });

  it("keeps Payments a standalone link outside every group", () => {
    expect(ADMIN_NAVIGATION_MANIFEST.at(-1)).toEqual({
      type: "link",
      routeId: "payments",
    });
    expect(
      ADMIN_NAVIGATION_MANIFEST.filter((entry) => entry.type === "group").every(
        (entry) => !Array.from<string>(entry.routeIds).includes("payments"),
      ),
    ).toBe(true);
  });

  it("preserves the authorization and entitlement filters", () => {
    expect(source).toContain("getVisibleAdminNavigation(accessContext)");
    expect(source).toContain("getVisibleAdminRoutes(accessContext)");
    expect(source).toContain("isBillingAuthorized");
    expect(source).toContain("club.presentationTemplateKey");
  });

  it("hides a group whose visible children were all filtered out", () => {
    expect(
      getVisibleAdminNavigation({ ...OWNER_ACCESS, role: null }),
    ).toEqual([]);
  });

  it("renders real per-destination emblems, never bullets or dots", () => {
    expect(source).toContain("ROUTE_ICONS[route.iconKey]");
    expect(source).toContain("GROUP_ICONS[entry.iconKey]");
    expect(source).not.toContain("list-disc");
    expect(source).not.toContain("•");
  });

  it("uses the approved neutral active fill with an indigo icon", () => {
    expect(source).toContain('active ? "text-primary"');
    expect(source).toContain("data-[active=true]:bg-sidebar-accent");
    expect(source).toContain("data-[active=true]:text-sidebar-accent-foreground");
    expect(source).not.toContain("border-l-destructive");
    expect(source).not.toContain("bg-destructive/15");
  });

  it("uses accessible native-button accordion headers", () => {
    expect(source).toContain('render={<button type="button" />}');
    expect(source).toContain("aria-expanded={isOpen}");
    expect(source).toContain("aria-controls={panelId}");
    expect(source).toContain('role="region"');
    expect(source).toContain("aria-labelledby={headerId}");
    expect(source).toContain("hidden={!isOpen}");
    expect(source).toContain("`admin-nav-group-${entry.id}`");
  });

  it("allows only one open group and resolves it from the active route", () => {
    expect(source.match(/setOpenGroupKey|openGroupKey/g)?.length).toBeGreaterThan(2);
    expect(source).toContain("previous === entry.id ? null : entry.id");
    expect(source).toContain("getAdminGroupForPathname(pathname, accessContext)");
    expect(source).toContain("setOpenGroupKey(activeGroup)");
  });

  it("adds no desktop sidebar-collapse control", () => {
    expect(source).not.toContain("SidebarTrigger");
    expect(source).not.toContain("PanelLeftIcon");
  });

  it("keeps the mobile drawer contract intact", () => {
    expect(source).toContain("closeSidebar(false)");
    expect(source).toContain('aria-controls="admin-sidebar"');
    expect(source).toContain('document.body.style.overflow = "hidden"');
    expect(source).toContain("min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y");
    expect(source).toContain("menuTriggerRef.current?.focus()");
  });
});
