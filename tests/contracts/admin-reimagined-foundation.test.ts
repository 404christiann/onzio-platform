import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ADMIN-RE-01: the reimagined-admin columns on onzio.clubs must never be read by
// tenant resolution. lib/club-context.ts runs on every request for every club,
// so a column there that production lacks takes every public site down
// (the 2026-08-14 UNKNOWN_TENANT outage). The admin reads them separately,
// fail-safe (ADMIN-RE-02).

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const MIGRATION = "supabase/migrations/20261108120000_admin_reimagined_foundation.sql";
const ADMIN_ONLY_CLUB_COLUMNS = ["admin_portal", "admin_flags", "time_zone", "time_zone_set_at"];

describe("ADMIN-RE-01 foundation migration", () => {
  it("only adds columns, each with a default or nullable", () => {
    const sql = read(MIGRATION).replace(/--.*$/gm, "");
    expect(sql).toContain("add column admin_portal text not null default 'classic'");
    expect(sql).toContain("add column admin_flags jsonb not null default '{}'::jsonb");
    expect(sql).toContain("add column time_zone text not null default 'America/Los_Angeles'");
    expect(sql).toMatch(/add column time_zone_set_at timestamptz;/);
    expect(sql).toMatch(/alter table onzio\.club_members\s+add column display_name text/);
    expect(sql).not.toMatch(/\bdrop\s+(column|table|policy|function)\b/i);
    expect(sql).not.toMatch(/\bgrant\b|\brevoke\b|\bcreate policy\b/i);
  });

  it("scopes its only row updates to the two live clubs by slug", () => {
    const updates = read(MIGRATION).match(/update onzio\.\w+[\s\S]*?;/g) ?? [];
    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatch(/set time_zone = 'America\/Chicago', time_zone_set_at = now\(\)\s+where slug = 'diverse-city';$/);
    expect(updates[1]).toMatch(/set time_zone_set_at = now\(\)\s+where slug = 'rose-city';$/);
  });
});

describe("tenant resolution never selects the admin-only club columns", () => {
  const source = read("lib/club-context.ts");
  const selects = [...source.matchAll(/\.select\(\s*"([^"]*)"/g)].map((match) => match[1]);

  it("still has the clubs selects this test guards", () => {
    expect(selects.some((columns) => columns.includes("clubs!inner(") && columns.includes("store_enabled"))).toBe(true);
    expect(selects.some((columns) => columns.startsWith("id, slug, name") && columns.includes("store_enabled"))).toBe(true);
  });

  it.each(ADMIN_ONLY_CLUB_COLUMNS)("does not select %s", (column) => {
    for (const columns of selects) {
      expect(columns.split(/[\s,()!]+/)).not.toContain(column);
    }
  });
});
