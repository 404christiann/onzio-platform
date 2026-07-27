import { describe, expect, it } from "vitest";
import {
  canAddKitPhoto,
  cleanKitBulletPoints,
  DEFAULT_KIT_BULLET_POINTS,
  DEFAULT_KIT_STORE_NOTE,
  diffShopKitPhotos,
  kitPhotoAlt,
  kitPhotoDisplayMode,
  MAX_KIT_PHOTOS,
  normalizeKitBulletPoints,
  normalizeKitStoreNote,
  titleLines,
} from "@/lib/shop-kit";

describe("titleLines", () => {
  it("splits a multiline title into display lines", () => {
    expect(titleLines("Thorn\nEdition\n2026")).toEqual(["Thorn", "Edition", "2026"]);
  });

  it("returns one line for a single-line title", () => {
    expect(titleLines("Thorn Edition")).toEqual(["Thorn Edition"]);
  });

  it("preserves empty middle lines", () => {
    expect(titleLines("Thorn\n\n2026")).toEqual(["Thorn", "", "2026"]);
  });
});

describe("kitPhotoAlt", () => {
  it("collapses title whitespace and numbers photos from one", () => {
    expect(kitPhotoAlt("Thorn\nEdition\n2026", 0, 2))
      .toBe("Thorn Edition 2026 kit photo 1 of 2");
  });

  it("labels the final photo correctly", () => {
    expect(kitPhotoAlt("Thorn Edition 2026", 5, 6))
      .toBe("Thorn Edition 2026 kit photo 6 of 6");
  });
});

describe("kitPhotoDisplayMode", () => {
  it.each([
    [0, "static"],
    [1, "static"],
    [2, "slideshow"],
    [6, "slideshow"],
  ])("returns the expected mode for %i photos", (count, expected) => {
    expect(kitPhotoDisplayMode(count)).toBe(expected);
  });
});

describe("kit photo limit", () => {
  it("allows up to six kit photos", () => {
    expect(MAX_KIT_PHOTOS).toBe(6);
    expect(canAddKitPhoto(5)).toBe(true);
    expect(canAddKitPhoto(6)).toBe(false);
    expect(canAddKitPhoto(7)).toBe(false);
  });
});

describe("editable shop details", () => {
  it("trims bullet points, removes empty rows, and caps the layout at eight", () => {
    expect(cleanKitBulletPoints([
      " First ",
      "",
      "Second",
      "Third",
      "Fourth",
      "Fifth",
      "Sixth",
      "Seventh",
      "Eighth",
      "Ninth",
    ])).toEqual([
      "First",
      "Second",
      "Third",
      "Fourth",
      "Fifth",
      "Sixth",
      "Seventh",
      "Eighth",
    ]);
  });

  it("uses current defaults when a legacy row has no bullet-point column", () => {
    expect(normalizeKitBulletPoints(undefined)).toEqual(
      DEFAULT_KIT_BULLET_POINTS,
    );
  });

  it("preserves an intentionally empty store note", () => {
    expect(normalizeKitStoreNote("")).toBe("");
  });

  it("uses the current store note when a legacy row has no store-note column", () => {
    expect(normalizeKitStoreNote(undefined)).toBe(DEFAULT_KIT_STORE_NOTE);
  });
});

describe("diffShopKitPhotos", () => {
  const original = [
    { id: "a", sort_order: 0 },
    { id: "b", sort_order: 1 },
  ];

  it("returns no writes when nothing changed", () => {
    expect(diffShopKitPhotos(original, [
      { id: "a", url: "a.jpg" },
      { id: "b", url: "b.jpg" },
    ])).toEqual({ toDelete: [], toInsert: [], toUpdate: [] });
  });

  it("inserts a new photo at its draft position", () => {
    expect(diffShopKitPhotos(original, [
      { id: "a", url: "a.jpg" },
      { id: "b", url: "b.jpg" },
      { id: null, url: "c.jpg" },
    ])).toEqual({
      toDelete: [],
      toInsert: [{ url: "c.jpg", sort_order: 2 }],
      toUpdate: [],
    });
  });

  it("deletes a removed photo and updates a shifted survivor", () => {
    expect(diffShopKitPhotos(original, [
      { id: "b", url: "b.jpg" },
    ])).toEqual({
      toDelete: ["a"],
      toInsert: [],
      toUpdate: [{ id: "b", sort_order: 0 }],
    });
  });

  it("updates both rows for a reorder swap", () => {
    expect(diffShopKitPhotos(original, [
      { id: "b", url: "b.jpg" },
      { id: "a", url: "a.jpg" },
    ])).toEqual({
      toDelete: [],
      toInsert: [],
      toUpdate: [
        { id: "b", sort_order: 0 },
        { id: "a", sort_order: 1 },
      ],
    });
  });

  it("handles deletion, insertion, and reorder in one diff", () => {
    const threeOriginal = [
      ...original,
      { id: "c", sort_order: 2 },
    ];
    expect(diffShopKitPhotos(threeOriginal, [
      { id: "c", url: "c.jpg" },
      { id: null, url: "d.jpg" },
      { id: "a", url: "a.jpg" },
    ])).toEqual({
      toDelete: ["b"],
      toInsert: [{ url: "d.jpg", sort_order: 1 }],
      toUpdate: [
        { id: "c", sort_order: 0 },
        { id: "a", sort_order: 2 },
      ],
    });
  });
});
