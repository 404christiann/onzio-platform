import { DEFAULT_ACADEMY_FOOTER_TAGLINE, validateFooterTagline } from "@/lib/club-branding";
import { validateChangedSocialLink, type BrandingDraft } from "../branding-draft";

/**
 * Rose City's footer tagline (RC-ADMIN-4c). The branding read turns a blank column into the academy wording so every
 * footer has a line. For Rose City that wording is not its own, so the editor shows it as "not set" instead of
 * pre-filling it as if Rose City had written it. A saved tagline (anything else) loads as it is.
 */
export function roseCityTaglineFromBranding(resolved: string): string {
  return resolved.trim() === DEFAULT_ACADEMY_FOOTER_TAGLINE.trim() ? "" : resolved;
}

/** Same 160-character cap as Diverse City. A tagline that was set cannot be cleared back to the academy wording. */
export function roseCityTaglineError(draft: string, saved: string): string | null {
  const tooLong = validateFooterTagline(draft);
  if (tooLong) return tooLong;
  if (!draft.trim() && saved.trim()) return "Add a short line for the footer, such as your city, or discard this change to keep the saved one.";
  return null;
}

/** Every field message the Branding editor can show, by field. Empty when the draft can be saved. */
export function roseCityBrandingErrors(draft: BrandingDraft, saved: BrandingDraft): { tagline?: string; links: Record<string, string> } {
  const links: Record<string, string> = {};
  for (const link of draft.links) {
    const message = validateChangedSocialLink(link.href, saved.links.find((item) => item.id === link.id)?.href ?? "");
    if (message) links[link.id] = message;
  }
  const tagline = roseCityTaglineError(draft.tagline, saved.tagline) ?? undefined;
  return { tagline, links };
}

export const roseCityBrandingInvalid = (errors: ReturnType<typeof roseCityBrandingErrors>) => Boolean(errors.tagline) || Object.keys(errors.links).length > 0;
