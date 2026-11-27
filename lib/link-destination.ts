import { z } from "zod";

/**
 * The one rule for every admin-editable link destination: a web link, a page on
 * the club's site, or an email address. Admin forms, save routes and public
 * renderers all call this, and `onzio_private.normalize_link_destination` in SQL
 * copies it regex for regex (tests/database/link-destination-parity.test.ts).
 *
 * Plain regexes only, no `new URL`, so the SQL copy can match it exactly.
 */
export type LinkKind = "https" | "path" | "email";

export type LinkDestinationOptions = { allow?: readonly LinkKind[] };

export const LINK_DESTINATION_HINT = "A link (like a Google Form), a page on your site starting with /, or an email address.";
export const LINK_DESTINATION_ERROR = "That doesn't look like a link or email.";
export const PROFILE_LINK_HINT = "A full link to your profile.";
export const PROFILE_LINK_ERROR = "That doesn't look like a full https:// link.";

/** Social profile links: an https page only. */
export const PROFILE_LINK = { allow: ["https"] } as const satisfies LinkDestinationOptions;
/** Dropdown-only buttons that open a page on the club's own site. */
export const SITE_PAGE_LINK = { allow: ["path"] } as const satisfies LinkDestinationOptions;

const ALL_KINDS: readonly LinkKind[] = ["https", "path", "email"];

const EDGE_SPACE = /^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g;
// Printable ASCII except the characters a link never needs and markup abuses.
const ALLOWED_CHARS = /^[\x21-\x7e]+$/;
const FORBIDDEN_CHARS = /[\\<>"`{}|^]/;
const PATH = /^\/[-A-Za-z0-9._~!$&'()*+,;=:@%/?#]*$/;
const SCHEME = /^([A-Za-z][A-Za-z0-9+-]*):(.*)$/;
const LABEL = "[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?";
const HOST = new RegExp(`^(${LABEL}\\.)+[A-Za-z]([A-Za-z0-9-]*[A-Za-z0-9])?$`);
const EMAIL_LOCAL = /^[A-Za-z0-9.!$%&'*+=_~-]+$/;
const MAIL_QUERY = /^(\?[-A-Za-z0-9._~!$&'()*+,;=:@%/?]*)?$/;
const WEB = /^([^/?#]+)([/?#][-A-Za-z0-9._~!$&'()*+,;=:@%/?#]*)?$/;
const AUTHORITY = /^([^:]+)(:[0-9]{1,5})?$/;
const PRIVATE_HOST = /(^|\.)(localhost|local|internal)$/i;

/**
 * Returns the stored form of a link destination: "" for blank, or the
 * normalized link. Returns null when the value is not an allowed link.
 * Normalizing a normalized value returns it unchanged.
 */
export function normalizeLinkDestination(value: unknown, options: LinkDestinationOptions = {}): string | null {
  if (typeof value !== "string") return null;
  const allow = options.allow ?? ALL_KINDS;
  const v = value.replace(EDGE_SPACE, "");
  if (v === "") return "";
  if (!ALLOWED_CHARS.test(v) || FORBIDDEN_CHARS.test(v)) return null;

  if (v.startsWith("/")) {
    return allow.includes("path") && PATH.test(v) && !v.startsWith("//") ? v : null;
  }

  const scheme = SCHEME.exec(v);
  if (scheme) {
    const name = scheme[1].toLowerCase();
    const rest = scheme[2];
    if (name === "mailto") return allow.includes("email") ? email(rest) : null;
    if ((name === "https" || name === "http") && rest.startsWith("//")) {
      return allow.includes("https") ? web(rest.slice(2)) : null;
    }
    return null;
  }

  const at = v.indexOf("@");
  if (at > 0 && !/[/?#:]/.test(v.slice(0, at))) return allow.includes("email") ? email(v) : null;

  return allow.includes("https") ? web(v) : null;
}

function email(value: string): string | null {
  const q = value.indexOf("?");
  const address = q < 0 ? value : value.slice(0, q);
  const query = q < 0 ? "" : value.slice(q);
  const at = address.indexOf("@");
  if (at < 1 || address.indexOf("@", at + 1) >= 0) return null;
  if (!EMAIL_LOCAL.test(address.slice(0, at)) || !isPublicHost(address.slice(at + 1))) return null;
  if (!MAIL_QUERY.test(query)) return null;
  return `mailto:${address}${query}`;
}

function web(value: string): string | null {
  const parts = WEB.exec(value);
  if (!parts) return null;
  const authority = AUTHORITY.exec(parts[1]);
  if (!authority || !isPublicHost(authority[1])) return null;
  if (authority[2] && Number(authority[2].slice(1)) > 65535) return null;
  return `https://${value}`;
}

function isPublicHost(host: string): boolean {
  return host.length <= 253 && HOST.test(host) && !PRIVATE_HOST.test(host);
}

export function isLinkDestination(value: unknown, options?: LinkDestinationOptions): boolean {
  return normalizeLinkDestination(value, options) !== null;
}

/** For public renderers: the normalized link, or "" when the stored value is not one. */
export function renderableLink(value: unknown, options?: LinkDestinationOptions): string {
  return normalizeLinkDestination(value, options) ?? "";
}

/** The shared hint, plus an optional line of its own for one field (what blank does, a fallback). */
export function linkDestinationHint(options: LinkDestinationOptions & { extra?: string } = {}): string {
  const hint = isProfileOnly(options) ? PROFILE_LINK_HINT : LINK_DESTINATION_HINT;
  const extra = options.extra?.trim();
  return extra ? `${hint} ${extra}` : hint;
}

export function linkDestinationError(options: LinkDestinationOptions = {}): string {
  return isProfileOnly(options) ? PROFILE_LINK_ERROR : LINK_DESTINATION_ERROR;
}

function isProfileOnly(options: LinkDestinationOptions): boolean {
  return options.allow?.length === 1 && options.allow[0] === "https";
}

/**
 * For an object schema's superRefine: adds the shared error at `path` when the
 * value is not a link (or is longer than `max` once normalized).
 */
export function refineLinkDestination(
  context: z.RefinementCtx,
  path: PropertyKey[],
  value: unknown,
  options: LinkDestinationOptions & { max?: number } = {},
): void {
  const normalized = normalizeLinkDestination(value, options);
  if (normalized === null || (options.max !== undefined && normalized.length > options.max)) {
    context.addIssue({ code: "custom", path, message: linkDestinationError(options) });
  }
}

/** The normalized value for a field that already passed `refineLinkDestination`. */
export function normalizedLink(value: string, options?: LinkDestinationOptions): string {
  return normalizeLinkDestination(value, options) ?? value;
}

/**
 * Zod field for a link destination. Parses to the normalized value, so every
 * save path that uses it stores what the public site renders.
 */
export function linkDestinationSchema(options: LinkDestinationOptions & { max?: number } = {}) {
  const message = linkDestinationError(options);
  return z.string().transform((value, context) => {
    const normalized = normalizeLinkDestination(value, options);
    if (normalized === null || (options.max !== undefined && normalized.length > options.max)) {
      context.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return normalized;
  });
}

/** For an admin field: the shared error when the typed value is not a link, otherwise undefined. */
export function linkDestinationProblem(value: string, options: LinkDestinationOptions = {}): string | undefined {
  return isLinkDestination(value, options) ? undefined : linkDestinationError(options);
}

/** New-tab attributes for a web link; a site page or an email link opens in place. */
export function externalLinkProps(value: unknown): { target?: "_blank"; rel?: string } {
  return renderableLink(value).startsWith("https://") ? { target: "_blank", rel: "noopener noreferrer" } : {};
}

/**
 * The guard for stored URL columns that are not link destinations (image and
 * media URLs): blank, a site path, or an http, https or mailto URL. It refuses
 * script and data schemes, whitespace and protocol-relative `//host` values.
 */
export function isSafeStoredUrl(value: string): boolean {
  if (value === "") return true;
  if (!ALLOWED_CHARS.test(value) || value.includes("\\")) return false;
  if (value.startsWith("/")) return !value.startsWith("//");
  return /^(https?:\/\/[^/]|mailto:.)/.test(value);
}
