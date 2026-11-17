import { isValidPublicEmail, isValidPublicPhone } from "@/lib/contact-admin";
import type { SiteSocialPlatform } from "@/lib/db-types";
import { normalizePublicHref } from "@/lib/public-link";

// ADMIN-RE-14: the rules behind "Your club" (design: cd-your-club; decision
// 0006; group 3 decisions 10 and 11). Pure, so the page, its tests and the
// server schemas all read the same numbers. Nothing here touches the database.

/** Limits, with the same numbers the server holds (lib/admin-data-contract.ts). */
export const YOUR_CLUB_LIMITS = {
  /** onzio.site_branding.footer_tagline CHECK. */
  footerLine: 160,
  hours: 200,
  area: 120,
  email: 254,
  phone: 40,
  socialHref: 2048,
} as const;

export type SocialPlatform = {
  id: SiteSocialPlatform;
  label: string;
  /** The platform's own mark in public/images/logo, the one the website's footer draws. */
  icon: string;
  placeholder: string;
};

/** The five social pages, in the order the footer shows them. */
export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
  { id: "instagram", label: "Instagram", icon: "/images/logo/instagramLogo.svg", placeholder: "instagram.com/yourclub" },
  { id: "facebook", label: "Facebook", icon: "/images/logo/facebookLogo.svg", placeholder: "facebook.com/yourclub" },
  { id: "tiktok", label: "TikTok", icon: "/images/logo/tiktokLogo.svg", placeholder: "tiktok.com/@yourclub" },
  { id: "x", label: "X", icon: "/images/logo/xLogo.svg", placeholder: "x.com/yourclub" },
  { id: "youtube", label: "YouTube", icon: "/images/logo/youtubeLogo.svg", placeholder: "youtube.com/@yourclub" },
];

export const EMPTY_SOCIAL: Record<SiteSocialPlatform, string> = {
  instagram: "",
  facebook: "",
  tiktok: "",
  x: "",
  youtube: "",
};

export type YourClubDraft = {
  email: string;
  phone: string;
  hours: string;
  area: string;
  footerLine: string;
  social: Record<SiteSocialPlatform, string>;
};

export type YourClubField = "email" | "phone" | "hours" | "area" | "footerLine" | SiteSocialPlatform;

/** Which sections the club's website has (decision 0005): the page asks only about what shows. */
export type YourClubShown = { reach: boolean; footerLine: boolean };

/**
 * What a social page field holds once Save has made it a web address: "instagram.com/club"
 * becomes "https://instagram.com/club". Anything that is not clearly an address is
 * left as typed, so validation can say so.
 */
export function normalizeSocialInput(value: string): string {
  const text = value.trim();
  if (text === "" || /^https?:\/\//i.test(text) || /\s/.test(text)) return text;
  return /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(text) ? `https://${text}` : text;
}

/** An address as the field shows it: without the scheme. */
export function socialDisplay(href: string): string {
  return href.replace(/^https?:\/\//i, "");
}

/**
 * What a social page really holds, given what is saved and what the field shows. A field left
 * as it was loaded (the saved address without its scheme) means the saved value, whatever its
 * scheme, case or port; only a field the owner changed is cleaned up into an https:// address.
 * Without this, an old "http://" address would load as an unsaved change and be rewritten.
 */
export function effectiveSocialHref(saved: string, typed: string): string {
  const current = saved.trim();
  const shown = typed.trim();
  return shown === socialDisplay(current) ? current : normalizeSocialInput(shown);
}

/** The page's fields as first shown: social addresses without their scheme, as typed in the design. */
export function draftFromSaved(saved: YourClubDraft): YourClubDraft {
  return {
    ...saved,
    social: Object.fromEntries(
      SOCIAL_PLATFORMS.map((platform) => [platform.id, socialDisplay(saved.social[platform.id].trim())]),
    ) as Record<SiteSocialPlatform, string>,
  };
}

export function counterLabel(value: string, limit: number): string {
  return `${value.length.toLocaleString("en-US")}/${limit.toLocaleString("en-US")}`;
}

function socialError(label: string, value: string): string | null {
  const href = normalizeSocialInput(value);
  if (href === "") return null;
  if (href.length > YOUR_CLUB_LIMITS.socialHref) {
    return `That ${label} address is too long (2,048 characters at most).`;
  }
  if (!/^https?:\/\//i.test(href) || normalizePublicHref(href) === "") {
    return `Use a web address, like ${SOCIAL_PLATFORMS.find((platform) => platform.label === label)?.placeholder ?? "instagram.com/yourclub"}.`;
  }
  return null;
}

/** One message per field that cannot be saved; empty when everything can. */
export function validateYourClub(
  draft: YourClubDraft,
  shown: YourClubShown,
): Partial<Record<YourClubField, string>> {
  const errors: Partial<Record<YourClubField, string>> = {};
  if (shown.reach) {
    if (!isValidPublicEmail(draft.email)) errors.email = "Enter a valid email address, or leave it blank.";
    if (!isValidPublicPhone(draft.phone)) errors.phone = "Enter a valid phone number, or leave it blank.";
    if (draft.hours.trim().length > YOUR_CLUB_LIMITS.hours) {
      errors.hours = `Hours must be ${YOUR_CLUB_LIMITS.hours} characters or fewer.`;
    }
    if (draft.area.trim().length > YOUR_CLUB_LIMITS.area) {
      errors.area = `Area must be ${YOUR_CLUB_LIMITS.area} characters or fewer.`;
    }
  }
  if (shown.footerLine && draft.footerLine.trim().length > YOUR_CLUB_LIMITS.footerLine) {
    errors.footerLine = `The footer line must be ${YOUR_CLUB_LIMITS.footerLine} characters or fewer.`;
  }
  for (const platform of SOCIAL_PLATFORMS) {
    const message = socialError(platform.label, draft.social[platform.id]);
    if (message) errors[platform.id] = message;
  }
  return errors;
}

export type ChangeSummary = {
  logo: boolean;
  footerLine: boolean;
  /** The social pages whose address differs from what is saved. */
  social: SiteSocialPlatform[];
  /** Email, phone, hours or area. */
  reach: boolean;
  /** How many things are not saved yet: each part once, each social page on its own. */
  count: number;
};

/** What Save would write, and the "N changes not saved yet" count. */
export function changeSummary(
  saved: YourClubDraft,
  draft: YourClubDraft,
  shown: YourClubShown,
  logoChanged: boolean,
): ChangeSummary {
  const differs = (a: string, b: string) => a.trim() !== b.trim();
  const footerLine = shown.footerLine && differs(saved.footerLine, draft.footerLine);
  const reach =
    shown.reach &&
    (differs(saved.email, draft.email) ||
      differs(saved.phone, draft.phone) ||
      differs(saved.hours, draft.hours) ||
      differs(saved.area, draft.area));
  const social = SOCIAL_PLATFORMS.filter(
    (platform) =>
      effectiveSocialHref(saved.social[platform.id], draft.social[platform.id]) !== saved.social[platform.id].trim(),
  ).map((platform) => platform.id);
  return {
    logo: logoChanged,
    footerLine,
    social,
    reach,
    count: (logoChanged ? 1 : 0) + (footerLine ? 1 : 0) + (reach ? 1 : 0) + social.length,
  };
}

/** "Fit your logo": how far the picture can be zoomed. */
export const MIN_LOGO_ZOOM = 1;
export const MAX_LOGO_ZOOM = 4;

export type CropInput = {
  naturalWidth: number;
  naturalHeight: number;
  /** The square frame's side, in the pixels the geometry is wanted in. */
  frame: number;
  zoom: number;
  /** How far the picture was moved from the middle, in the same pixels. */
  offsetX: number;
  offsetY: number;
};

export type CropGeometry = {
  zoom: number;
  /** Where the picture is drawn inside the frame. */
  drawX: number;
  drawY: number;
  drawWidth: number;
  drawHeight: number;
  /** The offsets after keeping the picture over the frame. */
  offsetX: number;
  offsetY: number;
};

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * Zoom 1 shows the whole logo inside the square, in the middle. Zooming in crops it;
 * the picture can then be moved, but never far enough to leave an empty strip inside
 * the frame, and a picture still smaller than the frame stays in the middle.
 */
export function cropGeometry(input: CropInput): CropGeometry {
  const zoom = clamp(Number.isFinite(input.zoom) ? input.zoom : 1, MIN_LOGO_ZOOM, MAX_LOGO_ZOOM);
  const longest = Math.max(input.naturalWidth, input.naturalHeight);
  const base = longest > 0 ? input.frame / longest : 0;
  const drawWidth = input.naturalWidth * base * zoom;
  const drawHeight = input.naturalHeight * base * zoom;
  const reachX = Math.max(0, (drawWidth - input.frame) / 2);
  const reachY = Math.max(0, (drawHeight - input.frame) / 2);
  const offsetX = clamp(input.offsetX, -reachX, reachX);
  const offsetY = clamp(input.offsetY, -reachY, reachY);
  return {
    zoom,
    drawWidth,
    drawHeight,
    offsetX,
    offsetY,
    drawX: (input.frame - drawWidth) / 2 + offsetX,
    drawY: (input.frame - drawHeight) / 2 + offsetY,
  };
}
