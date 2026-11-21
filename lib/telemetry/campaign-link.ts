// TELEMETRY-04: the pure rules behind the Insights "Campaign link builder".
// Importable from client code; no I/O. A link is the public page URL plus
// utm_source, utm_medium and utm_campaign, which the page counter reads from
// the query string (lib/telemetry/classify.ts). The database accepts a utm
// value of 1 to 100 characters with no control characters
// (page_telemetry migration: `^[^[:cntrl:]]{1,100}$`), so the form enforces
// the same, counting characters the way postgres does (by code point).

export const UTM_MAX_CHARS = 100;
const PATH_MAX_CHARS = 512;

// [:cntrl:] in a UTF-8 database: C0 controls, DEL and the C1 controls.
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/;
const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;
const PRIVATE_PREFIXES = ["/admin", "/api", "/r"] as const;

export type UtmResult = { ok: true; value: string } | { ok: false; error: string };

/** A utm value trimmed and checked, or the plain reason it cannot be used. */
export function normalizeUtmValue(raw: string): UtmResult {
  const value = (raw ?? "").trim();
  if (value === "") return { ok: false, error: "Required" };
  if ([...value].length > UTM_MAX_CHARS) {
    return { ok: false, error: `Use ${UTM_MAX_CHARS} characters or fewer` };
  }
  if (CONTROL.test(value)) return { ok: false, error: "Remove line breaks, tabs and other hidden characters" };
  return { ok: true, value };
}

/** A path on the public website: not admin, api or the sponsor redirect, no query or fragment. */
export function isPublicSitePath(path: string): boolean {
  if (typeof path !== "string" || !path.startsWith("/")) return false;
  if (path.length > PATH_MAX_CHARS) return false;
  if (/[?#\s]/.test(path) || CONTROL.test(path)) return false;
  return !PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function isLocalHost(host: string): boolean {
  const lower = host.toLowerCase();
  return lower === "localhost" || lower.endsWith(".localhost");
}

export type CampaignLinkField = "host" | "path" | "source" | "medium" | "campaign";
export type CampaignLinkResult =
  | { ok: true; url: string }
  | { ok: false; errors: Partial<Record<CampaignLinkField, string>> };

export function buildCampaignLink(input: {
  host: string;
  path: string;
  source: string;
  medium: string;
  campaign: string;
}): CampaignLinkResult {
  const errors: Partial<Record<CampaignLinkField, string>> = {};
  const host = (input.host ?? "").trim();
  if (host === "" || host.length > 253 || !HOSTNAME.test(host)) errors.host = "Your website address is not set up";
  if (!isPublicSitePath(input.path)) errors.path = "Choose a page";
  const utm: Record<"source" | "medium" | "campaign", string> = { source: "", medium: "", campaign: "" };
  for (const field of ["source", "medium", "campaign"] as const) {
    const result = normalizeUtmValue(input[field]);
    if (result.ok) utm[field] = result.value;
    else errors[field] = result.error;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const url = new URL(`${isLocalHost(host) ? "http" : "https"}://${host.toLowerCase()}`);
  url.pathname = input.path;
  const params = new URLSearchParams();
  params.set("utm_source", utm.source);
  params.set("utm_medium", utm.medium);
  params.set("utm_campaign", utm.campaign);
  url.search = params.toString();
  return { ok: true, url: url.toString() };
}
