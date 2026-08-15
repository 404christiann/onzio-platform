// Lions Football Club production tenant provisioning.
//
// Structural twin of scripts/provision-diverse-city-production.ts (DCFC-801),
// with Lions' identity substituted. Same guards, same interactive operator
// auth, same single provisionClub() call. Christian runs this himself; no
// operator credential or token ever passes through an assisting agent.
//
// What provisionClub() writes, in one transaction-with-rollback:
//   onzio.clubs          lifecycle=onboarding, public_access=preview,
//                        tier=starter, kind=customer, stripe_price_id=null
//   onzio.club_domains   the private hostname below, is_primary/active/verified
//   onzio.club_members   the owner below, role=owner, status=active
//   onzio.audit_events   one operation=provision row, actor_type=operator
// and sends one real owner sign-in-code email to OWNER_EMAIL. Any failure
// after the clubs insert rolls all of it back; two DCFC-801 attempts failed
// this way and left zero orphaned rows, verified read-only.
//
// Deliberately NOT done here: content/media import, presentation template
// selection (editorial@1), tier promotion to pro, store_enabled, and Vercel
// hostname attachment. Lions' local row is tier=pro/store_enabled=true/
// lifecycle=active, but this script creates the pre-billing onboarding row
// only — matching the arc DCFC went through. Each of those is a separate
// action needing its own approval.
import { config as loadEnv } from "dotenv";
import { provisionClub } from "@/lib/operator/provision-club";
import { acquireOperatorAccessToken } from "@/scripts/operator-session";

loadEnv({ path: ".env.local", quiet: true });

const EXPECTED_PROJECT_REF = "ioalthwsdrlzrubomrow";
const SLUG = "lions";
const NAME = "Lions Football Club";
const PRIMARY_DOMAIN = "lions-fc-private.vercel.app";
const OWNER_EMAIL = "christianjavieralcala@gmail.com";
// Christian's existing production operator Auth user, reused as owner exactly
// as DCFC-801 did. Passing this avoids the "user already registered" failure
// that hits when the operator email and the owner email are the same account.
const EXISTING_OWNER_AUTH_USER_ID = "199d8437-1237-4098-99dd-8b089411255e";
const CONFIRMATION = `lions-prod-provision:${EXPECTED_PROJECT_REF}:${SLUG}`;

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
    throw new Error("Refusing to provision against an unexpected Supabase project");
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

  const COOLDOWN_SECONDS = 70;
  process.stderr.write(
    `${JSON.stringify({
      stage: "waiting_for_email_rate_limit_cooldown",
      seconds: COOLDOWN_SECONDS,
      reason:
        "Supabase throttles repeated OTP sends to the same email; waiting so the owner-invite send below doesn't collide with your operator sign-in send.",
    })}\n`,
  );
  await new Promise((resolve) => setTimeout(resolve, COOLDOWN_SECONDS * 1000));
  process.stderr.write(`${JSON.stringify({ stage: "cooldown_complete" })}\n`);

  const result = await provisionClub({
    slug: SLUG,
    name: NAME,
    primaryDomain: PRIMARY_DOMAIN,
    kind: "customer",
    ownerEmail: OWNER_EMAIL,
    existingAuthUserId: EXISTING_OWNER_AUTH_USER_ID,
    operatorAccessToken,
    environment: "production",
  });

  process.stdout.write(
    JSON.stringify({
      projectRef: EXPECTED_PROJECT_REF,
      club: result.club,
      domain: result.domain,
      owner: {
        email: OWNER_EMAIL,
        role: (result.owner as { role: string }).role,
        authUserCreated: (result.owner as { authUserCreated: boolean })
          .authUserCreated,
        codeSent: (result.owner as { codeSent: boolean }).codeSent,
      },
      public: result.public,
      committed: result.committed,
    }) + "\n",
  );
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
