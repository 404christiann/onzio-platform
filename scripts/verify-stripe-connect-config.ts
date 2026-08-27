import { stdout } from "node:process";
import { loadEnvConfig } from "@next/env";
import { verifyStripeConnectConfiguration } from "@/lib/stripe-connect-verification";

// Read-only Stripe Connect acceptance check. Run before any first-time-live
// Connect work and after any Connect-related Vercel environment variable
// change, with the target environment's variables exported
// (ONZIO_ENVIRONMENT, STRIPE_SECRET_KEY, STRIPE_CONNECT_WEBHOOK_SECRET).
// It validates the shared Connect runtime configuration (key mode must match
// ONZIO_ENVIRONMENT), then lists connected accounts read-only: any existing
// live connected account proves the one-time platform Connect profile
// questionnaire is complete, while zero accounts is reported as
// INDETERMINATE — confirm the questionnaire manually at
// https://dashboard.stripe.com/connect/settings/profile before onboarding
// the first club (see docs/stripe-live-go-live-checklist.md). It also
// best-effort checks that a webhook endpoint for /api/stripe/connect-webhook
// is API-visible. It creates, mutates, and deletes nothing, and never prints
// a secret. It deliberately contains no account-creation probe: a successful
// live probe would strand an undeletable live Standard connected account.
async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  stdout.write(
    "Read-only: validating Stripe Connect configuration and checking platform Connect readiness signals.\n",
  );
  const result = await verifyStripeConnectConfiguration();
  stdout.write(
    `${JSON.stringify({
      event: "stripe.connect_configuration_verified",
      ...result,
    })}\n`,
  );
  if (result.platformProfileStatus === "indeterminate") {
    stdout.write(`INDETERMINATE: ${result.platformProfileGuidance}\n`);
  }
}

void main().catch((error: unknown) => {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "UNKNOWN";
  const message =
    error instanceof Error ? error.message : "Unknown verification failure";
  process.stderr.write(
    `Stripe Connect configuration verification failed [${code}]: ${message}\n`,
  );
  process.exitCode = 1;
});
