import assert from "node:assert/strict";
import { z } from "zod";
import type { BrowserContext } from "@playwright/test";
import { pilotProofProxyMarkerHeader, type PilotProofProxy } from "./pilot-proof-proxy";

export async function installPilotProofGuard(
  context: BrowserContext,
  endpoints: readonly string[],
  proxy: PilotProofProxy,
  section: { club_id: string },
  photos: unknown[],
  routeErrors: string[],
) {
  const allowed = new Set([...endpoints, "http://127.0.0.1:54321"]);
  const local = (target: URL) => target.protocol === "http:" && !target.username && !target.password && allowed.has(target.origin);
  await context.routeWebSocket("**/*", socket => socket.close());
  await context.route("**/*", async route => {
    try {
      let url = new URL(route.request().url());
      let credentialsAllowed = true;
      if (!local(url) || url.pathname.startsWith("/_vercel/insights/")) return route.abort("blockedbyclient");
      if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) {
        const read = route.request().method() === "POST" && url.pathname === "/api/admin/data"
          && z.object({ operation: z.literal("select") }).safeParse(route.request().postDataJSON()).success;
        if (!read) { console.error(`Blocked ${route.request().method()} ${url.pathname}`); return route.abort("blockedbyclient"); }
      }
      if (/\/rest\/v1\/shop_kit_(section|photos)$/.test(url.pathname)) {
        assert.equal(url.searchParams.get("club_id"), `eq.${section.club_id}`);
        assert.equal(url.searchParams.get("kit_variant"), "eq.home");
        return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(url.pathname.endsWith("shop_kit_section") ? [section] : photos) });
      }
      const headers = await route.request().allHeaders();
      for (let hop = 0; hop < 20; hop++) {
        if (hop > 0 && credentialsAllowed) {
          const cookies = await context.cookies(url.href);
          const cookie = cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
          if (cookie) headers.cookie = cookie;
          else delete headers.cookie;
        }
        const marker = proxy.marker();
        const response = await route.fetch({ url: url.href, headers: { ...headers, [pilotProofProxyMarkerHeader]: marker }, maxRedirects: 0 });
        proxy.confirm(marker);
        if (![301, 302, 303, 307, 308].includes(response.status())) return route.fulfill({ response });
        if (route.request().method() === "POST") throw new Error("Read-only POST redirects are blocked");
        const location = response.headers().location;
        assert(location, "Redirect location missing");
        const next = new URL(location, url);
        assert(local(next), "Redirect escaped local rehearsal");
        if (next.origin !== url.origin) { credentialsAllowed = false; delete headers.authorization; headers.cookie = ""; }
        url = next;
      }
      throw new Error("Too many local redirects");
    } catch (error) { routeErrors.push(String(error)); return route.abort("blockedbyclient"); }
  });
}

export async function proofGet(context: BrowserContext, proxy: PilotProofProxy, url: string) {
  const marker = proxy.marker();
  const response = await context.request.get(url, { maxRedirects: 0, headers: { [pilotProofProxyMarkerHeader]: marker } });
  proxy.confirm(marker);
  return response;
}
