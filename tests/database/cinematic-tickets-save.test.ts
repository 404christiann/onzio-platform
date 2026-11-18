import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localPostgresConfig } from "../helpers/local-postgres";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { emptyTicketsContent } from "@/lib/tickets-content";
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
async function load(operationId?: string, target: string = clubId) { return (await db.query("select onzio.load_tickets_editor($1,$2) as data", [target, operationId ?? null])).rows[0].data; }
async function input() { const s = await load(); return { operationId: randomUUID(), expectedRevision: s.revision, designRevision: s.designRevision, content: emptyTicketsContent(), retiredMediaAssetIds: [] }; }
async function save(request: unknown) { return (await db.query("select onzio.save_tickets_editor($1,$2::jsonb) as data", [clubId, JSON.stringify(request)])).rows[0].data; }
async function rejects(action: () => Promise<unknown>, message: string) { await db.query("savepoint expected_failure"); try {
    await expect(action()).rejects.toThrow(message);
}
finally {
    await db.query("rollback to savepoint expected_failure");
} }
async function asset(tenant: string = clubId) { await db.query("reset role"); const id = randomUUID(), path = tenant + "/homepage/" + id + ".png"; await db.query("insert into onzio.media_assets(id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,created_by,published_at) values($1,$2,'onzio-media',$3,'homepage','graphic','image/png',100,100,100,$4,'published',$5,now())", [id, tenant, path, "a".repeat(64), USER_IDS.ownerAal2]); await actor(); return id; }
beforeEach(async () => { assertSafeTestEnvironment(); db = new Client(localPostgresConfig()); await db.connect(); await db.query("begin"); await design(); });
afterEach(async () => { if (db) {
    await db.query("rollback");
    await db.end();
} });
describe("Tickets independent atomic saves", () => {
    it("saves, replays the exact actor receipt, and preserves Homepage/About", async () => {
        const before = (await db.query("select content from onzio.homepage_revamp_content where club_id=$1", [clubId])).rows;
        const r = await input();
        r.content.title = "Tickets edit";
        const committed = await save(r);
        expect(committed.content.title).toBe("Tickets edit");
        expect(committed.revision).toBe("1");
        expect(await save(r)).toEqual(committed);
        expect((await load(r.operationId)).operation.receipt).toEqual(committed);
        expect((await db.query("select content from onzio.homepage_revamp_content where club_id=$1", [clubId])).rows).toEqual(before);
        await rejects(() => save({ ...r, content: { ...r.content, title: "Changed operation" } }), "OPERATION_REUSED");
        await actor(USER_IDS.adminAal2);
        expect((await load(r.operationId)).operation.status).toBe("not-committed");
    });
    it("rejects stale revision, legacy writes, and changed presentation without losing current content", async () => {
        const stale = await input();
        await save(await input());
        await rejects(() => save(stale), "TICKETS_CHANGED");
        const another = await input();
        await db.query("reset role");
        await db.query("update onzio.cinematic_tickets_content set content=jsonb_set(content,'{title}','\"Legacy title\"') where club_id=$1", [clubId]);
        await actor();
        await rejects(() => save(another), "TICKETS_CHANGED");
        expect((await load()).content.title).toBe("Legacy title");
        const current = await input();
        await design();
        await rejects(() => save(current), "DESIGN_CHANGED");
    });
    it("rejects malformed content from a direct writer without advancing revision", async () => { await save(await input()); const before = await load(); await rejects(() => db.query("update onzio.cinematic_tickets_content set content=jsonb_set(content,'{purchaseUrl}','\"javascript:alert(1)\"') where club_id=$1", [clubId]), "INVALID_TICKETS_PAYLOAD"); expect(await load()).toEqual(before); });
    it("denies cross-tenant admin access and other templates", async () => { await rejects(() => load(undefined, CLUB_IDS.bravo), "NOT_AUTHORIZED"); await design(1); await rejects(() => load(), "PAGE_UNAVAILABLE"); });
    it.each([null, -1, true, {}, [], "abc", "1".repeat(21)])("rejects malformed revision %j", async (revision) => { const r = await input(); await rejects(() => save({ ...r, expectedRevision: revision }), "INVALID_TICKETS_PAYLOAD"); expect((await load()).content).toBeNull(); });
    it.each(["javascript:alert(1)", "//checkout.test", "https://user:pwd@checkout.test", "http://checkout.test", "https://127.0.0.1/"])("rejects unsafe purchase link %s", async (url) => { const r = await input(); r.content.purchaseUrl = url; await rejects(() => save(r), "INVALID_TICKETS_PAYLOAD"); expect((await load()).content).toBeNull(); });
    it("enforces composite tenant/published graphic ownership and reference-safe retirement", async () => {
        const id = await asset(), foreign = await asset(CLUB_IDS.bravo), r = await input();
        r.content.artwork.banner.assetId = foreign;
        await rejects(() => save(r), "INVALID_TICKETS_MEDIA");
        r.content.artwork.banner.assetId = id;
        await save(r);
        await db.query("reset role");
        expect((await db.query("select onzio_private.media_asset_has_references($1,$2,$3) as linked", [clubId, id, clubId + "/homepage/" + id + ".png"])).rows[0].linked).toBe(true);
        await actor();
        const remove = await input();
        remove.content = (await load()).content;
        remove.content.artwork.banner.assetId = null;
        expect((await save(remove)).retiredMediaAssetIds).toContain(id);
        await db.query("reset role");
        await db.query("update onzio.media_assets set status='orphaned',deleted_at=now() where id=$1", [id]);
        await actor();
        const retired = await input();
        retired.content.artwork.banner.assetId = id;
        await rejects(() => save(retired), "INVALID_TICKETS_MEDIA");
    });
});
