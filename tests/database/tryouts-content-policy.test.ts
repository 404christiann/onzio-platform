import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { createFreshLocalClient } from "../helpers/mfa";

const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };
const club = CLUB_IDS.alpha;
const migration = "supabase/migrations/20261022223212_tryouts_content_policy.sql";
const page = { intro_with_tryouts: "Evaluations are open.", intro_no_tryouts: "News soon." };
const event = { id: null, program_id: null, status: "open", eyebrow: "EVALUATION", headline: "First team", intro: "Join our club.", hero_media_asset_id: null,
  eligibility_copy: "Adults", what_to_expect_copy: "Small games", preparation_copy: "Bring boots", event_date: "2026-12-01", location: "Local park", cost_text: "Free", cta_label: "Register", registration_href: "/evaluation?team=first#register", registration_form_id: null, closed_message: "Watch for more dates", sort_order: 0 };
const fields = Object.keys(event);
const rows = (events: Record<string, unknown>[]) => events.map((row, sort_order) => Object.fromEntries(fields.map(key => [key, key === "sort_order" ? sort_order : row[key]])));
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
  return (await db.query("select onzio.load_tryouts_page($1,$2) as data", [id, operationId])).rows[0].data;
}
async function request(overrides: Record<string, unknown> = {}) {
  return { operationId: randomUUID(), expectedRevision: (await load()).revision, page: { ...page }, events: rows((await load()).events), deletedIds: [], ...overrides };
}
async function save(body: unknown, id: string = club) {
  return (await db.query("select onzio.save_tryouts_page($1,$2::jsonb) as data", [id, JSON.stringify(body)])).rows[0].data;
}
async function fingerprint(id: string = club) {
  await db.query("savepoint observation");
  try {
    await db.query("reset role");
    return (await db.query(`select
      (select jsonb_agg(to_jsonb(s) order by id) from onzio.tryouts s where club_id=$1) as events,
      (select to_jsonb(s) from onzio.tryouts_page_content s where club_id=$1) as page,
      (select to_jsonb(s) from onzio_private.tryouts_page_revisions s where club_id=$1) as revision,
      (select jsonb_agg(to_jsonb(s) order by actor_id,operation_id) from onzio_private.tryouts_page_save_receipts s where club_id=$1) as receipts,
      (select encode(sha256(convert_to(coalesce(string_agg(to_jsonb(s)::text,'' order by id),''),'UTF8')),'hex') from onzio.audit_events s where club_id=$1) as audit,
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
async function denied(body: unknown, error = "INVALID_TRYOUTS_PAYLOAD", id: string = club, code?: string) {
  await rejected(() => save(body, id), error, id, code);
}
async function asset(changes: { owner?: string; surface?: string; status?: string; deleted?: boolean } = {}) {
  await db.query("reset role");
  const id = randomUUID(), owner = changes.owner ?? club;
  await db.query(`insert into onzio.media_assets(id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at,deleted_at,created_by)
    values($1,$2,'onzio-media',$3,$4,'photograph','image/webp',100,50,50,$5,$6,now(),$7,$8)`,
  [id, owner, `${owner}/tryouts/${id}.webp`, changes.surface ?? "tryouts", "b".repeat(64), changes.status ?? "published", changes.deleted ? new Date() : null, USER_IDS.ownerAal2]);
  await actor(); return id;
}
async function links(id: string = club) {
  await db.query("reset role"); const program = randomUUID(), form = randomUUID();
  await db.query("insert into onzio.programs(id,club_id,slug,nav_label,display_title) values($1,$2,$3,'First','First team')", [program, id, `first-${program}`]);
  await db.query("insert into onzio.registration_forms(id,club_id,slug,title,status) values($1,$2,$3,'Evaluation','draft')", [form, id, `form-${form}`]);
  await actor(); return { program_id: program, registration_form_id: form };
}
async function newClub() {
  await db.query("reset role");
  const id = randomUUID();
  await db.query("insert into onzio.clubs(id,slug,name,kind,lifecycle,public_access,store_enabled) values($1,$2,'Tryouts policy','test','active','live',false)", [id, `tryouts-policy-${id}`]);
  await db.query("insert into onzio.club_members(club_id,user_id,role,status) values($1,$2,'owner','active')", [id, USER_IDS.ownerAal2]);
  return id;
}
beforeEach(async () => {
  assertSafeTestEnvironment(); db = new Client(config); await db.connect();
  await db.query("set statement_timeout='8s'"); await db.query("begin"); await design();
});
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });


describe("Tryouts content independent of display", () => {
  for (const [role, user] of [["owner", USER_IDS.ownerAal2], ["admin", USER_IDS.adminAal2]] as const) {
    it.each([null, "cinematic", "heritage", "academy", "clubhouse", "editorial"])(`lets ${role} maintain full nonempty content under %s`, async template => {
      await design(template); const media = await asset(), linked = await links(); await actor(user);
      const baseline = await load(), before = await fingerprint();
      const maintained = { ...event, ...linked, hero_media_asset_id: media, sort_order: baseline.events.length };
      const receipt = await save(await request({ events: [...rows(baseline.events), maintained] }));
      expect(receipt.page).toEqual(page); expect(receipt.events).toContainEqual(expect.objectContaining({ ...maintained, id: expect.any(String) }));
      expect(await load()).toMatchObject({ revision: receipt.revision, page, events: receipt.events });
      expect((await fingerprint()).presentation).toEqual(before.presentation);
    });
  }
  it("creates content on a true legacy club without presentation history", async () => {
    const id = await newClub(); await actor(); expect(await load(null, id)).toEqual({ revision: "0", page: {}, events: [] });
    const body = { operationId: randomUUID(), expectedRevision: "0", page, events: [event], deletedIds: [] };
    expect(await save(body, id)).toMatchObject({ page, events: [expect.objectContaining({ headline: event.headline })] });
    await db.query("reset role"); expect((await db.query("select count(*)::int as count from onzio.presentation_documents where club_id=$1", [id])).rows).toEqual([{ count: 0 }]);
  });
  it("preserves absent and existing intro for page null and trims only the intro object", async () => {
    await db.query("reset role"); await db.query("delete from onzio.tryouts_page_content where club_id=$1", [club]); await actor();
    expect((await save(await request({ page: null }))).page).toEqual({});
    const saved = await save(await request({ page: { intro_with_tryouts: "  Intro  ", intro_no_tryouts: "  " }, events: [...rows((await load()).events), { ...event, headline: "  Raw event  ", sort_order: (await load()).events.length }] }));
    expect(saved.page).toEqual({ intro_with_tryouts: "Intro", intro_no_tryouts: "" }); expect(saved.events.at(-1).headline).toBe("  Raw event  ");
    expect((await save(await request({ page: null }))).page).toEqual(saved.page);
  });
  it("adds, reorders, edits and deletes a complete roster while preserving linked forms", async () => {
    const linked = await links(), price = randomUUID(), registration = randomUUID();
    await db.query("reset role");
    await db.query("insert into onzio.registration_price_options(id,club_id,form_id,label,amount_cents) values($1,$2,$3,'Free',0)", [price, club, linked.registration_form_id]);
    await db.query("insert into onzio.registrations(id,club_id,form_id,answers,registrant_email,price_option_id,price_label,amount_cents,waiver_accepted_at,status_token_hash,participant_type) values($1,$2,$3,'{}','synthetic@example.test',$4,'Free',0,now(),$5,'adult')", [registration, club, linked.registration_form_id, price, randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '')]);
    const originalRegistration = (await db.query("select to_jsonb(r) as data from onzio.registrations r where id=$1", [registration])).rows[0].data;
    await actor(); const first = await save(await request({ events: [...rows((await load()).events), { ...event, ...linked, sort_order: (await load()).events.length }, { ...event, headline: "Second", sort_order: (await load()).events.length + 1 }] }));
    const added = first.events.slice(-2), deleted = added[0].id;
    const ordered: Record<string, unknown>[] = [added[1], ...first.events.slice(0, -2)].map((row, index) => ({ ...rows([row])[0], sort_order: index, headline: index === 0 ? "Edited second" : row.headline }));
    const saved = await save(await request({ events: ordered, deletedIds: [deleted] })); expect(saved.events.map((row: any) => row.id)).toEqual(ordered.map(row => row.id)); expect(saved.events[0].headline).toBe("Edited second");
    await db.query("reset role"); expect((await db.query("select count(*)::int as count from onzio.registration_forms where id=$1", [linked.registration_form_id])).rows).toEqual([{ count: 1 }]);
    expect((await db.query("select to_jsonb(r) as data from onzio.registrations r where id=$1", [registration])).rows).toEqual([{ data: originalRegistration }]);
  });
  it.each([null, 0, true, [], "invalid"].map(value => ({ value })))("rejects invalid envelope $value", async ({ value }) => { await denied(value); });
  it.each(["root extra", "missing operation", "missing revision", "missing page", "missing events", "missing deletedIds", "operation invalid", "operation null", "page extra", "page missing", "page array", "events object", "deleted object", "event extra", "event missing", "event scalar", "event UUID", "event date", "event status", "event order", "events ceiling", "deleted ceiling"])("preserves strict %s denial", async kind => {
    const body: any = await request({ events: [...rows((await load()).events), { ...event, sort_order: (await load()).events.length }] });
    if (kind === "root extra") body.club_id = club;
    for (const key of ["operation", "revision", "page", "events", "deletedIds"]) if (kind === `missing ${key}`) delete body[{ operation: "operationId", revision: "expectedRevision", page: "page", events: "events", deletedIds: "deletedIds" }[key]!];
    if (kind === "operation invalid") body.operationId = "bad"; if (kind === "operation null") body.operationId = null;
    if (kind === "page extra") body.page.extra = "forged"; if (kind === "page missing") delete body.page.intro_no_tryouts; if (kind === "page array") body.page = [];
    if (kind === "events object") body.events = {}; if (kind === "deleted object") body.deletedIds = {};
    if (kind === "event extra") body.events.at(-1).extra = "forged"; if (kind === "event missing") delete body.events.at(-1).intro;
    if (kind === "event scalar") body.events.push(false); if (kind === "event UUID") body.events.at(-1).program_id = "bad";
    if (kind === "event date") body.events.at(-1).event_date = "2026-02-30"; if (kind === "event status") body.events.at(-1).status = "bad"; if (kind === "event order") body.events.at(-1).sort_order += 1;
    if (kind === "events ceiling") body.events = Array.from({ length: 501 }, (_, sort_order) => ({ ...event, sort_order })); if (kind === "deleted ceiling") body.deletedIds = Array.from({ length: 501 }, () => randomUUID());
    await denied(body, "INVALID_TRYOUTS_PAYLOAD");
  });
  it.each([null, 0, true, {}, [], "", "-1", "abc", "1".repeat(21)].map(value => ({ value })))("rejects malformed revision $value", async ({ value }) => { await denied(await request({ expectedRevision: value })); });
  for (const [field, max] of [["eyebrow", 80], ["headline", 80], ["intro", 320], ["eligibility_copy", 2000], ["what_to_expect_copy", 2000], ["preparation_copy", 2000], ["location", 160], ["cost_text", 120], ["cta_label", 40], ["registration_href", 2048], ["closed_message", 320]] as const) {
    it(`preserves ${field} bound`, async () => {
      const baseline = await load(), body = await request({ events: [...rows(baseline.events), { ...event, sort_order: baseline.events.length, [field]: field === "registration_href" ? `/${"x".repeat(max - 1)}` : "x".repeat(max) }] });
      expect((await save(body)).events.at(-1)[field]).toHaveLength(max);
      const next = await request({ events: rows((await load()).events).map((row, index, all) => index === all.length - 1 ? { ...row, [field]: `${row[field]}x` } : row) });
      await denied(next, "check constraint", club, "23514");
    });
  }
  it.each(["intro_with_tryouts", "intro_no_tryouts"])("preserves strict intro %s types and ceiling", async field => {
    for (const value of [null, 0, false, {}, [], "x".repeat(321)]) await denied(await request({ page: { ...page, [field]: value } }));
    expect((await save(await request({ page: { ...page, [field]: "x".repeat(320) } }))).page[field]).toHaveLength(320);
  });
  it.each(["", "/noncatalog-registration", "/register?group=first#form", "http://registration.example.test/form", "https://registration.example.test/form", "mailto:join@example.test"])("accepts established public href %s", async registration_href => {
    const baseline = await load(); expect((await save(await request({ events: [...rows(baseline.events), { ...event, registration_href, sort_order: baseline.events.length }] }))).events.at(-1).registration_href).toBe(registration_href);
  });
  it.each(["//evil.test", "/\\evil.test", "javascript:alert(1)", "data:text/html,a", "tel:123", "https://", "mailto:invalid", " https://example.test", "/path with-space", "/path\ncontrol"])("denies unsafe SQL href %s", async registration_href => {
    const baseline = await load(); await denied(await request({ events: [...rows(baseline.events), { ...event, registration_href, sort_order: baseline.events.length }] }));
  });
  it("retains SQL row coercion and exact revision string comparison", async () => {
    const baseline = await load(); const body = await request({ events: [...rows(baseline.events), { ...event, headline: 123, sort_order: String(baseline.events.length) }] });
    expect((await save(body)).events.at(-1).headline).toBe("123"); await denied(await request({ expectedRevision: `0${(await load()).revision}` }), "TRYOUTS_CHANGED", club, "PT409");
  });
  it.each(["omitted", "duplicate", "deleted duplicate", "overlap", "foreign", "nonexistent"])("denies incomplete or invalid roster %s", async kind => {
    const initial = await save(await request({ events: [...rows((await load()).events), { ...event, sort_order: (await load()).events.length }] }));
    const body: any = await request(); const id = initial.events.at(-1).id;
    if (kind === "omitted") body.events.pop(); if (kind === "duplicate") body.events.push({ ...body.events.at(-1), sort_order: body.events.length });
    if (kind === "deleted duplicate") { body.events.pop(); body.deletedIds = [id, id]; } if (kind === "overlap") body.deletedIds = [id];
    if (kind === "foreign" || kind === "nonexistent") {
      let invalid = randomUUID(); if (kind === "foreign") { await db.query("reset role"); await db.query("insert into onzio.tryouts(id,club_id,headline) values($1,$2,'Foreign')", [invalid, CLUB_IDS.bravo]); await actor(); } body.events.at(-1).id = invalid;
    }
    await denied(body, kind === "omitted" ? "TRYOUTS_CHANGED" : "INVALID_TRYOUTS_EVENT");
  });
  it.each([{ owner: CLUB_IDS.bravo }, { surface: "roster" }, { status: "staged" }, { status: "orphaned" }, { deleted: true }, { missing: true }])("rejects unusable event media (%#)", async changes => {
    const media = "missing" in changes ? randomUUID() : await asset(changes); const baseline = await load();
    await denied(await request({ events: [...rows(baseline.events), { ...event, hero_media_asset_id: media, sort_order: baseline.events.length }] }), "INVALID_TRYOUTS_EVENT");
  });
  it.each(["program_id", "registration_form_id"] as const)("retains atomic tenant and existence FK checks for %s", async field => {
    const foreign = await links(CLUB_IDS.bravo), baseline = await load();
    for (const value of [randomUUID(), foreign[field]]) await denied(await request({ events: [...rows(baseline.events), { ...event, [field]: value, sort_order: baseline.events.length }] }), "foreign key", club, "23503");
  });
  it("retains shared candidates and rechecks other-table references on historic cleanup", async () => {
    const media = await asset(), linked = await links(), initial = await load();
    const first = await save(await request({ events: [...rows(initial.events), { ...event, hero_media_asset_id: media, sort_order: initial.events.length }, { ...event, hero_media_asset_id: media, sort_order: initial.events.length + 1 }] }));
    const firstId = first.events.at(-2).id, lastId = first.events.at(-1).id;
    const oneLeft = await save(await request({ events: rows(first.events.filter((row: any) => row.id !== firstId)), deletedIds: [firstId] })); expect(oneLeft.retiredMediaAssetIds).toEqual([]);
    const body = await request({ events: rows(oneLeft.events.filter((row: any) => row.id !== lastId)), deletedIds: [lastId] });
    const receipt = await save(body); expect(receipt.retiredMediaAssetIds).toEqual([media]);
    await db.query("reset role"); await db.query("insert into onzio.program_media(club_id,program_id,url,media_asset_id) values($1,$2,$3,$4)", [club, linked.program_id, `/storage/v1/object/public/onzio-media/${club}/tryouts/${media}.webp`, media]);
    await actor(); expect(await save(body)).toEqual(receipt); expect((await load(body.operationId)).operation.receipt.retiredMediaAssetIds).toEqual([media]);
    await db.query("reset role"); await db.query("set local role service_role");
    expect((await db.query("select onzio.retire_unreferenced_media_asset($1,$2,$3) as data", [club, media, USER_IDS.ownerAal2])).rows[0].data).toEqual({ status: "referenced" });
    await db.query("reset role"); expect((await db.query("select status,deleted_at from onzio.media_assets where id=$1", [media])).rows).toEqual([{ status: "published", deleted_at: null }]);
  });
  it.each(["event write", "later event", "receipt insert"])("rolls back intro, earlier events, revisions, audit and receipt on failed %s", async kind => {
    const baseline = await load(); await db.query("reset role");
    await db.query("create function pg_temp.reject_tryouts_write() returns trigger language plpgsql as $$ begin if TG_TABLE_NAME<>'tryouts' then raise exception 'injected Tryouts failure'; end if; if new.headline='FAIL' then raise exception 'injected Tryouts failure'; end if; return new; end $$");
    await db.query(`create trigger test_reject_tryouts before insert or update on ${kind === "receipt insert" ? "onzio_private.tryouts_page_save_receipts" : "onzio.tryouts"} for each row execute function pg_temp.reject_tryouts_write()`); await actor();
    const additions = [{ ...event, headline: kind === "event write" ? "FAIL" : "First survives only on success", sort_order: baseline.events.length }, ...(kind === "later event" ? [{ ...event, headline: "FAIL", sort_order: baseline.events.length + 1 }] : [])];
    await denied(await request({ events: [...rows(baseline.events), ...additions] }), "injected Tryouts failure");
  });
  it.each([USER_IDS.unaffiliated, USER_IDS.removed])("denies outsider or removed actor %s", async user => {
    const body = await request(); await actor(user); await denied(body, "NOT_AUTHORIZED"); await rejected(() => load(), "NOT_AUTHORIZED");
  });
  it.each(["expired", "missing AMR", "foreign", "anonymous"])("denies %s read and save", async kind => {
    const body = await request(); if (kind === "expired") await actor(USER_IDS.ownerAal2, 31); if (kind === "missing AMR") await actor(USER_IDS.ownerAal2, 0, false);
    if (kind === "anonymous") { await db.query("reset role"); await db.query("set local role anon"); }
    const id = kind === "foreign" ? CLUB_IDS.bravo : club, error = kind === "anonymous" ? "permission denied" : "NOT_AUTHORIZED";
    await denied(body, error, id); await rejected(() => load(null, id), error, id);
  });
  it.each(["archived", "suspended", "expired", "membership"])("requires current %s authority before fresh save, replay and status", async kind => {
    const body = await request(); await save(body); await db.query("reset role");
    if (kind === "archived") await db.query("update onzio.clubs set lifecycle='archived',public_access='suspended' where id=$1", [club]);
    if (kind === "suspended") await db.query("update onzio.clubs set kind='customer',public_access='suspended' where id=$1", [club]);
    if (kind === "membership") await db.query("update onzio.club_members set status='removed',removed_at=now() where club_id=$1 and user_id=$2", [club, USER_IDS.ownerAal2]);
    await actor(USER_IDS.ownerAal2, kind === "expired" ? 31 : 0); await denied(body, "NOT_AUTHORIZED"); await denied({ ...body, operationId: randomUUID() }, "NOT_AUTHORIZED"); await rejected(() => load(body.operationId), "NOT_AUTHORIZED");
    if (kind === "suspended") expect((await load()).page).toEqual(page);
  });
  it.each(["onboarding", "grace"])("allows existing %s content authority", async state => {
    await db.query("reset role"); await db.query("update onzio.clubs set kind='customer',lifecycle=$2,public_access=$3 where id=$1", [club, state === "onboarding" ? "onboarding" : "active", state === "onboarding" ? "preview" : "grace"]); await actor(); expect((await save(await request())).page).toEqual(page);
  });
  it("preserves full original hashes, actor isolation and genuine historic receipts through the complete migration", async () => {
    await db.query("reset role"); const historical = readFileSync("supabase/migrations/20261002143000_tryouts_page_atomic_save.sql", "utf8");
    for (const name of ["onzio.load_tryouts_page", "onzio.save_tryouts_page"]) {
      const start = historical.indexOf(`create function ${name}(`), end = historical.indexOf("end $$;", start) + "end $$;".length;
      expect(start).toBeGreaterThan(0); await db.query(historical.slice(start, end).replace("create function", "create or replace function"));
    }
    await design("academy"); const media = await asset(), baseline = await load();
    const original = await request({ page: { ...page, intro_with_tryouts: "  Original intro  " }, events: [...rows(baseline.events), { ...event, hero_media_asset_id: media, sort_order: baseline.events.length }] });
    const receipt = await save(original), before = await fingerprint(); await db.query("reset role");
    const securityQuery = "select proname,proacl,prosecdef,proconfig from pg_proc where oid in ('onzio.load_tryouts_page(uuid,uuid)'::regprocedure,'onzio.save_tryouts_page(uuid,jsonb)'::regprocedure) order by proname";
    const security = (await db.query(securityQuery)).rows; await db.query(readFileSync(migration, "utf8")); expect(await fingerprint()).toEqual(before); expect((await db.query(securityQuery)).rows).toEqual(security);
    await design("clubhouse"); await actor(USER_IDS.adminAal2); expect((await load(original.operationId)).operation).toEqual({ status: "not-committed" });
    await save(await request({ events: rows((await load()).events).map(row => ({ ...row, hero_media_asset_id: null, headline: "Later content" })) })); await denied(original, "TRYOUTS_CHANGED");
    await db.query("reset role"); await db.query("update onzio.media_assets set status='orphaned',deleted_at=now() where id=$1", [media]); await actor();
    const later = await fingerprint(); expect(await save(original)).toEqual(receipt); expect((await load(original.operationId)).operation).toEqual({ status: "committed", receipt }); expect(await fingerprint()).toEqual(later);
    for (const changed of [{ ...original, expectedRevision: "999" }, { ...original, page: { ...original.page, intro_with_tryouts: "Original intro" } }, { ...original, events: original.events.map((row: any) => ({ ...row, headline: "Changed" })) }, { ...original, deletedIds: [randomUUID()] }]) await denied(changed, "OPERATION_REUSED");
    await db.query("reset role"); expect((await db.query("select request_hash=encode(sha256(convert_to($3::jsonb::text,'UTF8')),'hex') as exact from onzio_private.tryouts_page_save_receipts where club_id=$1 and actor_id=$2 and operation_id=$4", [club, USER_IDS.ownerAal2, JSON.stringify(original), original.operationId])).rows).toEqual([{ exact: true }]);
  });
});

it("commits a hidden full aggregate through loopback PostgREST, retries, reads status and denies outsiders", async () => {
  await db.query("rollback"); const id = await newClub();
  const owner = await createFreshLocalClient({ userId: USER_IDS.ownerAal2, email: "owner-aal2@alpha.local" });
  try {
    await db.query("begin"); await design("clubhouse", id); const media = await asset({ owner: id }), linked = await links(id); await db.query("reset role"); await db.query("commit");
    const rpc = async (name: "load_tryouts_page" | "save_tryouts_page", args: Record<string, unknown>) => {
      const result = await owner.client.rpc(name, args as any).abortSignal(AbortSignal.timeout(5000)); expect(result.error).toBeNull(); return result.data as any;
    };
    const initial = await rpc("load_tryouts_page", { p_club_id: id });
    const body = { operationId: randomUUID(), expectedRevision: initial.revision, page, events: [{ ...event, ...linked, hero_media_asset_id: media }], deletedIds: [] };
    const saved = await rpc("save_tryouts_page", { p_club_id: id, p_request: body }); expect(saved).toMatchObject({ page, events: [expect.objectContaining({ ...body.events[0], id: expect.any(String) })] });
    expect(await rpc("load_tryouts_page", { p_club_id: id })).toMatchObject({ revision: saved.revision, page, events: saved.events });
    expect(await rpc("save_tryouts_page", { p_club_id: id, p_request: body })).toEqual(saved);
    expect((await rpc("load_tryouts_page", { p_club_id: id, p_operation_id: body.operationId })).operation).toEqual({ status: "committed", receipt: saved });
    expect((await db.query("select headline,hero_media_asset_id,program_id,registration_form_id from onzio.tryouts where club_id=$1", [id])).rows).toEqual([{ headline: event.headline, hero_media_asset_id: media, ...linked }]);
    const outsider = await createFreshLocalClient({ userId: USER_IDS.unaffiliated, email: "unaffiliated@alpha.local" });
    try {
      await db.query("begin"); const untouched = await fingerprint(id);
      for (const [name, args] of [["save_tryouts_page", { p_club_id: id, p_request: { ...body, operationId: randomUUID() } }], ["load_tryouts_page", { p_club_id: id }], ["load_tryouts_page", { p_club_id: id, p_operation_id: body.operationId }]] as const) {
        const rejected = await outsider.client.rpc(name, args as any).abortSignal(AbortSignal.timeout(5000)); expect(rejected.status).toBe(403); expect(rejected.error).toMatchObject({ code: "42501", message: "NOT_AUTHORIZED" });
      }
      expect(await fingerprint(id)).toEqual(untouched); await db.query("rollback");
    } finally { await outsider.cleanup(); }
  } finally {
    await db.query("rollback"); await db.query("reset role"); await db.query("begin");
    try {
      await db.query("lock table onzio.presentation_documents in access exclusive mode"); await db.query("delete from onzio.presentation_state where club_id=$1", [id]);
      await db.query("alter table onzio.presentation_documents disable trigger presentation_documents_immutable"); await db.query("delete from onzio.presentation_documents where club_id=$1", [id]); await db.query("alter table onzio.presentation_documents enable trigger presentation_documents_immutable");
      for (const table of ["tryouts", "tryouts_page_content", "programs", "registration_forms", "media_assets", "club_members", "audit_events"]) await db.query(`delete from onzio.${table} where club_id=$1`, [id]);
      await db.query("delete from onzio.clubs where id=$1", [id]);
      for (const table of ["onzio.clubs", "onzio.presentation_documents", "onzio_private.tryouts_page_revisions", "onzio_private.tryouts_page_save_receipts"]) expect((await db.query(`select count(*)::int as count from ${table} where ${table === "onzio.clubs" ? "id" : "club_id"}=$1`, [id])).rows).toEqual([{ count: 0 }]);
      await db.query("commit");
    } catch (error) { await db.query("rollback"); throw error; }
    finally { await owner.cleanup(); }
  }
});
