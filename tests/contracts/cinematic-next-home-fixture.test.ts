import { describe, expect, it } from "vitest";
import type { Fixture } from "@/lib/data";
import { cinematicMatchDate, cinematicMatchTime, nextHomeFixture } from "@/components/cinematic/next-home-fixture";

const fixture = (values: Partial<Fixture>): Fixture => ({ date: "2027-03-13", time: "19:45", opponent: "Visitors", home: true, venue: "Stadium", ...values });
describe("cinematic next home fixture", () => {
  it("skips away, past and malformed matches and sorts the schedule", () => {
    const later = fixture({ id: "later", date: "2027-03-20" });
    const next = fixture({ id: "next" });
    expect(nextHomeFixture([later, fixture({ date: "2027-03-12", home: false }), fixture({ date: "invalid" }), next, fixture({ date: "2026-12-01" })], new Date("2027-03-01T10:00:00Z"))).toBe(next);
  });
  it("updates to a later home fixture once kickoff has passed", () => {
    const later = fixture({ date: "2027-03-20" });
    expect(nextHomeFixture([fixture({}), later], new Date("2027-03-13T20:00:00Z"))).toBe(later);
  });
  it("returns no fixture without inventing a home match", () => {
    expect(nextHomeFixture([fixture({ home: false })], new Date("2027-03-01T10:00:00Z"))).toBeNull();
  });
  it("formats the manager's date and kickoff without changing the source", () => {
    expect(cinematicMatchDate("2027-03-13")).toBe("Saturday March 13");
    expect(cinematicMatchTime("19:45")).toBe("7:45pm");
    expect(cinematicMatchTime("12:00")).toBe("12:00pm");
    expect(cinematicMatchTime("00:15")).toBe("12:15am");
  });
  it("uses the venue timezone even when the viewer's UTC date has advanced", () => {
    const match = fixture({ date: "2027-03-13", time: "19:45" });
    const now = new Date("2027-03-14T02:00:00Z"); // 7pm in Pasadena, 10pm in New York.
    expect(nextHomeFixture([match], now, "America/Los_Angeles")).toBe(match);
    expect(nextHomeFixture([match], now, "America/New_York")).toBeNull();
    expect(nextHomeFixture([match], now, "UTC")).toBeNull();
  });
  it("changes UTC offset across the spring and autumn daylight-saving boundaries", () => {
    const spring = fixture({ date: "2027-03-14", time: "03:15" });
    expect(nextHomeFixture([spring], new Date("2027-03-14T10:00:00Z"), "America/Los_Angeles")).toBe(spring);
    expect(nextHomeFixture([spring], new Date("2027-03-14T10:30:00Z"), "America/Los_Angeles")).toBeNull();
    const autumn = fixture({ date: "2027-11-07", time: "02:15" });
    expect(nextHomeFixture([autumn], new Date("2027-11-07T10:00:00Z"), "America/Los_Angeles")).toBe(autumn);
    expect(nextHomeFixture([autumn], new Date("2027-11-07T10:30:00Z"), "America/Los_Angeles")).toBeNull();
  });
  it("rejects nonexistent calendar dates and malformed kickoff times", () => {
    expect(nextHomeFixture([fixture({ date: "2027-02-30" }), fixture({ time: "25:10" })], new Date("2027-01-01T00:00:00Z"))).toBeNull();
  });

});
