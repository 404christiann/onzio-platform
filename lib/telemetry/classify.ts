// TELEMETRY-01: pure request classification for the page beacon. Nothing here
// touches the network or the database.

export type Device = "mobile" | "tablet" | "desktop";
export type SourceType =
  | "direct"
  | "search"
  | "social"
  | "referral"
  | "campaign"
  | "internal";

const BOT_PATTERN = new RegExp(
  [
    // "Cubot" is a phone brand, not a crawler.
    "(?<!cu)bot\\b", "bot/", "crawl", "spider", "slurp", "scrap", "headless", "phantomjs",
    "lighthouse", "pagespeed", "gtmetrix", "pingdom", "uptime", "monitor",
    "preview", "facebookexternalhit", "embedly", "quora link", "whatsapp",
    "telegram", "discord", "skype", "bitly", "vercel", "curl/", "wget/",
    "python-", "python/", "go-http-client", "java/", "okhttp", "axios/",
    "node-fetch", "undici", "libwww", "httpclient", "postman", "insomnia",
    "chrome-lighthouse", "googleother", "google-inspectiontool", "adsbot",
    "mediapartners", "feedfetcher", "applebot", "bingpreview", "yandex",
    "baiduspider", "duckduckbot", "petalbot", "semrush", "ahrefs", "mj12",
    "dotbot", "bytespider", "gptbot", "claudebot", "ccbot", "perplexity",
    "amazonbot",
  ].join("|"),
  "i",
);

/** True for crawlers, link unfurlers, monitors, scripts, and empty agents. */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  const value = userAgent?.trim() ?? "";
  if (value.length < 8 || value.length > 1024) return true;
  return BOT_PATTERN.test(value);
}

/** Prefetch and prerender requests are not page views. */
export function isPrefetch(headers: Headers): boolean {
  const purpose = `${headers.get("purpose") ?? ""} ${headers.get("sec-purpose") ?? ""} ${
    headers.get("x-purpose") ?? ""
  } ${headers.get("x-moz") ?? ""}`.toLowerCase();
  return /prefetch|prerender|preview/.test(purpose);
}

export function deviceFromUserAgent(userAgent: string): Device {
  if (/ipad|tablet|kindle|silk|playbook|(android(?!.*mobile))/i.test(userAgent)) {
    return "tablet";
  }
  if (/mobi|iphone|ipod|android|blackberry|opera mini|iemobile|windows phone/i.test(userAgent)) {
    return "mobile";
  }
  return "desktop";
}

/**
 * Normalizes a beacon path: absolute, no query or fragment, no control
 * characters, no trailing slash, and never an admin or API path.
 */
export function normalizeBeaconPath(input: unknown): string | null {
  if (typeof input !== "string" || !input.startsWith("/") || input.startsWith("//")) {
    return null;
  }
  let path = input.split(/[?#]/, 1)[0] ?? "";
  if (path.length > 1) path = path.replace(/\/+$/, "") || "/";
  if (path.length > 512 || /[\s\u0000-\u001f\u007f]/.test(path)) return null;
  if (/^\/(admin|api|_clubs|%5fclubs|_next)(\/|$)/i.test(path)) return null;
  return path;
}

const HOST_PATTERN = /^[a-z0-9.-]{1,253}$/;

/** Only the referrer's host is kept, never its path or query. */
export function referrerHostFrom(referrer: unknown): string | null {
  if (typeof referrer !== "string" || referrer.length === 0 || referrer.length > 2048) {
    return null;
  }
  try {
    const url = new URL(referrer);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    return HOST_PATTERN.test(host) ? host : null;
  } catch {
    return null;
  }
}

export type Utm = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
};

const UTM_KEYS = {
  utm_source: "utmSource",
  utm_medium: "utmMedium",
  utm_campaign: "utmCampaign",
  utm_content: "utmContent",
  utm_term: "utmTerm",
} as const;

function cleanUtmValue(value: string | null): string | null {
  if (value === null) return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().toLowerCase().slice(0, 100);
  return cleaned.length > 0 ? cleaned : null;
}

/** Reads the five utm_* parameters from a location.search string. */
export function extractUtm(search: unknown): Utm {
  const empty: Utm = {
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
  };
  if (typeof search !== "string" || search.length === 0 || search.length > 2048) return empty;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  } catch {
    return empty;
  }
  const result = { ...empty };
  for (const [key, field] of Object.entries(UTM_KEYS)) {
    result[field] = cleanUtmValue(params.get(key));
  }
  return result;
}

const SEARCH_HOSTS =
  /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.yahoo\.com|yahoo\.com|ecosia\.org|baidu\.com|yandex\.[a-z.]+|search\.brave\.com|startpage\.com|kagi\.com)$/;
const SOCIAL_HOSTS =
  /(^|\.)(facebook\.com|fb\.com|fb\.me|instagram\.com|t\.co|twitter\.com|x\.com|tiktok\.com|linkedin\.com|lnkd\.in|reddit\.com|youtube\.com|youtu\.be|threads\.net|bsky\.app|pinterest\.com|snapchat\.com|whatsapp\.com|wa\.me)$/;

export function classifySource(input: {
  referrerHost: string | null;
  siteHost: string;
  utm: Utm;
}): SourceType {
  if (input.utm.utmSource || input.utm.utmMedium || input.utm.utmCampaign) return "campaign";
  const referrer = input.referrerHost;
  if (!referrer) return "direct";
  const site = input.siteHost.toLowerCase().replace(/^www\./, "").replace(/:\d+$/, "");
  if (referrer === site) return "internal";
  if (SEARCH_HOSTS.test(referrer)) return "search";
  if (SOCIAL_HOSTS.test(referrer)) return "social";
  return "referral";
}

/** Vercel geo headers. The city header is URI-encoded. */
export function geoFromHeaders(headers: Headers): { country: string | null; city: string | null } {
  const rawCountry = headers.get("x-vercel-ip-country")?.trim().toUpperCase() ?? "";
  const country = /^[A-Z]{2}$/.test(rawCountry) && rawCountry !== "XX" ? rawCountry : null;
  let city: string | null = null;
  const rawCity = headers.get("x-vercel-ip-city");
  if (rawCity) {
    try {
      const decoded = decodeURIComponent(rawCity).replace(/[\u0000-\u001f\u007f]/g, "").trim();
      city = decoded.length > 0 ? decoded.slice(0, 80) : null;
    } catch {
      city = null;
    }
  }
  return { country, city };
}
