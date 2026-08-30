import { config as loadEnv } from "dotenv";
import { provisionClub } from "@/lib/operator/provision-club";
import { acquireOperatorAccessToken } from "@/scripts/operator-session";

loadEnv({ path: ".env.local", quiet: true });

const EXPECTED_PROJECT_REF = "ioalthwsdrlzrubomrow";
const SLUG = "diverse-city";
const NAME = "Diverse City FC";
const PRIMARY_DOMAIN = "diverse-city-fc-private.vercel.app";
const OWNER_EMAIL = "christianjavieralcala@gmail.com";
const EXISTING_OWNER_AUTH_USER_ID = "199d8437-1237-4098-99dd-8b089411255e";
const CONFIRMATION = `dcfc-801-provision:${EXPECTED_PROJECT_REF}:${SLUG}`;

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
