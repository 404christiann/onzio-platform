import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MAX_KBYG_TILES, MAX_SEASON_BENEFITS, MAX_SEASON_PRICE_ROWS, ticketPageSchemas, type KnowBeforeYouGoContent, type SeasonMembershipContent } from "@/lib/cinematic-ticket-pages-content";
import { addListItem, moveListItem, removeListItem, setTicketPageImage, unusedTicketPageUploads } from "@/lib/cinematic-ticket-pages-editor";
import { knowBeforeYouGoReferenceContent, seasonMembershipReferenceContent } from "@/lib/ticket-pages-reference-content";

const season = () => structuredClone(seasonMembershipReferenceContent) as SeasonMembershipContent;
const kbyg = () => structuredClone(knowBeforeYouGoReferenceContent) as KnowBeforeYouGoContent;
const valid = (key: "season-membership" | "know-before-you-go", content: unknown) => ticketPageSchemas[key].safeParse(content).success;

describe("ticket page editor buttons", () => {
  it("adds a benefit, a price row and a match-day tile with their own empty image slot, and the page still saves", () => {
    const withBenefit = addListItem("season-membership", season(), "benefits");
    const added = withBenefit.benefits.items.at(-1)!;
    expect(added).toEqual({ id: "benefit-10", label: "" });
    expect(withBenefit.images["benefit-10"]).toEqual({ assetId: null, alt: "" });
    expect(valid("season-membership", withBenefit)).toBe(true);

    const withRow = addListItem("season-membership", season(), "pricing");
    expect(withRow.pricing.rows.at(-1)).toEqual({ id: "seat-2", name: "", prices: ["", "", ""] });
    expect(valid("season-membership", withRow)).toBe(true);

    const withTile = addListItem("know-before-you-go", kbyg(), "tiles");
    expect(withTile.facts.tiles.at(-1)).toEqual({ id: "tile-16", label: "" });
    expect(valid("know-before-you-go", withTile)).toBe(true);
  });

  it("never reuses the ID of an item that is still on the page", () => {
    const content = season();
    content.benefits.items = content.benefits.items.filter(item => item.id !== "benefit-3");
    delete content.images["benefit-3"];
    const next = addListItem("season-membership", content, "benefits");
    const ids = next.benefits.items.map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(valid("season-membership", next)).toBe(true);
  });

  it("stops adding at the limit", () => {
    let content = season();
    for (let n = 0; n < 20; n += 1) content = addListItem("season-membership", content, "benefits");
    expect(content.benefits.items).toHaveLength(MAX_SEASON_BENEFITS);
    for (let n = 0; n < 20; n += 1) content = addListItem("season-membership", content, "pricing");
    expect(content.pricing.rows).toHaveLength(MAX_SEASON_PRICE_ROWS);
    let page = kbyg();
    for (let n = 0; n < 30; n += 1) page = addListItem("know-before-you-go", page, "tiles");
    expect(page.facts.tiles).toHaveLength(MAX_KBYG_TILES);
    expect(valid("season-membership", content) && valid("know-before-you-go", page)).toBe(true);
  });

  it("removes an item together with its image slot", () => {
    const content = season();
    const next = removeListItem("season-membership", content, "benefits", 0);
    expect(next.benefits.items.map(item => item.id)).not.toContain("benefit-1");
    expect(next.images["benefit-1"]).toBeUndefined();
    expect(valid("season-membership", next)).toBe(true);
    const page = removeListItem("know-before-you-go", kbyg(), "tiles", 13);
    expect(page.facts.tiles.map(tile => tile.label)).not.toContain("Blank");
    expect(valid("know-before-you-go", page)).toBe(true);
  });

  it("moves items up and down and keeps each item's image with it", () => {
    const id = randomUUID();
    const content = setTicketPageImage(season(), "benefit-2", id);
    const moved = moveListItem("season-membership", content, "benefits", 1, -1);
    expect(moved.benefits.items.slice(0, 2).map(item => item.label)).toEqual(["Dedicated Account Services", "Preferred Pricing"]);
    expect(moved.images["benefit-2"].assetId).toBe(id);
    expect(moveListItem("season-membership", moved, "benefits", 0, -1)).toEqual(moved);
    const tiles = moveListItem("know-before-you-go", kbyg(), "tiles", 14, 1);
    expect(tiles.facts.tiles.at(-1)!.label).toBe("National Anthem Jackie Portman");
  });

  it("lists only the uploads from this editing session that the draft no longer uses", () => {
    const kept = randomUUID(), dropped = randomUUID();
    const content = setTicketPageImage(setTicketPageImage(kbyg(), "raffle", kept), "tile-1", null);
    expect(unusedTicketPageUploads([kept, dropped], content)).toEqual([dropped]);
    const removed = removeListItem("know-before-you-go", setTicketPageImage(kbyg(), "tile-2", kept), "tiles", 1);
    expect(unusedTicketPageUploads([kept], removed)).toEqual([kept]);
  });
});
