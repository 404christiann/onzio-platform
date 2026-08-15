// Contract tests for scripts/seed-lions-standings-production.ts.
//
// The load-bearing assertion here is the negative one: this script must never
// write onzio.league_standings_settings. On 2026-08-15 an earlier version
// upserted that block and silently reverted a heading Christian had set
// through /admin/standings. Any script that writes club-editable copy
// overwrites the club's edit on every run, and this script is expected to run
// routinely as the league table moves — so the fix was structural, and this
// test is what keeps it structural.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LIONS_STANDINGS } from "@/lib/migration/lions-standings";
import { buildStandingsSql, standingsDigest } from "@/scripts/seed-lions-standings-production";

const PRODUCTION_TENANT_ID = "3b6b71dc-b27a-4f39-bbee-a95ae9d6bf52";

describe("Lions standings seeder — never writes club-editable copy", () => {
  it("emits no write to league_standings_settings", () => {
    const sql = buildStandingsSql([]);
    expect(sql).not.toMatch(/insert into onzio\.league_standings_settings/);
    expect(sql).not.toMatch(/update onzio\.league_standings_settings/);
    expect(sql).not.toMatch(/delete from onzio\.league_standings_settings/);
  });

  it("emits none of the heading copy as a literal, from either wording", () => {
    const sql = buildStandingsSql([]);
    // The club's current heading…
    expect(sql).not.toContain("Ohio/Indy Conference Standings");
    expect(sql).not.toContain("2026 Spring Season");
    // …and the stale copy that caused the revert.
    expect(sql).not.toContain("Ohio Valley Division");
    expect(sql).not.toContain("League standings and team statistics");
  });

  it("does not import the settings block at all, so it cannot regress by accident", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/seed-lions-standings-production.ts"),
      "utf8",
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain("LIONS_STANDINGS_SETTINGS");
  });

  it("still reports the settings row in the receipt, without writing it", () => {
    // Reporting is useful — an operator can see whether the club has set a
    // heading yet — and is not a write.
    expect(buildStandingsSql([])).toContain("'settings', (select count(*) from onzio.league_standings_settings");
  });

  it("keeps the audit digest over rows only", () => {
    // Folding heading copy into the digest would make an admin edit look like
    // a standings change and write an audit row for content this script never
    // touched.
    const digest = standingsDigest();
    expect(digest).toHaveLength(64);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("Lions standings seeder — the data half still works", () => {
  it("writes all nine rows, in published order, scoped to the tenant", () => {
    const sql = buildStandingsSql([]);
    const inserts = sql.match(/insert into onzio\.league_standings as target/g) ?? [];
    expect(inserts).toHaveLength(LIONS_STANDINGS.length);
    expect(inserts).toHaveLength(9);

    let cursor = -1;
    LIONS_STANDINGS.forEach((row, index) => {
      const at = sql.indexOf(`'${row.team_name.replaceAll("'", "''")}', 10,`);
      expect(at, `${row.team_name} missing`).toBeGreaterThan(-1);
      expect(at, `${row.team_name} out of published order`).toBeGreaterThan(cursor);
      cursor = at;
      // sort_order is the array index, which is what the public table renders by.
      expect(sql).toContain(`, ${index}, now())`);
    });
  });

  it("guards every upsert against touching another club's row", () => {
    // Standing row ids derive from the team name alone, so they are identical
    // across local, staging and production. Without this guard a colliding id
    // updates the other club's row and silently inserts nothing here.
    const sql = buildStandingsSql([]);
    const guards = sql.match(
      new RegExp(`where target\\.club_id = '${PRODUCTION_TENANT_ID}'::uuid`, "g"),
    ) ?? [];
    expect(guards).toHaveLength(9);
  });

  it("scopes the prune to this club and keeps every seeded row", () => {
    const sql = buildStandingsSql([]);
    const prune = sql.match(/delete from onzio\.league_standings where[^;]+;/)?.[0];
    expect(prune).toBeDefined();
    expect(prune).toContain(`club_id = '${PRODUCTION_TENANT_ID}'::uuid`);
    expect(prune).toContain("id not in (");
    // All nine keep-ids present, so a replay prunes nothing.
    expect((prune!.match(/::uuid/g) ?? []).length).toBe(10); // 1 club_id + 9 keeps
  });

  it("asserts identity but not lifecycle, so it survives go-live", () => {
    const sql = buildStandingsSql([]);
    expect(sql).toContain("slug = 'lions'");
    expect(sql).toContain("name = 'Lions Football Club'");
    // These would break the script permanently once Stripe flips the club.
    expect(sql).not.toContain("lifecycle = 'onboarding'");
    expect(sql).not.toContain("public_access = 'preview'");
    expect(sql).not.toContain("tier = 'starter'");
    expect(sql).not.toContain("club_subscriptions");
  });
});
