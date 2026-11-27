import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CinematicContact from "@/components/cinematic/CinematicContact";
import CinematicShop, { type CinematicShopProps } from "@/components/cinematic/CinematicShop";
import { cinematicContactContentSchema, starterCinematicContactContent } from "@/lib/cinematic-contact-content";
import { EMPTY_CINEMATIC_SHOP_CONTENT } from "@/lib/cinematic-shop-content";
import { shopSectionSchema } from "@/lib/shop-editor/contract";
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
