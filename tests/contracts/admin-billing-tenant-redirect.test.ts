import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: { id: "11111111-1111-4111-8111-111111111111", slug: "alpha", lifecycle: "active", public_access: "suspended" } }),
    };
    return {
      auth: { getUser: async () => ({ data: { user: null } }) },
      schema: () => ({ from: () => query, rpc: async () => ({ data: "suspended", error: null }) }),
    };
  },
}));
import { middleware } from "@/middleware";

it("suspended recovery retains the verified tenant when Next normalizes the request origin", async () => {
  const response = await middleware(new NextRequest("http://localhost:3110/admin/roster?edit=1", { headers: { host: "alpha.localhost:3110" } }));
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("http://alpha.localhost:3110/admin/payments");
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
});
