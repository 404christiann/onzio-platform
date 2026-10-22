import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { createFreshLocalClient } from "../helpers/mfa";

const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };
const club = CLUB_IDS.alpha;
const migration = "supabase/migrations/20261022211358_contact_content_policy.sql";
const profile = { public_email: "hello@example.test", public_phone: "(312) 731-9479", service_area: "Chicago", hours: "Weekdays" };
const page = { eyebrow: "CONTACT", headline: "Talk to the club", intro: "Everyone is welcome.", hero_media_asset_id: null as string | null };
let db: Client;
async function actor(user: string = USER_IDS.ownerAal2, ageDays = 0, amr = true) {
  await db.query("reset role");
  const second = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user, role: "authenticated", aal: "aal1", ...(amr ? { amr: [{ method: "otp", timestamp: second - ageDays * 86400 }] } : {}) })]);
  await db.query("set local role authenticated");
}
async function design(template: string | null = "cinematic", id: string = club) {
  await db.query("reset role");
  if (template === null) await db.query("delete from onzio.presentation_state where club_id=$1", [id]);
  else {
    const document = randomUUID();
    await db.query(`insert into onzio.presentation_documents(id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
      values($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,$3,1,$4,$5,$6)`,
    [document, id, template, { schemaVersion: 1, template: { id: template, version: 1 }, navigation: { groups: [{ routes: ["home"] }] } }, "a".repeat(64), USER_IDS.ownerAal2]);
    await db.query(`insert into onzio.presentation_state(club_id,published_document_id,updated_by) values($1,$2,$3)
      on conflict(club_id) do update set published_document_id=excluded.published_document_id`, [id, document, USER_IDS.ownerAal2]);
  }
  await db.query("update onzio.clubs set store_enabled=false where id=$1", [id]);
  await actor();
}
async function load(operationId: string | null = null, id: string = club) {
  return (await db.query("select onzio.load_contact_editor($1,$2) as data", [id, operationId])).rows[0].data;
}
async function request(overrides: Record<string, unknown> = {}) {
  return { operationId: randomUUID(), expectedRevision: (await load()).revision, profile: { ...profile }, page: { ...page }, ...overrides };
}
async function save(body: unknown, id: string = club) {
  return (await db.query("select onzio.save_contact_editor($1,$2::jsonb) as data", [id, JSON.stringify(body)])).rows[0].data;
}
async function fingerprint(id: string = club) {
  await db.query("savepoint observation");
  try {
    await db.query("reset role");
    return (await db.query(`select
      (select to_jsonb(s) from onzio.contact_profile s where club_id=$1) as profile,
      (select to_jsonb(s) from onzio.contact_page_content s where club_id=$1) as page,
      (select to_jsonb(s) from onzio_private.contact_editor_revisions s where club_id=$1) as revision,
      (select jsonb_agg(to_jsonb(s) order by actor_id,operation_id) from onzio_private.contact_editor_receipts s where club_id=$1) as receipts,
      (select jsonb_agg(to_jsonb(s) order by id) from onzio.audit_events s where club_id=$1) as audit,
      (select jsonb_agg(to_jsonb(s) order by id) from onzio.media_assets s where club_id=$1) as media,
      (select to_jsonb(s) from onzio.presentation_state s where club_id=$1) as presentation`, [id])).rows[0];
  } finally { await db.query("rollback to savepoint observation"); }
}
async function rejected(action: () => Promise<unknown>, error: string, id: string = club, code?: string) {
  const before = await fingerprint(id);
  await db.query("savepoint expected_failure");
  try {
    await expect(action()).rejects.toThrow(error);
    if (code) {
      await db.query("rollback to savepoint expected_failure");
      await expect(action()).rejects.toMatchObject({ code });
    }
  } finally { await db.query("rollback to savepoint expected_failure"); }
  expect(await fingerprint(id)).toEqual(before);
}
async function denied(body: unknown, error = "INVALID_CONTACT_PAYLOAD", id: string = club, code?: string) {
  await rejected(() => save(body, id), error, id, code);
}
async function asset(changes: { owner?: string; surface?: string; status?: string; deleted?: boolean } = {}) {
  await db.query("reset role");
  const id = randomUUID(), owner = changes.owner ?? club;
  await db.query(`insert into onzio.media_assets(id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at,deleted_at,created_by)
    values($1,$2,'onzio-media',$3,$4,'photograph','image/webp',100,50,50,$5,$6,now(),$7,$8)`,
  [id, owner, `${owner}/contact/${id}.webp`, changes.surface ?? "contact", "b".repeat(64), changes.status ?? "published", changes.deleted ? new Date() : null, USER_IDS.ownerAal2]);
  await actor(); return id;
}
async function newClub() {
  await db.query("reset role");
  const id = randomUUID();
  await db.query("insert into onzio.clubs(id,slug,name,kind,lifecycle,public_access,store_enabled) values($1,$2,'Contact policy','test','active','live',false)", [id, `contact-policy-${id}`]);
  await db.query("insert into onzio.club_members(club_id,user_id,role,status) values($1,$2,'owner','active')", [id, USER_IDS.ownerAal2]);
  return id;
}
beforeEach(async () => {
  assertSafeTestEnvironment(); db = new Client(config); await db.connect();
  await db.query("set statement_timeout='8s'"); await db.query("begin"); await design();
});
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("Contact content independent of display", () => {
  for (const [role, user] of [["owner", USER_IDS.ownerAal2], ["admin", USER_IDS.adminAal2]] as const) {
    it.each([null, "cinematic", "heritage", "academy", "clubhouse", "editorial"])(`lets ${role} create absent Contact rows under %s`, async template => {
      await design(template); const media = await asset(); await db.query("reset role");
      await db.query("delete from onzio.contact_profile where club_id=$1", [club]);
      await db.query("delete from onzio.contact_page_content where club_id=$1", [club]);
      await actor(user);
      const initial = await load(); expect(initial.profile).toBeNull(); expect(initial.page).toBeNull();
      const before = await fingerprint();
      const maintainedPage = { ...page, hero_media_asset_id: media };
      const receipt = await save(await request({ page: maintainedPage }));
      expect(receipt).toMatchObject({ profile, page: maintainedPage });
      expect(receipt.revision).not.toBe(initial.revision);
      expect(await load()).toMatchObject({ revision: receipt.revision, profile, page: maintainedPage });
      expect((await fingerprint()).presentation).toEqual(before.presentation);
    });
  }
  it("initializes a true legacy club with no presentation or Contact history", async () => {
    const id = await newClub(); await actor();
    expect(await load(null, id)).toEqual({ revision: "0", profile: null, page: null });
    const body = { operationId: randomUUID(), expectedRevision: "0", profile, page };
    expect(await save(body, id)).toMatchObject({ profile, page });
    await db.query("reset role");
    expect((await db.query("select count(*)::int as count from onzio.presentation_documents where club_id=$1", [id])).rows).toEqual([{ count: 0 }]);
  });
  it.each(["contact_profile", "contact_page_content"])("recreates only missing %s while preserving atomic paired writes", async table => {
    await save(await request()); await db.query("reset role");
    await db.query(`delete from onzio.${table} where club_id=$1`, [club]); await actor();
    const before = await load(); expect(before[table === "contact_profile" ? "profile" : "page"]).toBeNull();
    const saved = await save(await request()); expect(saved).toMatchObject({ profile, page });
    expect(saved.revision).not.toBe(before.revision);
  });
  it("keeps a current content request valid through a display-only design change", async () => {
    const body = await request(); await design("clubhouse");
    expect(await save(body)).toMatchObject({ profile, page });
  });
  it("hashes every original field before trimming and reports replaced media IDs", async () => {
    const media = await asset();
    const body = await request({ profile: { public_email: " hello@example.test ", public_phone: " (312) 731-9479 ", service_area: " Chicago ", hours: " Weekdays " }, page: { eyebrow: " CONTACT ", headline: " Talk to the club ", intro: " Everyone is welcome. ", hero_media_asset_id: media } });
    const receipt = await save(body);
    expect(receipt).toMatchObject({ profile, page: { ...page, hero_media_asset_id: media } });
    await db.query("reset role");
    expect((await db.query("select request_hash=encode(sha256(convert_to($3::jsonb::text,'UTF8')),'hex') as exact from onzio_private.contact_editor_receipts where club_id=$1 and operation_id=$2", [club, body.operationId, JSON.stringify(body)])).rows).toEqual([{ exact: true }]);
    await actor(); expect(await save(body)).toEqual(receipt);
    for (const changed of [
      { ...body, expectedRevision: "999" },
      { ...body, profile: { ...body.profile, service_area: "Chicago" } },
      { ...body, page: { ...body.page, eyebrow: "CONTACT" } },
      { ...body, page: { ...body.page, intro: "Changed valid content" } },
    ]) await denied(changed, "OPERATION_REUSED", club, "22023");
    const removed = await save(await request()); expect(removed.retiredMediaAssetIds).toEqual([media]);
    expect((await load(removed.operationId)).operation.receipt.retiredMediaAssetIds).toEqual([media]);
    await db.query("reset role"); await db.query("update onzio.media_assets set status='orphaned',deleted_at=now() where id=$1", [media]); await actor();
    const beforeReplay = await fingerprint(); expect(await save(body)).toEqual(receipt); expect(await fingerprint()).toEqual(beforeReplay);
  });
  it.each([null, 0, true, [], "invalid"].map(value => ({ value })))("rejects invalid envelope $value", async ({ value }) => { await denied(value); });
  it.each(["extra", "missing operation", "missing revision", "missing profile", "missing page", "operation UUID", "operation null", "media UUID", "media number", "profile array", "page array", "profile extra", "page extra", "profile missing", "page missing"])("rejects strict %s", async kind => {
    const body: any = await request();
    if (kind === "extra") body.club_id = club;
    if (kind === "missing operation") delete body.operationId;
    if (kind === "missing revision") delete body.expectedRevision;
    if (kind === "missing profile") delete body.profile;
    if (kind === "missing page") delete body.page;
    if (kind === "operation UUID") body.operationId = "invalid";
    if (kind === "operation null") body.operationId = null;
    if (kind === "media UUID") body.page.hero_media_asset_id = "invalid";
    if (kind === "media number") body.page.hero_media_asset_id = 2;
    if (kind === "profile array") body.profile = [];
    if (kind === "page array") body.page = [];
    if (kind === "profile extra") body.profile.forged = "value";
    if (kind === "page extra") body.page.forged = "value";
    if (kind === "profile missing") delete body.profile.hours;
    if (kind === "page missing") delete body.page.intro;
    await denied(body);
  });
  for (const section of ["profile", "page"] as const) {
    it.each([null, 2, false, "text", []].map(value => ({ value })))(`rejects ${section} object type $value`, async ({ value }) => {
      await denied(await request({ [section]: value }));
    });
  }
  it.each([null, 0, true, {}, [], "", "-1", "abc", "1".repeat(21)].map(value => ({ value })))("rejects malformed revision $value", async ({ value }) => { await denied(await request({ expectedRevision: value })); });
  for (const [section, field, max] of [
    ["profile", "public_email", 254], ["profile", "public_phone", 40], ["profile", "service_area", 120], ["profile", "hours", 200],
    ["page", "eyebrow", 80], ["page", "headline", 80], ["page", "intro", 320],
  ] as const) {
    it.each([null, 2, false, [], {}].map(value => ({ value })))(`rejects ${section}.${field} type $value`, async ({ value }) => {
      const body = await request(); (body[section] as Record<string, unknown>)[field] = value; await denied(body);
    });
    it(`rejects ${section}.${field} above its preserved bound`, async () => {
      const body = await request(); (body[section] as Record<string, unknown>)[field] = "x".repeat(max + 1); await denied(body);
    });
  }
  it("accepts exact text bounds and the established SQL phone-only length policy", async () => {
    const body = await request({ profile: { public_email: `${"x".repeat(241)}@example.test`, public_phone: "x".repeat(40), service_area: "x".repeat(120), hours: "x".repeat(200) }, page: { eyebrow: "x".repeat(80), headline: "x".repeat(80), intro: "x".repeat(320), hero_media_asset_id: null } });
    expect((await save(body)).profile).toEqual(body.profile);
  });
  it("retains table email validation with atomic rollback", async () => { await denied(await request({ profile: { ...profile, public_email: "invalid-email" } }), "contact_profile", club, "23514"); });
  it.each([{ owner: CLUB_IDS.bravo }, { surface: "roster" }, { status: "staged" }, { status: "orphaned" }, { deleted: true }])("rejects unusable hidden media (%#)", async changes => {
    const media = await asset(changes); await denied(await request({ page: { ...page, hero_media_asset_id: media } }), "INVALID_CONTACT_MEDIA");
  });
  it("rejects nonexistent media without effects", async () => { await denied(await request({ page: { ...page, hero_media_asset_id: randomUUID() } }), "INVALID_CONTACT_MEDIA"); });
  it.each(["page write", "receipt insert"])("rolls back both rows, revision, audit and receipt on failed %s", async kind => {
    await db.query("reset role");
    await db.query("create function pg_temp.reject_contact_write() returns trigger language plpgsql as $$ begin raise exception 'injected Contact failure'; end $$");
    await db.query(`create trigger test_reject_contact before insert or update on ${kind === "page write" ? "onzio.contact_page_content" : "onzio_private.contact_editor_receipts"} for each row execute function pg_temp.reject_contact_write()`);
    await actor(); await denied(await request(), "injected Contact failure");
  });
  it.each([USER_IDS.unaffiliated, USER_IDS.removed])("denies nonmember or removed actor %s for read and save", async user => {
    const body = await request(); await actor(user); await denied(body, "NOT_AUTHORIZED"); await rejected(() => load(), "NOT_AUTHORIZED");
  });
  it.each(["expired", "missing AMR", "foreign", "anonymous"])("denies %s read and save", async kind => {
    const body = await request();
    if (kind === "expired") await actor(USER_IDS.ownerAal2, 31);
    if (kind === "missing AMR") await actor(USER_IDS.ownerAal2, 0, false);
    if (kind === "anonymous") { await db.query("reset role"); await db.query("set local role anon"); }
    const id = kind === "foreign" ? CLUB_IDS.bravo : club, error = kind === "anonymous" ? "permission denied" : "NOT_AUTHORIZED";
    await denied(body, error, id); await rejected(() => load(null, id), error, id);
  });
  it.each(["archived", "suspended"])("denies fresh saves, replay and status after %s", async state => {
    const body = await request(); await save(body); await db.query("reset role");
    if (state === "archived") await db.query("update onzio.clubs set lifecycle='archived',public_access='suspended',archived_at=now() where id=$1", [club]);
    else await db.query("update onzio.clubs set kind='customer',public_access='suspended' where id=$1", [club]);
    await actor(); await denied(body, "NOT_AUTHORIZED"); await denied({ ...body, operationId: randomUUID() }, "NOT_AUTHORIZED"); await rejected(() => load(body.operationId), "NOT_AUTHORIZED");
  });
  it.each(["onboarding", "grace"])("allows hidden maintenance during %s", async state => {
    await db.query("reset role");
    await db.query("update onzio.clubs set kind='customer',lifecycle=$2,public_access=$3 where id=$1", [club, state === "onboarding" ? "onboarding" : "active", state === "onboarding" ? "preview" : "grace"]);
    await actor(); expect(await save(await request())).toMatchObject({ profile, page });
  });
  it.each(["session", "membership"])("requires current %s before receipt replay and status", async kind => {
    const body = await request(); await save(body);
    if (kind === "session") await actor(USER_IDS.ownerAal2, 31);
    else { await db.query("reset role"); await db.query("update onzio.club_members set status='removed',removed_at=now() where club_id=$1 and user_id=$2", [club, USER_IDS.ownerAal2]); await actor(); }
    await denied(body, "NOT_AUTHORIZED"); await rejected(() => load(body.operationId), "NOT_AUTHORIZED");
  });
  it.each(["contact_profile", "contact_page_content"])("retains shared revision CAS after a legacy %s update", async table => {
    await save(await request()); const stale = await request(); await db.query("reset role");
    await db.query(`update onzio.${table} set ${table === "contact_profile" ? "hours='Legacy hours'" : "headline='Legacy headline'"} where club_id=$1`, [club]); await actor();
    await denied(stale, "CONTACT_CHANGED", club, "PT409");
  });
  it("preserves a genuine old receipt through complete migration and changed hidden design/content/media", async () => {
    await db.query("reset role");
    const historical = readFileSync("supabase/migrations/20261005003024_contact_page_editor.sql", "utf8");
    for (const name of ["onzio.load_contact_editor", "onzio.save_contact_editor"]) {
      const start = historical.indexOf(`create function ${name}(`), end = historical.indexOf("end $$;", start) + "end $$;".length;
      expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
      await db.query(historical.slice(start, end).replace("create function", "create or replace function"));
    }
    await design("academy"); const media = await asset();
    const original = await request({ profile: { ...profile, hours: " Weekdays " }, page: { ...page, hero_media_asset_id: media } });
    const receipt = await save(original), before = await fingerprint(); await db.query("reset role");
    const securityQuery = "select proname,proacl,prosecdef,proconfig from pg_proc where oid in ('onzio.load_contact_editor(uuid,uuid)'::regprocedure,'onzio.save_contact_editor(uuid,jsonb)'::regprocedure) order by proname";
    const security = (await db.query(securityQuery)).rows;
    await db.query(readFileSync(migration, "utf8")); expect(await fingerprint()).toEqual(before); expect((await db.query(securityQuery)).rows).toEqual(security);
    await design("clubhouse"); await actor(USER_IDS.adminAal2);
    expect((await load(original.operationId)).operation).toEqual({ status: "not-committed" });
    await save(await request()); await denied(original, "CONTACT_CHANGED");
    await db.query("reset role"); await db.query("update onzio.media_assets set status='orphaned',deleted_at=now() where id=$1", [media]); await actor();
    const beforeReplay = await fingerprint(); expect(await save(original)).toEqual(receipt);
    expect((await load(original.operationId)).operation).toEqual({ status: "committed", receipt }); expect(await fingerprint()).toEqual(beforeReplay);
    await denied({ ...original, profile: { ...original.profile, hours: "Weekdays" } }, "OPERATION_REUSED");
    await db.query("reset role");
    expect((await db.query("select request_hash=encode(sha256(convert_to($3::jsonb::text,'UTF8')),'hex') as exact from onzio_private.contact_editor_receipts where club_id=$1 and actor_id=$2 and operation_id=$4", [club, USER_IDS.ownerAal2, JSON.stringify(original), original.operationId])).rows).toEqual([{ exact: true }]);
  });
});

it("commits hidden nonempty profile, page and media through loopback PostgREST and denies an outsider", async () => {
  await db.query("rollback"); const id = await newClub();
  const owner = await createFreshLocalClient({ userId: USER_IDS.ownerAal2, email: "owner-aal2@alpha.local" });
  try {
    await db.query("begin"); await design("clubhouse", id); const media = await asset({ owner: id }); await db.query("reset role"); await db.query("commit");
    const rpc = async (name: "load_contact_editor" | "save_contact_editor", args: Record<string, unknown>) => {
      const result = await owner.client.rpc(name, args as any).abortSignal(AbortSignal.timeout(5000));
      expect(result.error).toBeNull(); return result.data as any;
    };
    const initial = await rpc("load_contact_editor", { p_club_id: id });
    const body = { operationId: randomUUID(), expectedRevision: initial.revision, profile, page: { ...page, hero_media_asset_id: media } };
    const saved = await rpc("save_contact_editor", { p_club_id: id, p_request: body }); expect(saved).toMatchObject({ profile, page: body.page });
    expect(await rpc("load_contact_editor", { p_club_id: id })).toMatchObject({ revision: saved.revision, profile, page: body.page });
    expect(await rpc("save_contact_editor", { p_club_id: id, p_request: body })).toEqual(saved);
    expect((await rpc("load_contact_editor", { p_club_id: id, p_operation_id: body.operationId })).operation).toEqual({ status: "committed", receipt: saved });
    expect((await db.query("select public_email,hours from onzio.contact_profile where club_id=$1", [id])).rows).toEqual([{ public_email: profile.public_email, hours: profile.hours }]);
    expect((await db.query("select headline,hero_media_asset_id from onzio.contact_page_content where club_id=$1", [id])).rows).toEqual([{ headline: page.headline, hero_media_asset_id: media }]);
    const outsider = await createFreshLocalClient({ userId: USER_IDS.unaffiliated, email: "unaffiliated@alpha.local" });
    try {
      await db.query("begin"); const untouched = await fingerprint(id);
      for (const [name, args] of [["save_contact_editor", { p_club_id: id, p_request: { ...body, operationId: randomUUID() } }], ["load_contact_editor", { p_club_id: id, p_operation_id: body.operationId }]] as const) {
        const rejected = await outsider.client.rpc(name, args as any).abortSignal(AbortSignal.timeout(5000));
        expect(rejected.status).toBe(403); expect(rejected.error).toMatchObject({ code: "42501", message: "NOT_AUTHORIZED" });
      }
      expect(await fingerprint(id)).toEqual(untouched); await db.query("rollback");
    } finally { await outsider.cleanup(); }
  } finally {
    await db.query("rollback"); await db.query("reset role"); await db.query("begin");
    try {
      await db.query("lock table onzio.presentation_documents in access exclusive mode");
      await db.query("delete from onzio.presentation_state where club_id=$1", [id]);
      await db.query("alter table onzio.presentation_documents disable trigger presentation_documents_immutable");
      await db.query("delete from onzio.presentation_documents where club_id=$1", [id]);
      await db.query("alter table onzio.presentation_documents enable trigger presentation_documents_immutable");
      for (const table of ["contact_profile", "contact_page_content", "media_assets", "club_members", "audit_events"]) await db.query(`delete from onzio.${table} where club_id=$1`, [id]);
      await db.query("delete from onzio.clubs where id=$1", [id]);
      for (const table of ["onzio.clubs", "onzio.presentation_documents", "onzio_private.contact_editor_revisions", "onzio_private.contact_editor_receipts"]) expect((await db.query(`select count(*)::int as count from ${table} where ${table === "onzio.clubs" ? "id" : "club_id"}=$1`, [id])).rows).toEqual([{ count: 0 }]);
      await db.query("commit");
    } catch (error) { await db.query("rollback"); throw error; }
    finally { await owner.cleanup(); }
  }
});
