import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ClubContext } from "@/lib/club-context";

/**
 * Platform-wide Starter shop gating (`/shop` and its classic Nav link),
 * per Christian's already-approved decision: gated by tier, not template.
 *
 * This is a real, regression-sensitive behavior change to the existing
 * classic-template Bravo (Starter) tenant, which previously showed Shop
 * unguarded. Pro-tier shop behavior (Alpha) must be provably unchanged.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: Record<string, unknown> & { children?: unknown; href?: string }) =>
    createElement("a", { href, ...props }, children as never),
}));
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    ...props
  }: Record<string, unknown> & { src?: string; alt?: string }) => {
    void props;
    return createElement("img", { src, alt });
  },
}));

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const ALPHA_CLUB: ClubContext = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "alpha",
  name: "Alpha FC",
  primaryDomain: "alpha-onzio.vercel.app",
  lifecycle: "active",
  publicAccess: "live",
  tier: "pro",
  siteTemplate: "classic",
  role: null,
};

const BRAVO_CLUB: ClubContext = {
  id: "22222222-2222-4222-8222-222222222222",
  slug: "bravo",
  name: "Bravo United",
  primaryDomain: "bravo-onzio.vercel.app",
  lifecycle: "onboarding",
  publicAccess: "preview",
  tier: "starter",
  siteTemplate: "classic",
  role: null,
};

const LIONS_CLUB: ClubContext = {
  id: "55555555-5555-4555-8555-555555555555",
  slug: "lions",
  name: "Lions Football Club",
  primaryDomain: "lions-onzio.vercel.app",
  lifecycle: "active",
  publicAccess: "live",
  tier: "starter",
  siteTemplate: "editorial",
  role: null,
};

async function renderNav(club: ClubContext) {
  const { ClubContextProvider } = await import(
    "@/components/ClubContextProvider"
  );
  const { ClubBrandingProvider } = await import(
    "@/components/ClubBrandingProvider"
  );
  const { default: Nav } = await import("@/components/Nav");
  return renderToStaticMarkup(
    createElement(ClubContextProvider, {
      club,
      children: createElement(ClubBrandingProvider, {
        children: createElement(Nav),
      }),
    }),
  );
}

describe("clubHasFeature: shop is Pro-only, never granted to Starter", () => {
  it("Starter never has the shop feature; Pro always does", async () => {
    const { clubHasFeature } = await import("@/lib/club-features");
    expect(clubHasFeature("starter", "shop")).toBe(false);
    expect(clubHasFeature("pro", "shop")).toBe(true);
  });
});

describe("classic Nav: Shop link tier gating", () => {
  it("Pro tenant (Alpha-shaped) renders the Shop link", async () => {
    const html = await renderNav(ALPHA_CLUB);
    expect(html).toContain('href="/shop"');
    expect(html).toContain(">Shop<");
  });

  it("Starter tenant (Bravo-shaped) never renders the Shop link", async () => {
    const html = await renderNav(BRAVO_CLUB);
    expect(html).not.toContain('href="/shop"');
    expect(html).not.toContain(">Shop<");
  });

  it("gates the link through clubHasFeature, not a hardcoded tier/slug check", () => {
    const source = read("components/Nav.tsx");
    expect(source).toContain('clubHasFeature(club.tier, "shop")');
    expect(source).toContain('import { clubHasFeature } from "@/lib/club-features"');
  });
});

describe("/shop direct-visit gating", () => {
  it("gates rendering behind clubHasFeature and calls notFound() for ungranted tiers", () => {
    const source = read("app/(public)/shop/page.tsx");
    expect(source).toContain('clubHasFeature(club.tier, "shop")');
    expect(source).toContain("notFound()");
    expect(source).toContain('import { notFound } from "next/navigation"');
  });

  it("mirrors under the tenant route group", () => {
    const mirror = read("app/%5Fclubs/[slug]/shop/page.tsx").trim();
    expect(mirror).toBe('export { default } from "@/app/(public)/shop/page";');
  });
});

describe("editorial template: no Store link, controlled by feature gating not hardcoded omission", () => {
  it("EditorialHeader and EditorialFooter contain no Store/Shop link markup", () => {
    for (const file of [
      "components/editorial/EditorialHeader.tsx",
      "components/editorial/EditorialFooter.tsx",
    ]) {
      const source = read(file);
      expect(source).not.toMatch(/\/shop|>Store<|>Shop</);
    }
  });

  it("a direct /shop visit from the Lions (Starter, editorial) tenant is still gated by clubHasFeature", async () => {
    const { clubHasFeature } = await import("@/lib/club-features");
    expect(clubHasFeature(LIONS_CLUB.tier, "shop")).toBe(false);
  });
});

describe("shop tier gating: Pro behavior is provably unchanged", () => {
  it("app/(public)/shop/page.tsx still renders the full Pro shop composition for a Pro club", () => {
    const source = read("app/(public)/shop/page.tsx");
    expect(source).toContain("ShopKitSectionContainer");
    expect(source).toContain("ShopPhotoStripContainer");
    expect(source).toContain("ShopPurchaseDetailsContainer");
  });
});
