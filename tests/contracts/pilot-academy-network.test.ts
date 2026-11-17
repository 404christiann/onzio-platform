import { describe, expect, it, vi } from "vitest";
import type { BrowserContext, Route } from "@playwright/test";
import { installAcademyProofGuard } from "../../scripts/pilot-proof-network";
import type { PilotProofProxy } from "../../scripts/pilot-proof-proxy";

const clubId = "11111111-1111-4111-8111-111111111111";
const base = "http://pilot.localhost:3201";

async function request(url: string, method = "GET", redirect?: string, admitted = true, navigation = false) {
  let handler: ((route: Route) => Promise<unknown>) | undefined;
  const context = { routeWebSocket: vi.fn(), route: vi.fn(async (_: string, callback: typeof handler) => { handler = callback; }), cookies: vi.fn(async () => []) } as unknown as BrowserContext;
  const proxy = { marker: vi.fn(() => "proof-marker"), confirm: vi.fn() } as unknown as PilotProofProxy;
  const errors: string[] = [];
  const observations = { errors, excludedResources: [], forwardedDocuments: [], redirects: [] };
  await installAcademyProofGuard(context, [base, "http://pilot.localhost:3202"], proxy, { clubId, documentAllowed: async origin => admitted && origin === base }, observations);
  const fetch = vi.fn(async () => ({ status: () => redirect ? 302 : 200, headers: () => redirect ? { location: redirect } : {} }));
  const abort = vi.fn(), fulfill = vi.fn();
  const route = { request: () => ({ url: () => url, method: () => method, isNavigationRequest: () => navigation, resourceType: () => navigation ? "document" : "fetch", postDataJSON: () => ({ operation: "delete" }), allHeaders: async () => ({}) }), fetch, abort, fulfill } as unknown as Route;
  if (!handler) throw new Error("Network guard did not install its boundary");
  await handler(route);
  return { fetch, abort, fulfill, errors, observations };
}

const kit = (club = clubId, variant = "eq.home") => `http://127.0.0.1:54321/rest/v1/shop_kit_section?club_id=eq.${club}&surface=eq.shop&kit_variant=${variant}`;
describe("complete Academy proof read boundary", () => {
  it.each(["https://hosted.example.invalid/resource", "http://127.0.0.1:9999/resource"])("blocks non-owned origin %s", async url => {
    const result = await request(url);
    expect(result.abort).toHaveBeenCalledWith("blockedbyclient");
    expect(result.fetch).not.toHaveBeenCalled();
  });
  it.each(["POST", "PUT", "PATCH", "DELETE"])("blocks %s mutations", async method => {
    const result = await request(`${base}/api/admin/data`, method);
    expect(result.abort).toHaveBeenCalledWith("blockedbyclient"); expect(result.fetch).not.toHaveBeenCalled();
  });
  it("does not follow a redirect outside the owned loopback origins", async () => {
    const result = await request(`${base}/contact`, "GET", "https://hosted.example.invalid/contact");
    expect(result.fetch).toHaveBeenCalledOnce(); expect(result.abort).toHaveBeenCalledWith("blockedbyclient");
    expect(result.errors).toHaveLength(1);
  });
  it.each(["eq.home", "eq.third", "eq.away"])("reads real own-club %s kits without substituting rows", async variant => {
    const result = await request(kit(clubId, variant));
    expect(result.errors).toEqual([]); expect(result.fetch).toHaveBeenCalledOnce();
    expect(result.fulfill.mock.calls[0][0]).toHaveProperty("response");
  });
  it("denies an invalid assignment visibly without forwarding its document", async () => {
    const result = await request(`${base}/`, "GET", undefined, false, true);
    expect(result.fetch).not.toHaveBeenCalled();
    expect(result.fulfill).toHaveBeenCalledWith({ status: 503, contentType: "text/plain", body: "Assignment unavailable. Document participant is not admitted." });
    expect(result.observations.forwardedDocuments).toEqual([]);
  });
  it("checks redirect document admission and preserves valid same-origin navigation redirects", async () => {
    const denied = await request(`${base}/`, "GET", "http://pilot.localhost:3202/", true, true);
    expect(denied.fetch).toHaveBeenCalledOnce();
    expect(denied.fulfill.mock.calls[0][0]).toHaveProperty("status", 503);
    const staff = await request(`${base}/staff`, "GET", "/roster#staff", true, true);
    expect(staff.fetch).toHaveBeenCalledOnce();
    expect(staff.fulfill.mock.calls[0][0]).toHaveProperty("response");
    expect(staff.observations.redirects).toEqual([{ from: `${base}/staff`, to: `${base}/roster#staff`, status: 302 }]);
  });
  it("rechecks a read redirect's tenant predicate before contacting the target", async () => {
    const result = await request(`http://127.0.0.1:54321/rest/v1/site_sponsor_logos?club_id=eq.${clubId}`, "GET", "http://127.0.0.1:54321/rest/v1/site_sponsor_logos?club_id=eq.22222222-2222-4222-8222-222222222222");
    expect(result.fetch).toHaveBeenCalledOnce(); expect(result.abort).toHaveBeenCalledWith("blockedbyclient");
    expect(result.errors).toHaveLength(1);
  });
  it("checks tenant predicates on ordinary content reads too", async () => {
    const own = await request(`http://127.0.0.1:54321/rest/v1/site_sponsor_logos?club_id=eq.${clubId}`);
    expect(own.fetch).toHaveBeenCalledOnce();
    for (const predicate of ["", "?club_id=eq.22222222-2222-4222-8222-222222222222"]) {
      const result = await request(`http://127.0.0.1:54321/rest/v1/site_sponsor_logos${predicate}`);
      expect(result.fetch).not.toHaveBeenCalled(); expect(result.abort).toHaveBeenCalledWith("blockedbyclient");
    }
  });
  it("blocks a different club and unknown variants before transport", async () => {
    for (const url of [kit("22222222-2222-4222-8222-222222222222"), kit(clubId, "eq.unsupported")]) {
      const result = await request(url); expect(result.abort).toHaveBeenCalledWith("blockedbyclient"); expect(result.fetch).not.toHaveBeenCalled();
      expect(result.errors).toHaveLength(1);
    }
  });
});
