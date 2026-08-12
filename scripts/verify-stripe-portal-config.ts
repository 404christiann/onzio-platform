import { stdout } from "node:process";
import { loadEnvConfig } from "@next/env";
import { verifyStripePortalConfiguration } from "@/lib/stripe-portal-verification";

// Read-only Stripe acceptance check. Run after any Vercel Stripe environment
// variable change or Stripe Billing Portal configuration change, with the
// target environment's variables exported (ONZIO_ENVIRONMENT,
// STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PORTAL_CONFIGURATION_ID).
// It validates the shared runtime configuration, then retrieves the
// configured Billing Portal Configuration from Stripe and requires it to be
// real, active, in the matching mode, and to carry the approved capabilities.
// It creates, mutates, and deletes nothing, and never prints a secret.
async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  stdout.write(
    "Read-only: retrieving the configured Stripe Billing Portal Configuration and verifying it is active with the approved capabilities.\n",
  );
  const result = await verifyStripePortalConfiguration();
  stdout.write(
    `${JSON.stringify({
      event: "stripe.portal_configuration_verified",
      ...result,
    })}\n`,
  );
}

void main().catch((error: unknown) => {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "UNKNOWN";
  const message =
    error instanceof Error ? error.message : "Unknown verification failure";
  process.stderr.write(
    `Stripe portal configuration verification failed [${code}]: ${message}\n`,
  );
  process.exitCode = 1;
});
