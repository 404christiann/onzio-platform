import type { BrowserContext, Request, Route } from "@playwright/test";
import { expect, it } from "vitest";
import { installPilotProofGuard } from "../../scripts/pilot-proof-network";
import type { PilotProofProxy } from "../../scripts/pilot-proof-proxy";

it("records a disposed proof response and failed abort without losing cleanup control", async () => {
  let handle: ((route: Route) => unknown) | undefined;
  const context = {
    routeWebSocket: async () => {},
    route: async (_pattern: string, callback: (route: Route) => unknown) => { handle = callback; },
  } as unknown as BrowserContext;
  const proxy = { server: "http://127.0.0.1:4123", marker: () => "marker", confirm: () => {} } satisfies PilotProofProxy;
  const errors: string[] = [];
  await installPilotProofGuard(context, ["http://alpha.localhost:4123"], proxy, { club_id: "synthetic" }, [], errors);

  const request = {
    url: () => "http://alpha.localhost:4123/asset.webp",
    method: () => "GET",
    isNavigationRequest: () => false,
    resourceType: () => "image",
    allHeaders: async () => ({}),
  } as unknown as Request;
  const route = {
    request: () => request,
    fetch: async () => ({ status: () => 200 }),
    fulfill: async () => { throw new Error("Fetch response has been disposed"); },
    abort: async () => { throw new Error("Route has been disposed"); },
  } as unknown as Route;

  expect(handle).toBeDefined();
  await expect(Promise.resolve(handle?.(route))).resolves.toBeUndefined();
  expect(errors).toEqual([
    "Error: Fetch response has been disposed",
    "Could not abort failed proof route: Error: Route has been disposed",
  ]);
});
