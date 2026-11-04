import { randomUUID } from "node:crypto";
import { localPostgresConfig } from "../helpers/local-postgres";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { cinematicHomepageSaveContent, defaultCinematicHomepageContent } from "@/lib/cinematic-homepage-content";

let db: Client;
const clubId = CLUB_IDS.alpha;
async function actor(userId: string = USER_IDS.ownerAal2) {
  await db.query("reset role");
  const second = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: userId, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second }] })]);
  await db.query("set local role authenticated");
}
async function design() {
  await db.query("reset role"); const id = randomUUID();
  await db.query(`insert into onzio.presentation_documents(id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
    values($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,'cinematic',2,$3,$4,$5)`,
    [id, clubId, JSON.stringify({ schemaVersion: 1, template: { id: "cinematic", version: 2 } }), "a".repeat(64), USER_IDS.ownerAal2]);
  await db.query("insert into onzio.presentation_state(club_id,published_document_id,updated_by) values($1,$2,$3) on conflict(club_id) do update set published_document_id=$2", [clubId, id, USER_IDS.ownerAal2]);
  await actor();
}
async function asset(owner: string = clubId) {
  await db.query("reset role"); const id = randomUUID();
  await db.query(`insert into onzio.media_assets(id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at,created_by)
    values($1,$2,'onzio-media',$3,'homepage','graphic','image/webp',100,100,100,$4,'published',now(),$5)`, [id, owner, `${owner}/homepage/${id}.webp`, "c".repeat(64), USER_IDS.ownerAal2]);
  await actor(); return id;
}
async function load(): Promise<any> { return (await db.query("select onzio.load_homepage($1) as data", [clubId])).rows[0].data; }
async function payload(sections: Record<string, unknown>) { const value = await load(); return { operationId: randomUUID(), expectedRevision: value.revision, designRevision: value.designRevision, sections }; }
async function save(request: unknown): Promise<any> { return (await db.query("select onzio.save_homepage($1,$2::jsonb) as data", [clubId, JSON.stringify(request)])).rows[0].data; }
async function reject(run: () => Promise<unknown>, message: string) { await db.query("savepoint expected_error"); try { await expect(run()).rejects.toThrow(message); } finally { await db.query("rollback to savepoint expected_error"); } }
const content = () => cinematicHomepageSaveContent(defaultCinematicHomepageContent());

beforeEach(async () => {
  assertSafeTestEnvironment();
  db = new Client(localPostgresConfig()); await db.connect(); await db.query("begin"); await design();
});
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("cinematic@2 footer logo", () => {
  it("saves and loads an owner footer logo with its media for hydration", async () => {
    const logo = await asset(); const revamp = content(); revamp.footerLogo = { assetId: logo, alt: "RCFC" };
    await save(await payload({ revamp }));
    const loaded = await load();
    expect(loaded.content.revamp.footerLogo).toEqual({ assetId: logo, url: null, alt: "RCFC" });
    expect(loaded.media.some((row: any) => row.id === logo)).toBe(true);
    await db.query("reset role");
    const stored = (await db.query("select content,footer_logo_media_asset_id from onzio.homepage_revamp_content where club_id=$1", [clubId])).rows[0];
    expect(stored.footer_logo_media_asset_id).toBe(logo);
    expect(stored.content.footerLogo).toEqual({ alt: "RCFC" });
  });
  it("keeps accepting saves and rows from before the footer logo existed", async () => {
    const { footerLogo: _omitted, ...older } = content();
    await save(await payload({ revamp: older }));
    expect((await load()).content.revamp.footerLogo).toEqual({ assetId: null, url: null, alt: "" });
    await db.query("reset role");
    await db.query("update onzio.homepage_revamp_content set content=content-'footerLogo' where club_id=$1", [clubId]);
    await db.query("update onzio.homepage_revamp_content set content=jsonb_set(content,'{sponsors,heading}','\"Older row edit\"') where club_id=$1", [clubId]);
  });
  it("rejects another club's, retired or JSON-embedded footer logos", async () => {
    const revamp = content(); revamp.footerLogo = { assetId: await asset(CLUB_IDS.bravo), alt: "Foreign" };
    await reject(async () => save(await payload({ revamp })), "INVALID_PHOTO");
    const own = await asset(); await db.query("reset role"); await db.query("update onzio.media_assets set status='orphaned',deleted_at=now() where id=$1", [own]); await actor();
    revamp.footerLogo = { assetId: own, alt: "Retired" };
    await reject(async () => save(await payload({ revamp })), "INVALID_PHOTO");
    await save(await payload({ revamp: content() }));
    await reject(() => db.query(`update onzio.homepage_revamp_content set content=jsonb_set(content,'{footerLogo}',$1::jsonb) where club_id=$2`, [JSON.stringify({ assetId: randomUUID(), alt: "Smuggled" }), clubId]), "INVALID_HOMEPAGE_PAYLOAD");
    await reject(async () => save(await payload({ revamp: { ...content(), footerLogo: { assetId: null, alt: "x", url: "https://foreign.test/logo.png" } } })), "INVALID_HOMEPAGE_PAYLOAD");
  });
  it("protects the linked logo from cleanup and reports a replaced logo for retirement", async () => {
    const first = await asset(); const second = await asset(); const revamp = content(); revamp.footerLogo = { assetId: first, alt: "RCFC" };
    await save(await payload({ revamp }));
    expect((await db.query("select onzio.retire_unreferenced_homepage_upload($1,$2) as data", [clubId, first])).rows[0].data.status).toBe("referenced");
    revamp.footerLogo = { assetId: second, alt: "RCFC" };
    expect((await save(await payload({ revamp }))).retiredMediaAssetIds).toContain(first);
    revamp.footerLogo = { assetId: null, alt: "" };
    expect((await save(await payload({ revamp }))).retiredMediaAssetIds).toContain(second);
  });
});
