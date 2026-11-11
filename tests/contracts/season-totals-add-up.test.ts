import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { adminDataRequestSchema, ADMIN_TABLE_FEATURES } from "@/lib/admin-data-contract";
import {
  adjustmentFor,
  adjustmentProblem,
  FIELD_TOTAL_KEYS,
  KEEPER_TOTAL_KEYS,
  SEASON_ADJUSTMENT_LIMIT,
  sumGames,
} from "@/lib/season-totals";

// ADMIN-RE-11c (decision 0001): season totals are the season's player numbers
// added up plus a hand-entered adjustment. Pins who reads the totals, how a typed
// total becomes an adjustment, the adjustment limits, and that nothing touched the
// tenant select in lib/club-context.ts.

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = source("supabase/migrations/20261110220000_season_totals_add_up.sql");
const PLAYER = "11111111-1111-4111-8111-111111111111";
const SEASON = "22222222-2222-4222-8222-222222222222";

describe("who reads season totals", () => {
  it("the public roster, the Seasons hub, analytics and the old editors read the totals views", () => {
    for (const path of [
      "lib/queries.ts",
      "lib/admin-seasons-data.ts",
      "lib/admin-analytics-data.ts",
      "components/admin/reimagined/SeasonsHub.tsx",
      "components/admin/stats/SeasonStatsEditor.tsx",
      "components/admin/ClassicSeasonsPage.tsx",
      "app/admin/(protected)/roster/page.tsx",
    ]) {
      const file = source(path);
      expect(file, path).toMatch(/player_season_totals/);
      expect(file, path).toMatch(/goalkeeper_season_totals/);
    }
  });

  it("no longer reads the typed numbers in *_season_stats anywhere", () => {
    // What is still allowed: who is in a season (player_id), seeding, and deleting rows.
    const reads = [
      "lib/queries.ts",
      "lib/admin-seasons-data.ts",
      "lib/admin-analytics-data.ts",
      "components/admin/stats/SeasonStatsEditor.tsx",
    ].map((path) => [path, source(path)] as const);
    for (const [path, file] of reads) {
      expect(file, path).not.toMatch(/from\("(player|goalkeeper)_season_stats"\)\.select\("\*"\)/);
      expect(file, path).not.toMatch(/from\("(player|goalkeeper)_season_stats"\)\s*\.select\((FIELD|KEEPER)_/);
    }
  });

  it("a player's match log lists the games they played in, not games with minutes", () => {
    const queries = source("lib/queries.ts");
    expect(queries).not.toMatch(/\.gt\("mins", 0\)/);
    expect(queries.match(/\.eq\("played", true\)/g)).toHaveLength(2);
  });

  it("leaves the tenant select alone (the 2026-08-14 outage)", () => {
    const clubContext = source("lib/club-context.ts");
    for (const word of ["season_totals", "season_adjustments", "played"]) {
      expect(clubContext).not.toContain(word);
    }
  });
});

describe("a typed total becomes an adjustment", () => {
  it("adds up games the way the views do: starts counts the games started", () => {
    const sums = sumGames(
      [
        { player_id: PLAYER, goals: 2, starts: true, mins: 90 },
        { player_id: PLAYER, goals: 3, starts: false, mins: 30 },
        { player_id: "other", goals: 9 },
      ],
      FIELD_TOTAL_KEYS,
    );
    expect(sums.get(PLAYER)).toMatchObject({ goals: 5, starts: 1, mins: 120, assists: 0 });
    expect(sums.get("other")?.goals).toBe(9);
  });

  it("is typed - games, negative when the games give more (keep today's numbers)", () => {
    expect(adjustmentFor({ goals: 7, mins: 990 }, { goals: 5, mins: 90 }, FIELD_TOTAL_KEYS)).toMatchObject({ goals: 2, mins: 900, red: 0 });
    expect(adjustmentFor({ saves: 2, red: 0 }, { saves: 2, red: 2 }, KEEPER_TOTAL_KEYS)).toMatchObject({ saves: 0, red: -2 });
    expect(adjustmentFor({ goals: 3 }, undefined, FIELD_TOTAL_KEYS).goals).toBe(3);
  });

  it("keeps every number within 9,999, either way", () => {
    expect(SEASON_ADJUSTMENT_LIMIT).toBe(9999);
    const ok = adjustmentFor({ mins: 9999, goals: 9999 }, undefined, FIELD_TOTAL_KEYS);
    expect(adjustmentProblem(ok, FIELD_TOTAL_KEYS)).toBeNull();
    expect(adjustmentProblem({ ...ok, mins: 10_000 }, FIELD_TOTAL_KEYS)).toBe("Minutes added by hand stop at 9,999.");
    expect(adjustmentProblem({ ...ok, goals: -10_000 }, FIELD_TOTAL_KEYS)).toBe("Numbers added by hand stop at 9,999.");
  });

  it("uses the same limits as the database", () => {
    expect(migration).toContain("check (mins between -9999 and 9999)");
    expect(migration).toContain("check (goals between -9999 and 9999)");
    expect(migration).toContain("check (saves between -9999 and 9999)");
    expect(migration).not.toMatch(/between -999 and 999\)/);
  });
});

describe("the admin data route", () => {
  it("reads the totals views and never writes them", () => {
    expect(ADMIN_TABLE_FEATURES.player_season_totals).toBe("roster");
    expect(ADMIN_TABLE_FEATURES.goalkeeper_season_totals).toBe("roster");
    expect(adminDataRequestSchema.safeParse({ table: "player_season_totals", operation: "select" }).success).toBe(true);
    for (const operation of ["insert", "update", "upsert", "delete"]) {
      for (const table of ["player_season_totals", "goalkeeper_season_totals"]) {
        const request = adminDataRequestSchema.safeParse({ table, operation, payload: { goals: 1 } });
        expect(request.success, `${table} ${operation}`).toBe(false);
      }
    }
  });

  it("writes adjustments inside the limits, negative included", () => {
    const save = (table: string, row: Record<string, unknown>) =>
      adminDataRequestSchema.safeParse({ table, operation: "upsert", onConflict: "player_id,season_id", payload: [row] }).success;
    expect(save("player_season_adjustments", { player_id: PLAYER, season_id: SEASON, goals: -3, mins: 9999 })).toBe(true);
    expect(save("goalkeeper_season_adjustments", { player_id: PLAYER, season_id: SEASON, red: -2, mins: -9999 })).toBe(true);
    expect(save("player_season_adjustments", { player_id: PLAYER, season_id: SEASON, mins: 10_000 })).toBe(false);
    expect(save("player_season_adjustments", { player_id: PLAYER, season_id: SEASON, goals: 1.5 })).toBe(false);
    expect(save("player_season_adjustments", { player_id: PLAYER, season_id: SEASON, saves: 1 })).toBe(false);
    expect(save("goalkeeper_season_adjustments", { player_id: PLAYER, season_id: SEASON, goals: 1 })).toBe(false);
  });
});

describe("the migration", () => {
  it("keeps the typed totals and backfills typed - games", () => {
    expect(migration).not.toMatch(/update onzio\.(player|goalkeeper)_season_stats/);
    expect(migration).not.toMatch(/alter table onzio\.(player|goalkeeper)_season_stats/);
    expect(migration).toContain("s.goals - g.goals");
    expect(migration).toContain("s.saves - g.saves");
  });

  it("reads totals with the reader's rights, and never shows one below 0", () => {
    expect(migration.match(/with \(security_invoker = true\)/g)).toHaveLength(2);
    expect(migration).toContain("greatest(0, g.mins + coalesce(a.mins, 0))");
    expect(migration.match(/raise exception 'SEASON_TOTAL_BELOW_ZERO'/g)).toHaveLength(2);
    expect(migration.match(/security definer/g)).toBeNull();
  });
});
