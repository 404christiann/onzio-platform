import type { FullConfig } from "@playwright/test";
import { recordLocalTestDataStart, removeLocalTestDataAddedSince } from "../helpers/local-test-data-cleanup";

// Playwright global setup for the browser suites that run against the local app. It removes what the
// run added to the shared local database, the same as the vitest database runs do. It does nothing
// when the suite's base URL is not a loopback or `*.localhost` address.
function isLocal(baseURL: string | undefined) {
  if (!baseURL) return false;
  try {
    const host = new URL(baseURL).hostname;
    return host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
  } catch { return false; }
}

export default async function globalSetup(config: FullConfig) {
  if (!isLocal(config.projects[0]?.use.baseURL)) return;
  const before = await recordLocalTestDataStart();
  return async () => { await removeLocalTestDataAddedSince(before); };
}
