import { describe, expect, it } from "vitest";
import type { DBSiteSponsorLogo } from "@/lib/db-types";
import {
  canAddSponsorLogo,
  diffSponsorLogos,
  MAX_CAROUSEL_SPONSORS,
  MAX_FOOTER_SPONSORS,
  sponsorLimitForPlacement,
  sponsorStoragePathFromPublicUrl,
} from "@/lib/sponsor-content";

describe("sponsor placement limits", () => {
  it("caps carousel and footer placements differently", () => {
    expect(MAX_CAROUSEL_SPONSORS).toBe(10);
    expect(MAX_FOOTER_SPONSORS).toBe(6);
    expect(sponsorLimitForPlacement("carousel")).toBe(10);
    expect(sponsorLimitForPlacement("footer")).toBe(6);
  });

  it.each([
    ["carousel", 9, true],
    ["carousel", 10, false],
    ["footer", 5, true],
    ["footer", 6, false],
  ] as const)("returns %s at %i logos for %s", (placement, count, expected) => {
    expect(canAddSponsorLogo(placement, count)).toBe(expected);
  });
});

describe("sponsorStoragePathFromPublicUrl", () => {
  it("extracts only site-sponsor paths from the sponsors bucket", () => {
    expect(
      sponsorStoragePathFromPublicUrl(
        "https://example.supabase.co/storage/v1/object/public/sponsors/site-sponsors/carousel/logo%201.png",
      ),
    ).toBe("site-sponsors/carousel/logo 1.png");
  });

  it("does not return legacy sponsor root paths", () => {
    expect(
      sponsorStoragePathFromPublicUrl(
        "https://example.supabase.co/storage/v1/object/public/sponsors/legacy-logo.png",
      ),
    ).toBeNull();
  });

  it("extracts a versioned Onzio branding path", () => {
    expect(
      sponsorStoragePathFromPublicUrl(
        "https://example.supabase.co/storage/v1/object/public/onzio-media/11111111-1111-4111-8111-111111111111/branding/44444444-4444-4444-8444-444444444444.png",
      ),
    ).toBe(
      "11111111-1111-4111-8111-111111111111/branding/44444444-4444-4444-8444-444444444444.png",
    );
  });
});

describe("diffSponsorLogos", () => {
  const original: DBSiteSponsorLogo[] = [
    { id: "a", placement: "carousel", name: "A", logo_url: "a.png", sort_order: 0, created_at: "" },
    { id: "b", placement: "carousel", name: "B", logo_url: "b.png", sort_order: 1, created_at: "" },
  ];

  it("returns no writes when nothing changed", () => {
    expect(diffSponsorLogos("carousel", original, [
      { id: "a", name: "A", logo_url: "a.png" },
      { id: "b", name: "B", logo_url: "b.png" },
    ])).toEqual({ toDelete: [], toInsert: [], toUpdate: [] });
  });

  it("tracks deletes, inserts, reorder, and name updates", () => {
    expect(diffSponsorLogos("carousel", original, [
      { id: "b", name: "B updated", logo_url: "b.png" },
      { id: null, name: "C", logo_url: "c.png" },
    ])).toEqual({
      toDelete: [original[0]],
      toInsert: [{ placement: "carousel", name: "C", logo_url: "c.png", sort_order: 1 }],
      toUpdate: [{ id: "b", name: "B updated", logo_url: "b.png", sort_order: 0 }],
    });
  });

  it("tracks persisted logo URL replacements", () => {
    expect(diffSponsorLogos("carousel", [original[0]], [
      { id: "a", name: "A", logo_url: "replacement.png" },
    ])).toEqual({
      toDelete: [],
      toInsert: [],
      toUpdate: [{ id: "a", name: "A", logo_url: "replacement.png", sort_order: 0 }],
    });
  });
});
