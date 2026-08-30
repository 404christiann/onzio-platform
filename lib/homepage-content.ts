import type {
  DBBehindTheRoseSection,
  DBHomepageHeroContent,
  DBHomepageSlideshowSettings,
  DBHomepageSlideshowPhoto,
  DBHomepageStorySection,
} from "@/lib/db-types";
import {
  HOMEPAGE_STORY_LIMITS,
  resolveHomepageStorySection,
} from "@/lib/homepage-story-content";
import { onzioMediaStoragePathFromPublicUrl } from "@/lib/media-url";

export const MAX_HOMEPAGE_SLIDESHOW_PHOTOS = 6;

export const DEFAULT_HOMEPAGE_HERO_CONTENT: DBHomepageHeroContent = {
  id: 1,
  eyebrow: "",
  headline_line_one: "Rose City FC",
  headline_line_two: "",
  intro: "",
  primary_cta_label: "Team Store",
  primary_cta_href: "/shop",
  secondary_cta_label: "Meet the Squad",
  secondary_cta_href: "/roster",
  updated_at: "",
};

/**
 * Tenant-neutral hero used wherever no club-specific hero row is available
 * yet: the pre-hydration initial state in components/Hero.tsx and the
 * tenant-scoped fallback in lib/queries.ts. Every field is blank so the hero
 * templates fall through to club.name and their generic CTA labels instead of
 * ever painting another club's branding (the Diverse City "Rose City FC"
 * first-paint flash; same class as DCFC-602).
 * DEFAULT_HOMEPAGE_HERO_CONTENT above stays reserved for the legacy unscoped
 * Rose City path only.
 */
export const EMPTY_HOMEPAGE_HERO_CONTENT: DBHomepageHeroContent = {
  id: 1,
  eyebrow: "",
  headline_line_one: "",
  headline_line_two: "",
  intro: "",
  primary_cta_label: "",
  primary_cta_href: "",
  secondary_cta_label: "",
  secondary_cta_href: "",
  updated_at: "",
};

export const DEFAULT_HOMEPAGE_SLIDESHOW_SETTINGS: DBHomepageSlideshowSettings = {
  id: 1,
  season_label: "2025 – 2026 Season",
  updated_at: "",
};

export const DEFAULT_HOMEPAGE_SLIDESHOW_PHOTOS: DBHomepageSlideshowPhoto[] = [
  {
    id: "default-home-slide-1",
    url: "/images/home/homepageSlideShowPic1.jpeg",
    alt: "Rose City FC Match Action",
    sort_order: 0,
    created_at: "",
  },
  {
    id: "default-home-slide-2",
    url: "/images/home/homepageSlideShowPic2.jpeg",
    alt: "Rose City FC Players",
    sort_order: 1,
    created_at: "",
  },
  {
    id: "default-home-slide-3",
    url: "/images/home/homepageSlideShowPic3.jpeg",
    alt: "Rose City FC Team",
    sort_order: 2,
    created_at: "",
  },
];

export const DEFAULT_BEHIND_THE_ROSE_SECTION: DBBehindTheRoseSection = {
  id: 1,
  visible: true,
  eyebrow: "Behind the Rose · Season 1 · Episode 1",
  title: "Behind the Rose",
  description:
    "Go behind the scenes with Pasadena's Rose City FC as they battle during the 2024 UPSL Final. A cinematic view brings you even closer to the City of Roses.",
  video_url: "https://www.youtube.com/embed/fJf_A4LdKDw?rel=0&modestbranding=1&color=white",
  video_title: "Rose City FC — Behind the Rose S1 E1",
  caption: "Rose City FC · 2024 UPSL Final",
  updated_at: "",
};

/**
 * The homepage story band as edited in /admin/homepage.
 *
 * Shows the resolved template default as a real, editable value rather than
 * a placeholder hint (Christian found the placeholder-only pattern confusing,
 * 2026-08-09). This is a display/editing convenience only: a club that clears
 * a field back to empty and saves still gets the "use the live template
 * default" blank state on the public page, since resolveHomepageStorySection
 * treats blank exactly as it always has.
 */
export type HomepageStoryDraft = {
  visible: boolean;
  heading: string;
  bodyPrimary: string;
  bodySecondary: string;
  ctaLabel: string;
};

export type HomepageStoryValidationErrors = Partial<
  Record<"heading" | "bodyPrimary" | "bodySecondary" | "ctaLabel", string>
>;

export function emptyHomepageStoryDraft(clubName: string): HomepageStoryDraft {
  const defaults = resolveHomepageStorySection(null, clubName);
  return {
    visible: true,
    heading: defaults.heading,
    bodyPrimary: defaults.bodyPrimary,
    bodySecondary: defaults.bodySecondary,
    ctaLabel: defaults.ctaLabel,
  };
}

export function homepageStoryToDraft(
  row: Partial<DBHomepageStorySection> | null | undefined,
  clubName: string,
): HomepageStoryDraft {
  const resolved = resolveHomepageStorySection(row, clubName);
  return {
    visible: row ? row.visible !== false : true,
    heading: resolved.heading,
    bodyPrimary: resolved.bodyPrimary,
    bodySecondary: resolved.bodySecondary,
    ctaLabel: resolved.ctaLabel,
  };
}

export function validateHomepageStoryDraft(
  draft: HomepageStoryDraft,
): HomepageStoryValidationErrors {
  const errors: HomepageStoryValidationErrors = {};
  for (const [field, value, maximum, label] of [
    ["heading", draft.heading, HOMEPAGE_STORY_LIMITS.heading, "Heading"],
    [
      "bodyPrimary",
      draft.bodyPrimary,
      HOMEPAGE_STORY_LIMITS.bodyPrimary,
      "First paragraph",
    ],
    [
      "bodySecondary",
      draft.bodySecondary,
      HOMEPAGE_STORY_LIMITS.bodySecondary,
      "Second paragraph",
    ],
    ["ctaLabel", draft.ctaLabel, HOMEPAGE_STORY_LIMITS.ctaLabel, "Button label"],
  ] as const) {
    if (value.length > maximum) {
      errors[field] = `${label} must be ${maximum} characters or fewer.`;
    }
  }
  return errors;
}

export function buildHomepageStoryMutationPayload(
  draft: HomepageStoryDraft,
): Record<string, unknown> {
  return {
    visible: draft.visible,
    heading: draft.heading.trim(),
    body_primary: draft.bodyPrimary.trim(),
    body_secondary: draft.bodySecondary.trim(),
    cta_label: draft.ctaLabel.trim(),
  };
}

export type DraftHomepagePhoto = {
  id: string | null;
  url: string;
  alt: string;
};

export type HomepagePhotoDiff = {
  toDelete: DBHomepageSlideshowPhoto[];
  toInsert: Array<{ url: string; alt: string; sort_order: number }>;
  toUpdate: Array<{ id: string; alt: string; sort_order: number }>;
};

export function canAddHomepageSlideshowPhoto(count: number): boolean {
  return count < MAX_HOMEPAGE_SLIDESHOW_PHOTOS;
}

export function normalizeYouTubeEmbedUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const videoId = parsed.pathname.split("/").filter(Boolean)[0];
      return videoId ? buildYouTubeEmbedUrl(videoId) : trimmed;
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      const videoId = parsed.searchParams.get("v");
      return videoId ? buildYouTubeEmbedUrl(videoId) : trimmed;
    }

    return trimmed;
  } catch {
    return trimmed;
  }
}

export function diffHomepageSlideshowPhotos(
  original: DBHomepageSlideshowPhoto[],
  draft: DraftHomepagePhoto[],
): HomepagePhotoDiff {
  const draftIds = new Set(
    draft
      .filter((photo) => photo.id !== null)
      .map((photo) => photo.id as string),
  );
  const originalById = new Map(original.map((photo) => [photo.id, photo]));

  const toDelete = original.filter((photo) => !draftIds.has(photo.id));
  const toInsert: HomepagePhotoDiff["toInsert"] = [];
  const toUpdate: HomepagePhotoDiff["toUpdate"] = [];

  draft.forEach((photo, index) => {
    const alt = photo.alt.trim() || `Homepage slide ${index + 1}`;

    if (photo.id === null) {
      toInsert.push({ url: photo.url, alt, sort_order: index });
      return;
    }

    const originalPhoto = originalById.get(photo.id);
    if (!originalPhoto) return;

    if (originalPhoto.sort_order !== index || originalPhoto.alt !== alt) {
      toUpdate.push({ id: photo.id, alt, sort_order: index });
    }
  });

  return { toDelete, toInsert, toUpdate };
}

export function homepageStoragePathFromPublicUrl(url: string): string | null {
  const onzioPath = onzioMediaStoragePathFromPublicUrl(url, "homepage");
  if (onzioPath) return onzioPath;
  try {
    const parsed = new URL(url);
    const marker = "/storage/v1/object/public/homepage/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex === -1) return null;
    const path = parsed.pathname.slice(markerIndex + marker.length);
    return decodeURIComponent(path);
  } catch {
    return null;
  }
}

function buildYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&color=white`;
}
