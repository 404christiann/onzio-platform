"use client";

import { createContext, useContext, type ReactNode } from "react";
import PageBeacon from "./PageBeacon";

// TELEMETRY-03: the club layout mounts SiteTelemetry only for clubs with the
// paid add-on, so any component can ask whether it may report. The default is
// false: outside the provider (no add-on, tests, other shells) nothing reports.

const TelemetryContext = createContext(false);

export function SiteTelemetry({ children }: { children: ReactNode }) {
  return (
    <TelemetryContext.Provider value={true}>
      <PageBeacon />
      {children}
    </TelemetryContext.Provider>
  );
}

export function useTelemetryEnabled(): boolean {
  return useContext(TelemetryContext);
}
