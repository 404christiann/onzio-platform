import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CinematicSchedule from "@/components/cinematic/CinematicSchedule";
import { nextScheduleFixture, orderedSchedule, scheduleKickoff } from "@/lib/cinematic-schedule";
import type { Fixture } from "@/lib/data";

const fixture: Fixture = {
  id: "11111111-1111-4111-8111-111111111111", date: "2027-05-02", time: "19:45:00",
  opponent: "Sample FC", home: true, venue: "Sample Stadium", address: "123 Stadium Road",
  opponentLogoUrl: "/opponent.webp", sponsorName: "Sample Sponsor",
  sponsorLogoUrl: "/sponsor.webp", competition: "Sample League", leagueLogoUrl: "/league.webp",
  roseCityScore: null, opponentScore: null,
};
const now = new Date("2027-05-03T02:00:00Z"); // May2,7pm in California.
describe("cinematic Schedule", () => {
  it("uses club wall time for Next, includes away games, excludes scored and invalid fixtures", () => {
    const played = { ...fixture, date: "2027-05-01", roseCityScore: 2, opponentScore: 1 };
    const away = { ...fixture, id: "away", home: false, time: "19:30" };
    expect(nextScheduleFixture([fixture, played, away], now, "America/Los_Angeles")).toBe(away);
    expect(nextScheduleFixture([{ ...fixture, time: "TBD" }, { ...fixture, date: "2027-02-30" }], now, "America/Los_Angeles")).toBeNull();
    expect(nextScheduleFixture([{ ...fixture, roseCityScore: 0, opponentScore: 0 }], now, "America/Los_Angeles")).toBeNull();
    expect(nextScheduleFixture([fixture], new Date("2027-05-03T03:00:00Z"), "America/Los_Angeles")).toBeNull();
  });
  it("retains stable chronological ordering without changing the source array", () => {
    const earlier = { ...fixture, date: "2027-04-01" };
    const source = [fixture, earlier];
    expect(orderedSchedule(source)).toEqual([earlier, fixture]);
    expect(source).toEqual([fixture, earlier]);
    expect(scheduleKickoff("19:45:00", "America/Los_Angeles")).toBe("7:45PM PT");
    expect(scheduleKickoff("TBD", "America/Los_Angeles")).toBe("TBD");
  });
  it("renders all three saved logo types and a scored result without hardcoded sponsor/league assets", () => {
    const html = renderToStaticMarkup(createElement(CinematicSchedule, {
      schedule: { fixtures: [{ ...fixture, roseCityScore: 2, opponentScore: 1 }], seasonLabel: "2027", timeZone: "America/Los_Angeles" }, initialNow: now,
    }));
    for (const value of ["/opponent.webp", "/sponsor.webp", "/league.webp", "Sample Sponsor", "Sample League league logo", 'class="score-separator"', "2027 Season", "Directions to Sample Stadium"]) expect(html).toContain(value);
    expect(html).not.toContain("upsl-color.png");
    expect(html).not.toContain("Load more matches");
    expect(html).toContain('aria-label="2 to 1"');
  });
  it("limits a 13-game season to four cards and exposes the remaining count", () => {
    const fixtures = Array.from({ length: 13 }, (_, i) => ({ ...fixture, id: `match-${i}`, date: `2027-05-${String(i + 1).padStart(2, "0")}` }));
    const html = renderToStaticMarkup(createElement(CinematicSchedule, { schedule: { fixtures, seasonLabel: "2027", timeZone: "America/Los_Angeles" }, initialNow: now }));
    expect(html.match(/class="fixture-card"/g)).toHaveLength(4);
    expect(html).toContain("Showing 4 of 13 matches");
    expect(html).toContain('aria-controls="cinematic-schedule-fixtures"');
    expect(html).toContain('data-next="true"');
  });
  it("shows a truthful empty season and league text when its image is removed", () => {
    const empty = renderToStaticMarkup(createElement(CinematicSchedule, { schedule: { fixtures: [], seasonLabel: "2027", timeZone: "UTC" } }));
    expect(empty).toContain("Schedule coming soon");
    expect(empty).not.toContain('class="fixture-card"');
    const cleared = renderToStaticMarkup(createElement(CinematicSchedule, { schedule: { fixtures: [{ ...fixture, sponsorLogoUrl: null, leagueLogoUrl: null }], seasonLabel: "2027", timeZone: "UTC" }, initialNow: now }));
    expect(cleared).toContain('class="league-name">Sample League');
    expect(cleared).not.toContain("/league.webp");
    expect(cleared).not.toContain("Presented by");
  });
});
