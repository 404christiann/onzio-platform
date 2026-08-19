import Stripe from "stripe";
import { failContract } from "@/lib/contract-error";
import {
  isConnectLiveKeyConfigured,
  type ConnectEnv,
  type ConnectStripeCredentials,
} from "@/lib/stripe/connect-config";

/**
 * The Stripe surface the Connect feature is allowed to touch. Narrowing it
 * from the full `Stripe` client keeps `transfers`, `payouts`, and
 * `applicationFees` structurally out of reach: Onzio never moves club money,
 * so those resources have no legitimate caller here.
 */
export type ConnectStripeClient = Pick<
  Stripe,
  "accounts" | "accountLinks" | "checkout"
>;

function keyMode(secretKey: string): "test" | "live" | null {
  if (/^(?:sk|rk)_test_/.test(secretKey)) return "test";
  if (/^(?:sk|rk)_live_/.test(secretKey)) return "live";
  return null;
}

/**
 * Constructs the Stripe client used for connected-account calls.
 *
 * This is the last of the three checks standing between a club and a live
 * charge, and it re-derives the mode from the key itself rather than trusting
 * the `mode` field it was handed. `resolveConnectStripeCredentials` already
 * enforces the club-state rule; this refuses to build a client whose key
 * disagrees with the mode its caller believes it is in, which is the failure a
 * future refactor is most likely to introduce.
 */
export function createConnectStripeClient(
  credentials: ConnectStripeCredentials,
  env: ConnectEnv = process.env,
): ConnectStripeClient {
  const actual = keyMode(credentials.secretKey);
  if (actual === null) {
    failContract("CONNECT_KEY_UNRECOGNISED");
  }
  if (actual !== credentials.mode) {
    failContract("CONNECT_KEY_MODE_MISMATCH");
  }
  if (credentials.mode === "live" && !isConnectLiveKeyConfigured(env)) {
    // Unreachable through resolveConnectStripeCredentials; kept so that a
    // caller assembling credentials by hand still cannot reach live mode in an
    // environment that configures no live key.
    failContract("CONNECT_LIVE_MODE_UNAVAILABLE");
  }

  return new Stripe(credentials.secretKey);
}
