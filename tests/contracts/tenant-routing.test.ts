import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { clubs, domains, USER_IDS } from "../fixtures/entities";
import { expectContractError, loadContract } from "../helpers/contract";

type NormalizeHostname = (hostname: string) => string;
type ResolveTenantRoute = (input: {
  hostname: string;
  pathname: string;
  headers?: Record<string, string>;
  domains: readonly Record<string, unknown>[];
}) => Promise<{
  clubId: string;
  slug: string;
  primaryDomain: string;
  internalPath: string;
}>;
type BuildTenantCacheKey = (input: {
  clubId: string;
  pathname: string;
  responseKind: "html" | "rsc" | "metadata";
}) => string;
type GetClubContext = (input: {
  hostname: string;
  userId?: string | null;
}) => Promise<Record<string, unknown>>;
type Middleware = (request: NextRequest) => Promise<Response>;
type RequiresTenantFallback = (pathname: string) => boolean;

describe("hostname normalization contract", () => {
  const validCases = [
    ["alpha-onzio.vercel.app", "alpha-onzio.vercel.app"],
    ["ALPHA-ONZIO.VERCEL.APP", "alpha-onzio.vercel.app"],
    ["alpha.localhost:3000", "alpha.localhost"],
    ["alpha-onzio.vercel.app.", "alpha-onzio.vercel.app"],
    ["xn--bcher-kva.example", "xn--bcher-kva.example"],
    [
      "onzio-platform-git-main-team.vercel.app",
      "onzio-platform-git-main-team.vercel.app",
    ],
  ] as const;

  it.each(validCases)("normalizes %s", async (input, expected) => {
    const normalizeHostname = await loadContract<NormalizeHostname>(
      "@/lib/tenant",
      "normalizeHostname",
    );
    expect(normalizeHostname(input)).toBe(expected);
  });

  const invalidHosts = [
    "https://alpha.example",
    "alpha.example/path",
    "user@alpha.example",
    "alpha example",
    "alpha.example:99999",
    "-alpha.example",
    "alpha..example",
    "",
  ];

  it.each(invalidHosts)("rejects malformed hostname %j", async (hostname) => {
    const normalizeHostname = await loadContract<NormalizeHostname>(
      "@/lib/tenant",
      "normalizeHostname",
    );
    await expectContractError(
      () => normalizeHostname(hostname),
      "INVALID_HOSTNAME",
    );
  });
});

describe("tenant route resolution contract", () => {
  it("keeps protected billing and registration endpoints on tenant fallback resolution", async () => {
    const requiresTenantFallback = await loadContract<RequiresTenantFallback>(
      "@/middleware",
      "requiresTenantFallback",
    );

    for (const pathname of [
      "/api/stripe/connect",
      "/api/stripe/billing-admin",
      "/api/admin/registrations/export",
    ]) {
      expect(requiresTenantFallback(pathname)).toBe(true);
    }
    expect(requiresTenantFallback("/api/admin/registrations")).toBe(false);
  });

  it("lets the signature-verified Stripe webhook bypass tenant host routing", async () => {
    const middleware = await loadContract<Middleware>(
      "@/middleware",
      "middleware",
    );
    const response = await middleware(
      new NextRequest(
        "https://onzio-platform-git-staging-team.vercel.app/api/stripe/webhook",
        { method: "POST" },
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("lets the separate Connect webhook bypass tenant host routing", async () => {
    const middleware = await loadContract<Middleware>(
      "@/middleware",
      "middleware",
    );
    const response = await middleware(
      new NextRequest(
        "https://onzio-platform-git-staging-team.vercel.app/api/stripe/connect-webhook",
        { method: "POST" },
      ),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("resolves a verified primary domain", async () => {
    const resolveTenantRoute = await loadContract<ResolveTenantRoute>(
      "@/lib/tenant-routing",
      "resolveTenantRoute",
    );
    await expect(
      resolveTenantRoute({
        hostname: clubs.alpha.primaryDomain,
        pathname: "/roster",
        domains,
      }),
    ).resolves.toMatchObject({
      clubId: clubs.alpha.id,
      slug: "alpha",
      primaryDomain: clubs.alpha.primaryDomain,
      internalPath: "/_clubs/alpha/roster",
    });
  });

  it("resolves a verified alias to its primary domain", async () => {
    const resolveTenantRoute = await loadContract<ResolveTenantRoute>(
      "@/lib/tenant-routing",
      "resolveTenantRoute",
    );
    await expect(
      resolveTenantRoute({
        hostname: "www.alphafc.example",
        pathname: "/",
        domains,
      }),
    ).resolves.toMatchObject({
      clubId: clubs.alpha.id,
      primaryDomain: clubs.alpha.primaryDomain,
    });
  });

  it("resolves a club localhost subdomain", async () => {
    const resolveTenantRoute = await loadContract<ResolveTenantRoute>(
      "@/lib/tenant-routing",
      "resolveTenantRoute",
    );
    await expect(
      resolveTenantRoute({
        hostname: "alpha.localhost:3000",
        pathname: "/schedule",
        domains,
      }),
    ).resolves.toMatchObject({
      slug: "alpha",
      internalPath: "/_clubs/alpha/schedule",
    });
  });

  it.each([
    ["unknown.example", "UNKNOWN_TENANT"],
    ["unverified.example", "UNVERIFIED_DOMAIN"],
    ["archived-onzio.vercel.app", "ARCHIVED_TENANT"],
    ["suspended-onzio.vercel.app", "SUSPENDED_TENANT"],
  ])("fails closed for %s", async (hostname, code) => {
    const resolveTenantRoute = await loadContract<ResolveTenantRoute>(
      "@/lib/tenant-routing",
      "resolveTenantRoute",
    );
    await expectContractError(
      () =>
        resolveTenantRoute({
          hostname,
          pathname: "/",
          domains,
        }),
      code,
    );
  });

  it("ignores forged tenant headers", async () => {
    const resolveTenantRoute = await loadContract<ResolveTenantRoute>(
      "@/lib/tenant-routing",
      "resolveTenantRoute",
    );
    const result = await resolveTenantRoute({
      hostname: clubs.alpha.primaryDomain,
      pathname: "/",
      domains,
      headers: {
        "x-onzio-club-id": clubs.bravo.id,
        "x-onzio-club-slug": clubs.bravo.slug,
      },
    });
    expect(result.clubId).toBe(clubs.alpha.id);
    expect(result.slug).toBe(clubs.alpha.slug);
  });

  it("rejects conflicting verified domain records", async () => {
    const resolveTenantRoute = await loadContract<ResolveTenantRoute>(
      "@/lib/tenant-routing",
      "resolveTenantRoute",
    );
    await expectContractError(
      () =>
        resolveTenantRoute({
          hostname: clubs.alpha.primaryDomain,
          pathname: "/",
          domains: [
            ...domains,
            {
              clubId: clubs.bravo.id,
              hostname: clubs.alpha.primaryDomain,
              primary: false,
              verified: true,
            },
          ],
        }),
      "DOMAIN_CONFLICT",
    );
  });
});

describe("tenant context and cache isolation contract", () => {
  it("returns the complete context for the resolved host and user", async () => {
    const getClubContext = await loadContract<GetClubContext>(
      "@/lib/club-context",
      "getClubContext",
    );
    await expect(
      getClubContext({
        hostname: clubs.alpha.primaryDomain,
        userId: USER_IDS.ownerAal2,
      }),
    ).resolves.toMatchObject({
      id: clubs.alpha.id,
      slug: clubs.alpha.slug,
      primaryDomain: clubs.alpha.primaryDomain,
      lifecycle: "active",
      publicAccess: "live",
      tier: "pro",
      role: "owner",
    });
  });

  it("does not leak a multi-club user's role across hosts", async () => {
    const getClubContext = await loadContract<GetClubContext>(
      "@/lib/club-context",
      "getClubContext",
    );
    const alpha = await getClubContext({
      hostname: clubs.alpha.primaryDomain,
      userId: USER_IDS.multiClub,
    });
    const bravo = await getClubContext({
      hostname: clubs.bravo.primaryDomain,
      userId: USER_IDS.multiClub,
    });
    expect(alpha.role).toBe("admin");
    expect(bravo.role).toBe("owner");
  });

  it.each(["html", "rsc", "metadata"] as const)(
    "includes tenant identity in %s cache keys",
    async (responseKind) => {
      const buildTenantCacheKey = await loadContract<BuildTenantCacheKey>(
        "@/lib/tenant-routing",
        "buildTenantCacheKey",
      );
      const alphaKey = buildTenantCacheKey({
        clubId: clubs.alpha.id,
        pathname: "/roster",
        responseKind,
      });
      const bravoKey = buildTenantCacheKey({
        clubId: clubs.bravo.id,
        pathname: "/roster",
        responseKind,
      });
      expect(alphaKey).not.toBe(bravoKey);
      expect(alphaKey).toContain(clubs.alpha.id);
      expect(bravoKey).toContain(clubs.bravo.id);
    },
  );
});
