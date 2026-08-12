import type { Player } from "@/lib/data";

/**
 * Pure roster-filter helpers for components/editorial/EditorialRosterView.tsx
 * (and the small name-formatting helpers for EditorialPlayerCard.tsx /
 * EditorialStaffCard.tsx), split into their own non-JSX module so contract
 * tests can import and exercise them directly -- this repo's
 * vitest.config.ts has no JSX-transform plugin, so dynamically importing
 * any "use client" .tsx component (even just for its named exports) fails
 * at the vite import-analysis step. Mirrors lib/editorial-fixtures.ts's
 * same rationale (E3/E4).
 */

export type Position = "Goalkeeper" | "Defender" | "Midfielder" | "Forward";
export type RosterFilter = "all" | Position | "staff";

export type RosterData = {
  goalkeepers: Player[];
  defenders: Player[];
  midfielders: Player[];
  forwards: Player[];
};

export const EMPTY_ROSTER: RosterData = {
  goalkeepers: [],
  defenders: [],
  midfielders: [],
  forwards: [],
};

export const GROUPS: Array<[Position, string, string]> = [
  ["Goalkeeper", "Goalkeepers", "goalkeepers"],
  ["Defender", "Defenders", "defenders"],
  ["Midfielder", "Midfielders", "midfielders"],
  ["Forward", "Forwards", "forwards"],
];

export function playersByPosition(roster: RosterData, position: Position): Player[] {
  switch (position) {
    case "Goalkeeper":
      return roster.goalkeepers;
    case "Defender":
      return roster.defenders;
    case "Midfielder":
      return roster.midfielders;
    case "Forward":
      return roster.forwards;
  }
}

/**
 * Pure filter logic, extracted from render so it stays independently
 * testable (unit tests, not full render/animation simulation).
 */
export function visibleGroupsForFilter(
  filter: RosterFilter,
): Array<[Position, string, string]> {
  return GROUPS.filter(([position]) => filter === "all" || filter === position);
}

export function showsStaffSection(filter: RosterFilter): boolean {
  return filter === "all" || filter === "staff";
}

export function resultLabelForFilter(filter: RosterFilter): string {
  if (filter === "all") return "All squad";
  if (filter === "staff") return "Technical staff";
  return GROUPS.find(([position]) => position === filter)?.[1] ?? "Squad";
}

/**
 * Splits "Jonah Reed" into { first: "Jonah", last: "Reed" } on the last
 * space, mirroring the seed's single combined `name` field. A single-word
 * name renders entirely on the bold line.
 */
export function splitPlayerName(name: string): { first: string; last: string } {
  const trimmed = name.trim();
  const lastSpace = trimmed.lastIndexOf(" ");
  if (lastSpace === -1) return { first: "", last: trimmed };
  return {
    first: trimmed.slice(0, lastSpace),
    last: trimmed.slice(lastSpace + 1),
  };
}

/** "Marcus Hale" -> "MH". The seeded staff.initials column defaults to '' and is never trusted here. */
export function staffInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 3);
}
