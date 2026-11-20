import { z } from "zod";
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
} from "@/lib/telemetry/classify";
import { clientIp, visitorMaterial, visitorSecret } from "@/lib/telemetry/visitor";

// TELEMETRY-01: turns one beacon request into the payload for
// onzio.record_page_event, or a reason to drop it. Pure apart from reading the
// visitor secret; the route owns rate limiting and the database call.

export const MAX_BEACON_BYTES = 2048;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const beaconBodySchema = z
  .object({
    t: z.literal("view"),
    p: z.string().max(2048),
    r: z.string().max(2048).optional(),
    q: z.string().max(2048).optional(),
  })
  .strict();

export type PageEventPayload = {
  type: "view";
  visitorMaterial: string;
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

export function buildPageEvent(input: {
  headers: Headers;
  bodyText: string;
  env?: Record<string, string | undefined>;
}): BeaconDecision {
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

  const path = normalizeBeaconPath(parsed.data.p);
  if (!path) return { kind: "drop", reason: "excluded_path" };

  const referrerHost = referrerHostFrom(parsed.data.r);
  const utm = extractUtm(parsed.data.q);
  const { country, city } = geoFromHeaders(headers);
  // A signed-in session is staff: only club staff and operators have accounts.
  const userId = headers.get("x-onzio-user-id") ?? "";

  return {
    kind: "record",
    clubId: clubId.toLowerCase(),
    event: {
      type: "view",
      visitorMaterial: visitorMaterial(secret, ip, userAgent),
      path,
      referrerHost,
      sourceType: classifySource({
        referrerHost,
        siteHost: headers.get("host") ?? "",
        utm,
      }),
      ...utm,
      device: deviceFromUserAgent(userAgent),
      country,
      city,
      isStaff: UUID.test(userId),
    },
  };
}
