import { config as loadEnv } from "dotenv";
import { attachClubDomain } from "@/lib/operator/attach-club-domain";
import { acquireOperatorAccessToken } from "@/scripts/operator-session";

loadEnv({ path: ".env.local", quiet: true });

const EXPECTED_PROJECT_REF = "ioalthwsdrlzrubomrow";
// Diverse City FC, production — from HANDOFF.md's 2026-08-07 DCFC-801 entry
// ("club d7a41762-5158-496e-b415-c83c01ab5c70, slug diverse-city").
const CLUB_ID = "d7a41762-5158-496e-b415-c83c01ab5c70";

// Apex first, as primary — its callback/canonical URLs become this domain.
// www second, non-primary — it's aliased to the same Vercel deployment as
// the apex (confirmed via `vercel alias ls`, not a redirect), so it needs
// its own verified row too or it 404s at the tenant-resolution layer.
const DOMAINS: Array<{ hostname: string; makePrimary: boolean }> = [
  { hostname: "diversecityfc.com", makePrimary: true },
  { hostname: "www.diversecityfc.com", makePrimary: false },
];

const CONFIRMATION = `dcfc-domain-attach:${EXPECTED_PROJECT_REF}:${CLUB_ID}`;

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
