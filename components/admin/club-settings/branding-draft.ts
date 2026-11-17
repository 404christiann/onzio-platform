import type { DBSiteSocialLink, SiteSocialPlatform } from "@/lib/db-types";
import { DEFAULT_SITE_SOCIAL_LINKS, normalizeSiteSocialLinks, socialLinkLabel } from "@/lib/social-links";

export type BrandingDraft = {
  logoPath: string;
  tagline: string;
  links: DBSiteSocialLink[];
  configured: SiteSocialPlatform[];
};

export type BrandingStage =
  | { kind: "logo"; payload: { club_logo_path: string; updated_at: string }; value: string }
  | { kind: "social"; payload: DBSiteSocialLink[]; links: DBSiteSocialLink[]; configured: SiteSocialPlatform[] }
  | { kind: "tagline"; payload: { footer_tagline: string; updated_at: string }; value: string };

function socialValue(draft: BrandingDraft) {
  return normalizeSiteSocialLinks(draft.links)
    .filter((link) => draft.configured.includes(link.id))
    .map((link) => [link.id, link.href.trim()]);
}

export function validateChangedSocialLink(href: string, savedHref: string): string | undefined {
  const value = href.trim();
  if (!value || value === savedHref.trim()) return undefined;
  try {
    const url = new URL(value);
    if (/^https:\/\//i.test(value) && url.protocol === "https:" && value.length <= 2048) return undefined;
  } catch {}
  return "Use a complete link starting with https://.";
}

export function brandingDirty(draft: BrandingDraft, saved: BrandingDraft, tagline: boolean) {
  return draft.logoPath !== saved.logoPath ||
    (tagline && draft.tagline.trim() !== saved.tagline.trim()) ||
    JSON.stringify(socialValue(draft)) !== JSON.stringify(socialValue(saved));
}

/** Immutable requests: an interrupted save retries the original stage, never a newer edit. */
export function brandingStages(draft: BrandingDraft, saved: BrandingDraft, tagline: boolean, now: string): BrandingStage[] {
  const stages: BrandingStage[] = [];
  if (draft.logoPath !== saved.logoPath) {
    stages.push({ kind: "logo", payload: { club_logo_path: draft.logoPath, updated_at: now }, value: draft.logoPath });
  }
  if (JSON.stringify(socialValue(draft)) !== JSON.stringify(socialValue(saved))) {
    const links = normalizeSiteSocialLinks(draft.links).map((link) => ({ ...link }));
    const configured = [...draft.configured];
    const payload = links.filter((link) => configured.includes(link.id)).map((link) => ({
      id: link.id, label: socialLinkLabel(link.id), href: link.href.trim(), icon: link.icon,
      sort_order: DEFAULT_SITE_SOCIAL_LINKS.findIndex((fallback) => fallback.id === link.id),
      updated_at: now,
    }));
    // An existing configured row stays configured even when its URL is cleared.
    if (payload.length) stages.push({ kind: "social", payload, links, configured });
  }
  if (tagline && draft.tagline.trim() !== saved.tagline.trim()) {
    stages.push({ kind: "tagline", payload: { footer_tagline: draft.tagline.trim(), updated_at: now }, value: draft.tagline.trim() });
  }
  return stages;
}

export function confirmBrandingStage(saved: BrandingDraft, stage: BrandingStage): BrandingDraft {
  if (stage.kind === "logo") return { ...saved, logoPath: stage.value };
  if (stage.kind === "tagline") return { ...saved, tagline: stage.value };
  return { ...saved, links: stage.links, configured: stage.configured };
}

/** These codes are emitted before the data route executes a content query.
 * app/api/admin/data/route.ts:52,59–62,70–74,92–106;
 * requireFreshClubSession and authorizeMutation define the listed causes.
 * No status, generic database error, or message establishes non-commit. */
const prewriteRejections = new Map<string, string>([
  ["INVALID_ADMIN_PAYLOAD", "Check the logo, tagline and links, then try again."],
  ["AUTHENTICATION_REQUIRED", "Sign in again before saving."],
  ["SESSION_EXPIRED", "Sign in again before saving."],
  ["UNKNOWN_TENANT", "We could not verify this club. Reload or contact Onzio."],
  ["NOT_AUTHORIZED", "Your account cannot change this club. Contact a club owner."],
  ["CLUB_ARCHIVED", "This club is archived. Contact Onzio before making changes."],
  ["CLUB_INACTIVE", "This club is unavailable for content changes. Contact Onzio."],
  ["MEMBERSHIP_REQUIRED", "Your account no longer has access to this club. Contact a club owner."],
  ["MEMBERSHIP_INACTIVE", "Your account no longer has access to this club. Contact a club owner."],
  ["UNTRUSTED_TENANT_INPUT", "We could not verify this change for the club. Reload or contact Onzio."],
  ["INVALID_CLUB", "We could not verify this club. Reload or contact Onzio."],
]);

export function brandingPrewriteRejectionMessage(code: unknown): string | undefined {
  return typeof code === "string" ? prewriteRejections.get(code) : undefined;
}

export type BrandingSaveProgress = { stages: BrandingStage[]; uncertain: boolean };

export function rejectBrandingSave(progress: BrandingSaveProgress, code: unknown): BrandingSaveProgress {
  // A later rejection describes only that attempt; it cannot settle an earlier
  // unknown attempt of the same stage. Keep its exact original media/payload.
  if (!progress.uncertain && brandingPrewriteRejectionMessage(code)) {
    return { stages: [], uncertain: false };
  }
  return { stages: progress.stages, uncertain: true };
}

/** Only a successful acknowledgement advances the stage and clears uncertainty. */
export function advanceBrandingSave(progress: BrandingSaveProgress): BrandingSaveProgress {
  return { stages: progress.stages.slice(1), uncertain: false };
}
