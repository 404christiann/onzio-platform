import { describe, expect, it } from "vitest";
import {
  canAddPhotoStripPhoto,
  diffPhotoStripPhotos,
  MAX_PHOTO_STRIP_PHOTOS,
  photoStripDisplayMode,
  photoStripPhotoAlt,
} from "@/lib/shop-photo-strip";

describe("photoStripPhotoAlt", () => {
  it("numbers photos from one", () => {
    expect(photoStripPhotoAlt(0, 3)).toBe("Rose City FC gear photo 1 of 3");
  });

  it("labels the final photo correctly", () => {
    expect(photoStripPhotoAlt(5, 6)).toBe("Rose City FC gear photo 6 of 6");
  });

  it("labels a single photo", () => {
    expect(photoStripPhotoAlt(0, 1)).toBe("Rose City FC gear photo 1 of 1");
  });
});

describe("photoStripDisplayMode", () => {
  it.each([
    [0, "hidden"],
    [1, "shown"],
    [2, "shown"],
    [6, "shown"],
  ])("returns %s for %i photos", (count, expected) => {
    expect(photoStripDisplayMode(count as number)).toBe(expected);
  });

  it("treats negative counts as hidden", () => {
    expect(photoStripDisplayMode(-1)).toBe("hidden");
  });
});

describe("canAddPhotoStripPhoto", () => {
  it("caps the photo strip at six photos", () => {
    expect(MAX_PHOTO_STRIP_PHOTOS).toBe(6);
  });

  it.each([
    [0, true],
    [4, true],
    [5, true],
    [6, false],
    [7, false],
  ])("returns %s at %i photos", (count, expected) => {
    expect(canAddPhotoStripPhoto(count as number)).toBe(expected);
  });
});

describe("diffPhotoStripPhotos", () => {
  const original = [
    { id: "a", sort_order: 0 },
    { id: "b", sort_order: 1 },
  ];

  it("returns no writes when nothing changed", () => {
    expect(diffPhotoStripPhotos(original, [
      { id: "a", url: "a.jpg" },
      { id: "b", url: "b.jpg" },
    ])).toEqual({ toDelete: [], toInsert: [], toUpdate: [] });
  });

  it("inserts a new photo at its draft position", () => {
    expect(diffPhotoStripPhotos(original, [
      { id: "a", url: "a.jpg" },
      { id: "b", url: "b.jpg" },
      { id: null, url: "c.jpg" },
    ])).toEqual({
      toDelete: [],
      toInsert: [{ url: "c.jpg", sort_order: 2 }],
      toUpdate: [],
    });
  });

  it("deletes every row when the photo strip is emptied", () => {
    expect(diffPhotoStripPhotos(original, [])).toEqual({
      toDelete: ["a", "b"],
      toInsert: [],
      toUpdate: [],
    });
  });

  it("handles deletion, insertion, and reorder in one diff", () => {
    const threeOriginal = [
      ...original,
      { id: "c", sort_order: 2 },
    ];
    expect(diffPhotoStripPhotos(threeOriginal, [
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
