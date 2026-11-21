import { createHmac } from "node:crypto";
import { isIPv4, isIPv6 } from "node:net";

// TELEMETRY-01: the route turns IP + user agent into an HMAC with a server
// secret, so the raw IP never leaves this process. The database then applies
// the club's daily random salt (onzio_private.record_page_event).
//
// The route also derives network keys from the same secret, with no user agent:
// the IPv4 address or IPv6 /64 prefix (networkMaterial), and for IPv6 only the
// wider /48 prefix (wideNetworkMaterial). The in-process limiter and the
// database's per-network caps key on them, so rotating user agents from one
// machine does not make a new "visitor" each time, and one IPv6 block rotating
// /64 addresses inside its /48 shares a single budget.

export const VISITOR_SECRET_ENV = "TELEMETRY_VISITOR_SECRET";

/** Minimum secret length; shorter values are treated as unset. */
const MIN_SECRET_LENGTH = 32;

export function visitorSecret(env: Record<string, string | undefined> = process.env): string | null {
  const value = env[VISITOR_SECRET_ENV];
  return value && value.length >= MIN_SECRET_LENGTH ? value : null;
}

/** The client IP as Vercel reports it; only ever used as HMAC input. */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = headers.get("x-real-ip")?.trim() || forwarded || "";
  return candidate.length > 0 && candidate.length <= 64 ? candidate : null;
}

export function visitorMaterial(secret: string, ip: string, userAgent: string): string {
  return createHmac("sha256", secret).update(`${ip}\n${userAgent}`).digest("hex");
}

/** An IPv6 address as eight 16-bit groups, or null. Handles "::" and a dotted IPv4 tail. */
function ipv6Groups(address: string): number[] | null {
  let text = address;
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    if (!isIPv4(tail)) return null;
    const [a, b, c, d] = tail.split(".").map(Number);
    text = `${text.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const parts = [...head, ...Array<string>(missing).fill("0"), ...rest];
  if (!parts.every((part) => /^[0-9a-f]{1,4}$/i.test(part))) return null;
  return parts.map((part) => Number.parseInt(part, 16));
}

type ParsedIp = { version: 4; address: string } | { version: 6; groups: number[] };

/**
 * An IP address in a canonical shape, or null. Brackets and a zone are stripped.
 * An IPv4-mapped IPv6 address (::ffff:1.2.3.4, in either notation) is the IPv4
 * address. Anything that is not an IP address gives null.
 */
function parseIp(ip: string): ParsedIp | null {
  let value = ip.trim();
  if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1);
  value = value.replace(/%.*$/, "");
  if (isIPv4(value)) return { version: 4, address: value };
  if (!isIPv6(value)) return null;
  const groups = ipv6Groups(value);
  if (!groups) return null;
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return { version: 4, address: `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}` };
  }
  return { version: 6, groups };
}

function groupsPrefix(groups: number[], count: number): string {
  return groups
    .slice(0, count)
    .map((group) => group.toString(16))
    .join(":");
}

/**
 * What identifies one network: an IPv4 address as is, or the first 64 bits of an
 * IPv6 address (one household or site), written in a canonical form. An
 * IPv4-mapped IPv6 address (::ffff:1.2.3.4, in either notation) is the IPv4
 * address. Anything that is not an IP address gives null.
 */
export function networkPrefix(ip: string): string | null {
  const parsed = parseIp(ip);
  if (!parsed) return null;
  return parsed.version === 4 ? parsed.address : `${groupsPrefix(parsed.groups, 4)}::/64`;
}

/**
 * The wider network of an IPv6 address: its first 48 bits (a typical site or
 * ISP customer allocation, which can rotate through 65,536 /64 prefixes), in a
 * canonical form. An IPv4 address, an IPv4-mapped IPv6 address, and anything
 * that is not an IP address have no wide network and give null.
 */
export function widePrefix(ip: string): string | null {
  const parsed = parseIp(ip);
  return parsed?.version === 6 ? `${groupsPrefix(parsed.groups, 3)}::/48` : null;
}

/** Keyed hash of the network prefix; null when the address is not a valid IP. */
export function networkMaterial(secret: string, ip: string): string | null {
  const prefix = networkPrefix(ip);
  return prefix === null ? null : createHmac("sha256", secret).update(`net\n${prefix}`).digest("hex");
}

/** Keyed hash of the IPv6 /48 prefix; null for IPv4, IPv4-mapped and invalid addresses. */
export function wideNetworkMaterial(secret: string, ip: string): string | null {
  const prefix = widePrefix(ip);
  return prefix === null ? null : createHmac("sha256", secret).update(`net48\n${prefix}`).digest("hex");
}
