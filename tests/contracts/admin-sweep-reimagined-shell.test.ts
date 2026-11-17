import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AdminPortalProvider } from "@/components/admin/AdminPortalProvider";
import { ClubContextProvider } from "@/components/ClubContextProvider";
import { UnsavedGuardProvider } from "@/components/admin/ui/UnsavedGuardDialog";
import type { ClubContext } from "@/lib/club-context";
import { CLASSIC_ADMIN_PORTAL } from "@/lib/admin-portal";
import { CombinedStatsPage } from "@/components/admin/stats/CombinedStatsPage";
import AdminProgramsPage from "@/app/admin/(protected)/programs/page";
import TryoutsPageEditor from "@/components/admin/tryouts/TryoutsPageEditor";

// ADMIN-CL-27 review B1. The protected layout mounts the shared unsaved-guard provider in the classic branch only;
// ReimaginedShell has none (it leaves through the top bar's useLeaveGuard). Every screen both shells render must
// therefore mount without that provider on the reimagined portal, exactly as the real layout renders it.
const nav = vi.hoisted(() => ({ view: "match" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined, back: () => undefined, prefetch: () => undefined }),
  useSearchParams: () => new URLSearchParams({ view: nav.view }),
  usePathname: () => "/admin/stats",
}));
vi.mock("@/lib/supabase", () => ({ supabase: {
  from: () => { throw new Error("SSR render must not load browser data"); },
  schema: () => { throw new Error("SSR render must not load browser data"); },
} }));

const club: ClubContext = {
  id: "11111111-1111-4111-8111-111111111111", slug: "alpha", name: "Alpha FC",
  primaryDomain: "alpha.localhost", lifecycle: "active", publicAccess: "live", kind: "test",
  stripePriceId: null, tier: "pro", role: "owner", primaryColor: null, secondaryColor: null,
  presentationTemplateKey: "academy@1", storeEnabled: false,
};

/** Renders like app/admin/(protected)/layout.tsx: the guard provider wraps the classic shell only. */
function renderInShell(portal: "classic" | "reimagined", page: ReactElement) {
  const settings = { ...CLASSIC_ADMIN_PORTAL, portal } as Parameters<typeof AdminPortalProvider>[0]["settings"];
  const body = portal === "classic" ? createElement(UnsavedGuardProvider, { navigate: () => undefined, children: page }) : page;
  return renderToStaticMarkup(createElement(AdminPortalProvider, { settings, isOwner: false } as Parameters<typeof AdminPortalProvider>[0],
    createElement(ClubContextProvider, { club } as Parameters<typeof ClubContextProvider>[0], body)));
}

const screens: [string, () => ReactElement][] = [
  ["Stats (match view)", () => { nav.view = "match"; return createElement(CombinedStatsPage); }],
  ["Stats (season view)", () => { nav.view = "season"; return createElement(CombinedStatsPage); }],
  ["Programs", () => createElement(AdminProgramsPage)],
  ["Tryouts", () => createElement(TryoutsPageEditor)],
];

describe("shared admin screens mount in both shells without the classic guard provider on the reimagined portal", () => {
  for (const [name, page] of screens) {
    it(`${name} renders in the reimagined shell`, () => {
      expect(() => renderInShell("reimagined", page())).not.toThrow();
    });
    it(`${name} renders in the classic shell`, () => {
      expect(() => renderInShell("classic", page())).not.toThrow();
    });
  }

  it("keeps the reimagined stats page on its own save bar and switch dialog, and the classic page on the header Save button", () => {
    nav.view = "match";
    const reimagined = renderInShell("reimagined", createElement(CombinedStatsPage));
    expect(reimagined).toContain("data-stats-actions");
    expect(reimagined).toContain("Save match stats");
    expect(reimagined).not.toContain("data-admin-save-button");
    expect(reimagined).not.toContain("All changes saved");
    const classic = renderInShell("classic", createElement(CombinedStatsPage));
    expect(classic).toContain("data-admin-save-button");
    expect(classic).not.toContain("data-stats-actions");
  });
});
