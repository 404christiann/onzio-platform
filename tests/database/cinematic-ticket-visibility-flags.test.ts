import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localPostgresConfig } from "../helpers/local-postgres";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { readFileSync } from "node:fs";
import { TICKET_VISIBILITY_KEYS } from "@/lib/tickets-content";
import { seasonMembershipReferenceContent } from "@/lib/ticket-pages-reference-content";
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
const rose = () => JSON.parse(readFileSync("assets/rose-city-tickets-2027/copy.json", "utf8"));
async function input(content: unknown = rose()) { const s = await load(); return { operationId: randomUUID(), expectedRevision: s.revision, designRevision: s.designRevision, content, retiredMediaAssetIds: [] as string[] }; }
async function save(request: unknown) { return (await db.query("select onzio.save_tickets_editor($1,$2::jsonb) as data", [clubId, JSON.stringify(request)])).rows[0].data; }
async function rejects(action: () => Promise<unknown>, message: string) { await db.query("savepoint expected_failure"); try {
    await expect(action()).rejects.toThrow(message);
}
finally {
    await db.query("rollback to savepoint expected_failure");
} }
beforeEach(async () => { assertSafeTestEnvironment(); db = new Client(localPostgresConfig()); await db.connect(); await db.query("begin"); await design(); });
afterEach(async () => { if (db) {
    await db.query("rollback");
    await db.end();
} });
async function loadPage(fn: string) { return (await db.query(`select onzio.load_${fn}_editor($1,null) as data`, [clubId])).rows[0].data; }
async function savePage(fn: string, content: unknown) { const s = await loadPage(fn); return (await db.query(`select onzio.save_${fn}_editor($1,$2::jsonb) as data`, [clubId, JSON.stringify({ operationId: randomUUID(), expectedRevision: s.revision, designRevision: s.designRevision, content, retiredMediaAssetIds: [] })])).rows[0].data; }
const season = () => structuredClone(seasonMembershipReferenceContent) as Record<string, Record<string, unknown>>;
const kbyg = async () => (await import("@/lib/ticket-pages-reference-content")).knowBeforeYouGoReferenceContent as unknown as Record<string, Record<string, unknown>>;

// RC-ADMIN-07: the real validators and Save/Load RPCs. Absent flag = unchanged behaviour; new flags are optional booleans.
describe("Tickets visibility flags (check_tickets_content, save/load RPC)", () => {
    it("saves the seeded Rose City payload unchanged and loads it back identical, with no flag injected", async () => {
        const r = await input();
        const saved = await save(r);
        expect(saved.content).toEqual(rose());
        const loaded = await load();
        expect(loaded.content).toEqual(rose());
        for (const key of TICKET_VISIBILITY_KEYS) { expect(loaded.content).not.toHaveProperty(key); expect((await db.query("select content ? $2 as has from onzio.cinematic_tickets_content where club_id=$1", [clubId, key])).rows[0].has).toBe(false); }
    });
    it("accepts every flag as true or false and returns it on load", async () => {
        const content = { ...rose(), ...Object.fromEntries(TICKET_VISIBILITY_KEYS.map((key, i) => [key, i % 2 === 0])) };
        await save(await input(content));
        expect((await load()).content).toEqual(content);
    });
    it.each(TICKET_VISIBILITY_KEYS)("rejects %s when it is not a boolean", async key => {
        for (const bad of ["false", 0, null]) await rejects(async () => save(await input({ ...rose(), [key]: bad })), "INVALID_TICKETS_PAYLOAD");
    });
    it("still rejects unknown keys, and applies the same rules to direct writes", async () => {
        await rejects(async () => save(await input({ ...rose(), perksHidden: true })), "INVALID_HOMEPAGE_PAYLOAD");
        await save(await input());
        await db.query("reset role");
        await db.query("update onzio.cinematic_tickets_content set content=content||'{\"perksVisible\":false}' where club_id=$1", [clubId]);
        await db.query("savepoint direct_bad");
        await expect(db.query("update onzio.cinematic_tickets_content set content=content||'{\"perksVisible\":\"no\"}' where club_id=$1", [clubId])).rejects.toThrow("INVALID_TICKETS_PAYLOAD");
        await db.query("rollback to savepoint direct_bad");
        await db.query("savepoint direct_unknown");
        await expect(db.query("update onzio.cinematic_tickets_content set content=content||'{\"perksHidden\":true}' where club_id=$1", [clubId])).rejects.toThrow();
        await db.query("rollback to savepoint direct_unknown");
    });
});
describe("Season Membership visibility flags (check_ticket_page_content, save/load RPC)", () => {
    it("saves the reference payload unchanged and loads it back identical, with no flag injected", async () => {
        const saved = await savePage("season_membership", season());
        expect(saved.content).toEqual(season());
        const loaded = await loadPage("season_membership");
        expect(loaded.content).toEqual(season());
        for (const part of ["heading", "intro", "button"]) expect(loaded.content[part]).not.toHaveProperty("visible");
    });
    it("accepts heading, intro and button visible as true or false", async () => {
        const content = season();
        content.heading.visible = false; content.intro.visible = true; content.button.visible = false;
        await savePage("season_membership", content);
        const loaded = (await loadPage("season_membership")).content;
        expect(loaded.heading.visible).toBe(false); expect(loaded.intro.visible).toBe(true); expect(loaded.button.visible).toBe(false);
    });
    it.each(["heading", "intro", "button"])("rejects %s.visible when it is not a boolean, and unknown keys in the same object", async part => {
        for (const bad of ["false", 0, null]) { const content = season(); content[part].visible = bad; await rejects(() => savePage("season_membership", content), "INVALID_VISITOR_PAYLOAD"); }
        const content = season(); content[part].hidden = true; await rejects(() => savePage("season_membership", content), "INVALID_VISITOR_PAYLOAD");
    });
    it("does not add the flags to Know Before You Go", async () => {
        const content = await kbyg();
        await savePage("know_before_you_go", structuredClone(content));
        const bad = structuredClone(content); bad.heading.visible = false;
        await rejects(() => savePage("know_before_you_go", bad), "INVALID_VISITOR_PAYLOAD");
    });
});
