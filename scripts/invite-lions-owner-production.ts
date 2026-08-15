import { config as loadEnv } from "dotenv";
import { inviteClubMember } from "@/lib/operator/invite-club-member";
import { acquireOperatorAccessToken } from "@/scripts/operator-session";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Invites the real Lions Football Club contact into production as
 * `role: "owner"`. Structural twin of
 * scripts/invite-diverse-city-owner-production.ts.
 *
 * RUN scripts/attach-lions-domain-production.ts FIRST. inviteClubMember
 * derives the sign-in callback from the club's verified primary domain, and
 * this script hard-fails if that callback is not EXPECTED_CALLBACK below.
 * That assertion is the point: run the invite while
 * lions-fc-private.vercel.app is still primary and the real club owner
 * receives a sign-in link — and later a Stripe success_url — pointing at an
 * internal validation hostname instead of their own domain.
 *
 * THE RECIPIENT MUST NOT BE CHRISTIAN'S OWN ADDRESS. inviteClubMember's
 * assertEmailIsNew pages the entire Auth user list and rejects any address
 * that already resolves, with AUTH_IDENTITY_EXISTS. Christian's address is
 * already the Lions owner Auth user from provisioning, so reusing it fails.
 *
 * Christian currently holds `owner` on this club from the provisioning step.
 * This script adds the real contact as a second owner and does NOT remove
 * that membership — matching DCFC-D133, where Christian deliberately stayed
 * co-owner rather than the original one-owner-only plan. Removing it is a
 * separate, deliberate action.
 *
 * This sends a REAL sign-in email to a REAL person. It is the first point in
 * the Lions launch where someone outside Onzio is contacted, so run it only
 * when the club is genuinely ready to be handed over: content reviewed,
 * store decision made, and clubs.stripe_price_id set — otherwise their first
 * action, clicking "Start subscription", fails with STRIPE_PRICE_REQUIRED.
 */
const EXPECTED_PROJECT_REF = "ioalthwsdrlzrubomrow";
const TARGET_CLUB_ID = "3b6b71dc-b27a-4f39-bbee-a95ae9d6bf52";
// Set by scripts/attach-lions-domain-production.ts, which promotes the apex
// to verified primary. Until that has run, this assertion will fail — by
// design, see the header.
const EXPECTED_CALLBACK = "https://columbuslionsfc.com/admin/auth/callback";
const CONFIRMATION = `lions-invite:${EXPECTED_PROJECT_REF}:${TARGET_CLUB_ID}`;

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

// Never hardcode the owner's real email in a committed file — read it
// privately from stdin at run time. Only the address's DOMAIN is ever
// printed or audited.
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
      `Verified tenant callback did not match the approved target (got ${result.callbackUrl}). ` +
        "Run scripts/attach-lions-domain-production.ts first so columbuslionsfc.com is the verified primary domain.",
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
