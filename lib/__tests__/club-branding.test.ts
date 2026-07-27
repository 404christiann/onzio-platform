import { describe, expect, it } from "vitest";
import { clubLogoUrl, DEFAULT_CLUB_LOGO_PATH } from "@/lib/club-branding";
import {
  getRosterImageSrc,
  isRosterPlaceholderLogo,
  rosterImageForStorage,
} from "@/lib/roster-images";

describe("clubLogoUrl", () => {
  it("encodes the shipped logo path", () => {
    expect(clubLogoUrl()).toContain(
      DEFAULT_CLUB_LOGO_PATH.split(" ").join("%20"),
    );
  });

  it("preserves storage folders while encoding path segments", () => {
    expect(clubLogoUrl("club-branding/new crest.png")).toContain(
      "/logos_v2/club-branding/new%20crest.png",
    );
  });
});

describe("roster logo fallback", () => {
  const currentLogo = "https://example.com/logos/current-club-logo.png";

  it("uses the current club logo when a player has no photo", () => {
    expect(getRosterImageSrc("", currentLogo)).toBe(currentLogo);
    expect(isRosterPlaceholderLogo(null)).toBe(true);
  });

  it("stores missing or legacy placeholder photos as an empty value", () => {
    expect(rosterImageForStorage("club-branding/old-logo.png")).toBe("");
    expect(rosterImageForStorage("https://example.com/player.png")).toBe(
      "https://example.com/player.png",
    );
  });
});
