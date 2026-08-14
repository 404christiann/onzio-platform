import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Fixture } from "@/lib/data";
import {
  firstUpcomingFixtureId,
  isPlayedFixture,
  outcomeForFixture,
} from "@/lib/editorial-fixtures";

/**
 * Real Starter-tier editorial@1 schedule + match-area contracts (fixtures
 * row-list composition, W/L/D outcome resolution, match-area
 * attendance/scorers surfacing, dispatch wiring, and a classic/clubhouse/
 * academy regression check).
 *
 * Adapted from the superseded claude/lions-fc-website-setup-ij0p7t reference
 * branch's tests/contracts/editorial-schedule.test.ts for this branch's real
 * schema and test infrastructure, following the same house convention
 * tests/contracts/editorial-home.test.ts (E3) and
 * tests/contracts/editorial-roster.test.ts (E4) established: no
 * react-dom/server rendering (this repo's vitest.config.ts has no
 * JSX-transform plugin), just source-scan assertions plus real functional
 * assertions against the pure outcome helpers E4 added
 * to lib/editorial-fixtures.ts (a plain, non-JSX module already used for
 * this purpose since E3).
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// Transcribed in the same shape as the real seeded first-team 2026
// fixtures (see supabase/seed.sql / tests/contracts/editorial-home.test.ts's
// own LIONS_FIXTURES), extended with the id/attendance/scorers columns this
// phase surfaces: 7 played (May-July), 4 upcoming (Aug-Sept).
const LIONS_FIXTURES: Fixture[] = [
  { id: "f1", date: "2026-05-09", time: "19:00", opponent: "Dayton Rovers SC", competition: "League", home: true, venue: "Scioto Field", roseCityScore: 2, opponentScore: 0, attendance: 842, scorers: ["M. Johnson 34'", "S. Ruiz 71'"] },
  { id: "f2", date: "2026-05-16", time: "18:00", opponent: "Queen City FC", competition: "League", home: false, venue: "Scioto Field", roseCityScore: 1, opponentScore: 1, attendance: 615, scorers: ["M. Johnson 12'"] },
  { id: "f3", date: "2026-05-30", time: "19:30", opponent: "Lake Erie Athletic", competition: "League", home: true, venue: "Scioto Field", roseCityScore: 3, opponentScore: 1, attendance: 911, scorers: ["S. Ruiz 5'", "S. Ruiz 40'", "A. Brooks 88'"] },
  { id: "f4", date: "2026-06-06", time: "18:00", opponent: "Toledo Harbor FC", competition: "League", home: false, venue: "Scioto Field", roseCityScore: 0, opponentScore: 1, attendance: 702, scorers: [] },
  { id: "f5", date: "2026-06-20", time: "19:00", opponent: "Akron Union", competition: "League", home: true, venue: "Scioto Field", roseCityScore: 2, opponentScore: 2, attendance: 788, scorers: ["M. Johnson 60'", "S. Ruiz 75'"] },
  { id: "f6", date: "2026-06-27", time: "19:00", opponent: "Franklinton 1909", competition: "League", home: false, venue: "Scioto Field", roseCityScore: 4, opponentScore: 1, attendance: 1044, scorers: ["M. Johnson 10'", "S. Ruiz 20'", "A. Brooks 55'", "T. Santos 90'"] },
  { id: "f7", date: "2026-07-11", time: "19:00", opponent: "Scioto Valley FC", competition: "League", home: true, venue: "Scioto Field", roseCityScore: 2, opponentScore: 1, attendance: 1186, scorers: ["M. Johnson 30'", "S. Ruiz 65'"] },
  { id: "f8", date: "2026-08-15", time: "19:00", opponent: "Capital City Athletic", competition: "Midwest Premier League", home: false, venue: "Scioto Field", roseCityScore: null, opponentScore: null, attendance: null, scorers: [] },
  { id: "f9", date: "2026-08-22", time: "18:00", opponent: "Dayton Rovers SC", competition: "Midwest Premier League", home: true, venue: "Scioto Field", roseCityScore: null, opponentScore: null, attendance: null, scorers: [] },
  { id: "f10", date: "2026-09-05", time: "19:00", opponent: "Queen City FC", competition: "Midwest Premier League", home: false, venue: "Scioto Field", roseCityScore: null, opponentScore: null, attendance: null, scorers: [] },
  { id: "f11", date: "2026-09-12", time: "18:30", opponent: "Toledo Harbor FC", competition: "Midwest Premier League", home: true, venue: "Scioto Field", roseCityScore: null, opponentScore: null, attendance: null, scorers: [] },
];

describe("editorial schedule: played-state helper (lib/editorial-fixtures.ts)", () => {
  it("isPlayedFixture is true only for fixtures with both scores recorded", () => {
    expect(isPlayedFixture(LIONS_FIXTURES[0])).toBe(true);
    expect(isPlayedFixture(LIONS_FIXTURES[7])).toBe(false);
  });
});

describe("editorial schedule: first-upcoming-fixture labeling (lib/editorial-fixtures.ts)", () => {
  it("identifies the earliest unplayed fixture as the first upcoming one", () => {
    expect(firstUpcomingFixtureId(LIONS_FIXTURES)).toBe("f8");
  });

  it("returns null when every fixture has been played", () => {
    expect(firstUpcomingFixtureId(LIONS_FIXTURES.slice(0, 7))).toBeNull();
  });
});

describe("editorial schedule: W/L/D outcome resolution (lib/editorial-fixtures.ts)", () => {
  it("resolves a real seeded win regardless of home/away side (2026-05-09 Lions 2-0 Dayton, home)", () => {
    expect(outcomeForFixture(LIONS_FIXTURES[0])).toBe("W");
  });

  it("resolves a real seeded loss (2026-06-06 Lions 0-1 Toledo, away)", () => {
    expect(outcomeForFixture(LIONS_FIXTURES[3])).toBe("L");
  });

  it("resolves a real seeded draw (2026-05-16 Lions 1-1 Queen City, away)", () => {
    expect(outcomeForFixture(LIONS_FIXTURES[1])).toBe("D");
  });

  it("returns null for an unplayed fixture", () => {
    expect(outcomeForFixture(LIONS_FIXTURES[7])).toBeNull();
  });
});

describe("editorial schedule match card", () => {
  it("shows the kickoff time (not a score) for an upcoming fixture, and a W/L/D chip otherwise", () => {
    const source = read("components/editorial/EditorialScheduleMatchCard.tsx");
    expect(source).toContain("outcome ? (");
    expect(source).toContain(">Kickoff</span>");
    expect(source).toContain('data-outcome={outcome}');
  });

  it("falls back to a text monogram for both sides using the shared lib/editorial-fixtures.ts monogram(), not a duplicated helper", () => {
    const source = stripComments(read("components/editorial/EditorialScheduleMatchCard.tsx"));
    expect(source).toContain('import {\n  fixtureKickoff,\n  monogram,\n  outcomeForFixture,\n  type MatchOutcome,\n} from "@/lib/editorial-fixtures";');
    expect(source).toContain("monogram(fixture.opponent)");
    expect(source).not.toMatch(/lions|LFC/i);
  });

  it("uses the crest-on-dark image for the club side, never a hardcoded club asset", () => {
    const source = read("components/editorial/EditorialScheduleMatchCard.tsx");
    expect(source).toContain("crestOnDarkUrl");
  });

  it("shows an action link to /schedule/[fixtureId] labeled 'Go to next match' when isNext, otherwise 'Match area', and omits it when showAction is false", () => {
    const source = read("components/editorial/EditorialScheduleMatchCard.tsx");
    expect(source).toContain('href={`/schedule/${fixture.id}`}');
    expect(source).toContain('isNext ? "Go to next match" : "Match area"');
    expect(source).toContain("showAction && fixture.id &&");
  });

  it("does not do timezone-aware date/time formatting -- browser-local only, matching EditorialNextMatch.tsx's established E3 precedent", () => {
    const source = stripComments(read("components/editorial/EditorialScheduleMatchCard.tsx"));
    expect(source).not.toMatch(/timeZone/);
  });
});

describe("editorial schedule view: composition and no season selector", () => {
  it("renders the approved fixtures hero and a single unfiltered row list", () => {
    const source = read("components/editorial/EditorialScheduleView.tsx");
    expect(source).toContain('className="interior-hero fixtures-hero"');
    expect(source).toContain("const seasonEyebrow = /\\bseason$/i.test(seasonLabel.trim())");
    expect(source).toContain("{seasonEyebrow}");
    expect(source).toContain("<h1>Fixtures</h1>");
    expect(source).toContain('className="fixtures-colhead"');
    expect(source).toContain('className="fixtures-list"');
    expect(source).toContain('className="fixture-row"');
    expect(source).toContain('String(index + 1).padStart(2, "0")');
    expect(source).toContain('href={`/schedule/${fixture.id}`}');
    expect(source).toContain('data-past={isPast || undefined}');
    expect(source).toContain('data-has-result={isPlayed || undefined}');
  });

  it("never renders a season selector -- not even a disabled one", () => {
    for (const file of [
      "components/editorial/EditorialScheduleView.tsx",
      "components/editorial/EditorialSchedule.tsx",
      "components/editorial/EditorialScheduleMatchCard.tsx",
      "components/editorial/EditorialMatchArea.tsx",
    ]) {
      expect(stripComments(read(file))).not.toMatch(/season-select|<select/i);
    }
  });

  it("removes the prior month/status filter UI and component-level Motion transition", () => {
    const source = read("components/editorial/EditorialScheduleView.tsx");
    expect(source).toContain('from "@/lib/editorial-fixtures"');
    expect(source).not.toContain("schedule-month-rail");
    expect(source).not.toContain("schedule-filter-panel");
    expect(source).not.toContain("visibleFixturesForFilter");
    expect(source).not.toContain("distinctMonths");
    expect(source).not.toContain("initialMonthKey");
    expect(source).not.toContain('from "motion/react"');
    expect(source).not.toContain('from "framer-motion"');
    expect(source).not.toContain("useReducedMotion");
    expect(source).not.toContain("AnimatePresence");
  });

  it("renders the reference empty state and fixtures footnote", () => {
    const source = read("components/editorial/EditorialScheduleView.tsx");
    expect(source).toContain('className="schedule-empty"');
    expect(source).toContain("Schedule coming soon");
    expect(source).toContain("No official fixtures have been published yet.");
    expect(source).toContain("Match details and venues are subject to change.");
  });

  it("passes the active season label from EditorialSchedule and stops passing league chrome", () => {
    const source = read("components/editorial/EditorialSchedule.tsx");
    expect(source).toContain('const [seasonLabel, setSeasonLabel] = useState("Current");');
    expect(source).toContain('setSeasonLabel(season?.label ?? "Current")');
    expect(source).toContain("<EditorialScheduleView fixtures={fixtures} seasonLabel={seasonLabel} />");
    expect(source).not.toContain("identity?.league");
    expect(source).not.toContain("crestOnDarkUrl");
  });
});

describe("editorial match area: attendance/scorers and not-found state", () => {
  it("surfaces attendance and scorers only for a played fixture, from the new Fixture.attendance/scorers fields", () => {
    const source = stripComments(read("components/editorial/EditorialMatchArea.tsx"));
    expect(source).toContain("played && fixture.attendance != null");
    expect(source).toContain("fixture.attendance.toLocaleString()");
    expect(source).toContain("played && scorers.length > 0");
    expect(source).toContain('scorers.join(" · ")');
  });

  it("renders a clean not-found state for a null fixture, linking back to /schedule", () => {
    const source = read("components/editorial/EditorialMatchArea.tsx");
    expect(source).toContain("if (!fixture) {");
    expect(source).toContain("Match not found.");
    expect(source).toContain('<Link href="/schedule">Return to the schedule</Link>');
  });

  it("embeds the schedule match card with showAction={false} and no season/kit/sponsor content", () => {
    const source = stripComments(read("components/editorial/EditorialMatchArea.tsx"));
    expect(source).toContain("showAction={false}");
    expect(source).not.toMatch(/sponsor|partner|kit-home|\/store/i);
  });

  it("scopes its fixture lookup to the tenant-verified club id via useClubContext(), never a client-supplied one", () => {
    const source = read("components/editorial/EditorialMatchArea.tsx");
    expect(source).toContain("useClubContext()");
    expect(source).toContain("fetchSchedule(season.id, club.id)");
  });

  it("accepts fixtureId as a prop (not useParams()), matching ClubhouseMatchAreaPage's own calling convention", () => {
    const source = read("components/editorial/EditorialMatchArea.tsx");
    expect(source).toContain(
      "export default function EditorialMatchArea({ fixtureId }: { fixtureId: string }) {",
    );
    // The doc comment explains the *absence* of useParams(); real code never
    // imports or calls it.
    expect(stripComments(source)).not.toMatch(/from "next\/navigation"/);
    expect(stripComments(source)).not.toContain("useParams(");
  });
});

describe("editorial schedule + match-area: dispatch and classic regression", () => {
  it("dispatches editorial@1 tenants to EditorialSchedule from the shared /schedule route, above the clubhouse@1 branch", () => {
    const page = read("app/(public)/schedule/page.tsx");
    expect(page).toContain(
      'import EditorialSchedule from "@/components/editorial/EditorialSchedule";',
    );
    const editorialIndex = page.indexOf(
      'if (club.presentationTemplateKey === "editorial@1") return <EditorialSchedule />;',
    );
    const clubhouseIndex = page.indexOf(
      'if (club.presentationTemplateKey === "clubhouse@1") return <ClubhouseSchedulePage />;',
    );
    expect(editorialIndex).toBeGreaterThan(-1);
    expect(clubhouseIndex).toBeGreaterThan(editorialIndex);
  });

  it("dispatches editorial@1 tenants to EditorialMatchArea from /schedule/[fixtureId]; every other template still gets ClubhouseMatchAreaPage unconditionally, unchanged", () => {
    const page = read("app/(public)/schedule/[fixtureId]/page.tsx");
    expect(page).toContain(
      'import ClubhouseMatchAreaPage from "@/components/ClubhouseMatchAreaPage";',
    );
    expect(page).toContain(
      'import EditorialMatchArea from "@/components/editorial/EditorialMatchArea";',
    );
    expect(page).toContain('club?.presentationTemplateKey === "editorial@1"');
    expect(page).toContain("<EditorialMatchArea fixtureId={fixtureId} />");
    expect(page).toContain("<ClubhouseMatchAreaPage fixtureId={fixtureId} />");
  });

  it("resolves club context for the match-area route via the host header + getClubContext, the same real precedent app/admin/(protected)/layout.tsx already uses for a slug-less server component", () => {
    const page = read("app/(public)/schedule/[fixtureId]/page.tsx");
    expect(page).toContain('import { headers } from "next/headers";');
    expect(page).toContain('import { getClubContext } from "@/lib/club-context";');
    expect(page).toContain('requestHeaders.get("host")');
  });

  it("mirrors /schedule/[fixtureId] and /roster under the tenant route group by plain re-export, unchanged", () => {
    expect(read("app/%5Fclubs/[slug]/schedule/[fixtureId]/page.tsx").trim()).toBe(
      'export { default } from "@/app/(public)/schedule/[fixtureId]/page";',
    );
    expect(read("app/%5Fclubs/[slug]/roster/page.tsx").trim()).toBe(
      'export { default } from "@/app/(public)/roster/page";',
    );
    expect(read("app/%5Fclubs/[slug]/schedule/page.tsx").trim()).toBe(
      'export { default } from "@/app/(public)/schedule/page";',
    );
  });

  it("the classic schedule/match-area components (FixtureRow/NextMatchCard/OpponentCrest/ClubhouseMatchAreaPage) are untouched by editorial concerns", () => {
    for (const path of [
      "components/FixtureRow.tsx",
      "components/AcademyFixtureRow.tsx",
      "components/NextMatchCard.tsx",
      "components/OpponentCrest.tsx",
      "components/ClubhouseSchedulePage.tsx",
      "components/ClubhouseMatchAreaPage.tsx",
    ]) {
      expect(read(path)).not.toMatch(/editorial/i);
    }
  });

  it("fetchSchedule's mapping additively surfaces attendance/scorers without changing any other Fixture field", () => {
    const source = read("lib/queries.ts");
    const mapFixtureBody = source.slice(
      source.indexOf("function mapFixture(row: DBMatch): Fixture {"),
      source.indexOf("function mapFixture(row: DBMatch): Fixture {") + 700,
    );
    expect(mapFixtureBody).toContain("roseCityScore: row.rose_city_score,");
    expect(mapFixtureBody).toContain("opponentScore: row.opponent_score,");
    expect(mapFixtureBody).toContain("attendance: row.attendance,");
    expect(mapFixtureBody).toContain(
      "scorers: Array.isArray(row.scorers) ? (row.scorers as string[]) : [],",
    );
  });
});
