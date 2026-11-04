import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { localPostgresConfig } from "../helpers/local-postgres";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { EMPTY_CINEMATIC_SHOP_CONTENT } from "@/lib/cinematic-shop-content";

let db: Client;
const clubId = CLUB_IDS.alpha;
async function actor() {
  await db.query("reset role");
  const second = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: USER_IDS.ownerAal2, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second }] })]);
  await db.query("set local role authenticated");
}
async function design(version = 2) {
  await db.query("reset role");
  const id = randomUUID();
  await db.query(`insert into onzio.presentation_documents(id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
    values($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,'cinematic',$3,$4,$5,$6)`,
  [id, clubId, version, JSON.stringify({ schemaVersion: 1, template: { id: "cinematic", version } }), "a".repeat(64), USER_IDS.ownerAal2]);
  await db.query("insert into onzio.presentation_state(club_id,published_document_id,updated_by) values($1,$2,$3) on conflict(club_id) do update set published_document_id=$2", [clubId, id, USER_IDS.ownerAal2]);
  await actor();
}
async function asset(owner: string = clubId, kind = "graphic", status = "published") {
  await db.query("reset role");
  const id = randomUUID();
  await db.query(`insert into onzio.media_assets(id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at,deleted_at)
    values($1,$2,'onzio-media',$3,'shop',$4,'image/png',100,1200,800,$5,$6,now(),case when $6='orphaned' then now() else null end)`,
  [id, owner, `${owner}/shop/${id}.png`, kind, "b".repeat(64), status]);
  await actor(); return id;
}
async function load(surface = "shop") { return (await db.query("select onzio.load_shop_page($1,$2) as data", [clubId, surface])).rows[0].data; }
async function request(presentation = { ...EMPTY_CINEMATIC_SHOP_CONTENT }, surface = "shop") {
  const current = await load(surface);
  return { operationId: randomUUID(), surface, expectedRevision: current.revision, designRevision: current.designRevision, variants: {}, presentation };
}
async function save(payload: unknown) { return (await db.query("select onzio.save_shop_page($1,$2::jsonb) as data", [clubId, JSON.stringify(payload)])).rows[0].data; }
async function rejects(action: () => Promise<unknown>, message: string) {
  await db.query("savepoint expected_failure");
  try { await expect(action()).rejects.toThrow(message); } finally { await db.query("rollback to savepoint expected_failure"); }
}
beforeEach(async () => { assertSafeTestEnvironment(); db = new Client(localPostgresConfig()); await db.connect(); await db.query("begin"); await design(); });
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("cinematic Shop joins the existing atomic page contract", () => {
  it("saves authored settings/map under one Shop revision and preserves the homepage", async () => {
    const map = await asset(), homeBefore = await load("home"), before = await load();
    const payload = await request({ ...EMPTY_CINEMATIC_SHOP_CONTENT, mapAssetId: map, mapVisible: true, mapAlt: "Directions", sponsorsHeading: "Our partners", sponsorsVisible: true });
    const saved = await save(payload), after = await load();
    expect(after.presentation.mapAssetId).toBe(map);
    expect(after.presentation.sponsorsHeading).toBe("Our partners");
    expect(after.media.find((item: { id: string }) => item.id === map)).toMatchObject({ width: 1200, height: 800 });
    expect(after.revision).not.toBe(before.revision);
    expect(saved.revision).toBe(after.revision);
    expect(await load("home")).toEqual(homeBefore);
    expect(await save(payload)).toEqual(saved);
  });

  it("recovers the exact map/settings receipt after the design changes", async () => {
    const payload = await request({ ...EMPTY_CINEMATIC_SHOP_CONTENT, homeLabel: "Local" });
    const saved = await save(payload);
    await design(1);
    expect(await save(payload)).toEqual(saved);
    const recovered = (await db.query("select onzio.load_shop_page($1,'shop',$2) as data", [clubId, payload.operationId])).rows[0].data;
    expect(recovered.operation).toEqual({ status: "committed", receipt: saved });
    await rejects(() => save({ ...payload, presentation: { ...payload.presentation, homeLabel: "Different" } }), "OPERATION_REUSED");
  });

  it("rolls back kit, details, settings, revisions and receipts if the map write fails last", async () => {
    const image = await asset(), before = await load();
    await db.query("reset role");
    await db.query("create function pg_temp.reject_map() returns trigger language plpgsql as $$ begin raise exception 'injected map write failure'; end $$");
    await db.query("create trigger test_reject_shop_map before insert or update on onzio.cinematic_shop_content for each row execute function pg_temp.reject_map()");
    await actor();
    const payload = { ...await request(), variants: { home: { section: { eyebrow: "My kit", title: "My title", description: "My description", bullet_points: ["My bullet"], store_note: "My shop", cta_label: "Order", cta_link: "https://example.com" }, photos: [{ rowId: null, assetId: image, order: 0 }] } }, purchase: { heading: "My details", cards: [], cta_eyebrow: "", cta_text: "", cta_label: "", cta_link: "" } };
    await rejects(() => save(payload), "injected map write failure");
    expect(await load()).toEqual(before);
    await db.query("reset role");
    expect((await db.query("select count(*)::int as n from onzio_private.shop_page_receipts where operation_id=$1", [payload.operationId])).rows[0].n).toBe(0);
  });

  it("rejects map fields on Homepage/legacy and a stale revision from a direct map writer", async () => {
    await rejects(async () => save(await request({ ...EMPTY_CINEMATIC_SHOP_CONTENT }, "home")), "SECTION_UNAVAILABLE");
    await design(1);
    await rejects(async () => save(await request()), "SECTION_UNAVAILABLE");
    await design();
    await save(await request());
    const stale = await request();
    await db.query("update onzio.cinematic_shop_content set content=jsonb_set(content,'{sponsorsHeading}','\"Legacy writer\"'::jsonb) where club_id=$1", [clubId]);
    await rejects(() => save(stale), "CONTENT_CHANGED");
  });

  it("rejects foreign, retired and photograph map identities without writes", async () => {
    const ids = [await asset(CLUB_IDS.bravo), await asset(clubId, "graphic", "orphaned"), await asset(clubId, "photograph")];
    const before = await load();
    for (const id of ids) await rejects(async () => save(await request({ ...EMPTY_CINEMATIC_SHOP_CONTENT, mapAssetId: id })), "INVALID_SHOP_PHOTO");
    expect(await load()).toEqual(before);
  });

  it("rejects malformed direct RPC settings and client-provided map URLs", async () => {
    const before = await load();
    for (const change of [{ leadScale: 101 }, { mapVisible: "true" }, { sponsorsHeading: {} }, { mapCrop: { x: 95, y: 0, width: 20, height: 100 } }, { mapCrop: { x: 0, y: 0, width: 0, height: 100 } }]) {
      const payload = await request({ ...EMPTY_CINEMATIC_SHOP_CONTENT, ...change } as typeof EMPTY_CINEMATIC_SHOP_CONTENT);
      await rejects(() => save(payload), "INVALID_SHOP_PRESENTATION");
    }
    await rejects(async () => save(await request({ ...EMPTY_CINEMATIC_SHOP_CONTENT, mapUrl: "https://foreign.example" } as typeof EMPTY_CINEMATIC_SHOP_CONTENT)), "INVALID_SHOP_PAYLOAD");
    expect(await load()).toEqual(before);
  });

  it("uses RLS and a tenant FK even for direct authorized table writers", async () => {
    const map = await asset(CLUB_IDS.bravo);
    await rejects(() => db.query("insert into onzio.cinematic_shop_content(club_id,content,map_media_asset_id) values($1,$2::jsonb,$3)", [clubId, JSON.stringify(EMPTY_CINEMATIC_SHOP_CONTENT), map]), "MEDIA_NOT_PUBLISHED");
    await rejects(() => db.query("select onzio.save_shop_page($1,$2::jsonb)", [CLUB_IDS.bravo, JSON.stringify({ operationId: randomUUID(), surface: "shop", expectedRevision: "0", designRevision: "x", variants: {}, presentation: EMPTY_CINEMATIC_SHOP_CONTENT })]), "NOT_AUTHORIZED");
  });

  it("protects referenced maps from retirement and releases them after confirmed removal", async () => {
    const map = await asset();
    await save(await request({ ...EMPTY_CINEMATIC_SHOP_CONTENT, mapAssetId: map }));
    await db.query("reset role"); await db.query("set local role service_role");
    expect((await db.query("select onzio.retire_unreferenced_media_asset($1,$2,$3) as data", [clubId, map, USER_IDS.ownerAal2])).rows[0].data.status).toBe("referenced");
    await actor();
    const saved = await save(await request());
    expect(saved.retiredMediaAssetIds).toContain(map);
    await db.query("reset role"); await db.query("set local role service_role");
    expect((await db.query("select onzio.retire_unreferenced_media_asset($1,$2,$3) as data", [clubId, map, USER_IDS.ownerAal2])).rows[0].data.status).toBe("retired");
  });
});
