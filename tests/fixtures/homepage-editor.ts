// Test data and interface contracts only. No editor implementation lives here.
export type HomepageSection = "hero" | "photos" | "story" | "video";

export type HomepagePhotoFixture = {
  clientId: string;
  rowId: string | null;
  assetId: string | null;
  url: string | null;
  alt: string;
  order: number;
  upload: "queued" | "uploading" | "ready" | "failed";
  localFileKey?: string;
  error?: { code: string; message: string };
};

export function homepageDraft() {
  return {
    hero: {
      eyebrow: "Community football",
      headline_line_one: "Alpha FC",
      headline_line_two: "Everyone belongs",
      intro: "A club for our community.",
      primary_cta_label: "See the schedule",
      primary_cta_href: "/schedule",
      secondary_cta_label: "Meet the team",
      secondary_cta_href: "/roster",
    },
    photos: {
      seasonLabel: "2026 season",
      items: [photoFixture(1), photoFixture(2)],
    },
    story: {
      visible: true,
      heading: "Our community",
      bodyPrimary: "We play together.",
      bodySecondary: "We grow together.",
      ctaLabel: "Our story",
    },
    video: {
      visible: false,
      eyebrow: "Inside the club",
      title: "A season together",
      description: "Meet our players.",
      video_title: "Alpha FC season film",
      caption: "Our season",
    },
  };
}

export type HomepageDraftFixture = ReturnType<typeof homepageDraft>;

export function photoFixture(position: number): HomepagePhotoFixture {
  const suffix = String(position).padStart(12, "0");
  return {
    clientId: `photo-${position}`,
    rowId: `11111111-1111-4111-8111-${suffix}`,
    assetId: `22222222-2222-4222-8222-${suffix}`,
    url: `/images/test-photo-${position}.webp`,
    alt: `Players training in photo ${position}`,
    order: position - 1,
    upload: "ready",
  };
}

export const SAVE_OPERATION = "33333333-3333-4333-8333-333333333333";

export type EditorStateFixture = {
  baseline: HomepageDraftFixture;
  draft: HomepageDraftFixture;
  baseRevision: string;
  designRevision: string;
  selection: string | null;
  disclosure: null | { piece: string; mode: "primary" | "more" };
  save: "idle" | "saving" | "saved" | "failed" | "conflict";
  submitted: null | { operationId: string; snapshot: HomepageDraftFixture };
  pendingDestination: string | null;
};

export type EditorActionFixture =
  | { type: "piece-selected"; piece: string }
  | { type: "disclosure-closed" }
  | { type: "done" }
  | { type: "field-changed"; field: string; value: string | boolean }
  | { type: "photos-changed"; photos: HomepagePhotoFixture[] }
  | { type: "save-started"; operationId: string }
  | { type: "save-failed"; code: string; message: string }
  | {
      type: "save-succeeded";
      operationId: string;
      content: HomepageDraftFixture;
      revision: string;
    };

export function saveRequest() {
  const draft = homepageDraft();
  return {
    operationId: SAVE_OPERATION,
    expectedRevision: "revision-1",
    designRevision: "design-1",
    sections: {
      hero: draft.hero,
      photos: {
        seasonLabel: draft.photos.seasonLabel,
        items: draft.photos.items.map(({ clientId, rowId, assetId, alt, order }) => ({
          clientId, rowId, assetId, alt, order,
        })),
      },
      story: draft.story,
      video: draft.video,
    },
  };
}

export const RECOVERY_SCOPE = {
  origin: "http://alpha.localhost:3110",
  userId: "44444444-4444-4444-8444-444444444444",
  clubId: "55555555-5555-4555-8555-555555555555",
};

export function recoveryRecord() {
  return {
    schemaVersion: 1,
    scope: { ...RECOVERY_SCOPE },
    savedAt: "2026-09-15T12:00:00Z",
    baseRevision: "revision-1",
    designRevision: "design-1",
    baseline: homepageDraft(),
    draft: {
      ...homepageDraft(),
      hero: { ...homepageDraft().hero, intro: "Unsaved community story." },
    },
    submitted: null as EditorStateFixture["submitted"],
  };
}
