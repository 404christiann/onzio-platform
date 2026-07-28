import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("site-wide media resilience", () => {
  it("gives the reported public regressions context-specific fallbacks", () => {
    expect(source("components/ChampionsBadge.tsx")).toContain(
      'fallbackVariant="trophy"',
    );
    expect(source("components/AboutClubPageClient.tsx")).toContain(
      'fallbackVariant="photo"',
    );
    expect(source("components/ShopPhotoStrip.tsx")).toContain(
      'fallbackVariant="shop"',
    );
  });

  it("exposes normal-health and fallback browser hooks", () => {
    const resilientImage = source("components/ResilientImage.tsx");
    const fallback = source("components/ImageFallback.tsx");
    expect(resilientImage).toContain('data-critical-image={alt ? "true"');
    expect(resilientImage).toContain('data-image-delivery-attempt={attempt}');
    expect(fallback).toContain('data-image-fallback="true"');
    expect(fallback).toContain("data-image-fallback-variant");
  });

  it("preserves person initials and layout-preserving gallery fallbacks", () => {
    for (const path of [
      "components/PlayerCard.tsx",
      "components/StaffCard.tsx",
      "components/PlayerModal.tsx",
      "components/StaffModal.tsx",
    ]) {
      expect(source(path)).toContain('data-image-fallback="true"');
      expect(source(path)).toContain('data-image-fallback-variant="person"');
    }
    expect(source("components/PhotoSlideshow.tsx")).toContain(
      'label="Club slideshow unavailable"',
    );
    expect(source("components/KitImageGrid.tsx")).toContain(
      'label="Shop photography unavailable"',
    );
  });
});
