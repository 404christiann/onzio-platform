import { config as loadEnv } from "dotenv";
import { addClubMembership } from "@/lib/operator/manage-membership";
import { acquireOperatorAccessToken } from "@/scripts/operator-session";

loadEnv({ path: ".env.local", quiet: true });

const EXPECTED_PROJECT_REF = "fxefqnoqxbezeccjvrsw";
const TARGET_CLUB_ID = "d88bf71b-9820-49ae-9dc0-7556b0813885"; // Diverse City
const TARGET_USER_ID = "522d90c2-4130-405b-8ed4-47de731dfa03"; // reused identity, same as DCFC-601's temporary admin
const TARGET_USER_EMAIL = "christianalcala3@yahoo.com";
const CONFIRMATION = `dcfc-602-add-admin:${EXPECTED_PROJECT_REF}:${TARGET_CLUB_ID}`;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertTarget(): void {
  if (process.argv[2] !== CONFIRMATION) {
    throw new Error(`Confirmation must equal ${CONFIRMATION}`);
  }
  if (required("ONZIO_ENVIRONMENT") !== "staging") {
    throw new Error("ONZIO_ENVIRONMENT must equal staging");
  }
  const url = new URL(required("NEXT_PUBLIC_SUPABASE_URL"));
  if (
    url.protocol !== "https:" ||
    url.hostname !== `${EXPECTED_PROJECT_REF}.supabase.co`
  ) {
    throw new Error("Refusing to mutate against an unexpected Supabase project");
  }
  if (!required("SUPABASE_SERVICE_ROLE_KEY").startsWith("sb_secret_")) {
    throw new Error("A modern staging Supabase secret key is required");
  }
  const actorIds = required("ONZIO_OPERATOR_USER_IDS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (actorIds.length !== 1) {
    throw new Error("Exactly one staging operator actor must be configured");
  }
}

async function main() {
  process.stderr.write(`${JSON.stringify({ stage: "runner_started" })}\n`);
  assertTarget();
  process.stderr.write(`${JSON.stringify({ stage: "target_verified" })}\n`);
  const operatorAccessToken = await acquireOperatorAccessToken();
  process.stderr.write(`${JSON.stringify({ stage: "operator_authorized" })}\n`);
  const result = await addClubMembership({
    clubId: TARGET_CLUB_ID,
    operatorAccessToken,
    userId: TARGET_USER_ID,
    userEmail: TARGET_USER_EMAIL,
    role: "admin",
  });
  process.stdout.write(
    JSON.stringify({
      projectRef: EXPECTED_PROJECT_REF,
      clubId: result.clubId,
      userId: result.userId,
      role: result.role,
      status: result.status,
      audited: result.audited,
    }) + "\n",
  );
}

main().catch((error) => {
  process.stderr.write(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      projectRef: EXPECTED_PROJECT_REF,
      clubId: TARGET_CLUB_ID,
    }) + "\n",
  );
  process.exitCode = 1;
});
