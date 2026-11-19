import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// RC-PREVIEW: Rose City stays held everywhere except a declared Vercel Preview
// host, and only for read-only public pages there. No admin, no API, no POST.

const PREVIEW_HOST = "onzio-platform-git-rc-preview-404christianns-projects.vercel.app";
const ROSE_CITY_DOMAIN = "www.rosecityfutbolclub.com";
const DIVERSE_CITY_DOMAIN = "www.diversecityfc.com";

const CLUBS: Record<string, { id: string; slug: string; lifecycle: string; public_access: string }> = {
  "rose-city": {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "rose-city",
    lifecycle: "active",
    public_access: "live",
  },
  "diverse-city": {
    id: "22222222-2222-4222-8222-222222222222",
    slug: "diverse-city",
    lifecycle: "active",
    public_access: "live",
  },
};

const DOMAIN_ROWS: Record<string, string> = {
  [ROSE_CITY_DOMAIN]: "rose-city",
  [DIVERSE_CITY_DOMAIN]: "diverse-city",
};

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    schema: () => ({
      from: (table: string) => {
        const filters: Record<string, unknown> = {};
        const query = {
          select: () => query,
          eq: (column: string, value: unknown) => {
            filters[column] = value;
            return query;
          },
          not: () => query,
          maybeSingle: async () => {
            if (table === "clubs") {
              return { data: CLUBS[filters.slug as string] ?? null };
            }
            const slug = DOMAIN_ROWS[filters.hostname as string];
            return { data: slug ? { clubs: CLUBS[slug] } : null };
          },
        };
        return query;
      },
      // resolve_verified_tenant (admin/billing fallback) finds no row for a
      // preview host, exactly as production's club_domains would.
      rpc: (name: string) => {
        const result =
          name === "get_club_runtime_access"
            ? { data: "live", error: null }
            : { data: null, error: null };
        return Object.assign(Promise.resolve(result), {
          maybeSingle: async () => result,
        });
      },
    }),
  }),
}));

import { middleware } from "@/middleware";

function request(host: string, pathname: string, method = "GET") {
  return new NextRequest(`https://${host}${pathname}`, {
    headers: { host },
    method,
  });
}

function expectHeld(response: Response) {
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-middleware-rewrite")).toBeNull();
}

const PUBLIC_PATHS = ["/", "/roster", "/schedule", "/programs/fall", "/club-logo"];

describe("RC-PREVIEW: Rose City preview unhold", () => {
  beforeEach(() => {
    vi.stubEnv("ONZIO_ENVIRONMENT", "production");
    vi.stubEnv("RC_PREVIEW_HOST", PREVIEW_HOST);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("(a) flag unset", () => {
    beforeEach(() => {
      vi.stubEnv("RC_PREVIEW_UNHOLD", "");
      vi.stubEnv("VERCEL_ENV", "preview");
    });

    it.each(PUBLIC_PATHS)("keeps Rose City %s held on its own domain", async (pathname) => {
      const response = await middleware(request(ROSE_CITY_DOMAIN, pathname));
      expectHeld(response);
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    });

    it.each(PUBLIC_PATHS)("does not resolve %s on the preview host", async (pathname) => {
      expectHeld(await middleware(request(PREVIEW_HOST, pathname)));
    });
  });

  describe("(b) flag set but VERCEL_ENV=production", () => {
    beforeEach(() => {
      vi.stubEnv("RC_PREVIEW_UNHOLD", "1");
      vi.stubEnv("VERCEL_ENV", "production");
    });

    it.each(PUBLIC_PATHS)("keeps Rose City %s held on its own domain", async (pathname) => {
      const response = await middleware(request(ROSE_CITY_DOMAIN, pathname));
      expectHeld(response);
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    });

    it.each(PUBLIC_PATHS)("does not resolve %s on the preview host", async (pathname) => {
      expectHeld(await middleware(request(PREVIEW_HOST, pathname)));
    });
  });

  it.each([undefined, "development", "PREVIEW", " preview"])(
    "keeps the hold when VERCEL_ENV is %s",
    async (vercelEnv) => {
      vi.stubEnv("RC_PREVIEW_UNHOLD", "1");
      vi.stubEnv("VERCEL_ENV", vercelEnv as string);
      expectHeld(await middleware(request(PREVIEW_HOST, "/")));
      expectHeld(await middleware(request(ROSE_CITY_DOMAIN, "/")));
    },
  );

  it.each(["true", "yes", "01", " 1"])("keeps the hold when the flag is %j", async (flag) => {
    vi.stubEnv("RC_PREVIEW_UNHOLD", flag);
    vi.stubEnv("VERCEL_ENV", "preview");
    expectHeld(await middleware(request(PREVIEW_HOST, "/")));
  });

  describe("(c) flag set and VERCEL_ENV=preview", () => {
    beforeEach(() => {
      vi.stubEnv("RC_PREVIEW_UNHOLD", "1");
      vi.stubEnv("VERCEL_ENV", "preview");
    });

    it.each(PUBLIC_PATHS)("serves Rose City %s on the preview host with noindex", async (pathname) => {
      const response = await middleware(request(PREVIEW_HOST, pathname));

      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-rewrite")).toContain(
        `/_clubs/rose-city${pathname === "/" ? "" : pathname}`,
      );
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    });

    it("serves HEAD on the preview host with noindex", async () => {
      const response = await middleware(request(PREVIEW_HOST, "/roster", "HEAD"));
      expect(response.status).toBe(200);
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    });

    it("matches the preview host case-insensitively", async () => {
      const response = await middleware(request(PREVIEW_HOST.toUpperCase(), "/"));
      expect(response.headers.get("x-middleware-rewrite")).toContain("/_clubs/rose-city");
    });

    it.each([
      ["GET", "/admin"],
      ["GET", "/admin/login"],
      ["GET", "/admin/roster"],
      ["GET", "/admin/auth/callback"],
      ["GET", "/admin/payments"],
      ["GET", "/api/admin/data"],
      ["GET", "/api/register/status"],
      ["POST", "/api/register"],
      ["POST", "/api/stripe/checkout"],
      ["POST", "/"],
      ["GET", "/_clubs/rose-city"],
      ["GET", "/_clubs/rose-city/roster"],
    ])("never opens %s %s on the preview host", async (method, pathname) => {
      const response = await middleware(request(PREVIEW_HOST, pathname, method));
      expect(response.status).toBe(404);
      expect(response.headers.get("x-middleware-next")).toBeNull();
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    });

    it.each(PUBLIC_PATHS)("keeps Rose City %s held on its own domain", async (pathname) => {
      expectHeld(await middleware(request(ROSE_CITY_DOMAIN, pathname)));
    });

    it("ignores a host that is not *.vercel.app", async () => {
      vi.stubEnv("RC_PREVIEW_HOST", "preview.rosecityfutbolclub.com");
      expectHeld(await middleware(request("preview.rosecityfutbolclub.com", "/")));
    });

    it("ignores the bare vercel.app apex and suffix look-alikes", async () => {
      vi.stubEnv("RC_PREVIEW_HOST", "vercel.app");
      expectHeld(await middleware(request("vercel.app", "/")));
      vi.stubEnv("RC_PREVIEW_HOST", "evil-vercel.app");
      expectHeld(await middleware(request("evil-vercel.app", "/")));
    });

    it("does nothing when RC_PREVIEW_HOST is unset", async () => {
      vi.stubEnv("RC_PREVIEW_HOST", "");
      expectHeld(await middleware(request(PREVIEW_HOST, "/")));
    });

    it("does not map other vercel.app hosts", async () => {
      expectHeld(
        await middleware(request("onzio-platform-abc123-404christianns-projects.vercel.app", "/")),
      );
    });

    it("leaves Diverse City public pages routed normally", async () => {
      const response = await middleware(request(DIVERSE_CITY_DOMAIN, "/roster"));
      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-rewrite")).toContain("/_clubs/diverse-city/roster");
    });

    it("leaves the Diverse City admin reachable on its own domain", async () => {
      const response = await middleware(request(DIVERSE_CITY_DOMAIN, "/admin"));
      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    });
  });

  it("leaves Diverse City public pages routed normally with the flag unset", async () => {
    vi.stubEnv("RC_PREVIEW_UNHOLD", "");
    vi.stubEnv("VERCEL_ENV", "production");
    const response = await middleware(request(DIVERSE_CITY_DOMAIN, "/roster"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toContain("/_clubs/diverse-city/roster");
  });
});
