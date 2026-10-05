import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";

let db: Client;
const clubId = CLUB_IDS.alpha;

async function actor() {
  await db.query("reset role");
  const second = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({
    sub: USER_IDS.ownerAal2, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second }],
  })]);
  await db.query("set local role authenticated");
}

async function design(template: string) {
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

async function asset(owner: string = clubId) {
  const id = randomUUID();
  await db.query("reset role");
  await db.query(`insert into onzio.media_assets
    (id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at)
    values($1,$2,'onzio-media',$3,'shop','photograph','image/webp',100,100,100,$4,'published',now())`,
  [id, owner, `${owner}/shop/${id}.webp`, "b".repeat(64)]);
  await actor();
  return id;
}

async function load(surface: "home" | "shop" = "shop") {
  return (await db.query("select onzio.load_shop_page($1,$2) as data", [clubId, surface])).rows[0].data;
}

async function save(request: unknown) {
  return (await db.query("select onzio.save_shop_page($1,$2::jsonb) as data", [clubId, JSON.stringify(request)])).rows[0].data;
}

async function rejects(action: () => Promise<unknown>, message: string) {
  await db.query("savepoint expected_failure");
  try { await expect(action()).rejects.toThrow(message); }
  finally { await db.query("rollback to savepoint expected_failure"); }
}

const section = {
  eyebrow: "Club kit", title: "New home kit", description: "Official colors",
  bullet_points: ["Adult and youth"], store_note: "Club store", cta_label: "Order now", cta_link: "https://example.com/shop",
};
const purchase = {
  heading: "Purchase details", cards: [{ label: "Sizing", title: "Adult and youth", body: "Choose at checkout." }],
  cta_eyebrow: "Ready", cta_text: "Order online", cta_label: "Visit store", cta_link: "https://example.com/shop",
};

beforeEach(async () => {
  assertSafeTestEnvironment();
  db = new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
  await db.connect();
  await db.query("begin");
  await design("cinematic");
});
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("atomic Shop page database contract", () => {
  it("commits kit, ordered media, photo row and purchase details under one page revision", async () => {
    const kitAsset = await asset();
    const rowAsset = await asset();
    const before = await load();
    const request = {
      operationId: randomUUID(), surface: "shop", expectedRevision: before.revision, designRevision: before.designRevision,
      variants: { home: { section, photos: [{ rowId: null, assetId: kitAsset, order: 0 }] } },
      photoRows: { home: [{ rowId: null, assetId: rowAsset, order: 0 }] }, purchase,
    };
    const result = await save(request);
    const after = await load();
    expect(after.sections.find((item: { kit_variant: string }) => item.kit_variant === "home").title).toBe("New home kit");
    expect(after.photos.find((item: { kit_variant: string }) => item.kit_variant === "home").assetId).toBe(kitAsset);
    expect(after.photoRows.find((item: { kit_variant: string }) => item.kit_variant === "home").assetId).toBe(rowAsset);
    expect(after.purchase.heading).toBe("Purchase details");
    expect(result.revision).toBe(after.revision);
    expect(result.revision).not.toBe(before.revision);
    expect(await save(request)).toEqual(result);
    expect((await load("home")).revision).toBe("0");
  });

  it("rolls back all Shop changes and receipt when the last write fails", async () => {
    const kitAsset = await asset();
    await db.query("reset role");
    await db.query(`create function pg_temp.reject_shop_purchase() returns trigger language plpgsql as
      $$ begin raise exception 'injected purchase failure'; end $$`);
    await db.query("create trigger test_reject_shop_purchase before insert or update on onzio.shop_purchase_details for each row execute function pg_temp.reject_shop_purchase()");
    await actor();
    const before = await load();
    const operationId = randomUUID();
    await rejects(() => save({
      operationId, surface: "shop", expectedRevision: before.revision, designRevision: before.designRevision,
      variants: { home: { section, photos: [{ rowId: null, assetId: kitAsset, order: 0 }] } }, purchase,
    }), "injected purchase failure");
    expect(await load()).toEqual(before);
    await db.query("reset role");
    expect((await db.query("select count(*)::int as n from onzio_private.shop_page_receipts where operation_id=$1", [operationId])).rows[0].n).toBe(0);
  });

  it("rejects a stale page revision and hidden template sections", async () => {
    const kitAsset = await asset();
    const before = await load();
    const request = {
      operationId: randomUUID(), surface: "shop", expectedRevision: before.revision, designRevision: before.designRevision,
      variants: { home: { section, photos: [{ rowId: null, assetId: kitAsset, order: 0 }] } },
    };
    await save(request);
    await rejects(() => save({ ...request, operationId: randomUUID() }), "CONTENT_CHANGED");
    await design("academy");
    const academy = await load();
    await rejects(() => save({
      ...request, operationId: randomUUID(), expectedRevision: academy.revision, designRevision: academy.designRevision, purchase,
    }), "SECTION_UNAVAILABLE");
  });

  it("rejects unowned media even through a direct authenticated RPC", async () => {
    const foreignAsset = await asset(CLUB_IDS.bravo);
    const before = await load();
    await rejects(() => save({
      operationId: randomUUID(), surface: "shop", expectedRevision: before.revision, designRevision: before.designRevision,
      variants: { home: { section, photos: [{ rowId: null, assetId: foreignAsset, order: 0 }] } },
    }), "INVALID_SHOP_PHOTO");
    expect(await load()).toEqual(before);
  });

  it("rejects both loading and saving an Editorial Store after its public page is disabled", async () => {
    await design("editorial");
    await db.query("reset role");
    await db.query("update onzio.clubs set store_enabled=true where id=$1", [clubId]);
    await actor();
    const before = await load();
    const kitAsset = await asset();
    await db.query("reset role");
    await db.query("update onzio.clubs set store_enabled=false where id=$1", [clubId]);
    await actor();
    await rejects(() => load(), "PAGE_UNAVAILABLE");
    await rejects(() => save({
      operationId: randomUUID(), surface: "shop", expectedRevision: before.revision, designRevision: before.designRevision,
      variants: { home: { section, photos: [{ rowId: null, assetId: kitAsset, order: 0 }] } },
    }), "PAGE_UNAVAILABLE");
  });

  it("recovers committed Shop receipts and exact retries after Editorial Store is disabled", async () => {
    await design("editorial");
    await db.query("reset role");
    await db.query("update onzio.clubs set store_enabled=true where id=$1", [clubId]);
    await actor();
    const photo = await asset(), before = await load();
    const payload = { operationId: randomUUID(), surface: "shop", expectedRevision: before.revision, designRevision: before.designRevision,
      variants: { home: { section, photos: [{ rowId: null, assetId: photo, order: 0 }] } } };
    const receipt = await save(payload);
    await db.query("reset role");
    await db.query("update onzio.clubs set store_enabled=false where id=$1", [clubId]);
    await actor();
    const recovered = (await db.query("select onzio.load_shop_page($1,'shop',$2) as data", [clubId, payload.operationId])).rows[0].data;
    expect(recovered.operation).toEqual({ status: "committed", receipt });
    expect(await save(payload)).toEqual(receipt);
    await rejects(() => load(), "PAGE_UNAVAILABLE");
    await rejects(() => save({ ...payload, operationId: randomUUID() }), "PAGE_UNAVAILABLE");
    await rejects(() => save({ ...payload, variants: { home: { section: { ...section, title: "Different" }, photos: [{ rowId: null, assetId: photo, order: 0 }] } } }), "OPERATION_REUSED");
    await db.query("reset role");
    await db.query("update onzio.clubs set lifecycle='archived',public_access='suspended' where id=$1", [clubId]);
    await actor();
    await rejects(() => db.query("select onzio.load_shop_page($1,'shop',$2)", [clubId, payload.operationId]), "NOT_AUTHORIZED");
    await rejects(() => save(payload), "NOT_AUTHORIZED");
  });

  it("recovers a Homepage Shop save after its section disappears while blocking fresh reads and writes", async () => {
    const photo = await asset(), before = await load("home");
    const payload = { operationId: randomUUID(), surface: "home", expectedRevision: before.revision, designRevision: before.designRevision,
      variants: { home: { section, photos: [{ rowId: null, assetId: photo, order: 0 }] } } };
    const receipt = await save(payload);
    await design("clubhouse");
    expect((await db.query("select onzio.load_shop_page($1,'home',$2) as data", [clubId, payload.operationId])).rows[0].data.operation.receipt).toEqual(receipt);
    expect(await save(payload)).toEqual(receipt);
    await rejects(() => load("home"), "PAGE_UNAVAILABLE");
    await rejects(() => save({ ...payload, operationId: randomUUID() }), "PAGE_UNAVAILABLE");
  });

  it("rejects malformed revision and design tokens without changing content or creating receipts", async () => {
    const photo = await asset(), before = await load();
    const payload = { operationId: randomUUID(), surface: "shop", expectedRevision: before.revision, designRevision: before.designRevision,
      variants: { home: { section, photos: [{ rowId: null, assetId: photo, order: 0 }] } } };
    for (const key of ["expectedRevision", "designRevision"]) {
      for (const value of [null, false, 0, {}, [], ""]) {
        await rejects(() => save({ ...payload, [key]: value }), "INVALID_SHOP_PAYLOAD");
        expect(await load()).toEqual(before);
      }
    }
    await db.query("reset role");
    expect((await db.query("select count(*)::int as n from onzio_private.shop_page_receipts where operation_id=$1", [payload.operationId])).rows[0].n).toBe(0);
  });

});
