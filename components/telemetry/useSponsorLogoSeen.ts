"use client";

import { useEffect, type RefObject } from "react";
import { usePathname } from "next/navigation";
import { useHomepagePreview } from "@/lib/homepage-editor/preview-context";
import { startSponsorLogoSeen } from "./logo-seen";
import { useTelemetryEnabled } from "./TelemetryContext";

// TELEMETRY-03: wires the sponsor-logo tracker to a strip. Nothing is
// constructed unless the club has the add-on (SiteTelemetry) and the page is
// the public site rather than the admin's homepage preview.

export function attachSponsorLogoSeen(
  enabled: boolean,
  root: Element | null | undefined,
  opts?: Parameters<typeof startSponsorLogoSeen>[1],
): (() => void) | undefined {
  if (!enabled || !root || typeof IntersectionObserver !== "function") return undefined;
  return startSponsorLogoSeen(root, opts);
}

/**
 * `sponsorKey` changes whenever the set of logos does. A new pathname ends the
 * old tracker (its final flush reports the old path) and starts a fresh one,
 * so each page view counts its own logos.
 */
export function useSponsorLogoSeen(rootRef: RefObject<HTMLElement | null>, sponsorKey: string): void {
  const telemetry = useTelemetryEnabled();
  const preview = useHomepagePreview();
  const enabled = telemetry && !preview;
  const pathname = usePathname();
  useEffect(() => attachSponsorLogoSeen(enabled, rootRef.current), [enabled, pathname, sponsorKey, rootRef]);
}
