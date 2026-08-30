import { describe, expect, it } from "vitest";
import type { DBHomepageSlideshowPhoto } from "@/lib/db-types";
import {
  canAddHomepageSlideshowPhoto,
  diffHomepageSlideshowPhotos,
  homepageStoragePathFromPublicUrl,
  MAX_HOMEPAGE_SLIDESHOW_PHOTOS,
  normalizeYouTubeEmbedUrl,
} from "@/lib/homepage-content";

describe("canAddHomepageSlideshowPhoto", () => {
  it("caps homepage slideshow photos at six", () => {
    expect(MAX_HOMEPAGE_SLIDESHOW_PHOTOS).toBe(6);
  });

  it.each([
    [0, true],
    [5, true],
    [6, false],
    [7, false],
  ])("returns %s at %i photos", (count, expected) => {
    expect(canAddHomepageSlideshowPhoto(count as number)).toBe(expected);
  });
});

describe("normalizeYouTubeEmbedUrl", () => {
  it("converts YouTube watch URLs into embed URLs", () => {
    expect(normalizeYouTubeEmbedUrl("https://www.youtube.com/watch?v=fJf_A4LdKDw")).toBe(
      "https://www.youtube.com/embed/fJf_A4LdKDw?rel=0&modestbranding=1&color=white",
    );
  });

  it("converts youtu.be URLs into embed URLs", () => {
    expect(normalizeYouTubeEmbedUrl("https://youtu.be/fJf_A4LdKDw")).toBe(
      "https://www.youtube.com/embed/fJf_A4LdKDw?rel=0&modestbranding=1&color=white",
    );
  });

  it("preserves existing embed URLs", () => {
    const url = "https://www.youtube.com/embed/fJf_A4LdKDw?rel=0";
    expect(normalizeYouTubeEmbedUrl(url)).toBe(url);
  });
});

describe("homepageStoragePathFromPublicUrl", () => {
  it("extracts the homepage bucket path from a public Supabase URL", () => {
    expect(
      homepageStoragePathFromPublicUrl(
        "https://example.supabase.co/storage/v1/object/public/homepage/slideshow/photo%201.png",
      ),
    ).toBe("slideshow/photo 1.png");
  });

  it("ignores local seeded images", () => {
    expect(homepageStoragePathFromPublicUrl("/images/home/homepageSlideShowPic1.jpeg")).toBeNull();
  });

  it("extracts a versioned Onzio homepage path", () => {
    expect(
      homepageStoragePathFromPublicUrl(
        "https://example.supabase.co/storage/v1/object/public/onzio-media/11111111-1111-4111-8111-111111111111/homepage/44444444-4444-4444-8444-444444444444.webp",
      ),
    ).toBe(
      "11111111-1111-4111-8111-111111111111/homepage/44444444-4444-4444-8444-444444444444.webp",
    );
  });
});

describe("diffHomepageSlideshowPhotos", () => {
  const original: DBHomepageSlideshowPhoto[] = [
    { id: "a", url: "a.jpg", alt: "A", sort_order: 0, created_at: "" },
    { id: "b", url: "b.jpg", alt: "B", sort_order: 1, created_at: "" },
  ];

  it("returns no writes when nothing changed", () => {
    expect(diffHomepageSlideshowPhotos(original, [
      { id: "a", url: "a.jpg", alt: "A" },
      { id: "b", url: "b.jpg", alt: "B" },
    ])).toEqual({ toDelete: [], toInsert: [], toUpdate: [] });
  });

  it("tracks deletes, inserts, reorder, and alt text updates", () => {
    expect(diffHomepageSlideshowPhotos(original, [
      { id: "b", url: "b.jpg", alt: "B updated" },
      { id: null, url: "c.jpg", alt: "C" },
    ])).toEqual({
      toDelete: [original[0]],
      toInsert: [{ url: "c.jpg", alt: "C", sort_order: 1 }],
      toUpdate: [{ id: "b", alt: "B updated", sort_order: 0 }],
    });
  });

  it("falls back to a tenant-neutral alt for blank alt text", () => {
    // Written straight into any club's homepage_slideshow_photos.alt column,
    // so the fallback must not carry Rose City (or any club's) branding.
    expect(diffHomepageSlideshowPhotos(original, [
      { id: "a", url: "a.jpg", alt: "   " },
      { id: null, url: "c.jpg", alt: "" },
    ])).toEqual({
      toDelete: [original[1]],
      toInsert: [{ url: "c.jpg", alt: "Homepage slide 2", sort_order: 1 }],
      toUpdate: [{ id: "a", alt: "Homepage slide 1", sort_order: 0 }],
    });
  });
});
