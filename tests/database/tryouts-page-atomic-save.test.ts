import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { buildTryoutMutationPayload, emptyTryoutDraft } from "@/lib/tryout-admin";

let db: Client;
const clubId = CLUB_IDS.alpha;
const fields = ["id", "program_id", "status", "eyebrow", "headline", "intro", "hero_media_asset_id",
  "eligibility_copy", "what_to_expect_copy", "preparation_copy", "event_date", "location", "cost_text",
  "cta_label", "registration_href", "registration_form_id", "closed_message", "sort_order"] as const;

async function actor(userId = USER_IDS.ownerAal2) {
  await db.query("reset role");
  const second = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({
    sub: userId, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second }],
  })]);
  await db.query("set local role authenticated");
}
async function design(template = "academy") {
  await db.query("reset role");
  const id = randomUUID();
  await db.query(`insert into onzio.presentation_documents
    (id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
    values($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,$3,1,$4,$5,$6)`,
  [id, clubId, template, JSON.stringify({ schemaVersion: 1, template: { id: template, version: 1 } }), "a".repeat(64), USER_IDS.ownerAal2]);
  await db.query(`insert into onzio.presentation_state(club_id,published_document_id,updated_by)
    values($1,$2,$3) on conflict(club_id) do update set published_document_id=$2`, [clubId, id, USER_IDS.ownerAal2]);
  await actor();
}
async function load(operationId?: string, target: string = clubId) {
  return (await db.query("select onzio.load_tryouts_page($1,$2) as data", [target, operationId ?? null])).rows[0].data as {
    revision: string; page: Record<string, unknown>; events: Record<string, unknown>[];
    operation?: { status: string; receipt?: unknown };
  };
}
function existingEvents(rows: Record<string, unknown>[]) {
  return rows.map((row, sort_order) => Object.fromEntries(fields.map((key) => [key,
    key === "sort_order" ? sort_order : key === "event_date" && row[key] instanceof Date
      ? (row[key] as Date).toISOString().slice(0, 10) : row[key],
  ])));
}
function newEvent(sort_order: number, overrides: Record<string, unknown> = {}) {
  return { ...buildTryoutMutationPayload({ ...emptyTryoutDraft(sort_order), headline: "New evaluation" }),
    id: null, sort_order, ...overrides };
}
async function request(page: Record<string, string> | null, rows?: Record<string, unknown>[], deletedIds: string[] = []) {
  const baseline = await load();
  return { operationId: randomUUID(), expectedRevision: baseline.revision,
    page, events: rows ?? existingEvents(baseline.events), deletedIds };
}
async function save(payload: unknown, target: string = clubId) {
  return (await db.query("select onzio.save_tryouts_page($1,$2::jsonb) as data", [target, JSON.stringify(payload)])).rows[0].data;
}
async function asset() {
  const id = randomUUID();
  await db.query("reset role");
  await db.query(`insert into onzio.media_assets
    (id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at)
    values($1,$2,'onzio-media',$3,'tryouts','photograph','image/webp',100,100,100,$4,'published',now())`,
  [id, clubId, `${clubId}/tryouts/${id}.webp`, "b".repeat(64)]);
  await actor();
  return id;
}
async function rejects(action: () => Promise<unknown>, message: string) {
  await db.query("savepoint expected_failure");
  try { await expect(action()).rejects.toThrow(message); }
  finally { await db.query("rollback to savepoint expected_failure"); }
}

beforeEach(async () => {
  assertSafeTestEnvironment();
  db = new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
  await db.connect();
  await db.query("begin");
  await design();
});
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("atomic Tryouts public-page save", () => {
  it("commits intro and an added event together and reconciles a lost response by operation receipt", async () => {
    const baseline = await load();
    const payload = await request({ intro_with_tryouts: "Join us this season.", intro_no_tryouts: "Details soon." },
      [...existingEvents(baseline.events), newEvent(baseline.events.length)]);
    const first = await save(payload);
    expect(first.page.intro_with_tryouts).toBe("Join us this season.");
    expect(first.events.length).toBe(baseline.events.length + 1);
    expect(first.revision).not.toBe(baseline.revision);
    expect(await save(payload)).toEqual(first);
    const reconciled = await load(payload.operationId);
    expect(reconciled.operation).toEqual({ status: "committed", receipt: first });
    await rejects(() => save({ ...payload, page: null }), "OPERATION_REUSED");
  });

  it("rolls back intro, event, revision and receipt when an event relationship fails", async () => {
    const baseline = await load();
    const payload = await request({ intro_with_tryouts: "Must roll back.", intro_no_tryouts: "Must roll back." },
      [...existingEvents(baseline.events), newEvent(baseline.events.length, { program_id: randomUUID() })]);
    await rejects(() => save(payload), "foreign key");
    expect(await load()).toEqual(baseline);
    expect((await load(payload.operationId)).operation).toEqual({ status: "not-committed" });
  });

  it("deletes only the selected event and preserves its linked registration form", async () => {
    const formId = randomUUID();
    const eventId = randomUUID();
    await db.query("reset role");
    await db.query("insert into onzio.registration_forms(id,club_id,slug,title) values($1,$2,$3,$4)",
      [formId, clubId, `atomic-${formId.slice(0, 8)}`, "Evaluation registration"]);
    await db.query("insert into onzio.tryouts(id,club_id,headline,registration_form_id) values($1,$2,$3,$4)",
      [eventId, clubId, "Linked tryout", formId]);
    await actor();
    const baseline = await load();
    const payload = await request(null, existingEvents(baseline.events.filter((row) => row.id !== eventId)), [eventId]);
    await save(payload);
    expect((await load()).events.some((row) => row.id === eventId)).toBe(false);
    await db.query("reset role");
    expect((await db.query("select count(*)::int as count from onzio.registration_forms where id=$1", [formId])).rows[0].count).toBe(1);
  });

  it("returns only no-longer-referenced event photos for safe post-commit retirement", async () => {
    const oldPhoto = await asset();
    const replacement = await asset();
    const firstId = randomUUID();
    const secondId = randomUUID();
    await db.query("reset role");
    await db.query("insert into onzio.tryouts(id,club_id,headline,hero_media_asset_id) values($1,$2,'First',$3),($4,$2,'Second',$3)",
      [firstId, clubId, oldPhoto, secondId]);
    await actor();
    const baseline = await load();
    const firstSave = await request(null, existingEvents(baseline.events).map((row) => row.id === firstId
      ? { ...row, hero_media_asset_id: replacement } : row));
    const afterSwap = await save(firstSave);
    expect(afterSwap.retiredMediaAssetIds).toEqual([]);
    const remaining = await load();
    const deleteSecond = await request(null, existingEvents(remaining.events.filter((row) => row.id !== secondId)), [secondId]);
    const afterDelete = await save(deleteSecond);
    expect(afterDelete.retiredMediaAssetIds).toEqual([oldPhoto]);
    expect((await load(deleteSecond.operationId)).operation?.receipt).toEqual(afterDelete);
  });

  it("preserves template-default intro when an event-only Save sends page null", async () => {
    await db.query("reset role");
    await db.query("delete from onzio.tryouts_page_content where club_id=$1", [clubId]);
    await actor();
    const payload = await request(null);
    await save(payload);
    await db.query("reset role");
    expect((await db.query("select count(*)::int as count from onzio.tryouts_page_content where club_id=$1", [clubId])).rows[0].count).toBe(0);
  });

  it("rejects stale drafts after a legacy row write and cross-tenant direct RPC calls", async () => {
    const payload = await request(null);
    await db.query("update onzio.tryouts set location='Changed elsewhere' where club_id=$1 and id=(select id from onzio.tryouts where club_id=$1 limit 1)", [clubId]);
    // If Alpha has no initial event, create one through the legacy row path.
    if ((await load()).revision === payload.expectedRevision) {
      await db.query("insert into onzio.tryouts(club_id,headline) values($1,'Legacy event')", [clubId]);
    }
    await rejects(() => save(payload), "TRYOUTS_CHANGED");
    await rejects(() => save(payload, CLUB_IDS.bravo), "NOT_AUTHORIZED");
  });

  it("rejects malformed direct RPC revisions without writing content or receipts", async () => {
    const baseline = await load();
    const payload = await request(null);
    for (const expectedRevision of [null, 0, true, {}, [], "", "unknown", "0".repeat(21)]) {
      await rejects(() => save({ ...payload, expectedRevision }), "INVALID_TRYOUTS_PAYLOAD");
      expect(await load()).toEqual(baseline);
      expect((await load(payload.operationId)).operation).toEqual({ status: "not-committed" });
    }
    const missingRevision: Record<string, unknown> = { ...payload };
    delete missingRevision.expectedRevision;
    await rejects(() => save(missingRevision), "INVALID_TRYOUTS_PAYLOAD");
    expect(await load()).toEqual(baseline);
  });

  it("rejects load and Save after switching to a design without a public Tryouts page", async () => {
    await design("editorial");
    const payload = await request(null);
    expect((await save(payload)).revision).toBeDefined();
    await design("clubhouse");
    await rejects(() => load(), "PAGE_UNAVAILABLE");
    await rejects(() => save(payload), "PAGE_UNAVAILABLE");
  });
});
