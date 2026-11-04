import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import copy from "@/assets/rose-city-stadium-2027/content.json";
import { hydrateStadiumContent, stadiumContentSchema } from "@/lib/stadium-content";

vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ id: "tenant", name: "Test club" }) }));
vi.mock("@/components/ClubBrandingProvider", () => ({ useClubBranding: () => ({ clubLogoUrl: "/crest.png" }) }));
vi.mock("@/components/cinematic/CinematicContent", () => ({ useCinematicContent: () => ({ content: { match: { heading: "Shared next match", buttonLabel: "Shared ticket button", emptyMessage: "Shared announcement" } } }) }));
vi.mock("@/components/ResilientNativeImage", () => ({ default: (props: Record<string, unknown>) => createElement("img", props) }));
vi.mock("@/lib/queries", () => ({ fetchSchedule: vi.fn() }));
vi.mock("@/lib/editorial-identity", () => ({ fetchClubIdentity: vi.fn() }));
import CinematicStadium from "@/components/cinematic/CinematicStadium";
afterEach(() => vi.unstubAllEnvs());

function page() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://media.example.test");
  const content = stadiumContentSchema.parse(copy), id = randomUUID();
  content.artwork.map.assetId = id;
  return hydrateStadiumContent(content, [{ id, storage_bucket: "onzio-media", storage_path: "tenant/homepage/map.png", width: 2380, height: 1216 }]);
}
describe("Shared public/admin Stadium renderer", () => {
  it("preserves original card/map viewport geometry and supports full-image replacement mode", () => {
    const content = page();
    const split = renderToStaticMarkup(createElement(CinematicStadium, { content }));
    expect(split).toContain('viewBox="96 54 652 1104"');
    expect(split).toContain('viewBox="754 0 1626 1216"');
    const full = renderToStaticMarkup(createElement(CinematicStadium, { content: { ...content, phoneMapLayout: "full" } }));
    expect(full).toContain('class="robinson-route-full"');
    expect(full).not.toContain('viewBox="96 54 652 1104"');
  });
  it("uses shared Homepage match wording and Tickets-owned purchase options without a sample fixture", () => {
    const content = page();
    const active = renderToStaticMarkup(createElement(CinematicStadium, { content, ticketing: { purchaseUrl: "https://tickets.example.test/event", missingPurchaseLabel: "Configured ticket message" } }));
    expect(active).toContain("Shared next match");
    expect(active).toContain('href="https://tickets.example.test/event"');
    expect(active).toContain("Shared ticket button");
    expect(active).not.toMatch(/Ventura|March 13|7:45/);
    const unsafe = renderToStaticMarkup(createElement(CinematicStadium, { content, ticketing: { purchaseUrl: "javascript:alert(1)", missingPurchaseLabel: "Configured ticket message" } }));
    expect(unsafe).toContain("Configured ticket message");
    expect(unsafe).toContain("disabled");
    expect(unsafe).not.toContain('href="javascript:');
  });
  it("honors section and page visibility and escapes editor copy as plain text", () => {
    const content = page();
    content.sections[0].heading = "<script>untrusted</script>";
    content.sections[1].visible = false;
    content.showBenefits = false;
    const rendered = renderToStaticMarkup(createElement(CinematicStadium, { content }));
    expect(rendered).toContain("&lt;script&gt;untrusted&lt;/script&gt;");
    expect(rendered).not.toContain('<script>');
    expect(rendered).not.toContain("Parking Lot No 5</h2>");
    expect(rendered).not.toContain("Enjoy 10% off");
    content.showHeading = false; content.showMap = false; content.showSections = false; content.showMatch = false;
    const hidden = renderToStaticMarkup(createElement(CinematicStadium, { content }));
    expect(hidden).not.toContain("<section");
  });
});
