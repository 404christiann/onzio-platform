import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// RC-SAM-FIXES: a server render never runs effects, so this captures the Roster page's effects and runs them by hand to
// prove the page starts its browser load when the server sent no squad (else it would stay on "Loading the squad…").
const mocks = vi.hoisted(() => ({ effects: [] as Array<() => void | (() => void)>, roster: vi.fn(), staff: vi.fn() }));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useEffect: (effect: () => void | (() => void)) => { mocks.effects.push(effect); } };
});
vi.mock("@/lib/queries", () => ({ fetchRoster: mocks.roster, fetchStaff: mocks.staff, fetchClubBranding: vi.fn() }));
import { ClubContextProvider } from "@/components/ClubContextProvider";
import { ClubBrandingProvider } from "@/components/ClubBrandingProvider";
import CinematicRosterPage, { type CinematicRosterInitial } from "@/components/cinematic/CinematicRosterPage";
import type { ClubContext } from "@/lib/club-context";

const club: ClubContext = { id: "11111111-1111-4111-8111-111111111111", slug: "sample", name: "Sample Club", primaryDomain: "sample.localhost", lifecycle: "active", publicAccess: "live", kind: "test", stripePriceId: null, tier: "pro", role: null, primaryColor: "#ff0018", secondaryColor: "#141414", presentationTemplateKey: "cinematic@2", storeEnabled: true, publicPageVisibility: {} };
const roster = { seasonId: "s", seasonLabel: "2027", goalkeepers: [], defenders: [], midfielders: [], forwards: [] };

function renderAndRunEffects(initial?: CinematicRosterInitial) {
  // Children go in as createElement's third argument; the casts only drop `children` from the props object's type.
  const brandingProps = { initialBranding: { logoPath: "/logo.webp", inverseLogoPath: "/logo.webp", footerTagline: "Sample City" } } as ComponentProps<typeof ClubBrandingProvider>;
  const html = renderToStaticMarkup(createElement(ClubContextProvider, { club } as ComponentProps<typeof ClubContextProvider>,
    createElement(ClubBrandingProvider, brandingProps, createElement(CinematicRosterPage, { initial }))));
  const cleanups = mocks.effects.splice(0).map(effect => effect());
  return { html, cleanups };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.effects.length = 0;
  mocks.roster.mockResolvedValue(roster);
  mocks.staff.mockResolvedValue([]);
});

describe("cinematic Roster page starts its browser load", () => {
  it("fetches the squad and staff for the club when the server sent nothing", () => {
    const { html, cleanups } = renderAndRunEffects();
    expect(html).toContain("Loading the squad");
    expect(mocks.roster).toHaveBeenCalledWith(undefined, club.id);
    expect(mocks.staff).toHaveBeenCalledWith(club.id);
    // The load hands React its cancel, so a club change drops the old club's late result.
    expect(cleanups.some(cleanup => typeof cleanup === "function")).toBe(true);
  });
  it("fetches nothing when the server already sent the squad, or its failure", () => {
    renderAndRunEffects({ roster, staff: [], failed: false });
    renderAndRunEffects({ roster: null, failed: true });
    expect(mocks.roster).not.toHaveBeenCalled();
    expect(mocks.staff).not.toHaveBeenCalled();
  });
});
