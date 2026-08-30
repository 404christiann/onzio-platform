import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const tenantState = vi.hoisted(() => ({
  publicAccess: "live",
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => {
    const clubQuery = {
      select: () => clubQuery,
      eq: () => clubQuery,
      maybeSingle: async () => ({
        data: {
          id: "11111111-1111-4111-8111-111111111111",
          slug: "alpha",
          lifecycle: "active",
          public_access: tenantState.publicAccess,
        },
      }),
    };

    return {
      auth: {
        getUser: async () => ({ data: { user: null } }),
      },
      schema: () => ({
        from: () => clubQuery,
        rpc: async () => ({
          data: tenantState.publicAccess,
          error: null,
        }),
      }),
    };
  },
}));

import { middleware } from "@/middleware";

const adminRequest = (pathname: string) =>
  new NextRequest(`http://alpha.localhost${pathname}`, {
    headers: { host: "alpha.localhost" },
  });

// PLAT-D024: grace preserves full content editing — the database's
// `can_mutate_content` allows `live` and `grace`, and AdminShell messages
// grace as still editable. Suspension is the single enforcement boundary, so
// only `suspended` may lock the admin portal down to the payments surface.
describe("admin billing lockdown contract", () => {
  beforeEach(() => {
    tenantState.publicAccess = "live";
  });

  it("grace keeps normal admin routes reachable (no payments redirect)", async () => {
    tenantState.publicAccess = "grace";

    const response = await middleware(adminRequest("/admin/roster"));

    expect(response.status).not.toBe(303);
    expect(response.headers.get("location")).toBeNull();
  });

  it("suspended redirects normal admin routes to /admin/payments", async () => {
    tenantState.publicAccess = "suspended";

    const response = await middleware(adminRequest("/admin/roster"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://alpha.localhost/admin/payments",
    );
  });

  it.each(["/admin/payments", "/admin/login", "/admin/auth/callback"])(
    "suspended still allows %s",
    async (pathname) => {
      tenantState.publicAccess = "suspended";

      const response = await middleware(adminRequest(pathname));

      expect(response.status).not.toBe(303);
      expect(response.headers.get("location")).toBeNull();
    },
  );

  it("live keeps normal admin routes reachable", async () => {
    const response = await middleware(adminRequest("/admin/roster"));

    expect(response.status).not.toBe(303);
    expect(response.headers.get("location")).toBeNull();
  });
});
