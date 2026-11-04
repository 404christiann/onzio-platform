import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Fixture } from "@/lib/data";
import { CinematicLatestResult, CinematicReplay } from "@/components/cinematic/CinematicMatchResult";

const played: Fixture = {
  date: "2027-03-20", time: "19:45", opponent: "Ocelot FC", opponentShortName: "OCFC", opponentLogoUrl: "/ocelot.png",
  competition: "UPSL Premier Regular Season", home: true, venue: "Robinson Stadium",
  roseCityScore: 1, opponentScore: 0, scorers: ["J. Hernandez (38′)", "G. Alfaro (73′)"],
};
const strip = (fixture: Fixture) => renderToStaticMarkup(createElement(CinematicLatestResult, { fixture, clubLabel: "RCFC", crestUrl: "/crest.png" }));
const replay = (fixture: Fixture) => renderToStaticMarkup(createElement(CinematicReplay, { fixture, clubLabel: "RCFC", crestUrl: "/crest.png" }));

describe("cinematic@2 latest result strip", () => {
  it("shows the competition, date, venue, both sides, the score and the scorers", () => {
    const html = strip(played);
    for (const text of ["UPSL Premier Regular Season", "Saturday, March 20, 2027", "Robinson Stadium", "RCFC", "OCFC", "J. Hernandez (38′)", "G. Alfaro (73′)"]) expect(html).toContain(text);
    expect(html).toContain('aria-label="Latest result: RCFC 1, OCFC 0"');
    expect(html).toContain('src="/crest.png"');
    expect(html).toContain("/ocelot.png");
  });
  it("puts the club score first for away matches too", () => {
    expect(strip({ ...played, home: false, roseCityScore: 2, opponentScore: 3 })).toContain('aria-label="Latest result: RCFC 2, OCFC 3"');
  });
  it("falls back to the opponent's full name and omits empty scorers and competition", () => {
    const html = strip({ ...played, opponentShortName: null, competition: null, scorers: [] });
    expect(html).toContain("Ocelot FC");
    expect(html).not.toContain("result-events");
    expect(html).not.toContain("result-competition");
  });
});

describe("cinematic@2 replay the match", () => {
  it("shows a 'coming soon' placeholder, with no player, until a replay is added", () => {
    for (const html of [replay(played), replay({ ...played, replayVideoUrl: "" })]) {
      expect(html).toContain("Replay the match");
      expect(html).toContain("RCFC vs OCFC");
      expect(html).toContain("Coming soon");
      expect(html).not.toContain("<iframe");
      expect(html).not.toContain("<button");
    }
  });
  it("offers a play cover for a stored YouTube replay without loading the embed first", () => {
    const html = replay({ ...played, replayVideoUrl: "https://www.youtube.com/embed/fJf_A4LdKDw?rel=0" });
    expect(html).toContain('aria-label="Play RCFC vs OCFC match replay"');
    expect(html).toContain("Watch now");
    expect(html).not.toContain("<iframe");
  });
  it("treats an unexpected link as no replay rather than embedding it", () => {
    const html = replay({ ...played, replayVideoUrl: "https://evil.example/embed/fJf_A4LdKDw" });
    expect(html).toContain("Coming soon");
    expect(html).not.toContain("evil.example");
  });
});
