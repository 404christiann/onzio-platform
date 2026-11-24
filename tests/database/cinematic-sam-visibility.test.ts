import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localPostgresConfig } from "../helpers/local-postgres";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { defaultCinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import { EMPTY_CINEMATIC_SHOP_CONTENT } from "@/lib/cinematic-shop-content";

// SAM-VISIBILITY-AND-HEADER-SPONSOR (20261123120000_sam_visibility_controls.sql). Each test runs in one
// rolled-back transaction on the shared local database.

let db: Client;
const clubId = CLUB_IDS.alpha;
const BRAVO_ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7"; // admin of Bravo only

async function actor(userId: string = USER_IDS.ownerAal2) {
  await db.query("reset role");
  const second = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: userId, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second }] })]);
  await db.query("set local role authenticated");
}
async function design(club: string = clubId) {
  await db.query("reset role"); const id = randomUUID();
  await db.query(`insert into onzio.presentation_documents(id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
    values($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,'cinematic',2,$3,$4,$5)`,
    [id, club, JSON.stringify({ schemaVersion: 1, template: { id: "cinematic", version: 2 } }), "a".repeat(64), USER_IDS.ownerAal2]);
  await db.query("insert into onzio.presentation_state(club_id,published_document_id,updated_by) values($1,$2,$3) on conflict(club_id) do update set published_document_id=$2", [club, id, USER_IDS.ownerAal2]);
  await actor();
}
async function asset(owner: string = clubId, surface = "homepage") {
  await db.query("reset role"); const id = randomUUID();
  await db.query(`insert into onzio.media_assets(id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at,created_by)
    values($1,$2,'onzio-media',$3,$4,'graphic','image/webp',100,100,100,$5,'published',now(),$6)`, [id, owner, `${owner}/${surface}/${id}.webp`, surface, "c".repeat(64), USER_IDS.ownerAal2]);
  await actor(); return id;
}
async function load(): Promise<any> { return (await db.query("select onzio.load_homepage($1) as data", [clubId])).rows[0].data; }
async function payload(sections: Record<string, unknown>) { const value = await load(); return { operationId: randomUUID(), expectedRevision: value.revision, designRevision: value.designRevision, sections }; }
async function save(revamp: unknown): Promise<any> { return (await db.query("select onzio.save_homepage($1,$2::jsonb) as data", [clubId, JSON.stringify(await payload({ revamp }))])).rows[0].data; }
async function row(): Promise<any> {
  await db.query("reset role");
  const result = (await db.query("select content,header_partner_media_asset_id,presentation_config from onzio.homepage_revamp_content where club_id=$1", [clubId])).rows[0];
  await actor(); return result;
}
async function reject(run: () => Promise<unknown>, message: string) { await db.query("savepoint expected_error"); try { await expect(run()).rejects.toThrow(message); } finally { await db.query("rollback to savepoint expected_error"); } }

/** The payload the app sent before this package: no `visible` on raffle/match/prices, no headerPartner. */
function legacy(): Record<string, any> {
  const value = defaultCinematicHomepageContent();
  const media = ({ assetId, alt }: { assetId: string | null; alt: string }) => ({ assetId, alt });
  return {
    sponsors: value.sponsors, raffle: media(value.raffle), ticket: { ...media(value.ticket), visible: true }, footerLogo: media(value.footerLogo),
    match: value.match, prices: value.prices, championship: { ...value.championship, trophy: media(value.championship.trophy) }, navigation: value.navigation,
  };
}

beforeEach(async () => {
  assertSafeTestEnvironment();
  db = new Client(localPostgresConfig()); await db.connect(); await db.query("begin"); await design();
});
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("homepage raffle, match and prices visibility", () => {
  it("keeps accepting a payload without any visible flag, and stores none", async () => {
    await save(legacy());
    const stored = (await row()).content;
    for (const part of ["raffle", "match", "prices"]) expect(stored[part]).not.toHaveProperty("visible");
  });
  it("persists an explicit false on each section and loads it back", async () => {
    const revamp = legacy(); revamp.raffle.visible = false; revamp.match.visible = false; revamp.prices.visible = false;
    await save(revamp);
    const loaded = (await load()).content.revamp;
    expect([loaded.raffle.visible, loaded.match.visible, loaded.prices.visible]).toEqual([false, false, false]);
    expect((await row()).content.raffle).toEqual({ alt: "", visible: false });
  });
  it("rejects a non-boolean flag and an unknown key", async () => {
    for (const part of ["raffle", "match", "prices"]) {
      const revamp = legacy(); revamp[part].visible = "no";
      await reject(() => save(revamp), "INVALID_HOMEPAGE_PAYLOAD");
    }
    const revamp = legacy(); revamp.match.hidden = true;
    await reject(() => save(revamp), "INVALID_HOMEPAGE_PAYLOAD");
  });
  it("lets a table row carry the flags through the row validator", async () => {
    await save(legacy());
    await db.query("reset role");
    await db.query("update onzio.homepage_revamp_content set content=jsonb_set(content,'{prices,visible}','false') where club_id=$1", [clubId]);
    await reject(() => db.query("update onzio.homepage_revamp_content set content=jsonb_set(content,'{prices,visible}','\"off\"') where club_id=$1", [clubId]), "INVALID_HOMEPAGE_PAYLOAD");
  });
});

describe("header sponsor logo", () => {
  it("sets, keeps, re-describes and clears the logo through header_partner_media_asset_id only", async () => {
    const logo = await asset();
    await save({ ...legacy(), headerPartner: { assetId: logo, alt: "Foothill Transit" } });
    let stored = await row();
    expect(stored.header_partner_media_asset_id).toBe(logo);
    expect(stored.presentation_config.artworkAlt.headerPartner).toBe("Foothill Transit");
    expect(stored.content).not.toHaveProperty("headerPartner");
    const loaded = await load();
    expect(loaded.content.revamp.presentation.headerPartner).toEqual({ assetId: logo, url: null, alt: "Foothill Transit" });
    expect(loaded.media.some((media: any) => media.id === logo)).toBe(true);

    // Absent = unchanged.
    expect((await save(legacy())).retiredMediaAssetIds).not.toContain(logo);
    expect((await row()).header_partner_media_asset_id).toBe(logo);

    await save({ ...legacy(), headerPartner: { assetId: logo, alt: "Foothill Transit partner" } });
    expect((await row()).presentation_config.artworkAlt.headerPartner).toBe("Foothill Transit partner");

    // Removing clears the slot and hands the asset to retirement.
    expect((await save({ ...legacy(), headerPartner: { assetId: null, alt: "" } })).retiredMediaAssetIds).toContain(logo);
    stored = await row();
    expect(stored.header_partner_media_asset_id).toBeNull();
    expect((await load()).content.revamp.presentation.headerPartner).toEqual({ assetId: null, url: null, alt: "" });
  });
  it("keeps the other presentation settings when the logo changes", async () => {
    await save(legacy());
    await db.query("reset role");
    await db.query(`update onzio.homepage_revamp_content set presentation_config='{"heroVideoGuid":"g","sponsorTreatments":{},"artworkAlt":{"heroPoster":"Poster"}}'::jsonb where club_id=$1`, [clubId]);
    await actor();
    await save({ ...legacy(), headerPartner: { assetId: await asset(), alt: "Partner" } });
    expect((await row()).presentation_config).toEqual({ heroVideoGuid: "g", sponsorTreatments: {}, artworkAlt: { heroPoster: "Poster", headerPartner: "Partner" } });
  });
  it("reports a replaced logo for retirement", async () => {
    const first = await asset(); const second = await asset();
    await save({ ...legacy(), headerPartner: { assetId: first, alt: "One" } });
    expect((await save({ ...legacy(), headerPartner: { assetId: second, alt: "Two" } })).retiredMediaAssetIds).toContain(first);
  });
  it("rejects another club's, an unpublished or a non-homepage image, and extra keys", async () => {
    await reject(async () => save({ ...legacy(), headerPartner: { assetId: await asset(CLUB_IDS.bravo), alt: "Foreign" } }), "INVALID_PHOTO");
    const retired = await asset(); await db.query("reset role"); await db.query("update onzio.media_assets set status='orphaned',deleted_at=now() where id=$1", [retired]); await actor();
    await reject(() => save({ ...legacy(), headerPartner: { assetId: retired, alt: "Retired" } }), "INVALID_PHOTO");
    await reject(async () => save({ ...legacy(), headerPartner: { assetId: await asset(clubId, "shop"), alt: "Shop" } }), "INVALID_PHOTO");
    await reject(() => save({ ...legacy(), headerPartner: { assetId: null, alt: "x", url: "https://foreign.test/logo.png" } }), "INVALID_HOMEPAGE_PAYLOAD");
    await reject(() => save({ ...legacy(), headerPartner: { assetId: null, alt: "x".repeat(1001) } }), "INVALID_HOMEPAGE_PAYLOAD");
  });
  it("lets the owner re-describe an operator-imported logo that is not a homepage upload", async () => {
    await save(legacy());
    const imported = await asset(clubId, "shop");
    await db.query("reset role"); await db.query("update onzio.homepage_revamp_content set header_partner_media_asset_id=$1 where club_id=$2", [imported, clubId]); await actor();
    await save({ ...legacy(), headerPartner: { assetId: imported, alt: "Foothill Transit" } });
    expect((await row()).presentation_config.artworkAlt.headerPartner).toBe("Foothill Transit");
  });
  it("leaves club editors without a direct write to the logo columns", async () => {
    await save(legacy());
    const logo = await asset();
    await reject(() => db.query("update onzio.homepage_revamp_content set header_partner_media_asset_id=$1 where club_id=$2", [logo, clubId]), "permission denied");
    await reject(() => db.query("update onzio.homepage_revamp_content set presentation_config='{}' where club_id=$1", [clubId]), "permission denied");
  });
  it("lets only an editor of the club call the helper", async () => {
    await save(legacy());
    const logo = await asset();
    await actor(BRAVO_ADMIN);
    await reject(() => db.query("select onzio_private.set_cinematic_header_partner($1,$2,'x')", [clubId, logo]), "NOT_AUTHORIZED");
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ role: "anon" })]);
    await db.query("set local role anon");
    await reject(() => db.query("select onzio_private.set_cinematic_header_partner($1,$2,'x')", [clubId, logo]), "permission denied");
  });
});

describe("shop jersey visibility", () => {
  const validate = (editions: unknown[]) => db.query("select onzio_private.validate_cinematic_shop_content($1,$2::jsonb)", [clubId, JSON.stringify({ ...EMPTY_CINEMATIC_SHOP_CONTENT, editions })]);
  const edition = (extra: Record<string, unknown> = {}) => ({ label: "Home", price: "$85", line: "Player edition", link: "", ...extra });
  it("accepts jerseys without the flag and with an explicit true or false", async () => {
    await validate([edition(), edition({ visible: false }), edition({ visible: true })]);
  });
  it("rejects a non-boolean flag and any other extra key", async () => {
    await reject(() => validate([edition({ visible: "false" })]), "INVALID_SHOP_PRESENTATION");
    await reject(() => validate([edition({ visible: null })]), "INVALID_SHOP_PRESENTATION");
    await reject(() => validate([edition({ hidden: true })]), "INVALID_SHOP_PRESENTATION");
  });
});

describe("ticket page visibility keys", () => {
  it.each([
    [{ tickets: false }, true],
    [{ "season-membership": false, tickets: true }, true],
    [{ stadium: false, tickets: false, "season-membership": false }, true],
    [{ "know-before-you-go": false }, false],
    [{ tickets: "false" }, false],
  ])("validates %j as %s", async (value, valid) => {
    expect((await db.query("select onzio_private.is_public_page_visibility($1::jsonb) as valid", [JSON.stringify(value)])).rows[0].valid).toBe(valid);
  });
  it("lets an owner hide and show Single Match Tickets and Season Ticket Membership", async () => {
    await db.query("reset role"); await db.query("update onzio.clubs set public_page_visibility='{}'::jsonb where id=$1", [clubId]); await actor();
    expect((await db.query("select onzio.set_public_page_visibility($1,'tickets',false) as v", [clubId])).rows[0].v).toEqual({ tickets: false });
    expect((await db.query("select onzio.set_public_page_visibility($1,'season-membership',false) as v", [clubId])).rows[0].v).toEqual({ tickets: false, "season-membership": false });
    expect((await db.query("select onzio.set_public_page_visibility($1,'tickets',true) as v", [clubId])).rows[0].v).toEqual({ tickets: true, "season-membership": false });
  });
});
