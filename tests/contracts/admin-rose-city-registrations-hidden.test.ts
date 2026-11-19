import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ club: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "club.localhost" }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/supabase-server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/auth-session", () => ({ requireFreshClubSession: async () => ({ userId: "user-1" }) }));
vi.mock("@/lib/club-context", () => ({ getClubContext: mocks.club }));

import RegistrationsLayout from "@/app/admin/(protected)/registrations/layout";
import SignUpsPage from "@/app/admin/(protected)/sign-ups/page";
import {
  getVisibleAdminHomeJobs,
  getVisibleAdminMoreRows,
  getVisibleAdminNavigation,
  getVisibleAdminQuickActions,
  getVisibleAdminRoutes,
  getWebsiteHubSections,
  isAdminRouteHiddenForClub,
  type AdminRouteAccessContext,
} from "@/lib/admin-route-manifest";
import { getAdminSearchItems } from "@/lib/admin-search";
import { getVisibleAdminTabs } from "@/lib/admin-tabs";

// Rose City outsources tryouts, so its admin has no Registrations. The hide is
// keyed on the club's slug (not on cinematic@2), and Diverse City is untouched.

const BASE: AdminRouteAccessContext = {
  role: "owner",
  presentationTemplateKey: "cinematic@2",
  isBillingAuthorized: true,
  canMutateContent: true,
  storeEnabled: true,
};
const ROSE_CITY: AdminRouteAccessContext = { ...BASE, clubSlug: "rose-city" };
const DIVERSE_CITY: AdminRouteAccessContext = { ...BASE, presentationTemplateKey: "academy@1", clubSlug: "diverse-city" };
// A future cinematic@2 club: same design as Rose City, different club.
const FUTURE_CINEMATIC: AdminRouteAccessContext = { ...BASE, clubSlug: "future-cinematic-fc" };

const HIDDEN = ["registrations", "sign-ups"];
const reimagined = (context: AdminRouteAccessContext): AdminRouteAccessContext => ({
  ...context,
  adminPortal: "reimagined",
  hasLiveSignUps: true,
});

function navIds(context: AdminRouteAccessContext) {
  return getVisibleAdminNavigation(context).flatMap((entry) =>
    entry.type === "link" ? [entry.route.id] : [...entry.routes, ...(entry.overflowRoutes ?? [])].map((route) => route.id),
  );
}

describe("Rose City admin hides Registrations (RC-ADMIN-4-0b)", () => {
  it("keys the hide on the club slug, nothing else", () => {
    expect(isAdminRouteHiddenForClub("rose-city", "registrations")).toBe(true);
    expect(isAdminRouteHiddenForClub("rose-city", "sign-ups")).toBe(true);
    expect(isAdminRouteHiddenForClub("rose-city", "roster")).toBe(false);
    expect(isAdminRouteHiddenForClub("diverse-city", "registrations")).toBe(false);
    expect(isAdminRouteHiddenForClub("future-cinematic-fc", "registrations")).toBe(false);
    expect(isAdminRouteHiddenForClub(null, "registrations")).toBe(false);
    expect(isAdminRouteHiddenForClub(undefined, "registrations")).toBe(false);
    // Object.prototype keys are not clubs.
    expect(isAdminRouteHiddenForClub("constructor", "registrations")).toBe(false);
    expect(isAdminRouteHiddenForClub("__proto__", "registrations")).toBe(false);
  });

  it.each([
    ["owner", ROSE_CITY],
    ["admin", { ...ROSE_CITY, role: "admin" as const, isBillingAuthorized: false }],
    ["owner on the reimagined admin", reimagined(ROSE_CITY)],
  ])("removes Registrations from the routes, sidebar, hub and quick actions (%s)", (_name, context) => {
    const ids = getVisibleAdminRoutes(context).map((route) => route.id);
    for (const id of HIDDEN) expect(ids).not.toContain(id);
    for (const id of HIDDEN) expect(navIds(context)).not.toContain(id);
    expect(getVisibleAdminQuickActions(context).map((action) => action.id)).not.toContain("registrations");
    // Registrations is not a Website row, so the hub is unchanged.
    expect(getWebsiteHubSections(context).flatMap((section) => section.routes.map((route) => route.id))).not.toContain("registrations");
    // The rest of the admin is still there.
    expect(ids).toEqual(expect.arrayContaining(["dashboard", "analytics", "roster", "schedule", "branding"]));
    expect(getVisibleAdminQuickActions(context).map((action) => action.id)).toEqual(expect.arrayContaining(["manage-roster", "manage-schedule"]));
  });

  it("removes Registrations from search, the home jobs, the More list and the tabs on the reimagined admin", () => {
    const context = reimagined(ROSE_CITY);
    expect(getVisibleAdminHomeJobs(context).map((job) => job.id)).not.toContain("see-registrations");
    expect(getVisibleAdminMoreRows(context).map((row) => row.href)).not.toEqual(expect.arrayContaining(["/admin/registrations"]));
    expect(getVisibleAdminMoreRows(context).map((row) => row.id)).not.toContain("sign-up-forms");
    const search = getAdminSearchItems(context);
    expect(search.map((item) => item.href)).not.toContain("/admin/registrations");
    expect(search.map((item) => item.href)).not.toContain("/admin/sign-ups");
    expect(search.map((item) => item.label.toLowerCase())).not.toContain("registrations");
    expect(getVisibleAdminTabs(context).length).toBeGreaterThan(0);
  });

  it("keeps Registrations for Diverse City exactly as before", () => {
    for (const context of [DIVERSE_CITY, { ...DIVERSE_CITY, role: "admin" as const, isBillingAuthorized: false }]) {
      expect(getVisibleAdminRoutes(context).map((route) => route.id)).toContain("registrations");
      expect(navIds(context)).toContain("registrations");
      expect(getVisibleAdminQuickActions(context).map((action) => action.id)).toContain("registrations");
    }
    const home = reimagined(DIVERSE_CITY);
    expect(getVisibleAdminHomeJobs(home).map((job) => job.id)).toContain("see-registrations");
    expect(getVisibleAdminMoreRows(home).map((row) => row.id)).toContain("sign-up-forms");
    expect(getAdminSearchItems(home).map((item) => item.href)).toEqual(expect.arrayContaining(["/admin/registrations", "/admin/sign-ups"]));
  });

  it("does not hide anything on another cinematic@2 club, or when no club is named", () => {
    for (const context of [FUTURE_CINEMATIC, BASE]) {
      expect(getVisibleAdminRoutes(context).map((route) => route.id)).toContain("registrations");
      expect(navIds(context)).toContain("registrations");
      expect(getVisibleAdminQuickActions(context).map((action) => action.id)).toContain("registrations");
    }
  });

  it("makes the route list the same as before for Rose City except for the two hidden rows", () => {
    const without = (context: AdminRouteAccessContext) => getVisibleAdminRoutes(context).map((route) => route.id).filter((id) => !HIDDEN.includes(id));
    expect(without(ROSE_CITY)).toEqual(without(FUTURE_CINEMATIC));
    expect(without(reimagined(ROSE_CITY))).toEqual(without(reimagined(FUTURE_CINEMATIC)));
  });
});

describe("/admin/registrations route (RC-ADMIN-4-0b)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers 404 for Rose City (the layout covers the page and any page under it)", async () => {
    mocks.club.mockResolvedValue({ id: "rc", slug: "rose-city", presentationTemplateKey: "cinematic@2" });
    await expect(RegistrationsLayout({ children: createElement("p", null, "Registrations editor") })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders the page as before for Diverse City and for another cinematic club", async () => {
    for (const slug of ["diverse-city", "future-cinematic-fc"]) {
      mocks.club.mockResolvedValue({ id: slug, slug, presentationTemplateKey: slug === "diverse-city" ? "academy@1" : "cinematic@2" });
      const tree = await RegistrationsLayout({ children: createElement("p", null, "Registrations editor") });
      expect(renderToStaticMarkup(tree)).toBe("<p>Registrations editor</p>");
    }
  });

  it("answers 404 for Rose City on the reimagined sign-ups list too", async () => {
    mocks.club.mockResolvedValue({ id: "rc", slug: "rose-city", presentationTemplateKey: "cinematic@2" });
    await expect(SignUpsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
