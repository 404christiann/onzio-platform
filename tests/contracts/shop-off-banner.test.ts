import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getVisibleAdminNavigation,
  getVisibleAdminRoutes,
  type AdminRouteAccessContext,
} from "@/lib/admin-route-manifest";
import { SHOP_OFF_BANNER } from "@/lib/store-visibility";

// Christian approved (2026-11-05, "Yes, build it"): while a club's Shop is off,
// owners can still open and save the Shop editor under a banner, so they can
// prepare kits before Onzio turns the Shop on. The public site is unchanged.
const source = (path: string) => readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const owner: AdminRouteAccessContext = {
  role: "owner",
  presentationTemplateKey: "academy@1",
  isBillingAuthorized: true,
  canMutateContent: true,
  storeEnabled: false,
};

describe("Shop editor while the club's Shop is off", () => {
  it("keeps Shop in the admin menu and search so owners can reach it", () => {
    expect(getVisibleAdminRoutes(owner).map((route) => route.id)).toContain("shop");
    expect(getVisibleAdminRoutes({ ...owner, role: "admin", isBillingAuthorized: false }).map((route) => route.id)).toContain("shop");
    const website = getVisibleAdminNavigation(owner).find((entry) => entry.type === "group" && entry.id === "website");
    expect(website && website.type === "group" ? website.routes.map((route) => route.id) : []).toContain("shop");
  });

  it("says plainly that visitors can't see the Shop yet", () => {
    expect(SHOP_OFF_BANNER).toBe("Your shop is off. Visitors can't see it yet.");
  });

  it("opens the editor under the banner instead of redirecting away", () => {
    const editor = source("components/admin/shop/ShopPageEditor.tsx");
    expect(editor).not.toContain('router.replace("/admin")');
    expect(editor).toMatch(/storeOff\s*&&[\s\S]{0,400}SHOP_OFF_BANNER/);
  });

  it("leaves every public Shop surface gated on the switch", () => {
    expect(source("app/%5Fclubs/[slug]/shop/page.tsx")).toMatch(/storeEnabled[\s\S]*notFound\(\)/);
    expect(source("components/AcademyHomeShopFeature.tsx")).toContain("if (!storeEnabled && !editorContent) return null;");
    expect(source("components/sites/diverse-city/Nav.tsx")).toMatch(/storeEnabled/);
  });
});
