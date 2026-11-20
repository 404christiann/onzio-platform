import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CinematicSchedule from "@/components/cinematic/CinematicSchedule";
import { googleMapsDirectionsUrl } from "@/lib/google-maps-directions";
import type { Fixture } from "@/lib/data";

describe("Google Maps directions link", () => {
  it("routes to the address the owner typed, using Google's official directions link", () => {
    expect(googleMapsDirectionsUrl("1570 E Colorado Blvd, Pasadena, CA 91106"))
      .toBe("https://www.google.com/maps/dir/?api=1&destination=1570%20E%20Colorado%20Blvd%2C%20Pasadena%2C%20CA%2091106");
  });

  it("keeps characters like & and # inside the destination", () => {
    expect(googleMapsDirectionsUrl("  Lake & Colorado #2, Pasadena  "))
      .toBe("https://www.google.com/maps/dir/?api=1&destination=Lake%20%26%20Colorado%20%232%2C%20Pasadena");
  });

  it("gives no link when no address was entered", () => {
    for (const blank of ["", "   ", null, undefined]) expect(googleMapsDirectionsUrl(blank)).toBe("");
  });
});

const VIDEO = "https://www.youtube.com/embed/fJf_A4LdKDw?rel=0";
const base = { opponentLogoUrl: null, competition: "UPSL", venue: "Robinson Stadium", city: "Pasadena", state: "CA", scorers: [], time: "19:45:00" };
const played: Fixture = { ...base, id: "ocelot", date: "2027-05-02", opponent: "Ocelot FC", home: true, address: "1570 E Colorado Blvd, Pasadena, CA", roseCityScore: 2, opponentScore: 1, replayVideoUrl: VIDEO };
const noAddress: Fixture = { ...base, id: "lasol", date: "2027-05-08", opponent: "LA Sol Athletics", home: false, venue: "Jesse Owens Stadium", city: "Los Angeles", address: "", roseCityScore: 2, opponentScore: 4, replayVideoUrl: "" };
const upcoming: Fixture = { ...base, id: "aysd", date: "2027-05-31", opponent: "AYSD D1", home: true, address: "1570 E Colorado Blvd, Pasadena, CA", roseCityScore: null, opponentScore: null, replayVideoUrl: VIDEO };
const fixtures = [played, noAddress, upcoming];
const schedule = () => renderToStaticMarkup(createElement(CinematicSchedule, { schedule: { fixtures, seasonLabel: "2027", timeZone: "America/Los_Angeles" }, initialNow: new Date("2027-05-20T12:00:00-07:00") }));
const card = (html: string, id: string) => html.split('data-fixture-id="').find(part => part.startsWith(`${id}"`)) ?? "";

describe("Schedule Directions and Watch on YouTube links", () => {
  it("opens Google Maps directions to the match address in a new tab", () => {
    const row = card(schedule(), "ocelot");
    expect(row).toContain('href="https://www.google.com/maps/dir/?api=1&amp;destination=1570%20E%20Colorado%20Blvd%2C%20Pasadena%2C%20CA"');
    expect(row).toMatch(/<a class="fixture-directions" href="[^"]+" target="_blank" rel="noopener noreferrer"/);
    expect(row).toContain(">Directions</a>");
  });

  it("marks Directions with Sam's green location pin", () => {
    const link = card(schedule(), "ocelot").split('<a class="fixture-directions"')[1]?.split("</a>")[0] ?? "";
    expect(link).toMatch(/<img[^>]*src="\/rose-city\/icons\/green-location-pin\.png"/);
    expect(link).toMatch(/<img[^>]*alt=""/);
    expect(link).not.toContain("<svg");
  });

  it("keeps the stadium name and Directions together on one line, with the full name on hover", () => {
    expect(card(schedule(), "ocelot")).toContain('<p class="fixture-venue"><span class="fixture-venue-name" title="Robinson Stadium - Pasadena, CA">Robinson Stadium - Pasadena, CA</span><a class="fixture-directions"');
  });

  it("shows no Directions link when the owner left the address blank", () => {
    const row = card(schedule(), "lasol");
    expect(row).toContain("Jesse Owens Stadium - Los Angeles, CA");
    expect(row).not.toContain("Directions");
    expect(row).not.toContain("google.com/maps");
  });

  it("opens the owner's YouTube link from Sam's logo in a new tab, before and after kickoff", () => {
    const html = schedule();
    for (const id of ["ocelot", "aysd"]) {
      expect(card(html, id)).toMatch(/<a href="https:\/\/www\.youtube\.com\/watch\?v=fJf_A4LdKDw" target="_blank" rel="noopener noreferrer"[^>]*><img[^>]*watch-on-youtube-/);
    }
  });

  it("shows Sam's logo without a link when there is no YouTube link (RC-SAM-FIXES)", () => {
    const row = card(schedule(), "lasol");
    expect(row).not.toContain("youtube.com");
    expect(row).toMatch(/<div class="fixture-watch"><img[^>]*watch-on-youtube-[^>]*alt="Watch on YouTube"/);
    expect(row).not.toContain("coming soon");
  });

  it("lets the owner enter each match's directions address in the Schedule editor", () => {
    // The Schedule form's fields live in ScheduleMatchForm.tsx. cinematic@2 (Rose City) gets the
    // directions address; every other design keeps the plain "Street address" field.
    const editor = readFileSync(resolve(process.cwd(), "components/admin/schedule/ScheduleMatchForm.tsx"), "utf8");
    const rose = editor.indexOf('club.presentationTemplateKey === "cinematic@2" ? (');
    const directions = editor.indexOf('label="Address for directions"');
    const street = editor.indexOf('label="Street address"');
    expect(rose).toBeGreaterThanOrEqual(0);
    expect(directions).toBeGreaterThan(rose);
    expect(editor).toContain("Visitors tap Directions on the Schedule to get Google Maps directions to this address.");
    expect(street).toBeGreaterThan(directions);
    expect(editor.slice(directions, street)).toContain(") : (");
    expect(editor.split('label="Address for directions"')).toHaveLength(2);
  });

  it("puts the NEXT tag on the same line as the date", () => {
    expect(card(schedule(), "aysd")).toMatch(/<div class="fixture-date"><time [^>]*>May 31, 2027<\/time><span class="next-badge">Next<\/span><\/div>/);
  });
});
