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

  // DCFC-D117 held noindex for every state through launch. lib/robots.ts now
  // indexes a `live` club on its canonical production domain (see
  // tests/contracts/robots-middleware.test.ts); these requests are on a
  // `.localhost` host with VERCEL_ENV unset, which never indexes, in any state.
  it.each(["live", "grace", "suspended", "preview"] as const)(
    "public_access=%s emits noindex, nofollow off production",
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
