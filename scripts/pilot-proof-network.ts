import assert from "node:assert/strict";
import { z } from "zod";
import type { BrowserContext } from "@playwright/test";
import { pilotProofProxyMarkerHeader, type PilotProofProxy } from "./pilot-proof-proxy";

type KitPolicy =
  | { kind: "legacy-home"; section: { club_id: string }; photos: unknown[] }
  | { kind: "academy-fixture"; clubId: string; documentAllowed: (origin: string) => Promise<boolean> };

export type AcademyProofNetworkObservations = {
  errors: string[]; excludedResources: string[]; forwardedDocuments: string[];
  redirects: Array<{ from: string; to: string; status: number }>;
};

function assertAcademyRead(target: URL, clubId: string) {
  if (/^\/rest\/v1\/[a-z][a-z0-9_]*$/.test(target.pathname)) {
    const tenantColumn = target.pathname.endsWith("/clubs") ? "id" : "club_id";
    assert.equal(target.searchParams.get(tenantColumn), `eq.${clubId}`, "Read escaped the owned Academy fixture");
  }
  if (/\/rest\/v1\/shop_kit_(section|photos)$/.test(target.pathname)) {
    assert(["eq.home", "eq.third", "eq.away", "in.(home,third,away)"].includes(target.searchParams.get("kit_variant") ?? ""), "Unexpected Academy fixture kit variant");
    assert(["eq.home", "eq.shop"].includes(target.searchParams.get("surface") ?? ""), "Unexpected Academy fixture shop surface");
  }
}

async function installGuard(
  context: BrowserContext,
  endpoints: readonly string[],
  proxy: PilotProofProxy,
  kit: KitPolicy,
  observations: AcademyProofNetworkObservations,
) {
  const { errors: routeErrors, excludedResources } = observations;
  const allowed = new Set([...endpoints, "http://127.0.0.1:54321"]);
  const local = (target: URL) => target.protocol === "http:" && !target.username && !target.password && allowed.has(target.origin);
  await context.routeWebSocket("**/*", socket => socket.close());
  await context.route("**/*", async route => {
    try {
      let url = new URL(route.request().url());
      let credentialsAllowed = true;
      if (!local(url) || url.pathname.startsWith("/_vercel/insights/")) {
        excludedResources.push(`${route.request().method()} ${url.origin}${url.pathname}`);
        if (kit.kind === "academy-fixture" && !url.pathname.startsWith("/_vercel/insights/") && !/(^|\.)(b-cdn\.net|bunnycdn\.com|mediadelivery\.net)$/.test(url.hostname)) {
          routeErrors.push(`Unexpected external resource ${url.origin}${url.pathname}`);
        }
        return await route.abort("blockedbyclient");
      }
      if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) {
        const read = route.request().method() === "POST" && url.pathname === "/api/admin/data"
          && z.object({ operation: z.literal("select") }).safeParse(route.request().postDataJSON()).success;
        if (!read) { routeErrors.push(`Blocked mutation ${route.request().method()} ${url.pathname}`); return await route.abort("blockedbyclient"); }
      }
      if (kit.kind === "academy-fixture") assertAcademyRead(url, kit.clubId);
      if (/\/rest\/v1\/shop_kit_(section|photos)$/.test(url.pathname)) {
        assert.equal(url.searchParams.get("club_id"), `eq.${kit.kind === "legacy-home" ? kit.section.club_id : kit.clubId}`);
        if (kit.kind === "legacy-home") {
          assert.equal(url.searchParams.get("kit_variant"), "eq.home");
          return await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(url.pathname.endsWith("shop_kit_section") ? [kit.section] : kit.photos) });
        }
      }
      const documentRequest = route.request().isNavigationRequest() && route.request().resourceType() === "document";
      const denyDocument = () => route.fulfill({ status: 503, contentType: "text/plain", body: "Assignment unavailable. Document participant is not admitted." });
      if (documentRequest && kit.kind === "academy-fixture" && !await kit.documentAllowed(url.origin)) return await denyDocument();
      const headers = await route.request().allHeaders();
      for (let hop = 0; hop < 20; hop++) {
        if (hop > 0 && credentialsAllowed) {
          const cookies = await context.cookies(url.href);
          const cookie = cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
          if (cookie) headers.cookie = cookie;
          else delete headers.cookie;
        }
        if (documentRequest) observations.forwardedDocuments.push(url.href);
        const marker = proxy.marker();
        const response = await route.fetch({ url: url.href, headers: { ...headers, [pilotProofProxyMarkerHeader]: marker }, maxRedirects: 0 });
        proxy.confirm(marker);
        if (![301, 302, 303, 307, 308].includes(response.status())) return await route.fulfill({ response });
        if (route.request().method() === "POST") throw new Error("Read-only POST redirects are blocked");
        const location = response.headers().location;
        assert(location, "Redirect location missing");
        const next = new URL(location, url);
        assert(local(next), "Redirect escaped local rehearsal");
        if (kit.kind === "academy-fixture") assertAcademyRead(next, kit.clubId);
        observations.redirects.push({ from: url.href, to: next.href, status: response.status() });
        if (documentRequest && kit.kind === "academy-fixture") {
          if (!await kit.documentAllowed(next.origin)) return await denyDocument();
          if (next.origin === url.origin) return await route.fulfill({ response });
        }
        if (next.origin !== url.origin) { credentialsAllowed = false; delete headers.authorization; headers.cookie = ""; }
        url = next;
      }
      throw new Error("Too many local redirects");
    } catch (error) {
      routeErrors.push(String(error));
      try { await route.abort("blockedbyclient"); }
      catch (abortError) { routeErrors.push(`Could not abort failed proof route: ${String(abortError)}`); }
    }
  });
}

export function installPilotProofGuard(context: BrowserContext, endpoints: readonly string[], proxy: PilotProofProxy,
  section: { club_id: string }, photos: unknown[], routeErrors: string[]) {
  return installGuard(context, endpoints, proxy, { kind: "legacy-home", section, photos }, { errors: routeErrors, excludedResources: [], forwardedDocuments: [], redirects: [] });
}

export function installAcademyProofGuard(context: BrowserContext, endpoints: readonly string[], proxy: PilotProofProxy,
  assignment: { clubId: string; documentAllowed: (origin: string) => Promise<boolean> }, observations: AcademyProofNetworkObservations) {
  return installGuard(context, endpoints, proxy, { kind: "academy-fixture", clubId: z.uuid().parse(assignment.clubId), documentAllowed: assignment.documentAllowed }, observations);
}

export async function proofGet(context: BrowserContext, proxy: PilotProofProxy, url: string) {
  const marker = proxy.marker();
  const response = await context.request.get(url, { maxRedirects: 0, headers: { [pilotProofProxyMarkerHeader]: marker } });
  proxy.confirm(marker);
  return response;
}
