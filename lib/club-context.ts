import { cache } from "react";
import { failContract } from "@/lib/contract-error";
import { normalizeHostname } from "@/lib/tenant";
import {
  parsePresentationDocument,
  templateKey,
  type TemplateKey,
} from "@/packages/presentation";

export type ClubContext = {
  id: string;
  slug: string;
  name: string;
  primaryDomain: string;
  lifecycle: "onboarding" | "active" | "archived";
  publicAccess: "preview" | "live" | "grace" | "suspended";
  kind: "customer" | "demo" | "test";
  stripePriceId: string | null;
  tier: "starter" | "pro";
  role: "owner" | "admin" | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  // Derived from the presentation package rather than restated, so registering
  // a new template cannot leave this union silently stale.
  presentationTemplateKey: TemplateKey | null;
};

const TEST_CONTEXTS = {
  "alpha-onzio.vercel.app": {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "alpha",
    name: "Alpha FC",
    primaryDomain: "alpha-onzio.vercel.app",
    lifecycle: "active",
    publicAccess: "live",
    kind: "test",
    stripePriceId: null,
    tier: "pro",
    primaryColor: "#111111",
    secondaryColor: "#E7001B",
  },
  "bravo-onzio.vercel.app": {
    id: "22222222-2222-4222-8222-222222222222",
    slug: "bravo",
    name: "Bravo United",
    primaryDomain: "bravo-onzio.vercel.app",
    lifecycle: "onboarding",
    publicAccess: "preview",
    kind: "test",
    stripePriceId: null,
    tier: "starter",
    primaryColor: "#222222",
    secondaryColor: "#666666",
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

// React's request-scoped cache() memoizes per (primitive) argument tuple for
// the duration of a single server render, so layout + metadata + page calls
// for the same tenant collapse to one resolution. Next.js seeds a fresh cache
// per incoming request, so nothing leaks across requests or users; outside a
// React dispatcher (e.g. vitest) cache() is a passthrough. The wrappers below
// normalize userId to null so every caller hits the same cache entry.
const resolveDatabaseContext = cache(
  async (hostname: string, userId: string | null): Promise<ClubContext> => {
    const { createClient } = await import("@/lib/supabase-server");
    const supabase = await createClient();
    const onzio = supabase.schema("onzio");
    const { data: domain, error } = await onzio
      .from("club_domains")
      .select(
        "club_id, hostname, clubs!inner(id, slug, name, lifecycle, public_access, kind, stripe_price_id, tier, primary_color, secondary_color)",
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
      kind: ClubContext["kind"];
      stripe_price_id: string | null;
      tier: ClubContext["tier"];
      primary_color: string | null;
      secondary_color: string | null;
    };

    // These three depend only on club.id/userId, not on each other, so they
    // run concurrently. Supabase queries resolve to { data, error } objects
    // rather than throwing, so no leg can reject the Promise.all.
    const [{ data: primary }, membership, presentationTemplateKey] =
      await Promise.all([
        onzio
          .from("club_domains")
          .select("hostname")
          .eq("club_id", club.id)
          .eq("environment", process.env.ONZIO_ENVIRONMENT!)
          .eq("is_primary", true)
          .eq("active", true)
          .not("verified_at", "is", null)
          .single(),
        userId
          ? onzio
              .from("club_members")
              .select("role")
              .eq("club_id", club.id)
              .eq("user_id", userId)
              .eq("status", "active")
              .maybeSingle()
              .then(({ data }) => data)
          : Promise.resolve(null),
        resolvePublishedPresentationTemplateKey(onzio, club.id),
      ]);

    let role: ClubContext["role"] = null;
    if (membership?.role === "owner" || membership?.role === "admin") {
      role = membership.role;
    }

    return {
      id: club.id,
      slug: club.slug,
      name: club.name,
      primaryDomain: primary?.hostname ?? hostname,
      lifecycle: club.lifecycle,
      publicAccess: club.public_access,
      kind: club.kind,
      stripePriceId: club.stripe_price_id,
      tier: club.tier,
      role,
      primaryColor: club.primary_color,
      secondaryColor: club.secondary_color,
      presentationTemplateKey,
    };
  },
);

async function resolvePublishedPresentationTemplateKey(
  onzio: ReturnType<Awaited<ReturnType<typeof import("@/lib/supabase-server").createClient>>["schema"]>,
  clubId: string,
): Promise<ClubContext["presentationTemplateKey"]> {
  const { data: state } = await onzio
    .from("presentation_state")
    .select("published_document_id")
    .eq("club_id", clubId)
    .maybeSingle();
  let query = onzio
    .from("presentation_documents")
    .select("configuration")
    .eq("club_id", clubId);
  if (state?.published_document_id) {
    query = query.eq("id", state.published_document_id);
  } else {
    query = query.order("version", { ascending: false }).limit(1);
  }
  const { data } = await query.maybeSingle();
  if (!data?.configuration) {
    return null;
  }
  try {
    const document = parsePresentationDocument(data.configuration, {
      surface: "production",
    });
    return templateKey(document.template);
  } catch {
    return null;
  }
}

const resolveClubContextBySlug = cache(
  async (slug: string, userId: string | null): Promise<ClubContext> => {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) {
      failContract("UNKNOWN_TENANT");
    }
    const { createClient } = await import("@/lib/supabase-server");
    const supabase = await createClient();
    const onzio = supabase.schema("onzio");
    const { data: club, error } = await onzio
      .from("clubs")
      .select("id, slug, name, lifecycle, public_access, kind, stripe_price_id, tier, primary_color, secondary_color")
      .eq("slug", slug)
      .maybeSingle();
    if (error || !club) failContract("UNKNOWN_TENANT");

    // These three depend only on club.id/userId, not on each other, so they
    // run concurrently. Supabase queries resolve to { data, error } objects
    // rather than throwing, so no leg can reject the Promise.all.
    const [{ data: primary }, membership, presentationTemplateKey] =
      await Promise.all([
        onzio
          .from("club_domains")
          .select("hostname")
          .eq("club_id", club.id)
          .eq("environment", process.env.ONZIO_ENVIRONMENT!)
          .eq("is_primary", true)
          .eq("active", true)
          .not("verified_at", "is", null)
          .single(),
        userId
          ? onzio
              .from("club_members")
              .select("role")
              .eq("club_id", club.id)
              .eq("user_id", userId)
              .eq("status", "active")
              .maybeSingle()
              .then(({ data }) => data)
          : Promise.resolve(null),
        resolvePublishedPresentationTemplateKey(onzio, club.id),
      ]);
    if (!primary) failContract("PRIMARY_DOMAIN_REQUIRED");

    let role: ClubContext["role"] = null;
    if (membership?.role === "owner" || membership?.role === "admin") {
      role = membership.role;
    }

    return {
      id: club.id,
      slug: club.slug,
      name: club.name,
      primaryDomain: primary.hostname,
      lifecycle: club.lifecycle as ClubContext["lifecycle"],
      publicAccess: club.public_access as ClubContext["publicAccess"],
      kind: club.kind as ClubContext["kind"],
      stripePriceId: club.stripe_price_id,
      tier: club.tier as ClubContext["tier"],
      role,
      primaryColor: club.primary_color,
      secondaryColor: club.secondary_color,
      presentationTemplateKey,
    };
  },
);

export async function getClubContextBySlug(
  slug: string,
  userId?: string | null,
): Promise<ClubContext> {
  return resolveClubContextBySlug(slug, userId ?? null);
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
      presentationTemplateKey: null,
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

  return resolveDatabaseContext(hostname, input.userId ?? null);
}
