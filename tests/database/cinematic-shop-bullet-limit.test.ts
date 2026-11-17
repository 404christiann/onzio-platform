// Ten bullets are allowed only for cinematic@2 (Shop page and homepage jersey); every other club and template keeps main's 8.
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { localPostgresConfig } from "../helpers/local-postgres";
import { assertSafeTestEnvironment } from "../helpers/environment";

let db: Client;
const clubId = CLUB_IDS.alpha;
const MAIN_LIMIT = 8;
const CINEMATIC_SHOP_LIMIT = 10;

async function actor() {
  await db.query("reset role");
  const second = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: USER_IDS.ownerAal2, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second }] })]);
  await db.query("set local role authenticated");
}
/** Publishes a design for the club: cinematic@2 is Rose City's; cinematic@1 stands in for every other template. */
async function design(version: 1 | 2) {
  await db.query("reset role");
  const id = randomUUID();
  await db.query(`insert into onzio.presentation_documents(id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
    values($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,'cinematic',$3,$4,$5,$6)`,
  [id, clubId, version, JSON.stringify({ schemaVersion: 1, template: { id: "cinematic", version } }), "a".repeat(64), USER_IDS.ownerAal2]);
  await db.query("insert into onzio.presentation_state(club_id,published_document_id,updated_by) values($1,$2,$3) on conflict(club_id) do update set published_document_id=$2", [clubId, id, USER_IDS.ownerAal2]);
  await actor();
}
const section = (count: number) => ({ eyebrow: "Rose City FC Match Home 2027", title: "City of the Roses", description: "", bullet_points: Array.from({ length: count }, (_, i) => `Item ${i + 1}`), store_note: "", cta_label: "Buy now", cta_link: "/shop" });
/** A published Shop photo for this club; a saved kit needs at least one (validate_shop_photos). */
async function photo() {
  await db.query("reset role");
  const id = randomUUID();
  await db.query(`insert into onzio.media_assets(id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at)
    values($1,$2,'onzio-media',$3,'shop','photograph','image/png',100,1200,1150,$4,'published',now())`, [id, clubId, `${clubId}/shop/${id}.png`, "b".repeat(64)]);
  await actor();
  return [{ rowId: null, assetId: id, order: 0 }];
}
async function saveKit(surface: "home" | "shop", count: number) {
  const photos = await photo();
  const current = (await db.query("select onzio.load_shop_page($1,$2) as data", [clubId, surface])).rows[0].data;
  const payload = { operationId: randomUUID(), surface, expectedRevision: current.revision, designRevision: current.designRevision, variants: { home: { section: section(count), photos } } };
  return (await db.query("select onzio.save_shop_page($1,$2::jsonb) as data", [clubId, JSON.stringify(payload)])).rows[0].data;
}
async function rejects(action: () => Promise<unknown>) {
  await db.query("savepoint expected_failure");
  try { await expect(action()).rejects.toThrow("INVALID_SHOP_PAYLOAD"); } finally { await db.query("rollback to savepoint expected_failure"); }
}

beforeEach(async () => { assertSafeTestEnvironment(); db = new Client(localPostgresConfig()); await db.connect(); await db.query("begin"); });
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("Shop kit bullet limit", () => {
  it("lets a cinematic@2 Shop kit list up to ten bullets and rejects eleven", async () => {
    await design(2);
    for (const count of [MAIN_LIMIT, MAIN_LIMIT + 1, CINEMATIC_SHOP_LIMIT]) {
      const saved = await saveKit("shop", count);
      expect(saved.sections.find((kit: { kit_variant: string }) => kit.kit_variant === "home").bullet_points).toHaveLength(count);
    }
    await rejects(() => saveKit("shop", CINEMATIC_SHOP_LIMIT + 1));
  });

  it("still checks bullets 9 and 10 with main's rules on a cinematic@2 Shop kit", async () => {
    await design(2);
    const tooLong = { ...section(CINEMATIC_SHOP_LIMIT) };
    tooLong.bullet_points[MAIN_LIMIT] = "x".repeat(81);
    const photos = await photo();
    const current = (await db.query("select onzio.load_shop_page($1,'shop') as data", [clubId])).rows[0].data;
    await rejects(() => db.query("select onzio.save_shop_page($1,$2::jsonb)", [clubId, JSON.stringify({ operationId: randomUUID(), surface: "shop", expectedRevision: current.revision, designRevision: current.designRevision, variants: { home: { section: tooLong, photos } } })]));
  });

  it("keeps the old limit of eight for a page that is not cinematic@2", async () => {
    await design(1);
    await saveKit("shop", MAIN_LIMIT);
    await rejects(() => saveKit("shop", MAIN_LIMIT + 1));
  });

  it("lets the cinematic@2 homepage jersey list up to ten bullets and rejects eleven", async () => {
    await design(2);
    for (const count of [MAIN_LIMIT + 1, CINEMATIC_SHOP_LIMIT]) await saveKit("home", count);
    await rejects(() => saveKit("home", CINEMATIC_SHOP_LIMIT + 1));
  });
});
