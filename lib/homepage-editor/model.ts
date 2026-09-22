export type HomepageSection = "hero" | "photos" | "story" | "video";

export type HeroFields = {
  eyebrow: string;
  headline_line_one: string;
  headline_line_two: string;
  intro: string;
  primary_cta_label: string;
  primary_cta_href: string;
  secondary_cta_label: string;
  secondary_cta_href: string;
};

export type HomepagePhoto = {
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

export type HomepageStoryFields = {
  visible: boolean;
  heading: string;
  bodyPrimary: string;
  bodySecondary: string;
  ctaLabel: string;
};

export type HomepageVideoFields = {
  visible: boolean;
  eyebrow: string;
  title: string;
  description: string;
  video_title: string;
  caption: string;
};

export type HomepageDraft = {
  hero: HeroFields;
  photos: { seasonLabel: string; items: HomepagePhoto[] };
  story: HomepageStoryFields;
  video: HomepageVideoFields;
};

export type PieceId =
  | "hero.eyebrow"
  | "hero.heading"
  | "hero.intro"
  | "hero.cta"
  | "photos"
  | "story.text"
  | "story.cta"
  | "story"
  | "video"
  | "shared.story"
  | "shared.shop"
  | "shared.programs";

export type Disclosure = { piece: PieceId; mode: "primary" | "more" };
export type SaveState = "idle" | "saving" | "saved" | "failed" | "conflict";

export type HomepageEditorState = {
  baseline: HomepageDraft;
  draft: HomepageDraft;
  baseRevision: string;
  designRevision: string;
  editableSections: HomepageSection[];
  allowedPieces: PieceId[];
  editableFields: string[];
  selection: PieceId | null;
  disclosure: Disclosure | null;
  save: SaveState;
  submitted: { operationId: string; snapshot: HomepageDraft } | null;
  saveError: { code: string; message: string } | null;
};

export type HomepageEditorAction =
  | { type: "piece-selected"; piece: string }
  | { type: "disclosure-opened"; mode: "primary" | "more" }
  | { type: "disclosure-closed" }
  | { type: "done" }
  | { type: "field-changed"; field: string; value: string | boolean }
  | { type: "photos-changed"; photos: HomepagePhoto[] }
  | { type: "save-started"; operationId: string }
  | { type: "save-failed"; code: string; message: string }
  | { type: "save-reconciled-not-committed" }
  | {
      type: "save-succeeded";
      operationId: string;
      content: HomepageDraft;
      revision: string;
    };

const HERO_FIELDS: readonly (keyof HeroFields)[] = [
  "eyebrow",
  "headline_line_one",
  "headline_line_two",
  "intro",
  "primary_cta_label",
  "primary_cta_href",
  "secondary_cta_label",
  "secondary_cta_href",
];

const STORY_FIELDS: readonly (keyof HomepageStoryFields)[] = [
  "visible",
  "heading",
  "bodyPrimary",
  "bodySecondary",
  "ctaLabel",
];

const VIDEO_FIELDS: readonly (keyof HomepageVideoFields)[] = [
  "visible",
  "eyebrow",
  "title",
  "description",
  "video_title",
  "caption",
];

const PIECES: readonly PieceId[] = [
  "hero.eyebrow",
  "hero.heading",
  "hero.intro",
  "hero.cta",
  "photos",
  "story.text",
  "story.cta",
  "story",
  "video",
  "shared.story",
  "shared.shop",
  "shared.programs",
];

const DEFAULT_EDITABLE_FIELDS: readonly string[] = [
  ...HERO_FIELDS.map((field) => `hero.${field}`),
  "photos.seasonLabel",
  "photos.alt",
  ...STORY_FIELDS.map((field) => `story.${field}`),
  ...VIDEO_FIELDS.map((field) => `video.${field}`),
];

function cloneDraft(draft: HomepageDraft): HomepageDraft {
  return {
    hero: { ...draft.hero },
    photos: {
      seasonLabel: draft.photos.seasonLabel,
      items: draft.photos.items.map((photo) => ({
        ...photo,
        ...(photo.error ? { error: { ...photo.error } } : {}),
      })),
    },
    story: { ...draft.story },
    video: { ...draft.video },
  };
}

function cloneState(state: HomepageEditorState): HomepageEditorState {
  return {
    ...state,
    baseline: cloneDraft(state.baseline),
    draft: cloneDraft(state.draft),
    editableSections: [...state.editableSections],
    allowedPieces: [...state.allowedPieces],
    editableFields: [...state.editableFields],
    submitted: state.submitted
      ? { operationId: state.submitted.operationId, snapshot: cloneDraft(state.submitted.snapshot) }
      : null,
    saveError: state.saveError ? { ...state.saveError } : null,
  };
}

function isSection(value: string): value is HomepageSection {
  return value === "hero" || value === "photos" || value === "story" || value === "video";
}

function isPiece(value: string): value is PieceId {
  return (PIECES as readonly string[]).includes(value);
}

function sectionForPiece(piece: PieceId): HomepageSection {
  if (piece === "photos") return "photos";
  if (piece === "story" || piece === "story.text" || piece === "story.cta" || piece === "shared.story") return "story";
  if (piece === "video") return "video";
  return "hero";
}

function semanticPhoto(photo: HomepagePhoto) {
  return { rowId: photo.rowId, assetId: photo.assetId, alt: photo.alt, order: photo.order };
}

function samePhotos(left: HomepageDraft["photos"], right: HomepageDraft["photos"]): boolean {
  if (left.seasonLabel !== right.seasonLabel || left.items.length !== right.items.length) return false;
  return left.items.every((photo, index) => {
    const other = right.items[index];
    const current = semanticPhoto(photo);
    const expected = semanticPhoto(other);
    return current.rowId === expected.rowId &&
      current.assetId === expected.assetId &&
      current.alt === expected.alt &&
      current.order === expected.order;
  });
}

function sameSection(section: HomepageSection, left: HomepageDraft, right: HomepageDraft): boolean {
  if (section === "photos") return samePhotos(left.photos, right.photos);
  if (section === "hero") {
    return HERO_FIELDS.every((field) => left.hero[field] === right.hero[field]);
  }
  if (section === "story") {
    return STORY_FIELDS.every((field) => left.story[field] === right.story[field]);
  }
  return VIDEO_FIELDS.every((field) => left.video[field] === right.video[field]);
}

export function createHomepageEditorState(input: {
  content: HomepageDraft;
  revision: string;
  designRevision: string;
  editableSections: HomepageSection[];
  allowedPieces?: string[];
  editableFields?: string[];
}): HomepageEditorState {
  return {
    baseline: cloneDraft(input.content),
    draft: cloneDraft(input.content),
    baseRevision: input.revision,
    designRevision: input.designRevision,
    editableSections: input.editableSections.filter(isSection),
    allowedPieces: input.allowedPieces?.filter(isPiece) ??
      PIECES.filter((piece) => input.editableSections.includes(sectionForPiece(piece))),
    editableFields: input.editableFields ? [...input.editableFields] : [...DEFAULT_EDITABLE_FIELDS],
    selection: null,
    disclosure: null,
    save: "idle",
    submitted: null,
    saveError: null,
  };
}

export function getDirtyHomepageSections(state: HomepageEditorState): HomepageSection[] {
  return state.editableSections.filter(
    (section) => !sameSection(section, state.baseline, state.draft),
  );
}

export function getHomepageSaveBlocker(state: HomepageEditorState): string | null {
  if (state.save === "saving") return "SAVING";
  const dirty = getDirtyHomepageSections(state);
  if (dirty.length === 0) return "NO_CHANGES";
  if (state.editableSections.includes("photos") && state.draft.photos.items.length > 6) {
    return "TOO_MANY_PHOTOS";
  }
  if (
    state.editableSections.includes("photos") &&
    state.draft.photos.items.some((photo) => photo.upload !== "ready")
  ) {
    return "PHOTOS_NOT_READY";
  }
  return null;
}

function changeField(state: HomepageEditorState, field: string, value: string | boolean) {
  const parts = field.split(".");
  if (parts.length !== 2) return state;
  const [sectionName, fieldName] = parts;
  if (!isSection(sectionName) || !state.editableSections.includes(sectionName)) return state;
  if (!state.editableFields.includes(field)) return state;

  const next = cloneState(state);
  if (sectionName === "hero" && (HERO_FIELDS as readonly string[]).includes(fieldName)) {
    if (typeof value !== "string") return state;
    next.draft.hero[fieldName as keyof HeroFields] = value as never;
  } else if (sectionName === "photos" && fieldName === "seasonLabel") {
    if (typeof value !== "string") return state;
    next.draft.photos.seasonLabel = value;
  } else if (sectionName === "story" && (STORY_FIELDS as readonly string[]).includes(fieldName)) {
    if (fieldName === "visible" && typeof value !== "boolean") return state;
    if (fieldName !== "visible" && typeof value !== "string") return state;
    next.draft.story[fieldName as keyof HomepageStoryFields] = value as never;
  } else if (sectionName === "video" && (VIDEO_FIELDS as readonly string[]).includes(fieldName)) {
    if (fieldName === "visible" && typeof value !== "boolean") return state;
    if (fieldName !== "visible" && typeof value !== "string") return state;
    next.draft.video[fieldName as keyof HomepageVideoFields] = value as never;
  } else {
    return state;
  }
  if (JSON.stringify(next.draft) !== JSON.stringify(state.draft)) {
    next.save = "idle";
    next.saveError = null;
  }
  return next;
}

export function reduceHomepageEditor(
  state: HomepageEditorState,
  action: HomepageEditorAction,
): HomepageEditorState {
  if (action.type === "piece-selected") {
    if (!isPiece(action.piece) || !state.allowedPieces.includes(action.piece)) return state;
    const section = sectionForPiece(action.piece);
    if (!action.piece.startsWith("shared.") && !state.editableSections.includes(section)) return state;
    const next = cloneState(state);
    next.selection = action.piece;
    next.disclosure = state.selection === action.piece
      ? { piece: action.piece, mode: "primary" }
      : null;
    return next;
  }

  if (action.type === "disclosure-opened") {
    if (!state.selection) return state;
    const next = cloneState(state);
    next.disclosure = { piece: state.selection, mode: action.mode };
    return next;
  }

  if (action.type === "disclosure-closed") {
    const next = cloneState(state);
    next.disclosure = null;
    return next;
  }

  if (action.type === "done") {
    const next = cloneState(state);
    next.selection = null;
    next.disclosure = null;
    return next;
  }

  if (state.submitted && (action.type === "field-changed" || action.type === "photos-changed")) {
    return state;
  }

  if (action.type === "field-changed") return changeField(state, action.field, action.value);

  if (action.type === "photos-changed") {
    if (!state.editableSections.includes("photos")) return state;
    const next = cloneState(state);
    next.draft.photos.items = action.photos.map((photo) => ({
      ...photo,
      ...(photo.error ? { error: { ...photo.error } } : {}),
    }));
    if (!samePhotos(state.draft.photos, next.draft.photos)) {
      next.save = "idle";
      next.saveError = null;
    }
    return next;
  }

  if (action.type === "save-started") {
    if (state.save === "saving") return state;
    if (state.submitted) {
      if (state.save !== "failed") return state;
      const retry = cloneState(state);
      retry.save = "saving";
      retry.saveError = null;
      return retry;
    }
    if (getHomepageSaveBlocker(state)) return state;
    const next = cloneState(state);
    next.save = "saving";
    next.saveError = null;
    next.submitted = { operationId: action.operationId, snapshot: cloneDraft(state.draft) };
    return next;
  }

  if (action.type === "save-failed") {
    if (!state.submitted) return state;
    const next = cloneState(state);
    next.save = "failed";
    next.saveError = { code: action.code, message: action.message };
    return next;
  }

  if (action.type === "save-reconciled-not-committed") {
    if (!state.submitted) return state;
    const next = cloneState(state);
    next.submitted = null;
    next.save = "idle";
    next.saveError = null;
    return next;
  }

  if (action.type === "save-succeeded") {
    if (!state.submitted || state.submitted.operationId !== action.operationId) return state;
    const next = cloneState(state);
    next.baseline = cloneDraft(action.content);
    next.draft = cloneDraft(action.content);
    next.baseRevision = action.revision;
    next.save = "saved";
    next.saveError = null;
    next.submitted = null;
    return next;
  }

  return state;
}
