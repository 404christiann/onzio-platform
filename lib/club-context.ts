import { failContract } from "@/lib/contract-error";
import { normalizeHostname } from "@/lib/tenant";

export type ClubContext = {
  id: string;
  slug: string;
  name: string;
  primaryDomain: string;
  lifecycle: "onboarding" | "active" | "archived";
  publicAccess: "preview" | "live" | "grace" | "suspended";
  tier: "starter" | "pro";
  siteTemplate: "classic" | "editorial";
  role: "owner" | "admin" | null;
};

const TEST_CONTEXTS = {
  "alpha-onzio.vercel.app": {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "alpha",
    name: "Alpha FC",
    primaryDomain: "alpha-onzio.vercel.app",
    lifecycle: "active",
    publicAccess: "live",
    tier: "pro",
    siteTemplate: "classic",
  },
  "bravo-onzio.vercel.app": {
    id: "22222222-2222-4222-8222-222222222222",
    slug: "bravo",
    name: "Bravo United",
    primaryDomain: "bravo-onzio.vercel.app",
    lifecycle: "onboarding",
    publicAccess: "preview",
    tier: "starter",
    siteTemplate: "classic",
  },
} as const;

const TEST_ROLES: Record<string, Record<string, "owner" | "admin">> = {
  "11111111-1111-4111-8111-111111111111": {
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1": "owner",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2": "owner",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3": "admin",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6": "admin",
  },
  "22222222-2222-4222-8222-222222222222": {
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6": "owner",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7": "admin",
  },
};

async function getDatabaseContext(
  hostname: string,
  userId?: string | null,
): Promise<ClubContext> {
  const { createClient } = await import("@/lib/supabase-server");
  const supabase = await createClient();
  const onzio = supabase.schema("onzio");
  const { data: domain, error } = await onzio
    .from("club_domains")
    .select(
      "club_id, hostname, clubs!inner(id, slug, name, lifecycle, public_access, tier, site_template)",
    )
    .eq("hostname", hostname)
    .eq("active", true)
    .not("verified_at", "is", null)
    .maybeSingle();

  if (error || !domain) failContract("UNKNOWN_TENANT");
  const clubValue = domain.clubs;
  const club = (Array.isArray(clubValue) ? clubValue[0] : clubValue) as {
    id: string;
    slug: string;
    name: string;
    lifecycle: ClubContext["lifecycle"];
    public_access: ClubContext["publicAccess"];
    tier: ClubContext["tier"];
    site_template?: ClubContext["siteTemplate"] | null;
  };

  const { data: primary } = await onzio
    .from("club_domains")
    .select("hostname")
    .eq("club_id", club.id)
    .eq("is_primary", true)
    .eq("active", true)
    .not("verified_at", "is", null)
    .single();

  let role: ClubContext["role"] = null;
  if (userId) {
    const { data: membership } = await onzio
      .from("club_members")
      .select("role")
      .eq("club_id", club.id)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (membership?.role === "owner" || membership?.role === "admin") {
      role = membership.role;
    }
  }

  return {
    id: club.id,
    slug: club.slug,
    name: club.name,
    primaryDomain: primary?.hostname ?? hostname,
    lifecycle: club.lifecycle,
    publicAccess: club.public_access,
    tier: club.tier,
    siteTemplate: club.site_template ?? "classic",
    role,
  };
}

export async function getClubContextBySlug(
  slug: string,
  userId?: string | null,
): Promise<ClubContext> {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) {
    failContract("UNKNOWN_TENANT");
  }
  const { createClient } = await import("@/lib/supabase-server");
  const supabase = await createClient();
  const onzio = supabase.schema("onzio");
  const { data: club, error } = await onzio
    .from("clubs")
    .select("id, slug, name, lifecycle, public_access, tier, site_template")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !club) failContract("UNKNOWN_TENANT");

  const { data: primary } = await onzio
    .from("club_domains")
    .select("hostname")
    .eq("club_id", club.id)
    .eq("is_primary", true)
    .eq("active", true)
    .not("verified_at", "is", null)
    .single();
  if (!primary) failContract("PRIMARY_DOMAIN_REQUIRED");

  let role: ClubContext["role"] = null;
  if (userId) {
    const { data: membership } = await onzio
      .from("club_members")
      .select("role")
      .eq("club_id", club.id)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (membership?.role === "owner" || membership?.role === "admin") {
      role = membership.role;
    }
  }

  return {
    id: club.id,
    slug: club.slug,
    name: club.name,
    primaryDomain: primary.hostname,
    lifecycle: club.lifecycle as ClubContext["lifecycle"],
    publicAccess: club.public_access as ClubContext["publicAccess"],
    tier: club.tier as ClubContext["tier"],
    siteTemplate:
      (club.site_template as ClubContext["siteTemplate"] | null) ?? "classic",
    role,
  };
}

export async function getClubContext(input: {
  hostname: string;
  userId?: string | null;
}): Promise<ClubContext> {
  const hostname = normalizeHostname(input.hostname);

  if (process.env.NODE_ENV === "test") {
    const club = TEST_CONTEXTS[hostname as keyof typeof TEST_CONTEXTS];
    if (!club) failContract("UNKNOWN_TENANT");
    return {
      ...club,
      role: input.userId ? TEST_ROLES[club.id]?.[input.userId] ?? null : null,
    };
  }

  if (hostname.endsWith(".localhost")) {
    return getClubContextBySlug(
      hostname.slice(0, -".localhost".length),
      input.userId,
    );
  }
  if (
    hostname === "localhost" &&
    process.env.NODE_ENV === "development" &&
    process.env.ONZIO_LOCAL_TENANT_SLUG
  ) {
    return getClubContextBySlug(
      process.env.ONZIO_LOCAL_TENANT_SLUG,
      input.userId,
    );
  }

  return getDatabaseContext(hostname, input.userId);
}
