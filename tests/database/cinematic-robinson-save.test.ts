import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localPostgresConfig } from "../helpers/local-postgres";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { emptyRobinsonContent, type RobinsonContent } from "@/lib/cinematic-robinson-content";
import { robinsonReferenceContent } from "@/lib/robinson-reference-content";

let db: Client;
const clubId = CLUB_IDS.alpha;
async function actor(userId: string = USER_IDS.ownerAal2) {
  await db.query("reset role");
  const timestamp = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: userId, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp }] })]);
  await db.query("set local role authenticated");
}
async function design(version = 2) {
  await db.query("reset role");
  const id = randomUUID();
  await db.query("insert into onzio.presentation_documents(id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by) values($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,'cinematic',$3,$4,$5,$6)", [id, clubId, version, JSON.stringify({ schemaVersion: 1, template: { id: "cinematic", version }, navigation: { groups: [{ routes: ["home", "schedule"] }] } }), "a".repeat(64), USER_IDS.ownerAal2]);
  await db.query("insert into onzio.presentation_state(club_id,published_document_id,updated_by) values($1,$2,$3) on conflict(club_id) do update set published_document_id=$2", [clubId, id, USER_IDS.ownerAal2]);
  await actor();
}
async function load(operationId?: string, target: string = clubId) { return (await db.query("select onzio.load_robinson_editor($1,$2) as data", [target, operationId ?? null])).rows[0].data; }
async function input(content: RobinsonContent = structuredClone(robinsonReferenceContent)) {
  const s = await load();
  return { operationId: randomUUID(), expectedRevision: s.revision, designRevision: s.designRevision, content, retiredMediaAssetIds: [] as string[] };
}
async function save(request: unknown) { return (await db.query("select onzio.save_robinson_editor($1,$2::jsonb) as data", [clubId, JSON.stringify(request)])).rows[0].data; }
async function rejects(action: () => Promise<unknown>, message: string) {
  await db.query("savepoint expected_failure");
  try { await expect(action()).rejects.toThrow(message); }
  finally { await db.query("rollback to savepoint expected_failure"); }
}
async function asset(tenant: string = clubId, surface = "homepage", kind = "graphic") {
  await db.query("reset role");
  const id = randomUUID(), path = `${tenant}/${surface}/${id}.png`;
  await db.query("insert into onzio.media_assets(id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,created_by,published_at) values($1,$2,'onzio-media',$3,$4,$5,'image/png',100,100,100,$6,'published',$7,now())", [id, tenant, path, surface, kind, "a".repeat(64), USER_IDS.ownerAal2]);
  await actor();
  return id;
}
async function digest(table: string) {
  await db.query("reset role");
  const value = (await db.query(`select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as d from onzio.${table} t where club_id=$1`, [clubId])).rows[0].d;
  await actor();
  return value;
}
beforeEach(async () => { assertSafeTestEnvironment(); db = new Client(localPostgresConfig()); await db.connect(); await db.query("begin"); await design(); });
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("Robinson Stadium independent atomic saves", () => {
  it("saves the confirmed copy, replays the exact actor receipt, and leaves Foothill Transit, Homepage and Tickets untouched", async () => {
    const before = await Promise.all(["cinematic_stadium_content", "homepage_revamp_content", "cinematic_tickets_content"].map(digest));
    expect((await load()).content).toBeNull();
    const r = await input();
    const committed = await save(r);
    expect(committed.revision).toBe("1");
    expect(committed.content).toEqual(robinsonReferenceContent);
    expect(committed.content.story.paragraphs[1]).toContain("In 2001");
    expect(committed.content.info.note).toContain("1999");
    expect(await save(r)).toEqual(committed);
    expect((await load(r.operationId)).operation.receipt).toEqual(committed);
    expect(await Promise.all(["cinematic_stadium_content", "homepage_revamp_content", "cinematic_tickets_content"].map(digest))).toEqual(before);
    await rejects(() => save({ ...r, content: { ...r.content, heading: { ...r.content.heading, title: "Changed operation" } } }), "OPERATION_REUSED");
    await actor(USER_IDS.adminAal2);
    expect((await load(r.operationId)).operation.status).toBe("not-committed");
  });

  it("rejects a stale revision, a direct write in between, and a changed design without losing current content", async () => {
    const stale = await input();
    await save(await input());
    await rejects(() => save(stale), "VISITOR_PAGE_CHANGED");
    const another = await input();
    await db.query("reset role");
    await db.query("update onzio.cinematic_robinson_content set content=jsonb_set(content,'{heading,title}','\"Direct title\"') where club_id=$1", [clubId]);
    await actor();
    await rejects(() => save(another), "VISITOR_PAGE_CHANGED");
    expect((await load()).content.heading.title).toBe("Direct title");
    const current = await input();
    await design();
    await rejects(() => save(current), "DESIGN_CHANGED");
  });

  it.each([
    ["an unknown field", (c: Record<string, unknown>) => { c.clubId = randomUUID(); }],
    ["a number where text belongs", (c: Record<string, unknown>) => { (c.heading as Record<string, unknown>).title = 123; }],
    ["overlong text", (c: Record<string, unknown>) => { (c.story as Record<string, unknown>).quote = "x".repeat(4001); }],
    ["a text info value", (c: Record<string, unknown>) => { ((c.info as { rows: Record<string, unknown>[] }).rows[0]).available = "Limited"; }],
    ["two food steps", (c: Record<string, unknown>) => { (c.food as { steps: unknown[] }).steps.pop(); }],
    ["duplicate block IDs", (c: Record<string, unknown>) => { const blocks = (c.directions as { blocks: { id: string }[] }).blocks; blocks[1].id = blocks[0].id; }],
    ["an unsafe block ID", (c: Record<string, unknown>) => { (c.directions as { blocks: { id: string }[] }).blocks[0].id = "Parking Lot"; }],
    ["a non-object row", (c: Record<string, unknown>) => { (c.info as { rows: unknown[] }).rows[0] = "On-Site Parking"; }],
    ["an image URL", (c: Record<string, unknown>) => { (c.images as Record<string, Record<string, unknown>>).seating.assetId = "https://example.test/map.jpg"; }],
  ])("rejects %s in the save request without writing", async (_, change) => {
    const r = await input();
    change(r.content as unknown as Record<string, unknown>);
    await rejects(() => save(r), "INVALID_VISITOR_PAYLOAD");
    expect((await load()).content).toBeNull();
  });

  it("rejects malformed content from a direct writer without advancing revision", async () => {
    await save(await input());
    const before = await load();
    await rejects(() => db.query("update onzio.cinematic_robinson_content set content=jsonb_set(content,'{info,rows,0,available}','\"Limited\"') where club_id=$1", [clubId]), "INVALID_VISITOR_PAYLOAD");
    await rejects(() => db.query("update onzio.cinematic_robinson_content set content=content||'{\"food\":[]}' where club_id=$1", [clubId]), "INVALID_VISITOR_PAYLOAD");
    expect(await load()).toEqual(before);
  });

  it("denies another club's admin, other templates, and anonymous writes", async () => {
    await rejects(() => load(undefined, CLUB_IDS.bravo), "NOT_AUTHORIZED");
    await design(1);
    await rejects(() => load(), "PAGE_UNAVAILABLE");
    await db.query("reset role");
    await db.query("set local role anon");
    await rejects(() => db.query("insert into onzio.cinematic_robinson_content(club_id,content) values($1,$2::jsonb)", [clubId, JSON.stringify(emptyRobinsonContent())]), "permission denied");
  });

  it("accepts only this club's published homepage graphics and keeps referenced images from being retired", async () => {
    const id = await asset(), foreign = await asset(CLUB_IDS.bravo), shop = await asset(clubId, "shop"), r = await input();
    for (const wrong of [foreign, shop, randomUUID()]) {
      r.content.images.seating.assetId = wrong;
      await rejects(() => save(r), "INVALID_VISITOR_MEDIA");
    }
    r.content.images.seating.assetId = id;
    r.content.images.step2.assetId = id;
    const committed = await save(r);
    expect(committed.content.images.seating).toEqual({ assetId: id, alt: robinsonReferenceContent.images.seating.alt });
    expect(committed.media.map((m: { id: string }) => m.id)).toEqual([id]);
    await db.query("reset role");
    expect((await db.query("select seating_media_asset_id, step_2_media_asset_id, content#>'{images,seating}' as stored from onzio.cinematic_robinson_content where club_id=$1", [clubId])).rows[0])
      .toEqual({ seating_media_asset_id: id, step_2_media_asset_id: id, stored: { alt: robinsonReferenceContent.images.seating.alt } });
    expect((await db.query("select onzio_private.media_asset_has_references($1,$2,$3) as linked", [clubId, id, `${clubId}/homepage/${id}.png`])).rows[0].linked).toBe(true);
    await actor();
    const remove = await input((await load()).content);
    remove.content.images.seating.assetId = null;
    expect((await save(remove)).retiredMediaAssetIds).toEqual([]);
    const removeBoth = await input((await load()).content);
    removeBoth.content.images.step2.assetId = null;
    expect((await save(removeBoth)).retiredMediaAssetIds).toEqual([id]);
    await db.query("reset role");
    await db.query("update onzio.media_assets set status='orphaned',deleted_at=now() where id=$1", [id]);
    await actor();
    const retired = await input((await load()).content);
    retired.content.images.lockers.assetId = id;
    await rejects(() => save(retired), "INVALID_VISITOR_MEDIA");
  });
});
