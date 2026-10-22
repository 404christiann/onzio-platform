import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { createFreshLocalClient } from "../helpers/mfa";

const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };
const club = CLUB_IDS.alpha;
const migration = "supabase/migrations/20261022200815_about_content_policy.sql";
const destinations = ["/", "/roster", "/schedule", "/club/about", "/club/logo", "/shop", "/sponsors", "/staff", "/standings", "/stats", "/tryouts", "/programs", "/contact"];
const about = { hero_title: "Maintained club", story_paragraphs: ["Our story"], feature_image_url: "", values_heading: "Values", values: [{ title: "Together", description: "Everyone belongs" }], closing_text: "Join us", closing_cta_label: "Learn more", closing_cta_href: "/contact" };
const logo = { annotated_image_url: "", map_image_url: "", features: [{ title: "Badge", description: "Our identity", patch_url: "", icon_url: "", icon_size: 70, icon_scale: 1 }], color_cards: [{ label: "Club color", image_url: "" }] };
let db: Client;
async function actor(user: string = USER_IDS.ownerAal2, ageDays = 0, amr = true) {
  await db.query("reset role");
  const second = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user, role: "authenticated", aal: "aal1", ...(amr ? { amr: [{ method: "otp", timestamp: second - ageDays * 86400 }] } : {}) })]);
  await db.query("set local role authenticated");
}
async function design(template: string | null = "academy", id: string = club) {
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
async function load(page = "about", operationId: string | null = null, id: string = club) {
  return (await db.query("select onzio.load_about_editor($1,$2,$3) as data", [id, page, operationId])).rows[0].data;
}
async function request(page = "about", content: Record<string, unknown> = page === "about" ? about : logo) {
  const initial = await load(page);
  return { operationId: randomUUID(), page, expectedRevision: initial.revision, designRevision: initial.designRevision, content };
}
async function save(body: unknown, id: string = club) {
  return (await db.query("select onzio.save_about_editor($1,$2::jsonb) as data", [id, JSON.stringify(body)])).rows[0].data;
}
async function fingerprint(id: string = club) {
  await db.query("savepoint observation");
  try {
    await db.query("reset role");
    return (await db.query(`select
      (select to_jsonb(s) from onzio.about_page_content s where club_id=$1) as about,
      (select to_jsonb(s) from onzio.club_logo_page_content s where club_id=$1) as logo,
      (select jsonb_agg(to_jsonb(s) order by page) from onzio_private.about_editor_revisions s where club_id=$1) as revisions,
      (select jsonb_agg(to_jsonb(s) order by actor_id,operation_id) from onzio_private.about_editor_receipts s where club_id=$1) as receipts,
      (select jsonb_agg(to_jsonb(s) order by id) from onzio.audit_events s where club_id=$1) as audit,
      (select jsonb_agg(to_jsonb(s) order by id) from onzio.media_assets s where club_id=$1) as media,
      (select to_jsonb(s) from onzio.presentation_state s where club_id=$1) as presentation,
      (select store_enabled from onzio.clubs where id=$1) as store_enabled`, [id])).rows[0];
  } finally { await db.query("rollback to savepoint observation"); }
}
async function denied(body: unknown, error: string, id: string = club) {
  const before = await fingerprint(id);
  await db.query("savepoint expected_failure");
  try { await expect(save(body, id)).rejects.toThrow(error); }
  finally { await db.query("rollback to savepoint expected_failure"); }
  expect(await fingerprint(id)).toEqual(before);
}
async function asset(changes: { owner?: string; surface?: string; status?: string; deleted?: boolean; bucket?: string } = {}) {
  await db.query("reset role");
  const id = randomUUID(), owner = changes.owner ?? club, path = `${owner}/about/${id}.png`;
  await db.query(`insert into onzio.media_assets(id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at,deleted_at,created_by)
    values($1,$2,$3,$4,$5,'graphic','image/png',100,50,50,$6,$7,now(),$8,$9)`,
  [id, owner, changes.bucket ?? "onzio-media", path, changes.surface ?? "about", "b".repeat(64), changes.status ?? "published", changes.deleted ? new Date() : null, USER_IDS.ownerAal2]);
  await actor();
  return { id, path, url: `https://forged.example/storage/v1/object/public/onzio-media/${path}?ignored=1` };
}
beforeEach(async () => {
  assertSafeTestEnvironment(); db = new Client(config); await db.connect();
  await db.query("set statement_timeout='8s'"); await db.query("begin"); await design();
});
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("About and Logo content independent of display", () => {
  for (const [role, user] of [["owner", USER_IDS.ownerAal2], ["admin", USER_IDS.adminAal2]] as const) {
    it.each([null, "cinematic", "heritage", "academy", "clubhouse", "editorial"])(`lets ${role} create absent About and Logo with %s assignment and Store disabled`, async template => {
      await design(template); await db.query("reset role");
      await db.query("delete from onzio.about_page_content where club_id=$1", [club]);
      await db.query("delete from onzio.club_logo_page_content where club_id=$1", [club]);
      await actor(user);
      expect((await load()).content).toBeNull(); expect((await load("logo")).content).toBeNull();
      const before = await fingerprint();
      const aboutResult = await save(await request());
      expect(aboutResult.content).toMatchObject(about);
      const aboutSnapshot = await load();
      const logoResult = await save(await request("logo"));
      expect(logoResult.content).toMatchObject(logo);
      expect(await load()).toEqual(aboutSnapshot);
      expect((await load("logo")).content).toEqual(logoResult.content);
      const after = await fingerprint();
      expect(after.presentation).toEqual(before.presentation); expect(after.store_enabled).toBe(false);
    });
  }
  it.each(destinations)("maintains canonical destination %s while unpublished and unsupported", async href => {
    const result = await save(await request("about", { ...about, closing_cta_href: href }));
    expect(result.content.closing_cta_href).toBe(href);
    expect((await load()).content.closing_cta_href).toBe(href);
  });
  it.each(["", "//evil.example", "https://evil.example", "http://alpha.localhost/schedule", "javascript:alert(1)", "/admin", "/schedule?next=evil", "/schedule#x", "/schedule/", "/Schedule", "/club/../contact", "/%63ontact", " /contact", "/contact ", "/contact\n", "/programs/new", "/\\evil"])("rejects untrusted destination %j without effects", async href => {
    await denied(await request("about", { ...about, closing_cta_href: href }), "INVALID_ABOUT_DESTINATION");
  });
  it.each([null, 1, false, [], {}])("rejects nonstring destination %j", async href => {
    await denied(await request("about", { ...about, closing_cta_href: href }), "INVALID_ABOUT_PAYLOAD");
  });
  it.each(["extra envelope", "missing envelope", "operation type", "operation uuid", "page", "revision", "design", "content", "extra content", "missing content", "story type", "story member", "story length", "story count", "values member", "values extra", "values count", "title", "label", "retired type", "retired member", "retired count"])("retains strict %s validation", async kind => {
    const body: any = await request();
    if (kind === "extra envelope") body.club_id = club;
    if (kind === "missing envelope") delete body.operationId;
    if (kind === "operation type") body.operationId = null;
    if (kind === "operation uuid") body.operationId = "invalid";
    if (kind === "page") body.page = "other";
    if (kind === "revision") body.expectedRevision = "-1";
    if (kind === "design") body.designRevision = "";
    if (kind === "content") body.content = [];
    if (kind === "extra content") body.content = { ...about, unknown: true };
    if (kind === "missing content") { body.content = { ...about }; delete body.content.hero_title; }
    if (kind === "story type") body.content = { ...about, story_paragraphs: {} };
    if (kind === "story member") body.content = { ...about, story_paragraphs: [null] };
    if (kind === "story length") body.content = { ...about, story_paragraphs: ["x".repeat(10001)] };
    if (kind === "story count") body.content = { ...about, story_paragraphs: Array(101).fill("") };
    if (kind === "values member") body.content = { ...about, values: [{ title: "Value", description: null }] };
    if (kind === "values extra") body.content = { ...about, values: [{ ...about.values[0], forged: true }] };
    if (kind === "values count") body.content = { ...about, values: Array(25).fill(about.values[0]) };
    if (kind === "title") body.content = { ...about, hero_title: "x".repeat(501) };
    if (kind === "label") body.content = { ...about, closing_cta_label: "x".repeat(201) };
    if (kind === "retired type") body.retiredMediaUrls = {};
    if (kind === "retired member") body.retiredMediaUrls = [false];
    if (kind === "retired count") body.retiredMediaUrls = Array(101).fill("");
    await denied(body, "INVALID_ABOUT_PAYLOAD");
  });
  it.each(["features type", "features count", "feature missing", "feature extra", "description", "size type", "size low", "size high", "scale low", "scale high", "cards type", "cards count", "card extra", "card missing"])("retains nested Logo %s validation", async kind => {
    const content: any = structuredClone(logo);
    if (kind === "features type") content.features = {};
    if (kind === "features count") content.features = Array(25).fill(logo.features[0]);
    if (kind === "feature missing") delete content.features[0].title;
    if (kind === "feature extra") content.features[0].forged = true;
    if (kind === "description") content.features[0].description = "x".repeat(10001);
    if (kind === "size type") content.features[0].icon_size = "70";
    if (kind === "size low") content.features[0].icon_size = 23;
    if (kind === "size high") content.features[0].icon_size = 141;
    if (kind === "scale low") content.features[0].icon_scale = 0.49;
    if (kind === "scale high") content.features[0].icon_scale = 4.01;
    if (kind === "cards type") content.color_cards = {};
    if (kind === "cards count") content.color_cards = Array(7).fill(logo.color_cards[0]);
    if (kind === "card extra") content.color_cards[0].forged = true;
    if (kind === "card missing") delete content.color_cards[0].image_url;
    await design("cinematic");
    await denied(await request("logo", content), "INVALID_ABOUT_PAYLOAD");
  });
  it.each([{ owner: CLUB_IDS.bravo }, { surface: "roster" }, { status: "staged" }, { deleted: true }, { bucket: "onzio-upload-staging", status: "staged" }])("rejects unusable nested hidden media (%#)", async changes => {
    const image = await asset(changes);
    await denied(await request("logo", { ...logo, features: [{ ...logo.features[0], patch_url: image.url }] }), "INVALID_ABOUT_MEDIA");
  });
  it("hashes original complete input before canonicalizing all nested media, and retains cleanup IDs", async () => {
    const image = await asset();
    const content = { ...logo, annotated_image_url: image.url, map_image_url: image.url, features: [{ ...logo.features[0], patch_url: image.url, icon_url: image.url }], color_cards: [{ label: "Color", image_url: image.url }] };
    const body = { ...await request("logo", content), retiredMediaUrls: [] };
    const receipt = await save(body), canonical = `/storage/v1/object/public/onzio-media/${image.path}`;
    expect(receipt.content).toMatchObject({ annotated_image_url: canonical, map_image_url: canonical, features: [{ patch_url: canonical, icon_url: canonical }], color_cards: [{ image_url: canonical }] });
    await db.query("reset role");
    expect((await db.query("select request_hash=encode(sha256(convert_to($3::jsonb::text,'UTF8')),'hex') as exact from onzio_private.about_editor_receipts where club_id=$1 and operation_id=$2", [club, body.operationId, JSON.stringify(body)])).rows).toEqual([{ exact: true }]);
    await actor();
    expect(await save(body)).toEqual(receipt);
    await denied({ ...body, retiredMediaUrls: [image.url] }, "OPERATION_REUSED");
    await denied({ ...body, content: { ...content, map_image_url: canonical } }, "OPERATION_REUSED");
    const removed = await save(await request("logo"));
    expect(removed.retiredMediaAssetIds).toContain(image.id);
    expect((await load("logo", removed.operationId)).operation.receipt.retiredMediaAssetIds).toContain(image.id);
  });
  it("compares the original About hash before changed destination eligibility", async () => {
    const original = await request();
    const receipt = await save(original);
    const changed = { ...original, content: { ...about, closing_cta_href: "/unregistered" } };
    await denied(changed, "OPERATION_REUSED");
    await denied({ ...changed, operationId: randomUUID(), expectedRevision: receipt.revision }, "INVALID_ABOUT_DESTINATION");
    expect(await save(original)).toEqual(receipt);
  });
  it("retains unchanged legacy image references but rejects newly introduced arbitrary URLs", async () => {
    await db.query("reset role");
    await db.query("insert into onzio.about_page_content(club_id,feature_image_url) values($1,'/images/legacy.png') on conflict(club_id) do update set feature_image_url=excluded.feature_image_url", [club]);
    await actor();
    expect((await save(await request("about", { ...about, feature_image_url: "/images/legacy.png" }))).content.feature_image_url).toBe("/images/legacy.png");
    await denied(await request("about", { ...about, feature_image_url: "https://foreign.test/image.png" }), "INVALID_ABOUT_MEDIA");
  });
  it("rolls back page, revision, audit, media and receipt when receipt insertion fails", async () => {
    await db.query("reset role");
    await db.query("create function pg_temp.reject_about_receipt() returns trigger language plpgsql as $$ begin raise exception 'injected receipt failure'; end $$");
    await db.query("create trigger test_reject_about_receipt before insert on onzio_private.about_editor_receipts for each row execute function pg_temp.reject_about_receipt()");
    await actor();
    await denied(await request("logo"), "injected receipt failure");
  });
  it.each([USER_IDS.unaffiliated, USER_IDS.removed])("denies nonmember or removed actor %s", async user => {
    const body = await request(); await actor(user); await denied(body, "NOT_AUTHORIZED");
  });
  it.each(["expired", "missing AMR", "foreign", "anonymous"])("denies %s access", async kind => {
    const body = await request();
    if (kind === "expired") await actor(USER_IDS.ownerAal2, 31);
    if (kind === "missing AMR") await actor(USER_IDS.ownerAal2, 0, false);
    if (kind === "anonymous") { await db.query("reset role"); await db.query("set local role anon"); }
    await denied(body, kind === "anonymous" ? "permission denied" : "NOT_AUTHORIZED", kind === "foreign" ? CLUB_IDS.bravo : club);
  });
  it.each(["archived", "suspended"])("denies fresh writes and replay after %s", async state => {
    const body = await request(); await save(body); await db.query("reset role");
    if (state === "archived") await db.query("update onzio.clubs set lifecycle='archived',public_access='suspended',archived_at=now() where id=$1", [club]);
    else await db.query("update onzio.clubs set kind='customer',public_access='suspended' where id=$1", [club]);
    await actor(); await denied(body, "NOT_AUTHORIZED"); await denied({ ...body, operationId: randomUUID() }, "NOT_AUTHORIZED");
  });
  it.each(["onboarding", "grace"])("allows hidden maintenance during %s", async state => {
    await db.query("reset role");
    await db.query("update onzio.clubs set kind='customer',lifecycle=$2,public_access=$3 where id=$1", [club, state === "onboarding" ? "onboarding" : "active", state === "onboarding" ? "preview" : "grace"]);
    await actor(); expect((await save(await request("logo"))).content).toMatchObject(logo);
  });
  it("requires current session and membership before replay or status lookup", async () => {
    const body = await request(); await save(body); await actor(USER_IDS.ownerAal2, 31); await denied(body, "NOT_AUTHORIZED");
    await db.query("reset role"); await db.query("update onzio.club_members set status='removed',removed_at=now() where club_id=$1 and user_id=$2", [club, USER_IDS.ownerAal2]);
    await actor(); await denied(body, "NOT_AUTHORIZED");
    await db.query("savepoint status_denial");
    try { await expect(load("about", body.operationId)).rejects.toThrow("NOT_AUTHORIZED"); }
    finally { await db.query("rollback to savepoint status_denial"); }
  });
  it("retains page and design CAS independently of hidden content eligibility", async () => {
    const stale = await request("logo"); await save(await request("logo")); await denied(stale, "ABOUT_CHANGED");
    const designStale = await request("logo"); await design("editorial"); await denied(designStale, "DESIGN_CHANGED");
    expect((await save(await request("logo"))).content).toMatchObject(logo);
  });
  it("preserves an authentic old receipt through the whole migration and later design and content changes", async () => {
    await db.query("reset role");
    const historical = readFileSync("supabase/migrations/20261005160543_about_page_editor_receipts.sql", "utf8");
    for (const name of ["onzio_private.about_editor_destination", "onzio.load_about_editor", "onzio.save_about_editor"]) {
      const start = historical.indexOf(`create function ${name}(`), end = historical.indexOf("end $$;", start) + "end $$;".length;
      expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
      await db.query(historical.slice(start, end).replace("create function", "create or replace function"));
    }
    await db.query("revoke all on function onzio_private.about_editor_destination(uuid,text) from public,anon");
    await db.query("grant execute on function onzio_private.about_editor_destination(uuid,text) to authenticated");
    await design("cinematic");
    const image = await asset();
    const original = { ...await request("logo", { ...logo, map_image_url: image.url }), retiredMediaUrls: [] };
    const receipt = await save(original), before = await fingerprint();
    await db.query("reset role");
    const securityQuery = "select proname,proacl,prosecdef,proconfig from pg_proc where oid in ('onzio.load_about_editor(uuid,text,uuid)'::regprocedure,'onzio.save_about_editor(uuid,jsonb)'::regprocedure) order by proname";
    const security = (await db.query(securityQuery)).rows;
    await db.query("drop function if exists onzio_private.about_editor_destination(text)");
    await db.query(readFileSync(migration, "utf8"));
    expect(await fingerprint()).toEqual(before);
    expect((await db.query(securityQuery)).rows).toEqual(security);
    expect((await db.query("select to_regprocedure('onzio_private.about_editor_destination(uuid,text)') as obsolete, has_function_privilege('anon','onzio_private.about_editor_destination(text)','execute') as anon, has_function_privilege('authenticated','onzio_private.about_editor_destination(text)','execute') as authenticated")).rows[0]).toEqual({ obsolete: null, anon: false, authenticated: true });
    await design("academy"); await actor(USER_IDS.adminAal2);
    expect((await load("logo", original.operationId)).operation).toEqual({ status: "not-committed" });
    await save(await request("logo")); await denied(original, "ABOUT_CHANGED");
    await actor(); const beforeReplay = await fingerprint();
    expect(await save(original)).toEqual(receipt);
    expect((await load("logo", original.operationId)).operation).toEqual({ status: "committed", receipt });
    expect(await fingerprint()).toEqual(beforeReplay);
    await denied({ ...original, retiredMediaUrls: [image.url] }, "OPERATION_REUSED");
    await denied({ ...original, content: { ...original.content, map_image_url: `/storage/v1/object/public/onzio-media/${image.path}` } }, "OPERATION_REUSED");
    await denied({ ...original, page: "about", content: about }, "OPERATION_REUSED");
    await db.query("reset role");
    expect((await db.query("select request_hash=encode(sha256(convert_to($3::jsonb::text,'UTF8')),'hex') as exact from onzio_private.about_editor_receipts where club_id=$1 and actor_id=$2 and operation_id=$4", [club, USER_IDS.ownerAal2, JSON.stringify(original), original.operationId])).rows).toEqual([{ exact: true }]);
  });
});

it("commits nonempty hidden Logo and About destination through loopback PostgREST and denies an outsider", async () => {
  await db.query("rollback");
  const id = randomUUID(), media = randomUUID(), path = `${id}/about/${media}.png`;
  const owner = await createFreshLocalClient({ userId: USER_IDS.ownerAal2, email: "owner-aal2@alpha.local" });
  try {
    await db.query("insert into onzio.clubs(id,slug,name,kind,lifecycle,public_access) values($1,$2,'About policy HTTP','test','active','live')", [id, `about-policy-${id}`]);
    await db.query("insert into onzio.club_members(club_id,user_id,role,status) values($1,$2,'owner','active')", [id, USER_IDS.ownerAal2]);
    await db.query(`insert into onzio.media_assets(id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at)
      values($1,$2,'onzio-media',$3,'about','graphic','image/png',100,50,50,$4,'published',now())`, [media, id, path, "b".repeat(64)]);
    await db.query("begin"); await design("academy", id); await db.query("reset role"); await db.query("commit");
    const rpc = async (name: "load_about_editor" | "save_about_editor", args: Record<string, unknown>) => {
      const result = await owner.client.rpc(name, args as any).abortSignal(AbortSignal.timeout(5000));
      expect(result.error).toBeNull(); return result.data as any;
    };
    for (const page of ["logo", "about"]) {
      const initial = await rpc("load_about_editor", { p_club_id: id, p_page: page });
      const content = page === "logo" ? { ...logo, map_image_url: `https://forged.test/storage/v1/object/public/onzio-media/${path}`, features: [{ ...logo.features[0], patch_url: `https://forged.test/storage/v1/object/public/onzio-media/${path}` }] } : about;
      const body = { operationId: randomUUID(), page, expectedRevision: initial.revision, designRevision: initial.designRevision, content };
      const saved = await rpc("save_about_editor", { p_club_id: id, p_request: body });
      const readback = await rpc("load_about_editor", { p_club_id: id, p_page: page });
      expect(readback.content).toEqual(saved.content);
      expect(await rpc("save_about_editor", { p_club_id: id, p_request: body })).toEqual(saved);
      expect((await rpc("load_about_editor", { p_club_id: id, p_page: page, p_operation_id: body.operationId })).operation).toEqual({ status: "committed", receipt: saved });
      if (page === "logo") expect(saved.content).toMatchObject({ map_image_url: `/storage/v1/object/public/onzio-media/${path}`, features: [{ title: "Badge", patch_url: `/storage/v1/object/public/onzio-media/${path}` }], color_cards: logo.color_cards });
      else expect(saved.content.closing_cta_href).toBe("/contact");
    }
    expect((await db.query("select closing_cta_href from onzio.about_page_content where club_id=$1", [id])).rows).toEqual([{ closing_cta_href: "/contact" }]);
    expect((await db.query("select map_image_url from onzio.club_logo_page_content where club_id=$1", [id])).rows).toEqual([{ map_image_url: `/storage/v1/object/public/onzio-media/${path}` }]);
    const outsider = await createFreshLocalClient({ userId: USER_IDS.unaffiliated, email: "unaffiliated@alpha.local" });
    try {
      await db.query("begin"); const untouched = await fingerprint(id);
      const rejected = await outsider.client.rpc("save_about_editor", { p_club_id: id, p_request: { operationId: randomUUID(), page: "about", expectedRevision: "0", designRevision: "unused", content: about } }).abortSignal(AbortSignal.timeout(5000));
      expect(rejected.status).toBe(403); expect(rejected.error).toMatchObject({ code: "42501", message: "NOT_AUTHORIZED" });
      expect(await fingerprint(id)).toEqual(untouched); await db.query("rollback");
    } finally { await outsider.cleanup(); }
  } finally {
    await db.query("rollback"); await db.query("reset role");
    await db.query("begin");
    try {
      await db.query("lock table onzio.presentation_documents in access exclusive mode");
      await db.query("delete from onzio.presentation_state where club_id=$1", [id]);
      await db.query("alter table onzio.presentation_documents disable trigger presentation_documents_immutable");
      await db.query("delete from onzio.presentation_documents where club_id=$1", [id]);
      await db.query("alter table onzio.presentation_documents enable trigger presentation_documents_immutable");
      for (const table of ["about_page_content", "club_logo_page_content", "media_assets", "club_members", "audit_events"]) await db.query(`delete from onzio.${table} where club_id=$1`, [id]);
      await db.query("delete from onzio.clubs where id=$1", [id]);
      for (const schemaTable of ["onzio.clubs", "onzio.presentation_documents", "onzio_private.about_editor_revisions", "onzio_private.about_editor_receipts"]) expect((await db.query(`select count(*)::int as count from ${schemaTable} where ${schemaTable === "onzio.clubs" ? "id" : "club_id"}=$1`, [id])).rows).toEqual([{ count: 0 }]);
      await db.query("commit");
    } catch (error) { await db.query("rollback"); throw error; }
    finally { await owner.cleanup(); }
  }
});
