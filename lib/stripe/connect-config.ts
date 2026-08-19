import { failContract } from "@/lib/contract-error";

/**
 * Stripe Connect credential resolution for club registration payments.
 *
 * This module is deliberately isolated from `lib/stripe-config.ts` and
 * `lib/stripe-client.ts`, which configure Onzio's OWN subscription billing
 * (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, the Billing Portal). The two
 * concerns must never share a key, a webhook secret, or a code path:
 *
 *   * Subscription billing charges the CLUB on Onzio's platform account. In
 *     production it uses a LIVE key.
 *   * Connect registration payments charge a FAMILY on the CLUB's own
 *     connected account, with 100% of funds going to the club. Onzio takes no
 *     fee and never touches the money.
 *
 * If those shared a key, a bug in the subscription path could charge a family,
 * or the phase gate below could be bypassed by the platform's live key.
 *
 * ## The live-mode gate
 *
 * In this phase, club registration payments are TEST MODE ONLY, until each
 * club has signed and completed Connect onboarding. That is enforced by two
 * independent guards:
 *
 *   (a) No live-mode Connect secret key is configured anywhere in this
 *       environment or codebase. `.env.test.example` defines only
 *       `STRIPE_CONNECT_TEST_SECRET_KEY`; `STRIPE_CONNECT_LIVE_SECRET_KEY` is
 *       named here only so this module can prove its absence.
 *
 *   (b) This function refuses to hand back live credentials unless BOTH
 *       `onzio.clubs.payments_live_enabled` is true (an operator-only column;
 *       `onzio.clubs` grants no UPDATE to anon or authenticated) AND a
 *       syntactically valid live secret key is present.
 *
 * Guard (b) fails CLOSED. A club whose operator has flipped
 * `payments_live_enabled` on but for whom no live key exists does not quietly
 * fall back to test mode: charging a real family in test mode would take a
 * fake payment against a real registration, which is worse than refusing the
 * checkout outright. AGENTS.md: "Fail closed for ... billing-state mismatch."
 */

export const CONNECT_TEST_SECRET_KEY_VAR = "STRIPE_CONNECT_TEST_SECRET_KEY";
export const CONNECT_LIVE_SECRET_KEY_VAR = "STRIPE_CONNECT_LIVE_SECRET_KEY";
export const CONNECT_TEST_WEBHOOK_SECRET_VAR =
  "STRIPE_CONNECT_TEST_WEBHOOK_SECRET";
export const CONNECT_LIVE_WEBHOOK_SECRET_VAR =
  "STRIPE_CONNECT_LIVE_WEBHOOK_SECRET";

export type ConnectEnv = Record<string, string | undefined>;

export type ConnectStripeMode = "test" | "live";

export type ConnectStripeCredentials = {
  readonly mode: ConnectStripeMode;
  readonly secretKey: string;
};

/**
 * Stripe secret keys are `sk_` and restricted keys are `rk_`; both carry the
 * mode in the prefix. Matching on the prefix rather than trusting the variable
 * name is the point: a live key pasted into the test variable is still a live
 * key, and is rejected below.
 */
function keyMode(secretKey: string): ConnectStripeMode | null {
  if (/^(?:sk|rk)_test_/.test(secretKey)) return "test";
  if (/^(?:sk|rk)_live_/.test(secretKey)) return "live";
  return null;
}

function trimmed(env: ConnectEnv, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

/**
 * True when a live-mode Connect secret key exists in this environment at all.
 * Exposed so callers and tests can assert guard (a) directly.
 */
export function isConnectLiveKeyConfigured(
  env: ConnectEnv = process.env,
): boolean {
  return trimmed(env, CONNECT_LIVE_SECRET_KEY_VAR) !== null;
}

/**
 * Resolves the Stripe credentials a connected-account call may use for one
 * club. Throws `ContractError` rather than returning a fallback, so no caller
 * can accidentally proceed with the wrong mode.
 */
export function resolveConnectStripeCredentials(input: {
  paymentsLiveEnabled: boolean;
  env?: ConnectEnv;
}): ConnectStripeCredentials {
  const env = input.env ?? process.env;

  const testKey = trimmed(env, CONNECT_TEST_SECRET_KEY_VAR);
  if (!testKey) {
    failContract(
      "CONNECT_TEST_KEY_MISSING",
      `${CONNECT_TEST_SECRET_KEY_VAR} is required.`,
    );
  }
  if (keyMode(testKey) !== "test") {
    // A live (or unrecognisable) key sitting in the test variable would make
    // every "test mode" charge real. Refuse before any club state is read.
    failContract(
      "CONNECT_TEST_KEY_NOT_TEST_MODE",
      `${CONNECT_TEST_SECRET_KEY_VAR} must be a Stripe test-mode key.`,
    );
  }

  if (!input.paymentsLiveEnabled) {
    // The seeded default for every club. There is exactly one outcome here,
    // and it does not consult the live key at all: even if a live key were
    // configured, a club that has not been switched on by an operator cannot
    // reach it.
    return { mode: "test", secretKey: testKey };
  }

  const liveKey = trimmed(env, CONNECT_LIVE_SECRET_KEY_VAR);
  if (!liveKey) {
    // Guard (a) meeting guard (b): the club is flagged live but this phase
    // configures no live key, so the only honest answer is to refuse.
    failContract(
      "CONNECT_LIVE_MODE_UNAVAILABLE",
      "Live registration payments are not available: no live-mode Stripe Connect key is configured in this environment.",
    );
  }
  if (keyMode(liveKey) !== "live") {
    failContract(
      "CONNECT_LIVE_KEY_NOT_LIVE_MODE",
      `${CONNECT_LIVE_SECRET_KEY_VAR} must be a Stripe live-mode key.`,
    );
  }

  return { mode: "live", secretKey: liveKey };
}

/**
 * Webhook signing secrets configured for the Connect endpoint, in the order
 * verification should try them. Connect events are signed with the Connect
 * endpoint's own secret, which is distinct from the platform subscription
 * webhook's `STRIPE_WEBHOOK_SECRET` — never reuse that one here.
 *
 * In this phase only the test-mode secret exists, so a live-mode Connect
 * delivery cannot be verified at all, which is the intended outcome.
 */
export function connectWebhookSecrets(env: ConnectEnv = process.env): string[] {
  return [
    trimmed(env, CONNECT_TEST_WEBHOOK_SECRET_VAR),
    trimmed(env, CONNECT_LIVE_WEBHOOK_SECRET_VAR),
  ].filter((value): value is string => value !== null);
}
