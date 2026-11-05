import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { localPostgresConfig } from "../helpers/local-postgres";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { MAX_PARTNERS, starterCinematicPartnersContent, type CinematicPartnersContent } from "@/lib/cinematic-partners-content";

let db: Client;
const clubId = CLUB_IDS.alpha;

async function actor(userId: string = USER_IDS.ownerAal2) {
  await db.query("reset role");
  const second = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: userId, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second }] })]);
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
    values($1,$2,'onzio-media',$3,'branding',$4,'image/png',100,1200,240,$5,$6,now(),case when $6='orphaned' then now() else null end)`,
  [id, owner, `${owner}/branding/${id}.png`, kind, "c".repeat(64), status]);
  await actor();
  return id;
}
async function sponsorLogo(name: string, assetId: string) {
  await db.query("reset role");
  await db.query("insert into onzio.site_sponsor_logos(club_id,placement,name,logo_url,media_asset_id,sort_order) values($1,'carousel',$2,$3,$4,99)",
    [clubId, name, `http://127.0.0.1:55321/storage/v1/object/public/onzio-media/${clubId}/branding/${assetId}.png`, assetId]);
  await actor();
}
async function retire(id: string) {
  await db.query("reset role");
  await db.query("set local role service_role");
  const status = (await db.query("select onzio.retire_unreferenced_media_asset($1,$2,$3) as data", [clubId, id, USER_IDS.ownerAal2])).rows[0].data.status;
  await actor();
  return status;
}
async function load(operationId?: string, target: string = clubId) {
  return (await db.query("select onzio.load_cinematic_partners_editor($1,$2) as data", [target, operationId ?? null])).rows[0].data;
}
async function request(content: CinematicPartnersContent) {
  const snapshot = await load();
  return { operationId: randomUUID(), expectedRevision: snapshot.revision, designRevision: snapshot.designRevision, content };
}
async function save(body: unknown) {
  return (await db.query("select onzio.save_cinematic_partners_editor($1,$2::jsonb) as data", [clubId, JSON.stringify(body)])).rows[0].data;
}
async function rejects(action: () => Promise<unknown>, message: string | RegExp) {
  await db.query("savepoint expected_failure");
  try { await expect(action()).rejects.toThrow(message); }
  finally { await db.query("rollback to savepoint expected_failure"); }
}
const row = (name: string, logoAssetId: string | null = null, role = "Official partner") =>
  ({ id: randomUUID(), name, role, logoAssetId, tone: "original" as const });
function content(partners: CinematicPartnersContent["partners"]): CinematicPartnersContent {
  const value = starterCinematicPartnersContent();
  value.pages.partners.intro = "We are proud to collaborate with amazing partners.";
  value.partners = partners;
  return value;
}

beforeEach(async () => { assertSafeTestEnvironment(); db = new Client(localPostgresConfig()); await db.connect(); await db.query("begin"); await design(); });
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("cinematic Partners atomic save", () => {
  it("saves both pages and the ordered partner list together, and replays only the same actor's receipt", async () => {
    const homepage = (await db.query("select content from onzio.homepage_revamp_content where club_id=$1", [clubId])).rows;
    const foothill = await asset();
    const body = await request(content([row("Foothill Transit", foothill, "Main partner"), row("MVMNT CULTR")]));
    body.content.partners[0].tone = "grey";
    const committed = await save(body);
    expect(committed.content.partners.map((p: { name: string }) => p.name)).toEqual(["Foothill Transit", "MVMNT CULTR"]);
    expect(committed.content.partners[0]).toMatchObject({ logoAssetId: foothill, tone: "grey", role: "Main partner" });
    expect(committed.content.pages.partners.intro).toBe("We are proud to collaborate with amazing partners.");
    expect((await load()).content).toEqual(committed.content);
    expect(await save(body)).toEqual(committed);
    expect((await load(body.operationId)).operation.receipt).toEqual(committed);
    await rejects(() => save({ ...body, content: { ...body.content, partners: [] } }), "OPERATION_REUSED");
    expect((await db.query("select content from onzio.homepage_revamp_content where club_id=$1", [clubId])).rows).toEqual(homepage);
    await actor(USER_IDS.adminAal2);
    expect((await load(body.operationId)).operation.status).toBe("not-committed");
  });

  it("reorders and removes partners, returning the logo no partner uses any more", async () => {
    const a = await asset(), b = await asset();
    const first = await save(await request(content([row("A", a), row("B", b), row("C")])));
    const [rowA, rowB, rowC] = first.content.partners;
    const second = await save(await request(content([rowC, rowA])));
    expect(second.content.partners.map((p: { name: string }) => p.name)).toEqual(["C", "A"]);
    expect(second.retiredMediaAssetIds).toEqual([b]);
    expect(rowB.logoAssetId).toBe(b);
    expect(await retire(b)).toBe("retired");
    expect(await retire(a)).toBe("referenced");
  });

  it("shares the Sponsors editor's logos instead of duplicating them", async () => {
    const woodmen = await asset();
    await sponsorLogo("Modern Woodmen", woodmen);
    const snapshot = await load();
    expect(snapshot.logos).toContainEqual(expect.objectContaining({ id: woodmen, label: "Modern Woodmen", width: 1200, height: 240 }));
    await save(await request(content([row("Modern Woodmen", woodmen)])));
    const removed = await save(await request(content([])));
    expect(removed.retiredMediaAssetIds).toEqual([woodmen]);
    expect(await retire(woodmen)).toBe("referenced");
  });

  it("keeps a logo shared with the carousel when the carousel drops it", async () => {
    const tepito = await asset();
    await sponsorLogo("Tepito Coffee", tepito);
    await save(await request(content([row("Tepito Coffee", tepito)])));
    await db.query("reset role");
    await db.query("delete from onzio.site_sponsor_logos where media_asset_id=$1", [tepito]);
    await actor();
    expect(await retire(tepito)).toBe("referenced");
  });

  it("rejects another club's logo, an unpublished logo and a photograph", async () => {
    for (const id of [await asset(CLUB_IDS.bravo), await asset(clubId, "graphic", "orphaned"), await asset(clubId, "photograph")]) {
      const body = await request(content([row("Bad logo", id)]));
      await rejects(() => save(body), "INVALID_CINEMATIC_PARTNERS_PAYLOAD");
    }
    expect((await load()).content).toBeNull();
  });

  it("rejects invalid content inside the database too", async () => {
    const tooMany = Array.from({ length: MAX_PARTNERS + 1 }, (_, i) => row(`Partner ${i}`));
    const duplicate = row("Twice");
    const unsafe = content([]);
    unsafe.pages.opportunities.ctaHref = "javascript:alert(1)";
    const blank = content([]);
    blank.pages.opportunities.title = " ";
    for (const bad of [content(tooMany), content([duplicate, { ...duplicate }]), content([row(" ")]), unsafe, blank]) {
      await rejects(async () => save(await request(bad)), "INVALID_CINEMATIC_PARTNERS_PAYLOAD");
    }
    await rejects(async () => save({ ...(await request(content([]))), content: { ...content([]), extra: true } }), "INVALID_CINEMATIC_PARTNERS_PAYLOAD");
  });

  it("rejects stale saves and a changed design", async () => {
    const stale = await request(content([row("First")]));
    await save(await request(content([row("Second")])));
    await rejects(() => save(stale), "CINEMATIC_PARTNERS_CHANGED");
    const current = await request(content([]));
    await design();
    await rejects(() => save(current), "DESIGN_CHANGED");
  });

  it("denies another tenant and other website designs", async () => {
    await rejects(() => load(undefined, CLUB_IDS.bravo), "NOT_AUTHORIZED");
    await design(1);
    await rejects(() => load(), "PAGE_UNAVAILABLE");
  });

  it("lets visitors read published partners but not write them directly", async () => {
    await save(await request(content([row("Foothill Transit")])));
    await db.query("reset role");
    await db.query("set local role anon");
    expect((await db.query("select name from onzio.cinematic_partners where club_id=$1", [clubId])).rows).toEqual([{ name: "Foothill Transit" }]);
    expect((await db.query("select content->'pages'->'partners'->>'title' as title from onzio.cinematic_partners_content where club_id=$1", [clubId])).rows).toEqual([{ title: "Club Partners" }]);
    await rejects(() => db.query("insert into onzio.cinematic_partners(club_id,id,sort_order,name,role,logo_tone) values($1,$2,5,'Anon','', 'original')", [clubId, randomUUID()]), "permission denied");
    await actor(USER_IDS.unaffiliated);
    await rejects(() => db.query("insert into onzio.cinematic_partners(club_id,id,sort_order,name,role,logo_tone) values($1,$2,5,'Stranger','', 'original')", [clubId, randomUUID()]), /row-level security|NOT_AUTHORIZED/);
  });
});
