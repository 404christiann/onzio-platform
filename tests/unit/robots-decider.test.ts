import { describe, expect, it } from "vitest";
import { isPublicSiteIndexable } from "@/lib/club-access";
import {
  ROBOTS_INDEX,
  ROBOTS_NOINDEX,
  isIndexablePath,
  robotsDirective,
  robotsHostKind,
  siteIndexable,
} from "@/lib/robots";

const UUID = "123e4567-e89b-42d3-a456-426614174000";

const ENVS = ["production", "preview", "development", "", undefined] as const;
const ACCESS = ["live", "grace", "preview", "suspended", "unknown-state", undefined, null] as const;
// [label, host, isPrimaryDomain, expected host kind]
const HOSTS = [
  ["canonical", "rosecityfutbolclub.com", true, "canonical"],
  ["canonical with port and case", "RoseCityFutbolClub.com:443", true, "canonical"],
  ["secondary verified domain", "www.rosecityfutbolclub.com", false, "secondary"],
  ["vercel.app deployment", "onzio-abc123.vercel.app", true, "vercel"],
  ["vercel.app preview", "alpha-onzio.vercel.app", false, "vercel"],
  ["localhost", "localhost:3000", true, "local"],
  ["tenant .localhost", "alpha.localhost", true, "local"],
  ["missing host", null, true, "unknown"],
] as const;
// [label, path, indexable]
const PATHS = [
  ["home", "/", true],
  ["roster", "/roster", true],
  ["schedule", "/schedule", true],
  ["club about", "/club/about", true],
  ["cinematic tickets", "/tickets", true],
  ["cinematic destination", "/stadium/parking", true],
  ["news article", "/news/injury-report", true],
  ["program detail", "/programs/spring-academy", true],
  ["fixture detail", `/schedule/${UUID}`, true],
  ["player profile", `/roster/${UUID}`, false],
  ["sponsor redirect", `/r/${UUID}`, false],
  ["registration form", "/register/spring-2027", false],
  ["registration confirmation", "/register/spring-2027/confirmation", false],
  ["club logo asset", "/club-logo", false],
  ["admin", "/admin", false],
  ["admin page", "/admin/payments", false],
  ["auth callback", "/admin/auth/callback", false],
  ["api", "/api/register", false],
  ["internal club path", "/_clubs/rose-city", false],
  ["encoded internal club path", "/%5fclubs/rose-city/roster", false],
  ["unknown path", "/no-such-page", false],
  ["robots.txt", "/robots.txt", false],
  ["sitemap.xml", "/sitemap.xml", false],
] as const;

describe("robotsHostKind", () => {
  it.each(HOSTS)("%s", (_label, host, primary, kind) => {
    expect(robotsHostKind(host, primary)).toBe(kind);
  });
});

describe("isIndexablePath", () => {
  it.each(PATHS)("%s", (_label, path, expected) => {
    expect(isIndexablePath(path)).toBe(expected);
  });
});

describe("robotsDirective matrix: env x public_access x host kind x path kind", () => {
  for (const env of ENVS) {
    for (const access of ACCESS) {
      for (const [hostLabel, host, primary, kind] of HOSTS) {
        it(`env=${String(env)} access=${String(access)} host=${hostLabel}: every path kind`, () => {
          for (const [pathLabel, path, pathIndexable] of PATHS) {
            // Written out from the policy, not computed by calling the decider:
            // indexed only when every condition holds.
            const indexed =
              env === "production" && access === "live" && kind === "canonical" && pathIndexable;
            expect(
              robotsDirective({ vercelEnv: env, host, path, publicAccess: access, isPrimaryDomain: primary }),
              pathLabel,
            ).toBe(indexed ? ROBOTS_INDEX : ROBOTS_NOINDEX);
          }
        });
      }
    }
  }
});

describe("named launch cases", () => {
  const base = { vercelEnv: "production", path: "/", isPrimaryDomain: true } as const;

  it("Rose City live on its canonical domain is indexable", () => {
    expect(robotsDirective({ ...base, host: "rosecityfutbolclub.com", publicAccess: "live" })).toBe(ROBOTS_INDEX);
  });

  it("Diverse City in grace stays noindex (open decision: only live is indexed)", () => {
    expect(robotsDirective({ ...base, host: "diversecityfc.com", publicAccess: "grace" })).toBe(ROBOTS_NOINDEX);
  });

  it("a preview club stays noindex", () => {
    expect(robotsDirective({ ...base, host: "bravo.example.com", publicAccess: "preview" })).toBe(ROBOTS_NOINDEX);
  });

  it("*.vercel.app stays noindex even for a live club", () => {
    expect(robotsDirective({ ...base, host: "onzio-git-main.vercel.app", publicAccess: "live" })).toBe(ROBOTS_NOINDEX);
  });

  it("an unknown tenant (no access, no host) is noindex", () => {
    expect(robotsDirective({ ...base, host: null, publicAccess: undefined, isPrimaryDomain: false })).toBe(ROBOTS_NOINDEX);
  });
});

describe("siteIndexable", () => {
  it("is true only where the home page would be indexed", () => {
    const live = { vercelEnv: "production", host: "rosecityfutbolclub.com", publicAccess: "live", isPrimaryDomain: true };
    expect(siteIndexable(live)).toBe(true);
    expect(siteIndexable({ ...live, publicAccess: "grace" })).toBe(false);
    expect(siteIndexable({ ...live, vercelEnv: "preview" })).toBe(false);
    expect(siteIndexable({ ...live, isPrimaryDomain: false })).toBe(false);
  });
});

describe("isPublicSiteIndexable", () => {
  it("accepts only live; grace is open to visitors but not indexed", () => {
    expect(isPublicSiteIndexable("live")).toBe(true);
    for (const other of ["grace", "preview", "suspended", "private_preview", "", null, undefined, 3]) {
      expect(isPublicSiteIndexable(other)).toBe(false);
    }
  });
});
