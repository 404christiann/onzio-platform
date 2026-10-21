import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { homepageHeroSchema, type HomepageSaveRequest } from "@/lib/homepage-editor/contract";
import { homepageRendererForClub, resolveHomepageBindings, resolveHomepageCapabilities } from "@/lib/homepage-editor/capabilities";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";

const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };
const identity = z.object({ key: z.string(), revision: z.number().int().positive() });
const snapshot = z.object({
  revision: z.string(), designRevision: z.string(),
  design: z.object({ designRevision: z.string(), binding: identity.optional() }).passthrough(),
  content: z.object({ hero: homepageHeroSchema }).passthrough(),
}).passthrough();
type Snapshot = z.infer<typeof snapshot>;

async function connect() {
  assertSafeTestEnvironment();
  const db = new Client(config);
  await db.connect();
  await db.query("set statement_timeout='8s'");
  return db;
}
async function actor(db: Client, userId: string = USER_IDS.ownerAal2) {
  await db.query("reset role");
  const second = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({
    sub: userId, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second }],
  })]);
  await db.query("set local role authenticated");
}
async function load(db: Client, clubId: string) {
  return snapshot.parse((await db.query("select onzio.load_homepage($1) as data", [clubId])).rows[0].data);
}
function request(before: Snapshot, intro = "Assignment-aware content"): HomepageSaveRequest {
  return { operationId: randomUUID(), expectedRevision: before.revision, designRevision: before.designRevision, sections: { hero: { intro } } };
}
async function save(db: Client, clubId: string, payload: HomepageSaveRequest) {
  return snapshot.parse((await db.query("select onzio.save_homepage($1,$2) as data", [clubId, payload])).rows[0].data);
}
async function document(db: Client, clubId: string, template = "academy") {
  const id = randomUUID();
  await db.query("reset role");
  await db.query(`insert into onzio.presentation_documents
    (id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
    values($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,$3,1,$4,$5,$6)`,
  [id, clubId, template, { schemaVersion: 1, template: { id: template, version: 1 } }, "a".repeat(64), USER_IDS.ownerAal2]);
  return id;
}
async function point(db: Client, clubId: string, id: string) {
  await db.query("reset role");
  await db.query(`insert into onzio.presentation_state(club_id,published_document_id,updated_by)
    values($1,$2,$3) on conflict(club_id) do update set published_document_id=excluded.published_document_id`,
  [clubId, id, USER_IDS.ownerAal2]);
  await actor(db);
}
async function fail(db: Client, action: () => Promise<unknown>, message: string, code?: string) {
  await db.query("savepoint expected_failure");
  try { await expect(action()).rejects.toMatchObject({ message: expect.stringContaining(message), ...(code ? { code } : {}) }); }
  finally { await db.query("rollback to savepoint expected_failure"); }
}
async function fingerprint(db: Client, clubId: string) {
  await db.query("reset role");
  return (await db.query(`select
    (select to_jsonb(h) from onzio.homepage_hero_content h where club_id=$1) as hero,
    (select to_jsonb(r) from onzio_private.homepage_revisions r where club_id=$1) as revision,
    (select jsonb_agg(to_jsonb(r) order by operation_id) from onzio_private.homepage_save_receipts r where club_id=$1) as receipts,
    (select jsonb_agg(to_jsonb(a) order by id) from onzio.audit_events a where club_id=$1) as audit`, [clubId])).rows[0];
}
async function otherTokens(db: Client, clubId: string) {
  return (await db.query(`select
    onzio_private.shop_page_snapshot($1,'home')->>'designRevision' as shop,
    onzio_private.about_editor_snapshot($1,'about')->>'designRevision' as about,
    onzio_private.about_editor_snapshot($1,'logo')->>'designRevision' as logo`, [clubId])).rows[0];
}

async function definition(db: Client, signature: string) {
  await db.query("reset role");
  return z.string().parse((await db.query("select pg_get_functiondef($1::regprocedure) as source", [signature])).rows[0].source);
}
async function bindingRevision(db: Client) {
  const source = await definition(db, "onzio_private.homepage_binding_identity(jsonb)");
  expect(source).toContain("'revision',1");
  await db.query(source.replace("'revision',1", "'revision',2"));
  await actor(db);
}

describe("homepage assignment freshness", () => {
  let db: Client;
  let a: string, b: string;
  const club = CLUB_IDS.alpha;
  beforeEach(async () => {
    db = await connect();
    await db.query("begin");
    a = await document(db, club);
    b = await document(db, club, "cinematic");
    await point(db, club, a);
  });
  afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

  it.each(["pointer", "null", "delete", "slug"])("rejects %s ABA without any save side effects", async change => {
    const before = await load(db, club);
    const unchangedOtherTokens = await otherTokens(db, club);
    await db.query("reset role");
    const legacy = (await db.query("select onzio_private.homepage_design($1) as data", [club])).rows[0].data;
    if (change === "pointer") { await point(db, club, b); await point(db, club, a); }
    if (change === "null") {
      await db.query("update onzio.presentation_state set draft_document_id=$2,published_document_id=null where club_id=$1", [club, a]);
      await point(db, club, a);
    }
    if (change === "delete") {
      await db.query("delete from onzio.presentation_state where club_id=$1", [club]);
      await point(db, club, a);
    }
    if (change === "slug") {
      await db.query("update onzio.clubs set slug=slug||'-aba' where id=$1", [club]);
      await db.query("update onzio.clubs set slug=left(slug,length(slug)-4) where id=$1", [club]);
    }
    await actor(db);
    const current = await load(db, club);
    expect(current.revision).toBe(before.revision);
    expect(current.designRevision).not.toBe(before.designRevision);
    expect(current.design.designRevision).toBe(current.designRevision);
    expect(await otherTokens(db, club)).toEqual(unchangedOtherTokens);
    expect((await db.query("select onzio_private.homepage_design($1) as data", [club])).rows[0].data).toEqual(legacy);
    const untouched = await fingerprint(db, club);
    await actor(db);
    await fail(db, () => save(db, club, request(before)), "DESIGN_CHANGED", "PT409");
    expect(await fingerprint(db, club)).toEqual(untouched);
  });

  it("preserves no-op, draft-only, non-slug, and rolled-back transitions", async () => {
    const before = await load(db, club);
    await db.query("reset role");
    await db.query("update onzio.presentation_state set published_document_id=published_document_id,draft_document_id=$2 where club_id=$1", [club, b]);
    await db.query("update onzio.clubs set slug=slug,name=name where id=$1", [club]);
    await document(db, club, "heritage");
    await db.query("savepoint transition");
    await point(db, club, b);
    await db.query("rollback to savepoint transition");
    await actor(db);
    expect(await load(db, club)).toEqual(before);
    await save(db, club, request(before));
  });

  it("advances for a fallback document while leaving a different tenant unchanged", async () => {
    await db.query("reset role");
    await db.query("delete from onzio.presentation_state where club_id=$1", [club]);
    await actor(db);
    const before = await load(db, club);
    await db.query("reset role");
    const otherEpoch = (await db.query("select epoch from onzio_private.homepage_assignment_epochs where club_id=$1", [CLUB_IDS.bravo])).rows;
    const epoch = (await db.query("select epoch from onzio_private.homepage_assignment_epochs where club_id=$1", [club])).rows[0].epoch;
    await document(db, club, "editorial");
    expect((await db.query("select epoch from onzio_private.homepage_assignment_epochs where club_id=$1", [club])).rows[0].epoch).not.toBe(epoch);
    expect((await db.query("select epoch from onzio_private.homepage_assignment_epochs where club_id=$1", [CLUB_IDS.bravo])).rows).toEqual(otherEpoch);
    await actor(db);
    expect((await load(db, club)).revision).toBe(before.revision);
    await fail(db, () => save(db, club, request(before)), "DESIGN_CHANGED", "PT409");
  });

  it("fails closed on missing epochs and rolls back a real transition", async () => {
    const payload = request(await load(db, club));
    await db.query("reset role");
    await db.query("delete from onzio_private.homepage_assignment_epochs where club_id=$1", [club]);
    await actor(db);
    await fail(db, () => load(db, club), "HOMEPAGE_ASSIGNMENT_UNAVAILABLE");
    await fail(db, () => save(db, club, payload), "HOMEPAGE_ASSIGNMENT_UNAVAILABLE");
    await db.query("reset role");
    await fail(db, () => db.query("update onzio.presentation_state set published_document_id=$2 where club_id=$1", [club, b]), "HOMEPAGE_ASSIGNMENT_UNAVAILABLE");
    expect((await db.query("select published_document_id from onzio.presentation_state where club_id=$1", [club])).rows).toEqual([{ published_document_id: a }]);
  });

  it("keeps private epochs inaccessible and normal service-role transitions working", async () => {
    await db.query("reset role");
    expect((await db.query("select relrowsecurity from pg_class where oid='onzio_private.homepage_assignment_epochs'::regclass")).rows).toEqual([{ relrowsecurity: true }]);
    for (const role of ["anon", "authenticated", "service_role"]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
        expect((await db.query("select has_table_privilege($1,'onzio_private.homepage_assignment_epochs',$2) as allowed", [role, privilege])).rows[0].allowed).toBe(false);
      }
      expect((await db.query("select has_function_privilege($1,'onzio_private.advance_homepage_assignment_epoch()','EXECUTE') as allowed", [role])).rows[0].allowed).toBe(false);
      await db.query(`set local role ${role}`);
      await fail(db, () => db.query("select * from onzio_private.homepage_assignment_epochs"), "permission denied");
      await fail(db, () => db.query("update onzio_private.homepage_assignment_epochs set epoch=gen_random_uuid() where club_id=$1", [club]), "permission denied");
      await db.query("reset role");
    }
    await actor(db);
    const before = await load(db, club);
    await db.query("reset role");
    await db.query("set local role service_role");
    await db.query("update onzio.presentation_state set published_document_id=$2 where club_id=$1", [club, b]);
    await actor(db);
    expect((await load(db, club)).designRevision).not.toBe(before.designRevision);
    await fail(db, () => db.query("select onzio_private.homepage_save_design($1)", [CLUB_IDS.bravo]), "NOT_AUTHORIZED");
    await db.query("reset role");
    const epochs = (await db.query("select * from onzio_private.homepage_assignment_epochs where club_id=any($1::uuid[]) order by club_id", [[club, CLUB_IDS.bravo]])).rows;
    await fail(db, () => db.query(`insert into onzio.presentation_state(club_id,published_document_id,updated_by)
      values($1,$2,$3) on conflict(club_id) do update set published_document_id=excluded.published_document_id`,
    [CLUB_IDS.bravo, a, USER_IDS.ownerAal2]), "foreign key");
    expect((await db.query("select * from onzio_private.homepage_assignment_epochs where club_id=any($1::uuid[]) order by club_id", [[club, CLUB_IDS.bravo]])).rows).toEqual(epochs);
  });

  it("initializes clubs without documents and advances both clubs on state reparenting", async () => {
    await db.query("reset role");
    expect((await db.query("select count(*)::int as n from onzio.clubs c left join onzio_private.homepage_assignment_epochs e on e.club_id=c.id where e.club_id is null")).rows[0].n).toBe(0);
    const newClub = randomUUID();
    await db.query("insert into onzio.clubs(id,slug,name,kind,lifecycle,public_access) values($1,$2,'New assignment club','test','active','live')", [newClub, `assignment-${newClub}`]);
    await db.query("insert into onzio.club_members(club_id,user_id,role,status) values($1,$2,'owner','active')", [newClub, USER_IDS.ownerAal2]);
    await actor(db);
    const empty = await load(db, newClub);
    expect(empty.design.binding).toEqual({ key: "legacy/video/home-kit/full-hero/no-caption", revision: 1 });
    const draft = await document(db, newClub);
    await db.query("update onzio.presentation_state set draft_document_id=$2,published_document_id=null where club_id=$1", [club, a]);
    const epochs = (await db.query("select * from onzio_private.homepage_assignment_epochs where club_id=any($1::uuid[]) order by club_id", [[club, newClub]])).rows;
    await db.query("update onzio.presentation_state set club_id=$2,draft_document_id=$3 where club_id=$1", [club, newClub, draft]);
    const after = (await db.query("select * from onzio_private.homepage_assignment_epochs where club_id=any($1::uuid[]) order by club_id", [[club, newClub]])).rows;
    expect(after).toHaveLength(2);
    for (let i = 0; i < after.length; i++) expect(after[i].epoch).not.toBe(epochs[i].epoch);
    await db.query("delete from onzio.presentation_state where club_id=$1", [newClub]);
    const purge = randomUUID();
    await db.query("insert into onzio.clubs(id,slug,name,kind,lifecycle,public_access) values($1,$2,'Purge test','test','active','live')", [purge, `assignment-${purge}`]);
    const purgeDocument = await document(db, purge);
    await point(db, purge, purgeDocument);
    await db.query("reset role");
    await db.query("alter table onzio.presentation_documents disable trigger presentation_documents_immutable");
    await db.query("delete from onzio.clubs where id=$1", [purge]);
    await db.query("alter table onzio.presentation_documents enable trigger presentation_documents_immutable");
    expect((await db.query("select * from onzio_private.homepage_assignment_epochs where club_id=$1", [purge])).rows).toEqual([]);
  });

  it("binds only homepage freshness to semantic revision and preserves exact receipts", async () => {
    const before = await load(db, club);
    const payload = request(before);
    const receipt = await save(db, club, payload);
    const oldTokens = await otherTokens(db, club);
    await bindingRevision(db);
    const current = await load(db, club);
    expect(current.revision).toBe(receipt.revision);
    expect(current.designRevision).not.toBe(receipt.designRevision);
    expect(current.design.binding?.revision).toBe(2);
    expect(await otherTokens(db, club)).toEqual(oldTokens);
    await fail(db, () => save(db, club, { ...payload, operationId: randomUUID() }), "DESIGN_CHANGED", "PT409");
    expect(await save(db, club, payload)).toEqual(receipt);
    await fail(db, () => save(db, club, { ...payload, designRevision: current.designRevision }), "OPERATION_REUSED");
    await db.query("reset role");
    await fail(db, () => db.query("select onzio_private.homepage_binding_identity($1)", [{ templateKey: "unknown@1", heroVariant: "editable", slideshowVariant: "matchday" }]), "INVALID_HOMEPAGE_BINDING");
    await db.query(`create or replace function onzio_private.homepage_binding_identity(p_design jsonb) returns jsonb
      language sql immutable security definer set search_path='' as $$ select null::jsonb $$`);
    await actor(db);
    await fail(db, () => save(db, club, request(current)), "INVALID_HOMEPAGE_BINDING");
    expect(await save(db, club, payload)).toEqual(receipt);
    await db.query("reset role");
    await fail(db, () => db.query("select onzio_private.homepage_design($1)", [CLUB_IDS.bravo]), "NOT_AUTHORIZED");
  });

  it.each([null, "academy@1", "editorial@1", "clubhouse@1", "cinematic@1", "heritage@1"] as const)("matches PR25 binding identity for trusted %s contexts", async templateKey => {
    for (const slug of ["alpha", "rose-city"]) {
      await db.query("savepoint parity_case");
      try {
        await db.query("reset role");
        await db.query("delete from onzio.presentation_state where club_id=$1", [club]);
        let parityClub: string = club;
        if (templateKey === null) {
          parityClub = randomUUID();
          await db.query("insert into onzio.clubs(id,slug,name,kind,lifecycle,public_access) values($1,$2,'Legacy parity','test','active','live')", [parityClub, `parity-${parityClub}`]);
          await db.query("insert into onzio.club_members(club_id,user_id,role,status) values($1,$2,'owner','active')", [parityClub, USER_IDS.ownerAal2]);
        } else {
          await point(db, club, await document(db, club, templateKey.split("@")[0]));
        }
        await db.query("reset role");
        await db.query("update onzio.clubs set slug=slug||'-parity' where slug=$1 and id<>$2", [slug, parityClub]);
        await db.query("update onzio.clubs set slug=$2 where id=$1", [parityClub, slug]);
        await actor(db);
        const current = await load(db, parityClub);
        const expected = resolveHomepageBindings({ capabilities: resolveHomepageCapabilities(homepageRendererForClub({ presentationTemplateKey: templateKey, slug })) });
        expect(current.design.binding).toEqual({ key: expected.key, revision: expected.revision });
        expect(current.designRevision.length).toBeLessThanOrEqual(200);
      } finally { await db.query("rollback to savepoint parity_case"); }
    }
  });
});
