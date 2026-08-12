import type Stripe from "stripe";
import { failContract } from "@/lib/contract-error";
import { getStripeClient } from "@/lib/stripe-client";
import {
  getStripeRuntimeConfig,
  type OnzioEnvironment,
} from "@/lib/stripe-config";
import { stripePortalCapabilities } from "@/lib/stripe-portal";

/**
 * Live, read-only verification that STRIPE_PORTAL_CONFIGURATION_ID names a
 * real, active Stripe Billing Portal Configuration in the right mode with the
 * approved capabilities.
 *
 * The shared runtime config can only prove the variable is set; it cannot
 * catch a stale or wrong ID, which fails exactly like the August 2026
 * production incident did — silently, until a paying customer clicks "Manage
 * billing". This check calls the Stripe API, so it runs as an operator
 * acceptance step (see `scripts/verify-stripe-portal-config.ts`), never at
 * request time.
 *
 * Each fault keeps its own code (DCFC-701 discipline):
 * - configuration faults from `getStripeRuntimeConfig` pass through unchanged
 * - `STRIPE_PORTAL_CONFIGURATION_NOT_FOUND` — Stripe has no configuration
 *   with the configured ID (stale or foreign-account ID)
 * - `STRIPE_PORTAL_CONFIGURATION_INACTIVE` — it exists but cannot create
 *   portal sessions
 * - `STRIPE_PORTAL_CONFIGURATION_MODE_MISMATCH` — its livemode does not match
 *   ONZIO_ENVIRONMENT
 * - `STRIPE_PORTAL_CAPABILITIES_MISMATCH` — its features drifted from
 *   `stripePortalCapabilities()`
 */

export type PortalVerificationDependencies = {
  retrievePortalConfiguration?: (
    configurationId: string,
  ) => Promise<Stripe.BillingPortal.Configuration>;
};

export type PortalVerificationResult = {
  environment: OnzioEnvironment;
  configurationId: string;
  livemode: boolean;
  active: true;
  capabilitiesMatch: true;
};

function retrieveWithStripe(
  configurationId: string,
): Promise<Stripe.BillingPortal.Configuration> {
  return getStripeClient().billingPortal.configurations.retrieve(
    configurationId,
  );
}

export async function verifyStripePortalConfiguration(
  dependencies?: PortalVerificationDependencies,
): Promise<PortalVerificationResult> {
  const config = getStripeRuntimeConfig();
  const retrieve =
    dependencies?.retrievePortalConfiguration ?? retrieveWithStripe;

  let configuration: Stripe.BillingPortal.Configuration;
  try {
    configuration = await retrieve(config.portalConfigurationId);
  } catch (error) {
    failContract(
      "STRIPE_PORTAL_CONFIGURATION_NOT_FOUND",
      `Stripe could not retrieve the configured Billing Portal Configuration: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (configuration.active !== true) {
    failContract(
      "STRIPE_PORTAL_CONFIGURATION_INACTIVE",
      "The configured Billing Portal Configuration exists but is not active.",
    );
  }

  const expectedLivemode = config.environment === "production";
  if (configuration.livemode !== expectedLivemode) {
    failContract(
      "STRIPE_PORTAL_CONFIGURATION_MODE_MISMATCH",
      `The configured Billing Portal Configuration is ${
        configuration.livemode ? "live" : "test"
      }-mode but ONZIO_ENVIRONMENT is ${config.environment}.`,
    );
  }

  const expected = stripePortalCapabilities();
  const features = configuration.features;
  const actual = {
    payment_method_update: {
      enabled: features.payment_method_update.enabled,
    },
    invoice_history: { enabled: features.invoice_history.enabled },
    subscription_cancel: { enabled: features.subscription_cancel.enabled },
    subscription_update: { enabled: features.subscription_update.enabled },
  } as const;
  for (const capability of Object.keys(expected) as (keyof typeof expected)[]) {
    if (actual[capability].enabled !== expected[capability].enabled) {
      failContract(
        "STRIPE_PORTAL_CAPABILITIES_MISMATCH",
        `Billing Portal capability ${capability} is ${
          actual[capability].enabled ? "enabled" : "disabled"
        } but the platform requires it ${
          expected[capability].enabled ? "enabled" : "disabled"
        }.`,
      );
    }
  }

  return {
    environment: config.environment,
    configurationId: configuration.id,
    livemode: configuration.livemode,
    active: true,
    capabilitiesMatch: true,
  };
}
