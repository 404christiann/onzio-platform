import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ROSE_CITY_CLUB_ID } from "../../scripts/rose-city-2027-operator-sql";

// RC-HERO-POSTER-05: the operator SQL that flags Rose City's live hero video for its poster and keeps the original
// pairing for a revert. tests/database/rose-city-hero-poster-backfill.test.ts runs both files for real.

const DIR = resolve(process.cwd(), "scripts/operator-sql");
const rehearsal = readFileSync(resolve(DIR, "rose-city-hero-poster-backfill.rehearsal.sql"), "utf8").replaceAll("\r\n", "\n");
const commit = readFileSync(resolve(DIR, "rose-city-hero-poster-backfill.commit.sql"), "utf8").replaceAll("\r\n", "\n");
const statements = (sql: string) => sql.split("\n").filter((line) => !line.startsWith("--"));

describe("Rose City hero poster backfill SQL", () => {
  it("is one transaction: the rehearsal ends in ROLLBACK, the commit file in COMMIT, and nothing else differs", () => {
    const body = (sql: string) => statements(sql).join("\n").trim();
    expect(body(rehearsal).startsWith("begin;")).toBe(true);
    expect(body(rehearsal).endsWith("\nrollback;")).toBe(true);
    expect(body(commit).endsWith("\ncommit;")).toBe(true);
    expect(body(commit).replace(/\ncommit;$/, "\nrollback;")).toBe(body(rehearsal));
    for (const sql of [rehearsal, commit]) expect(sql.match(/^(begin|commit|rollback);$/gm)).toHaveLength(2);
  });

  it("targets Rose City by id and slug, and refuses an archived club or a missing migration", () => {
    for (const sql of [rehearsal, commit]) {
      expect(sql).toContain(`v_club_id constant uuid := '${ROSE_CITY_CLUB_ID}';`);
      expect(sql).toContain("v_club.slug <> 'rose-city'");
      expect(sql).toContain("raise exception 'ROSE_CITY_ARCHIVED'");
      expect(sql).toContain("raise exception 'MIGRATION_MISSING");
    }
  });

  it("takes the homepage lock before any row lock, the order save_homepage and the hero video functions use", () => {
    const lock = rehearsal.indexOf("pg_advisory_xact_lock(734901281)");
    expect(lock).toBeGreaterThan(0);
    for (const row of ["from onzio.clubs where id = v_club_id for update", "from onzio.homepage_revamp_content where club_id = v_club_id for update", "from onzio_private.hero_video_pending"]) {
      expect(rehearsal.indexOf(row), row).toBeGreaterThan(lock);
    }
  });

  it("writes only the previous poster slot, the due flag, and one audit event", () => {
    const writes = [...rehearsal.matchAll(/\b(insert\s+into|update|delete\s+from)\s+([a-z_]+\.[a-z_]+)/gi)].map((m) => `${m[1].toLowerCase().replace(/\s+/g, " ")} ${m[2]}`);
    expect(writes).toEqual(["update onzio.homepage_revamp_content", "update onzio_private.hero_video_pending", "insert into onzio.audit_events"]);
    expect(rehearsal).not.toMatch(/\bset\s+hero_poster_media_asset_id\b/);
    expect(rehearsal).not.toMatch(/delete\s+from|truncate|drop\s/i);
  });

  it("only acts while the pending row is live for the current video, and a rerun returns before writing", () => {
    expect(rehearsal).toContain("where club_id = v_club_id and video_guid = v_live and phase = 'live' for update");
    const firstNoop = rehearsal.indexOf("'no-op: the pending row is not live for the current video'");
    const autoNoop = rehearsal.indexOf("'no-op: the live poster was already made from the video'");
    const firstWrite = rehearsal.indexOf("update onzio.homepage_revamp_content");
    expect(firstNoop).toBeGreaterThan(0);
    expect(autoNoop).toBeGreaterThan(firstNoop);
    expect(firstWrite).toBeGreaterThan(autoNoop);
    expect(rehearsal).toContain("a.payload->>'source' = 'hero-video-poster'");
  });

  it("copies the hand-set poster into the previous slot only for the original video, once, while the slot is empty", () => {
    expect(rehearsal).toContain("v_original_video constant text := 'd17c6dc6-ab9a-4b22-a7dd-1e55b4f1ad91'");
    expect(rehearsal).toContain("v_prev = v_original_video and v_row.previous_hero_poster_media_asset_id is null");
    expect(rehearsal).toContain("where club_id = v_club_id and previous_hero_poster_media_asset_id is null");
  });

  it("asserts one row for each write and has a read-back with an all_ok column", () => {
    expect(rehearsal.match(/EXPECTED_ONE_ROW/g)).toHaveLength(2);
    expect(rehearsal).toContain("as all_ok");
    expect(rehearsal).toContain("'manual.hero_poster_backfill'");
  });
});
