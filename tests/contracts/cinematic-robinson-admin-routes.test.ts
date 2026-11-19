import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/admin/stadium/RobinsonStadiumEditor", () => ({ default: function RobinsonStadiumEditor() { return null; } }));
vi.mock("@/components/admin/stadium/StadiumEditor", () => ({ default: function StadiumEditor() { return null; } }));
import RobinsonStadiumEditor from "@/components/admin/stadium/RobinsonStadiumEditor";
import StadiumEditor from "@/components/admin/stadium/StadiumEditor";
import StadiumAdminPage from "@/app/admin/(protected)/stadium/page";
import FoothillTransitAdminPage from "@/app/admin/(protected)/foothill-transit/page";
import { ADMIN_ROUTE_MANIFEST, getWebsiteHubSections } from "@/lib/admin-route-manifest";

const CINEMATIC_OWNER = { role: "owner", presentationTemplateKey: "cinematic@2", isBillingAuthorized: true, canMutateContent: true, storeEnabled: true } as const;
const hubRouteIds = (presentationTemplateKey: string) =>
  getWebsiteHubSections({ ...CINEMATIC_OWNER, presentationTemplateKey }).flatMap((section) => section.routes.map((route) => route.id));
/** The editor is a cinematicOnly Website route: visible in the Hub for cinematic@2, and not for another design. */
function expectHubRoute(id: string, href: string) {
  const route = ADMIN_ROUTE_MANIFEST.find((candidate) => candidate.id === id);
  expect(route, id).toMatchObject({ href, groupId: "website", cinematicOnly: true });
  expect(hubRouteIds("cinematic@2")).toContain(id);
  expect(hubRouteIds("academy@1")).not.toContain(id);
}

describe("Robinson Stadium and Foothill Transit admin routes", () => {
  it("opens the Robinson editor at /admin/stadium and the Bus Route editor at /admin/foothill-transit", () => {
    expect(StadiumAdminPage().type).toBe(RobinsonStadiumEditor);
    expect(FoothillTransitAdminPage().type).toBe(StadiumEditor);
  });

  it("lists the Robinson Stadium page and the other cinematic@2 editors in the Website Hub", () => {
    expectHubRoute("stadium", "/admin/stadium");
    expectHubRoute("foothill-transit", "/admin/foothill-transit");
    expectHubRoute("chick-fil-a", "/admin/chick-fil-a");
    expectHubRoute("policies", "/admin/policies");
    expectHubRoute("partners", "/admin/partners");
    expectHubRoute("injury-report", "/admin/injury-report");
    expectHubRoute("season-membership", "/admin/season-membership");
    expectHubRoute("know-before-you-go", "/admin/know-before-you-go");
  });
});
