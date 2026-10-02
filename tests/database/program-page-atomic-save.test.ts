import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";

let db: Client;
const clubId = CLUB_IDS.alpha;
let programId: string;

async function actor() {
  await db.query("reset role");
  const second = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({
    sub: USER_IDS.ownerAal2, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second }],
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

async function asset(owner: string = clubId) {
  const id = randomUUID();
  await db.query("reset role");
  await db.query(`insert into onzio.media_assets
    (id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at)
    values($1,$2,'onzio-media',$3,'programs','photograph','image/webp',100,100,100,$4,'published',now())`,
  [id, owner, `${owner}/programs/${id}.webp`, "b".repeat(64)]);
  await actor();
  return id;
}

async function load() {
  return (await db.query("select onzio.load_program_page($1,$2) as data", [clubId, programId])).rows[0].data;
}
async function save(request: unknown) {
  return (await db.query("select onzio.save_program_page($1,$2::jsonb) as data", [clubId, JSON.stringify(request)])).rows[0].data;
}
async function directory() {
  return (await db.query("select onzio.load_program_directory($1) as data", [clubId])).rows[0].data;
}
async function saveDirectory(request: unknown) {
  return (await db.query("select onzio.save_program_directory($1,$2::jsonb) as data", [clubId, JSON.stringify(request)])).rows[0].data;
}
async function rejects(action: () => Promise<unknown>, message: string) {
  await db.query("savepoint expected_failure");
  try { await expect(action()).rejects.toThrow(message); }
  finally { await db.query("rollback to savepoint expected_failure"); }
}

function programPayload(row: Record<string, unknown>) {
  const keys = ["slug","nav_label","display_title","kicker","summary","body","highlights","layout_variant","hero_media_asset_id","detail_media_asset_id","external_cta_label","external_cta_href","registration_form_id","registration_enabled","registration_eyebrow","registration_headline","registration_body","registration_pending_body","registration_pending_label","status","sort_order"];
  return Object.fromEntries(keys.map((key) => [key, row[key]]));
}
function request(snapshot: any, changes: Record<string, unknown> = {}, gallery: unknown[] = []) {
  return {
    operationId: randomUUID(), programId,
    expected: { programUpdatedAt: snapshot.program.updated_at, gallery: snapshot.gallery.map((item: any) => ({ id: item.id, updatedAt: item.updated_at })) },
    program: { ...programPayload(snapshot.program), ...changes }, gallery,
  };
}

beforeEach(async () => {
  assertSafeTestEnvironment();
  db = new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
  await db.connect();
  await db.query("begin");
  await design();
  programId = randomUUID();
  await db.query("reset role");
  await db.query("insert into onzio.programs(id,club_id,slug,display_title) values($1,$2,$3,'Original program')", [programId, clubId, `program-${programId.slice(0, 8)}`]);
  await actor();
});
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("Programs public-page transactions", () => {
  it("saves program copy and its gallery together, and returns an idempotent receipt", async () => {
    const photo = await asset();
    const before = await load();
    const payload = request(before, { display_title: "Updated program" }, [{ id: null, mediaAssetId: photo, alt: "Players training", sortOrder: 0 }]);
    const first = await save(payload);
    expect(first.program.display_title).toBe("Updated program");
    expect(first.gallery[0].media_asset_id).toBe(photo);
    expect(first.gallery[0].url).toMatch(/^\//);
    expect(await save(payload)).toEqual(first);
    const recovered = (await db.query("select onzio.load_program_page($1,$2,$3) as data", [clubId, programId, payload.operationId])).rows[0].data;
    expect(recovered.operation).toEqual({ status: "committed", receipt: first });
  });

  it("rolls back the row and receipt when a gallery write fails", async () => {
    const photo = await asset();
    await db.query("reset role");
    await db.query(`create function pg_temp.reject_program_gallery() returns trigger language plpgsql as
      $$ begin raise exception 'injected gallery failure'; end $$`);
    await db.query("create trigger test_reject_program_gallery before insert on onzio.program_media for each row execute function pg_temp.reject_program_gallery()");
    await actor();
    const before = await load();
    const payload = request(before, { display_title: "Must roll back" }, [{ id: null, mediaAssetId: photo, alt: "Photo", sortOrder: 0 }]);
    await rejects(() => save(payload), "injected gallery failure");
    expect(await load()).toEqual(before);
    await db.query("reset role");
    expect((await db.query("select count(*)::int as n from onzio_private.program_page_receipts where operation_id=$1", [payload.operationId])).rows[0].n).toBe(0);
  });

  it("rejects stale content, cross-tenant assets, and detail writes to stable URLs or directory-owned visibility", async () => {
    const before = await load();
    await save(request(before, { body: "First save" }));
    await rejects(() => save(request(before, { body: "Stale save" })), "CONTENT_CHANGED");
    const current = await load();
    const wrongAsset = await asset(CLUB_IDS.bravo);
    await rejects(() => save(request(current, { hero_media_asset_id: wrongAsset })), "INVALID_PROGRAM_MEDIA");
    await rejects(() => save(request(current, { slug: "changed-public-url" })), "FIELD_UNAVAILABLE");
    await rejects(() => save(request(current, { status: "hidden" })), "FIELD_UNAVAILABLE");
    expect((await load()).program.body).toBe("First save");
  });

  it("stages public order and visibility under one directory Save and rejects a stale list", async () => {
    const before = await directory();
    const expected = before.programs.map((row: any) => ({ id: row.id, updatedAt: row.updated_at }));
    const desired = before.programs.map((row: any, index: number) => ({ id: row.id, sortOrder: index, status: row.id === programId ? "hidden" : row.status }));
    const payload = { operationId: randomUUID(), expected, programs: desired };
    const saved = await saveDirectory(payload);
    expect(saved.programs.find((row: any) => row.id === programId).status).toBe("hidden");
    expect(await saveDirectory(payload)).toEqual(saved);
    await rejects(() => saveDirectory({ ...payload, operationId: randomUUID() }), "CONTENT_CHANGED");
  });
});
