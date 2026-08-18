import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { upslFixturesContent } from "@/components/pathway/content";
import {
  formatPathwayFixtureDate,
  formatPathwayFixtureTime,
  isPathwayFixtureTimeTba,
  pathwayFixtureKickoff,
  pathwayFixtureOrdinal,
  pathwayNextFixtureIndex,
  pathwayOpponentMonogram,
  type PathwayUpslFixture,
} from "@/lib/pathway-upsl-fixtures";

/**
 * pathway@1 UPSL fixtures contracts.
 *
 * Follows the house convention established by
 * tests/contracts/pathway-upsl-roster.test.ts and the editorial schedule
 * suites: no react-dom/server rendering, because this repo's
 * vitest.config.ts carries no JSX-transform plugin and tsconfig sets
 * jsx: "preserve", so importing a .tsx component fails at vite's
 * import-analysis step. Behaviour that must be exercised for real
 * (date/time formatting, next/past resolution, TBA handling) therefore
 * lives in the plain-TS lib/pathway-upsl-fixtures.ts module and is called
 * directly here; the component's DOM/class contract is asserted by
 * scanning its source, exactly as the roster contract does.
 */

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");
/** Token/import bans apply to real code, not to prose explaining them. */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const COMPONENT = "components/pathway/PathwayUpslFixtures.tsx";

/** A deterministic mid-season list: two already kicked off, three ahead. */
const FIXTURES: PathwayUpslFixture[] = [
  {
    id: "f1",
    date: "2026-09-05",
    time: "19:00",
    opponent: "Opponent 1",
    home: true,
    result: { label: "W", score: "2-1" },
  },
  {
    id: "f2",
    date: "2026-09-12",
    time: "18:00",
    opponent: "Opponent 2",
    venue: "  ",
    home: false,
  },
  {
    id: "f3",
    date: "2026-09-19",
    time: "17:30",
    opponent: "Opponent 3",
    venue: "Training Ground",
    home: true,
  },
  { id: "f4", date: "2026-09-26", opponent: "Opponent 4", home: false },
  {
    id: "f5",
    date: "2026-10-03",
    time: "TBD",
    opponent: "Opponent 5",
    home: true,
  },
];

afterEach(() => {
  vi.useRealTimers();
});

/** Freezes local wall-clock time so next/past resolution is deterministic. */
function freezeAt(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

describe("pathway UPSL fixtures: date and time formatting", () => {
  it("formats the stored date the way the reference row reads it", () => {
    expect(formatPathwayFixtureDate("2026-09-05")).toBe("September 5, 2026");
    expect(formatPathwayFixtureDate("2026-12-31")).toBe("December 31, 2026");
  });

  it("converts stored 24-hour kickoffs to 12-hour clock time", () => {
    expect(formatPathwayFixtureTime("19:00")).toBe("7:00 PM");
    expect(formatPathwayFixtureTime("09:05")).toBe("9:05 AM");
    expect(formatPathwayFixtureTime("12:00")).toBe("12:00 PM");
    expect(formatPathwayFixtureTime("00:30")).toBe("12:30 AM");
  });

  it("treats an omitted, blank or TBD kickoff as time-not-set", () => {
    expect(isPathwayFixtureTimeTba(undefined)).toBe(true);
    expect(isPathwayFixtureTimeTba("")).toBe(true);
    expect(isPathwayFixtureTimeTba("  ")).toBe(true);
    expect(isPathwayFixtureTimeTba("TBD")).toBe(true);
    expect(isPathwayFixtureTimeTba("tbd")).toBe(true);
    expect(isPathwayFixtureTimeTba("19:00")).toBe(false);

    // The row renders "Time TBA" whenever the formatter returns nothing.
    expect(formatPathwayFixtureTime(undefined)).toBe("");
    expect(formatPathwayFixtureTime("TBD")).toBe("");
    expect(read(COMPONENT)).toContain('{kickoff || "Time TBA"}');
  });

  it("keeps the reference row's two-digit ordinal gutter", () => {
    expect(pathwayFixtureOrdinal(0)).toBe("01");
    expect(pathwayFixtureOrdinal(9)).toBe("10");
  });

  it("derives a crest monogram without importing the legacy OpponentCrest", () => {
    expect(pathwayOpponentMonogram("Opponent 1")).toBe("O");
    expect(pathwayOpponentMonogram("Portland FC")).toBe("P");
    expect(pathwayOpponentMonogram("TBA")).toBe("TBA");
    expect(stripComments(read(COMPONENT))).not.toContain("OpponentCrest");
  });
});

describe("pathway UPSL fixtures: next / past resolution", () => {
  it("marks the first fixture still ahead of now as next", () => {
    freezeAt("2026-09-15T12:00:00");
    // f1 and f2 have kicked off; f3 is the first one left.
    expect(pathwayNextFixtureIndex(FIXTURES, new Date())).toBe(2);
  });

  it("moves the next marker forward as fixtures kick off", () => {
    freezeAt("2026-09-01T12:00:00");
    expect(pathwayNextFixtureIndex(FIXTURES, new Date())).toBe(0);

    freezeAt("2026-09-05T18:59:00");
    expect(pathwayNextFixtureIndex(FIXTURES, new Date())).toBe(0);

    // One minute after the 19:00 kickoff the same fixture is past.
    freezeAt("2026-09-05T19:01:00");
    expect(pathwayNextFixtureIndex(FIXTURES, new Date())).toBe(1);
  });

  it("returns the list length when every fixture has kicked off", () => {
    freezeAt("2027-01-01T00:00:00");
    expect(pathwayNextFixtureIndex(FIXTURES, new Date())).toBe(
      FIXTURES.length,
    );
  });

  it("treats a time-not-set fixture as kicking off at midnight local", () => {
    const kickoff = pathwayFixtureKickoff(FIXTURES[3]);
    expect(kickoff.getFullYear()).toBe(2026);
    expect(kickoff.getMonth()).toBe(8);
    expect(kickoff.getDate()).toBe(26);
    expect(kickoff.getHours()).toBe(0);
    expect(kickoff.getMinutes()).toBe(0);

    freezeAt("2026-09-25T23:59:00");
    expect(pathwayNextFixtureIndex(FIXTURES.slice(3), new Date())).toBe(0);
    freezeAt("2026-09-26T00:01:00");
    expect(pathwayNextFixtureIndex(FIXTURES.slice(3), new Date())).toBe(1);
  });

  it("computes both states itself rather than taking them as props", () => {
    const component = read(COMPONENT);
    expect(component).toContain(
      "pathwayNextFixtureIndex(fixtures, new Date())",
    );
    expect(component).toContain("isNext={index === nextIndex}");
    expect(component).toContain("isPast={index < nextIndex}");
  });
});

describe("pathway UPSL fixtures: component composition", () => {
  const component = read(COMPONENT);

  it("renders the hero eyebrow, heading and accent rule", () => {
    expect(component).toContain(
      'className="pathway-upsl-fixtures-eyebrow"',
    );
    expect(component).toContain("`${seasonLabel} Season`");
    expect(component).toContain(
      '<h1 className="pathway-upsl-fixtures-title">Fixtures</h1>',
    );
    expect(component).toContain('className="pathway-upsl-fixtures-rule"');
  });

  it("keeps the reference row composition: index, date/time, opponent, status", () => {
    expect(component).toContain('className="pathway-upsl-fixtures-head"');
    expect(component).toContain(">Date · Time<");
    expect(component).toContain(">Opponent<");
    expect(component).toContain('className="pathway-upsl-fixtures-row"');
    expect(component).toContain('className="pathway-upsl-fixtures-index"');
    expect(component).toContain('className="pathway-upsl-fixtures-date"');
    expect(component).toContain('className="pathway-upsl-fixtures-time"');
    expect(component).toContain('className="pathway-upsl-fixtures-opponent"');
    expect(component).toContain('className="pathway-upsl-fixtures-venue"');
    expect(component).toContain('className="pathway-upsl-fixtures-status"');
    expect(component).toContain(
      'Match details and venues are subject to change.',
    );
  });

  it("renders the Next pill only on the next row", () => {
    expect(component).toMatch(
      /isNext \? \(\s*<span className="pathway-upsl-fixtures-next-pill">Next<\/span>\s*\) : null/,
    );
  });

  it("falls back to Venue TBA when no venue is set", () => {
    expect(component).toContain('{fixture.venue?.trim() || "Venue TBA"}');
  });

  it("carries the result state with W/D/L colouring and a Final label", () => {
    expect(component).toContain('className="pathway-upsl-fixtures-result"');
    expect(component).toContain("data-outcome={result.label}");
    expect(component).toContain("{result.label} {result.score}");
    expect(component).toContain('className="pathway-upsl-fixtures-final"');
    expect(component).toContain('{fixture.home ? "Home" : "Away"}');
  });

  it("renders a coming-soon empty state for an empty fixture list", () => {
    expect(component).toContain("fixtures.length === 0 ? (");
    expect(component).toContain('className="pathway-upsl-fixtures-empty"');
    expect(component).toContain("Schedule coming soon");
    expect(component).toContain(
      "No official fixtures have been published yet.",
    );
  });

  it("uses its own scoped crest instead of the legacy shared component", () => {
    expect(component).toContain(
      'import ResilientImage from "@/components/ResilientImage"',
    );
    expect(component).toContain('imageDeliveryProps("opponent-crest")');
    expect(component).toContain('className="pathway-upsl-fixtures-crest"');
    expect(component).toContain(
      'pathway-upsl-fixtures-abbr pathway-upsl-fixtures-logo-fallback',
    );
    const code = stripComments(component);
    expect(code).not.toMatch(/#1E3653|#FF1616|--color-red|--color-gray-/);
    expect(code).not.toContain("font-display");
  });
});

describe("pathway UPSL fixtures: placeholder content", () => {
  it("publishes five neutral, result-free upcoming placeholders", () => {
    expect(upslFixturesContent.seasonLabel).toBe("Fall 2026");
    expect(upslFixturesContent.fixtures).toHaveLength(5);
    expect(
      upslFixturesContent.fixtures.map((fixture) => fixture.opponent),
    ).toEqual(
      Array.from({ length: 5 }, (_, index) => `Opponent ${index + 1}`),
    );
    expect(
      upslFixturesContent.fixtures.every(
        (fixture) => fixture.result === undefined,
      ),
    ).toBe(true);
    expect(
      upslFixturesContent.fixtures.every(
        (fixture) => fixture.venue === undefined,
      ),
    ).toBe(true);
    expect(
      upslFixturesContent.fixtures.some((fixture) => fixture.home),
    ).toBe(true);
    expect(
      upslFixturesContent.fixtures.some((fixture) => !fixture.home),
    ).toBe(true);
    expect(
      upslFixturesContent.fixtures.filter((fixture) =>
        isPathwayFixtureTimeTba(fixture.time),
      ),
    ).toHaveLength(1);
  });

  it("keeps the placeholders in chronological order and free of real teams", () => {
    const dates = upslFixturesContent.fixtures.map(
      (fixture) => fixture.date,
    );
    expect([...dates].sort()).toEqual(dates);
    expect(
      upslFixturesContent.fixtures.every((fixture) =>
        /^\d{4}-\d{2}-\d{2}$/.test(fixture.date),
      ),
    ).toBe(true);

    const source = read("components/pathway/content.ts");
    const block = source.slice(
      source.indexOf("export const upslFixturesContent"),
      source.indexOf("/* ======================== UPSL PAYMENTS"),
    );
    expect(block).not.toMatch(/FC|SC|United|City|Athletic|Rovers/);
  });
});

describe("pathway UPSL fixtures: scoped stylesheet", () => {
  const css = read("styles/pathway.css");
  const start = css.indexOf("/* ============ UPSL FIXTURES");
  const end = css.indexOf("@media (max-width: 980px)", start);
  const block = css.slice(start, end);
  const rule = (selector: string) =>
    block.match(
      new RegExp(
        `\\.${selector}\\s*\\{[^}]+\\}`.replace(/-/g, "\\-"),
      ),
    )?.[0] ?? "";

  it("places the block beside the sibling standings styles", () => {
    expect(start).toBeGreaterThan(css.indexOf(".pathway-upsl-standings"));
    expect(end).toBeGreaterThan(start);
  });

  it("carries the reference desktop grid on the header and the rows", () => {
    expect(
      block.match(/grid-template-columns: 44px 240px minmax\(0, 1fr\) 160px;/g),
    ).toHaveLength(2);
    expect(rule("pathway-upsl-fixtures-row")).toContain("min-height: 150px;");
    expect(rule("pathway-upsl-fixtures-row")).toContain("padding: 32px 20px;");
    expect(rule("pathway-upsl-fixtures-head")).toContain(
      "border-bottom: 2px solid var(--primary);",
    );
  });

  it("collapses the grid at pathway's standard breakpoints", () => {
    expect(block).toContain("@media (max-width: 800px)");
    expect(block).toContain("@media (max-width: 460px)");
    const collapsed = block.slice(block.indexOf("@media (max-width: 800px)"));
    expect(collapsed).toContain("display: none;");
    expect(collapsed).toContain("grid-template-columns: minmax(0, 1fr);");
  });

  it("highlights the next row and styles the Next pill and results", () => {
    expect(block).toContain(
      '.pathway-upsl-fixtures-row[data-next="true"]',
    );
    expect(block).toContain(
      "background: color-mix(in srgb, var(--accent) 5%, transparent);",
    );
    expect(rule("pathway-upsl-fixtures-next-pill")).toContain(
      "color: var(--accent);",
    );
    expect(rule("pathway-upsl-fixtures-result")).toContain(
      "color: var(--primary);",
    );
    expect(block).toContain(
      '.pathway-upsl-fixtures-result[data-outcome="W"]',
    );
    expect(block).toContain('[data-past="true"]');
    expect(block).toContain("opacity: 0.55;");
    expect(block).toContain("opacity: 0.78;");
  });

  it("speaks only pathway tokens and stays template-scoped", () => {
    const rules = stripComments(block);
    expect(rules).not.toMatch(/#1E3653|#FF1616|--color-red|--color-gray-/i);
    expect(rules).not.toContain("100vw");

    const selectorLines = rules
      .split("\n")
      .filter((line) => line.includes(".pathway-upsl-fixtures"));
    expect(selectorLines.length).toBeGreaterThan(0);
    expect(
      selectorLines.every((line) =>
        line.includes('[data-site-template="pathway"]'),
      ),
    ).toBe(true);
  });
});
