import { describe, expect, it } from "vitest";
import { buildTeamAnalytics, defaultPlayerId, type TeamAnalyticsRows } from "@/lib/admin-analytics-data";

// ADMIN-RE-19: how the rows the page reads become the numbers it shows, apart
// from the database reads. Every id is made up.

const SEASON = { id: "s1", label: "2026–27" };

function rows(over: Partial<TeamAnalyticsRows> = {}): TeamAnalyticsRows {
  return {
    season: SEASON,
    matches: [],
    matchStats: [],
    players: [],
    fieldSeason: [],
    keeperSeason: [],
    ...over,
  };
}

const match = (id: string, date: string, us: number | null, them: number | null, opponent = "Opp") => ({
  id,
  date,
  opponent,
  rose_city_score: us,
  opponent_score: them,
});

const player = (id: string, name: string, position: string, number = 1, active = true) => ({
  id,
  name,
  position,
  number,
  active,
});

const fieldRow = (player_id: string, over: Record<string, number> = {}) => ({
  player_id,
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
  ...over,
});

describe("the games the team has a result for", () => {
  it("keeps only games with both scores, oldest first, with who we played", () => {
    const data = buildTeamAnalytics(
      rows({
        matches: [
          match("m2", "2026-09-06", 2, 0, "Westfield Rovers"),
          match("m1", "2026-08-30", 3, 1, "Harbor City SC"),
          match("m3", "2026-09-13", null, null, "Not played yet"),
          match("m4", "2026-09-20", 1, null, "Half entered"),
        ],
      }),
    );
    expect(data.games.map((g) => [g.id, g.us, g.them, g.opponent])).toEqual([
      ["m1", 3, 1, "Harbor City SC"],
      ["m2", 2, 0, "Westfield Rovers"],
    ]);
    expect(data.record.played).toBe(2);
  });

  it("is an empty season, not an error, when no game has a score", () => {
    const data = buildTeamAnalytics(rows({ matches: [match("m1", "2026-09-13", null, null)] }));
    expect(data.games).toEqual([]);
    expect(data.record).toMatchObject({ played: 0, scored: 0, letIn: 0 });
  });

  it("treats a score that is not a whole number as not entered", () => {
    const data = buildTeamAnalytics(rows({ matches: [match("m1", "2026-09-13", -1, 2), match("m2", "2026-09-20", 1.5, 2)] }));
    expect(data.games).toEqual([]);
  });
});

describe("who scored and who set them up, game by game", () => {
  const people = [player("p1", "Maya Chen", "Forward"), player("p2", "Sam Okafor", "Forward"), player("p3", "Leo Park", "Midfielder")];
  const stat = (match_id: string, player_id: string, goals: number, assists: number) => ({ match_id, player_id, goals, assists });

  it("lists scorers by goals then name, and assisters the same way", () => {
    const data = buildTeamAnalytics(
      rows({
        matches: [match("m1", "2026-10-04", 4, 2, "Brookside Town")],
        players: people,
        matchStats: [stat("m1", "p2", 1, 0), stat("m1", "p1", 2, 1), stat("m1", "p3", 0, 2), stat("m1", "p1", 0, 0)],
      }),
    );
    expect(data.details.m1).toEqual({
      scorers: [
        { playerId: "p1", name: "Maya Chen", count: 2 },
        { playerId: "p2", name: "Sam Okafor", count: 1 },
      ],
      assisters: [
        { playerId: "p3", name: "Leo Park", count: 2 },
        { playerId: "p1", name: "Maya Chen", count: 1 },
      ],
    });
  });

  it("has an empty card, not a missing one, for a game with no player numbers", () => {
    const data = buildTeamAnalytics(rows({ matches: [match("m1", "2026-10-04", 0, 0)], players: people }));
    expect(data.details.m1).toEqual({ scorers: [], assisters: [] });
  });

  it("ignores numbers for a game that has no result, or a player who is gone", () => {
    const data = buildTeamAnalytics(
      rows({
        matches: [match("m1", "2026-10-04", 1, 0), match("m2", "2026-10-11", null, null)],
        players: people,
        matchStats: [stat("m2", "p1", 3, 0), stat("m1", "ghost", 1, 0)],
      }),
    );
    expect(data.details.m2).toBeUndefined();
    expect(data.details.m1).toEqual({ scorers: [], assisters: [] });
  });

  it("keeps a long or non-Latin name exactly as stored", () => {
    const data = buildTeamAnalytics(
      rows({
        matches: [match("m1", "2026-10-04", 1, 0)],
        players: [player("p1", "王秀英", "Forward")],
        matchStats: [stat("m1", "p1", 1, 0)],
      }),
    );
    expect(data.details.m1!.scorers[0]!.name).toBe("王秀英");
  });
});

describe("the players, and the team each is measured against", () => {
  it("lists active players only, grouped by position in the roster's order", () => {
    const data = buildTeamAnalytics(
      rows({
        players: [
          player("f1", "Maya Chen", "Forward", 11),
          player("g1", "Kai Lund", "Goalkeeper", 1),
          player("m1", "Leo Park", "Midfielder", 8),
          player("d1", "Ava Ruiz", "Defender", 4),
          player("x", "Left The Club", "Forward", 99, false),
        ],
      }),
    );
    expect(data.groups.map((g) => [g.position, g.players.map((p) => p.name)])).toEqual([
      ["Goalkeeper", ["Kai Lund"]],
      ["Defender", ["Ava Ruiz"]],
      ["Midfielder", ["Leo Park"]],
      ["Forward", ["Maya Chen"]],
    ]);
  });

  it("leaves out a position nobody plays", () => {
    const data = buildTeamAnalytics(rows({ players: [player("f1", "Maya Chen", "Forward")] }));
    expect(data.groups.map((g) => g.position)).toEqual(["Forward"]);
  });

  it("sorts by shirt number, then name", () => {
    const data = buildTeamAnalytics(
      rows({
        players: [player("a", "Zoe Adams", "Forward", 7), player("b", "Maya Chen", "Forward", 11), player("c", "Abe Cole", "Forward", 7)],
      }),
    );
    expect(data.groups[0]!.players.map((p) => p.name)).toEqual(["Abe Cole", "Zoe Adams", "Maya Chen"]);
  });

  it("gives a player with no season row zeros, as the roster does", () => {
    const data = buildTeamAnalytics(rows({ players: [player("f1", "Jo", "Forward")] }));
    const jo = data.groups[0]!.players[0]!;
    expect(jo.keeper).toBe(false);
    expect(jo.axes.every((a) => a.value === 0 && a.ratio === 0)).toBe(true);
    expect(jo.goals).toBe(0);
  });

  it("scales each player's chart against their own position only", () => {
    const data = buildTeamAnalytics(
      rows({
        players: [player("f1", "Maya Chen", "Forward"), player("f2", "Sam Okafor", "Forward"), player("d1", "Ava Ruiz", "Defender")],
        fieldSeason: [fieldRow("f1", { goals: 11 }), fieldRow("f2", { goals: 6 }), fieldRow("d1", { goals: 30 })],
      }),
    );
    const goals = (name: string) =>
      data.groups.flatMap((g) => g.players).find((p) => p.name === name)!.axes.find((a) => a.label === "Goals")!.ratio;
    // The defender's 30 goals do not move the forwards' edge
    expect(goals("Maya Chen")).toBe(1);
    expect(goals("Sam Okafor")).toBeCloseTo(6 / 11, 5);
    expect(goals("Ava Ruiz")).toBe(1);
  });

  it("gives a keeper keeper corners and their own cohort", () => {
    const data = buildTeamAnalytics(
      rows({
        players: [player("g1", "Kai Lund", "Goalkeeper"), player("g2", "Ben Ray", "Goalkeeper")],
        keeperSeason: [
          { player_id: "g1", goals_against: 9, saves: 40, clean_sheets: 3, starts: 10, yellow: 0, red: 0, mins: 900 },
          { player_id: "g2", goals_against: 2, saves: 20, clean_sheets: 1, starts: 2, yellow: 0, red: 0, mins: 180 },
        ],
      }),
    );
    const byName = (name: string) => data.groups[0]!.players.find((x) => x.name === name)!;
    const [kai, ben] = [byName("Kai Lund"), byName("Ben Ray")];
    expect(kai!.keeper).toBe(true);
    expect(kai!.axes.map((a) => a.label)).toEqual(["Saves", "Clean sheets", "Starts", "Minutes"]);
    expect(ben!.axes.find((a) => a.label === "Saves")!.ratio).toBe(0.5);
  });

  it("carries the shirt number and the goals for the list line", () => {
    const data = buildTeamAnalytics(
      rows({ players: [player("f1", "Maya Chen", "Forward", 11)], fieldSeason: [fieldRow("f1", { goals: 11 })] }),
    );
    expect(data.groups[0]!.players[0]).toMatchObject({ id: "f1", number: 11, goals: 11 });
  });

  it("reads a 0 or missing shirt number as no number", () => {
    const data = buildTeamAnalytics(rows({ players: [player("f1", "Jo", "Forward", 0)] }));
    expect(data.groups[0]!.players[0]!.number).toBe(0);
  });
});

describe("the season", () => {
  it("is passed through for the page's subtitle", () => {
    expect(buildTeamAnalytics(rows()).season).toEqual(SEASON);
  });
});

describe("the player the page opens on", () => {
  const open = (r: Partial<TeamAnalyticsRows>) => defaultPlayerId(buildTeamAnalytics(rows(r)).groups);

  it("is the team's top scorer, as the design opens on a forward, not on the first keeper", () => {
    expect(
      open({
        players: [player("g1", "Kai Lund", "Goalkeeper", 1), player("f1", "Maya Chen", "Forward", 11), player("f2", "Sam Okafor", "Forward", 9)],
        fieldSeason: [fieldRow("f1", { goals: 11 }), fieldRow("f2", { goals: 6 })],
      }),
    ).toBe("f1");
  });

  it("is the first player in the list when nobody has scored", () => {
    expect(
      open({ players: [player("g1", "Kai Lund", "Goalkeeper", 1), player("f1", "Maya Chen", "Forward", 11)] }),
    ).toBe("g1");
  });

  it("is a keeper when only keepers are on the roster, and nobody for an empty roster", () => {
    expect(open({ players: [player("g1", "Kai Lund", "Goalkeeper", 1)] })).toBe("g1");
    expect(open({})).toBeNull();
  });
});
