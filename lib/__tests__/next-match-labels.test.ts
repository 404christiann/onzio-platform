import { describe, expect, it } from "vitest";
import { nextMatchLabels } from "@/lib/next-match-labels";

describe("nextMatchLabels (ADMIN-RE-22)", () => {
  it("takes the competition from the game, trimmed", () => {
    expect(nextMatchLabels({ competition: "  UPSL Midwest Central ", home: false })).toEqual({
      competition: "UPSL Midwest Central",
      homeAway: "Away",
    });
  });

  it("shows no competition line for a game without one", () => {
    for (const competition of [null, undefined, "", "   "]) {
      expect(nextMatchLabels({ competition, home: true }).competition).toBe("");
    }
  });

  it("says Home for a home game and Away for an away game", () => {
    expect(nextMatchLabels({ competition: null, home: true }).homeAway).toBe("Home");
    expect(nextMatchLabels({ competition: null, home: false }).homeAway).toBe("Away");
  });
});
