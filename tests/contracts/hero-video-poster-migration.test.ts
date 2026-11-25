import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { hasOpsFile, readOpsFile } from "../helpers/ops-repo";

// RC-HERO-POSTER-02: static checks on the migration and its rollback. tests/database/hero-video-poster.test.ts runs
// the functions for real.

const NAME = "20261124120000_hero_video_poster.sql";
const MIGRATIONS = resolve(process.cwd(), "supabase/migrations");
const sql = readFileSync(resolve(MIGRATIONS, NAME), "utf8");
const ROLLBACK = "docs/phase-11/diverse-city/RC-HERO-POSTER-02-ROLLBACK.sql";
const rollback = hasOpsFile(ROLLBACK) ? readOpsFile(ROLLBACK) : "";
const code = (text: string) => text.split("\n").filter((line) => !line.startsWith("--")).join("\n");

/** The text of one function definition, from its create line to the closing $$. */
function fn(text: string, name: string): string {
  const start = text.search(new RegExp(`create (or replace )?function ${name.replace(".", "\\.")}\\(`));
  expect(start, name).toBeGreaterThanOrEqual(0);
  const end = text.indexOf("$$;", text.indexOf("as $$", start));
  return text.slice(start, end + 3);
}

describe("the poster migration", () => {
  it("sorts after every other migration, so it is the only one the production gate finds Local-only", () => {
    const others = readdirSync(MIGRATIONS).filter((file) => file.endsWith(".sql") && file !== NAME);
    expect(others.filter((file) => file > NAME)).toEqual([]);
  });

  it("names every object it creates in its header", () => {
    const header = sql.split("\n").filter((line) => line.startsWith("--")).join("\n");
    for (const name of [
      "previous_hero_poster_media_asset_id", "previousHeroPosterAlt", "poster_due_at", "poster_attempts", "swap_hero_video_core",
      "revert_hero_video_core", "hero_video_event_core", "attach_hero_video_poster_core", "list_hero_video_poster_due_core", "RC-HERO-POSTER-02-ROLLBACK.sql",
    ]) expect(header, name).toContain(name);
  });

  it("adds the previous poster as a composite FK with a guard, so retirement and the orphan sweep see it", () => {
    expect(sql).toContain("add column previous_hero_poster_media_asset_id uuid");
    expect(sql).toContain("foreign key (club_id, previous_hero_poster_media_asset_id) references onzio.media_assets (club_id, id)");
    expect(sql).toContain("add constraint homepage_revamp_previous_hero_poster_fk");
    expect(sql).toContain("guard_media_reference('previous_hero_poster_media_asset_id', 'asset')");
    // Short, explicit constraint name: the default would pass Postgres's 63-character limit.
    expect("homepage_revamp_previous_hero_poster_fk".length).toBeLessThan(63);
  });

  it("gives authenticated nothing new: no table grant on the new column, and every function service-role only", () => {
    expect(code(sql)).not.toMatch(/grant (insert|update|select|all)[^;]*on (table )?onzio(_private)?\.(homepage_revamp_content|hero_video_pending)/i);
    for (const grant of sql.matchAll(/grant execute on function ([^\s(]+)\([^)]*\) to ([^;]+);/g)) expect(grant[2], grant[1]).toBe("service_role");
    const functions = [...sql.matchAll(/create (?:or replace )?function (onzio(?:_private)?\.[a-z_]+)\(/g)].map((m) => m[1]);
    for (const name of functions) {
      expect(sql, name).toMatch(new RegExp(`revoke all on function ${name.replace(".", "\\.")}\\([^)]*\\) from public, anon, authenticated(, service_role)?;`));
    }
    expect(functions).toHaveLength(9);
  });

  it("keeps the old swap and revert call shapes working: a defaulted last parameter, the revert signature unchanged", () => {
    expect(sql).toContain("p_expected_live text, p_poster_asset_id uuid default null");
    expect(sql).toContain("p_poster_asset_id uuid default null\n) returns table(");
    expect(fn(sql, "onzio_private.revert_hero_video_core")).toContain("p_club_id uuid, p_expected_live text, p_target_guid text\n) returns table(outcome text, live_guid text, previous_guid text, revision_before text, revision_after text)");
  });

  it("takes the homepage advisory lock before any row lock in swap, revert, attach and ready", () => {
    const lock = "pg_advisory_xact_lock(734901281)";
    for (const name of ["onzio_private.swap_hero_video_core", "onzio_private.revert_hero_video_core", "onzio_private.attach_hero_video_poster_core"]) {
      const body = fn(sql, name);
      expect(body.indexOf(lock), name).toBeGreaterThan(0);
      expect(body.indexOf(lock), name).toBeLessThan(body.search(/ for update;/));
    }
    const event = fn(sql, "onzio_private.hero_video_event_core");
    const ready = event.indexOf("if p_event = 'ready' then");
    expect(ready).toBeGreaterThan(0);
    expect(event.indexOf(lock)).toBeGreaterThan(ready);
    expect(event.indexOf(lock)).toBeLessThan(event.indexOf("phase = any(p_expected)"));
  });

  it("a poster problem is a result, never an exception: the swap validates softly, writes video and poster in one UPDATE", () => {
    const swap = fn(sql, "onzio_private.swap_hero_video_core");
    expect(swap.match(/update onzio\.homepage_revamp_content/g)).toHaveLength(1);
    expect(swap).toContain("a.status = 'published' and a.deleted_at is null");
    expect(swap).toContain("a.surface = 'homepage' and a.media_kind = 'photograph'");
    expect(swap).not.toMatch(/raise exception 'POSTER|raise exception 'INVALID_HERO_POSTER/);
    expect(swap).toContain("v_poster text := 'kept'");
    const revert = fn(sql, "onzio_private.revert_hero_video_core");
    expect(revert.match(/update onzio\.homepage_revamp_content/g)).toHaveLength(2); // the poster-exchange branch and the video-only branch
  });

  it("the attach stops asking after five tries and only writes the slot that holds the video", () => {
    const attach = fn(sql, "onzio_private.attach_hero_video_poster_core");
    expect(attach).toContain("least(v_pending.poster_attempts + 1, 5)");
    expect(attach).toContain("when v_attempts >= 5 then null else poster_due_at end");
    expect(attach).toContain("phase = 'live' for update");
    expect(fn(sql, "onzio_private.list_hero_video_poster_due_core")).toContain("p.poster_attempts < 5");
  });

  it("does not redefine homepage_snapshot or save_homepage, which other migrations and tests freeze", () => {
    expect(code(sql)).not.toMatch(/function (onzio_private\.homepage_snapshot|onzio\.save_homepage)\(/);
    expect(code(sql)).not.toMatch(/drop table|truncate|delete from/i);
  });
});

describe.skipIf(!rollback)("the poster rollback", () => {
  it("is one transaction that restores the previous definitions and drops what the migration added", () => {
    expect(rollback).toMatch(/^begin;$/m);
    expect(rollback).toMatch(/^commit;$/m);
    for (const dropped of [
      "drop function onzio.list_hero_video_poster_due();", "drop function onzio.attach_hero_video_poster(uuid, text, uuid);",
      "drop function onzio_private.list_hero_video_poster_due_core();", "drop function onzio_private.attach_hero_video_poster_core(uuid, text, uuid);",
      "drop function onzio.hero_video_event(uuid, text, text, text[], text, text, text, text, integer, bigint, uuid);",
      "drop function onzio.swap_hero_video(uuid, text, text, text, uuid);",
      "drop function onzio_private.hero_video_event_core(uuid, text, text, text[], text, text, text, text, integer, bigint, uuid);",
      "drop function onzio_private.swap_hero_video_core(uuid, text, text, text, uuid);",
      "drop trigger guard_previous_hero_poster_media_reference on onzio.homepage_revamp_content;",
      "drop column previous_hero_poster_media_asset_id;",
      "drop column poster_due_at, drop column poster_attempts;",
    ]) expect(rollback, dropped).toContain(dropped);
  });

  it("restores the old definitions byte for byte from the migrations that defined them", () => {
    const swap = readFileSync(resolve(MIGRATIONS, "20261120230000_hero_video_swap.sql"), "utf8");
    const pending = readFileSync(resolve(MIGRATIONS, "20261121183000_hero_video_pending.sql"), "utf8");
    const oldSwap = fn(swap, "onzio_private.swap_hero_video_core");
    const oldRevert = fn(swap, "onzio_private.revert_hero_video_core").replace("create function", "create or replace function");
    const oldEvent = fn(pending, "onzio_private.hero_video_event_core");
    for (const text of [oldSwap, oldRevert, oldEvent, fn(swap, "onzio.swap_hero_video"), fn(pending, "onzio.hero_video_event")]) expect(rollback).toContain(text);
  });

  it("never drops the live poster column, and leaves posters already made in place", () => {
    expect(rollback).not.toMatch(/drop column hero_poster_media_asset_id/);
    expect(rollback).not.toMatch(/update onzio\.homepage_revamp_content set hero_poster/);
  });
});
