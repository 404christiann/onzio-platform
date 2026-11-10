// ADMIN-RE-17: the pure part of the reimagined Team roster (design:
// cd-roster-final-cascade). Players grouped under the four position headings,
// the counts the jump rail shows, the one-line "hidden from your website"
// summary, and the initials that stand in for a missing photo. No React, no
// data access: the page loads the players exactly as the classic roster does.

export type RosterPosition = "Goalkeeper" | "Defender" | "Midfielder" | "Forward";

/** The fields the card needs; the page's own Player type has more. */
export type RosterViewPlayer = {
  id: string;
  number: number;
  name: string;
  position: RosterPosition;
  hometown: string;
  photo_url: string;
  active: boolean;
};

/**
 * Pitch order, goal first. `short` is the word that fits a quarter of a phone
 * (the design's coach words); `heading` is the full plural over each section.
 */
export const ROSTER_SECTIONS = [
  { position: "Goalkeeper", heading: "Goalkeepers", short: "Keepers" },
  { position: "Defender", heading: "Defenders", short: "Defense" },
  { position: "Midfielder", heading: "Midfielders", short: "Midfield" },
  { position: "Forward", heading: "Forwards", short: "Forwards" },
] as const satisfies readonly {
  position: RosterPosition;
  heading: string;
  short: string;
}[];

export type RosterSection<P extends RosterViewPlayer> = {
  position: RosterPosition;
  heading: string;
  short: string;
  /** Players shown on the website in this position. The rail's number. */
  count: number;
  /** Cards to draw: every player in the position that matches the search. */
  players: P[];
};

const countFormat = new Intl.NumberFormat("en-US");

function byNumberThenName(a: RosterViewPlayer, b: RosterViewPlayer): number {
  return a.number - b.number || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

/**
 * The cards under each position, in number order. Hidden players stay in the
 * list (an owner must be able to find one to show them again) but do not count
 * toward the rail. A search narrows the cards by name or jersey number and
 * leaves the counts alone, so the rail still describes the whole squad.
 */
export function rosterSections<P extends RosterViewPlayer>(
  players: readonly P[],
  query: string,
): RosterSection<P>[] {
  const needle = query.trim().toLowerCase();
  const matches = (player: P) =>
    !needle || player.name.toLowerCase().includes(needle) || String(player.number).includes(needle);
  return ROSTER_SECTIONS.map((section) => {
    const inPosition = players.filter((player) => player.position === section.position);
    return {
      ...section,
      count: inPosition.filter((player) => player.active).length,
      players: inPosition.filter(matches).sort(byNumberThenName),
    };
  });
}

export type RosterTotals = { shown: number; hidden: number; all: number };

export function rosterTotals(players: readonly RosterViewPlayer[]): RosterTotals {
  const shown = players.filter((player) => player.active).length;
  return { shown, hidden: players.length - shown, all: players.length };
}

/** The line under "Your players". */
export function hiddenSummary(totals: RosterTotals): string {
  if (totals.all === 0) return "No players yet";
  if (totals.hidden === 0) return "Everyone is on your website";
  return `${countFormat.format(totals.hidden)} hidden from your website`;
}

/** "#10", or a dash when the number is not a real jersey number. */
export function formatPlayerNumber(number: number): string {
  return Number.isInteger(number) && number > 0 ? `#${number}` : "–";
}

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

function firstCharacter(word: string): string {
  if (segmenter) {
    const first = segmenter.segment(word)[Symbol.iterator]().next();
    return first.done ? "" : first.value.segment;
  }
  return Array.from(word)[0] ?? "";
}

/**
 * Initials for the avatar: the first character of the first and last word,
 * whole characters only (emoji and accents are never cut in half). One word
 * gives one letter; nothing at all gives "?".
 */
export function playerInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = firstCharacter(words[0]!);
  if (words.length === 1) return first.toUpperCase();
  return `${first}${firstCharacter(words[words.length - 1]!)}`.toUpperCase();
}
