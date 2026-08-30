import type { DBProgram } from "@/lib/db-types";

export type ProgramMediaItem = {
  id: string;
  url: string;
  alt: string;
  sortOrder: number;
};

export type ProgramRegistrationContent = {
  enabled: boolean;
  eyebrow: string;
  headline: string;
  body: string;
  pendingBody: string;
  pendingLabel: string;
};

/**
 * Template defaults for the program registration band.
 *
 * These are the approved academy@1 strings that used to be hardcoded inside
 * `components/AcademyProgramDetailPage.tsx`. They live here for the same reason
 * `DEFAULT_STANDINGS_SETTINGS` and `DEFAULT_HOMEPAGE_HERO_CONTENT` do: a club
 * that has never touched a field still renders sensible template chrome, and an
 * empty column stays a legitimate "unset" value instead of a blank page. Any
 * value a club saves through /admin/programs wins over the default.
 */
export const DEFAULT_PROGRAM_REGISTRATION_CONTENT: Omit<
  ProgramRegistrationContent,
  "enabled"
> = {
  eyebrow: "Program Registration",
  headline: "Ready to take the field?",
  body: "Registration is completed through our external registration partner. Continue there to get started.",
  pendingBody:
    "Registration is completed through our external registration partner. The registration link will be posted here as soon as it is available.",
  // DCFC-D102: the honest no-destination state. Deliberately not a link.
  pendingLabel: "Registration Link Coming Soon",
};

export const PROGRAM_REGISTRATION_LIMITS = {
  eyebrow: 80,
  headline: 120,
  body: 1_200,
  pendingBody: 1_200,
  pendingLabel: 60,
} as const;

export const PROGRAM_MEDIA_LIMITS = {
  alt: 200,
  url: 2_048,
  /** Admin-side ceiling on gallery size; the slideshow is not a photo library. */
  items: 12,
} as const;

type RegistrationColumns = Pick<
  DBProgram,
  | "registration_enabled"
  | "registration_eyebrow"
  | "registration_headline"
  | "registration_body"
  | "registration_pending_body"
  | "registration_pending_label"
>;

function orDefault(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

/** Resolves stored registration copy against the template defaults. */
export function resolveProgramRegistration(
  row: Partial<RegistrationColumns>,
): ProgramRegistrationContent {
  return {
    enabled: row.registration_enabled === true,
    eyebrow: orDefault(
      row.registration_eyebrow,
      DEFAULT_PROGRAM_REGISTRATION_CONTENT.eyebrow,
    ),
    headline: orDefault(
      row.registration_headline,
      DEFAULT_PROGRAM_REGISTRATION_CONTENT.headline,
    ),
    body: orDefault(
      row.registration_body,
      DEFAULT_PROGRAM_REGISTRATION_CONTENT.body,
    ),
    pendingBody: orDefault(
      row.registration_pending_body,
      DEFAULT_PROGRAM_REGISTRATION_CONTENT.pendingBody,
    ),
    pendingLabel: orDefault(
      row.registration_pending_label,
      DEFAULT_PROGRAM_REGISTRATION_CONTENT.pendingLabel,
    ),
  };
}

/** Normalizes a program_media row set into ordered, renderable slides. */
export function normalizeProgramMedia(rows: unknown): ProgramMediaItem[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const record = row as Record<string, unknown>;
      const url = typeof record.url === "string" ? record.url.trim() : "";
      if (!url) return null;
      return {
        id: typeof record.id === "string" ? record.id : url,
        url,
        alt: typeof record.alt === "string" ? record.alt : "",
        sortOrder:
          typeof record.sort_order === "number" ? record.sort_order : 0,
      };
    })
    .filter((item): item is ProgramMediaItem => item !== null)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}
