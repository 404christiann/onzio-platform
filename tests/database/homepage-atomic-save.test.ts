import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";

// Every test rolls back its own fixtures. This connection is deliberately
// fixed to the local stack; it cannot accidentally use a hosted database URL.
let db: Client;
let operation: string;
const clubId = CLUB_IDS.alpha;
async function actor(userId: string = USER_IDS.ownerAal2, ageDays = 0) {
  await db.query("reset role");
  // The invoker token must predate this test's long-lived transaction, as it
  // does for a real request. RLS compares AMR age with transaction-start now().
  const transactionSecond = Number((await db.query(
    "select floor(extract(epoch from now()))::bigint as second",
  )).rows[0].second);
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({
    sub: userId, role: "authenticated", aal: "aal1",
    amr: [{ method: "otp", timestamp: transactionSecond - ageDays * 86400 }],
  })]);
  await db.query("set local role authenticated");
}
async function design(template = "academy") {
  await db.query("reset role");
  const id = randomUUID();
  await db.query(`insert into onzio.presentation_documents
    (id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
    values ($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,$3,1,$4,$5,$6)`,
  [id, clubId, template, JSON.stringify({ schemaVersion: 1, template: { id: template, version: 1 } }), "a".repeat(64), USER_IDS.ownerAal2]);
  await db.query(`insert into onzio.presentation_state(club_id,published_document_id,updated_by)
    values($1,$2,$3) on conflict(club_id) do update set published_document_id=$2`, [clubId, id, USER_IDS.ownerAal2]);
  await actor();
}
async function load(id: string = clubId): Promise<any> {
  const r = await db.query("select onzio.load_homepage($1) as data", [id]);
  return r.rows[0].data;
}
async function request(sections: Record<string, unknown>) {
  const baseline = await load();
  return { operationId: operation, expectedRevision: baseline.revision, designRevision: baseline.designRevision, sections };
}
async function save(payload: unknown, id: string = clubId): Promise<any> {
  return (await db.query("select onzio.save_homepage($1,$2::jsonb) as data", [id, JSON.stringify(payload)])).rows[0].data;
}
async function rejects(action: () => Promise<unknown>, message: string) {
  await db.query("savepoint expected_failure");
  try { await expect(action()).rejects.toThrow(message); }
  finally { await db.query("rollback to savepoint expected_failure"); }
}
async function asset(owner: string = clubId) {
  const id = randomUUID();
  await db.query("reset role");
  await db.query(`insert into onzio.media_assets
    (id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at)
    values($1,$2,'onzio-media',$3,'homepage','photograph','image/webp',100,100,100,$4,'published',now())`,
  [id, owner, `${owner}/homepage/${id}.webp`, "b".repeat(64)]);
  await actor();
  return id;
}
const story = { visible: true, heading: "New story", bodyPrimary: "First paragraph", bodySecondary: "", ctaLabel: "Read more" };

beforeEach(async () => {
  assertSafeTestEnvironment();
  db = new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
  await db.connect();
  await db.query("begin");
  operation = randomUUID();
  await design();
});
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("atomic homepage database contract", () => {
  it("keeps the invoker fresh when the host clock advances past transaction start", async () => {
    const transactionSecond = Number((await db.query(
      "select floor(extract(epoch from now()))::bigint as second",
    )).rows[0].second);
    const clock = vi.spyOn(Date, "now").mockReturnValue((transactionSecond + 1) * 1000);
    try {
      await actor();
    } finally {
      clock.mockRestore();
    }

    expect((await db.query(
      "select onzio_private.is_club_session_fresh() as fresh",
    )).rows[0].fresh).toBe(true);
    await save(await request({ hero: { intro: "Transaction-safe session" } }));
  });

  it("commits hero and story together through an authenticated invoker", async () => {
    const payload = await request({ hero: { intro: "Atomic introduction" }, story });
    const result = await save(payload);
    const fresh = await load();
    expect(fresh.content.hero.intro).toBe("Atomic introduction");
    expect(fresh.content.story.heading).toBe("New story");
    expect(result.revision).toBe(fresh.revision);
    expect(result.operationId).toBe(operation);
    expect(result.revision).not.toBe(payload.expectedRevision);
  });

  it("rolls back hero, audit, revision and receipt when a later story write fails", async () => {
    await db.query("reset role");
    await db.query(`create function pg_temp.reject_homepage_story() returns trigger language plpgsql as
      $$ begin raise exception 'injected story failure'; end $$`);
    await db.query("create trigger test_reject_story before insert or update on onzio.homepage_story_section for each row execute function pg_temp.reject_homepage_story()");
    const beforeAudit = (await db.query("select count(*) from onzio.audit_events where club_id=$1", [clubId])).rows;
    await actor();
    const before = await load();
    const payload = await request({ hero: { intro: "Must roll back" }, story });
    await rejects(() => save(payload), "injected story failure");
    expect(await load()).toEqual(before);
    await db.query("reset role");
    expect((await db.query("select count(*) from onzio.audit_events where club_id=$1", [clubId])).rows).toEqual(beforeAudit);
    expect((await db.query("select count(*)::int as n from onzio_private.homepage_save_receipts where operation_id=$1", [operation])).rows[0].n).toBe(0);
  });

  it("returns the same receipt after response loss without another write or revision", async () => {
    const payload = await request({ hero: { intro: "Only once" }, story });
    const first = await save(payload);
    const second = await save(payload);
    expect(second).toEqual(first);
    expect((await load()).revision).toBe(first.revision);
    await rejects(() => save({ ...payload, sections: { hero: { intro: "Changed payload" } } }), "OPERATION_REUSED");
  });

  it("rejects another save from a stale baseline and preserves the first save", async () => {
    const payload = await request({ hero: { intro: "First admin" } });
    await save(payload);
    await rejects(() => save({ ...payload, operationId: randomUUID(), sections: { hero: { intro: "Stale admin" } } }), "CONTENT_CHANGED");
    expect((await load()).content.hero.intro).toBe("First admin");
  });

  it("notices authorized legacy writes, including creation of an absent singleton", async () => {
    await db.query("delete from onzio.homepage_story_section where club_id=$1", [clubId]);
    const payload = await request({ hero: { intro: "Old draft" } });
    await db.query("insert into onzio.homepage_story_section(club_id,heading) values($1,'Legacy editor')", [clubId]);
    await rejects(() => save(payload), "CONTENT_CHANGED");
  });

  it("rejects a changed design before writing", async () => {
    const payload = await request({ hero: { intro: "Old design draft" } });
    await design("clubhouse");
    await rejects(() => save(payload), "DESIGN_CHANGED");
  });

  it("never seeds or edits unavailable sections or unrendered hero fields", async () => {
    await design("editorial");
    await rejects(async () => save(await request({ story })), "SECTION_UNAVAILABLE");
    await rejects(async () => save(await request({ hero: { eyebrow: "Not rendered" } })), "FIELD_UNAVAILABLE");
    await save(await request({ hero: { intro: "Valid editorial intro" } }));
    expect((await load()).content.story.heading).not.toBe("New story");
  });

  it("preserves source video and rejects source replacement even through direct RPC", async () => {
    await design("cinematic");
    const baseline = await load();
    await rejects(async () => save(await request({ video: { ...baseline.content.video, video_url: "https://example.test/forged" } })), "INVALID_HOMEPAGE_PAYLOAD");
    await db.query("insert into onzio.behind_the_rose_section(club_id,video_url) values($1,'https://example.test/operator-video') on conflict(club_id) do update set video_url=excluded.video_url", [clubId]);
    const current = await load();
    await save(await request({ video: { ...current.content.video, title: "Edited title" } }));
    expect((await load()).videoSource).toBe("https://example.test/operator-video");
  });

  it("rolls back added/deleted photos and hero when the later video write fails", async () => {
    await design("cinematic");
    const assetId = await asset();
    await db.query("reset role");
    await db.query(`create function pg_temp.reject_homepage_video() returns trigger language plpgsql as
      $$ begin raise exception 'injected video failure'; end $$`);
    await db.query("create trigger test_reject_video before insert or update on onzio.behind_the_rose_section for each row execute function pg_temp.reject_homepage_video()");
    await actor();
    const before = await load();
    await rejects(async () => save(await request({
      hero: { intro: "Rollback this too" },
      photos: { items: [{ clientId: "new", rowId: null, assetId, alt: "Photo", order: 0 }] },
      video: { ...before.content.video, visible: false, title: "Rollback last" },
    })), "injected video failure");
    expect(await load()).toEqual(before);
  });

  it("isolates operation receipts by actor and reports later saved content separately", async () => {
    const payload = await request({ hero: { intro: "Original receipt" } });
    const first = await save(payload);
    await actor(USER_IDS.adminAal2);
    const other = (await db.query("select onzio.load_homepage($1,$2) as data", [clubId, operation])).rows[0].data;
    expect(other.operation).toEqual({ status: "not-committed" });
    expect((await db.query("select count(*)::int as n from onzio_private.homepage_save_receipts where club_id=$1", [clubId])).rows[0].n).toBe(0);
    await save({ ...await request({ hero: { intro: "Later admin content" } }), operationId: randomUUID() });
    await actor();
    const reconciled = (await db.query("select onzio.load_homepage($1,$2) as data", [clubId, operation])).rows[0].data;
    expect(reconciled.operation).toEqual({ status: "committed", receipt: first });
    expect(reconciled.content.hero.intro).toBe("Later admin content");
    expect(await save(payload)).toEqual(first);
    expect((await load()).content.hero.intro).toBe("Later admin content");
  });

  it.each([
    { hero: { intro: "x".repeat(321) } },
    { hero: { headline_line_one: "x".repeat(81) } },
    { hero: { primary_cta_href: "https://example.test" } },
    { story: { ...story, ctaLabel: "x".repeat(41) } },
    { story: { ...story, visible: null } },
  ])("enforces existing field limits/types for a direct RPC (%#)", async sections => {
    const before = await load();
    await rejects(async () => save(await request(sections)), "INVALID_HOMEPAGE_PAYLOAD");
    expect(await load()).toEqual(before);
  });

  it("allows grace-period editing but rejects suspended paid clubs", async () => {
    await db.query("reset role");
    await db.query("update onzio.clubs set kind='customer',lifecycle='active',public_access='grace' where id=$1", [clubId]);
    await actor();
    await save(await request({ hero: { intro: "Grace period content" } }));
    const payload = { ...await request({ hero: { intro: "Must not save" } }), operationId: randomUUID() };
    await db.query("reset role");
    await db.query("update onzio.clubs set public_access='suspended' where id=$1", [clubId]);
    await actor();
    await rejects(() => save(payload), "NOT_AUTHORIZED");
    expect((await load()).content.hero.intro).toBe("Grace period content");
  });

  it("saves normalized photos with stable row identities, blank-alt fallback and explicit order", async () => {
    await design("clubhouse");
    const assetId = await asset();
    const photo = { clientId: "new-photo", rowId: null, assetId, alt: "", order: 0 };
    const first = await save(await request({ photos: { items: [photo] } }));
    const saved = first.content.photos.items[0];
    expect(saved.assetId).toBe(assetId);
    expect(saved.rowId).toMatch(/^[a-f0-9-]{36}$/);
    expect(saved.alt.length).toBeGreaterThan(0);
    operation = randomUUID();
    await save(await request({ photos: { items: [{ ...photo, rowId: saved.rowId, alt: "Our players" }] } }));
    expect((await load()).content.photos.items[0]).toMatchObject({ rowId: saved.rowId, alt: "Our players", order: 0 });
  });

  it("reports a removed photo's asset for post-commit cleanup, and none for kept or reordered photos", async () => {
    await design("clubhouse");
    const keepAssetId = await asset();
    const removeAssetId = await asset();
    const first = await save(await request({ photos: { items: [
      { clientId: "keep", rowId: null, assetId: keepAssetId, alt: "Keep", order: 0 },
      { clientId: "remove", rowId: null, assetId: removeAssetId, alt: "Remove", order: 1 },
    ] } }));
    expect(first.retiredMediaAssetIds).toEqual([]);
    const keepRowId = first.content.photos.items.find((p: { assetId: string }) => p.assetId === keepAssetId).rowId;

    operation = randomUUID();
    const afterRemoval = await save(await request({ photos: { items: [
      { clientId: "keep", rowId: keepRowId, assetId: keepAssetId, alt: "Keep", order: 0 },
    ] } }));
    expect(afterRemoval.retiredMediaAssetIds).toEqual([removeAssetId]);

    operation = randomUUID();
    const reordered = await save(await request({ photos: { items: [
      { clientId: "keep", rowId: keepRowId, assetId: keepAssetId, alt: "Keep", order: 0 },
    ] } }));
    expect(reordered.retiredMediaAssetIds).toEqual([]);
  });

  it("reports the old asset when a kept photo row is reassigned to a different asset", async () => {
    await design("clubhouse");
    const originalAssetId = await asset();
    const replacementAssetId = await asset();
    const first = await save(await request({ photos: { items: [
      { clientId: "row", rowId: null, assetId: originalAssetId, alt: "Original", order: 0 },
    ] } }));
    const rowId = first.content.photos.items[0].rowId;

    operation = randomUUID();
    const replaced = await save(await request({ photos: { items: [
      { clientId: "row", rowId, assetId: replacementAssetId, alt: "Replacement", order: 0 },
    ] } }));
    expect(replaced.retiredMediaAssetIds).toEqual([originalAssetId]);
    expect((await load()).content.photos.items[0].assetId).toBe(replacementAssetId);
  });

  it("reports no retired asset when a later section write fails after a photo removal", async () => {
    await design("cinematic");
    const keepAssetId = await asset();
    const removeAssetId = await asset();
    const first = await save(await request({ photos: { items: [
      { clientId: "keep", rowId: null, assetId: keepAssetId, alt: "Keep", order: 0 },
      { clientId: "remove", rowId: null, assetId: removeAssetId, alt: "Remove", order: 1 },
    ] } }));
    const keepRowId = first.content.photos.items.find((p: { assetId: string }) => p.assetId === keepAssetId).rowId;
    await db.query("reset role");
    await db.query(`create function pg_temp.reject_homepage_video_after_photos() returns trigger language plpgsql as
      $$ begin raise exception 'injected video failure'; end $$`);
    await db.query("create trigger test_reject_video_after_photos before insert or update on onzio.behind_the_rose_section for each row execute function pg_temp.reject_homepage_video_after_photos()");
    await actor();
    const before = await load();
    operation = randomUUID();
    await rejects(async () => save(await request({
      photos: { items: [{ clientId: "keep", rowId: keepRowId, assetId: keepAssetId, alt: "Keep", order: 0 }] },
      video: { ...before.content.video, visible: false, title: "Rollback last" },
    })), "injected video failure");
    expect(await load()).toEqual(before);
    await db.query("reset role");
    expect((await db.query("select count(*)::int as n from onzio_private.homepage_save_receipts where operation_id=$1", [operation])).rows[0].n).toBe(0);
  });

  it("rejects foreign media, supplied URLs, excessive photos and invalid order", async () => {
    await design("clubhouse");
    const assetId = await asset(CLUB_IDS.bravo);
    const photo = { clientId: "foreign", rowId: null, assetId, alt: "Photo", order: 0 };
    await rejects(async () => save(await request({ photos: { items: [photo] } })), "INVALID_PHOTO");
    await rejects(async () => save(await request({ photos: { items: [{ ...photo, url: "https://example.test" }] } })), "INVALID_HOMEPAGE_PAYLOAD");
    await rejects(async () => save(await request({ photos: { items: Array(7).fill(photo) } })), "INVALID_HOMEPAGE_PAYLOAD");
    await rejects(async () => save(await request({ photos: { items: [{ ...photo, order: 2 }] } })), "INVALID_HOMEPAGE_PAYLOAD");
  });

  it.each([USER_IDS.removed, USER_IDS.unaffiliated])("rejects nonmembers and removed memberships (%s)", async userId => {
    const payload = await request({ hero: { intro: "Forbidden" } });
    await actor(userId);
    await rejects(() => save(payload), "NOT_AUTHORIZED");
    await rejects(() => load(), "NOT_AUTHORIZED");
  });

  it("rejects expired sessions and revoked access even when replaying a receipt", async () => {
    const payload = await request({ hero: { intro: "Saved" } });
    await save(payload);
    await actor(USER_IDS.ownerAal2, 31);
    await rejects(() => save(payload), "NOT_AUTHORIZED");
    await db.query("reset role");
    await db.query("update onzio.club_members set status='removed',removed_at=now() where club_id=$1 and user_id=$2", [clubId, USER_IDS.ownerAal2]);
    await actor();
    await rejects(() => save(payload), "NOT_AUTHORIZED");
  });

  it("denies a cross-tenant RPC and anonymous execution", async () => {
    const payload = await request({ hero: { intro: "Forbidden" } });
    await rejects(() => save(payload, CLUB_IDS.bravo), "NOT_AUTHORIZED");
    await db.query("reset role");
    await db.query("set local role anon");
    await rejects(() => save(payload), "permission denied");
  });

  it("exposes only invoker entry points; private receipt tables have RLS", async () => {
    await db.query("reset role");
    const functions = await db.query("select proname,prosecdef from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='onzio' and proname in ('save_homepage','load_homepage')");
    expect(functions.rows).toHaveLength(2);
    expect(functions.rows.every(row => !row.prosecdef)).toBe(true);
    const tables = await db.query("select relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='onzio_private' and relname='homepage_save_receipts'");
    expect(tables.rows).toEqual([{ relrowsecurity: true }]);
  });
});
