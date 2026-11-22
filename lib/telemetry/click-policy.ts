import type { BeaconDecision } from "@/lib/telemetry/beacon";

// TELEMETRY-02: kept out of the route file (a Next route may export only handlers and config).

/** Whether a click should be recorded; pure so the rules are testable on their own. */
export function shouldRecordClick(input: {
  decision: BeaconDecision;
  signingKey: string | null;
  host: string | null;
  previewHost: string | null;
}): boolean {
  if (input.decision.kind !== "record") return false;
  if (!input.signingKey) return false;
  // RC-PREVIEW never records: it is a held club's pre-launch preview, not real traffic.
  if (input.host !== null && input.host === input.previewHost) return false;
  return true;
}
