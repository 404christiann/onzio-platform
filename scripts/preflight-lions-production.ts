// Read-only pre-flight for scripts/provision-lions-production.ts.
//
// Provisioning is safe to attempt blind — provisionClub() rolls back cleanly on
// a slug or hostname conflict, proven twice for real during DCFC-801. But every
// attempt spends a real owner sign-in-code email against Supabase's ~60s
// per-email OTP cooldown, and DCFC-801 burned two attempts that way. This
// script answers the questions that cause those failures, before any of it
// starts: does the slug exist, does the hostname exist, does the owner Auth
// user resolve, and is the operator actor configured.
//
// Reads only. Performs zero inserts, updates, deletes, or email sends.
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

loadEnv({ path: ".env.local", quiet: true });

const EXPECTED_PROJECT_REF = "ioalthwsdrlzrubomrow";
const SLUG = "lions";
const PRIMARY_DOMAIN = "lions-fc-private.vercel.app";
const OWNER_EMAIL = "christianjavieralcala@gmail.com";
const EXISTING_OWNER_AUTH_USER_ID = "199d8437-1237-4098-99dd-8b089411255e";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertTarget(): void {
  if (required("ONZIO_ENVIRONMENT") !== "production") {
    throw new Error("ONZIO_ENVIRONMENT must equal production");
  }
  const url = new URL(required("NEXT_PUBLIC_SUPABASE_URL"));
  if (url.protocol !== "https:" || url.hostname !== `${EXPECTED_PROJECT_REF}.supabase.co`) {
    throw new Error("Refusing to read from an unexpected Supabase project");
  }
  if (!required("SUPABASE_SERVICE_ROLE_KEY").startsWith("sb_secret_")) {
    throw new Error("A modern production Supabase secret key is required");
  }
}

async function main() {
  assertTarget();

  const client = createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: {
        transport: WebSocket as unknown as typeof globalThis.WebSocket,
      },
    },
  );

  const blockers: string[] = [];

  const slugRow = await client
    .schema("onzio")
    .from("clubs")
    .select("id, slug, name, lifecycle, public_access, tier, kind")
    .eq("slug", SLUG)
    .maybeSingle();
  if (slugRow.error) throw slugRow.error;
  if (slugRow.data) {
    blockers.push(
      `A club with slug "${SLUG}" already exists (id ${slugRow.data.id}). Provisioning would fail with SLUG_CONFLICT.`,
    );
  }

  const domainRow = await client
    .schema("onzio")
    .from("club_domains")
    .select("club_id, hostname, is_primary, active, environment")
    .eq("hostname", PRIMARY_DOMAIN)
    .maybeSingle();
  if (domainRow.error) throw domainRow.error;
  if (domainRow.data) {
    blockers.push(
      `Hostname "${PRIMARY_DOMAIN}" is already claimed by club ${domainRow.data.club_id}. Provisioning would fail with DOMAIN_CONFLICT.`,
    );
  }

  const owner = await client.auth.admin.getUserById(EXISTING_OWNER_AUTH_USER_ID);
  if (owner.error || !owner.data.user) {
    blockers.push(
      `Owner Auth user ${EXISTING_OWNER_AUTH_USER_ID} does not resolve on this project. Provisioning would fail with AUTH_USER_NOT_FOUND.`,
    );
  } else if (owner.data.user.email?.toLowerCase() !== OWNER_EMAIL) {
    blockers.push(
      `Owner Auth user ${EXISTING_OWNER_AUTH_USER_ID} has email "${owner.data.user.email}", not "${OWNER_EMAIL}". Provisioning would fail with AUTH_EMAIL_MISMATCH.`,
    );
  }

  const actorIds = (process.env.ONZIO_OPERATOR_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (actorIds.length !== 1) {
    blockers.push(
      `ONZIO_OPERATOR_USER_IDS must contain exactly one actor, found ${actorIds.length}.`,
    );
  }

  // Not a blocker for provisioning itself — the clubs insert names no column
  // from the pending migrations — but the tenant cannot become an editorial@1
  // club until 20260812120000 lands, so surface the state either way.
  const storeEnabledProbe = await client
    .schema("onzio")
    .from("clubs")
    .select("store_enabled")
    .limit(1);

  process.stdout.write(
    JSON.stringify(
      {
        projectRef: EXPECTED_PROJECT_REF,
        slugAvailable: !slugRow.data,
        hostnameAvailable: !domainRow.data,
        ownerResolves: Boolean(owner.data?.user) && !owner.error,
        operatorActorsConfigured: actorIds.length,
        clubStoreEnabledColumnPresent: !storeEnabledProbe.error,
        readyToProvision: blockers.length === 0,
        blockers,
      },
      null,
      2,
    ) + "\n",
  );

  if (blockers.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      projectRef: EXPECTED_PROJECT_REF,
      slug: SLUG,
    }) + "\n",
  );
  process.exitCode = 1;
});
