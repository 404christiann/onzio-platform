import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Indexing policy end to end through middleware (lib/robots.ts is the decider).
// Rose City is live on its primary domain; Diverse City is in grace; Bravo is a
// preview club; Gamma is suspended. Domain rows carry is_primary like production.

type Club = { id: string; slug: string; lifecycle: string; public_access: string };

const CLUBS: Record<string, Club> = {
  "rose-city": { id: "11111111-1111-4111-8111-111111111111", slug: "rose-city", lifecycle: "active", public_access: "live" },
  "diverse-city": { id: "22222222-2222-4222-8222-222222222222", slug: "diverse-city", lifecycle: "active", public_access: "grace" },
  bravo: { id: "33333333-3333-4333-8333-333333333333", slug: "bravo", lifecycle: "active", public_access: "preview" },
  gamma: { id: "44444444-4444-4444-8444-444444444444", slug: "gamma", lifecycle: "active", public_access: "suspended" },
};

const ROSE = "rosecityfutbolclub.com";
const ROSE_WWW = "www.rosecityfutbolclub.com";
const ROSE_VERCEL = "rose-city-onzio.vercel.app";
const DIVERSE = "diversecityfc.com";
const BRAVO = "bravo.example.com";
const GAMMA = "gamma.example.com";

const DOMAIN_ROWS: Record<string, { slug: string; is_primary: boolean }> = {
  [ROSE]: { slug: "rose-city", is_primary: true },
  [ROSE_WWW]: { slug: "rose-city", is_primary: false },
  // A vercel.app host registered as a club's primary domain must still not be indexed.
  [ROSE_VERCEL]: { slug: "rose-city", is_primary: true },
  [DIVERSE]: { slug: "diverse-city", is_primary: true },
  [BRAVO]: { slug: "bravo", is_primary: true },
  [GAMMA]: { slug: "gamma", is_primary: true },
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
            if (table === "clubs") return { data: CLUBS[filters.slug as string] ?? null };
            const row = DOMAIN_ROWS[filters.hostname as string];
            return {
              data: row ? { club_id: CLUBS[row.slug].id, is_primary: row.is_primary, clubs: CLUBS[row.slug] } : null,
            };
          },
        };
        return query;
      },
      rpc: (name: string, args?: { p_club_id?: string }) => {
        const result =
          name === "get_club_runtime_access"
            ? {
                data: Object.values(CLUBS).find((club) => club.id === args?.p_club_id)?.public_access ?? "suspended",
                error: null,
              }
            : { data: null, error: null };
        return Object.assign(Promise.resolve(result), { maybeSingle: async () => result });
      },
    }),
  }),
}));

import { middleware } from "@/middleware";

const UUID = "123e4567-e89b-42d3-a456-426614174000";

async function call(host: string, pathname: string, headers: Record<string, string> = {}) {
  return middleware(
    new NextRequest(`https://${host}${pathname}`, { headers: { host, ...headers } }),
  );
}

describe("robots policy through middleware", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL_ENV", "production");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("Rose City live on its canonical domain, production", () => {
    it.each(["/", "/roster", "/schedule", "/club/about", "/tickets", "/news/injury-report"])(
      "%s is indexable",
      async (path) => {
        const response = await call(ROSE, path);
        expect(response.headers.get("x-robots-tag")).toBe("index, follow");
      },
    );

    it.each([
      ["player profile", `/roster/${UUID}`],
      ["sponsor redirect", `/r/${UUID}`],
      ["registration", "/register/spring-2027"],
      ["admin", "/admin"],
      ["admin login", "/admin/login"],
      ["auth callback", "/admin/auth/callback"],
      ["api", "/api/register"],
      ["internal club path", "/_clubs/rose-city/roster"],
      ["unknown path", "/no-such-page"],
    ])("%s stays noindex", async (_label, path) => {
      const response = await call(ROSE, path);
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    });

    it("a different club's internal path is a 404 with noindex", async () => {
      const response = await call(ROSE, "/_clubs/bravo/roster");
      expect(response.status).toBe(404);
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    });

    it("tells robots.txt and sitemap.xml the site is indexable", async () => {
      const response = await call(ROSE, "/robots.txt");
      expect(response.headers.get("x-middleware-request-x-onzio-site-indexable")).toBe("1");
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    });

    it("drops a client-supplied indexable header", async () => {
      const response = await call(GAMMA, "/robots.txt", { "x-onzio-site-indexable": "1" });
      expect(response.headers.get("x-middleware-request-x-onzio-site-indexable")).toBeNull();
    });
  });

  describe("outside production", () => {
    it.each(["preview", "development", ""])("VERCEL_ENV=%j is noindex on the canonical domain", async (env) => {
      vi.stubEnv("VERCEL_ENV", env);
      const response = await call(ROSE, "/");
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(response.headers.get("x-middleware-request-x-onzio-site-indexable")).toBe("0");
    });

    it("an unset VERCEL_ENV is noindex", async () => {
      vi.stubEnv("VERCEL_ENV", undefined as unknown as string);
      delete process.env.VERCEL_ENV;
      const response = await call(ROSE, "/");
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    });
  });

  describe("hosts that are not the canonical public domain", () => {
    it("a secondary verified domain of a live club is noindex", async () => {
      const response = await call(ROSE_WWW, "/");
      expect(response.status).toBe(200);
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    });

    it("*.vercel.app is noindex even for a live club's registered domain", async () => {
      const response = await call(ROSE_VERCEL, "/");
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    });

    it("an unregistered *.vercel.app host is a 404 with noindex", async () => {
      const response = await call("onzio-platform-git-main-team.vercel.app", "/");
      expect(response.status).toBe(404);
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    });

    it("an unknown custom host is a 404 with noindex", async () => {
      const response = await call("nobody.example.com", "/");
      expect(response.status).toBe(404);
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    });

    it("an invalid host is a 404 with noindex", async () => {
      const response = await middleware(
        new NextRequest("https://example.com/", { headers: { host: "bad host" } }),
      );
      expect(response.status).toBe(404);
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    });
  });

  describe("clubs that are not live", () => {
    it("Diverse City in grace: site is open but stays noindex", async () => {
      const response = await call(DIVERSE, "/");
      expect(response.status).toBe(200);
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(response.headers.get("x-middleware-request-x-onzio-site-indexable")).toBe("0");
    });

    it("a preview club is held (404) with noindex", async () => {
      const response = await call(BRAVO, "/");
      expect(response.status).toBe(404);
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    });

    it("a suspended club is a 404 with noindex", async () => {
      const response = await call(GAMMA, "/");
      expect(response.status).toBe(404);
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    });
  });
});
