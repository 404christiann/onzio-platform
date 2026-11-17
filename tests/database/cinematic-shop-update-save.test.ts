import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { localPostgresConfig } from "../helpers/local-postgres";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { EMPTY_CINEMATIC_SHOP_CONTENT, type CinematicShopContent } from "@/lib/cinematic-shop-content";

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
async function asset(owner: string = clubId, kind = "photograph", status = "published", surface = "shop") {
  await db.query("reset role");
  const id = randomUUID();
  await db.query(`insert into onzio.media_assets(id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at,deleted_at)
    values($1,$2,'onzio-media',$3,$7,$4,'image/png',100,1200,1150,$5,$6,now(),case when $6='orphaned' then now() else null end)`,
  [id, owner, `${owner}/${surface}/${id}.png`, kind, "b".repeat(64), status, surface]);
  await actor(); return id;
}
async function load() { return (await db.query("select onzio.load_shop_page($1,'shop') as data", [clubId])).rows[0].data; }
async function request(presentation: unknown) {
  const current = await load();
  return { operationId: randomUUID(), surface: "shop", expectedRevision: current.revision, designRevision: current.designRevision, variants: {}, presentation };
}
async function save(presentation: unknown) { return (await db.query("select onzio.save_shop_page($1,$2::jsonb) as data", [clubId, JSON.stringify(await request(presentation))])).rows[0].data; }
async function saveKit(surface: "home" | "shop", body: Record<string, unknown>) {
  const current = (await db.query("select onzio.load_shop_page($1,$2) as data", [clubId, surface])).rows[0].data;
  const payload = { operationId: randomUUID(), surface, expectedRevision: current.revision, designRevision: current.designRevision, variants: {}, ...body };
  return (await db.query("select onzio.save_shop_page($1,$2::jsonb) as data", [clubId, JSON.stringify(payload)])).rows[0].data;
}
const thirdKit = (title: string, assetId: string) => ({
  section: { eyebrow: "Foothill Transit 2027", title, description: "Foothill Transit Edition", bullet_points: ["Foothill crest"], store_note: "", cta_label: "Buy now", cta_link: "https://example.com/third" },
  photos: [{ rowId: null, assetId, order: 0 }],
});
async function rejects(action: () => Promise<unknown>, message: string) {
  await db.query("savepoint expected_failure");
  try { await expect(action()).rejects.toThrow(message); } finally { await db.query("rollback to savepoint expected_failure"); }
}
async function retire(id: string) {
  await db.query("reset role"); await db.query("set local role service_role");
  const status = (await db.query("select onzio.retire_unreferenced_media_asset($1,$2,$3) as data", [clubId, id, USER_IDS.ownerAal2])).rows[0].data.status;
  await actor(); return status;
}
const detail = (title: string, assetId: string | null = null) => ({ assetId, alt: assetId ? `${title} close-up` : "", title, body: `${title} body` });
function sam(details = [detail("Player edition"), detail("3D crest")]): CinematicShopContent {
  return {
    ...EMPTY_CINEMATIC_SHOP_CONTENT,
    editions: [{ label: "Authentic jersey", price: "$115", line: "Authentic RCFC Jersey", link: "https://example.com/authentic" }, { label: "Replica jersey", price: "$95", line: "Replica RCFC Jersey", link: "" }],
    detailsHeading: "Jersey details", details,
    cardIcons: ["video", "jersey", "shipping-box", "no-access"],
    attributes: ["Color: Rose Parade Red", "100% Polyester"],
    sizeChart: { heading: "Size chart", columns: ["S", "M"], rows: [{ label: "Chest (in)", values: ["35 - 37.5", "37.5 - 41"] }], note: "In inches" },
    mapHeading: "Map view",
  };
}
beforeEach(async () => { assertSafeTestEnvironment(); db = new Client(localPostgresConfig()); await db.connect(); await db.query("begin"); await design(); });
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("RC2027 Shop update joins the atomic Shop save", () => {
  it("saves prices, tiles, icons, care line, size chart and detail photos together", async () => {
    const first = await asset(), third = await asset(), before = await load();
    const content = sam([detail("Player edition", first), detail("3D crest"), detail("Bespoke numbers", third)]);
    const saved = await save(content), after = await load();
    expect(after.presentation).toEqual({ ...content, mapAssetId: null });
    expect(after.media.map((item: { id: string }) => item.id).sort()).toEqual([first, third].sort());
    expect(after.revision).not.toBe(before.revision);
    expect(saved.revision).toBe(after.revision);
  });

  it("saves three jersey options and the heading over them", async () => {
    const content = { ...sam(), editions: [...sam().editions, { label: "Foothill Transit Edition jersey", price: "$115", line: "Foothill Transit Edition RCFC Jersey", link: "" }], editionsHeading: "Select your jersey" };
    await save(content);
    expect((await load()).presentation).toEqual({ ...content, mapAssetId: null });
  });

  it("saves the Third kit and its photo row on the cinematic@2 Shop page only", async () => {
    const lead = await asset(), row = await asset(), other = await asset();
    await saveKit("shop", { variants: { third: thirdKit("Going Good Places", lead) }, photoRows: { third: [{ rowId: null, assetId: row, order: 0 }] } });
    const after = await load();
    type Item = { kit_variant: string; assetId?: string; title?: string };
    expect(after.sections.find((item: Item) => item.kit_variant === "third")?.title).toBe("Going Good Places");
    expect(after.photos.filter((item: Item) => item.kit_variant === "third").map((item: Item) => item.assetId)).toEqual([lead]);
    expect(after.photoRows.filter((item: Item) => item.kit_variant === "third").map((item: Item) => item.assetId)).toEqual([row]);
    await rejects(() => saveKit("home", { variants: { third: thirdKit("Homepage third", other) } }), "SECTION_UNAVAILABLE");
    await design(1);
    await rejects(() => saveKit("shop", { variants: { third: thirdKit("Older design", other) } }), "SECTION_UNAVAILABLE");
    await rejects(() => saveKit("shop", { photoRows: { third: [{ rowId: null, assetId: other, order: 0 }] } }), "SECTION_UNAVAILABLE");
  });

  it("still loads and saves Shop settings written before the update", async () => {
    const legacy = { mapAssetId: null, mapAlt: "", mapVisible: true, mapCrop: null, sponsorsHeading: "Partners", sponsorsVisible: true, homeLabel: "Home", awayLabel: "Away", galleryLabel: "Kit photos", emptyMessage: "Soon", leadScale: 80, leadTop: 5 };
    await save(legacy);
    expect((await load()).presentation).toEqual(legacy);
    await save({ ...legacy, sponsorsHeading: "Our partners" });
    expect((await load()).presentation.sponsorsHeading).toBe("Our partners");
  });

  it("rejects another club's, retired, wrong-page or missing detail photos without writing", async () => {
    await save(sam());
    const before = await load();
    for (const id of [await asset(CLUB_IDS.bravo), await asset(clubId, "photograph", "orphaned"), await asset(clubId, "photograph", "published", "homepage"), randomUUID()]) {
      await rejects(() => save(sam([detail("Player edition", id)])), "INVALID_SHOP_PHOTO");
    }
    expect(await load()).toEqual(before);
  });

  it("rejects malformed new sections from a direct caller", async () => {
    const base = sam(), before = await load();
    for (const change of [
      { editions: [...base.editions, base.editions[0], base.editions[0]] },
      { editionsHeading: "x".repeat(81) },
      { editionsHeading: 80 },
      { editions: [{ ...base.editions[0], link: "javascript:alert(1)" }] },
      { details: Array.from({ length: 7 }, () => detail("Tile")) },
      { details: [{ ...detail("Tile"), title: "x".repeat(81) }] },
      { details: [{ ...detail("Tile"), url: "https://foreign.example/a.png" }] },
      { cardIcons: ["heart"] },
      { attributes: Array.from({ length: 9 }, () => "Machine wash cold") },
      { sizeChart: { ...base.sizeChart, rows: [{ label: "Chest (in)", values: ["35"] }] } },
      { mapHeading: { text: "Map view" } },
    ]) await rejects(() => save({ ...base, ...change }), "INVALID_SHOP_PRESENTATION");
    expect(await load()).toEqual(before);
  });

  it("protects detail photos in use and releases replaced or removed ones", async () => {
    const kept = await asset(), replaced = await asset(), removed = await asset(), replacement = await asset();
    await save(sam([detail("Player edition", kept), detail("3D crest", replaced), detail("Bespoke numbers", removed)]));
    expect(await retire(replaced)).toBe("referenced");
    const saved = await save(sam([detail("Player edition", kept), detail("3D crest", replacement), detail("Bespoke numbers")]));
    expect(saved.retiredMediaAssetIds.sort()).toEqual([removed, replaced].sort());
    expect(saved.retiredMediaAssetIds).not.toContain(kept);
    expect(await retire(replaced)).toBe("retired");
    expect(await retire(kept)).toBe("referenced");
  });

  it("keeps direct table writers inside the same photo and tile rules", async () => {
    await save(sam([detail("Player edition")]));
    const foreign = await asset(CLUB_IDS.bravo), own = await asset();
    await rejects(() => db.query("update onzio.cinematic_shop_content set detail_1_media_asset_id=$2 where club_id=$1", [clubId, foreign]), "MEDIA_NOT_PUBLISHED");
    await rejects(() => db.query("update onzio.cinematic_shop_content set detail_2_media_asset_id=$2 where club_id=$1", [clubId, own]), "INVALID_SHOP_PRESENTATION");
  });
});
