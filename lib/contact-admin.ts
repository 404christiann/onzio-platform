import type {
  DBContactPageContent,
  DBContactProfile,
} from "@/lib/db-types";

export type ContactProfileDraft = {
  publicEmail: string;
  publicPhone: string;
  serviceArea: string;
  hours: string;
};

export type ContactPageDraft = {
  eyebrow: string;
  headline: string;
  intro: string;
  heroMediaAssetId: string | null;
  heroMediaPreviewUrl: string;
};

export type ContactDraft = {
  profile: ContactProfileDraft;
  page: ContactPageDraft;
};

export type ContactValidationErrors = Partial<
  Record<
    | "publicEmail"
    | "publicPhone"
    | "serviceArea"
    | "hours"
    | "eyebrow"
    | "headline"
    | "intro",
    string
  >
>;

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// The number part must begin with an optional `+`, then either a digit or an
// opening parenthesis. The original pattern allowed only `+` or a digit there,
// so the ordinary US format `(312) 731-9479` — which every club types — failed
// to match at all and was rejected as invalid. Everything after the first
// character stays restricted to digits, spaces, parentheses, dots, and hyphens,
// and isValidPublicPhone still enforces a 7-15 digit count, so letters, empty
// parentheses, and out-of-range numbers are still rejected.
const PHONE_PATTERN =
  /^(\+?[0-9(][0-9 ().-]*?)(?:\s*(?:x|ext\.?)\s*([0-9]{1,8}))?$/i;

export function isValidPublicEmail(value: string): boolean {
  const email = value.trim();
  return email === "" || (email.length <= 254 && EMAIL_PATTERN.test(email));
}

export function isValidPublicPhone(value: string): boolean {
  const phone = value.trim();
  if (phone === "") return true;
  if (phone.length > 40) return false;
  const match = PHONE_PATTERN.exec(phone);
  if (!match) return false;
  const digitCount = match[1].replace(/\D/g, "").length;
  return digitCount >= 7 && digitCount <= 15;
}

export function emptyContactDraft(): ContactDraft {
  return {
    profile: {
      publicEmail: "",
      publicPhone: "",
      serviceArea: "",
      hours: "",
    },
    page: {
      eyebrow: "",
      headline: "",
      intro: "",
      heroMediaAssetId: null,
      heroMediaPreviewUrl: "",
    },
  };
}

export function contactRowsToDraft(
  profile: DBContactProfile | null,
  page: DBContactPageContent | null,
): ContactDraft {
  return {
    profile: {
      publicEmail: profile?.public_email ?? "",
      publicPhone: profile?.public_phone ?? "",
      serviceArea: profile?.service_area ?? "",
      hours: profile?.hours ?? "",
    },
    page: {
      eyebrow: page?.eyebrow ?? "",
      headline: page?.headline ?? "",
      intro: page?.intro ?? "",
      heroMediaAssetId: page?.hero_media_asset_id ?? null,
      heroMediaPreviewUrl: "",
    },
  };
}

function lengthError(
  value: string,
  maximum: number,
  label: string,
): string | undefined {
  return value.length > maximum
    ? `${label} must be ${maximum} characters or fewer.`
    : undefined;
}

export function validateContactDraft(
  draft: ContactDraft,
): ContactValidationErrors {
  const errors: ContactValidationErrors = {};
  if (!isValidPublicEmail(draft.profile.publicEmail)) {
    errors.publicEmail = "Enter a valid public email address or leave it blank.";
  }
  if (!isValidPublicPhone(draft.profile.publicPhone)) {
    errors.publicPhone =
      "Enter a valid international telephone number or leave it blank.";
  }

  for (const [field, value, maximum, label] of [
    ["serviceArea", draft.profile.serviceArea, 120, "Service area"],
    ["hours", draft.profile.hours, 200, "Hours"],
    ["eyebrow", draft.page.eyebrow, 80, "Eyebrow"],
    ["headline", draft.page.headline, 80, "Headline"],
    ["intro", draft.page.intro, 320, "Introduction"],
  ] as const) {
    const error = lengthError(value, maximum, label);
    if (error) errors[field] = error;
  }
  return errors;
}

export function buildContactProfilePayload(
  draft: ContactProfileDraft,
): Record<string, string> {
  return {
    public_email: draft.publicEmail.trim(),
    public_phone: draft.publicPhone.trim(),
    service_area: draft.serviceArea.trim(),
    hours: draft.hours.trim(),
  };
}

export function buildContactPagePayload(
  draft: ContactPageDraft,
): Record<string, string | null> {
  return {
    eyebrow: draft.eyebrow.trim(),
    headline: draft.headline.trim(),
    intro: draft.intro.trim(),
    hero_media_asset_id: draft.heroMediaAssetId,
  };
}
