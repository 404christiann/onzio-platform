import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localPostgresConfig } from "../helpers/local-postgres";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { starterCinematicPolicyContent, type CinematicPolicyContent } from "@/lib/cinematic-policies-content";

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
  await db.query("insert into onzio.presentation_documents(id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by) values($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,'cinematic',$3,$4,$5,$6)", [id, clubId, version, JSON.stringify({ schemaVersion: 1, template: { id: "cinematic", version }, navigation: { groups: [{ routes: ["home"] }] } }), "a".repeat(64), USER_IDS.ownerAal2]);
  await db.query("insert into onzio.presentation_state(club_id,published_document_id,updated_by) values($1,$2,$3) on conflict(club_id) do update set published_document_id=$2", [clubId, id, USER_IDS.ownerAal2]);
  await actor();
}

async function load(operationId?: string, target: string = clubId) {
  return (await db.query("select onzio.load_cinematic_policy_editor($1,$2) as data", [target, operationId ?? null])).rows[0].data;
}
function withSamRows(): CinematicPolicyContent {
  const content = starterCinematicPolicyContent();
  content.guidelines.rows = [
    { id: "accessibility", heading: "Accessibility", blocks: [{ kind: "subheading", text: "Parking" }, { kind: "paragraph", text: "ADA parking is located within Robinson Stadium." }] },
    { id: "bags", heading: "Bags & Backpacks", blocks: [] },
  ];
  return content;
}
async function input(content: CinematicPolicyContent = withSamRows()) {
  const snapshot = await load();
  return { operationId: randomUUID(), expectedRevision: snapshot.revision, designRevision: snapshot.designRevision, content };
}
async function save(request: unknown) {
  return (await db.query("select onzio.save_cinematic_policy_editor($1,$2::jsonb) as data", [clubId, JSON.stringify(request)])).rows[0].data;
}
async function rejects(action: () => Promise<unknown>, message: string) {
  await db.query("savepoint expected_failure");
  try { await expect(action()).rejects.toThrow(message); }
  finally { await db.query("rollback to savepoint expected_failure"); }
}
const invalidPage = (change: Record<string, unknown>) => ({ ...withSamRows(), guidelines: { ...withSamRows().guidelines, ...change } });

beforeEach(async () => { assertSafeTestEnvironment(); db = new Client({ ...localPostgresConfig() }); await db.connect(); await db.query("begin"); await design(); });
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("cinematic policy pages atomic save", () => {
  it("starts empty, saves both pages together, survives reload and replays only the same actor's receipt", async () => {
    expect((await load()).content).toBeNull();
    const homepage = (await db.query("select content from onzio.homepage_revamp_content where club_id=$1", [clubId])).rows;
    const request = await input();
    request.content.fanCode.subtitle = "Owner red line";
    const committed = await save(request);
    expect(committed.content).toEqual(request.content);
    expect((await load()).content).toEqual(request.content);
    expect(await save(request)).toEqual(committed);
    expect((await load(request.operationId)).operation.receipt).toEqual(committed);
    expect((await db.query("select content from onzio.homepage_revamp_content where club_id=$1", [clubId])).rows).toEqual(homepage);
    await rejects(() => save({ ...request, content: starterCinematicPolicyContent() }), "OPERATION_REUSED");
    await actor(USER_IDS.adminAal2);
    expect((await load(request.operationId)).operation.status).toBe("not-committed");
  });
  it("lets the public read saved policies", async () => {
    await save(await input());
    await db.query("reset role");
    await db.query("set local role anon");
    const rows = (await db.query("select content from onzio.cinematic_policy_content where club_id=$1", [clubId])).rows;
    expect(rows[0].content.guidelines.rows[0].heading).toBe("Accessibility");
  });
  it("rejects a stale save and a changed website design", async () => {
    const stale = await input();
    await save(await input());
    await rejects(() => save(stale), "CINEMATIC_POLICY_CHANGED");
    const current = await input();
    await design();
    await rejects(() => save(current), "DESIGN_CHANGED");
  });
  it("rejects content the editor's rules reject, through the save and through a direct table write", async () => {
    const request = await input();
    const rows = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `row-${i}`, heading: `Row ${i}`, blocks: [] }));
    for (const content of [
      invalidPage({ title: " " }),
      invalidPage({ rows: rows(31) }),
      invalidPage({ rows: [{ id: "a", heading: "  ", blocks: [] }] }),
      invalidPage({ rows: [{ id: "a", heading: "A", blocks: Array.from({ length: 13 }, () => ({ kind: "paragraph", text: "Line" })) }] }),
      invalidPage({ rows: [{ id: "a", heading: "A", blocks: [{ kind: "paragraph", text: "\n " }] }] }),
      invalidPage({ rows: [{ id: "a", heading: "A", blocks: [{ kind: "html", text: "<b>x</b>" }] }] }),
      invalidPage({ rows: [{ id: "a", heading: "A", blocks: [{ kind: "subheading", text: "x".repeat(161) }] }] }),
      invalidPage({ rows: [{ id: "a", heading: "A", blocks: [] }, { id: "a", heading: "B", blocks: [] }] }),
      invalidPage({ rows: [{ id: "Not An Id", heading: "A", blocks: [] }] }),
      invalidPage({ extra: true }),
      { guidelines: withSamRows().guidelines },
    ]) await rejects(() => save({ ...request, content }), "INVALID_CINEMATIC_POLICY_PAYLOAD");
    expect((await load()).content).toBeNull();
    await save(await input());
    await rejects(() => db.query("update onzio.cinematic_policy_content set content=jsonb_set(content,'{fanCode,title}','\"\"') where club_id=$1", [clubId]), "INVALID_CINEMATIC_POLICY_PAYLOAD");
  });
  it("accepts a page at its limits: 30 rows, 12 answer lines and a 2,000-character paragraph", async () => {
    const content = withSamRows();
    content.guidelines.rows = Array.from({ length: 30 }, (_, i) => ({ id: `row-${i}`, heading: `Row ${i}`, blocks: i ? [] : Array.from({ length: 12 }, () => ({ kind: "paragraph" as const, text: "x".repeat(2000) })) }));
    expect((await save(await input(content))).content.guidelines.rows).toHaveLength(30);
  });
  it("denies another club and a different website design", async () => {
    await rejects(() => load(undefined, CLUB_IDS.bravo), "NOT_AUTHORIZED");
    await design(1);
    await rejects(() => load(), "PAGE_UNAVAILABLE");
  });
});
