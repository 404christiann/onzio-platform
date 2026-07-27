import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLUB_LOGO_COLOR_CARDS,
  normalizeClubLogoColorCards,
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
