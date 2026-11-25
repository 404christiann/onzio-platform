import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { isPublicSiteOpen, publicSiteState } from "@/lib/club-access";

// Public visibility of a club's site is decided in exactly one place:
// publicSiteState / isPublicSiteOpen in lib/club-access.ts. This test fails if
// a second decider (a slug list, another RPC reader, a literal mapping of
// public_access to visible/hidden) shows up.

const ROOT = process.cwd();
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "coverage", "test-results", "playwright-report"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

const rel = (file: string) => relative(ROOT, file).split("\\").join("/");
const read = (file: string) => readFileSync(file, "utf8");
const THIS_FILE = "tests/contracts/public-site-access-decider.test.ts";
const allFiles = ["app", "lib", "components", "scripts", "tests", "packages"]
  .flatMap((dir) => { try { return walk(join(ROOT, dir)); } catch { return []; } })
  .concat(join(ROOT, "middleware.ts"));
const productionFiles = allFiles.filter((f) => /^(app|lib|components)\//.test(rel(f)) || rel(f) === "middleware.ts");

describe("one public-site visibility decider", () => {
  it("publicSiteState maps live|grace to open, preview to prelaunch, everything else to suspended", () => {
    expect(publicSiteState("live")).toBe("open");
    expect(publicSiteState("grace")).toBe("open");
    expect(publicSiteState("preview")).toBe("prelaunch");
    for (const other of ["suspended", "private_preview", "", null, undefined, 3])
      expect(publicSiteState(other)).toBe("suspended");
    expect(isPublicSiteOpen("live")).toBe(true);
    expect(isPublicSiteOpen("grace")).toBe(true);
    expect(isPublicSiteOpen("preview")).toBe(false);
    expect(isPublicSiteOpen("suspended")).toBe(false);
  });

  it("no code or test refers to the removed slug hold list", () => {
    const offenders = allFiles
      .filter((f) => rel(f) !== THIS_FILE)
      .filter((f) => /PUBLIC_SITE_HOLD|public-site-hold/.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("get_club_runtime_access is called from exactly one place: middleware.ts", () => {
    const callers = productionFiles
      .filter((f) => !rel(f).startsWith("lib/db-types") && !rel(f).startsWith("lib/database.generated"))
      .filter((f) => /get_club_runtime_access/.test(read(f)))
      .map(rel);
    expect(callers).toEqual(["middleware.ts"]);
  });

  it("middleware decides public visibility only through isPublicSiteOpen / publicSiteState", () => {
    const source = read(join(ROOT, "middleware.ts"));
    expect(source).toMatch(/isPublicSiteOpen\(runtimeAccess\)/);
    // The one allowed literal comparison is the suspended admin lockdown (admin/billing
    // enforcement, not public visibility of the club site).
    const literal = /(runtimeAccess|publicAccess|public_access)\s*(===|!==|==|!=)\s*["'](live|grace|preview|private_preview)["']/g;
    expect(source.match(literal) ?? []).toEqual([]);
    expect(source).not.toMatch(/["']private_preview["']/);
  });

  // Modules that legitimately look at public_access values for something other
  // than "is the public site visible". Each needs a reason; a new entry is a
  // review decision, not a way to add a second decider.
  const CAN_MUTATE = "admin editing capability (mirror of DB can_mutate_content: live and grace), not site visibility";
  const ALLOWLIST: Record<string, string> = {
    "lib/club-access.ts": "the decider itself, plus resolvePublicAccess (TS mirror of the DB rule)",
    "middleware.ts": "suspended admin/billing lockdown and redirect; public visibility goes through isPublicSiteOpen",
    "lib/billing-lifecycle.ts": "billing writer: decides whether a transition stores a suspended access",
    "lib/tenant-routing.ts": "tenant-resolution contract helper: SUSPENDED_TENANT error",
    "lib/admin-tab-page.ts": CAN_MUTATE,
    "app/admin/(protected)/page.tsx": CAN_MUTATE,
    "components/AdminShell.tsx": "canMutateContent plus the admin grace and suspended banners",
  };

  const MAPPING =
    /(?:public_?[aA]ccess|runtimeAccess|\baccess)\s*(?:===|!==|==|!=)\s*["'](?:live|grace|preview|suspended)["']|\.public_?[aA]ccess\s+in\s*\[|\[\s*["']live["']\s*,\s*["']grace["']\s*\]\.includes/;

  it("no other module defines its own public_access -> visibility mapping", () => {
    // A visibility mapping compares public_access/publicAccess/runtimeAccess to
    // a state literal and is not one of the allowlisted non-visibility uses.
    const offenders = productionFiles
      .filter((f) => !(rel(f) in ALLOWLIST))
      .filter((f) => !rel(f).startsWith("app/api/stripe/") && !rel(f).startsWith("app/api/cron/") && !rel(f).startsWith("lib/email/"))
      .filter((f) => MAPPING.test(read(f)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("every allowlist entry still exists, still matches, and has a reason", () => {
    for (const [file, reason] of Object.entries(ALLOWLIST)) {
      expect(reason.length, file).toBeGreaterThan(10);
      expect(MAPPING.test(read(join(ROOT, file))), `${file} no longer needs its allowlist entry`).toBe(true);
    }
  });
});
