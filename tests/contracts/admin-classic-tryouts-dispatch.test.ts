import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminPortalProvider } from "@/components/admin/AdminPortalProvider";
import { ClubContextProvider } from "@/components/ClubContextProvider";
import type { ClubContext } from "@/lib/club-context";
import { CLASSIC_ADMIN_PORTAL } from "@/lib/admin-portal";
import TryoutsPageEditor from "@/components/admin/tryouts/TryoutsPageEditor";
import { UnsavedGuardProvider } from "@/components/admin/ui/UnsavedGuardDialog";

const probe = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: {
  from: () => { throw new Error("SSR dispatch must not load browser data"); },
  schema: () => { throw new Error("SSR dispatch must not load browser data"); },
} }));

vi.mock("@/components/admin/tryouts/ClassicTryoutsPageEditor", async () => {
  const { createElement } = await import("react");
  return { default: ({ policy }: { policy: unknown }) => {
    probe.render(policy);
    return createElement("div", { "data-classic-editor-probe": "" }, "Classic editor");
  } };
});
const club: ClubContext = {
  id: "11111111-1111-4111-8111-111111111111", slug: "alpha", name: "Alpha FC",
  primaryDomain: "alpha.localhost", lifecycle: "active", publicAccess: "live", kind: "test",
  stripePriceId: null, tier: "pro", role: "owner", primaryColor: null, secondaryColor: null,
  presentationTemplateKey: "academy@1", storeEnabled: false, publicPageVisibility: {},
};
function render(portal: "classic" | "reimagined", key: ClubContext["presentationTemplateKey"]) {
  const portalProps = { settings: { ...CLASSIC_ADMIN_PORTAL, portal }, isOwner: false };
  const clubProps = { club: { ...club, presentationTemplateKey: key } };
  return renderToStaticMarkup(createElement(AdminPortalProvider,
    portalProps as Parameters<typeof AdminPortalProvider>[0],
    createElement(ClubContextProvider, clubProps as Parameters<typeof ClubContextProvider>[0],
      // Render the way app/admin/(protected)/layout.tsx does: the guard provider wraps the classic shell only, and
      // the reimagined shell has none, so the nonclassic editor must mount without it.
      portal === "classic"
        ? createElement(UnsavedGuardProvider, { navigate: () => undefined, children: createElement(TryoutsPageEditor) })
        : createElement(TryoutsPageEditor))));
}

beforeEach(() => probe.render.mockClear());
describe("Tryouts policy dispatch precedes the classic editor", () => {
  it("passes actual supported capabilities to the classic branch", () => {
    expect(render("classic", "academy@1")).toContain("data-classic-editor-probe");
    expect(probe.render).toHaveBeenCalledOnce();
    expect(probe.render).toHaveBeenCalledWith({ routeVisible: true, showProgramAndHeroFields: false, showHeroImageField: true });
  });
  it("rejects an absent presentation before mounting classic controls", () => {
    expect(render("classic", null)).toContain("does not publish a Tryouts page");
    expect(probe.render).not.toHaveBeenCalled();
  });
  it("rejects an unsupported presentation before mounting classic controls", () => {
    expect(render("classic", "clubhouse@1")).toContain("does not publish a Tryouts page");
    expect(probe.render).not.toHaveBeenCalled();
  });
  it("keeps the supported nonclassic original editor instead of classic controls", () => {
    const html = render("reimagined", "academy@1");
    expect(html).toContain("Save page");
    expect(html).toContain("Loading tryout sections");
    expect(html).not.toContain("data-classic-editor-probe");
    expect(probe.render).not.toHaveBeenCalled();
  });
});
