import { describe, expect, it } from "vitest";
import type { Fixture } from "@/lib/data";
import { latestResultFixture } from "@/components/cinematic/next-home-fixture";

const fixture = (values: Partial<Fixture>): Fixture => ({ date: "2027-03-13", time: "19:45", opponent: "Visitors", home: true, venue: "Stadium", ...values });
const scored = (values: Partial<Fixture>) => fixture({ roseCityScore: 1, opponentScore: 0, ...values });

describe("cinematic latest result", () => {
  it("picks the most recent match with a final score, home or away", () => {
    const away = scored({ id: "away", date: "2027-03-27", home: false });
    expect(latestResultFixture([scored({ date: "2027-03-20" }), away, scored({ date: "2027-03-06" })])).toBe(away);
  });
  it("breaks same-day ties by kickoff time", () => {
    const evening = scored({ time: "20:00" });
    expect(latestResultFixture([evening, scored({ time: "12:00" })])).toBe(evening);
  });
  it("ignores matches without both scores and malformed dates", () => {
    const final = scored({ date: "2027-03-06" });
    expect(latestResultFixture([
      fixture({ date: "2027-03-27" }),
      fixture({ date: "2027-03-20", roseCityScore: 2, opponentScore: null }),
      scored({ date: "2027-02-30" }),
      final,
    ])).toBe(final);
  });
  it("counts a 0–0 draw as a result", () => {
    const draw = fixture({ roseCityScore: 0, opponentScore: 0 });
    expect(latestResultFixture([draw])).toBe(draw);
  });
  it("returns no fixture when nothing has been played", () => {
    expect(latestResultFixture([fixture({}), fixture({ date: "2027-04-01" })])).toBeNull();
  });
});
