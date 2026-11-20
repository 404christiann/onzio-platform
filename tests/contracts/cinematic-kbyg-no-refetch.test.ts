import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hydrateTicketPage } from "@/lib/cinematic-ticket-pages-content";
import { knowBeforeYouGoReferenceContent } from "@/lib/ticket-pages-reference-content";
import type { KnowBeforeYouGoMatch } from "@/components/cinematic/know-before-you-go-match";

// RC-CLS-2: Know Before You Go's match box is read on the server. When it was, the page must not fetch it again in the
// browser: refetching resets the box to its loading line, which is the ~160 px jump this package removed, and reads twice.
const CLUB_ID = "00000000-0000-4000-8000-000000000001";
const TIME_ZONE = "America/Los_Angeles";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  effects: [] as Array<{ effect: () => unknown; deps?: readonly unknown[] }>,
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  // The server renderer never runs effects; capture them so the test can run the match-box effect by hand.
  return { ...actual, useEffect: (effect: () => unknown, deps?: readonly unknown[]) => { mocks.effects.push({ effect, deps }); } };
});
vi.mock("@/components/cinematic/know-before-you-go-match", () => ({ loadKnowBeforeYouGoMatch: mocks.load }));
vi.mock("@/components/ClubContextProvider", () => ({ useClubContext: () => ({ id: CLUB_ID, name: "Rose City FC" }) }));
vi.mock("@/components/ClubTimeZoneProvider", () => ({ useClubTimeZone: () => TIME_ZONE }));
vi.mock("@/components/ClubBrandingProvider", () => ({ useClubBranding: () => ({ clubLogoUrl: "/crest.png", brandingPending: false }) }));
vi.mock("@/components/cinematic/CinematicContent", () => ({ useCinematicContent: () => ({ content: { match: { emptyMessage: "Shared announcement" } } }) }));
vi.mock("@/components/ResilientNativeImage", () => ({ default: (props: Record<string, unknown>) => createElement("img", props) }));

import CinematicKnowBeforeYouGo from "@/components/cinematic/CinematicKnowBeforeYouGo";

const content = hydrateTicketPage("know-before-you-go", structuredClone(knowBeforeYouGoReferenceContent), []);
const served: KnowBeforeYouGoMatch = {
  loading: false, clubShortName: "RCFC", youtubeChannel: "",
  fixture: { date: "2027-03-20", time: "19:45", opponent: "Orange County FC", opponentShortName: "OCFC", competition: "UPSL Premier", home: true, venue: "Robinson Stadium" },
};

/** Runs the one effect keyed on the club and its time zone (the match-box fetch), as the browser would after hydrating. */
function runMatchEffect() {
  const matchEffects = mocks.effects.splice(0).filter(({ deps }) => deps?.[0] === CLUB_ID && deps?.[1] === TIME_ZONE);
  expect(matchEffects).toHaveLength(1);
  const cleanup = matchEffects[0].effect();
  if (typeof cleanup === "function") cleanup();
}

beforeEach(() => {
  mocks.load.mockReset().mockResolvedValue(served);
  mocks.effects.length = 0;
});

describe("Know Before You Go match box in the browser", () => {
  it("does not fetch the match again when the server already loaded it", () => {
    const html = renderToStaticMarkup(createElement(CinematicKnowBeforeYouGo, { content, initialMatch: served }));
    expect(html).toContain("<strong>OCFC</strong>");
    expect(html).not.toContain("Loading next home match");
    runMatchEffect();
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("fetches it in the browser when the server did not (failed read, or the admin preview)", () => {
    const html = renderToStaticMarkup(createElement(CinematicKnowBeforeYouGo, { content }));
    expect(html).toContain("Loading next home match…");
    runMatchEffect();
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.load).toHaveBeenCalledWith(CLUB_ID, TIME_ZONE, expect.any(Date));
  });
});
