/** Splits raw admin title text into display lines. */
export function titleLines(title: string): string[] {
  return title.split("\n");
}

export const MAX_KIT_BULLET_POINTS = 8;
export const MAX_KIT_PHOTOS = 6;

export const DEFAULT_KIT_BULLET_POINTS = [
  "Authentic match jersey",
  "Any name & number",
  "League patch",
  "Team sponsor badges",
  "Raffle ticket included",
  "Custom name + $10",
];

export const DEFAULT_KIT_STORE_NOTE =
  "Sold exclusively at Niky's Sports\n33 E Colorado Blvd, Pasadena, CA";

/** Trims, removes empty entries, and caps the list to the public layout limit. */
export function cleanKitBulletPoints(points: readonly string[]): string[] {
  return points
    .map((point) => point.trim())
    .filter(Boolean)
    .slice(0, MAX_KIT_BULLET_POINTS);
}

/** Keeps public rendering compatible until the additive DB migration is run. */
export function normalizeKitBulletPoints(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_KIT_BULLET_POINTS];
  const cleaned = cleanKitBulletPoints(
    value.filter((point): point is string => typeof point === "string"),
  );
  return cleaned.length > 0 ? cleaned : [...DEFAULT_KIT_BULLET_POINTS];
}

/** Keeps the current store note when the new column is not present yet. */
export function normalizeKitStoreNote(value: unknown): string {
  return typeof value === "string" ? value : DEFAULT_KIT_STORE_NOTE;
}

/** Builds descriptive alt text from the editable title and photo position. */
export function kitPhotoAlt(title: string, index: number, total: number): string {
  const plainTitle = title.replace(/\s+/g, " ").trim();
  return `${plainTitle} kit photo ${index + 1} of ${total}`;
}

/** Gates the admin upload control at the kit-photo maximum. */
export function canAddKitPhoto(count: number): boolean {
  return count < MAX_KIT_PHOTOS;
}

/** Keeps one kit photo static and turns multiple photos into autoplay. */
export function kitPhotoDisplayMode(count: number): "static" | "slideshow" {
  return count > 1 ? "slideshow" : "static";
}

export function shopKitSectionId(
  surface: "home" | "shop",
  variant: "home" | "away",
): number {
  if (surface === "home") return variant === "home" ? 1 : 3;
  return variant === "home" ? 2 : 4;
}

export type DraftKitPhoto = {
  id: string | null;
  url: string;
};

/** Computes the row writes needed to make persisted photos match draft order. */
export function diffShopKitPhotos(
  original: { id: string; sort_order: number }[],
  draft: DraftKitPhoto[],
): {
  toDelete: string[];
  toInsert: { url: string; sort_order: number }[];
  toUpdate: { id: string; sort_order: number }[];
} {
  const draftIds = new Set(
    draft
      .filter((photo) => photo.id !== null)
      .map((photo) => photo.id as string),
  );
  const originalById = new Map(original.map((photo) => [photo.id, photo]));

  const toDelete = original
    .filter((photo) => !draftIds.has(photo.id))
    .map((photo) => photo.id);
  const toInsert: { url: string; sort_order: number }[] = [];
  const toUpdate: { id: string; sort_order: number }[] = [];

  draft.forEach((photo, index) => {
    if (photo.id === null) {
      toInsert.push({ url: photo.url, sort_order: index });
      return;
    }
    if (originalById.get(photo.id)?.sort_order !== index) {
      toUpdate.push({ id: photo.id, sort_order: index });
    }
  });

  return { toDelete, toInsert, toUpdate };
}
