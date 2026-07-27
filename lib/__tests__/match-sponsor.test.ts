import { describe, expect, it } from "vitest";
import {
  carrySponsorFromLatestMatch,
  EMPTY_MATCH_SPONSOR,
} from "@/lib/match-sponsor";

const matches = [
  {
    date: "2027-01-10",
    time: "19:00",
    season_id: "season-a",
    sponsor_name: "First Sponsor",
    sponsor_logo_url: "first.png",
    sponsor_link: "https://first.example",
  },
  {
    date: "2027-02-10",
    time: "19:00",
    season_id: "season-a",
    sponsor_name: "Latest Sponsor",
    sponsor_logo_url: "latest.png",
    sponsor_link: "https://latest.example",
  },
  {
    date: "2028-01-10",
    time: "19:00",
    season_id: "season-b",
    sponsor_name: "Other Season",
    sponsor_logo_url: "other.png",
    sponsor_link: null,
  },
];

describe("carrySponsorFromLatestMatch", () => {
  it("copies only sponsor fields from the latest match in the selected season", () => {
    expect(carrySponsorFromLatestMatch(matches, "season-a")).toEqual({
      sponsor_name: "Latest Sponsor",
      sponsor_logo_url: "latest.png",
      sponsor_link: "https://latest.example",
    });
  });

  it("returns empty sponsor fields when the season has no previous match", () => {
    expect(carrySponsorFromLatestMatch(matches, "missing")).toEqual(
      EMPTY_MATCH_SPONSOR,
    );
  });

  it("preserves an intentionally empty sponsor from the latest match", () => {
    const withEmptyLatest = [
      ...matches,
      {
        date: "2027-03-10",
        time: "19:00",
        season_id: "season-a",
        sponsor_name: null,
        sponsor_logo_url: null,
        sponsor_link: null,
      },
    ];

    expect(carrySponsorFromLatestMatch(withEmptyLatest, "season-a")).toEqual(
      EMPTY_MATCH_SPONSOR,
    );
  });
});
