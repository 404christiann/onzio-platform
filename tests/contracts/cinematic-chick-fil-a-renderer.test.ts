import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ id: "test-tenant", name: "Synthetic Club" }) }));
vi.mock("@/components/ClubBrandingProvider", () => ({ useClubBranding: () => ({ clubLogoUrl: "/images/test-crest.png" }) }));
vi.mock("@/components/cinematic/CinematicContent", () => ({ useCinematicContent: () => ({ content: { match: { heading: "Upcoming home match", emptyMessage: "Club announcement", buttonLabel: "Reserve your tickets" } } }) }));
vi.mock("@/components/ResilientNativeImage", () => ({ default: (props: Record<string, unknown>) => createElement("img", props) }));
vi.mock("@/lib/queries", () => ({ fetchSchedule: vi.fn() }));
vi.mock("@/lib/cinematic-identity", () => ({ fetchClubIdentity: vi.fn() }));
import CinematicChickFilA from "@/components/cinematic/CinematicChickFilA";
import { emptyChickFilAContent, hydrateChickFilAContent } from "@/lib/chick-fil-a-content";

describe("Chick-fil-A shared public/admin renderer", () => {
  const content = () => ({ ...hydrateChickFilAContent(emptyChickFilAContent(), []), title: "Edited food title", detailsHeading: "Edited details", detailsBody: "Tenant-authored terms", stepLabels: ["Collect meal", "Receive ticket", "Watch match"] as [string, string, string], stepNumbers: ["A", "B", "C"] as [string, string, string] });
  it("renders tenant-authored terms/labels and shared match button without fixtures or duplicated shell", () => {
    const html = renderToStaticMarkup(createElement(CinematicChickFilA, { content: content(), purchase: { purchaseUrl: "", missingPurchaseLabel: "Author-set unavailable message" } }));
    for (const text of ["Edited food title", "Edited details", "Tenant-authored terms", "Collect meal", "Receive ticket", "Watch match", "Reserve your tickets", "Author-set unavailable message"]) expect(html).toContain(text);
    expect(html).toContain("disabled"); expect(html).not.toContain("Ventura"); expect(html).not.toContain("March 13"); expect(html).not.toContain("7:45"); expect(html).not.toContain("<header"); expect(html).not.toContain("<footer");
  });
  it("honors every authored section visibility and never places an unsafe purchase URL on an anchor", () => {
    const c = content(); c.sections = { heading: false, details: false, steps: false, map: false, match: false, restaurant: false };
    const html = renderToStaticMarkup(createElement(CinematicChickFilA, { content: c, purchase: { purchaseUrl: "javascript:alert(1)", missingPurchaseLabel: "Wait" } }));
    expect(html).not.toContain("<section"); expect(html).not.toContain("javascript:");
    const visible = renderToStaticMarkup(createElement(CinematicChickFilA, { content: content(), purchase: { purchaseUrl: "https://tickets.example.test/event", missingPurchaseLabel: "Wait" } }));
    expect(visible).toContain('href="https://tickets.example.test/event"'); expect(visible).not.toContain("disabled");
  });
});
