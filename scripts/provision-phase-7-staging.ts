import { createHmac } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import WebSocket from "ws";
import { addClubMembership } from "@/lib/operator/manage-membership";
import { provisionClub } from "@/lib/operator/provision-club";
import { createServiceRoleClient } from "@/lib/supabase-service-role";

const EXPECTED_PROJECT_REF = "fxefqnoqxbezeccjvrsw";
const CONFIRMATION = `phase-7:${EXPECTED_PROJECT_REF}`;

const identities = {
  operator: {
    email: "onzio.phase7.operator@example.com",
    passwordEnv: "ONZIO_PHASE7_OPERATOR_PASSWORD",
    mfa: false,
  },
  alphaOwner: {
    email: "onzio.phase7.alpha.owner@example.com",
    passwordEnv: "ONZIO_PHASE7_ALPHA_OWNER_PASSWORD",
    mfa: true,
  },
  alphaAdmin: {
    email: "onzio.phase7.alpha.admin@example.com",
    passwordEnv: "ONZIO_PHASE7_ALPHA_ADMIN_PASSWORD",
    mfa: true,
  },
  bravoOwner: {
    email: "onzio.phase7.bravo.owner@example.com",
    passwordEnv: "ONZIO_PHASE7_BRAVO_OWNER_PASSWORD",
    mfa: true,
  },
  bravoAdmin: {
    email: "onzio.phase7.bravo.admin@example.com",
    passwordEnv: "ONZIO_PHASE7_BRAVO_ADMIN_PASSWORD",
    mfa: true,
  },
} as const;

type IdentityKey = keyof typeof identities;

const clubs = {
  alpha: {
    slug: "alpha",
    name: "Alpha FC",
    hostname: "alpha-onzio-staging.vercel.app",
    owner: "alphaOwner" as const,
    admin: "alphaAdmin" as const,
  },
  bravo: {
    slug: "bravo",
    name: "Bravo FC",
    hostname: "bravo-onzio-staging.vercel.app",
    owner: "bravoOwner" as const,
    admin: "bravoAdmin" as const,
  },
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertStagingTarget() {
  if (required("ONZIO_PHASE7_CONFIRM") !== CONFIRMATION) {
    throw new Error(`ONZIO_PHASE7_CONFIRM must equal ${CONFIRMATION}`);
  }
  if (process.env.ONZIO_ENVIRONMENT !== "staging") {
    throw new Error("ONZIO_ENVIRONMENT must equal staging");
  }

  const url = new URL(required("NEXT_PUBLIC_SUPABASE_URL"));
  if (
    url.protocol !== "https:" ||
    url.hostname !== `${EXPECTED_PROJECT_REF}.supabase.co`
  ) {
    throw new Error("Refusing to provision an unexpected Supabase project");
  }
  if (!required("SUPABASE_SERVICE_ROLE_KEY").startsWith("sb_secret_")) {
    throw new Error("A modern staging Supabase secret key is required");
  }
  if (!required("NEXT_PUBLIC_SUPABASE_ANON_KEY").startsWith("sb_publishable_")) {
    throw new Error("A modern staging Supabase publishable key is required");
  }
}

function credentialOutputPath(): string {
  const output = resolve(required("ONZIO_PHASE7_TOTP_OUTPUT"));
  const temporaryRoot = resolve(tmpdir()) + sep;
  if (!output.startsWith(temporaryRoot)) {
    throw new Error("ONZIO_PHASE7_TOTP_OUTPUT must be inside the system temp directory");
  }
  return output;
}

async function ensureAuthUser(
  client: ReturnType<typeof createServiceRoleClient>,
  key: IdentityKey,
): Promise<User> {
  const profile = identities[key];
  const password = required(profile.passwordEnv);
  const { data: users, error: listError } = await client.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw listError;

  const existing = users.users.find(
    (user) => user.email?.toLowerCase() === profile.email,
  );
  if (existing) {
    const { data, error } = await client.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      app_metadata: {
        ...existing.app_metadata,
        onzio_environment: "staging",
        onzio_phase7_identity: key,
      },
    });
    if (error || !data.user) {
      throw error ?? new Error(`Unable to update ${key}`);
    }
    return data.user;
  }

  const { data, error } = await client.auth.admin.createUser({
    email: profile.email,
    password,
    email_confirm: true,
    app_metadata: {
      onzio_environment: "staging",
      onzio_phase7_identity: key,
    },
  });
  if (error || !data.user) {
    throw error ?? new Error(`Unable to create ${key}`);
  }
  return data.user;
}

async function ensureClub(
  client: ReturnType<typeof createServiceRoleClient>,
  input: (typeof clubs)[keyof typeof clubs],
  users: Record<IdentityKey, User>,
) {
  const onzio = client.schema("onzio");
  const { data: existing, error: existingError } = await onzio
    .from("clubs")
    .select("id,slug,name,lifecycle,public_access")
    .eq("slug", input.slug)
    .maybeSingle();
  if (existingError) throw existingError;

  let clubId: string;
  if (existing) {
    if (
      existing.name !== input.name ||
      existing.lifecycle === "archived" ||
      existing.public_access !== "preview"
    ) {
      throw new Error(`Existing ${input.slug} club does not match Phase 7`);
    }
    clubId = existing.id;
  } else {
    const provisioned = await provisionClub({
      slug: input.slug,
      name: input.name,
      primaryDomain: input.hostname,
      ownerEmail: identities[input.owner].email,
      actorId: users.operator.id,
      existingAuthUserId: users[input.owner].id,
      environment: "staging",
    });
    clubId = provisioned.club.id;
  }

  const { data: domain, error: domainError } = await onzio
    .from("club_domains")
    .select("hostname,environment,active,verified_at")
    .eq("club_id", clubId)
    .eq("hostname", input.hostname)
    .maybeSingle();
  if (
    domainError ||
    !domain ||
    domain.environment !== "staging" ||
    !domain.active ||
    !domain.verified_at
  ) {
    throw domainError ?? new Error(`Invalid ${input.slug} staging domain`);
  }

  const { data: adminMembership, error: membershipError } = await onzio
    .from("club_members")
    .select("role,status")
    .eq("club_id", clubId)
    .eq("user_id", users[input.admin].id)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (adminMembership?.role !== "admin" || adminMembership.status !== "active") {
    await addClubMembership({
      clubId,
      actorId: users.operator.id,
      userId: users[input.admin].id,
      userEmail: identities[input.admin].email,
      role: "admin",
    });
  }

  return {
    id: clubId,
    slug: input.slug,
    hostname: input.hostname,
    ownerUserId: users[input.owner].id,
    adminUserId: users[input.admin].id,
  };
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
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret))
    .update(buffer)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

async function enrollMfa(
  key: IdentityKey,
  output: Partial<Record<IdentityKey, string>>,
) {
  if (!identities[key].mfa) return;
  const client: SupabaseClient = createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      realtime: {
        transport: WebSocket as unknown as typeof globalThis.WebSocket,
      },
    },
  );
  const { error: signInError } = await client.auth.signInWithPassword({
    email: identities[key].email,
    password: required(identities[key].passwordEnv),
  });
  if (signInError) throw signInError;

  const { data: factorData, error: factorError } =
    await client.auth.mfa.listFactors();
  if (factorError) throw factorError;
  if (factorData.totp.some((factor) => factor.status === "verified")) {
    return;
  }

  const { data: enrollment, error: enrollmentError } =
    await client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Onzio Phase 7 ${key}`,
    });
  if (enrollmentError) throw enrollmentError;

  const secret = enrollment.totp.secret;
  const { data: challenge, error: challengeError } =
    await client.auth.mfa.challenge({ factorId: enrollment.id });
  if (challengeError) throw challengeError;
  const { error: verifyError } = await client.auth.mfa.verify({
    factorId: enrollment.id,
    challengeId: challenge.id,
    code: currentTotp(secret),
  });
  if (verifyError) throw verifyError;

  const { data: assurance, error: assuranceError } =
    await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError || assurance.currentLevel !== "aal2") {
    throw assuranceError ?? new Error(`${key} did not reach AAL2`);
  }
  output[key] = secret;
  await writeFile(credentialOutputPath(), JSON.stringify(output), {
    mode: 0o600,
  });
  await client.auth.signOut();
}

async function main() {
  assertStagingTarget();
  const client = createServiceRoleClient();
  const users = {} as Record<IdentityKey, User>;
  for (const key of Object.keys(identities) as IdentityKey[]) {
    users[key] = await ensureAuthUser(client, key);
  }

  process.env.ONZIO_OPERATOR_USER_IDS = users.operator.id;
  const provisionedClubs = [];
  for (const club of Object.values(clubs)) {
    provisionedClubs.push(await ensureClub(client, club, users));
  }

  const totpSecrets: Partial<Record<IdentityKey, string>> = {};
  await writeFile(credentialOutputPath(), JSON.stringify(totpSecrets), {
    mode: 0o600,
  });
  for (const key of Object.keys(identities) as IdentityKey[]) {
    await enrollMfa(key, totpSecrets);
  }

  console.log(
    JSON.stringify({
      event: "phase7.staging_provisioned",
      projectRef: EXPECTED_PROJECT_REF,
      operatorUserId: users.operator.id,
      users: Object.fromEntries(
        (Object.keys(identities) as IdentityKey[]).map((key) => [
          key,
          { id: users[key].id, email: identities[key].email },
        ]),
      ),
      clubs: provisionedClubs,
      mfaEnrolled: (Object.keys(identities) as IdentityKey[]).filter(
        (key) => identities[key].mfa,
      ),
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
