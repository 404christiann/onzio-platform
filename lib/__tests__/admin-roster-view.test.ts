import { describe, expect, it } from "vitest";
import {
  ROSTER_SECTIONS,
  formatPlayerNumber,
  hiddenSummary,
  playerInitials,
  rosterSections,
  rosterTotals,
  type RosterViewPlayer,
} from "@/lib/admin-roster-view";

// ADMIN-RE-17: the pure part of the reimagined Team roster. Players grouped
// under the four position headings, counts for the jump rail, the one-line
// "hidden from your website" summary, and the initials that stand in for a
// missing photo. Worst-case data comes from the break-ui check on the design.

function player(overrides: Partial<RosterViewPlayer> & { id: string }): RosterViewPlayer {
  return {
    number: 7,
    name: "Marco Rossi",
    position: "Midfielder",
    hometown: "Portland, OR",
    photo_url: "",
    active: true,
    ...overrides,
  };
}

describe("rosterSections", () => {
  it("always returns the four positions in pitch order, even with no players", () => {
    const sections = rosterSections([], "");
    expect(sections.map((section) => section.position)).toEqual([
      "Goalkeeper",
      "Defender",
      "Midfielder",
      "Forward",
    ]);
    expect(sections.map((section) => section.heading)).toEqual([
      "Goalkeepers",
      "Defenders",
      "Midfielders",
      "Forwards",
    ]);
    expect(sections.every((section) => section.players.length === 0)).toBe(true);
    expect(ROSTER_SECTIONS.map((section) => section.short)).toEqual(["Keepers", "Defense", "Midfield", "Forwards"]);
  });

  it("sorts each position by number, then name, so a repeated number is stable", () => {
    const sections = rosterSections(
      [
        player({ id: "a", number: 10, name: "Zed", position: "Forward" }),
        player({ id: "b", number: 9, name: "Yan", position: "Forward" }),
        player({ id: "c", number: 10, name: "Abe", position: "Forward" }),
      ],
      "",
    );
    expect(sections[3]!.players.map((entry) => entry.id)).toEqual(["b", "c", "a"]);
  });

  it("counts only the players shown on the website, and lists hidden ones too", () => {
    const sections = rosterSections(
      [
        player({ id: "a", position: "Goalkeeper" }),
        player({ id: "b", position: "Goalkeeper", active: false }),
        player({ id: "c", position: "Goalkeeper", active: false }),
      ],
      "",
    );
    expect(sections[0]!.players).toHaveLength(3);
    expect(sections[0]!.count).toBe(1);
  });

  it("filters by name or jersey number, ignoring case and surrounding spaces", () => {
    const players = [
      player({ id: "a", number: 10, name: "Christopher Montgomery III" }),
      player({ id: "b", number: 11, name: "Aiko Tanaka", position: "Forward" }),
    ];
    expect(rosterSections(players, "  MONT ")[2]!.players.map((entry) => entry.id)).toEqual(["a"]);
    expect(rosterSections(players, "11")[3]!.players.map((entry) => entry.id)).toEqual(["b"]);
    expect(rosterSections(players, "zzz").every((section) => section.players.length === 0)).toBe(true);
  });

  it("keeps the rail counts for the whole squad while a search narrows the cards", () => {
    const players = [
      player({ id: "a", name: "Marco Rossi" }),
      player({ id: "b", name: "Luca Bianchi" }),
    ];
    const narrowed = rosterSections(players, "marco");
    expect(narrowed[2]!.players).toHaveLength(1);
    expect(narrowed[2]!.count).toBe(2);
  });

  it("finds non-Latin names with a plain substring match", () => {
    const players = [player({ id: "a", name: "田中 太郎" }), player({ id: "b", name: "Игорь Петров" })];
    expect(rosterSections(players, "田中")[2]!.players.map((entry) => entry.id)).toEqual(["a"]);
    expect(rosterSections(players, "игорь")[2]!.players.map((entry) => entry.id)).toEqual(["b"]);
  });
});

describe("rosterTotals", () => {
  it("separates the players on the website from the hidden ones", () => {
    expect(
      rosterTotals([
        player({ id: "a" }),
        player({ id: "b", active: false }),
        player({ id: "c" }),
      ]),
    ).toEqual({ shown: 2, hidden: 1, all: 3 });
    expect(rosterTotals([])).toEqual({ shown: 0, hidden: 0, all: 0 });
  });
});

describe("hiddenSummary", () => {
  it("says it in plain words, with plural rules and thousands separators", () => {
    expect(hiddenSummary({ shown: 0, hidden: 0, all: 0 })).toBe("No players yet");
    expect(hiddenSummary({ shown: 18, hidden: 0, all: 18 })).toBe("Everyone is on your website");
    expect(hiddenSummary({ shown: 18, hidden: 1, all: 19 })).toBe("1 hidden from your website");
    expect(hiddenSummary({ shown: 59, hidden: 5, all: 64 })).toBe("5 hidden from your website");
    expect(hiddenSummary({ shown: 0, hidden: 1200, all: 1200 })).toBe("1,200 hidden from your website");
  });
});

describe("formatPlayerNumber", () => {
  it("shows the number, and a dash when there is no real jersey number", () => {
    expect(formatPlayerNumber(10)).toBe("#10");
    expect(formatPlayerNumber(999)).toBe("#999");
    expect(formatPlayerNumber(0)).toBe("–");
    expect(formatPlayerNumber(Number.NaN)).toBe("–");
    expect(formatPlayerNumber(-3)).toBe("–");
  });
});

describe("playerInitials", () => {
  it("takes the first letters of the first and last word", () => {
    expect(playerInitials("Marco Rossi")).toBe("MR");
    expect(playerInitials("Christopher Montgomery III")).toBe("CI");
    expect(playerInitials("  marco   de  la rosa ")).toBe("MR");
  });

  it("copes with one-letter, one-word, empty and symbol-only names", () => {
    expect(playerInitials("J")).toBe("J");
    expect(playerInitials("Pelé")).toBe("P");
    expect(playerInitials("")).toBe("?");
    expect(playerInitials("   ")).toBe("?");
  });

  it("never splits a character in two: emoji, Cyrillic, Chinese", () => {
    expect(playerInitials("⚽ Ronaldo")).toBe("⚽R");
    expect(playerInitials("👩🏽‍🦰 Ana")).toBe("👩🏽‍🦰A");
    expect(playerInitials("Игорь Петров")).toBe("ИП");
    expect(playerInitials("田中太郎")).toBe("田");
    expect(playerInitials("田中 太郎")).toBe("田太");
  });
});
