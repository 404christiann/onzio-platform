import { beaconBodySchema, MAX_BEACON_BYTES } from "@/lib/telemetry/beacon-contract";
import {
  classifySource,
  deviceFromUserAgent,
  extractUtm,
  geoFromHeaders,
  isBotUserAgent,
  isPrefetch,
  normalizeBeaconPath,
  referrerHostFrom,
  type Device,
  type SourceType,
  type Utm,
} from "@/lib/telemetry/classify";
import { clientIp, networkMaterial, visitorMaterial, visitorSecret, wideNetworkMaterial } from "@/lib/telemetry/visitor";

// TELEMETRY-01: turns one beacon request into the payload for
// onzio.record_page_event, or a reason to drop it. Pure apart from reading the
// visitor secret and the clock; the route owns rate limiting, signing and the
// database call.

export { MAX_BEACON_BYTES };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PageEventPayload = {
  type: "view" | "logo_seen" | "click" | "heartbeat";
  visitorMaterial: string;
  /** Keyed hash of the IPv4 address or IPv6 /64 prefix; the database's per-network cap keys on it. */
  networkMaterial: string;
  /**
   * Keyed hash of the IPv6 /48 prefix; the database's wide per-network cap keys on it, so rotating
   * /64 addresses inside one /48 shares a budget. Absent for IPv4 and IPv4-mapped addresses.
   */
  wideNetworkMaterial?: string;
  /** Epoch milliseconds when the route built the event; the database rejects stale calls. */
  ts: number;
  path: string;
  referrerHost: string | null;
  sourceType: SourceType;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  device: Device;
  country: string | null;
  city: string | null;
  isStaff: boolean;
  /** logo_seen only: 1-10 distinct lowercase sponsor ids. Absent for every other type. */
  sponsorIds?: string[];
  /** click only: the lowercase sponsor id. Absent for every other type. */
  sponsorId?: string;
  /** heartbeat only: engaged milliseconds, 1000-60000. Absent for every other type. */
  engagedMs?: number;
};

export type DropReason =
  | "not_configured"
  | "no_tenant"
  | "bot"
  | "prefetch"
  | "no_ip"
  | "too_large"
  | "invalid_body"
  | "excluded_path";

export type BeaconDecision =
  | { kind: "record"; clubId: string; event: PageEventPayload }
  | { kind: "drop"; reason: DropReason };

type EventContext = {
  clubId: string;
  visitorMaterial: string;
  networkMaterial: string;
  wideNetworkMaterial?: string;
  ts: number;
  device: Device;
  country: string | null;
  city: string | null;
  isStaff: boolean;
  userAgent: string;
};

/**
 * The request derivation every event type shares: visitor secret, verified club id (set only by
 * middleware after tenant resolution), bot, prefetch, client network, device, geo, staff, clock.
 * Drops carry the reason and keep the order of checks.
 */
export function deriveEventContext(input: {
  headers: Headers;
  env?: Record<string, string | undefined>;
  now?: number;
}): { kind: "ok"; context: EventContext } | { kind: "drop"; reason: DropReason } {
  const { headers } = input;
  const secret = visitorSecret(input.env);
  if (!secret) return { kind: "drop", reason: "not_configured" };

  // Set only by middleware after verified tenant resolution; middleware
  // deletes any client-supplied copy first.
  const clubId = headers.get("x-onzio-club-id") ?? "";
  if (!UUID.test(clubId)) return { kind: "drop", reason: "no_tenant" };

  const userAgent = headers.get("user-agent") ?? "";
  if (isBotUserAgent(userAgent)) return { kind: "drop", reason: "bot" };
  if (isPrefetch(headers)) return { kind: "drop", reason: "prefetch" };

  const ip = clientIp(headers);
  if (!ip) return { kind: "drop", reason: "no_ip" };
  // Not an IP address (a malformed header): no network to count it against.
  const network = networkMaterial(secret, ip);
  if (!network) return { kind: "drop", reason: "no_ip" };
  const wideNetwork = wideNetworkMaterial(secret, ip);

  const { country, city } = geoFromHeaders(headers);
  // A signed-in session is staff: only club staff and operators have accounts.
  const userId = headers.get("x-onzio-user-id") ?? "";

  return {
    kind: "ok",
    context: {
      clubId: clubId.toLowerCase(),
      visitorMaterial: visitorMaterial(secret, ip, userAgent),
      networkMaterial: network,
      ...(wideNetwork ? { wideNetworkMaterial: wideNetwork } : {}),
      ts: input.now ?? Date.now(),
      device: deviceFromUserAgent(userAgent),
      country,
      city,
      isStaff: UUID.test(userId),
      userAgent,
    },
  };
}

const NO_UTM = {
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmContent: null,
  utmTerm: null,
} as const;

function baseEvent(
  type: PageEventPayload["type"],
  context: EventContext,
  fields: { path: string; referrerHost: string | null; sourceType: SourceType; utm: Utm },
): PageEventPayload {
  return {
    type,
    visitorMaterial: context.visitorMaterial,
    networkMaterial: context.networkMaterial,
    ...(context.wideNetworkMaterial ? { wideNetworkMaterial: context.wideNetworkMaterial } : {}),
    ts: context.ts,
    path: fields.path,
    referrerHost: fields.referrerHost,
    sourceType: fields.sourceType,
    ...fields.utm,
    device: context.device,
    country: context.country,
    city: context.city,
    isStaff: context.isStaff,
  };
}

export function buildPageEvent(input: {
  headers: Headers;
  bodyText: string;
  env?: Record<string, string | undefined>;
  /** Epoch milliseconds; defaults to the current time. */
  now?: number;
}): BeaconDecision {
  const { headers } = input;
  const derived = deriveEventContext(input);
  if (derived.kind === "drop") return derived;
  const { context } = derived;

  if (new TextEncoder().encode(input.bodyText).length > MAX_BEACON_BYTES) {
    return { kind: "drop", reason: "too_large" };
  }
  let json: unknown;
  try {
    json = JSON.parse(input.bodyText);
  } catch {
    return { kind: "drop", reason: "invalid_body" };
  }
  const parsed = beaconBodySchema.safeParse(json);
  if (!parsed.success) return { kind: "drop", reason: "invalid_body" };
  const body = parsed.data;

  const path = normalizeBeaconPath(body.p);
  if (!path) return { kind: "drop", reason: "excluded_path" };

  if (body.t === "view") {
    const referrerHost = referrerHostFrom(body.r);
    const utm = extractUtm(body.q);
    return {
      kind: "record",
      clubId: context.clubId,
      event: baseEvent("view", context, {
        path,
        referrerHost,
        sourceType: classifySource({ referrerHost, siteHost: headers.get("host") ?? "", utm }),
        utm,
      }),
    };
  }

  const quiet = { path, referrerHost: null, sourceType: "direct" as const, utm: NO_UTM };
  if (body.t === "logo_seen") {
    return {
      kind: "record",
      clubId: context.clubId,
      event: { ...baseEvent("logo_seen", context, quiet), sponsorIds: body.s.map((id) => id.toLowerCase()) },
    };
  }
  return {
    kind: "record",
    clubId: context.clubId,
    event: { ...baseEvent("heartbeat", context, quiet), engagedMs: body.e },
  };
}

function normalizedHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "").replace(/:\d+$/, "");
}

/**
 * The click event for GET /r/<sponsorId>. The page is the Referer's path, but only when the Referer is
 * on the same host as this request (a foreign or missing Referer says nothing trustworthy about which
 * page held the logo, so it is "/").
 */
export function buildClickEvent(input: {
  headers: Headers;
  sponsorId: string;
  env?: Record<string, string | undefined>;
  now?: number;
}): BeaconDecision {
  const derived = deriveEventContext(input);
  if (derived.kind === "drop") return derived;

  const siteHost = normalizedHost(input.headers.get("host") ?? "");
  let path = "/";
  let referrerHost: string | null = null;
  let sourceType: SourceType = "direct";
  const referer = input.headers.get("referer");
  if (referer && siteHost) {
    try {
      const url = new URL(referer);
      if ((url.protocol === "https:" || url.protocol === "http:") && normalizedHost(url.host) === siteHost) {
        path = normalizeBeaconPath(url.pathname) ?? "/";
        referrerHost = siteHost;
        sourceType = "internal";
      }
    } catch {
      // An unparseable Referer is treated as missing.
    }
  }

  return {
    kind: "record",
    clubId: derived.context.clubId,
    event: {
      ...baseEvent("click", derived.context, { path, referrerHost, sourceType, utm: NO_UTM }),
      sponsorId: input.sponsorId.toLowerCase(),
    },
  };
}
