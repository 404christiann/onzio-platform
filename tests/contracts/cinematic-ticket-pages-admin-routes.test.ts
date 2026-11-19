import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/admin/ticket-pages/SeasonMembershipEditor", () => ({ default: function SeasonMembershipEditor() { return null; } }));
vi.mock("@/components/admin/ticket-pages/KnowBeforeYouGoEditor", () => ({ default: function KnowBeforeYouGoEditor() { return null; } }));
import SeasonMembershipEditor from "@/components/admin/ticket-pages/SeasonMembershipEditor";
import KnowBeforeYouGoEditor from "@/components/admin/ticket-pages/KnowBeforeYouGoEditor";
import SeasonMembershipAdminPage from "@/app/admin/(protected)/season-membership/page";
import KnowBeforeYouGoAdminPage from "@/app/admin/(protected)/know-before-you-go/page";
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

describe("Season Ticket Membership and Know Before You Go admin routes", () => {
  it("open each page's own editor", () => {
    expect(SeasonMembershipAdminPage().type).toBe(SeasonMembershipEditor);
    expect(KnowBeforeYouGoAdminPage().type).toBe(KnowBeforeYouGoEditor);
  });

  it("are reachable from the Website Hub for cinematic@2 owners", () => {
    expectHubRoute("season-membership", "/admin/season-membership");
    expectHubRoute("know-before-you-go", "/admin/know-before-you-go");
  });
});
