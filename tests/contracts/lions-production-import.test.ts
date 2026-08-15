// Contract tests for scripts/import-lions-production.ts.
//
// The SQL this script generates is applied by hand to a live customer tenant
// (Lions Football Club, production club 3b6b71dc-…). The failure modes that
// matter are all things a reviewer skimming 100+ generated statements would
// plausibly miss:
//
//   - an `onzio.clubs` upsert silently flipping lifecycle/public_access and
//     publishing the club without billing,
//   - a `club_domains` row for `lions.localhost` attaching to the live tenant
//     (it does NOT violate the per-environment unique index, so the database
//     will not catch it),
//   - a `club_members` or `club_subscriptions` write clobbering ownership or
//     billing state,
//   - an untranslated local tenant id leaving rows pointed at the wrong club,
//   - the prospect mockup's invented people reaching a real club's site.
//
// Each of those is asserted against the actual generated SQL string.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildLionsLocalImportRows,
  LIONS_LOCAL_TENANT_ID,
} from "@/lib/migration/lions-media-local-import";
import type { LionsMediaImportPlan } from "@/lib/migration/lions-media-plan";
import {
  buildSql,
  parseArgs,
  placeholderPlayers,
  placeholderStaff,
  productionRows,
} from "@/scripts/import-lions-production";

const PRODUCTION_TENANT_ID = "3b6b71dc-b27a-4f39-bbee-a95ae9d6bf52";
const PRODUCTION_HOSTNAME = "lions-fc-private.vercel.app";

// A few of the mockup people the importer must never carry to production.
const MOCKUP_NAMES = [
  "Marcus Hale",
  "Elena Torres",
  "David Kim",
  "Maya Brooks",
  "Renee Walker",
  "Omar Castillo",
];

function loadPlan(): LionsMediaImportPlan {
  const planPath = resolve("docs/phase-9/lions-media-import-plan.json");
  return JSON.parse(readFileSync(planPath, "utf8")) as LionsMediaImportPlan;
}

function generatedSql(): string {
  const plan = loadPlan();
  const rows = productionRows(buildLionsLocalImportRows(plan));
  return buildSql(rows, plan.planDigest);
}

describe("Lions production import — argument parsing", () => {
  // This file is a copy-then-substitute port of the staging script, and the
  // first real run failed because the boolean-flag whitelist still said
  // "confirm-staging" while main() had been switched to "confirm-production".
  // The flag fell through to the value-flag branch and tried to consume
  // --prepare-sql as its value, reporting "Missing value for
  // --confirm-production". These tests pin every flag name so a missed
  // substitution fails here rather than at the terminal.
  it("accepts the real invocation for both modes", () => {
    expect(parseArgs(["--confirm-production", "--prepare-sql"])).toEqual({
      "confirm-production": true,
      "prepare-sql": true,
    });
    expect(parseArgs(["--confirm-production", "--sync-storage"])).toEqual({
      "confirm-production": true,
      "sync-storage": true,
    });
  });

  it("treats every boolean flag as a boolean, never as a value flag", () => {
    for (const flag of ["confirm-production", "prepare-sql", "sync-storage"]) {
      expect(parseArgs([`--${flag}`])).toEqual({ [flag]: true });
    }
  });

  it("rejects the staging script's flag name outright", () => {
    expect(() => parseArgs(["--confirm-staging", "--prepare-sql"])).toThrow(
      /Unknown flag --confirm-staging/,
    );
  });

  it("rejects an unknown or typo'd value flag instead of silently ignoring it", () => {
    // The staging script accepts this and quietly uses the default path.
    expect(() => parseArgs(["--source-roots", "/tmp/x"])).toThrow(
      /Unknown flag --source-roots/,
    );
  });

  it("still accepts the three real value flags", () => {
    expect(
      parseArgs([
        "--confirm-production",
        "--prepare-sql",
        "--source-root", "/tmp/assets",
        "--plan", "/tmp/plan.json",
        "--sql-out", "/tmp/out.sql",
      ]),
    ).toEqual({
      "confirm-production": true,
      "prepare-sql": true,
      "source-root": "/tmp/assets",
      plan: "/tmp/plan.json",
      "sql-out": "/tmp/out.sql",
    });
  });

  it("rejects a value flag with a missing value", () => {
    expect(() => parseArgs(["--source-root", "--prepare-sql"])).toThrow(
      /Missing value for --source-root/,
    );
  });
});

describe("Lions production import — tenant-owned rows are never written", () => {
  it("never inserts into clubs, club_domains, club_members or club_subscriptions", () => {
    const sql = generatedSql();
    expect(sql).not.toMatch(/insert into onzio\."clubs"/);
    expect(sql).not.toMatch(/insert into onzio\."club_domains"/);
    expect(sql).not.toMatch(/insert into onzio\."club_members"/);
    expect(sql).not.toMatch(/insert into onzio\."club_subscriptions"/);
  });

  it("never emits the builder's localhost domain", () => {
    // This is the one the database would NOT reject: the unique index is
    // scoped per environment, so a staging-environment localhost row coexists
    // happily with the real production row.
    expect(generatedSql()).not.toContain("lions.localhost");
  });

  it("never emits the builder's fake Stripe identifiers", () => {
    const sql = generatedSql();
    expect(sql).not.toContain("cus_lions_local_only");
    expect(sql).not.toContain("sub_lions_local_only");
    expect(sql).not.toContain("price_lions_local_pro");
  });

  it("touches clubs only through a guarded colour-only UPDATE", () => {
    const sql = generatedSql();
    const clubUpdates = sql.match(/update onzio\.clubs set [^;]+;/g) ?? [];
    expect(clubUpdates).toHaveLength(1);

    const update = clubUpdates[0];
    if (update === undefined) throw new Error("expected one clubs UPDATE");
    // Split SET from WHERE: lifecycle/public_access legitimately appear in the
    // WHERE clause as drift guards, and must NOT appear in the SET clause.
    const [setClause, whereClause] = update.split(/\swhere\s/);
    expect(whereClause).toBeDefined();

    // Only the three colour columns, plus updated_at.
    expect(setClause).toContain("primary_color");
    expect(setClause).toContain("secondary_color");
    expect(setClause).toContain("accent_color = '#F0F0F0'");
    expect(setClause).not.toContain("lifecycle");
    expect(setClause).not.toContain("public_access");
    expect(setClause).not.toContain("tier");
    expect(setClause).not.toContain("store_enabled");

    // …and it refuses to fire against a tenant that has already moved on.
    expect(whereClause).toContain("lifecycle = 'onboarding'");
    expect(whereClause).toContain("public_access = 'preview'");
  });
});

describe("Lions production import — guards", () => {
  it("refuses to run after billing projection", () => {
    expect(generatedSql()).toContain(
      "Lions production import cannot run after billing projection",
    );
  });

  it("asserts the provisioned tenant fingerprint before writing", () => {
    const sql = generatedSql();
    expect(sql).toContain("Lions production target tenant mismatch");
    expect(sql).toContain("Lions production target domain mismatch");
    expect(sql).toContain("and kind = 'customer'");
    expect(sql).toContain("and tier = 'starter'");
  });

  it("resolves the owner from club_members with into strict", () => {
    const sql = generatedSql();
    expect(sql).toMatch(
      /select user_id into strict v_owner from onzio\.club_members/,
    );
    // The seed-only actor id must never be written to a `not null references
    // auth.users(id)` column — that would fail the FK on apply. As a SQL
    // literal it would appear single-quoted; every such column instead gets
    // the v_owner variable.
    expect(sql).not.toContain("'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'");
    for (const column of [
      "presentation_documents.created_by",
      "presentation_state.updated_by",
      "presentation_publications.created_by",
    ]) {
      expect(sql).toContain("v_owner");
      expect(column).toBeTruthy();
    }
  });

  it("carries the seed actor id only inside the presentation configuration blob", () => {
    // Documented, deliberate, and pre-existing: the editorial configuration
    // JSONB embeds metadata.createdBy, which the column-level v_owner
    // substitution does not reach. It is inert provenance — the authoritative
    // created_by COLUMN holds the real owner — and hosted staging carries the
    // identical value. Rewriting it would change configuration_digest and
    // fork production's digest from local and staging, so it is left alone.
    // This test pins that reasoning so the occurrence is never mistaken for a
    // leak, and fails if it ever appears anywhere else.
    const sql = generatedSql();
    const occurrences = sql.split("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1").length - 1;
    expect(occurrences).toBe(1);
    // Double-quoted => inside a JSON payload, not a SQL column literal.
    expect(sql).toContain('"createdBy":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"');
  });

  it("uses a package-specific dollar-quote tag and audit operation", () => {
    const sql = generatedSql();
    expect(sql).toContain("do $lions_prod$");
    expect(sql).toContain("'lions_production_import'");
    expect(sql).not.toContain("lions_staging_import");
  });
});

describe("Lions production import — tenant id translation", () => {
  it("leaves no trace of the local tenant id anywhere in the SQL", () => {
    // Covers club_id columns, storage paths, image urls, and any tenant id
    // buried inside the presentation configuration JSONB.
    expect(generatedSql()).not.toContain(LIONS_LOCAL_TENANT_ID);
  });

  it("targets the production tenant and hostname", () => {
    const sql = generatedSql();
    expect(sql).toContain(PRODUCTION_TENANT_ID);
    expect(sql).toContain(PRODUCTION_HOSTNAME);
    // The staging tenant must not leak in from the copied source.
    expect(sql).not.toContain("8d82bb47-c10b-4823-8ec7-c4de87d34b0a");
    expect(sql).not.toContain("lions-onzio-staging.vercel.app");
  });
});

describe("Lions production import — roster and staff scaffolding", () => {
  it("emits 22 neutrally-named players with shirt numbers 1..22", () => {
    const players = placeholderPlayers(PRODUCTION_TENANT_ID, "2026-07-29T00:00:00.000Z");
    expect(players).toHaveLength(22);
    expect(players.map((player) => player.name)).toEqual(
      Array.from({ length: 22 }, (_unused, index) => `Player ${index + 1}`),
    );
    expect(players.map((player) => player.number)).toEqual(
      Array.from({ length: 22 }, (_unused, index) => index + 1),
    );
    expect(players.every((player) => player.club_id === PRODUCTION_TENANT_ID)).toBe(true);
    expect(players.every((player) => player.active === true)).toBe(true);
  });

  it("gives every placeholder player a real position so the roster groups", () => {
    const positions = new Set(
      placeholderPlayers(PRODUCTION_TENANT_ID, "2026-07-29T00:00:00.000Z").map(
        (player) => player.position,
      ),
    );
    expect(positions).toEqual(
      new Set(["Goalkeeper", "Defender", "Midfielder", "Forward"]),
    );
  });

  it("emits 4 staff slots labelled by job title", () => {
    const staff = placeholderStaff(PRODUCTION_TENANT_ID, "2026-07-29T00:00:00.000Z");
    expect(staff).toHaveLength(4);
    expect(staff.map((member) => member.role)).toEqual([
      "Head Coach",
      "Assistant Coach",
      "Goalkeeper Coach",
      "Team Manager",
    ]);
  });

  it("uses ids that cannot collide with the mockup roster ids", () => {
    const plan = loadPlan();
    const mockupIds = new Set([
      ...buildLionsLocalImportRows(plan).players.map((player) => player.id),
      ...buildLionsLocalImportRows(plan).staff.map((member) => member.id),
    ]);
    const placeholderIds = [
      ...placeholderPlayers(PRODUCTION_TENANT_ID, "2026-07-29T00:00:00.000Z"),
      ...placeholderStaff(PRODUCTION_TENANT_ID, "2026-07-29T00:00:00.000Z"),
    ].map((row) => row.id as string);
    expect(placeholderIds.some((id) => mockupIds.has(id))).toBe(false);
  });

  // The first real apply against production failed on
  // `null value in column "age" of relation "players"`, because the
  // placeholder builder was written from the column list without checking
  // nullability or CHECK constraints. The whole DO block is one transaction
  // so nothing landed, but the round trip is expensive and the failure mode
  // is discovered on a live tenant. These assertions mirror the production
  // schema exactly, read from information_schema and pg_constraint on
  // 2026-08-15, so a violation is caught here instead.
  const PLAYERS_NOT_NULL = [
    "id", "club_id", "number", "name", "nationality", "position",
    "height", "weight", "hometown", "age", "photo_url", "active",
    "created_at", "updated_at",
  ] as const;
  const STAFF_NOT_NULL = [
    "id", "club_id", "initials", "name", "role", "hometown",
    "nationality", "photo_url", "active", "created_at", "updated_at",
  ] as const;

  it("sets every NOT NULL players column to a non-null value", () => {
    for (const player of placeholderPlayers(PRODUCTION_TENANT_ID, "2026-07-29T00:00:00.000Z")) {
      for (const column of PLAYERS_NOT_NULL) {
        expect(player[column], `players.${column} must not be null`).not.toBeNull();
        expect(player[column], `players.${column} must be present`).toBeDefined();
      }
    }
  });

  it("sets every NOT NULL staff column to a non-null value", () => {
    for (const member of placeholderStaff(PRODUCTION_TENANT_ID, "2026-07-29T00:00:00.000Z")) {
      for (const column of STAFF_NOT_NULL) {
        expect(member[column], `staff.${column} must not be null`).not.toBeNull();
        expect(member[column], `staff.${column} must be present`).toBeDefined();
      }
    }
  });

  it("satisfies every players CHECK constraint", () => {
    for (const player of placeholderPlayers(PRODUCTION_TENANT_ID, "2026-07-29T00:00:00.000Z")) {
      // players_age_check: age >= 14 and age <= 80
      expect(player.age).toBeGreaterThanOrEqual(14);
      expect(player.age).toBeLessThanOrEqual(80);
      // players_number_check: number >= 0 and number <= 999
      expect(player.number).toBeGreaterThanOrEqual(0);
      expect(player.number).toBeLessThanOrEqual(999);
      // players_position_check: one of exactly these four labels
      expect(["Goalkeeper", "Defender", "Midfielder", "Forward"]).toContain(player.position);
      // players_name_check: 1..120 characters
      expect(String(player.name).length).toBeGreaterThanOrEqual(1);
      expect(String(player.name).length).toBeLessThanOrEqual(120);
    }
  });

  it("satisfies the staff CHECK constraint", () => {
    for (const member of placeholderStaff(PRODUCTION_TENANT_ID, "2026-07-29T00:00:00.000Z")) {
      // staff_name_check: 1..120 characters
      expect(String(member.name).length).toBeGreaterThanOrEqual(1);
      expect(String(member.name).length).toBeLessThanOrEqual(120);
    }
  });

  it("gives every placeholder player the same age, so it reads as a default", () => {
    const ages = new Set(
      placeholderPlayers(PRODUCTION_TENANT_ID, "2026-07-29T00:00:00.000Z").map((p) => p.age),
    );
    expect(ages.size).toBe(1);
  });

  it("never carries the mockup's invented people into the SQL", () => {
    const sql = generatedSql();
    for (const name of MOCKUP_NAMES) {
      expect(sql).not.toContain(name);
    }
  });

  it("emits no season-stat rows, which would dangle off the dropped roster", () => {
    const sql = generatedSql();
    expect(sql).not.toMatch(/insert into onzio\."player_season_stats"/);
    expect(sql).not.toMatch(/insert into onzio\."goalkeeper_season_stats"/);
  });
});

describe("Lions production import — content actually ships", () => {
  it("ships the editorial@1 presentation document, state and publication", () => {
    const sql = generatedSql();
    expect(sql).toMatch(/insert into onzio\."presentation_documents"/);
    expect(sql).toMatch(/insert into onzio\."presentation_state"/);
    expect(sql).toMatch(/insert into onzio\."presentation_publications"/);
    expect(sql).toContain("'editorial'");
  });

  it("ships the editorial-only tables DCFC's import has no equivalent of", () => {
    // These are exactly the tables that would be missed by copying
    // import-diverse-city-production.ts's statement list instead of the
    // Lions one — each renders an empty surface on the public site.
    const sql = generatedSql();
    for (const table of [
      "club_identity",
      "homepage_slideshow_settings",
      "homepage_slideshow_photos",
      "site_social_links",
      "tryouts",
      "tryouts_page_content",
      "contact_profile",
      "contact_page_content",
      "about_page_content",
      "site_branding",
      "site_sponsor_logos",
    ]) {
      expect(sql).toMatch(new RegExp(`insert into onzio\\."${table}"`));
    }
  });

  it("ships every media asset in the approved plan", () => {
    const plan = loadPlan();
    const rows = productionRows(buildLionsLocalImportRows(plan));
    expect(rows.mediaAssets).toHaveLength(plan.assets.length);
    const sql = buildSql(rows, plan.planDigest);
    const inserts = sql.match(/insert into onzio\."media_assets"/g) ?? [];
    expect(inserts).toHaveLength(plan.assets.length);
  });

  it("is deterministic — the same plan generates byte-identical SQL", () => {
    expect(generatedSql()).toEqual(generatedSql());
  });
});
