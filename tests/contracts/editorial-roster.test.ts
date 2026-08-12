import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Player } from "@/lib/data";
import {
  EMPTY_ROSTER,
  GROUPS,
  playersByPosition,
  resultLabelForFilter,
  showsStaffSection,
  splitPlayerName,
  staffInitials,
  visibleGroupsForFilter,
  type RosterData,
} from "@/lib/editorial-roster";

/**
 * Real Starter-tier editorial@1 roster contracts (filter groups, staff
 * section, non-interactive cards) plus dispatch-wiring and a classic/
 * clubhouse/academy regression check.
 *
 * Adapted from the superseded claude/lions-fc-website-setup-ij0p7t reference
 * branch's tests/contracts/editorial-roster.test.ts for this branch's real
 * schema and test infrastructure -- following the exact house convention
 * tests/contracts/editorial-home.test.ts (E3) established: this repo's
 * vitest.config.ts has no JSX-transform plugin, so dynamically importing a
 * "use client" .tsx component (even just for its named exports) throws a
 * vite import-analysis error on the JSX syntax. The reference branch's
 * react-dom/server render approach does not work here for that reason. This
 * file instead uses source-scan assertions for markup/behavior, plus real
 * functional assertions against the pure roster-filter/name helpers E4
 * extracted into lib/editorial-roster.ts (a plain, non-JSX module) for
 * exactly this purpose.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function makePlayer(overrides: Partial<Player>): Player {
  return {
    number: 1,
    name: "Jonah Reed",
    nationality: "",
    position: "Goalkeeper",
    height: "6'2\"",
    weight: "",
    hometown: "Columbus, OH",
    age: 21,
    image: "",
    stats: { goalsAgainst: 0, saves: 24, cleanSheets: 2, starts: 4, yellow: 0, red: 0, mins: 414 },
    ...overrides,
  };
}

// Transcribed in the same shape as the real seeded Lions first-team roster
// (supabase/seed.sql): 2 GK, 6 DF, 6 MF, 4 FW.
const LIONS_ROSTER: RosterData = {
  goalkeepers: [
    makePlayer({ number: 1, name: "Jonah Reed", position: "Goalkeeper" }),
    makePlayer({ number: 13, name: "Mateo Silva", position: "Goalkeeper" }),
  ],
  defenders: [
    makePlayer({ number: 2, name: "Elias Ford", position: "Defender" }),
    makePlayer({ number: 3, name: "Andre Kouyate", position: "Defender" }),
    makePlayer({ number: 4, name: "Noah Chen", position: "Defender" }),
    makePlayer({ number: 5, name: "Luca Bennett", position: "Defender" }),
    makePlayer({ number: 15, name: "Darius Cole", position: "Defender" }),
    makePlayer({ number: 22, name: "Owen Park", position: "Defender" }),
  ],
  midfielders: [
    makePlayer({ number: 6, name: "Miles Okafor", position: "Midfielder" }),
    makePlayer({ number: 8, name: "Nico Valdez", position: "Midfielder" }),
    makePlayer({ number: 10, name: "Theo Santos", position: "Midfielder" }),
    makePlayer({ number: 14, name: "Caleb Wright", position: "Midfielder" }),
    makePlayer({ number: 18, name: "Isaac Amini", position: "Midfielder" }),
    makePlayer({ number: 21, name: "Rowan Kim", position: "Midfielder" }),
  ],
  forwards: [
    makePlayer({ number: 7, name: "Malik Johnson", position: "Forward" }),
    makePlayer({ number: 9, name: "Santiago Ruiz", position: "Forward" }),
    makePlayer({ number: 11, name: "Adrian Brooks", position: "Forward" }),
    makePlayer({ number: 19, name: "Kenji Tanaka", position: "Forward" }),
  ],
};

describe("editorial roster: pure filter/group logic (lib/editorial-roster.ts)", () => {
  it("playersByPosition resolves the real seeded 2/6/6/4 group counts", () => {
    expect(playersByPosition(LIONS_ROSTER, "Goalkeeper")).toHaveLength(2);
    expect(playersByPosition(LIONS_ROSTER, "Defender")).toHaveLength(6);
    expect(playersByPosition(LIONS_ROSTER, "Midfielder")).toHaveLength(6);
    expect(playersByPosition(LIONS_ROSTER, "Forward")).toHaveLength(4);
  });

  it("GROUPS orders Goalkeepers -> Defenders -> Midfielders -> Forwards", () => {
    expect(GROUPS.map(([position]) => position)).toEqual([
      "Goalkeeper",
      "Defender",
      "Midfielder",
      "Forward",
    ]);
  });

  it("visibleGroupsForFilter returns exactly one group for a position filter", () => {
    expect(visibleGroupsForFilter("Goalkeeper")).toEqual([
      ["Goalkeeper", "Goalkeepers", "goalkeepers"],
    ]);
    expect(visibleGroupsForFilter("Forward")).toEqual([
      ["Forward", "Forwards", "forwards"],
    ]);
  });

  it("visibleGroupsForFilter returns all four groups for 'all' and none for 'staff'", () => {
    expect(visibleGroupsForFilter("all")).toHaveLength(4);
    expect(visibleGroupsForFilter("staff")).toHaveLength(0);
  });

  it("showsStaffSection is true only for 'all' and 'staff'", () => {
    expect(showsStaffSection("all")).toBe(true);
    expect(showsStaffSection("staff")).toBe(true);
    expect(showsStaffSection("Goalkeeper")).toBe(false);
  });

  it("resultLabelForFilter labels each filter value", () => {
    expect(resultLabelForFilter("all")).toBe("All squad");
    expect(resultLabelForFilter("staff")).toBe("Technical staff");
    expect(resultLabelForFilter("Midfielder")).toBe("Midfielders");
  });

  it("EMPTY_ROSTER is a safe zero-players default for every group", () => {
    expect(EMPTY_ROSTER.goalkeepers).toEqual([]);
    expect(EMPTY_ROSTER.defenders).toEqual([]);
    expect(EMPTY_ROSTER.midfielders).toEqual([]);
    expect(EMPTY_ROSTER.forwards).toEqual([]);
  });

  it("splitPlayerName splits on the last space; a single-word name renders entirely on the bold line", () => {
    expect(splitPlayerName("Jonah Reed")).toEqual({ first: "Jonah", last: "Reed" });
    expect(splitPlayerName("Cher")).toEqual({ first: "", last: "Cher" });
    expect(splitPlayerName("Andre Kouyate")).toEqual({ first: "Andre", last: "Kouyate" });
  });

  it("staffInitials derives initials from the name rather than trusting the seeded (empty) field", () => {
    expect(staffInitials("Marcus Hale")).toBe("MH");
    // Three words: takes the first letter of each of the first three parts.
    expect(staffInitials("Dr. Maya Brooks")).toBe("DMB");
    expect(staffInitials("Renee Walker")).toBe("RW");
  });
});

describe("editorial player card", () => {
  it("is non-interactive: article markup, data-interactive=false, no click handler or client state", () => {
    const source = stripComments(read("components/editorial/EditorialPlayerCard.tsx"));
    expect(source).toContain('<article className="player-card" data-interactive="false">');
    expect(source).not.toMatch(/onClick|useState|Modal|"use client"/);
  });

  it("renders the big number, position label, and small-first/big-last name split", () => {
    const source = read("components/editorial/EditorialPlayerCard.tsx");
    expect(source).toContain("player-card-number");
    expect(source).toContain("{player.position}");
    expect(source).toContain("{first && <small>{first}</small>}");
    expect(source).toContain("<strong>{last}</strong>");
  });

  it("falls back to the club crest (never a hardcoded club asset) when the player has no photo", () => {
    const source = read("components/editorial/EditorialPlayerCard.tsx");
    expect(source).toContain("const imageSrc = hasPhoto ? player.image : crestUrl;");
    expect(source).toContain('imageDeliveryProps(hasPhoto ? "roster-photo" : "club-logo")');
    // Only the doc comment's reference-branch name ("lions-fc-website-setup")
    // may mention "lions" -- no hardcoded club-specific copy in real code.
    expect(stripComments(source)).not.toMatch(/lions|LFC/i);
  });

  it("imports splitPlayerName from the shared non-JSX helper module, not a local definition", () => {
    const source = read("components/editorial/EditorialPlayerCard.tsx");
    expect(source).toContain('import { splitPlayerName } from "@/lib/editorial-roster";');
    expect(source).not.toMatch(/export function splitPlayerName/);
  });
});

describe("editorial staff card", () => {
  it("is non-interactive: article markup, data-interactive=false, no click handler or client state", () => {
    const source = stripComments(read("components/editorial/EditorialStaffCard.tsx"));
    expect(source).toContain('<article className="staff-card" data-interactive="false">');
    expect(source).not.toMatch(/onClick|useState|Modal|"use client"/);
  });

  it("imports staffInitials from the shared non-JSX helper module, not a local definition", () => {
    const source = read("components/editorial/EditorialStaffCard.tsx");
    expect(source).toContain('import { staffInitials } from "@/lib/editorial-roster";');
    expect(source).not.toMatch(/export function staffInitials/);
  });

  it("falls back to the club crest when the staff member has no photo", () => {
    const source = read("components/editorial/EditorialStaffCard.tsx");
    expect(source).toContain("const imageSrc = hasPhoto ? member.image : crestUrl;");
    expect(source).toContain('imageDeliveryProps(hasPhoto ? "roster-photo" : "club-logo")');
  });
});

describe("editorial roster view: composition", () => {
  it("opens directly with the filter control and no roster hero or marketing copy", () => {
    const source = read("components/editorial/EditorialRosterView.tsx");
    expect(source).toContain('id="roster-filter"');
    expect(source).toContain('htmlFor="roster-filter"');
    expect(source).toContain('<option value="all">All squad</option>');
    expect(source).toContain('<option value="staff">Technical staff</option>');
    expect(source).not.toMatch(/roster-hero|<h1/);
  });

  it("renders position groups anchored in Goalkeepers -> Defenders -> Midfielders -> Forwards -> staff order", () => {
    const source = read("components/editorial/EditorialRosterView.tsx");
    expect(source).toContain("visibleGroups.map(([position, label, anchor");
    expect(source).toContain('id={anchor}');
    const staffSectionIndex = source.indexOf('className="staff-section"');
    const groupsMapIndex = source.indexOf("visibleGroups.map(([position");
    expect(staffSectionIndex).toBeGreaterThan(groupsMapIndex);
    // GROUPS itself (imported from lib/editorial-roster.ts) is asserted
    // to be in Goalkeepers -> Defenders -> Midfielders -> Forwards order
    // above, so the render-order contract reduces to "the view maps GROUPS
    // in the order lib/editorial-roster.ts defines it" -- verified below.
    expect(source).toContain("visibleGroupsForFilter(filter)");
  });

  it("cards render entirely non-interactive: no stats, no season selector, no click affordance", () => {
    const source = read("components/editorial/EditorialRosterView.tsx");
    expect(source).not.toMatch(/season-selector|sponsor|partner|\/store/i);
    expect(source).not.toContain('data-interactive="true"');
  });

  it("re-exports the pure filter helpers/types from lib/editorial-roster.ts rather than redefining them", () => {
    const source = read("components/editorial/EditorialRosterView.tsx");
    expect(source).toContain('from "@/lib/editorial-roster"');
    expect(source).not.toMatch(/export function playersByPosition/);
    expect(source).not.toMatch(/export function visibleGroupsForFilter/);
  });
});

describe("editorial roster view: reduced motion", () => {
  it("uses Motion (motion/react, this repo's real installed package) for the filter transition with a prefers-reduced-motion fallback", () => {
    const source = read("components/editorial/EditorialRosterView.tsx");
    expect(source).toContain('from "motion/react"');
    expect(source).not.toContain('from "framer-motion"');
    expect(source).toContain("useReducedMotion");
    expect(source).toContain("AnimatePresence");
    expect(source).toMatch(/prefersReducedMotion\s*\?\s*\{ opacity: 0 \}/);
  });

  it("mounts the filter-flash element unconditionally (never gated by prefersReducedMotion), avoiding the reduced-motion hydration mismatch fixed on the reference branch", () => {
    const source = read("components/editorial/EditorialRosterView.tsx");
    const flashIndex = source.indexOf('className="roster-filter-flash"');
    expect(flashIndex).toBeGreaterThan(-1);
    // Reduced motion must be expressed only through prop *values* on this
    // element (initial/animate/transition), never by conditionally omitting
    // the element itself -- omitting it structurally is exactly the bug
    // class the reference branch's HANDOFF documents as fixed. Check the
    // text immediately before the element for a conditional-mount guard.
    const before = source.slice(Math.max(0, flashIndex - 300), flashIndex);
    expect(before).not.toMatch(/prefersReducedMotion\s*&&/);
    expect(before).not.toMatch(/prefersReducedMotion\s*\?\s*null/);
    expect(before).not.toMatch(/!prefersReducedMotion\s*&&/);
  });
});

describe("editorial roster: dispatch and classic regression", () => {
  it("dispatches editorial@1 tenants to EditorialRoster from the shared /roster route, above the clubhouse@1 branch", () => {
    const page = read("app/(public)/roster/page.tsx");
    expect(page).toContain(
      'import EditorialRoster from "@/components/editorial/EditorialRoster";',
    );
    const editorialIndex = page.indexOf(
      'if (club.presentationTemplateKey === "editorial@1") return <EditorialRoster />;',
    );
    const clubhouseIndex = page.indexOf(
      'if (club.presentationTemplateKey === "clubhouse@1") return <ClubhouseRosterPage />;',
    );
    expect(editorialIndex).toBeGreaterThan(-1);
    expect(clubhouseIndex).toBeGreaterThan(editorialIndex);
  });

  it("the classic/clubhouse roster components (PlayerCard/StaffCard/ClubhouseRosterPage) are untouched by editorial concerns", () => {
    for (const path of [
      "components/PlayerCard.tsx",
      "components/StaffCard.tsx",
      "components/ClubhouseRosterPage.tsx",
    ]) {
      expect(read(path)).not.toMatch(/editorial/i);
    }
  });

  it("/staff still redirects unconditionally for every template, editorial included -- no route change was needed here", () => {
    const source = read("app/(public)/staff/page.tsx").trim();
    expect(source).toContain('redirect("/roster#staff")');
    expect(source).not.toMatch(/editorial/i);
  });
});
