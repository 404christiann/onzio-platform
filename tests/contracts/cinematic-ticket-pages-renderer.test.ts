import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hydrateTicketPage, type KnowBeforeYouGoContent, type SeasonMembershipContent } from "@/lib/cinematic-ticket-pages-content";
import { knowBeforeYouGoReferenceContent, seasonMembershipReferenceContent } from "@/lib/ticket-pages-reference-content";
import type { Fixture } from "@/lib/data";

const route = vi.hoisted(() => ({ template: "cinematic@2", fetch: vi.fn() }));
vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ id: "tenant", name: "Rose City FC" }) }));
vi.mock("@/components/ClubBrandingProvider", () => ({ useClubBranding: () => ({ clubLogoUrl: "/crest.png" }) }));
vi.mock("@/components/cinematic/CinematicContent", () => ({ useCinematicContent: () => ({ content: { match: { emptyMessage: "Shared announcement" } } }) }));
vi.mock("@/components/ResilientNativeImage", () => ({ default: (props: Record<string, unknown>) => createElement("img", props) }));
vi.mock("@/lib/queries", () => ({ fetchSchedule: vi.fn(), fetchSiteSocialLinks: vi.fn() }));
vi.mock("@/lib/cinematic-identity", () => ({ fetchClubIdentity: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("@/lib/club-context", () => ({ getClubContextBySlug: async () => ({ id: "tenant", presentationTemplateKey: route.template }) }));
vi.mock("@/lib/supabase-server", () => ({ createClient: async () => ({ schema: () => ({}) }) }));
vi.mock("@/lib/cinematic-ticket-pages-query", () => ({ fetchTicketPage: route.fetch }));
import CinematicSeasonMembership from "@/components/cinematic/CinematicSeasonMembership";
import { KnowBeforeYouGoView, type KnowBeforeYouGoMatch } from "@/components/cinematic/CinematicKnowBeforeYouGo";
import SeasonMembershipRoute from "@/app/%5Fclubs/[slug]/tickets/season-membership/page";
import KnowBeforeYouGoRoute from "@/app/%5Fclubs/[slug]/tickets/know-before-you-go/page";

beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://media.example.test"); route.template = "cinematic@2"; route.fetch.mockReset(); });
afterEach(() => vi.unstubAllEnvs());

function withImages<T extends { images: Record<string, { assetId: string | null }> }>(content: T, slots: string[]) {
  const media = slots.map(slot => { const id = randomUUID(); content.images[slot].assetId = id; return { id, storage_bucket: "onzio-media", storage_path: `tenant/homepage/${slot}.png`, width: 400, height: 200 }; });
  return media;
}
function seasonView(change: (content: SeasonMembershipContent) => void = () => {}, slots: string[] = []) {
  const content = structuredClone(seasonMembershipReferenceContent);
  change(content);
  return hydrateTicketPage("season-membership", content, withImages(content, slots));
}
function kbygView(change: (content: KnowBeforeYouGoContent) => void = () => {}, slots: string[] = []) {
  const content = structuredClone(knowBeforeYouGoReferenceContent);
  change(content);
  return hydrateTicketPage("know-before-you-go", content, withImages(content, slots));
}
const season = (view = seasonView(), placeholders = false) => renderToStaticMarkup(createElement(CinematicSeasonMembership, { content: view, placeholders }));
const fixture: Fixture = { date: "2027-03-20", time: "19:45", opponent: "Orange County FC", opponentShortName: "OCFC", opponentLogoUrl: "/ocfc.png", competition: "UPSL Premier", home: true, venue: "Robinson Stadium" };
const ready: KnowBeforeYouGoMatch = { loading: false, fixture, clubShortName: "RCFC" };
const kbyg = (view = kbygView(), match: KnowBeforeYouGoMatch = ready, placeholders = false) => renderToStaticMarkup(createElement(KnowBeforeYouGoView, { content: view, match, placeholders }));
const count = (html: string, text: string) => html.split(text).length - 1;

describe("Season Ticket Membership public page", () => {
  it("shows Sam's heading, intro, bullets, price table and Member Benefits in order", () => {
    const html = season();
    expect(html).toContain("<h1>Season Ticket Membership</h1>");
    expect(html).toContain("Experience Rose City FC live every home game");
    expect(html).toContain("<h2 class=\"tp-includes\">Includes</h2>");
    expect(count(html, "<li>")).toBe(2 + 11);
    expect(html).toMatch(/General Seating<\/span>[\s\S]*\$5<\/td>[\s\S]*\$7<\/td>[\s\S]*\$14<\/td>/);
    expect(html).toContain('Full season per match price<span class="tp-star">*</span>');
    const labels = [...html.matchAll(/<li class="tp-tile">.*?<p>(.*?)<\/p><\/li>/g)].map(match => match[1]);
    expect(labels).toEqual(["Preferred Pricing", "Dedicated Account Services", "25 Raffle Tickets", "20% Merch Discounts", "Exclusive Member Events", "Playoffs &amp; Pre-Sales", "Partner Discounts", "Lamar Hunt U.S. Open Cup Games", "Exclusive Gift"]);
    expect(html).toContain("Become a RCFC member &amp; save");
  });

  it("shows both Buy buttons as links once there is a link, and as inert buttons until then", () => {
    expect(count(season(), '<span class="tp-buy" aria-disabled="true">Buy Season Membership</span>')).toBe(2);
    expect(count(season(seasonView(content => { content.button.href = "https://tickets.example.com/season"; })), '<a class="tp-buy" href="https://tickets.example.com/season">Buy Season Membership</a>')).toBe(2);
  });

  it("hides every empty image on the public page, shows uploaded ones, and labels the empty slots in the editor preview", () => {
    const empty = season();
    expect(empty).not.toContain("<img");
    expect(empty).not.toContain("tp-slot");
    const filled = season(seasonView(() => {}, ["ticket", "seat-general", "benefit-1"]));
    expect(filled).toContain('src="https://media.example.test/storage/v1/object/public/onzio-media/tenant/homepage/ticket.png"');
    expect(filled).toContain('alt="Rose City Futbol Club Under the Lights ticket for Robinson Stadium, Pasadena"');
    expect(count(filled, "<img")).toBe(3);
    const preview = season(seasonView(), true);
    expect(count(preview, "tp-slot")).toBe(1 + 1 + 9);
    expect(preview).toContain("Waiting for image: Preferred Pricing");
  });

  it("hides only the sections whose switch is off", () => {
    const html = season(seasonView(content => { content.pricing.visible = false; content.benefits.visible = false; }));
    expect(html).not.toContain("tp-pricing");
    expect(html).not.toContain("Member Benefits");
    expect(html).toContain("Become a RCFC member");
    expect(season(seasonView(content => { content.closing.visible = false; }))).not.toContain("Become a RCFC member");
  });
});

describe("Know Before You Go public page", () => {
  it("fills the match box from Schedule's next home match", () => {
    const html = kbyg();
    expect(html).toContain('<p class="tp-competition">UPSL Premier</p>');
    expect(html).toContain("Saturday March 20, 2027 | Robinson Stadium");
    expect(html).toMatch(/<strong>RCFC<\/strong>[\s\S]*src="\/crest.png"[\s\S]*X[\s\S]*src="\/ocfc.png"[\s\S]*<strong>OCFC<\/strong>/);
  });

  it("uses the owner's competition line when Schedule has none, and says when no home match is announced", () => {
    expect(kbyg(kbygView(), { ...ready, fixture: { ...fixture, competition: null } })).toContain('<p class="tp-competition">UPSL Premier Regular Season</p>');
    const none = kbyg(kbygView(), { loading: false, fixture: null, clubShortName: "RCFC" });
    expect(none).toContain("Shared announcement");
    expect(none).not.toContain("<strong>RCFC</strong>");
    expect(kbyg(kbygView(), { loading: true, fixture: null, clubShortName: "" })).toContain("Loading next home match");
  });

  it("links the watch line only when there is a link, opening it in a new tab", () => {
    expect(kbyg(kbygView(content => { content.match.watchHref = ""; }))).not.toContain('class="tp-watch" href');
    expect(kbyg()).toContain('<a class="tp-watch" href="https://www.youtube.com/@RoseCityFC/live"');
    const linked = kbyg(kbygView(content => { content.match.watchHref = "https://www.youtube.com/@rosecityfc"; }, ["youtube"]));
    expect(linked).toContain('<a class="tp-watch" href="https://www.youtube.com/@rosecityfc" target="_blank" rel="noopener noreferrer">');
    expect(linked).toContain('alt="YouTube"');
  });

  it("sends fans to the club's YouTube channel when no game-day stream link is set", () => {
    const noStream = kbygView(content => { content.match.watchHref = ""; });
    const channel = kbyg(noStream, { ...ready, youtubeChannel: "https://www.youtube.com/@RoseCityFC" });
    expect(channel).toContain('<a class="tp-watch" href="https://www.youtube.com/@RoseCityFC" target="_blank" rel="noopener noreferrer">');
    const stream = kbyg(kbygView(content => { content.match.watchHref = "https://www.youtube.com/live/game-day"; }), { ...ready, youtubeChannel: "https://www.youtube.com/@RoseCityFC" });
    expect(stream).toContain('href="https://www.youtube.com/live/game-day"');
    expect(stream).not.toContain('href="https://www.youtube.com/@RoseCityFC"');
    const neither = kbyg(noStream, { ...ready, youtubeChannel: "" });
    expect(neither).toContain('<p class="tp-watch">Watch every game live');
    expect(neither).not.toContain('class="tp-watch" href');
  });

  it("shows the 15 match-day tiles, the raffle with its bold prize, and the donor", () => {
    const html = kbyg();
    const labels = [...html.matchAll(/<li class="tp-tile">.*?<p>(.*?)<\/p><\/li>/g)].map(match => match[1]);
    expect(labels).toHaveLength(15);
    expect(labels.slice(0, 3)).toEqual(["Pasadena, CA", "Mobile Entry", "Gates Open 7PM"]);
    expect(html).toContain("home opener is a <b>PlayStation 5</b>. Automatically");
    expect(html).toContain("PlayStation 5 Console + Controller");
    // No donor logo yet: the donor's name stands in for it.
    expect(html).toContain('<p class="tp-donor-name">Chronic Tacos</p>');
    expect(html).toContain('<span class="tp-buy" aria-disabled="true">Donate the next raffle item</span>');
    const filled = kbyg(kbygView(content => { content.donor.buttonHref = "/community/partnership"; }, ["donor", "raffle", "tile-1"]));
    expect(filled).not.toContain("tp-donor-name");
    expect(filled).toContain('alt="Chronic Tacos"');
    expect(filled).toContain('alt="PlayStation 5 console and controller"');
    expect(filled).toContain('<a class="tp-buy" href="/community/partnership">Donate the next raffle item</a>');
  });

  it("labels every empty slot in the editor preview and hides sections that are switched off", () => {
    const preview = kbyg(kbygView(), ready, true);
    expect(count(preview, "tp-slot")).toBe(15 + 3);
    expect(preview).toContain("Waiting for image: Mobile Entry");
    const hidden = kbyg(kbygView(content => { content.facts.visible = false; content.raffle.visible = false; content.donor.visible = false; content.match.visible = false; }));
    expect(hidden).not.toContain("tp-tile");
    expect(hidden).not.toContain("Halftime Raffle Item");
    expect(hidden).not.toContain("Chronic Tacos");
    expect(hidden).not.toContain("tp-match");
    expect(hidden).toContain("<h1>Know Before You Go</h1>");
  });
});

describe("ticket page routes", () => {
  it("serve cinematic@2 clubs from their saved content and 404 for other designs", async () => {
    route.fetch.mockResolvedValueOnce(seasonView()).mockResolvedValueOnce(kbygView());
    const params = Promise.resolve({ slug: "rose-city" });
    expect(renderToStaticMarkup(await SeasonMembershipRoute({ params }))).toContain("Season Ticket Membership");
    expect(renderToStaticMarkup(await KnowBeforeYouGoRoute({ params }))).toContain("Know Before You Go");
    expect(route.fetch.mock.calls.map(call => call.slice(0, 2))).toEqual([["tenant", "season-membership"], ["tenant", "know-before-you-go"]]);
    route.template = "editorial@1";
    await expect(SeasonMembershipRoute({ params })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(KnowBeforeYouGoRoute({ params })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
