import { describe, expect, it } from "vitest";
import { ROSE_CITY_CLUB_ID } from "../../scripts/rose-city-2027-operator-sql";
import { hasOpsFile, readOpsFile } from "../helpers/ops-repo";

// TELEMETRY-01: the operator SQL that turns the paid telemetry add-on on for
// Rose City. tests/database/page-telemetry.test.ts runs both files for real.

const REHEARSAL = "scripts/operator-sql/rose-city-telemetry-enable.rehearsal.sql";
const COMMIT = "scripts/operator-sql/rose-city-telemetry-enable.commit.sql";
const present = hasOpsFile(REHEARSAL) && hasOpsFile(COMMIT);
const rehearsal = present ? readOpsFile(REHEARSAL) : "";
const commit = present ? readOpsFile(COMMIT) : "";

function statements(sql: string): string[] {
  return sql.split("\n").filter((line) => !line.startsWith("--"));
}

describe.skipIf(!present)("Rose City telemetry operator SQL", () => {
  it("is one transaction: the rehearsal ends in ROLLBACK, the commit file in COMMIT, and nothing else differs", () => {
    const body = (sql: string) => statements(sql).join("\n").trim();
    expect(body(rehearsal).startsWith("begin;")).toBe(true);
    expect(body(rehearsal).endsWith("\nrollback;")).toBe(true);
    expect(body(commit).endsWith("\ncommit;")).toBe(true);
    expect(body(commit).replace(/\ncommit;$/, "\nrollback;")).toBe(body(rehearsal));
    for (const sql of [rehearsal, commit]) {
      expect(sql.match(/^(begin|commit|rollback);$/gm)).toHaveLength(2);
    }
  });

  it("targets Rose City by id and slug, and refuses an archived club or a missing migration", () => {
    for (const sql of [rehearsal, commit]) {
      expect(sql).toContain(`v_club_id constant uuid := '${ROSE_CITY_CLUB_ID}';`);
      expect(sql).toContain("v_club.slug <> 'rose-city'");
      expect(sql).toContain("raise exception 'ROSE_CITY_ARCHIVED'");
      expect(sql).toContain("raise exception 'MIGRATION_MISSING");
    }
  });

  it("writes only the telemetry grant and its audit event, idempotently", () => {
    const writes = [...rehearsal.matchAll(/\b(insert\s+into|update|delete\s+from)\s+([a-z_]+\.[a-z_]+)/gi)].map((m) => `${m[1].toLowerCase().replace(/\s+/g, " ")} ${m[2]}`);
    expect(writes).toEqual(["insert into onzio_private.club_addons", "insert into onzio.audit_events"]);
    expect(rehearsal).toContain("values (v_club_id, 'telemetry')");
    expect(rehearsal).toContain("on conflict (club_id, addon) do nothing");
    // A rerun returns before writing anything, so it never adds a second audit event.
    const noop = rehearsal.indexOf("perform set_config('onzio_operator.result', 'no-op', true);\n    return;");
    expect(noop).toBeGreaterThan(0);
    expect(noop).toBeLessThan(rehearsal.indexOf("insert into onzio_private.club_addons"));
    expect(rehearsal).toContain("'migration', 'manual.club_addon_grant', 'club_addon', 'telemetry'");
    expect(rehearsal).toContain("as all_ok");
  });
});
