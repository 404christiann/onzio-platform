import { config as loadEnv } from "dotenv";
import { inviteClubMember } from "@/lib/operator/invite-club-member";
import { acquireOperatorAccessToken } from "@/scripts/operator-session";

loadEnv({ path: ".env.local", quiet: true });

// DCFC-803: "Production private Auth/admin acceptance" — invites the real
// Diverse City FC owner into production as `role: "owner"`. Per DCFC-D113
// (docs/phase-11/diverse-city/DECISIONS.md), the designed end state is
// exactly one owner — the real one, adding admins himself through the
// Team Access flow (PLAT-101) rather than Onzio provisioning any. Christian
// currently holds `owner` on this club from the DCFC-801 provisioning step;
// removing that placeholder membership so only the real owner remains is a
// deliberately SEPARATE follow-up action, not run by this script.
const EXPECTED_PROJECT_REF = "ioalthwsdrlzrubomrow";
const TARGET_CLUB_ID = "d7a41762-5158-496e-b415-c83c01ab5c70";
// diversecityfc.com became the verified primary production domain for this
// club today (scripts/attach-diversecityfc-domain-production.ts) — the
// invite's callback URL is derived from that domain, so this must match.
const EXPECTED_CALLBACK = "https://diversecityfc.com/admin/auth/callback";
const CONFIRMATION = `dcfc-803-invite:${EXPECTED_PROJECT_REF}:${TARGET_CLUB_ID}`;

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
    throw new Error("Refusing to invite against an unexpected Supabase project");
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

// Never hardcode the owner's real email in a file that gets committed —
// read it privately from stdin at run time, same as the staging template.
async function readPrivateEmail(): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.off("error", onError);
      process.stdin.destroy();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onData = (chunk: string) => {
      value += chunk;
      const newline = value.indexOf("\n");
      if (newline < 0) return;
      cleanup();
      const email = value.slice(0, newline).trim();
      if (!email) {
        reject(new Error("A private recipient must be supplied on stdin"));
        return;
      }
      resolve(email);
    };

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", onData);
    process.stdin.on("error", onError);
    process.stdin.resume();
  });
}

async function main() {
  process.stderr.write(`${JSON.stringify({ stage: "runner_started" })}\n`);
  assertTarget();
  process.stderr.write(`${JSON.stringify({ stage: "target_verified" })}\n`);
  const operatorAccessToken = await acquireOperatorAccessToken();
  process.stderr.write(`${JSON.stringify({ stage: "operator_authorized" })}\n`);
  const email = await readPrivateEmail();
  process.stderr.write(`${JSON.stringify({ stage: "private_recipient_loaded" })}\n`);
  const result = await inviteClubMember({
    clubId: TARGET_CLUB_ID,
    operatorAccessToken,
    email,
    role: "owner",
    environment: "production",
    dependencies: {
      onStage(stage) {
        process.stderr.write(`${JSON.stringify({ stage })}\n`);
      },
    },
  });
  if (result.callbackUrl !== EXPECTED_CALLBACK) {
    throw new Error(
      `Verified tenant callback did not match the approved target (got ${result.callbackUrl})`,
    );
  }
  process.stdout.write(
    JSON.stringify({
      projectRef: EXPECTED_PROJECT_REF,
      clubId: TARGET_CLUB_ID,
      recipientDomain: email.split("@")[1]?.toLowerCase(),
      role: result.role,
      callbackUrl: result.callbackUrl,
      authUserCreated: result.authUserCreated,
      codeSent: result.codeSent,
      membershipActive: result.membershipActive,
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
