import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localPostgresConfig } from "../helpers/local-postgres";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { starterCinematicContactContent } from "@/lib/cinematic-contact-content";

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
  await db.query("insert into onzio.presentation_documents(id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by) values($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,'cinematic',$3,$4,$5,$6)", [id, clubId, version, JSON.stringify({ schemaVersion: 1, template: { id: "cinematic", version }, navigation: { groups: [{ routes: ["home", "contact"] }] } }), "a".repeat(64), USER_IDS.ownerAal2]);
  await db.query("insert into onzio.presentation_state(club_id,published_document_id,updated_by) values($1,$2,$3) on conflict(club_id) do update set published_document_id=$2", [clubId, id, USER_IDS.ownerAal2]);
  await actor();
}

async function load(operationId?: string, target: string = clubId) {
  return (await db.query("select onzio.load_cinematic_contact_editor($1,$2) as data", [target, operationId ?? null])).rows[0].data;
}
async function input() {
  const snapshot = await load();
  return { operationId: randomUUID(), expectedRevision: snapshot.revision, designRevision: snapshot.designRevision, content: starterCinematicContactContent() };
}
async function save(request: unknown) {
  return (await db.query("select onzio.save_cinematic_contact_editor($1,$2::jsonb) as data", [clubId, JSON.stringify(request)])).rows[0].data;
}
async function rejects(action: () => Promise<unknown>, message: string) {
  await db.query("savepoint expected_failure");
  try { await expect(action()).rejects.toThrow(message); }
  finally { await db.query("rollback to savepoint expected_failure"); }
}

beforeEach(async () => { assertSafeTestEnvironment(); db = new Client(localPostgresConfig()); await db.connect(); await db.query("begin"); await design(); });
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("cinematic Contact independent atomic save", () => {
  it("saves, survives reload and replays only the same actor's receipt", async () => {
    const homepage = (await db.query("select content from onzio.homepage_revamp_content where club_id=$1", [clubId])).rows;
    const request = await input();
    request.content.subtitle = "Owner saved subtitle";
    const committed = await save(request);
    expect(committed.content.subtitle).toBe("Owner saved subtitle");
    expect((await load()).content.subtitle).toBe("Owner saved subtitle");
    expect(await save(request)).toEqual(committed);
    expect((await load(request.operationId)).operation.receipt).toEqual(committed);
    expect((await db.query("select content from onzio.homepage_revamp_content where club_id=$1", [clubId])).rows).toEqual(homepage);
    await rejects(() => save({ ...request, content: { ...request.content, subtitle: "Reused operation" } }), "OPERATION_REUSED");
    await actor(USER_IDS.adminAal2);
    expect((await load(request.operationId)).operation.status).toBe("not-committed");
  });
  it("rejects stale saves, direct invalid links and changed presentation", async () => {
    const stale = await input();
    await save(await input());
    await rejects(() => save(stale), "CINEMATIC_CONTACT_CHANGED");
    const before = await load();
    await rejects(() => db.query("update onzio.cinematic_contact_content set content=jsonb_set(content,'{informationHref}','\"javascript:alert(1)\"') where club_id=$1", [clubId]), "INVALID_CINEMATIC_CONTACT_PAYLOAD");
    expect(await load()).toEqual(before);
    const current = await input();
    await design();
    await rejects(() => save(current), "DESIGN_CHANGED");
  });
  it("saves an owner-supplied Information destination independently", async () => {
    const request = await input();
    request.content.informationHref = "mailto:synthetic@example.test";
    const committed = await save(request);
    expect(committed.content.informationHref).toBe("mailto:synthetic@example.test");
    expect((await load()).content.informationHref).toBe("mailto:synthetic@example.test");
  });
  it("rejects unsafe destinations and malformed fixed-row content", async () => {
    const request = await input();
    for (const href of ["javascript:alert(1)", "//example.com", "http://example.com", "https://user:pass@example.com"]) {
      await rejects(() => save({ ...request, content: { ...request.content, informationHref: href } }), "INVALID_CINEMATIC_CONTACT_PAYLOAD");
    }
    const { media, ...missing } = request.content.rows;
    await rejects(() => save({ ...request, content: { ...request.content, rows: missing } }), "INVALID_CINEMATIC_CONTACT_PAYLOAD");
    expect((await load()).content).toBeNull();
    expect(media.prompt).toBe("Media inquiries");
  });
  it("denies another tenant and a different template", async () => {
    await rejects(() => load(undefined, CLUB_IDS.bravo), "NOT_AUTHORIZED");
    await design(1);
    await rejects(() => load(), "PAGE_UNAVAILABLE");
  });
});
