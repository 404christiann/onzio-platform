import { createHmac, randomUUID } from "node:crypto";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import WebSocket from "ws";
import {
  addClubMembership,
  removeClubMembership,
} from "@/lib/operator/manage-membership";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

const EXPECTED_PROJECT_REF = "fxefqnoqxbezeccjvrsw";
const EXPECTED_CONFIRMATION = `phase-7-auth:${EXPECTED_PROJECT_REF}`;
const OPERATOR_EMAIL = "onzio.phase7.operator@example.com";

const identities = {
  alphaOwner: {
    email: "onzio.phase7.alpha.owner@example.com",
    passwordEnv: "ONZIO_PHASE7_ALPHA_OWNER_PASSWORD",
    totpEnv: "ONZIO_PHASE7_ALPHA_OWNER_TOTP",
    hostname: "alpha-onzio-staging.vercel.app",
    slug: "alpha",
    role: "owner",
  },
  alphaAdmin: {
    email: "onzio.phase7.alpha.admin@example.com",
    passwordEnv: "ONZIO_PHASE7_ALPHA_ADMIN_PASSWORD",
    totpEnv: "ONZIO_PHASE7_ALPHA_ADMIN_TOTP",
    hostname: "alpha-onzio-staging.vercel.app",
    slug: "alpha",
    role: "admin",
  },
  bravoOwner: {
    email: "onzio.phase7.bravo.owner@example.com",
    passwordEnv: "ONZIO_PHASE7_BRAVO_OWNER_PASSWORD",
    totpEnv: "ONZIO_PHASE7_BRAVO_OWNER_TOTP",
    hostname: "bravo-onzio-staging.vercel.app",
    slug: "bravo",
    role: "owner",
  },
  bravoAdmin: {
    email: "onzio.phase7.bravo.admin@example.com",
    passwordEnv: "ONZIO_PHASE7_BRAVO_ADMIN_PASSWORD",
    totpEnv: "ONZIO_PHASE7_BRAVO_ADMIN_TOTP",
    hostname: "bravo-onzio-staging.vercel.app",
    slug: "bravo",
    role: "admin",
  },
} as const;

type IdentityKey = keyof typeof identities;
type CookieRecord = { name: string; value: string; options: CookieOptions };

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertStagingTarget() {
  if (required("ONZIO_PHASE7_CONFIRM") !== EXPECTED_CONFIRMATION) {
    throw new Error(`ONZIO_PHASE7_CONFIRM must equal ${EXPECTED_CONFIRMATION}`);
  }
  if (process.env.ONZIO_ENVIRONMENT !== "staging") {
    throw new Error("ONZIO_ENVIRONMENT must equal staging");
  }
  const url = new URL(required("NEXT_PUBLIC_SUPABASE_URL"));
  if (
    url.protocol !== "https:" ||
    url.hostname !== `${EXPECTED_PROJECT_REF}.supabase.co`
  ) {
    throw new Error("Refusing an unexpected Supabase project");
  }
  if (!required("SUPABASE_SERVICE_ROLE_KEY").startsWith("sb_secret_")) {
    throw new Error("A modern staging Supabase secret key is required");
  }
  if (!required("NEXT_PUBLIC_SUPABASE_ANON_KEY").startsWith("sb_publishable_")) {
    throw new Error("A modern staging Supabase publishable key is required");
  }
  required("VERCEL_AUTOMATION_BYPASS_SECRET");
}

function decodeBase32(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = value.toUpperCase().replace(/=+$/u, "");
  let bits = "";
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Invalid TOTP secret");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function currentTotp(secret: string): string {
  const counter = Math.floor(Date.now() / 30_000);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret))
    .update(counterBytes)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function cookieHeader(cookies: Map<string, CookieRecord>): string {
  return [...cookies.values()]
    .filter((cookie) => cookie.value)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

function createSessionClient() {
  const cookies = new Map<string, CookieRecord>();
  const client = createServerClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      db: { schema: "onzio" },
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: true,
      },
      cookies: {
        getAll: () =>
          [...cookies.values()].map(({ name, value }) => ({ name, value })),
        setAll: (values) => {
          for (const cookie of values) {
            cookies.set(cookie.name, cookie);
          }
        },
      },
      realtime: {
        transport: WebSocket as unknown as typeof globalThis.WebSocket,
      },
    },
  );
  return { client, cookies };
}

type SessionClient = ReturnType<typeof createSessionClient>["client"];

async function hostedRequest(
  hostname: string,
  cookies: Map<string, CookieRecord>,
  pathname: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set(
    "x-vercel-protection-bypass",
    required("VERCEL_AUTOMATION_BYPASS_SECRET"),
  );
  const serializedCookies = cookieHeader(cookies);
  if (serializedCookies) headers.set("cookie", serializedCookies);
  return fetch(`https://${hostname}${pathname}`, {
    ...init,
    headers,
    redirect: "manual",
  });
}

async function elevateToAal2(
  client: SessionClient,
  totpSecret: string,
): Promise<void> {
  const factors = await client.auth.mfa.listFactors();
  if (factors.error) throw factors.error;
  const factor = factors.data.totp.find(
    (candidate) => candidate.status === "verified",
  );
  if (!factor) throw new Error("Expected a verified TOTP factor");
  const challenge = await client.auth.mfa.challenge({ factorId: factor.id });
  if (challenge.error) throw challenge.error;
  const verified = await client.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.data.id,
    code: currentTotp(totpSecret),
  });
  if (verified.error) throw verified.error;
  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance.error || assurance.data.currentLevel !== "aal2") {
    throw assurance.error ?? new Error("Session did not reach AAL2");
  }
}

async function signInIdentity(
  key: IdentityKey,
  clubId: string,
): Promise<{
  client: SessionClient;
  cookies: Map<string, CookieRecord>;
  userId: string;
}> {
  const profile = identities[key];
  const session = createSessionClient();
  const signIn = await session.client.auth.signInWithPassword({
    email: profile.email,
    password: required(profile.passwordEnv),
  });
  if (signIn.error || !signIn.data.user) {
    throw signIn.error ?? new Error(`Unable to sign in ${key}`);
  }

  const aal1 = await session.client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal1.error || aal1.data.currentLevel !== "aal1") {
    throw aal1.error ?? new Error(`${key} did not begin at AAL1`);
  }

  const deniedWrite = await session.client.from("site_social_links").insert({
    club_id: clubId,
    id: `phase7-aal1-${randomUUID()}`,
    label: "AAL1 must fail",
    href: "https://example.com/denied",
    icon: "test",
  });
  if (!deniedWrite.error) throw new Error(`${key} AAL1 write was accepted`);

  const protectedAtAal1 = await hostedRequest(
    profile.hostname,
    session.cookies,
    "/admin",
  );
  if (
    ![303, 307, 308].includes(protectedAtAal1.status) ||
    !protectedAtAal1.headers
      .get("location")
      ?.includes("/admin/login?error=mfa_required")
  ) {
    throw new Error(`${key} was not challenged for MFA by the hosted app`);
  }

  await elevateToAal2(session.client, required(profile.totpEnv));
  return {
    client: session.client,
    cookies: session.cookies,
    userId: signIn.data.user.id,
  };
}

async function expectJsonError(
  response: Response,
  status: number,
  error: string,
) {
  if (response.status !== status) {
    throw new Error(`Expected HTTP ${status}, received ${response.status}`);
  }
  const body = (await response.json()) as { error?: string };
  if (body.error !== error) {
    throw new Error(`Expected ${error}, received ${body.error ?? "no error"}`);
  }
}

async function main() {
  assertStagingTarget();
  const expectSubscription =
    process.env.ONZIO_PHASE7_EXPECT_SUBSCRIPTION === "1";
  const service = createServiceRoleClient();
  const onzio = service.schema("onzio");
  const { data: clubs, error: clubsError } = await onzio
    .from("clubs")
    .select("id,slug,lifecycle,public_access,tier")
    .in("slug", ["alpha", "bravo"]);
  if (clubsError || clubs?.length !== 2) {
    throw clubsError ?? new Error("Expected Alpha and Bravo staging clubs");
  }
  const clubBySlug = Object.fromEntries(clubs.map((club) => [club.slug, club]));
  const alphaId = clubBySlug.alpha.id as string;
  const bravoId = clubBySlug.bravo.id as string;
  const originalStates = clubs.map((club) => ({
    id: club.id,
    lifecycle: club.lifecycle,
    public_access: club.public_access,
    tier: club.tier,
  }));
  const insertedIds: Array<{ clubId: string; id: string }> = [];
  let bravoAdminRemoved = false;

  const { data: operatorUsers, error: operatorError } =
    await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (operatorError) throw operatorError;
  const operator = operatorUsers.users.find(
    (user) => user.email?.toLowerCase() === OPERATOR_EMAIL,
  );
  if (!operator) throw new Error("Synthetic operator was not found");
  if (required("ONZIO_OPERATOR_USER_IDS") !== operator.id) {
    throw new Error("Operator allowlist does not match the synthetic operator");
  }

  try {
    for (const club of originalStates) {
      const updated = await onzio
        .from("clubs")
        .update({ lifecycle: "active", public_access: "preview" })
        .eq("id", club.id);
      if (updated.error) throw updated.error;
    }

    const alphaOwner = await signInIdentity("alphaOwner", alphaId);
    const alphaAdmin = await signInIdentity("alphaAdmin", alphaId);
    const bravoOwner = await signInIdentity("bravoOwner", bravoId);
    const bravoAdmin = await signInIdentity("bravoAdmin", bravoId);

    const sessions = [
      ["alphaOwner", alphaOwner, alphaId, bravoId],
      ["alphaAdmin", alphaAdmin, alphaId, bravoId],
      ["bravoOwner", bravoOwner, bravoId, alphaId],
      ["bravoAdmin", bravoAdmin, bravoId, alphaId],
    ] as const;
    for (const [key, session, ownClubId, otherClubId] of sessions) {
      const ownId = `phase7-${key}-${randomUUID()}`;
      const ownWrite = await session.client.from("site_social_links").insert({
        club_id: ownClubId,
        id: ownId,
        label: `Phase 7 ${key}`,
        href: `https://example.com/${key}`,
        icon: "test",
      });
      if (ownWrite.error) throw ownWrite.error;
      insertedIds.push({ clubId: ownClubId, id: ownId });

      const crossWrite = await session.client.from("site_social_links").insert({
        club_id: otherClubId,
        id: `phase7-cross-${randomUUID()}`,
        label: "Cross-tenant write must fail",
        href: "https://example.com/cross",
        icon: "test",
      });
      if (!crossWrite.error) {
        throw new Error(`${key} cross-tenant write was accepted`);
      }

      const admin = await hostedRequest(
        identities[key].hostname,
        session.cookies,
        "/admin",
      );
      if (admin.status !== 200) {
        throw new Error(`${key} AAL2 hosted admin returned ${admin.status}`);
      }
    }

    const alphaRoot = await hostedRequest(
      identities.alphaOwner.hostname,
      alphaOwner.cookies,
      "/",
    );
    const bravoRoot = await hostedRequest(
      identities.bravoOwner.hostname,
      bravoOwner.cookies,
      "/",
    );
    if (
      alphaRoot.status !== 200 ||
      alphaRoot.headers.get("x-onzio-cache-tenant") !== alphaId ||
      bravoRoot.status !== 200 ||
      bravoRoot.headers.get("x-onzio-cache-tenant") !== bravoId
    ) {
      throw new Error("Tenant HTML routing/cache headers were not isolated");
    }

    const alphaRsc = await hostedRequest(
      identities.alphaOwner.hostname,
      alphaOwner.cookies,
      "/",
      { headers: { rsc: "1" } },
    );
    const bravoRsc = await hostedRequest(
      identities.bravoOwner.hostname,
      bravoOwner.cookies,
      "/",
      { headers: { rsc: "1" } },
    );
    if (
      alphaRsc.status !== 200 ||
      alphaRsc.headers.get("x-onzio-cache-tenant") !== alphaId ||
      bravoRsc.status !== 200 ||
      bravoRsc.headers.get("x-onzio-cache-tenant") !== bravoId
    ) {
      throw new Error("Tenant RSC cache headers were not isolated");
    }

    const crossHost = await hostedRequest(
      identities.bravoOwner.hostname,
      alphaOwner.cookies,
      "/",
    );
    if (crossHost.status !== 404) {
      throw new Error("Alpha session resolved Bravo private preview");
    }

    const starterProWrite = await bravoOwner.client
      .from("shop_kit_section")
      .insert({
        club_id: bravoId,
        surface: "shop",
        kit_variant: "home",
      });
    if (!starterProWrite.error) {
      throw new Error("Starter tenant mutated a Pro-only shop surface");
    }

    const adminCheckout = await hostedRequest(
      identities.alphaAdmin.hostname,
      alphaAdmin.cookies,
      "/api/stripe/checkout",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tier: "starter" }),
      },
    );
    await expectJsonError(adminCheckout, 403, "OWNER_REQUIRED");

    const ownerPortal = await hostedRequest(
      identities.alphaOwner.hostname,
      alphaOwner.cookies,
      "/api/stripe/portal",
      { method: "POST" },
    );
    let checkoutCreated = false;
    let portalCreated = false;
    if (expectSubscription) {
      const portalLocation = ownerPortal.headers.get("location");
      if (
        ownerPortal.status !== 303 ||
        !portalLocation ||
        new URL(portalLocation).hostname !== "billing.stripe.com"
      ) {
        throw new Error("Existing subscriber did not reach Customer Portal");
      }
      portalCreated = true;
    } else {
      await expectJsonError(ownerPortal, 403, "STRIPE_CUSTOMER_REQUIRED");

      const ownerCheckout = await hostedRequest(
        identities.alphaOwner.hostname,
        alphaOwner.cookies,
        "/api/stripe/checkout",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tier: "starter" }),
        },
      );
      const checkoutLocation = ownerCheckout.headers.get("location");
      if (
        ownerCheckout.status !== 303 ||
        !checkoutLocation ||
        new URL(checkoutLocation).hostname !== "checkout.stripe.com"
      ) {
        throw new Error("Owner Checkout did not create a Stripe-hosted session");
      }
      checkoutCreated = true;
    }

    await removeClubMembership({
      clubId: bravoId,
      actorId: operator.id,
      userId: bravoAdmin.userId,
    });
    bravoAdminRemoved = true;
    const removedWrite = await bravoAdmin.client
      .from("site_social_links")
      .insert({
        club_id: bravoId,
        id: `phase7-removed-${randomUUID()}`,
        label: "Removed member must fail",
        href: "https://example.com/removed",
        icon: "test",
      });
    if (!removedWrite.error) {
      throw new Error("Removed member retained write access");
    }
    const removedAdmin = await hostedRequest(
      identities.bravoAdmin.hostname,
      bravoAdmin.cookies,
      "/admin",
    );
    if (
      ![303, 307, 308].includes(removedAdmin.status) ||
      !removedAdmin.headers
        .get("location")
        ?.includes("/admin/login?error=not_authorized")
    ) {
      throw new Error("Removed member retained hosted admin access");
    }

    await addClubMembership({
      clubId: bravoId,
      actorId: operator.id,
      userId: bravoAdmin.userId,
      userEmail: identities.bravoAdmin.email,
      role: "admin",
    });
    bravoAdminRemoved = false;

    console.log(
      JSON.stringify({
        event: "phase7.hosted_auth_verified",
        projectRef: EXPECTED_PROJECT_REF,
        aal1Rejected: true,
        aal2Accepted: true,
        tenantHtmlAndRscIsolated: true,
        crossTenantReadWriteRejected: true,
        starterProFeatureRejected: true,
        adminBillingRejected: true,
        ownerCheckoutCreated: checkoutCreated,
        portalRequiresSubscription: !expectSubscription,
        ownerPortalCreated: portalCreated,
        removedMemberRevokedImmediately: true,
      }),
    );
  } finally {
    if (bravoAdminRemoved) {
      const { data: bravoAdminUsers } = await service.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      const bravoAdmin = bravoAdminUsers.users.find(
        (user) => user.email?.toLowerCase() === identities.bravoAdmin.email,
      );
      if (bravoAdmin) {
        await addClubMembership({
          clubId: bravoId,
          actorId: operator.id,
          userId: bravoAdmin.id,
          userEmail: identities.bravoAdmin.email,
          role: "admin",
        });
      }
    }
    for (const record of insertedIds) {
      await onzio
        .from("site_social_links")
        .delete()
        .eq("club_id", record.clubId)
        .eq("id", record.id);
    }
    for (const club of originalStates) {
      await onzio
        .from("clubs")
        .update({
          lifecycle: club.lifecycle,
          public_access: club.public_access,
          tier: club.tier,
        })
        .eq("id", club.id);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
