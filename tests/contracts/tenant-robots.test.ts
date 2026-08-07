import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const tenantState = vi.hoisted(() => ({
  publicAccess: "preview",
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

describe("tenant robots response contract", () => {
  beforeEach(() => {
    tenantState.publicAccess = "preview";
  });

  it("public_access=preview emits X-Robots-Tag: noindex, nofollow", async () => {
    const response = await middleware(
      new NextRequest("http://alpha.localhost/", {
        headers: { host: "alpha.localhost" },
      }),
    );

    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  // DCFC-D117: the production site retains noindex, nofollow *through launch*.
  // Indexing is a separate later approval carried by DCFC-1003, after
  // observation closes. Going live must not make the site indexable as a side
  // effect, so every access state emits the header.
  it.each(["live", "grace", "suspended", "preview"] as const)(
    "public_access=%s still emits X-Robots-Tag: noindex, nofollow through launch",
    async (publicAccess) => {
      tenantState.publicAccess = publicAccess;

      const response = await middleware(
        new NextRequest("http://alpha.localhost/", {
          headers: { host: "alpha.localhost" },
        }),
      );

      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    },
  );
});
