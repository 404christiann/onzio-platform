import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CINEMATIC_ARTWORK_SLOTS, defaultCinematicHomepageContent, queuedArtwork, withoutHiddenHomepageSections, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import { EMPTY_CINEMATIC_SHOP_CONTENT } from "@/lib/cinematic-shop-content";

// PR #248 review: Medium (a replaced header logo kept "Foothill Transit" and showed the Foothill mark) and Low (hidden
// homepage sections and jerseys still reached visitors' browsers).

const fixture = vi.hoisted(() => ({ content: null as CinematicHomepageContent | null }));
vi.mock("next/navigation", () => ({ usePathname: () => "/_clubs/rose-city/schedule" }));
vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ id: "00000000-0000-4000-8000-0000000000aa", slug: "rose-city", name: "Rose City FC", storeEnabled: true }) }));
vi.mock("@/components/ClubBrandingProvider", () => ({ useClubBranding: () => ({ clubLogoUrl: "/test-crest.png" }) }));
vi.mock("@/components/cinematic/CinematicContent", () => ({ useCinematicContent: () => ({ content: fixture.content }) }));
vi.mock("@/lib/queries", () => ({ fetchShopKitVariants: vi.fn(), fetchShopCarouselPhotos: vi.fn(), fetchSiteSponsorLogos: vi.fn() }));
vi.mock("@/lib/cinematic-shop-query", () => ({ fetchCinematicShopContent: vi.fn(), fetchCinematicShopPurchase: vi.fn() }));
import CinematicNav from "@/components/cinematic/CinematicNav";
import { PublicPageVisibilityProvider } from "@/components/PublicPageVisibilityProvider";
import { withoutHiddenJerseys } from "@/lib/cinematic-shop-public";

beforeEach(() => { fixture.content = defaultCinematicHomepageContent(); });

describe("replacing the Rose City header sponsor logo (Medium)", () => {
  it("clears the description when a new header logo file is chosen, and only for the header slot", () => {
    expect(queuedArtwork("headerPartner", "file-1")).toEqual({ upload: "queued", localFileKey: "file-1", alt: "" });
    for (const slot of CINEMATIC_ARTWORK_SLOTS.filter(slot => slot !== "headerPartner")) {
      expect(queuedArtwork(slot, "file-2")).toEqual({ upload: "queued", localFileKey: "file-2" });
    }
  });

  it("the useHomepageEditor replace path uses it", () => {
    expect(readFileSync("lib/homepage-editor/useHomepageEditor.ts", "utf8")).toContain("setArtwork(slot, queuedArtwork(slot, id));");
  });

  it("shows the replacement image, not the Foothill Transit mark, even while the Foothill page is hidden", () => {
    const draft = defaultCinematicHomepageContent();
    draft.presentation.headerPartner = { assetId: "00000000-0000-4000-8000-000000000001", url: "https://cdn.example.test/foothill.png", alt: "Foothill Transit" };
    Object.assign(draft.presentation.headerPartner, queuedArtwork("headerPartner", "file-1"), { assetId: "00000000-0000-4000-8000-000000000003", url: "https://cdn.example.test/new-sponsor.png" });
    fixture.content = draft;
    for (const visibility of [{}, { "foothill-transit": false }]) {
      const html = renderToStaticMarkup(createElement(PublicPageVisibilityProvider, { visibility, children: createElement(CinematicNav, {}) }));
      expect(html).toContain('src="https://cdn.example.test/new-sponsor.png"');
      expect(html).not.toContain("foothill-going-good-places");
      expect(html).not.toContain("data-transparent-mark");
    }
  });
});

describe("hidden homepage sections never reach visitors (Low)", () => {
  const content = () => {
    const value = defaultCinematicHomepageContent();
    value.raffle = { assetId: "00000000-0000-4000-8000-000000000009", url: "/raffle.png", alt: "Raffle prizes" };
    value.match.heading = "Secret opponent";
    value.prices = { heading: "Ticket prices", rows: [{ id: "adult", label: "Adult", price: "$12", description: "General admission", note: "", accent: "none" }], footnote: "Unreleased price" };
    return value;
  };

  it("strips a hidden section's words and image", () => {
    const value = content();
    value.raffle.visible = false; value.match.visible = false; value.prices.visible = false;
    const sent = withoutHiddenHomepageSections(value);
    expect(sent.raffle).toEqual({ assetId: null, url: null, alt: "", visible: false });
    expect(sent.prices).toEqual({ heading: "", rows: [], footnote: "", visible: false });
    expect(sent.match).toMatchObject({ heading: "", buttonLabel: "", emptyMessage: "", visible: false });
    expect(JSON.stringify(sent)).not.toMatch(/Secret opponent|Unreleased price|General admission|raffle\.png|Raffle prizes/);
  });

  it("leaves shown sections untouched", () => {
    const value = content();
    expect(withoutHiddenHomepageSections(value)).toEqual(value);
  });

  it("is applied to the server-rendered content and the browser fallback", () => {
    expect(readFileSync("app/%5Fclubs/[slug]/layout.tsx", "utf8")).toContain(".then(withoutHiddenHomepageSections)");
    expect(readFileSync("components/cinematic/CinematicContent.tsx", "utf8")).toContain("content: withoutHiddenHomepageSections(content)");
  });
});

describe("hidden jerseys never reach visitors (Low)", () => {
  type Content = Parameters<typeof withoutHiddenJerseys>[0];
  const build = (visible: [boolean, boolean, boolean], thirdPhotos = true): Content => ({
    kits: {
      home: { section: { title: "Home secret" }, photos: [{ id: "h" }] },
      away: { section: { title: "Away secret" }, photos: [{ id: "a" }] },
      third: { section: { title: "Third" }, photos: thirdPhotos ? [{ id: "t" }] : [] },
    },
    photoRows: { home: [{ id: "hr" }], away: [{ id: "ar" }], third: [{ id: "tr" }] },
    purchase: null, sponsors: [],
    presentation: { ...EMPTY_CINEMATIC_SHOP_CONTENT, details: [], editions: (["Home", "Away", "Third"] as const).map((label, index) => ({ label, price: `$${80 + index}`, line: `${label} line`, link: "", ...(visible[index] ? {} : { visible: false }) })) },
  } as unknown as Content);

  it("blanks a hidden jersey's option, kit words and photos, keeping its place", () => {
    const sent = withoutHiddenJerseys(build([false, true, true]));
    expect(sent.presentation.editions[0]).toEqual({ label: "", price: "", line: "", link: "", visible: false });
    expect(sent.presentation.editions[1].label).toBe("Away");
    expect(sent.kits.home).toEqual({ section: null, photos: [] });
    expect(sent.photoRows.home).toEqual([]);
    expect(sent.kits.away.section).not.toBeNull();
    expect(JSON.stringify(sent)).not.toMatch(/Home secret|Home line|\$80/);
  });

  it("keeps the Away photos a shown Third kit borrows, but not the Away words", () => {
    const sent = withoutHiddenJerseys(build([true, false, true], false));
    expect(sent.kits.away.section).toBeNull();
    expect(sent.kits.away.photos).toHaveLength(1);
    expect(sent.photoRows.away).toHaveLength(1);
    expect(JSON.stringify(sent)).not.toContain("Away secret");
  });

  it("changes nothing when every jersey is shown", () => {
    const value = build([true, true, true]);
    expect(withoutHiddenJerseys(value)).toBe(value);
  });

  it("is applied to the server-rendered Shop and the browser fetch", () => {
    expect(readFileSync("components/sites/rose-city/RoseCityShopPage.tsx", "utf8")).toContain("content: withoutHiddenJerseys({");
    expect(readFileSync("components/cinematic/CinematicShopPage.tsx", "utf8")).toContain("content: withoutHiddenJerseys({");
  });
});
