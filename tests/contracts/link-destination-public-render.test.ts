import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
import CinematicContact from "@/components/cinematic/CinematicContact";
import CinematicShop, { type CinematicShopProps } from "@/components/cinematic/CinematicShop";
import { cinematicContactContentSchema, starterCinematicContactContent } from "@/lib/cinematic-contact-content";
import { EMPTY_CINEMATIC_SHOP_CONTENT } from "@/lib/cinematic-shop-content";
import { shopSectionSchema } from "@/lib/shop-editor/contract";
import { fetchCinematicContactContent } from "@/lib/cinematic-contact-query";
import { fetchCinematicShopContent, fetchCinematicShopPurchase } from "@/lib/cinematic-shop-query";
import { fetchCinematicPartners } from "@/lib/cinematic-partners-query";
import { starterCinematicPartnersContent } from "@/lib/cinematic-partners-content";
import { publicKit } from "@/lib/shop-editor/model";

/** What staff type is what the public site links to, normalized once at save. */
describe("a saved bare email renders as a mailto: link on the public site", () => {
  it("Contact: info@club.com saves as mailto: and the Information button opens it", () => {
    const content = cinematicContactContentSchema.parse({ ...starterCinematicContactContent(), informationHref: " info@club.com " });
    expect(content.informationHref).toBe("mailto:info@club.com");
    const html = renderToStaticMarkup(createElement(CinematicContact, { content }));
    expect(html).toContain('href="mailto:info@club.com"');
    expect(html).not.toContain("Link pending");
  });

  it("Rose City Shop: an order-by-email buy link is a working button that opens in place", () => {
    const cta_link = shopSectionSchema.shape.cta_link.parse("orders@club.com?subject=Jersey%20Order");
    expect(cta_link).toBe("mailto:orders@club.com?subject=Jersey%20Order");
    const section = { eyebrow: "Kit", title: "Home", description: "", bullet_points: [], store_note: "", cta_label: "Order by email", cta_link };
    const kit = (variant: "home" | "away" | "third") => publicKit(section, [{ rowId: variant, assetId: null, url: `/${variant}.png`, order: 0 }], "shop", variant);
    const props: CinematicShopProps = {
      kits: { home: kit("home"), away: kit("away"), third: kit("third") },
      photoRows: { home: [], away: [], third: [] },
      purchase: null,
      presentation: { ...EMPTY_CINEMATIC_SHOP_CONTENT, editions: [{ label: "Home", price: "$1", line: "", link: "" }] },
      sponsors: [], treatments: {},
    };
    const html = renderToStaticMarkup(createElement(CinematicShop, props));
    const button = html.match(/<a [^>]*class="shop-buy"[^>]*>/)?.[0] ?? "";
    expect(button).toContain('href="mailto:orders@club.com?subject=Jersey%20Order"');
    expect(button).not.toContain('target="_blank"');
    expect(html).not.toContain("shop-buy-unavailable");
  });

  it("Rose City Shop: a stored value that is not a link still renders as unavailable, never as an href", () => {
    const section = { eyebrow: "Kit", title: "Home", description: "", bullet_points: [], store_note: "", cta_label: "Buy", cta_link: "javascript:alert(1)" };
    const kit = (variant: "home" | "away" | "third") => publicKit(section, [{ rowId: variant, assetId: null, url: `/${variant}.png`, order: 0 }], "shop", variant);
    const html = renderToStaticMarkup(createElement(CinematicShop, {
      kits: { home: kit("home"), away: kit("away"), third: kit("third") }, photoRows: { home: [], away: [], third: [] }, purchase: null,
      presentation: { ...EMPTY_CINEMATIC_SHOP_CONTENT, editions: [{ label: "Home", price: "$1", line: "", link: "" }] }, sponsors: [], treatments: {},
    }));
    expect(html).not.toContain("javascript:");
    expect(html).toContain("shop-buy-unavailable");
  });
});

/** A stored link the current rule refuses (saved under an older rule) blanks that one button instead of failing the page. */
describe("public pages load when a stored link no longer passes the rule", () => {
  const ODD = "tel:+15551234567";
  const fakeClient = (rows: Record<string, unknown>) => {
    const query = (table: string) => {
      const result = { data: rows[table] ?? null, error: null };
      const chain: Record<string, unknown> = {
        select: () => chain, eq: () => chain, in: () => chain, is: () => chain, order: () => chain,
        maybeSingle: async () => result, then: (resolve: (value: unknown) => unknown) => resolve(result),
      };
      return chain;
    };
    return { from: query } as never;
  };

  it("Contact: the Information button goes inactive", async () => {
    const content = { ...starterCinematicContactContent(), informationHref: ODD };
    const loaded = await fetchCinematicContactContent("club", fakeClient({ cinematic_contact_content: { content } }));
    expect(loaded?.informationHref).toBe("");
    expect(loaded?.title).toBe(content.title);
  });

  it("Shop: the purchase button and a jersey link go inactive, and good links stay", async () => {
    const purchase = { heading: "H", cards: [], cta_eyebrow: "", cta_text: "", cta_label: "Buy", cta_link: ODD, updated_at: "2026-01-01" };
    expect((await fetchCinematicShopPurchase("club", fakeClient({ shop_purchase_details: purchase })))?.cta_link).toBe("");
    const content = { ...EMPTY_CINEMATIC_SHOP_CONTENT, editions: [
      { label: "Home", price: "$1", line: "", link: ODD },
      { label: "Away", price: "$1", line: "", link: "orders@club.com" },
    ] };
    const { mapUrl: _m, mapWidth: _w, mapHeight: _h, ...stored } = content as typeof content & { mapUrl?: string; mapWidth?: number; mapHeight?: number };
    const loaded = await fetchCinematicShopContent("club", fakeClient({ cinematic_shop_content: { content: stored, map_media_asset_id: null } }));
    expect(loaded.editions.map(edition => edition.link)).toEqual(["", "mailto:orders@club.com"]);
  });

  it("Partners: the opportunities button goes inactive", async () => {
    const { pages } = starterCinematicPartnersContent();
    const content = { pages: { ...pages, opportunities: { ...pages.opportunities, ctaHref: ODD } } };
    const loaded = await fetchCinematicPartners("club", fakeClient({ cinematic_partners_content: { content }, cinematic_partners: [] }));
    expect(loaded?.content.pages.opportunities.ctaHref).toBe("");
  });
});
