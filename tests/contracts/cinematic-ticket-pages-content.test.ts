import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TICKET_PAGE_KEYS, hydrateTicketPage, emptyTicketPageContent, ticketPageSaveSchema, ticketPageSchemas,
  type KnowBeforeYouGoContent, type SeasonMembershipContent,
} from "@/lib/cinematic-ticket-pages-content";
import { knowBeforeYouGoReferenceContent, seasonMembershipReferenceContent } from "@/lib/ticket-pages-reference-content";

afterEach(() => vi.unstubAllEnvs());
const season = () => structuredClone(seasonMembershipReferenceContent) as SeasonMembershipContent;
const kbyg = () => structuredClone(knowBeforeYouGoReferenceContent) as KnowBeforeYouGoContent;
const okSeason = (content: unknown) => ticketPageSchemas["season-membership"].safeParse(content).success;
const okKbyg = (content: unknown) => ticketPageSchemas["know-before-you-go"].safeParse(content).success;

describe("Season Ticket Membership and Know Before You Go save rules", () => {
  it("accepts Sam's copy for both pages unchanged", () => {
    expect(ticketPageSchemas["season-membership"].parse(season())).toEqual(season());
    expect(ticketPageSchemas["know-before-you-go"].parse(kbyg())).toEqual(kbyg());
    expect(season().pricing.rows[0]).toMatchObject({ name: "General Seating", prices: ["$5", "$7", "$14"] });
    expect(season().intro.includes[0]).toBe("7 regular season home games");
    expect(season().benefits.items).toHaveLength(9);
    expect(kbyg().facts.tiles).toHaveLength(15);
  });

  it("starts a club that never saved with only the title and every image slot empty", () => {
    for (const key of TICKET_PAGE_KEYS) {
      const empty = emptyTicketPageContent(key);
      expect(ticketPageSchemas[key].safeParse(empty).success, key).toBe(true);
      expect(Object.values(empty.images).every(image => image.assetId === null), key).toBe(true);
    }
    expect(emptyTicketPageContent("season-membership").heading.title).toBe("Season Ticket Membership");
    expect(emptyTicketPageContent("know-before-you-go").heading.title).toBe("Know Before You Go");
  });

  it("keeps exactly one image slot per benefit, price row and match-day tile, plus the page's own slots", () => {
    const missing = season();
    delete missing.images[missing.benefits.items[0].id];
    expect(okSeason(missing)).toBe(false);
    const stray = season();
    stray.images["benefit-gone"] = { assetId: null, alt: "" };
    expect(okSeason(stray)).toBe(false);
    const noTicket = season();
    delete noTicket.images.ticket;
    expect(okSeason(noTicket)).toBe(false);
    const noRaffle = kbyg();
    delete noRaffle.images.raffle;
    expect(okKbyg(noRaffle)).toBe(false);
    const tileGone = kbyg();
    tileGone.facts.tiles.pop();
    expect(okKbyg(tileGone)).toBe(false);
  });

  it("rejects repeated or badly named item IDs", () => {
    const repeated = season();
    repeated.benefits.items[1].id = repeated.benefits.items[0].id;
    expect(okSeason(repeated)).toBe(false);
    const renamed = kbyg();
    const [first] = renamed.facts.tiles;
    renamed.images.youtube = renamed.images[first.id];
    delete renamed.images[first.id];
    first.id = "youtube";
    expect(okKbyg(renamed)).toBe(false);
  });

  it("accepts HTTPS, email and site links for the buttons and refuses anything else", () => {
    for (const href of ["", "https://tickets.example.com/season", "mailto:tickets@rosecityfc.com", "/contact"]) {
      const content = season(); content.button.href = href;
      expect(okSeason(content), href).toBe(true);
      const page = kbyg(); page.donor.buttonHref = href; page.match.watchHref = href;
      expect(okKbyg(page), href).toBe(true);
    }
    for (const href of ["javascript:alert(1)", "//evil.example.com", "https://localhost/x", "mailto:mailto:a@example.com"]) {
      const content = season(); content.button.href = href;
      expect(okSeason(content), href).toBe(false);
      const page = kbyg(); page.donor.buttonHref = href;
      expect(okKbyg(page), href).toBe(false);
    }
  });

  it("caps the lists: 12 benefits, 6 price rows with 3 prices each, 30 includes, 24 tiles", () => {
    const benefits = season();
    for (let n = 10; n <= 13; n += 1) { benefits.benefits.items.push({ id: `benefit-${n}`, label: "Extra" }); benefits.images[`benefit-${n}`] = { assetId: null, alt: "" }; }
    expect(okSeason(benefits)).toBe(false);
    benefits.benefits.items.pop(); delete benefits.images["benefit-13"];
    expect(okSeason(benefits)).toBe(true);
    const prices = season(); prices.pricing.rows[0].prices.pop();
    expect(okSeason(prices)).toBe(false);
    const includes = season(); includes.intro.includes = Array.from({ length: 31 }, () => "Perk");
    expect(okSeason(includes)).toBe(false);
    const tiles = kbyg();
    for (let n = 16; n <= 25; n += 1) { tiles.facts.tiles.push({ id: `tile-${n}`, label: "Extra" }); tiles.images[`tile-${n}`] = { assetId: null, alt: "" }; }
    expect(okKbyg(tiles)).toBe(false);
  });

  it("validates a whole save request, including which page it belongs to", () => {
    const request = { operationId: randomUUID(), expectedRevision: "0", designRevision: "d1", content: season(), retiredMediaAssetIds: [] };
    expect(ticketPageSaveSchema("season-membership").safeParse(request).success).toBe(true);
    expect(ticketPageSaveSchema("know-before-you-go").safeParse(request).success).toBe(false);
    expect(ticketPageSaveSchema("season-membership").safeParse({ ...request, expectedRevision: "-1" }).success).toBe(false);
  });

  it("gives an image a public address only when its file is this club's published media", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://media.example.test");
    const content = season(), id = randomUUID();
    content.images.ticket.assetId = id;
    content.images[content.benefits.items[0].id].assetId = randomUUID();
    const page = hydrateTicketPage("season-membership", content, [{ id, storage_bucket: "onzio-media", storage_path: "tenant/homepage/ticket file.png", width: 1800, height: 791 }]);
    expect(page.images.ticket).toEqual({ assetId: id, alt: content.images.ticket.alt, url: "https://media.example.test/storage/v1/object/public/onzio-media/tenant/homepage/ticket%20file.png", width: 1800, height: 791 });
    expect(page.images[content.benefits.items[0].id].url).toBeNull();
  });
});
