import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLUB_LOGO_COLOR_CARDS,
  normalizeClubLogoColorCards,
  normalizeClubLogoFeatures,
  normalizeAboutValues,
  normalizeStoryParagraphs,
} from "@/lib/about-content";

describe("normalizeClubLogoColorCards", () => {
  it("returns the six default color cards when the saved value is missing", () => {
    expect(normalizeClubLogoColorCards(null)).toEqual(DEFAULT_CLUB_LOGO_COLOR_CARDS);
  });

  it("keeps the six fixed slots and falls back per missing card", () => {
    const cards = normalizeClubLogoColorCards([
      { label: "Custom Red", image_url: "https://example.com/red.png" },
    ]);

    expect(cards).toHaveLength(6);
    expect(cards[0]).toEqual({ label: "Custom Red", image_url: "https://example.com/red.png" });
    expect(cards[1]).toEqual(DEFAULT_CLUB_LOGO_COLOR_CARDS[1]);
  });
});


describe("tenant-scoped empty About content", () => {
  it("keeps empty story, values, crest features, and color cards empty", () => {
    expect(normalizeStoryParagraphs([], [])).toEqual([]);
    expect(normalizeAboutValues([], [])).toEqual([]);
    expect(normalizeClubLogoFeatures([], [])).toEqual([]);
    expect(normalizeClubLogoColorCards([], [])).toEqual([]);
  });

  it("does not fill missing tenant feature fields with Rose City assets or copy", () => {
    expect(normalizeClubLogoFeatures([{ title: "Our badge" }], [])).toEqual([{
      title: "Our badge", icon_url: "", icon_size: 70, icon_scale: 1,
      patch_url: "", description: "",
    }]);
    expect(normalizeClubLogoColorCards([{ label: "Blue" }], [])).toEqual([{
      label: "Blue", image_url: "",
    }]);
    expect(normalizeClubLogoColorCards(Array.from({ length: 7 }, () => ({ label: "Blue" })), [])).toHaveLength(6);
  });
});
