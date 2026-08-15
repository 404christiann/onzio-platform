import { config as loadEnv } from "dotenv";
import { attachClubDomain } from "@/lib/operator/attach-club-domain";
import { acquireOperatorAccessToken } from "@/scripts/operator-session";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Attaches columbuslionsfc.com to Lions Football Club in production.
 * Structural twin of scripts/attach-diversecityfc-domain-production.ts.
 *
 * The Vercel half is already done (2026-08-15): both hostnames are registered
 * as project domains on `onzio-platform` and aliased to the production
 * deployment, and both currently return the application's own 404 because no
 * club_domains row resolves them yet. This script is the Supabase half. Until
 * it runs, the domain is served by Vercel but is not a tenant.
 *
 * Registering both as PROJECT domains rather than bare aliases matters: the
 * project runs Vercel Authentication with
 * `deploymentType: all_except_custom_domains`, so an unregistered hostname
 * 302s every visitor to a Vercel login page. www hit exactly that until it
 * was registered too.
 *
 * ORDER MATTERS, and this script should run BEFORE the owner invite.
 * lib/operator/invite-club-member.ts derives its callback URL from the club's
 * verified primary domain, and app/api/stripe/checkout builds success_url and
 * cancel_url the same way. Invite first and the real Lions contact receives a
 * sign-in link pointing at lions-fc-private.vercel.app, and their Stripe
 * receipt returns them there too.
 */
const EXPECTED_PROJECT_REF = "ioalthwsdrlzrubomrow";
// Lions Football Club, provisioned 2026-08-15.
const CLUB_ID = "3b6b71dc-b27a-4f39-bbee-a95ae9d6bf52";

// Apex first, as primary — its callback and canonical URLs become this
// domain, and attachClubDomain demotes the previous primary
// (lions-fc-private.vercel.app) under the
// club_domains_one_active_primary_per_environment partial unique index,
// rolling back on conflict. The private hostname keeps working; it is
// demoted, not removed, exactly as diverse-city-fc-private.vercel.app was.
//
// www second, non-primary — it is aliased to the same deployment rather than
// redirected, so it needs its own verified row or it 404s at the
// tenant-resolution layer.
const DOMAINS: Array<{ hostname: string; makePrimary: boolean }> = [
  { hostname: "columbuslionsfc.com", makePrimary: true },
  { hostname: "www.columbuslionsfc.com", makePrimary: false },
];

const CONFIRMATION = `lions-domain-attach:${EXPECTED_PROJECT_REF}:${CLUB_ID}`;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertTarget(): void {
  if (process.argv[2] !== CONFIRMATION) {
    throw new Error(`Confirmation must equal ${CONFIRMATION}`);
  }
  if (required("ONZIO_ENVIRONMENT") !== "production") {
    throw new Error("ONZIO_ENVIRONMENT must equal production");
  }
  const url = new URL(required("NEXT_PUBLIC_SUPABASE_URL"));
  if (url.protocol !== "https:" || url.hostname !== `${EXPECTED_PROJECT_REF}.supabase.co`) {
    throw new Error("Refusing to run against an unexpected Supabase project");
  }
  if (!required("SUPABASE_SERVICE_ROLE_KEY").startsWith("sb_secret_")) {
    throw new Error("A modern production Supabase secret key is required");
  }
  const actorIds = required("ONZIO_OPERATOR_USER_IDS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (actorIds.length !== 1) {
    throw new Error("Exactly one production operator actor must be configured");
  }
}

async function main() {
  process.stderr.write(`${JSON.stringify({ stage: "runner_started" })}\n`);
  assertTarget();
  process.stderr.write(`${JSON.stringify({ stage: "target_verified" })}\n`);
  const operatorAccessToken = await acquireOperatorAccessToken();
  process.stderr.write(`${JSON.stringify({ stage: "operator_authorized" })}\n`);

  const results = [];
  for (const domain of DOMAINS) {
    process.stderr.write(
      `${JSON.stringify({ stage: "attaching", hostname: domain.hostname })}\n`,
    );
    const result = await attachClubDomain({
      clubId: CLUB_ID,
      operatorAccessToken,
      hostname: domain.hostname,
      environment: "production",
      makePrimary: domain.makePrimary,
    });
    results.push(result);
    process.stderr.write(
      `${JSON.stringify({ stage: "attached", hostname: domain.hostname, result })}\n`,
    );
  }

  process.stdout.write(
    JSON.stringify({
      projectRef: EXPECTED_PROJECT_REF,
      clubId: CLUB_ID,
      domains: results,
    }) + "\n",
  );
}

main().catch((error) => {
  process.stderr.write(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      projectRef: EXPECTED_PROJECT_REF,
      clubId: CLUB_ID,
    }) + "\n",
  );
  process.exitCode = 1;
});
