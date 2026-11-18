import { randomUUID } from "node:crypto";
import { localPostgresConfig } from "../helpers/local-postgres";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { cinematicHomepageSaveContent, cinematicHomepageStorageRecord, defaultCinematicHomepageContent } from "@/lib/cinematic-homepage-content";

let db: Client;
const clubId = CLUB_IDS.alpha;
async function actor(userId: string = USER_IDS.ownerAal2) {
  await db.query("reset role");
  const second = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: userId, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second }] })]);
  await db.query("set local role authenticated");
}
async function design(version = 2) {
  await db.query("reset role"); const id = randomUUID();
  await db.query(`insert into onzio.presentation_documents(id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
    values($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,'cinematic',$3,$4,$5,$6)`,
    [id, clubId, version, JSON.stringify({ schemaVersion: 1, template: { id: "cinematic", version } }), "a".repeat(64), USER_IDS.ownerAal2]);
  await db.query("insert into onzio.presentation_state(club_id,published_document_id,updated_by) values($1,$2,$3) on conflict(club_id) do update set published_document_id=$2", [clubId, id, USER_IDS.ownerAal2]);
  await actor();
}
async function asset(owner: string = clubId) {
  await db.query("reset role"); const id = randomUUID();
  await db.query(`insert into onzio.media_assets(id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at,created_by)
    values($1,$2,'onzio-media',$3,'homepage','photograph','image/webp',100,100,100,$4,'published',now(),$5)`, [id, owner, `${owner}/homepage/${id}.webp`, "b".repeat(64), USER_IDS.ownerAal2]);
  await actor(); return id;
}
async function load(id: string = clubId): Promise<any> { return (await db.query("select onzio.load_homepage($1) as data", [id])).rows[0].data; }
async function payload(sections: Record<string, unknown>) { const value = await load(); return { operationId: randomUUID(), expectedRevision: value.revision, designRevision: value.designRevision, sections }; }
async function save(request: unknown): Promise<any> { return (await db.query("select onzio.save_homepage($1,$2::jsonb) as data", [clubId, JSON.stringify(request)])).rows[0].data; }
async function reject(run: () => Promise<unknown>, message: string) { await db.query("savepoint expected_error"); try { await expect(run()).rejects.toThrow(message); } finally { await db.query("rollback to savepoint expected_error"); } }
const content = () => cinematicHomepageSaveContent(defaultCinematicHomepageContent());

beforeEach(async () => {
  assertSafeTestEnvironment();
  db = new Client(localPostgresConfig()); await db.connect(); await db.query("begin"); await design();
});
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("cinematic@2 atomic homepage", () => {
  it("allows the operator service role to import tenant-owned readonly presentation inputs", async () => {
    const headerId = await asset(); const content = defaultCinematicHomepageContent(); content.presentation.headerPartner.assetId = headerId; content.presentation.heroVideoGuid = "imported-video";
    const row = cinematicHomepageStorageRecord(content);
    await db.query("reset role"); await db.query("set local role service_role");
    await db.query("insert into onzio.homepage_revamp_content(club_id,content,header_partner_media_asset_id,presentation_config) values($1,$2,$3,$4)", [clubId, JSON.stringify(row.content), headerId, JSON.stringify(row.presentation_config)]);
    const saved = (await db.query("select header_partner_media_asset_id,presentation_config from onzio.homepage_revamp_content where club_id=$1", [clubId])).rows[0];
    expect(saved.header_partner_media_asset_id).toBe(headerId); expect(saved.presentation_config.heroVideoGuid).toBe("imported-video");
    await actor(); expect((await load()).content.revamp.presentation.headerPartner.assetId).toBe(headerId);
  });
  it("retains rejection of unregistered template versions", async () => {
    await db.query("reset role");
    await reject(() => db.query(`insert into onzio.presentation_documents(id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
      values($1,$2,900,1,'editorial',2,$3,$4,$5)`, [randomUUID(), clubId, JSON.stringify({ schemaVersion: 1, template: { id: "editorial", version: 2 } }), "a".repeat(64), USER_IDS.ownerAal2]), "presentation_documents_template_version_check");
    await reject(() => db.query(`insert into onzio.presentation_documents(id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
      values($1,$2,900,1,'cinematic',3,$3,$4,$5)`, [randomUUID(), clubId, JSON.stringify({ schemaVersion: 1, template: { id: "cinematic", version: 3 } }), "a".repeat(64), USER_IDS.ownerAal2]), "presentation_documents_template_version_check");
  });
  it("accepts renamed labels for the Tickets menu's own pages (RC2027-TICKET-PAGES)", async () => {
    const revamp = content();
    revamp.navigation.labels["tickets-page"] = "Single tickets"; revamp.navigation.labels["season-membership"] = "Season tickets";
    await save(await payload({ revamp }));
    expect((await load()).content.revamp.navigation.labels).toMatchObject({ "tickets-page": "Single tickets", "season-membership": "Season tickets" });
  });
  it("saves real editable copy, route labels and ticket visibility with one retry receipt", async () => {
    const revamp = content(); revamp.ticket.visible = false; revamp.navigation.labels["stadium-group"] = "Robinson Stadium";
    const request = await payload({ hero: { intro: "New intro" }, revamp }); const first = await save(request);
    expect((await load()).content.revamp.ticket.visible).toBe(false); expect((await load()).content.revamp.navigation.labels["stadium-group"]).toBe("Robinson Stadium");
    expect(await save(request)).toEqual(first);
    await reject(() => save({ ...request, sections: { revamp: { ...revamp, match: { ...revamp.match, heading: "Different" } } } }), "OPERATION_REUSED");
  });
  it("saves the anthem destination while accepting older rows and rejecting unsafe direct writes", async () => {
    const revamp = content();
    revamp.navigation.destinations.nationalAnthem = "https://forms.gle/tAezhCRdXH1Z1bMR7";
    await save(await payload({ revamp }));
    expect((await load()).content.revamp.navigation.destinations.nationalAnthem).toBe("https://forms.gle/tAezhCRdXH1Z1bMR7");
    await db.query("update onzio.homepage_revamp_content set content=content #- '{navigation,destinations,nationalAnthem}' where club_id=$1", [clubId]);
    expect((await load()).content.revamp.navigation.destinations.nationalAnthem).toBeUndefined();
    await reject(() => db.query("update onzio.homepage_revamp_content set content=jsonb_set(content,'{navigation,destinations,nationalAnthem}','\"javascript:alert(1)\"') where club_id=$1", [clubId]), "INVALID_HOMEPAGE_PAYLOAD");
  });
  it("accepts seven photos for cinematic2 and retains the six-photo limit for cinematic1", async () => {
    const ids = []; for (let i = 0; i < 7; i++) ids.push(await asset());
    const photos = { items: ids.map((assetId, order) => ({ clientId: `p${order}`, rowId: null, assetId, alt: "Photo", order })) };
    await save(await payload({ photos })); expect((await load()).content.photos.items).toHaveLength(7);
    await design(1); await reject(async () => save(await payload({ photos })), "INVALID_HOMEPAGE_PAYLOAD");
    await reject(async () => save(await payload({ revamp: content() })), "SECTION_UNAVAILABLE");
  });
  it("rejects foreign, retired and forged artwork, rolling back other sections", async () => {
    const foreign = await asset(CLUB_IDS.bravo); const revamp = content(); revamp.raffle.assetId = foreign;
    const baseline = await load(); await reject(async () => save(await payload({ hero: { intro: "Must roll back" }, revamp })), "INVALID_PHOTO"); expect(await load()).toEqual(baseline);
    const own = await asset(); await db.query("reset role"); await db.query("update onzio.media_assets set status='orphaned',deleted_at=now() where id=$1", [own]); await actor(); revamp.raffle.assetId = own;
    await reject(async () => save(await payload({ revamp })), "INVALID_PHOTO");
    await reject(async () => save(await payload({ revamp: { ...content(), presentation: { heroVideoGuid: "forged" } } })), "INVALID_HOMEPAGE_PAYLOAD");
    await reject(async () => save(await payload({ revamp: { ...content(), match: { ...content().match, buttonHref: "//foreign.test/tickets" } } })), "INVALID_HOMEPAGE_PAYLOAD");
    await reject(async () => save(await payload({ revamp: { ...content(), navigation: { labels: { unknown: "Unknown" } } } })), "INVALID_HOMEPAGE_PAYLOAD");
  });
  it("protects linked artwork from abandoned-upload cleanup and reports replaced media for retirement", async () => {
    const first = await asset(); const second = await asset(); const revamp = content(); revamp.ticket.assetId = first;
    await save(await payload({ revamp }));
    expect((await db.query("select onzio.retire_unreferenced_homepage_upload($1,$2) as data", [clubId, first])).rows[0].data.status).toBe("referenced");
    revamp.ticket.assetId = second; const receipt = await save(await payload({ revamp })); expect(receipt.retiredMediaAssetIds).toContain(first);
    expect((await load()).media.some((row: any) => row.id === second)).toBe(true);
  });
  it("blocks edits to read-only presentation columns and rejects another tenant", async () => {
    await save(await payload({ revamp: content() }));
    await reject(() => db.query("update onzio.homepage_revamp_content set presentation_config='{}' where club_id=$1", [clubId]), "permission denied");
    await reject(() => load(CLUB_IDS.bravo), "NOT_AUTHORIZED");
  });
});
