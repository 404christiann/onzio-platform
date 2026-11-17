import { describe, expect, it } from "vitest";
import {
  assistsWords,
  avatarInitials,
  barScale,
  chartGames,
  didWords,
  fieldRadar,
  gameResult,
  goalsWords,
  keeperRadar,
  minutesFraction,
  monthLabels,
  playedLine,
  radarPoints,
  radarSummary,
  recordLine,
  resultWord,
  scoreLine,
  seasonRecord,
  unbeatenLine,
  type ResultGame,
} from "@/lib/admin-analytics-view";

// ADMIN-RE-19: the rules behind "How the team is doing" (design: cd-analytics-a
// results, cd-analytics-b one player), apart from the page. The expected values
// are worked by hand from the design's own made-up season: 12 games, 8 won,
// 3 drawn, 1 lost, 27 scored and 14 let in.

let n = 0;
const game = (date: string, us: number, them: number, opponent = "Opponent"): ResultGame => ({
  id: `g${++n}`,
  date,
  opponent,
  us,
  them,
});

// The design's season, oldest first
const SEASON: ResultGame[] = [
  game("2026-08-16", 1, 2, "Riverside FC"),
  game("2026-08-23", 2, 2, "Northgate Athletic"),
  game("2026-08-30", 3, 1, "Harbor City SC"),
  game("2026-09-06", 2, 0, "Westfield Rovers"),
  game("2026-09-13", 1, 1, "Lakeshore United"),
  game("2026-09-20", 3, 2, "Pinecrest FC"),
  game("2026-09-27", 2, 0, "Summit Valley SC"),
  game("2026-10-04", 4, 2, "Brookside Town"),
  game("2026-10-11", 3, 0, "Oakmont Wanderers"),
  game("2026-10-18", 1, 1, "Riverside FC"),
  game("2026-10-25", 2, 1, "Northgate Athletic"),
  game("2026-11-01", 3, 2, "Harbor City SC"),
];

describe("one game's result", () => {
  it("is won, drew or lost from the two scores", () => {
    expect(gameResult(game("2026-01-01", 4, 2))).toBe("won");
    expect(gameResult(game("2026-01-01", 1, 1))).toBe("drew");
    expect(gameResult(game("2026-01-01", 0, 3))).toBe("lost");
    expect(gameResult(game("2026-01-01", 0, 0))).toBe("drew");
  });

  it("has a word for each, and the score reads with an en dash", () => {
    expect(resultWord("won")).toBe("Won");
    expect(resultWord("drew")).toBe("Drew");
    expect(resultWord("lost")).toBe("Lost");
    expect(scoreLine(game("2026-01-01", 4, 2))).toBe("4–2");
  });

  it("keeps very high scores whole, with a thousands separator", () => {
    expect(scoreLine(game("2026-01-01", 12, 11))).toBe("12–11");
    expect(scoreLine(game("2026-01-01", 1204, 3))).toBe("1,204–3");
  });
});

describe("the season's record", () => {
  const record = seasonRecord(SEASON);

  it("counts what the design shows: W8 D3 L1, 27 scored, 14 let in", () => {
    expect(record).toMatchObject({ played: 12, won: 8, drawn: 3, lost: 1, scored: 27, letIn: 14 });
  });

  it("is read as one sentence", () => {
    expect(recordLine(record)).toBe("8 won · 3 drawn · 1 lost");
  });

  it("counts the games without a loss that run up to the latest game", () => {
    // The only loss is the first game, so the 11 after it are unbeaten
    expect(record.unbeaten).toBe(11);
    expect(unbeatenLine(record)).toBe("Unbeaten in the last 11 games");
  });

  it("starts the run again after the latest loss", () => {
    const lastLost = seasonRecord([...SEASON, game("2026-11-08", 0, 1)]);
    expect(lastLost.unbeaten).toBe(0);
    expect(unbeatenLine(lastLost)).toBe("");
    expect(seasonRecord([...SEASON, game("2026-11-08", 0, 1), game("2026-11-15", 2, 0)]).unbeaten).toBe(1);
  });

  it("says nothing about a short run, and 'all' when no game was lost", () => {
    expect(unbeatenLine(seasonRecord([game("2026-01-01", 1, 0)]))).toBe("");
    expect(unbeatenLine(seasonRecord([game("2026-01-01", 1, 0), game("2026-01-08", 1, 1)]))).toBe("");
    const allSix = seasonRecord(SEASON.slice(1, 7));
    expect(allSix.unbeaten).toBe(6);
    expect(unbeatenLine(allSix)).toBe("Unbeaten in all 6 games");
  });

  it("orders by date, not by the order it was handed the games", () => {
    expect(seasonRecord([...SEASON].reverse()).unbeaten).toBe(11);
  });

  it("has a zero record for no games and a one-game record for one", () => {
    expect(seasonRecord([])).toMatchObject({ played: 0, won: 0, drawn: 0, lost: 0, scored: 0, letIn: 0, unbeaten: 0 });
    expect(recordLine(seasonRecord([]))).toBe("0 won · 0 drawn · 0 lost");
    const one = seasonRecord([game("2026-01-01", 2, 1)]);
    expect(recordLine(one)).toBe("1 won · 0 drawn · 0 lost");
  });

  it("formats big totals with a thousands separator", () => {
    const big = seasonRecord([game("2026-01-01", 1204, 1000)]);
    expect(recordLine(big)).toBe("1 won · 0 drawn · 0 lost");
    expect(big.scored).toBe(1204);
  });
});

describe("the games the chart shows", () => {
  it("is the last N, oldest first, however the games arrive", () => {
    expect(chartGames([...SEASON].reverse(), 6).map((g) => g.opponent)).toEqual([
      "Summit Valley SC",
      "Brookside Town",
      "Oakmont Wanderers",
      "Riverside FC",
      "Northgate Athletic",
      "Harbor City SC",
    ]);
  });

  it("shows every game when there are fewer than N, and none for none", () => {
    expect(chartGames(SEASON.slice(0, 3), 12)).toHaveLength(3);
    expect(chartGames([], 12)).toEqual([]);
  });

  it("breaks a tie on the same date by id so the order never flickers", () => {
    const a = { ...game("2026-01-01", 1, 0), id: "a" };
    const b = { ...game("2026-01-01", 0, 1), id: "b" };
    expect(chartGames([b, a], 2).map((g) => g.id)).toEqual(["a", "b"]);
  });
});

describe("bar heights", () => {
  it("is the design's 20px a goal while the tallest bar fits its room", () => {
    // room: 80px above the line, 40px below
    expect(barScale(chartGames(SEASON, 12))).toBe(20);
  });

  it("shrinks so the tallest bar still fits when a score is very high", () => {
    // 27 scored in one game: 80 / 27 = 2.96px a goal
    const scale = barScale([game("2026-01-01", 27, 1)]);
    expect(scale).toBeCloseTo(80 / 27, 5);
    expect(27 * scale).toBeLessThanOrEqual(80);
  });

  it("also fits the let-in bars in their smaller room", () => {
    const scale = barScale([game("2026-01-01", 1, 40)]);
    expect(scale).toBeCloseTo(1, 5);
    expect(40 * scale).toBeLessThanOrEqual(40);
  });

  it("is the full 20px for a goalless season, never infinity or zero", () => {
    expect(barScale([])).toBe(20);
    expect(barScale([game("2026-01-01", 0, 0)])).toBe(20);
  });
});

describe("month labels under the games", () => {
  const six = chartGames(SEASON, 6); // Sep 27, Oct 4, 11, 18, 25, Nov 1

  it("names a month under the first game of each month", () => {
    expect(monthLabels(six, "wide")).toEqual(["Sep", "Oct", "", "", "", "Nov"]);
  });

  it("on the phone names only the first and last date", () => {
    expect(monthLabels(six, "narrow")).toEqual(["Sep 27", "", "", "", "", "Nov 1"]);
  });

  it("is one label for one game, and none for none", () => {
    expect(monthLabels(six.slice(0, 1), "narrow")).toEqual(["Sep 27"]);
    expect(monthLabels([], "wide")).toEqual([]);
  });

  it("is empty text for a date it cannot read, never a crash", () => {
    expect(monthLabels([game("not-a-date", 1, 0)], "wide")).toEqual([""]);
    expect(monthLabels([game("not-a-date", 1, 0)], "narrow")).toEqual([""]);
  });
});

describe("words for goals and assists", () => {
  it("uses the singular for one", () => {
    expect(goalsWords(1)).toBe("1 goal");
    expect(goalsWords(2)).toBe("2 goals");
    expect(goalsWords(0)).toBe("0 goals");
    expect(assistsWords(1)).toBe("1 assist");
    expect(assistsWords(3)).toBe("3 assists");
  });

  it("separates thousands", () => {
    expect(goalsWords(1204)).toBe("1,204 goals");
  });
});

describe("what a player did in one game, in words", () => {
  it("lists goals then assists with the right plurals", () => {
    expect(didWords({ goals: 2, assists: 1 })).toBe("2 goals, 1 assist");
    expect(didWords({ goals: 1, assists: 0 })).toBe("1 goal");
    expect(didWords({ goals: 0, assists: 3 })).toBe("3 assists");
  });

  it("is a dash when the player did neither", () => {
    expect(didWords({ goals: 0, assists: 0 })).toBe("–");
  });

  it("says saves and goals let in for a keeper", () => {
    expect(didWords({ goals: 0, assists: 0, saves: 5, goalsAgainst: 1 })).toBe("5 saves, 1 let in");
    expect(didWords({ goals: 0, assists: 0, saves: 1, goalsAgainst: 0 })).toBe("1 save");
    expect(didWords({ goals: 0, assists: 0, saves: 0, goalsAgainst: 0 })).toBe("–");
  });
});

describe("minutes bar", () => {
  it("is minutes out of 90, between 0 and 1", () => {
    expect(minutesFraction(90)).toBe(1);
    expect(minutesFraction(45)).toBe(0.5);
    expect(minutesFraction(0)).toBe(0);
  });

  it("never runs past the track for extra time or bad data", () => {
    expect(minutesFraction(120)).toBe(1);
    expect(minutesFraction(300)).toBe(1);
    expect(minutesFraction(-5)).toBe(0);
    expect(minutesFraction(Number.NaN)).toBe(0);
  });
});

describe("'Played N of M games'", () => {
  it("counts the games with minutes against the games played by the team", () => {
    expect(playedLine(11, 12)).toBe("Played 11 of 12 games");
    expect(playedLine(12, 12)).toBe("Played 12 of 12 games");
  });

  it("is singular for one game", () => {
    expect(playedLine(1, 1)).toBe("Played 1 of 1 game");
  });

  it("never says more games than the team played", () => {
    expect(playedLine(14, 12)).toBe("Played 14 of 14 games");
  });

  it("is a plain line when there are no games at all", () => {
    expect(playedLine(0, 0)).toBe("No games played yet");
    expect(playedLine(0, 12)).toBe("Played 0 of 12 games");
  });
});

const field = (over: Partial<Record<string, number>> = {}) => ({
  goals: 0,
  assists: 0,
  tackles: 0,
  starts: 0,
  yellow: 0,
  red: 0,
  mins: 0,
  offsides: 0,
  fouls: 0,
  foulsSuffered: 0,
  ...over,
});

describe("the player chart: six corners, each a plain number", () => {
  // Forwards from the design: Maya 11/4/14/9/900/10, Sam 6/3/8/12/864/12
  const maya = field({ goals: 11, assists: 4, foulsSuffered: 14, tackles: 9, mins: 900, starts: 10 });
  const sam = field({ goals: 6, assists: 3, foulsSuffered: 8, tackles: 12, mins: 864, starts: 12 });
  const cohort = [maya, sam];

  it("has the design's corners in the design's order", () => {
    expect(fieldRadar(maya, cohort).map((a) => a.label)).toEqual([
      "Goals",
      "Assists",
      "Fouls won",
      "Tackles",
      "Minutes",
      "Starts",
    ]);
  });

  it("reaches the edge where the player is the best of their position on the team", () => {
    const axes = fieldRadar(maya, cohort);
    const by = Object.fromEntries(axes.map((a) => [a.label, a]));
    expect(by.Goals).toMatchObject({ value: 11, text: "11", ratio: 1 });
    expect(by.Assists.ratio).toBe(1);
    expect(by["Fouls won"].ratio).toBe(1);
    expect(by.Minutes.ratio).toBe(1);
    // Sam has the most tackles and starts
    expect(by.Tackles.ratio).toBeCloseTo(9 / 12, 5);
    expect(by.Starts.ratio).toBeCloseTo(10 / 12, 5);
  });

  it("is the other player's shape against the same edge", () => {
    const by = Object.fromEntries(fieldRadar(sam, cohort).map((a) => [a.label, a]));
    expect(by.Goals.ratio).toBeCloseTo(6 / 11, 5);
    expect(by.Tackles.ratio).toBe(1);
    expect(by.Starts.ratio).toBe(1);
  });

  it("sits at the centre, never 0 / 0, when nobody on the team has any numbers", () => {
    const axes = fieldRadar(field(), [field(), field()]);
    expect(axes.every((a) => a.ratio === 0)).toBe(true);
    expect(axes.every((a) => a.text === "0")).toBe(true);
  });

  it("is a player with no minutes beside others who have some", () => {
    const axes = fieldRadar(field(), [maya, sam, field()]);
    expect(axes.every((a) => a.ratio === 0)).toBe(true);
  });

  it("keeps a team of one at the full edge", () => {
    expect(fieldRadar(maya, [maya]).every((a) => a.ratio === 1)).toBe(true);
  });

  it("never goes past the edge or below the centre on bad numbers", () => {
    const odd = field({ goals: -3 });
    expect(fieldRadar(odd, [maya]).find((a) => a.label === "Goals")?.ratio).toBe(0);
    // A player missing from their own cohort list still stays on the chart
    expect(fieldRadar(maya, [sam]).find((a) => a.label === "Goals")?.ratio).toBe(1);
  });

  it("writes very high numbers with a thousands separator", () => {
    const axes = fieldRadar(field({ assists: 1204 }), [field({ assists: 1204 })]);
    expect(axes.find((a) => a.label === "Assists")?.text).toBe("1,204");
  });

  it("reads out as text for a screen reader", () => {
    expect(radarSummary(fieldRadar(maya, cohort))).toBe(
      "Goals 11, Assists 4, Fouls won 14, Tackles 9, Minutes 900, Starts 10",
    );
  });
});

describe("the keeper chart", () => {
  const gk = (over = {}) => ({ goalsAgainst: 0, saves: 0, cleanSheets: 0, starts: 0, yellow: 0, red: 0, mins: 0, ...over });

  it("has four corners in plain words, against the team's best keeper", () => {
    const a = gk({ saves: 40, cleanSheets: 3, starts: 10, mins: 900 });
    const b = gk({ saves: 20, cleanSheets: 5, starts: 4, mins: 360 });
    const axes = keeperRadar(a, [a, b]);
    expect(axes.map((x) => x.label)).toEqual(["Saves", "Clean sheets", "Starts", "Minutes"]);
    expect(axes.map((x) => x.ratio)).toEqual([1, 0.6, 1, 1]);
  });

  it("is flat for a keeper with no numbers", () => {
    expect(keeperRadar(gk(), [gk()]).every((x) => x.ratio === 0)).toBe(true);
  });
});

describe("the chart's outline", () => {
  it("puts the first corner at the top and goes clockwise", () => {
    const points = radarPoints([1, 1, 1, 1], 0);
    expect(points).toHaveLength(4);
    expect(points[0].x).toBeCloseTo(50, 5);
    expect(points[0].y).toBeCloseTo(0, 5);
    expect(points[1].x).toBeCloseTo(100, 5);
    expect(points[1].y).toBeCloseTo(50, 5);
    expect(points[2].y).toBeCloseTo(100, 5);
    expect(points[3].x).toBeCloseTo(0, 5);
  });

  it("keeps a small shape visible at the centre for a ratio of 0", () => {
    const [top] = radarPoints([0, 0, 0], 0.08);
    expect(top.y).toBeCloseTo(50 - 50 * 0.08, 5);
  });

  it("never draws outside the chart", () => {
    const points = radarPoints([5, -2, Number.NaN], 0.08);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(100);
    }
  });
});

describe("the letters in a player's avatar", () => {
  it("is the first letter of the first and last word", () => {
    expect(avatarInitials("Maya Chen")).toBe("MC");
    expect(avatarInitials("Christopher Alexander Montgomery III")).toBe("CI");
    expect(avatarInitials("Jo")).toBe("J");
  });

  it("keeps a non-Latin name whole, by character", () => {
    expect(avatarInitials("王秀英")).toBe("王");
    expect(avatarInitials("Łukasz Żółć")).toBe("ŁŻ");
  });

  it("skips an emoji and uses the first letter after it, never half an emoji", () => {
    expect(avatarInitials("🦊 Fox")).toBe("F");
    expect(avatarInitials("🦊Fox")).toBe("F");
    expect(avatarInitials("Sam 🦊")).toBe("S");
  });

  it("is a question mark for a name with no letter or number at all", () => {
    expect(avatarInitials("🦊")).toBe("?");
    expect(avatarInitials("   ")).toBe("?");
    expect(avatarInitials("")).toBe("?");
  });
});
