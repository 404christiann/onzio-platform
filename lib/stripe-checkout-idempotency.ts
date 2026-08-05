import { createHash } from "node:crypto";
import { failContract } from "@/lib/contract-error";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function checkoutIdempotencyKeys(input: {
  environment: "staging" | "production";
  clubId: string;
  sessionId: string;
}): { customer: string; checkout: string } {
  if (!UUID_PATTERN.test(input.clubId) || !UUID_PATTERN.test(input.sessionId)) {
    failContract("CHECKOUT_ATTEMPT_INVALID");
  }

  const attemptDigest = createHash("sha256")
    .update(`${input.clubId}:${input.sessionId}`)
    .digest("hex")
    .slice(0, 32);
  const prefix = `onzio:${input.environment}:${input.clubId}:${attemptDigest}`;

  return {
    customer: `${prefix}:customer`,
    checkout: `${prefix}:checkout`,
  };
}
