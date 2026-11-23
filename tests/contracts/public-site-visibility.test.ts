import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Public visibility comes only from the club's public_access state, through
// publicSiteState (lib/club-access.ts). No slug list, no subscription fields.

const HOST = "club.localhost";
const PREVIEW_HOST = "onzio-platform-git-rc-preview-404christianns-projects.vercel.app";

const state = vi.hoisted(() => ({
  club: {} as Record<string, unknown>,
  access: "live" as unknown,
  subscription: null as Record<string, unknown> | null,
  rpcCalls: [] as string[],
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    schema: () => ({
      from: (table: string) => {
        const query = {
          select: () => query,
          eq: () => query,
          not: () => query,
          maybeSingle: async () => ({
            data: table === "clubs" ? state.club : { clubs: state.club },
          }),
        };
        return query;
      },
      rpc: (name: string) => {
        state.rpcCalls.push(name);
        const result =
          name === "get_club_runtime_access"
            ? { data: state.access, error: null }
            : { data: null, error: null };
        return Object.assign(Promise.resolve(result), {
          maybeSingle: async () => result,
        });
      },
    }),
  }),
}));

import { middleware } from "@/middleware";

function request(pathname: string, method = "GET", host = HOST) {
  return new NextRequest(`https://${host}${pathname}`, { headers: { host }, method });
}

function setClub(overrides: Record<string, unknown>, access: unknown) {
  state.club = {
    id: "33333333-3333-4333-8333-333333333333",
    slug: "club",
    kind: "customer",
    lifecycle: "active",
    public_access: access,
    ...overrides,
  };
  state.access = access;
}

function expectHold(response: Response) {
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  expect(response.headers.get("x-middleware-rewrite")).toBeNull();
}

describe("public site visibility follows public_access only", () => {
  beforeEach(() => {
    state.rpcCalls = [];
    state.subscription = null;
    vi.stubEnv("ONZIO_ENVIRONMENT", "production");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(["/", "/roster", "/schedule", "/programs/fall", "/_clubs/club", "/_clubs/club/roster"])(
    "preview club: %s is the hold 404 (no-store, noindex)",
    async (pathname) => {
      setClub({}, "preview");
      expectHold(await middleware(request(pathname)));
    },
  );

  it("preview club: onboarding lifecycle is held too", async () => {
    setClub({ lifecycle: "onboarding" }, "preview");
    expectHold(await middleware(request("/")));
  });

  it("preview club: POST /api/register is the hold 404", async () => {
    setClub({}, "preview");
    expectHold(await middleware(request("/api/register", "POST")));
  });

  it("preview club: admin login, admin payments and the billing API are not blocked", async () => {
    setClub({}, "preview");
    for (const pathname of ["/admin/login", "/admin/payments", "/admin", "/api/stripe/checkout"]) {
      const response = await middleware(request(pathname, pathname.startsWith("/api") ? "POST" : "GET"));
      expect(response.status, pathname).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("live club renders", async () => {
    setClub({}, "live");
    const response = await middleware(request("/roster"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toContain("/_clubs/club/roster");
  });

  it("Diverse City real-shaped data renders: customer, active, grace, past_due, paid_through 2026-08-24", async () => {
    setClub({ slug: "diverse-city", kind: "customer", lifecycle: "active" }, "grace");
    state.subscription = { status: "past_due", paid_through: "2026-08-24T06:41:35Z" };
    const response = await middleware(request("/roster", "GET", "club.localhost"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toContain("/_clubs/diverse-city/roster");
    const register = await middleware(request("/api/register", "POST"));
    expect(register.status).toBe(200);
  });

  it("suspended club: public path is 404, admin is redirected to /admin/payments, login still works", async () => {
    setClub({}, "suspended");
    expectHold(await middleware(request("/")));
    const admin = await middleware(request("/admin/roster"));
    expect(admin.status).toBe(303);
    expect(new URL(admin.headers.get("location")!).pathname).toBe("/admin/payments");
    expect((await middleware(request("/admin/login"))).status).toBe(200);
  });

  it("an unknown runtime access fails closed", async () => {
    setClub({}, "something-new");
    expectHold(await middleware(request("/")));
  });

  it("the declared Rose City preview host still renders a preview club's public pages", async () => {
    vi.stubEnv("RC_PREVIEW_UNHOLD", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("RC_PREVIEW_HOST", PREVIEW_HOST);
    setClub({ slug: "rose-city" }, "preview");
    const response = await middleware(request("/", "GET", PREVIEW_HOST));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toContain("/_clubs/rose-city");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    // ...but only there: the club's own domain stays held.
    expectHold(await middleware(request("/", "GET", "www.rosecityfutbolclub.com")));
  });
});
