import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ADMIN-RE-02: the per-club admin switch. Modelled on
// tests/contracts/store-enabled-operator.test.ts.

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const SCRIPT = "scripts/set-club-admin-portal.ts";
const ROUTE = "app/api/admin/club-time-zone/route.ts";

function listFilesRecursively(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...listFilesRecursively(path));
    else files.push(path);
  }
  return files;
}

describe("operator script: scripts/set-club-admin-portal.ts", () => {
  const source = read(SCRIPT);

  it("is dry-run by default and requires --execute to write", () => {
    expect(source).toContain('execute: flags.has("--execute")');
    expect(source).toContain("if (!execute) {");
    expect(source).toMatch(/Dry run only[\s\S]*no write performed/);
  });

  it("guards non-loopback targets with a --confirm-project=<ref> refusal", () => {
    expect(source).toContain("LOOPBACK_HOSTS");
    expect(source).toContain("if (execute && !isLoopback) {");
    expect(source).toMatch(/Refusing non-local write without --confirm-project=/);
  });

  it("validates every input before touching the database", () => {
    expect(source).toContain('"--portal must be classic or reimagined"');
    expect(source).toContain("const FLAG_NAME = /^[a-z][a-z0-9_]{0,39}$/;");
    expect(source).toMatch(/is in both --on and --off/);
    expect(source).toContain("isValidTimeZone(timeZone)");
    expect(source).toMatch(/Nothing to change: pass --portal, --on, --off or --time-zone/);
    expect(source).toMatch(/Unknown option/);
  });

  it("confirms any zone it sets, so the automatic browser set never overrides Onzio", () => {
    expect(source).toContain("update.time_zone_set_at = new Date().toISOString();");
  });

  it("writes through the service-role client, audits, and reconciles", () => {
    expect(source).toContain('.schema("onzio")');
    expect(source).toContain('operation: "manual.club_admin_portal_set"');
    expect(source).toContain("Reconciliation failed: the admin portal settings did not persist as expected");
  });

  it("is never imported or referenced from any app/ file (standalone CLI only)", () => {
    const appFiles = listFilesRecursively(resolve(process.cwd(), "app")).filter((path) => /\.(tsx?|jsx?)$/.test(path));
    for (const file of appFiles) {
      expect(readFileSync(file, "utf8")).not.toMatch(/set-club-admin-portal/);
    }
  });
});

describe("the admin reads the switch fail-safe", () => {
  it("reads the columns in lib/admin-portal.ts with the user-scoped client, never in tenant resolution", () => {
    const portal = read("lib/admin-portal.ts");
    expect(portal).toContain('.select("admin_portal, admin_flags, time_zone, time_zone_set_at")');
    expect(portal).toMatch(/catch \{\s*return CLASSIC_ADMIN_PORTAL;/);
    expect(portal).not.toMatch(/supabase-service-role|SUPABASE_SERVICE_ROLE_KEY/);
    expect(read("lib/club-context.ts")).not.toMatch(/admin_portal|admin_flags|time_zone/);
  });

  // ADMIN-RE-05 changed this on purpose: RE-02 rendered the classic shell for
  // both values; now "reimagined" gets the reimagined shell and anything else,
  // including a failed read, keeps the classic one. ADMIN-RE-24 gave the
  // reimagined shell its tabs, worked out only for a reimagined club.
  it("picks the shell by portal inside the provider, classic unless the read says reimagined", () => {
    const layout = read("app/admin/(protected)/layout.tsx");
    expect(layout).toContain("const portal = await readAdminPortal(supabase, club.id);");
    expect(layout).toMatch(/let shell: [^\n]* \| null = null;\s*if \(portal\.portal === "reimagined"\) \{/);
    expect(layout).toMatch(
      /<AdminPortalProvider settings=\{portal\} isOwner=\{club\.role === "owner"\}>[\s\S]*\{shell \? \(\s*<ReimaginedShell tabs=\{shell\.tabs\} targets=\{shell\.targets\} dots=\{shell\.dots\}>\s*\{children\}\s*<\/ReimaginedShell>\s*\) : \(\s*<AdminShell>\{children\}<\/AdminShell>\s*\)\}\s*<\/AdminPortalProvider>/,
    );
  });
});

describe("automatic time zone (decision 1)", () => {
  it("only an owner's browser sends it, once, and only while none is confirmed", () => {
    const provider = read("components/admin/AdminPortalProvider.tsx");
    expect(provider).toContain("if (!isOwner || settings.timeZoneConfirmed || sent.current) return;");
    expect(provider).toContain("Intl.DateTimeFormat().resolvedOptions().timeZone");
    expect(provider).toContain('fetch("/api/admin/club-time-zone"');
  });

  it("the route is owner-only, takes the club from the session, and rejects extra fields", () => {
    const route = read(ROUTE);
    expect(route).toContain('if (club.role !== "owner") throw new ContractError("OWNER_REQUIRED");');
    expect(route).toContain("assertClubOwnerSession(accessToken, club.id)");
    expect(route).toContain("z.object({ timeZone: z.string().min(1).max(64) }).strict()");
    expect(route).not.toMatch(/club_?[iI]d\s*:/);
    expect(route).not.toMatch(/supabase-service-role|SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("the write validates the zone and never overrides a confirmed one", () => {
    const membership = read("lib/owner-admin-membership.ts");
    expect(membership).toContain('if (!isValidTimeZone(timeZone)) failContract("INVALID_TIME_ZONE");');
    expect(membership).toContain('.is("time_zone_set_at", null)');
    expect(membership).toContain('operation: "club_time_zone_set"');
  });
});
