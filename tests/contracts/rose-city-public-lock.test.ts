import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const tenantState = vi.hoisted(() => ({ slug: "rose-city" }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => {
    const club = {
      id: "11111111-1111-4111-8111-111111111111",
      slug: tenantState.slug,
      lifecycle: "active",
      public_access: "live",
    };
    const domainQuery = {
      select: () => domainQuery,
      eq: () => domainQuery,
      not: () => domainQuery,
      maybeSingle: async () => ({ data: { clubs: club } }),
    };
    return {
      auth: { getUser: async () => ({ data: { user: null } }) },
      schema: () => ({
        from: () => domainQuery,
        rpc: async () => ({ data: "live", error: null }),
      }),
    };
  },
}));

import { middleware } from "@/middleware";

function request(pathname: string, method = "GET") {
  return new NextRequest(`https://onzio-platform.vercel.app${pathname}`, {
    headers: { host: "onzio-platform.vercel.app" },
    method,
  });
}

describe("Rose City public site hold", () => {
  beforeEach(() => {
    tenantState.slug = "rose-city";
  });

  it.each([
    "/",
    "/roster",
    "/programs/fall",
    "/register/fall/confirmation",
    "/club-logo",
    "/_clubs/rose-city",
    "/_clubs/rose-city/roster",
    "/%5Fclubs/rose-city/roster",
  ])("hides %s with uncached nonindexable 404", async (pathname) => {
    const response = await middleware(request(pathname));

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("rejects new public registrations", async () => {
    const response = await middleware(request("/api/register", "POST"));

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each(["/admin", "/admin/roster", "/api/admin/data", "/admin/login", "/api/register/status"])(
    "keeps %s reachable for owner editing or existing registration status",
    async (pathname) => {
      const response = await middleware(request(pathname));

      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    },
  );

  it("leaves Diverse City public pages routed normally", async () => {
    tenantState.slug = "diverse-city";

    const response = await middleware(request("/roster"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toContain("/_clubs/diverse-city/roster");
  });
});
