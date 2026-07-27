import { describe, expect, it } from "vitest";
import { getPlayerSeasonSeed } from "@/lib/player-season";

describe("getPlayerSeasonSeed", () => {
  it("returns a complete zero-stat row for a field player", () => {
    const result = getPlayerSeasonSeed("Forward");

    expect(result.table).toBe("player_season_stats");
    expect(result.stats).toEqual({
      goals: 0,
      assists: 0,
      tackles: 0,
      starts: 0,
      yellow: 0,
      red: 0,
      mins: 0,
      offsides: 0,
      fouls: 0,
      fouls_suffered: 0,
    });
  });

  it("returns a complete zero-stat row for a goalkeeper", () => {
    const result = getPlayerSeasonSeed("Goalkeeper");

    expect(result.table).toBe("goalkeeper_season_stats");
    expect(result.stats).toEqual({
      goals_against: 0,
      saves: 0,
      clean_sheets: 0,
      starts: 0,
      yellow: 0,
      red: 0,
      mins: 0,
    });
  });
});
