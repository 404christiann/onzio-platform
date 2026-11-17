import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ROBINSON_IMAGE_SLOTS, emptyRobinsonContent, hydrateRobinsonContent, type RobinsonContent, type RobinsonPageContent } from "@/lib/cinematic-robinson-content";
import { robinsonReferenceContent } from "@/lib/robinson-reference-content";

vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ id: "tenant", name: "Test club" }) }));
vi.mock("@/components/ClubBrandingProvider", () => ({ useClubBranding: () => ({ clubLogoUrl: "/crest.png" }) }));
vi.mock("@/components/cinematic/CinematicContent", () => ({ useCinematicContent: () => ({ content: { match: { heading: "Shared next match", buttonLabel: "Shared ticket button", emptyMessage: "Shared announcement" } } }) }));
vi.mock("@/components/ResilientNativeImage", () => ({ default: (props: Record<string, unknown>) => createElement("img", props) }));
vi.mock("@/lib/queries", () => ({ fetchSchedule: vi.fn() }));
vi.mock("@/lib/cinematic-identity", () => ({ fetchClubIdentity: vi.fn() }));
import CinematicRobinson from "@/components/cinematic/CinematicRobinson";
import { fetchRobinsonContent } from "@/lib/cinematic-robinson-query";

afterEach(() => vi.unstubAllEnvs());
const MEDIA = "https://media.example.test/storage/v1/object/public/onzio-media/tenant/homepage/";
const noTickets = { purchaseUrl: "", missingPurchaseLabel: "Ticket link coming soon" };

function page(change: (content: RobinsonContent) => void = () => {}): RobinsonPageContent {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://media.example.test");
  const content = structuredClone(robinsonReferenceContent) as RobinsonContent;
  const media = ROBINSON_IMAGE_SLOTS.map(slot => {
    const id = randomUUID();
    content.images[slot].assetId = id;
    return { id, storage_bucket: "onzio-media", storage_path: `tenant/homepage/${slot}.png`, width: slot === "partner" ? 400 : 1000, height: slot === "partner" ? 200 : 600 };
  });
  change(content);
  return hydrateRobinsonContent(content, media);
}
const render = (content: RobinsonPageContent, ticketing = noTickets) =>
  renderToStaticMarkup(createElement(CinematicRobinson, { content, ticketing }));

describe("Robinson Stadium public page", () => {
  it("renders the stored confirmed copy exactly as the approved static page did", () => {
    // tests/fixtures/robinson/reference-2027.html is the static page's markup captured before this package,
    // with each image URL replaced by its slot. Directions headings now also carry their stable block IDs.
    const expected = readFileSync("tests/fixtures/robinson/reference-2027.html", "utf8").trim()
      .replace("<h3>Directions By Foothill Transit</h3>", '<h3 id="foothill-transit">Directions By Foothill Transit</h3>')
      .replace("<h3>Line 187: Azusa – Arcadia – Pasadena</h3>", '<h3 id="line-187">Line 187: Azusa – Arcadia – Pasadena</h3>')
      .replace("<h3>Foothill Transit Service Areas</h3>", '<h3 id="service-areas">Foothill Transit Service Areas</h3>');
    const html = render(page()).replace(new RegExp(MEDIA.replaceAll(".", "\\.") + "([a-zA-Z0-9]+)\\.png", "g"), "{{$1}}");
    expect(html).toBe(expected);
  });

  it("keeps the Stadium parking anchor on the parking block even after its heading is renamed", () => {
    const html = render(page(content => { content.directions.blocks[1].heading = "Parking"; }));
    expect(html).toContain('<h3 id="parking-lot-no-5">Parking</h3>');
  });

  it("hides only the section whose switch is off", () => {
    const markers = {
      heading: 'class="r-heading"', seating: 'class="r-seating"', story: 'class="r-story"', info: 'class="r-info-card"',
      match: 'class="robinson-match"', lockers: 'class="r-locker-divider"', food: 'class="r-food"', route: 'class="r-route-heading"', directions: 'class="r-directions"',
    } as const;
    for (const section of Object.keys(markers) as (keyof typeof markers)[]) {
      const html = render(page(content => { content[section].visible = false; }));
      for (const [other, marker] of Object.entries(markers)) expect(html.includes(marker), `${section} off → ${other}`).toBe(other !== section);
    }
    const neither = render(page(content => { content.info.visible = false; content.match.visible = false; }));
    expect(neither).not.toContain('class="r-cards"');
    const noRoute = render(page(content => { content.route.visible = false; content.directions.visible = false; }));
    expect(noRoute).not.toContain('class="r-route"');
  });

  it("shows a club without a saved page only a neutral Stadium heading", () => {
    const html = render(hydrateRobinsonContent(emptyRobinsonContent(), []));
    expect(html).toContain('<h1 id="r-title">Stadium</h1>');
    expect(html).not.toMatch(/r-seating|r-story|r-cards|r-locker|r-food|r-route|Robinson Stadium|Pasadena/);
  });

  it("leaves the match wording to Homepage and the purchase link to Tickets", () => {
    const html = render(page(), { purchaseUrl: "https://tickets.example.test/rose-city", missingPurchaseLabel: "unused" });
    expect(html).toContain("Shared next match");
    expect(html).toContain('<a class="robinson-buy" href="https://tickets.example.test/rose-city">Shared ticket button</a>');
    expect(html).toContain(`src="${MEDIA}partner.png"`);
  });

  it("skips an image slot that has no published image instead of showing a broken image", () => {
    const html = render(page(content => { content.images.seating.assetId = null; content.images.step2.assetId = null; }));
    expect(html).toContain("<figcaption>Home Field Advantage</figcaption>");
    expect(html).not.toContain("r-map-expand");
    expect(html).not.toContain(`${MEDIA}seating.png`);
    expect(html).toContain("<p>Free Game Ticket</p><strong>2</strong>");
  });
});

describe("Robinson Stadium trusted query", () => {
  it("reconstructs image identities from the tenant FK columns and loads only published media of this club", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://media.example.test");
    const seating = randomUUID(), stored: Omit<RobinsonContent, "images"> & { images: Record<string, { alt: string }> } = structuredClone(robinsonReferenceContent);
    stored.images = Object.fromEntries(ROBINSON_IMAGE_SLOTS.map(slot => [slot, { alt: robinsonReferenceContent.images[slot].alt }]));
    const row = { content: stored, seating_media_asset_id: seating, lockers_media_asset_id: null, meal_pass_media_asset_id: null, step_1_media_asset_id: null,
      step_2_media_asset_id: null, step_3_media_asset_id: null, bus_media_asset_id: null, route_map_media_asset_id: null, partner_media_asset_id: null };
    const contentChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }) };
    const mediaChain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: [{ id: seating, storage_bucket: "onzio-media", storage_path: "tenant/homepage/seating.webp", width: 3000, height: 1843 }], error: null }) };
    const client = { from: vi.fn().mockImplementation(table => table === "cinematic_robinson_content" ? contentChain : mediaChain) };
    const result = await fetchRobinsonContent("tenant", client as unknown as Parameters<typeof fetchRobinsonContent>[1]);
    expect(result.images.seating).toMatchObject({ assetId: seating, alt: robinsonReferenceContent.images.seating.alt, width: 3000 });
    expect(result.images.seating.url).toContain("tenant/homepage/seating.webp");
    expect(contentChain.eq).toHaveBeenCalledWith("club_id", "tenant");
    expect(mediaChain.eq).toHaveBeenCalledWith("club_id", "tenant");
    expect(mediaChain.eq).toHaveBeenCalledWith("status", "published");
    expect(mediaChain.is).toHaveBeenCalledWith("deleted_at", null);
    expect(mediaChain.in).toHaveBeenCalledWith("id", [seating]);
  });

  it("returns the neutral page when the club never saved Robinson, and fails on a real backend error", async () => {
    const none = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    const empty = await fetchRobinsonContent("tenant", { from: () => none } as unknown as Parameters<typeof fetchRobinsonContent>[1]);
    expect(empty.heading.title).toBe("Stadium");
    const broken = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "unavailable" } }) };
    await expect(fetchRobinsonContent("tenant", { from: () => broken } as unknown as Parameters<typeof fetchRobinsonContent>[1])).rejects.toThrow("Unable to load Robinson Stadium content.");
  });
});
