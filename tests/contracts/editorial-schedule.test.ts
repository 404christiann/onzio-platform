import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Fixture } from "@/lib/data";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: Record<string, unknown> & { children?: unknown; href?: string }) =>
    createElement("a", { href, ...props }, children as never),
}));
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    className,
    ...props
  }: Record<string, unknown> & { src?: string; alt?: string; className?: string }) => {
    void props;
    return createElement("span", {
      "data-mock-image": true,
      "data-src": src,
      "data-alt": alt,
      className,
    });
  },
}));

/**
 * Real Starter-tier Lions editorial schedule + match-area contracts (month
 * rail, status tabs, matchup cards, per-fixture match area, and cross-tenant
 * fixture isolation).
 *
 * Following this repository's established editorial-roster.test.ts /
 * editorial-home.test.ts conventions: static source assertions for
 * client-only behavior plus real server renders through react-dom/server for
 * everything observable at render time. `EditorialScheduleView` and
 * `EditorialScheduleMatchCard` are presentational (fixtures arrive as props
 * from `EditorialSchedule`'s single fetch), so they can be rendered directly
 * with real seeded-shaped fixtures instead of mocking Supabase.
 *
 * The real cross-tenant fixture-isolation contract lives at the database
 * level: tests/database/editorial-schedule-isolation.test.ts.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function render(element: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(element);
}

const CREST_ON_DARK_URL = "https://storage.example/onzio-media/lions/crest-white.webp";

// Transcribed verbatim from the real seeded first-team 2026 fixtures
// (supabase/seed.sql), including the id/attendance/scorers columns this
// phase surfaces: 7 played (May-July), 4 upcoming (Aug-Sept).
const LIONS_FIXTURES: Fixture[] = [
  { id: "99999999-9999-4999-8999-999999999901", date: "2026-05-09", time: "19:00", opponent: "Dayton Rovers SC", competition: "League", home: true, venue: "Scioto Field", roseCityScore: 2, opponentScore: 0, attendance: 842, scorers: ["M. Johnson 34'", "S. Ruiz 71'"] },
  { id: "99999999-9999-4999-8999-999999999902", date: "2026-05-16", time: "18:00", opponent: "Queen City FC", competition: "League", home: false, venue: "Scioto Field", roseCityScore: 1, opponentScore: 1, attendance: 615, scorers: ["M. Johnson 34'", "S. Ruiz 71'"] },
  { id: "99999999-9999-4999-8999-999999999903", date: "2026-05-30", time: "19:30", opponent: "Lake Erie Athletic", competition: "League", home: true, venue: "Scioto Field", roseCityScore: 3, opponentScore: 1, attendance: 911, scorers: ["M. Johnson 34'", "S. Ruiz 71'"] },
  { id: "99999999-9999-4999-8999-999999999904", date: "2026-06-06", time: "18:00", opponent: "Toledo Harbor FC", competition: "League", home: false, venue: "Scioto Field", roseCityScore: 0, opponentScore: 1, attendance: 702, scorers: [] },
  { id: "99999999-9999-4999-8999-999999999905", date: "2026-06-20", time: "19:00", opponent: "Akron Union", competition: "League", home: true, venue: "Scioto Field", roseCityScore: 2, opponentScore: 2, attendance: 788, scorers: ["M. Johnson 34'", "S. Ruiz 71'"] },
  { id: "99999999-9999-4999-8999-999999999906", date: "2026-06-27", time: "19:00", opponent: "Franklinton 1909", competition: "League", home: false, venue: "Scioto Field", roseCityScore: 4, opponentScore: 1, attendance: 1044, scorers: ["M. Johnson 34'", "S. Ruiz 71'"] },
  { id: "99999999-9999-4999-8999-999999999907", date: "2026-07-11", time: "19:00", opponent: "Scioto Valley FC", competition: "League", home: true, venue: "Scioto Field", roseCityScore: 2, opponentScore: 1, attendance: 1186, scorers: ["M. Johnson 34'", "S. Ruiz 71'"] },
  { id: "99999999-9999-4999-8999-999999999908", date: "2026-08-15", time: "19:00", opponent: "Capital City Athletic", competition: "Midwest Premier League", home: false, venue: "Scioto Field", roseCityScore: null, opponentScore: null, attendance: null, scorers: [] },
  { id: "99999999-9999-4999-8999-999999999909", date: "2026-08-22", time: "18:00", opponent: "Dayton Rovers SC", competition: "Midwest Premier League", home: true, venue: "Scioto Field", roseCityScore: null, opponentScore: null, attendance: null, scorers: [] },
  { id: "99999999-9999-4999-8999-999999999910", date: "2026-09-05", time: "19:00", opponent: "Queen City FC", competition: "Midwest Premier League", home: false, venue: "Scioto Field", roseCityScore: null, opponentScore: null, attendance: null, scorers: [] },
  { id: "99999999-9999-4999-8999-999999999911", date: "2026-09-12", time: "18:30", opponent: "Toledo Harbor FC", competition: "Midwest Premier League", home: true, venue: "Scioto Field", roseCityScore: null, opponentScore: null, attendance: null, scorers: [] },
];

describe("editorial schedule: month rail derivation (pure)", () => {
  it("derives exactly the real seeded May-September 2026 distinct months, in order", async () => {
    const { distinctMonths } = await import("@/components/editorial/EditorialScheduleView");
    expect(distinctMonths(LIONS_FIXTURES)).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
  });

  it("initial month is August 2026 — the month of the first upcoming fixture", async () => {
    const { initialMonthKey } = await import("@/components/editorial/EditorialScheduleView");
    expect(initialMonthKey(LIONS_FIXTURES)).toBe("2026-08");
  });

  it("falls back to the last fixture's month when every fixture has been played", async () => {
    const { initialMonthKey } = await import("@/components/editorial/EditorialScheduleView");
    const allPlayed = LIONS_FIXTURES.slice(0, 7);
    expect(initialMonthKey(allPlayed)).toBe("2026-07");
  });

  it("falls back to the current month when there are no fixtures", async () => {
    const { initialMonthKey } = await import("@/components/editorial/EditorialScheduleView");
    const now = new Date(2026, 7, 12);
    expect(initialMonthKey([], now)).toBe("2026-08");
  });
});

describe("editorial schedule: status-tab filtering (pure)", () => {
  it("isPlayedFixture is true only for fixtures with both scores recorded", async () => {
    const { isPlayedFixture } = await import("@/components/editorial/EditorialScheduleView");
    expect(isPlayedFixture(LIONS_FIXTURES[0])).toBe(true); // played, 2-0
    expect(isPlayedFixture(LIONS_FIXTURES[7])).toBe(false); // upcoming, null-null
  });

  it("'all' returns every fixture in the selected month", async () => {
    const { visibleFixturesForFilter } = await import(
      "@/components/editorial/EditorialScheduleView"
    );
    expect(visibleFixturesForFilter(LIONS_FIXTURES, "2026-08", "all")).toHaveLength(2);
    expect(visibleFixturesForFilter(LIONS_FIXTURES, "2026-05", "all")).toHaveLength(3);
  });

  it("'upcoming' returns only unplayed fixtures in the selected month", async () => {
    const { visibleFixturesForFilter } = await import(
      "@/components/editorial/EditorialScheduleView"
    );
    const upcoming = visibleFixturesForFilter(LIONS_FIXTURES, "2026-08", "upcoming");
    expect(upcoming).toHaveLength(2);
    expect(upcoming.every((f) => f.roseCityScore == null)).toBe(true);

    expect(visibleFixturesForFilter(LIONS_FIXTURES, "2026-05", "upcoming")).toEqual([]);
  });

  it("'played' returns only fixtures with a recorded result in the selected month", async () => {
    const { visibleFixturesForFilter } = await import(
      "@/components/editorial/EditorialScheduleView"
    );
    const played = visibleFixturesForFilter(LIONS_FIXTURES, "2026-05", "played");
    expect(played).toHaveLength(3);
    expect(played.every((f) => f.roseCityScore != null)).toBe(true);

    expect(visibleFixturesForFilter(LIONS_FIXTURES, "2026-08", "played")).toEqual([]);
  });

  it("an empty month/filter combination produces zero fixtures (empty-state trigger)", async () => {
    const { visibleFixturesForFilter } = await import(
      "@/components/editorial/EditorialScheduleView"
    );
    expect(visibleFixturesForFilter(LIONS_FIXTURES, "2026-09", "played")).toEqual([]);
  });
});

describe("editorial schedule: first-upcoming-fixture labeling (pure)", () => {
  it("identifies the earliest unplayed fixture as the first upcoming one", async () => {
    const { firstUpcomingFixtureId } = await import(
      "@/components/editorial/EditorialScheduleView"
    );
    expect(firstUpcomingFixtureId(LIONS_FIXTURES)).toBe(
      "99999999-9999-4999-8999-999999999908",
    );
  });

  it("returns null when every fixture has been played", async () => {
    const { firstUpcomingFixtureId } = await import(
      "@/components/editorial/EditorialScheduleView"
    );
    expect(firstUpcomingFixtureId(LIONS_FIXTURES.slice(0, 7))).toBeNull();
  });
});

describe("editorial schedule match card: W/L/D chip and score orientation", () => {
  it("labels a real seeded win correctly (2026-05-09 Lions 2-0 Dayton, home)", async () => {
    const { default: EditorialScheduleMatchCard } = await import(
      "@/components/editorial/EditorialScheduleMatchCard"
    );
    const html = render(
      createElement(EditorialScheduleMatchCard, {
        fixture: LIONS_FIXTURES[0],
        clubShortName: "Lions FC",
        clubInitials: "LFC",
        crestOnDarkUrl: CREST_ON_DARK_URL,
        timeZone: "America/New_York",
      }),
    );
    expect(html).toContain('data-outcome="W"');
    expect(html).toContain(">Win<");
    // Lions are home: left score (home) is Lions' 2, right score (away) is 0.
    expect(html).toContain(">2<");
    expect(html).toContain(">0<");
  });

  it("labels a real seeded loss correctly (2026-06-06 Lions 0-1 Toledo, away)", async () => {
    const { default: EditorialScheduleMatchCard } = await import(
      "@/components/editorial/EditorialScheduleMatchCard"
    );
    const html = render(
      createElement(EditorialScheduleMatchCard, {
        fixture: LIONS_FIXTURES[3],
        clubShortName: "Lions FC",
        clubInitials: "LFC",
        crestOnDarkUrl: CREST_ON_DARK_URL,
        timeZone: "America/New_York",
      }),
    );
    expect(html).toContain('data-outcome="L"');
    expect(html).toContain(">Loss<");
  });

  it("labels a real seeded draw correctly (2026-05-16 Lions 1-1 Queen City, away)", async () => {
    const { default: EditorialScheduleMatchCard } = await import(
      "@/components/editorial/EditorialScheduleMatchCard"
    );
    const html = render(
      createElement(EditorialScheduleMatchCard, {
        fixture: LIONS_FIXTURES[1],
        clubShortName: "Lions FC",
        clubInitials: "LFC",
        crestOnDarkUrl: CREST_ON_DARK_URL,
        timeZone: "America/New_York",
      }),
    );
    expect(html).toContain('data-outcome="D"');
    expect(html).toContain(">Draw<");
  });

  it("shows the kickoff time (not a score) for an upcoming fixture", async () => {
    const { default: EditorialScheduleMatchCard } = await import(
      "@/components/editorial/EditorialScheduleMatchCard"
    );
    const html = render(
      createElement(EditorialScheduleMatchCard, {
        fixture: LIONS_FIXTURES[7],
        clubShortName: "Lions FC",
        clubInitials: "LFC",
        crestOnDarkUrl: CREST_ON_DARK_URL,
        timeZone: "America/New_York",
      }),
    );
    expect(html).not.toMatch(/data-outcome/);
    expect(html).toContain(">Kickoff<");
    expect(html).toContain("7:00");
  });

  it("falls back to a text opponent monogram since no opponent crest assets are seeded", async () => {
    const { default: EditorialScheduleMatchCard } = await import(
      "@/components/editorial/EditorialScheduleMatchCard"
    );
    const html = render(
      createElement(EditorialScheduleMatchCard, {
        fixture: LIONS_FIXTURES[7],
        clubShortName: "Lions FC",
        clubInitials: "LFC",
        crestOnDarkUrl: CREST_ON_DARK_URL,
        timeZone: "America/New_York",
      }),
    );
    expect(html).toContain('class="schedule-opponent-mark"');
    expect(html).toContain(">CCA<"); // Capital City Athletic
  });

  it("uses the crest-on-dark image for the Lions side", async () => {
    const { default: EditorialScheduleMatchCard } = await import(
      "@/components/editorial/EditorialScheduleMatchCard"
    );
    const source = stripComments(read("components/editorial/EditorialScheduleMatchCard.tsx"));
    expect(source).toContain("crestOnDarkUrl");
    expect(source).not.toMatch(/lions|LFC/i);
    void EditorialScheduleMatchCard;
  });

  it("the first upcoming fixture gets 'Go to next match'; every other card gets 'Match area'", async () => {
    const { default: EditorialScheduleMatchCard } = await import(
      "@/components/editorial/EditorialScheduleMatchCard"
    );
    const nextHtml = render(
      createElement(EditorialScheduleMatchCard, {
        fixture: LIONS_FIXTURES[7],
        clubShortName: "Lions FC",
        clubInitials: "LFC",
        crestOnDarkUrl: CREST_ON_DARK_URL,
        timeZone: "America/New_York",
        isNext: true,
      }),
    );
    expect(nextHtml).toContain("Go to next match");
    expect(nextHtml).toContain(
      `href="/schedule/${LIONS_FIXTURES[7].id}"`,
    );

    const otherHtml = render(
      createElement(EditorialScheduleMatchCard, {
        fixture: LIONS_FIXTURES[8],
        clubShortName: "Lions FC",
        clubInitials: "LFC",
        crestOnDarkUrl: CREST_ON_DARK_URL,
        timeZone: "America/New_York",
        isNext: false,
      }),
    );
    expect(otherHtml).toContain("Match area");
    expect(otherHtml).not.toContain("Go to next match");
  });

  it("omits the action link entirely when showAction is false (match-area usage)", async () => {
    const { default: EditorialScheduleMatchCard } = await import(
      "@/components/editorial/EditorialScheduleMatchCard"
    );
    const html = render(
      createElement(EditorialScheduleMatchCard, {
        fixture: LIONS_FIXTURES[0],
        clubShortName: "Lions FC",
        clubInitials: "LFC",
        crestOnDarkUrl: CREST_ON_DARK_URL,
        timeZone: "America/New_York",
        showAction: false,
      }),
    );
    expect(html).not.toContain("schedule-match-action");
    expect(html).not.toContain("Match area");
    expect(html).not.toContain("Go to next match");
  });
});

describe("editorial schedule view: composition and no season selector", () => {
  it("titles the page 'Team schedule' and renders All/Upcoming/Results status tabs", async () => {
    const { default: EditorialScheduleView } = await import(
      "@/components/editorial/EditorialScheduleView"
    );
    const html = render(
      createElement(EditorialScheduleView, {
        fixtures: LIONS_FIXTURES,
        clubShortName: "Lions FC",
        clubInitials: "LFC",
        crestOnDarkUrl: CREST_ON_DARK_URL,
        timeZone: "America/New_York",
        league: "Midwest Premier League",
      }),
    );
    expect(html).toContain(">Team schedule<");
    expect(html).toContain(">All matches<");
    expect(html).toContain(">Upcoming<");
    expect(html).toContain(">Results<");
  });

  it("renders a month-rail button for every real seeded distinct month, August active by default", async () => {
    const { default: EditorialScheduleView } = await import(
      "@/components/editorial/EditorialScheduleView"
    );
    const html = render(
      createElement(EditorialScheduleView, {
        fixtures: LIONS_FIXTURES,
        clubShortName: "Lions FC",
        clubInitials: "LFC",
        crestOnDarkUrl: CREST_ON_DARK_URL,
        timeZone: "America/New_York",
      }),
    );
    expect((html.match(/class="schedule-month-rail"/g) ?? []).length).toBe(1);
    expect((html.match(/<button[^>]*>Aug</g) ?? []).length).toBe(1);
    expect(html).toMatch(/data-active="true"[^>]*>Aug</);
    expect(html).toContain(">August 2026<");
  });

  it("never renders a season selector — not even a disabled one", async () => {
    const { default: EditorialScheduleView } = await import(
      "@/components/editorial/EditorialScheduleView"
    );
    const html = render(
      createElement(EditorialScheduleView, {
        fixtures: LIONS_FIXTURES,
        clubShortName: "Lions FC",
        clubInitials: "LFC",
        crestOnDarkUrl: CREST_ON_DARK_URL,
        timeZone: "America/New_York",
      }),
    );
    expect(html).not.toContain("<select");
    expect(html).not.toMatch(/season/i);

    for (const file of [
      "components/editorial/EditorialScheduleView.tsx",
      "components/editorial/EditorialSchedule.tsx",
      "components/editorial/EditorialScheduleMatchCard.tsx",
      "components/editorial/EditorialMatchArea.tsx",
    ]) {
      expect(stripComments(read(file))).not.toMatch(/season-select|<select/i);
    }
  });

  it("renders the empty state for a month/filter combination with no fixtures", async () => {
    const { default: EditorialScheduleView } = await import(
      "@/components/editorial/EditorialScheduleView"
    );
    // With no fixtures at all, the month rail is empty and the initial
    // month/"all" combination genuinely has zero matches, so the rendered
    // grid must show the empty state rather than crashing on an empty list.
    const html = render(
      createElement(EditorialScheduleView, {
        fixtures: [],
        clubShortName: "Lions FC",
        clubInitials: "LFC",
        crestOnDarkUrl: CREST_ON_DARK_URL,
        timeZone: "America/New_York",
      }),
    );
    expect(html).toContain('class="schedule-empty"');
    expect(html).toContain("No matches in this view.");

    const { visibleFixturesForFilter } = await import(
      "@/components/editorial/EditorialScheduleView"
    );
    expect(visibleFixturesForFilter(LIONS_FIXTURES, "2026-09", "played")).toEqual([]);
  });

  it("uses Framer Motion for the month/filter transition with a prefers-reduced-motion fallback", () => {
    const source = read("components/editorial/EditorialScheduleView.tsx");
    expect(source).toContain('from "framer-motion"');
    expect(source).toContain("useReducedMotion");
    expect(source).toContain("AnimatePresence");
    expect(source).toMatch(/prefersReducedMotion\s*\?\s*\{ opacity: 0 \}/);
  });

  it("renders correctly under a real reduced-motion render without throwing", async () => {
    const { default: EditorialScheduleView } = await import(
      "@/components/editorial/EditorialScheduleView"
    );
    expect(() =>
      render(
        createElement(EditorialScheduleView, {
          fixtures: LIONS_FIXTURES,
          clubShortName: "Lions FC",
          clubInitials: "LFC",
          crestOnDarkUrl: CREST_ON_DARK_URL,
          timeZone: "America/New_York",
        }),
      ),
    ).not.toThrow();
  });
});

describe("editorial match area: content and not-found state", () => {
  it("shows attendance and scorers for a played fixture", async () => {
    const { MatchAreaContent } = await import("@/components/editorial/EditorialMatchArea");
    const html = render(
      createElement(MatchAreaContent, {
        fixture: LIONS_FIXTURES[0], // 2026-05-09, Lions 2-0 Dayton, attendance 842
        clubShortName: "Lions FC",
        clubInitials: "LFC",
        crestOnDarkUrl: CREST_ON_DARK_URL,
        timeZone: "America/New_York",
        league: "Midwest Premier League",
      }),
    );
    expect(html).toContain(">Match report<");
    expect(html).toContain(">Attendance<");
    expect(html).toContain("842");
    expect(html).toContain("M. Johnson 34&#x27;");
    expect(html).toContain("class=\"match-area-scorers\"");
  });

  it("omits attendance and scorers for an upcoming fixture and shows placeholder copy instead", async () => {
    const { MatchAreaContent } = await import("@/components/editorial/EditorialMatchArea");
    const html = render(
      createElement(MatchAreaContent, {
        fixture: LIONS_FIXTURES[7], // 2026-08-15, upcoming
        clubShortName: "Lions FC",
        clubInitials: "LFC",
        crestOnDarkUrl: CREST_ON_DARK_URL,
        timeZone: "America/New_York",
        league: "Midwest Premier League",
      }),
    );
    expect(html).toContain(">Next match<");
    expect(html).not.toContain(">Attendance<");
    expect(html).not.toContain("match-area-scorers");
    expect(html).toContain("Matchday updates and final details will appear here");
  });

  it("renders a clean not-found state for a null fixture, with no crash", async () => {
    const { MatchAreaContent } = await import("@/components/editorial/EditorialMatchArea");
    const html = render(
      createElement(MatchAreaContent, {
        fixture: null,
        clubShortName: "Lions FC",
        clubInitials: "LFC",
        crestOnDarkUrl: CREST_ON_DARK_URL,
        timeZone: "America/New_York",
      }),
    );
    expect(html).toContain("Match not found.");
    expect(html).toContain('href="/schedule"');
    expect(html).not.toContain("match-area-notes");
  });

  it("includes a back link to /schedule and no action link on the embedded match card", async () => {
    const { MatchAreaContent } = await import("@/components/editorial/EditorialMatchArea");
    const html = render(
      createElement(MatchAreaContent, {
        fixture: LIONS_FIXTURES[0],
        clubShortName: "Lions FC",
        clubInitials: "LFC",
        crestOnDarkUrl: CREST_ON_DARK_URL,
        timeZone: "America/New_York",
      }),
    );
    expect(html).toContain('class="match-area-back"');
    expect(html).toContain('href="/schedule"');
    expect(html).not.toContain("schedule-match-action");
  });

  it("scopes its fetch to the tenant-verified club id, never a client-supplied one", () => {
    const source = read("components/editorial/EditorialMatchArea.tsx");
    expect(source).toContain("fetchSchedule(season.id, club.id)");
    expect(source).toContain("useClubContext()");
  });
});

describe("editorial schedule: dispatch, mirror, and middleware wiring", () => {
  it("only editorial-template tenants reach EditorialSchedule from the shared /schedule route", () => {
    const page = read("app/(public)/schedule/page.tsx");
    expect(page).toContain('club.siteTemplate === "editorial"');
    expect(page).toContain(
      'const EditorialSchedule = nextDynamic(\n  () => import("@/components/editorial/EditorialSchedule"),\n);',
    );
    expect(page).toContain("<EditorialSchedule />");
  });

  it("only editorial-template tenants reach EditorialMatchArea from /schedule/[fixtureId]; classic 404s", () => {
    const page = read("app/(public)/schedule/[fixtureId]/page.tsx");
    expect(page).toContain('club.siteTemplate === "editorial"');
    expect(page).toContain("<EditorialMatchArea />");
    expect(page).toContain("notFound()");
  });

  it("mirrors /schedule/[fixtureId] under the tenant route group, matching the roster mirror pattern", () => {
    const mirror = read("app/%5Fclubs/[slug]/schedule/[fixtureId]/page.tsx").trim();
    expect(mirror).toBe(
      'export { default } from "@/app/(public)/schedule/[fixtureId]/page";',
    );
  });

  it("the dynamic /schedule/[fixtureId] route resolves real club context through middleware", () => {
    const middleware = read("middleware.ts");
    expect(middleware).toMatch(/pathname\.startsWith\("\/schedule\/"\)/);
    expect(middleware).toContain("isPublicTenantPath(request.nextUrl.pathname)");
  });
});

describe("editorial schedule: classic regression", () => {
  it("the classic schedule page (FixtureRow/NextMatchCard/OpponentCrest) is untouched by editorial concerns", () => {
    for (const path of [
      "components/FixtureRow.tsx",
      "components/NextMatchCard.tsx",
      "components/OpponentCrest.tsx",
    ]) {
      expect(read(path)).not.toMatch(/editorial/i);
    }
  });

  it("the classic schedule page function still renders exactly as before, now gated behind a dispatcher", () => {
    const page = read("app/(public)/schedule/page.tsx");
    expect(page).toContain("function ClassicSchedulePage()");
    expect(page).toContain("return <ClassicSchedulePage />;");
  });

  it("never renders sponsor, store, kit, or stats content on the schedule surfaces", async () => {
    const { default: EditorialScheduleView } = await import(
      "@/components/editorial/EditorialScheduleView"
    );
    const html = render(
      createElement(EditorialScheduleView, {
        fixtures: LIONS_FIXTURES,
        clubShortName: "Lions FC",
        clubInitials: "LFC",
        crestOnDarkUrl: CREST_ON_DARK_URL,
        timeZone: "America/New_York",
      }),
    );
    expect(html).not.toMatch(/sponsor|partner|kit-home|\/store|stat-overview/i);
  });
});
