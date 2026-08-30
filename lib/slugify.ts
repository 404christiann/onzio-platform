/**
 * Slug derivation for admin-created content.
 *
 * `onzio.programs` constrains `slug` to `^[a-z][a-z0-9-]*$` with
 * `char_length(slug) between 1 and 64`, unique per club. Club owners should
 * never have to satisfy that by hand, so /admin/programs derives the slug from
 * the navigation label at creation time.
 *
 * Two rules this file exists to protect:
 *
 * 1. A slug is derived **once, at creation**. Renaming a program later must
 *    never regenerate it — the slug is the program's public URL, and Diverse
 *    City's live slugs (`youth-academy`, `special-kickers-program`,
 *    `special-olympics-soccer`, `upsl-mens-teams`) do not all match a naive
 *    derivation of their current nav labels. Regenerating would break links.
 * 2. An apostrophe is removed rather than replaced, so `Men's Teams` becomes
 *    `mens-teams` and not `men-s-teams`.
 */

export const MAX_SLUG_LENGTH = 64;

/** Used when a label slugifies to nothing at all (e.g. "!!!" or "123"). */
const EMPTY_FALLBACK = "program";

/** Prefix applied when a derived slug would not start with a letter. */
const LEADING_LETTER_PREFIX = "program-";

/**
 * Characters Unicode canonical decomposition (NFD) cannot split into a base
 * letter plus a combining mark. Everything with a real decomposition — é, ü,
 * ñ, å, ç — is handled by the NFD pass instead of being listed here.
 */
const TRANSLITERATIONS: Readonly<Record<string, string>> = {
  æ: "ae",
  Æ: "ae",
  œ: "oe",
  Œ: "oe",
  ø: "o",
  Ø: "o",
  ß: "ss",
  ẞ: "ss",
  đ: "d",
  Đ: "d",
  ð: "d",
  Ð: "d",
  ł: "l",
  Ł: "l",
  þ: "th",
  Þ: "th",
  ı: "i",
  ŋ: "n",
  Ŋ: "n",
};

/** Straight and typographic apostrophes, stripped without leaving a hyphen. */
const APOSTROPHES = /['‘’ʼʹ`´]/g;

/** Combining diacritical marks left behind by NFD normalization. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Truncates to `maximum` characters on a hyphen boundary when one exists, so a
 * slug does not end mid-word. A single word longer than the limit is hard cut,
 * because there is no boundary to fall back to.
 */
export function truncateSlug(slug: string, maximum = MAX_SLUG_LENGTH): string {
  if (maximum <= 0) return "";
  if (slug.length <= maximum) return slug;

  const hardCut = slug.slice(0, maximum);
  const lastHyphen = hardCut.lastIndexOf("-");
  const wordCut = lastHyphen > 0 ? hardCut.slice(0, lastHyphen) : "";
  return stripEdgeHyphens(wordCut || hardCut);
}

function stripEdgeHyphens(value: string): string {
  return value.replace(/^-+/, "").replace(/-+$/, "");
}

/**
 * Derives a URL slug from arbitrary human text. Always returns a value that
 * satisfies the `programs` slug constraints; it never returns an empty string.
 */
export function slugify(value: string, maximum = MAX_SLUG_LENGTH): string {
  const withoutApostrophes = value.normalize("NFD").replace(APOSTROPHES, "");
  const transliterated = Array.from(withoutApostrophes)
    .map((character) => TRANSLITERATIONS[character] ?? character)
    .join("");
  const base = stripEdgeHyphens(
    transliterated
      .replace(COMBINING_MARKS, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-{2,}/g, "-"),
  );

  if (!base) return EMPTY_FALLBACK;

  const withLeadingLetter = /^[a-z]/.test(base)
    ? base
    : `${LEADING_LETTER_PREFIX}${base}`;
  const truncated = truncateSlug(withLeadingLetter, maximum);

  // Truncation can only remove trailing characters, so the leading letter is
  // preserved — but an all-hyphen remainder would not be, hence the guard.
  return truncated || EMPTY_FALLBACK;
}

/**
 * Returns `base` when it is free, otherwise appends `-2`, `-3`, … until it is
 * unique among `taken`, keeping the result within `maximum` characters.
 */
export function uniqueSlug(
  base: string,
  taken: Iterable<string>,
  maximum = MAX_SLUG_LENGTH,
): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;

  for (let attempt = 2; ; attempt += 1) {
    const suffix = `-${attempt}`;
    const stem = truncateSlug(base, Math.max(1, maximum - suffix.length));
    const candidate = `${stem}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * The one function /admin/programs calls: nav label in, a unique, constraint-
 * satisfying slug out. Existing slugs are passed so a second "Youth Academy"
 * becomes `youth-academy-2` rather than failing the club-scoped unique index.
 */
export function deriveProgramSlug(
  navLabel: string,
  existingSlugs: Iterable<string> = [],
): string {
  return uniqueSlug(slugify(navLabel), existingSlugs);
}
