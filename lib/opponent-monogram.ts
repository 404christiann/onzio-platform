/**
 * Derives a short text monogram for an opponent (or club) without a crest
 * asset, e.g. "Capital City Athletic" -> "CCA". Shared by the editorial
 * "Next match" homepage section and the schedule match card so the
 * derivation lives in one place instead of being duplicated per component.
 *
 * This is intentionally separate from the classic template's
 * `components/OpponentCrest.tsx`, which derives a single-letter initial for
 * a different visual treatment — the two are not interchangeable.
 */
export function opponentMonogram(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}
