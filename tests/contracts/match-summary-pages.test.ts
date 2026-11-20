import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CinematicSchedule from "@/components/cinematic/CinematicSchedule";
import CinematicMatchSummary from "@/components/cinematic/CinematicMatchSummary";
import { EMPTY_MATCH_SUMMARY, type MatchSummary } from "@/lib/match-summary";
import type { Fixture } from "@/lib/data";

const VIDEO = "https://www.youtube.com/embed/fJf_A4LdKDw?rel=0";
const base = { opponentLogoUrl: null, competition: "UPSL Premier Regular Season", venue: "Robinson Stadium", address: "1570 E Colorado Blvd, Pasadena, CA", city: "Pasadena", state: "CA", attendance: null, scorers: [], time: "19:45:00" };
const played: Fixture = { ...base, id: "ocelot", date: "2027-05-02", opponent: "Ocelot FC", home: true, roseCityScore: 2, opponentScore: 1, attendance: 1356, scorers: ["J. Hernandez (23′)", "G. Alfaro (71′)"], replayVideoUrl: VIDEO };
const noVideo: Fixture = { ...base, id: "amsg", date: "2027-05-16", opponent: "AMSG FC", home: false, roseCityScore: 2, opponentScore: 1, replayVideoUrl: "" };
const upcoming: Fixture = { ...base, id: "aysd", date: "2027-05-31", opponent: "AYSD D1", home: true, roseCityScore: null, opponentScore: null, replayVideoUrl: null };
const summary: MatchSummary = {
  events: [
    { minute: "23′", side: "club", kind: "goal", player: "#8 J. Hernandez", detail: "Assist: #10 G. Alfaro" },
    { minute: "41′", side: "opponent", kind: "yellow", player: "#5 B. Williams", detail: "" },
    { minute: "45′+2′", side: "opponent", kind: "goal", player: "#9 D. Ortiz", detail: "" },
    { minute: "58′", side: "club", kind: "sub", player: "#14 L. Castillo", detail: "#11 R. Vega" },
    { minute: "71′", side: "club", kind: "goal", player: "#10 G. Alfaro", detail: "" },
  ],
  stats: [{ label: "Possession %", club: 54.5, opponent: 45.5 }, { label: "Red cards", club: 0, opponent: 0 }],
  officials: [{ role: "Referee", name: "Dennis Maybourn" }],
  kit: [{ item: "Jersey", color: "Red" }],
  lineups: {
    club: { starting: [{ number: "8", name: "J. Hernandez" }], bench: [{ number: "14", name: "L. Castillo" }], staff: [{ name: "G. Morales", role: "Head Coach" }] },
    opponent: { starting: [{ number: "9", name: "D. Ortiz" }], bench: [], staff: [] },
  },
};
const schedule = () => renderToStaticMarkup(createElement(CinematicSchedule, { schedule: { fixtures: [played, noVideo, upcoming], seasonLabel: "2027", timeZone: "America/Los_Angeles" }, initialNow: new Date("2027-05-20T12:00:00-07:00") }));
const page = (fixture: Fixture) => renderToStaticMarkup(createElement(CinematicMatchSummary, { fixture, clubLabel: "RCFC", crestUrl: "/crest.png", timeZone: "America/Los_Angeles" }));

describe("Schedule Summary and Rewatch columns", () => {
  it("links each finished match to its own summary page, and never an upcoming one", () => {
    const html = schedule();
    expect(html).toContain(">Summary<");
    expect(html).toContain(">Rewatch the match<");
    expect(html).toContain('href="/schedule/ocelot"');
    expect(html).toContain('href="/schedule/amsg"');
    expect(html).not.toContain('href="/schedule/aysd"');
  });

  it("links the one optional video, and shows the placeholder without one", () => {
    const html = schedule();
    expect(html).toContain('href="https://www.youtube.com/watch?v=fJf_A4LdKDw"');
    expect(html).toContain("Replay coming soon");
    expect(html).toContain("Stream coming soon");
  });

  it("puts Directions under the venue", () => {
    expect(schedule()).toMatch(/class="fixture-venue"><span class="fixture-venue-name"[^>]*>Robinson Stadium - Pasadena, CA<\/span><a class="fixture-directions"/);
  });
});

describe("Match Summary page", () => {
  it("shows the score header, timeline with the running score, statistics, information, replay and lineups", () => {
    const html = page({ ...played, summary });
    for (const text of ["Match Summary", "UPSL Premier Regular Season", "Goal: #8 J. Hernandez", "Assist: #10 G. Alfaro", "1 : 0", "1 : 1", "2 : 1",
      "Possession %", "54.5", "Robinson Stadium", "Pasadena, California", "1,356", "7:45PM PT", "Referee:", "Dennis Maybourn", "Jersey color:",
      "Replay the match", "RCFC Starting XI", "Ocelot FC Starting XI", "RCFC Bench", "RCFC Managers", "Head Coach"]) expect(html, text).toContain(text);
    expect(html).toContain('src="/rose-city/icons/yellow-card.png"');
    expect(html).toContain('href="https://www.youtube.com/watch?v=fJf_A4LdKDw"');
    expect(html).toContain('style="width:54.5%"');
    // Both sides 0: the bar is split evenly rather than dividing by zero.
    expect(html).toContain('style="width:50%"');
  });

  it("hides the sections a match has no details for", () => {
    for (const html of [page({ ...played, summary: null }), page({ ...played, summary: EMPTY_MATCH_SUMMARY })]) {
      expect(html).toContain("Match information");
      expect(html).toContain("Replay the match");
      expect(html).not.toContain("summary-timeline");
      expect(html).not.toContain("Statistics");
      expect(html).not.toContain("Starting XI");
      expect(html).not.toContain("Referee:");
    }
  });

  it("explains that a match not played yet has no summary", () => {
    const html = page(upcoming);
    expect(html).toContain("after the match");
    expect(html).not.toContain("result-strip");
  });

  it("is Rose City's page on the existing tenant match route, chosen by slug and not by Host", () => {
    const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
    const route = read("app/%5Fclubs/[slug]/schedule/[fixtureId]/page.tsx");
    expect(route).toContain("getClubContextBySlug(slug)");
    expect(route).not.toContain("getClubContext(");
    expect(route).not.toContain("next/headers");
    expect(route).toContain("siteMatchPageFor(club)");
    expect(read("lib/site-public-pages/match.ts")).toContain('bySlug({ "rose-city": RoseCityMatchPage })');
    expect(read("components/sites/rose-city/RoseCityMatchPage.tsx")).toContain("<CinematicMatchSummaryPage fixtureId={fixtureId} initial={initial} />");
    expect(read("app/(public)/schedule/[fixtureId]/page.tsx")).not.toContain("cinematic");
  });
});
