import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ShopSaveRequest, ShopSnapshot } from "@/lib/shop-editor/contract";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { createFreshLocalClient } from "../helpers/mfa";

const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };
const club = CLUB_IDS.alpha;
const migrationPath = "supabase/migrations/20261022193528_shop_content_policy.sql";
const section = { eyebrow: "Maintained", title: "Future kit", description: "Our colors", bullet_points: [] as string[], store_note: "", cta_label: "Order", cta_link: "/shop" };
const purchase = { heading: "Future purchase", cards: [{ label: "Sizes", title: "All sizes", body: "Choose at checkout" }], cta_eyebrow: "", cta_text: "", cta_label: "Buy", cta_link: "https://example.test/store" };
let db: Client;
async function actor(user: string = USER_IDS.ownerAal2, days = 0) {
  await db.query("reset role");
  const second = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second - days * 86400 }] })]);
  await db.query("set local role authenticated");
}
async function design(template: string | null = "academy") {
  await db.query("reset role");
  if (template === null) await db.query("delete from onzio.presentation_state where club_id=$1", [club]);
  else {
    const id = randomUUID();
    await db.query(`insert into onzio.presentation_documents(id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
      values($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,$3,1,$4,$5,$6)`,
    [id, club, template, { schemaVersion: 1, template: { id: template, version: 1 } }, "a".repeat(64), USER_IDS.ownerAal2]);
    await db.query(`insert into onzio.presentation_state(club_id,published_document_id,updated_by) values($1,$2,$3)
      on conflict(club_id) do update set published_document_id=excluded.published_document_id`, [club, id, USER_IDS.ownerAal2]);
  }
  await db.query("update onzio.clubs set store_enabled=false where id=$1", [club]);
  await actor();
}
async function asset(changes: { owner?: string; surface?: string; status?: string; deleted?: boolean; bucket?: string } = {}) {
  await db.query("reset role");
  const id = randomUUID(), owner = changes.owner ?? club;
  await db.query(`insert into onzio.media_assets(id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at,deleted_at)
    values($1,$2,$3,$4,$5,'photograph','image/webp',100,100,100,$6,$7,now(),$8)`,
  [id, owner, changes.bucket ?? "onzio-media", `${owner}/shop/${id}.webp`, changes.surface ?? "shop", "b".repeat(64), changes.status ?? "published", changes.deleted ? new Date() : null]);
  await actor();
  return id;
}
async function load(surface: "shop" | "home" = "shop", id: string = club): Promise<ShopSnapshot> {
  return (await db.query("select onzio.load_shop_page($1,$2) as data", [id, surface])).rows[0].data;
}
async function request(changes: Partial<ShopSaveRequest> = {}): Promise<ShopSaveRequest> {
  const initial = await load(changes.surface ?? "shop");
  return { operationId: randomUUID(), surface: "shop", expectedRevision: initial.revision, designRevision: initial.designRevision, variants: {}, ...changes };
}
async function save(body: unknown, id: string = club): Promise<ShopSnapshot> {
  return (await db.query("select onzio.save_shop_page($1,$2::jsonb) as data", [id, JSON.stringify(body)])).rows[0].data;
}
async function fingerprint(id: string = club) {
  await db.query("savepoint observation");
  try {
    await db.query("reset role");
    return (await db.query(`select
      (select jsonb_agg(to_jsonb(s) order by surface,kit_variant) from onzio.shop_kit_section s where club_id=$1) as sections,
      (select jsonb_agg(to_jsonb(s) order by id) from onzio.shop_kit_photos s where club_id=$1) as photos,
      (select jsonb_agg(to_jsonb(s) order by id) from onzio.shop_carousel_photos s where club_id=$1) as strips,
      (select to_jsonb(s) from onzio.shop_purchase_details s where club_id=$1) as purchase,
      (select jsonb_agg(to_jsonb(s) order by surface) from onzio_private.shop_page_revisions s where club_id=$1) as revisions,
      (select jsonb_agg(to_jsonb(s) order by actor_id,operation_id) from onzio_private.shop_page_receipts s where club_id=$1) as receipts,
      (select jsonb_agg(to_jsonb(s) order by id) from onzio.audit_events s where club_id=$1) as audit,
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
function product(assetId: string) { return { section, photos: [{ rowId: null, assetId, order: 0 }] }; }
beforeEach(async () => {
  assertSafeTestEnvironment();
  db = new Client(config);
  await db.connect();
  await db.query("set statement_timeout='8s'");
  await db.query("begin");
  await design();
});
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("Shop content independent of current display", () => {
  for (const [role, user] of [["owner", USER_IDS.ownerAal2], ["admin", USER_IDS.adminAal2]] as const) {
    it.each([null, "cinematic", "academy", "clubhouse", "editorial"])(`lets ${role} create all Shop variants, strips and purchase with %s assignment (null uses latest document)`, async template => {
      await design(template);
      await db.query("reset role");
      for (const table of ["shop_kit_section", "shop_kit_photos", "shop_carousel_photos", "shop_purchase_details"]) await db.query(`delete from onzio.${table} where club_id=$1`, [club]);
      const photo = await asset(), strip = await asset();
      await actor(user);
      const before = await fingerprint();
      if (template === null) expect((await load()).templateKey).not.toBeNull();
      const variants = { home: product(photo), away: product(photo), third: product(photo) };
      const photoRows = { home: [{ rowId: null, assetId: strip, order: 0 }], away: [{ rowId: null, assetId: strip, order: 0 }], third: [{ rowId: null, assetId: strip, order: 0 }] };
      const result = await save(await request({ variants, photoRows, purchase }));
      expect(result.sections.map(s => s.kit_variant).sort()).toEqual(["away", "home", "third"]);
      expect(result.sections.every(s => s.bullet_points.length === 0)).toBe(true);
      expect(result.photoRows.map(s => s.kit_variant).sort()).toEqual(["away", "home", "third"]);
      expect(result.purchase).toMatchObject(purchase);
      expect(await load()).toMatchObject({ revision: result.revision, sections: result.sections, photos: result.photos, photoRows: result.photoRows, purchase: result.purchase });
      const after = await fingerprint();
      expect(after.presentation).toEqual(before.presentation);
      expect(after.store_enabled).toBe(false);
      expect((await load("home")).photoRows).toEqual([]);
      expect((await load("home")).purchase).toBeNull();
    });
    it.each(["clubhouse", "editorial"])(`lets ${role} create the hidden %s home kit`, async template => {
      await design(template);
      const photo = await asset();
      await actor(user);
      const beforeShop = await load();
      const result = await save(await request({ surface: "home", variants: { home: product(photo) } }));
      expect(result.sections.find(s => s.kit_variant === "home")).toMatchObject(section);
      expect((await load("home")).revision).toBe(result.revision);
      expect(await load()).toEqual(beforeShop);
    });
  }
  it("allows purchase-only creation and empty carousel replacement", async () => {
    await db.query("reset role");
    await db.query("delete from onzio.shop_purchase_details where club_id=$1", [club]);
    await actor();
    expect((await save(await request({ purchase }))).purchase).toMatchObject(purchase);
    const result = await save(await request({ photoRows: { third: [] } }));
    expect(result.photoRows.filter(p => p.kit_variant === "third")).toEqual([]);
  });
  it.each(["away", "third", "photoRows", "purchase"])("preserves home ownership against %s", async kind => {
    await design("clubhouse");
    const photo = await asset();
    const body = await request({ surface: "home", variants: { home: product(photo) } });
    await denied(kind === "photoRows" ? { ...body, photoRows: {} } : kind === "purchase" ? { ...body, purchase }
      : { ...body, variants: { [kind]: product(photo) } }, "SECTION_UNAVAILABLE");
  });
  it.each(["extra envelope", "extra section", "bullet type", "bullet length", "bullet count", "title", "link", "purchase link", "purchase extra", "empty"])("retains strict %s validation without effects", async kind => {
    const photo = await asset();
    const body = await request({ variants: { third: product(photo) }, purchase });
    let changed: unknown = body;
    if (kind === "extra envelope") changed = { ...body, club_id: club };
    if (kind === "extra section") changed = { ...body, variants: { third: { ...product(photo), section: { ...section, forged: true } } } };
    if (["bullet type", "bullet length", "bullet count", "title", "link"].includes(kind)) {
      const invalid = kind === "title" ? { title: "x".repeat(241) } : kind === "link" ? { cta_link: "javascript:alert(1)" }
        : { bullet_points: kind === "bullet type" ? [false] : kind === "bullet length" ? ["x".repeat(81)] : Array(9).fill("valid") };
      changed = { ...body, variants: { third: { ...product(photo), section: { ...section, ...invalid } } } };
    }
    if (kind === "purchase link") changed = { ...body, purchase: { ...purchase, cta_link: "/shop" } };
    if (kind === "purchase extra") changed = { ...body, purchase: { ...purchase, forged: "x" } };
    if (kind === "empty") changed = { ...body, variants: {}, purchase: undefined };
    await denied(changed, "INVALID_SHOP_PAYLOAD");
  });
  it.each([{ owner: CLUB_IDS.bravo }, { surface: "roster" }, { status: "staged" }, { deleted: true }, { bucket: "onzio-upload-staging", status: "staged" }])("rejects unusable hidden media (%#)", async changes => {
    const photo = await asset(changes);
    await denied(await request({ variants: { third: product(photo) }, purchase }), "INVALID_SHOP_PHOTO");
  });
  it.each(["foreign", "surface", "variant", "asset replacement"])("rejects mismatched photo row %s", async kind => {
    const photo = await asset(), row = randomUUID();
    await db.query("reset role");
    await db.query(`insert into onzio.shop_kit_photos(id,club_id,surface,kit_variant,url,sort_order,media_asset_id)
      values($1,$2,$3,$4,'existing.webp',0,$5)`, [row, kind === "foreign" ? CLUB_IDS.bravo : club, kind === "surface" ? "home" : "shop", kind === "variant" ? "away" : "third", kind === "asset replacement" ? photo : null]);
    const replacement = kind === "asset replacement" ? await asset() : photo;
    await actor();
    await denied(await request({ variants: { third: { section, photos: [{ rowId: row, assetId: replacement, order: 0 }] } } }), "INVALID_SHOP_PHOTO");
  });
  it.each(["empty", "maximum", "duplicate asset", "duplicate row", "order", "raw URL"])("rejects invalid hidden photos: %s", async kind => {
    const photo = await asset();
    let photos: Array<Record<string, unknown>> = [{ rowId: null, assetId: photo, order: 0 }];
    let error = "INVALID_SHOP_PHOTO";
    if (kind === "empty") photos = [];
    if (kind === "maximum") photos = Array.from({ length: 7 }, (_, order) => ({ rowId: null, assetId: photo, order }));
    if (kind === "duplicate asset") photos.push({ rowId: null, assetId: photo, order: 1 });
    if (kind === "duplicate row") {
      const result = await save(await request({ variants: { third: product(photo) } }));
      const rowId = result.photos.find(p => p.kit_variant === "third")!.rowId;
      photos = [{ rowId, assetId: photo, order: 0 }, { rowId, assetId: photo, order: 1 }];
    }
    if (kind === "order") photos[0].order = 1;
    if (kind === "raw URL") { photos[0].url = "https://example.test/forged"; error = "INVALID_SHOP_PAYLOAD"; }
    await denied({ ...await request({ purchase }), variants: { third: { section, photos } } }, error);
  });
  it("rolls back all hidden content, revisions, audit and receipt after the final write fails", async () => {
    const photo = await asset();
    await db.query("reset role");
    await db.query(`create function pg_temp.reject_policy_purchase() returns trigger language plpgsql as $$ begin raise exception 'injected purchase failure'; end $$`);
    await db.query("create trigger test_reject_policy_purchase before insert or update on onzio.shop_purchase_details for each row execute function pg_temp.reject_policy_purchase()");
    await actor();
    await denied(await request({ variants: { third: product(photo) }, photoRows: { third: [{ rowId: null, assetId: photo, order: 0 }] }, purchase }), "injected purchase failure");
  });
  it.each([USER_IDS.unaffiliated, USER_IDS.removed])("denies nonmember/removed actor %s", async user => {
    const body = await request({ purchase });
    await actor(user);
    await denied(body, "NOT_AUTHORIZED");
  });
  it("denies expired sessions, foreign tenant and anonymous execution", async () => {
    const body = await request({ purchase });
    await actor(USER_IDS.ownerAal2, 31);
    await denied(body, "NOT_AUTHORIZED");
    await actor();
    await denied(body, "NOT_AUTHORIZED", CLUB_IDS.bravo);
    await db.query("reset role");
    await db.query("set local role anon");
    await denied(body, "permission denied");
  });
  it.each(["archived", "suspended"])("denies fresh writes and exact replay after %s", async state => {
    const body = await request({ purchase });
    await save(body);
    await db.query("reset role");
    if (state === "archived") await db.query("update onzio.clubs set lifecycle='archived',public_access='suspended',archived_at=now() where id=$1", [club]);
    else await db.query("update onzio.clubs set kind='customer',public_access='suspended' where id=$1", [club]);
    await actor();
    await denied(body, "NOT_AUTHORIZED");
    await denied({ ...body, operationId: randomUUID() }, "NOT_AUTHORIZED");
  });
  it.each(["onboarding", "grace"])("maintains valid hidden content during %s", async state => {
    await db.query("reset role");
    await db.query("update onzio.clubs set kind='customer',lifecycle=$2,public_access=$3 where id=$1", [club, state === "onboarding" ? "onboarding" : "active", state === "onboarding" ? "preview" : "grace"]);
    await actor();
    expect((await save(await request({ purchase }))).purchase).toMatchObject(purchase);
  });
  it("retains current authorization before exact receipt replay", async () => {
    const body = await request({ purchase });
    await save(body);
    await actor(USER_IDS.ownerAal2, 31);
    await denied(body, "NOT_AUTHORIZED");
    await db.query("reset role");
    await db.query("update onzio.club_members set status='removed',removed_at=now() where club_id=$1 and user_id=$2", [club, USER_IDS.ownerAal2]);
    await actor();
    await denied(body, "NOT_AUTHORIZED");
    await db.query("savepoint denied_status");
    try { await expect(db.query("select onzio.load_shop_page($1,'shop',$2)", [club, body.operationId])).rejects.toThrow("NOT_AUTHORIZED"); }
    finally { await db.query("rollback to savepoint denied_status"); }
  });
  it("preserves real historical receipts through the entire migration and subsequent content/design changes", async () => {
    await db.query("reset role");
    const historical = readFileSync("supabase/migrations/20261002203000_shop_page_atomic_save.sql", "utf8");
    for (const name of ["onzio_private.validate_shop_section", "onzio.load_shop_page", "onzio.save_shop_page"]) {
      const start = historical.indexOf(`create function ${name}(`);
      const end = historical.indexOf(`grant execute on function ${name}(`, start);
      expect(start).toBeGreaterThan(0);
      expect(end).toBeGreaterThan(start);
      await db.query(historical.slice(start, historical.indexOf(";", end) + 1).replace("create function", "create or replace function"));
    }
    await design("cinematic");
    const photo = await asset();
    const body = await request({ variants: { home: { ...product(photo), section: { ...section, bullet_points: ["Historical"] } } } });
    const receipt = await save(body);
    const before = await fingerprint();
    await db.query("reset role");
    const security = (await db.query(`select proname,proacl,prosecdef,proconfig from pg_proc where oid in ('onzio.load_shop_page(uuid,text,uuid)'::regprocedure,'onzio.save_shop_page(uuid,jsonb)'::regprocedure) order by proname`)).rows;
    await db.query("drop function if exists onzio_private.validate_shop_section(jsonb)");
    await db.query(readFileSync(migrationPath, "utf8"));
    expect(await fingerprint()).toEqual(before);
    expect((await db.query(`select proname,proacl,prosecdef,proconfig from pg_proc where oid in ('onzio.load_shop_page(uuid,text,uuid)'::regprocedure,'onzio.save_shop_page(uuid,jsonb)'::regprocedure) order by proname`)).rows).toEqual(security);
    expect((await db.query(`select to_regprocedure('onzio_private.validate_shop_section(jsonb,boolean)') as obsolete,
      has_function_privilege('anon','onzio_private.validate_shop_section(jsonb)','execute') as anon,
      has_function_privilege('authenticated','onzio_private.validate_shop_section(jsonb)','execute') as authenticated`)).rows[0]).toEqual({ obsolete: null, anon: false, authenticated: true });
    await design("editorial");
    await actor(USER_IDS.adminAal2);
    expect((await db.query("select onzio.load_shop_page($1,'shop',$2) as data", [club, body.operationId])).rows[0].data.operation).toEqual({ status: "not-committed" });
    await save(await request({ purchase }));
    await denied(body, "DESIGN_CHANGED");
    await actor();
    const beforeReplay = await fingerprint();
    expect(await save(body)).toEqual(receipt);
    expect((await db.query("select onzio.load_shop_page($1,'shop',$2) as data", [club, body.operationId])).rows[0].data.operation).toEqual({ status: "committed", receipt });
    expect(await fingerprint()).toEqual(beforeReplay);
    await denied({ ...body, variants: { home: { ...product(photo), section: { ...section, title: "Changed original" } } } }, "OPERATION_REUSED");
    await denied({ ...body, surface: "home" }, "OPERATION_REUSED");
    await denied({ ...body, operationId: randomUUID() }, "DESIGN_CHANGED");
    await denied(await request({ purchase: { ...purchase, heading: "Conflict" }, expectedRevision: body.expectedRevision }), "CONTENT_CHANGED");
  });
});

it("persists hidden third-carousel content via loopback PostgREST and denies foreign membership", async () => {
  await db.query("rollback");
  const id = randomUUID(), media = randomUUID();
  const { client, cleanup } = await createFreshLocalClient({ userId: USER_IDS.ownerAal2, email: "owner-aal2@alpha.local" });
  try {
    await db.query("insert into onzio.clubs(id,slug,name,kind,lifecycle,public_access) values($1,$2,'Shop policy HTTP','test','active','live')", [id, `policy-${id}`]);
    await db.query("insert into onzio.club_members(club_id,user_id,role,status) values($1,$2,'owner','active')", [id, USER_IDS.ownerAal2]);
    await db.query(`insert into onzio.media_assets(id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at)
      values($1,$2,'onzio-media',$3,'shop','photograph','image/webp',100,100,100,$4,'published',now())`,
    [media, id, `${id}/shop/${media}.webp`, "b".repeat(64)]);
    const loaded = await client.rpc("load_shop_page", { p_club_id: id, p_surface: "shop" }).abortSignal(AbortSignal.timeout(5000));
    expect(loaded.error).toBeNull();
    const before = loaded.data as unknown as ShopSnapshot;
    expect(before.templateKey).toBeNull();
    const body: ShopSaveRequest = { operationId: randomUUID(), surface: "shop", expectedRevision: before.revision, designRevision: before.designRevision, variants: {}, photoRows: { third: [{ rowId: null, assetId: media, order: 0 }] }, purchase };
    const saved = await client.rpc("save_shop_page", { p_club_id: id, p_request: body }).abortSignal(AbortSignal.timeout(5000));
    expect(saved.error).toBeNull();
    expect((saved.data as unknown as ShopSnapshot).purchase).toMatchObject(purchase);
    expect((saved.data as unknown as ShopSnapshot).photoRows).toMatchObject([{ kit_variant: "third", assetId: media, order: 0 }]);
    const readback = await client.rpc("load_shop_page", { p_club_id: id, p_surface: "shop" }).abortSignal(AbortSignal.timeout(5000));
    expect(readback.error).toBeNull();
    expect((readback.data as unknown as ShopSnapshot).photoRows).toEqual((saved.data as unknown as ShopSnapshot).photoRows);
    expect((await db.query("select kit_variant,media_asset_id from onzio.shop_carousel_photos where club_id=$1", [id])).rows).toEqual([{ kit_variant: "third", media_asset_id: media }]);
    expect((await db.query("select heading from onzio.shop_purchase_details where club_id=$1", [id])).rows).toEqual([{ heading: purchase.heading }]);
    const foreign = await createFreshLocalClient({ userId: USER_IDS.unaffiliated, email: "unaffiliated@alpha.local" });
    try {
      await db.query("begin");
      const untouched = await fingerprint(id);
      const rejected = await foreign.client.rpc("save_shop_page", { p_club_id: id, p_request: { ...body, operationId: randomUUID() } }).abortSignal(AbortSignal.timeout(5000));
      expect(rejected.error).toMatchObject({ code: "42501", message: "NOT_AUTHORIZED" });
      expect(rejected.status).toBe(403);
      expect(await fingerprint(id)).toEqual(untouched);
      await db.query("rollback");
    } finally { await foreign.cleanup(); }
  } finally {
    await db.query("rollback");
    for (const table of ["shop_carousel_photos", "shop_purchase_details", "media_assets", "club_members", "audit_events"]) await db.query(`delete from onzio.${table} where club_id=$1`, [id]);
    await db.query("delete from onzio.clubs where id=$1", [id]);
    expect((await db.query("select id from onzio.clubs where id=$1", [id])).rows).toEqual([]);
    await cleanup();
  }
});
