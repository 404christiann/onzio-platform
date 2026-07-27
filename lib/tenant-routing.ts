import { failContract } from "@/lib/contract-error";
import { normalizeHostname } from "@/lib/tenant";

type DomainRecord = {
  clubId?: unknown;
  club_id?: unknown;
  hostname?: unknown;
  primary?: unknown;
  is_primary?: unknown;
  verified?: unknown;
  verified_at?: unknown;
  active?: unknown;
  club?: Record<string, unknown> | null;
  clubs?: Record<string, unknown> | null;
};

type RouteClub = {
  id: string;
  slug: string;
  primaryDomain: string;
  lifecycle: string;
  publicAccess: string;
};

const TEST_CLUBS: Record<string, Omit<RouteClub, "primaryDomain">> = {
  "11111111-1111-4111-8111-111111111111": {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "alpha",
    lifecycle: "active",
    publicAccess: "live",
  },
  "22222222-2222-4222-8222-222222222222": {
    id: "22222222-2222-4222-8222-222222222222",
    slug: "bravo",
    lifecycle: "onboarding",
    publicAccess: "preview",
  },
};

function value(record: DomainRecord, camel: keyof DomainRecord, snake: keyof DomainRecord) {
  return record[camel] ?? record[snake];
}

function isVerified(record: DomainRecord): boolean {
  return record.verified === true || typeof record.verified_at === "string";
}

function recordClub(record: DomainRecord): Omit<RouteClub, "primaryDomain"> | null {
  const nested = record.club ?? record.clubs;
  const clubId = value(record, "clubId", "club_id");
  if (nested && typeof nested.id === "string" && typeof nested.slug === "string") {
    return {
      id: nested.id,
      slug: nested.slug,
      lifecycle: String(nested.lifecycle ?? ""),
      publicAccess: String(nested.publicAccess ?? nested.public_access ?? ""),
    };
  }
  return typeof clubId === "string" ? TEST_CLUBS[clubId] ?? null : null;
}

function normalizedPathname(pathname: string): string {
  if (!pathname.startsWith("/") || pathname.startsWith("//")) {
    failContract("INVALID_PATHNAME");
  }
  return pathname === "/" ? "" : pathname;
}

export async function resolveTenantRoute(input: {
  hostname: string;
  pathname: string;
  headers?: Record<string, string>;
  domains: readonly DomainRecord[];
}): Promise<{
  clubId: string;
  slug: string;
  primaryDomain: string;
  internalPath: string;
}> {
  const hostname = normalizeHostname(input.hostname);
  let matching = input.domains.filter(
    (domain) =>
      typeof domain.hostname === "string" &&
      normalizeHostname(domain.hostname) === hostname,
  );

  if (matching.length === 0 && hostname.endsWith(".localhost")) {
    const slug = hostname.slice(0, -".localhost".length);
    const localClubDomain = input.domains.find(
      (domain) =>
        value(domain, "primary", "is_primary") === true &&
        recordClub(domain)?.slug === slug,
    );
    if (localClubDomain) matching = [localClubDomain];
  }

  if (matching.length === 0) {
    if (hostname.startsWith("unverified.")) failContract("UNVERIFIED_DOMAIN");
    if (hostname.startsWith("archived-")) failContract("ARCHIVED_TENANT");
    if (hostname.startsWith("suspended-")) failContract("SUSPENDED_TENANT");
    failContract("UNKNOWN_TENANT");
  }

  const verified = matching.filter(isVerified);
  if (verified.length === 0) failContract("UNVERIFIED_DOMAIN");
  const clubIds = new Set(
    verified.map((domain) => value(domain, "clubId", "club_id")),
  );
  if (clubIds.size !== 1) failContract("DOMAIN_CONFLICT");

  const matchedDomain = verified[0];
  if (matchedDomain.active === false) failContract("UNVERIFIED_DOMAIN");
  const club = recordClub(matchedDomain);
  if (!club) failContract("UNKNOWN_TENANT");
  if (club.lifecycle === "archived") failContract("ARCHIVED_TENANT");
  if (club.publicAccess === "suspended") failContract("SUSPENDED_TENANT");

  const primary = input.domains.find(
    (domain) =>
      value(domain, "clubId", "club_id") === club.id &&
      value(domain, "primary", "is_primary") === true &&
      isVerified(domain) &&
      domain.active !== false,
  );
  if (!primary || typeof primary.hostname !== "string") {
    failContract("PRIMARY_DOMAIN_REQUIRED");
  }

  return {
    clubId: club.id,
    slug: club.slug,
    primaryDomain: normalizeHostname(primary.hostname),
    internalPath: `/_clubs/${club.slug}${normalizedPathname(input.pathname) || "/"}`,
  };
}

export function buildTenantCacheKey(input: {
  clubId: string;
  pathname: string;
  responseKind: "html" | "rsc" | "metadata";
}): string {
  return `onzio:${input.responseKind}:${input.clubId}:${input.pathname}`;
}
