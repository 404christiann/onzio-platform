import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ClubContextProvider } from "@/components/ClubContextProvider";
import { ClubBrandingProvider } from "@/components/ClubBrandingProvider";
import CinematicRoster, { type CinematicRosterData } from "@/components/cinematic/CinematicRoster";
import type { ClubContext } from "@/lib/club-context";
import type { Player } from "@/lib/data";

// The supplied branding context makes no network request in this SSR render.
// Avoid constructing the browser Supabase client in a pure renderer contract.
vi.mock("@/lib/queries", () => ({ fetchClubBranding: vi.fn() }));

const club: ClubContext = { id: "11111111-1111-4111-8111-111111111111", slug: "sample", name: "Sample Club", primaryDomain: "sample.localhost", lifecycle: "active", publicAccess: "live", kind: "test", stripePriceId: null, tier: "pro", role: null, primaryColor: "#ff0018", secondaryColor: "#141414", presentationTemplateKey: "cinematic@2", storeEnabled: true };
const field: Player = { id: "22222222-2222-4222-8222-222222222222", number: 5, name: "Sample Defender", nationality: "American", position: "Defender", height: "6 ft", weight: "160 lbs", hometown: "Sample City", age: 25, image: "/defender.webp", stats: { goals: 7, assists: 2, tackles: 3, starts: 4, yellow: 0, red: 0, mins: 450, offsides: 0, fouls: 0, foulsSuffered: 0 } };
const keeper: Player = { ...field, id: "33333333-3333-4333-8333-333333333333", number: 1, name: "Sample Keeper", position: "Goalkeeper", image: "/keeper.webp", stats: { saves: 11, goalsAgainst: 1, cleanSheets: 3, starts: 4, yellow: 0, red: 0, mins: 400 } };
const empty: CinematicRosterData = { seasonId: "44444444-4444-4444-8444-444444444444", seasonLabel: "2027", defenders: [], midfielders: [], forwards: [], goalkeepers: [] };
function render(roster: CinematicRosterData) {
  return renderToStaticMarkup(createElement(ClubContextProvider, { club, children:
    createElement(ClubBrandingProvider, { initialBranding: { logoPath: "/logo.webp", inverseLogoPath: "/logo.webp", footerTagline: "Sample City" }, children:
      createElement(CinematicRoster, { roster }) }) }));
}
describe("cinematic roster consumes shared player data", () => {
  it("shows real player identities, media, season and appropriate field/goalkeeper totals", () => {
    const html = render({ ...empty, defenders: [field], goalkeepers: [keeper] });
    for (const text of ["2027 Season", "Sample Defender", "Sample Keeper", "/defender.webp", "/keeper.webp", '<strong>7</strong>', '<strong>11</strong>', "Clean sheets", "Assists", "Sample City"]) expect(html).toContain(text);
    expect(html).toContain('aria-haspopup="dialog"');
    // Clubhouse's existing .roster-page sets --display to a color and adds a
    // pseudo-header. The new presentation must never share that root class.
    expect(html).toContain('class="cinematic-roster"');
    expect(html).not.toContain('class="roster-page"');
    expect(html).not.toContain('class="roster-group"');
    expect(html).toContain('data-player-id="22222222-2222-4222-8222-222222222222"');
    expect(html).not.toContain("Midfielders");
  });
  it("keeps player input order intact, displays a stable number order, and handles an empty cohort honestly", () => {
    const lower: Player = { ...field, id: "55555555-5555-4555-8555-555555555555", number: 2, name: "Earlier Number" };
    const roster = { ...empty, defenders: [field, lower] };
    const html = render(roster);
    expect(html.indexOf('data-player-id="55555555')).toBeLessThan(html.indexOf('data-player-id="22222222'));
    expect(roster.defenders[0]).toBe(field);
    const noPlayers = render(empty);
    expect(noPlayers).toContain("The squad will be announced soon.");
    expect(noPlayers).not.toContain('class="squad-card"');
  });
});
