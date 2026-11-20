import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CinematicSchedule from "@/components/cinematic/CinematicSchedule";
import { nextScheduleFixture, orderedSchedule, scheduleDisplay, scheduleKickoff } from "@/lib/cinematic-schedule";
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
  it("lists the next match first, then played matches newest first, and hides later fixtures (RC-SAM-FIXES)", () => {
    const season = Array.from({ length: 6 }, (_, i) => ({ ...fixture, id: `match-${i + 1}`, date: `2027-05-0${i + 1}` }));
    const unscoredPast = { ...season[0], roseCityScore: null, opponentScore: null };
    const scored = season.slice(1, 3).map(match => ({ ...match, roseCityScore: 1, opponentScore: 0 }));
    // May 4, 9pm in California: May 4's 7:45pm kickoff has passed without a score, so May 5 is next.
    const display = scheduleDisplay([season[5], season[4], season[3], ...scored, unscoredPast], new Date("2027-05-05T04:00:00Z"), "America/Los_Angeles");
    expect(display.next?.id).toBe("match-5");
    expect(display.list.map(item => item.fixture.id)).toEqual(["match-5", "match-4", "match-3", "match-2", "match-1"]);
    expect(display.list.map(item => item.matchNumber)).toEqual([5, 4, 3, 2, 1]);
    const finished = scheduleDisplay(season.map(match => ({ ...match, roseCityScore: 0, opponentScore: 0 })), now, "America/Los_Angeles");
    expect(finished.next).toBeNull();
    expect(finished.list.map(item => item.fixture.id)).toEqual(["match-6", "match-5", "match-4", "match-3", "match-2", "match-1"]);
    const preseason = scheduleDisplay(season, new Date("2027-04-01T00:00:00Z"), "America/Los_Angeles");
    expect(preseason.list.map(item => item.fixture.id)).toEqual(["match-1"]);
  });
  it("keeps an upcoming match without a kickoff time visible ahead of the timed next match (RC-SAM-FIXES review)", () => {
    const played = { ...fixture, id: "played", date: "2027-05-01", roseCityScore: 1, opponentScore: 0 };
    const untimed = { ...fixture, id: "untimed", date: "2027-05-08", time: "" };
    const timed = { ...fixture, id: "timed", date: "2027-05-15" };
    const later = { ...fixture, id: "later", date: "2027-05-22" };
    const display = scheduleDisplay([later, timed, untimed, played], now, "America/Los_Angeles");
    expect(display.next?.id).toBe("timed");
    expect(display.list.map(item => item.fixture.id)).toEqual(["untimed", "timed", "played"]);
  });
  it("limits a long season to four cards and exposes the remaining count", () => {
    const fixtures = Array.from({ length: 13 }, (_, i) => ({ ...fixture, id: `match-${i}`, date: `2027-05-${String(i + 1).padStart(2, "0")}` }));
    // May 13, 7pm in California: twelve matches have kicked off and May 13 is next.
    const html = renderToStaticMarkup(createElement(CinematicSchedule, { schedule: { fixtures, seasonLabel: "2027", timeZone: "America/Los_Angeles" }, initialNow: new Date("2027-05-14T02:00:00Z") }));
    expect(html.match(/class="fixture-card"/g)).toHaveLength(4);
    expect(html).toContain("Showing 4 of 13 matches");
    expect(html).toContain('aria-controls="cinematic-schedule-fixtures"');
    expect(html).toContain('data-next="true"');
  });
  it("always shows the Watch on YouTube logo, linked only when the match has a video (RC-SAM-FIXES)", () => {
    const render = (replayVideoUrl: string | null) => renderToStaticMarkup(createElement(CinematicSchedule, { schedule: { fixtures: [{ ...fixture, replayVideoUrl }], seasonLabel: "2027", timeZone: "America/Los_Angeles" }, initialNow: now }));
    const unlinked = render(null);
    expect(unlinked).toContain("watch-on-youtube-white.png");
    expect(unlinked).toContain('alt="Watch on YouTube"');
    expect(unlinked).not.toContain("youtube.com");
    expect(unlinked).not.toContain("coming soon");
    const linked = render("https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0");
    expect(linked).toContain('href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
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
