import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Fixture } from "@/lib/data";
import { CinematicLatestResult } from "@/components/cinematic/CinematicMatchResult";

/**
 * UI-FIX-MATCH-SUMMARY-SCORERS. The score header's scorer line used to be pulled up by a fixed -2.2vw, tuned for a
 * one-line team name, so a name that wrapped ("Rose City Futbol" / "Club") was drawn over by it. The browser spec
 * (tests/browser/match-summary-scorers.spec.ts) measures the real boxes; these pin the markup and CSS it relies on.
 */
const css = readFileSync(path.join(process.cwd(), "components/cinematic/cinematic.css"), "utf8");
const rule = (selector: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, selectors]) => selectors.split(",").some(item => item.trim().endsWith(selector))).map(([, , body]) => body);
/** The bodies of every `@media(<query>){…}` block, joined: the stylesheet repeats the same query in several places. */
const mediaBlock = (query: string) => {
  const bodies: string[] = [];
  for (let from = css.indexOf(`@media(${query}){`); from > -1; from = css.indexOf(`@media(${query}){`, from + 1)) {
    const open = css.indexOf("{", from);
    let depth = 0;
    for (let index = open; index < css.length; index += 1) {
      if (css[index] === "{") depth += 1;
      if (css[index] === "}" && (depth -= 1) === 0) { bodies.push(css.slice(open + 1, index)); break; }
    }
  }
  expect(bodies.length, query).toBeGreaterThan(0);
  return bodies.join("\n");
};

const played: Fixture = {
  date: "2026-05-31", time: "12:00", opponent: "AYSD D1", opponentShortName: null, opponentLogoUrl: "/d1.png", competition: "UPSL 2026 Premier SoCal North",
  home: true, venue: "Lake Forest Sports Park", roseCityScore: 5, opponentScore: 3, scorers: ["J. Hernandez (14′)"],
};
const strip = (fixture: Fixture = played, clubLabel = "Rose City Futbol Club") => renderToStaticMarkup(createElement(CinematicLatestResult, { fixture, clubLabel, crestUrl: "/crest.png" }));

describe("score header: scorers follow the home name", () => {
  it("renders the home name and the scorers in one wrapper, the name first", () => {
    const html = strip();
    const side = html.match(/<div class="result-side home">([^]*?)<\/div>/);
    expect(side, "the home name and scorers share a .result-side").not.toBeNull();
    expect(side![1]).toMatch(/^<strong class="result-name home">Rose City Futbol Club<\/strong><p class="result-events">/);
    expect(side![1]).toContain("J. Hernandez (14′)");
    // The crest still follows the wrapper, so the row is name side | crest | score | crest | away name.
    expect(html.indexOf("result-side home")).toBeLessThan(html.indexOf("result-crest"));
  });

  it("keeps the wrapper (and no scorer line) when a match has no scorers", () => {
    const html = strip({ ...played, scorers: [] });
    expect(html).toMatch(/<div class="result-side home"><strong class="result-name home">Rose City Futbol Club<\/strong><\/div>/);
    expect(html).not.toContain("result-events");
  });

  it("never pulls the scorer line up with a negative margin, at any width", () => {
    for (const body of rule(".result-events")) expect(body).not.toMatch(/margin(-top)?\s*:\s*-/);
    expect(css).not.toMatch(/\.result-events[^{}]*\{[^}]*margin-top:-/);
  });

  it("on desktop lays the name and scorers out as one grid with the name centred between equal tracks", () => {
    const desktop = mediaBlock("min-width:1025px");
    expect(desktop).toMatch(/\.result-side\.home\{[^}]*display:grid[^}]*grid-template-rows:1fr auto 1fr[^}]*align-self:stretch/);
    expect(desktop).toMatch(/\.result-side\.home \.result-name\{[^}]*grid-row:2/);
    expect(desktop).toMatch(/\.result-side\.home \.result-events\{[^}]*grid-row:3[^}]*align-self:start/);
  });

  it("flattens the wrapper under 1025px so the full-width scorer line below the row is unchanged", () => {
    expect(rule(".result-side").some(body => /display:contents/.test(body))).toBe(true);
    const phone = mediaBlock("max-width:1024px");
    expect(phone).toMatch(/\.result-events\{[^}]*grid-column:1\/-1[^}]*grid-row:2/);
  });

  it("lets long names and scorers shrink and wrap instead of widening the page", () => {
    expect(rule(".result-row").some(body => /grid-template-columns:minmax\(0,1fr\) auto auto auto minmax\(0,1fr\)/.test(body))).toBe(true);
    expect(rule(".result-name").some(body => /overflow-wrap:anywhere/.test(body))).toBe(true);
    const spans = rule(".result-events>span").join(";");
    expect(spans).toMatch(/display:inline-block/);
    expect(spans).toMatch(/max-width:100%/);
    expect(spans).toMatch(/overflow-wrap:anywhere/);
    expect(spans).not.toMatch(/white-space:nowrap/);
    // The replay card under the header repeats both team names in its eyebrow.
    expect(rule(".replay .eyebrow").some(body => /overflow-wrap:anywhere/.test(body))).toBe(true);
  });
});
