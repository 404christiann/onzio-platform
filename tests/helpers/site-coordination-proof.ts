import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import { z } from "zod";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "./environment";

const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };
const bindingSchema = z.object({ key: z.string(), revision: z.number().int().positive() }).strict();
export const coordinationSnapshotSchema = z.object({
  generation: z.uuid(), members: z.array(z.uuid()), pointer: z.uuid().nullable(), previousDigest: z.string().nullable(),
  event: z.object({
    clubId: z.uuid(), id: z.uuid(), previousId: z.uuid().nullable(), digest: z.string().nullable(), legacyId: z.uuid().nullable(),
    documentId: z.uuid(), binding: bindingSchema.nullable(), platform: z.string().nullable(), lockHash: z.string().nullable(),
    bindingHash: z.string().nullable(), configuration: z.unknown(),
  }).strict().nullable(),
}).strict();
export type CoordinationSnapshot = z.infer<typeof coordinationSnapshotSchema>;
export const coordinationBinding = { key: "legacy/homepage-story/home-kit/full-hero/no-caption", revision: 1 };
export const coordinationDigests = { a: "a".repeat(64), b: "b".repeat(64) };

async function protectedFingerprint(db: Client) {
  const values = [];
  for (const table of ["onzio.clubs", "onzio.club_domains", "onzio.club_members", "onzio.homepage_hero_content", "onzio.homepage_story_section", "onzio.presentation_documents", "onzio.presentation_state", "onzio.audit_events", "onzio_private.homepage_revisions", "onzio_private.homepage_assignment_epochs", "onzio_private.homepage_save_receipts"]) {
    const column = table === "onzio.clubs" ? "id" : "club_id";
    values.push((await db.query(`select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) as data from ${table} t where ${column}=any($1::uuid[])`, [[CLUB_IDS.alpha, CLUB_IDS.bravo]])).rows[0].data);
  }
  return JSON.stringify(values);
}

export async function openCoordinationProof() {
  assertSafeTestEnvironment();
  const db = new Client(config);
  await db.connect();
  await db.query("set statement_timeout='8s'");
  const initial = await protectedFingerprint(db);
  const initialTrigger = (await db.query("select tgenabled from pg_trigger where tgrelid='onzio.presentation_documents'::regclass and tgname='presentation_documents_immutable'")).rows;
  assert.deepEqual(initialTrigger, [{ tgenabled: "O" }], "Presentation immutability must be enabled before local proof");
  const schema = `site_coordination_${randomUUID().replaceAll("-", "")}`;
  const clubId = randomUUID();
  const documents = { a: randomUUID(), b: randomUUID(), legacy: randomUUID() };
  const clients: Client[] = [];
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    try {
      const outcomes = await Promise.allSettled(clients.map(async client => {
        try { await client.query("rollback"); } finally { await client.end(); }
      }));
      assert(outcomes.every(outcome => outcome.status === "fulfilled"), "Coordination proof clients failed to close");
      await db.query("rollback");
      await db.query("begin");
      try {
        await db.query("lock table onzio.presentation_documents in access exclusive mode");
        await db.query(`drop schema if exists ${schema} cascade`);
        await db.query("delete from onzio.presentation_state where club_id=$1", [clubId]);
        await db.query("alter table onzio.presentation_documents disable trigger presentation_documents_immutable");
        await db.query("delete from onzio.presentation_documents where club_id=$1", [clubId]);
        await db.query("alter table onzio.presentation_documents enable trigger presentation_documents_immutable");
        for (const table of ["homepage_hero_content", "homepage_story_section", "club_domains", "club_members", "audit_events"]) {
          await db.query(`delete from onzio.${table} where club_id=$1`, [clubId]);
        }
        await db.query("delete from onzio.clubs where id=$1", [clubId]);
        assert.equal(await protectedFingerprint(db), initial, "Alpha/Bravo changed during coordination proof");
        await db.query("commit");
      } catch (error) { await db.query("rollback"); throw error; }
      assert.equal((await db.query("select count(*)::int as n from onzio.clubs where id=$1", [clubId])).rows[0].n, 0);
      assert.deepEqual((await db.query("select tgenabled from pg_trigger where tgrelid='onzio.presentation_documents'::regclass and tgname='presentation_documents_immutable'")).rows, initialTrigger);
    } finally { await db.end(); }
  }
  try {
    await db.query("begin");
    await db.query(`insert into onzio.clubs(id,slug,name,kind,lifecycle,public_access,tier,primary_color,secondary_color,store_enabled)
      select $1,$2,name,'test','active','live',tier,primary_color,secondary_color,store_enabled from onzio.clubs where id=$3`,
    [clubId, `site-proof-${clubId}`, CLUB_IDS.alpha]);
    await db.query("insert into onzio.club_members(club_id,user_id,role,status) values($1,$2,'owner','active')", [clubId, USER_IDS.ownerAal2]);
    await db.query(`insert into onzio.club_domains(club_id,hostname,is_primary,verified_at,environment,active)
      values($1,'pilot.localhost',true,now(),'production',true)`, [clubId]);
    for (const [version, id] of Object.values(documents).entries()) {
      await db.query(`insert into onzio.presentation_documents
        (id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
        select $1,$2,$3,d.schema_version,d.template_id,d.template_version,d.configuration,d.configuration_digest,$4
        from onzio.presentation_state s join onzio.presentation_documents d on d.club_id=s.club_id and d.id=s.published_document_id
        where s.club_id=$5 and d.template_id='academy' and d.template_version=1`,
      [id, clubId, version + 1, USER_IDS.ownerAal2, CLUB_IDS.alpha]);
      assert.equal((await db.query("select count(*)::int as n from onzio.presentation_documents where id=$1", [id])).rows[0].n, 1, "Alpha must have seeded Academy projection");
    }
    await db.query("insert into onzio.presentation_state(club_id,published_document_id,updated_by) values($1,$2,$3)", [clubId, documents.legacy, USER_IDS.ownerAal2]);
    for (const table of ["homepage_hero_content", "homepage_story_section"]) {
      await db.query(`insert into onzio.${table} select (jsonb_populate_record(null::onzio.${table},to_jsonb(t)||jsonb_build_object('club_id',$1::uuid))).*
        from onzio.${table} t where club_id=$2`, [clubId, CLUB_IDS.alpha]);
    }
    await db.query((await readFile(resolve("tests/fixtures/site-coordination/schema.sql"), "utf8")).replaceAll("PROOF_SCHEMA", schema));
    await db.query("commit");
    async function connection(role: "service_role" | "authenticated" | "anon" | "postgres" = "service_role") {
      assert(["service_role", "authenticated", "anon", "postgres"].includes(role), "Unsupported local proof role");
      const client = new Client(config);
      await client.connect(); clients.push(client);
      await client.query("set statement_timeout='8s'");
      await client.query(`set role ${role}`);
      return client;
    }
    async function snapshot(client = db, club: string = clubId) {
      return coordinationSnapshotSchema.parse((await client.query(`select ${schema}.snapshot($1) as data`, [club])).rows[0].data);
    }
    async function registerRelease(digest: string, document: string, client = db, club: string = clubId) {
      await client.query(`select ${schema}.register_release($1,$2,$3,$4,$5,$6,$7)`,
        [club, digest, document, coordinationBinding, "c".repeat(64), "d".repeat(64), "e".repeat(64)]);
    }
    async function registerWorker(digests: readonly string[], client = db, worker = randomUUID(), club: string = clubId) {
      await client.query(`select ${schema}.register_worker($1,$2)`, [worker, JSON.stringify(digests.map(digest => ({ clubId: club, digest, commitment: "f".repeat(64) })))]);
      return worker;
    }
    async function replaceFleet(expected: string, members: readonly string[], client = db) {
      return z.uuid().parse((await client.query(`select ${schema}.replace_fleet($1,$2) as data`, [expected, members])).rows[0].data);
    }
    async function transition(expected: string | null, generation: string, digest: string | null, client = db, action = "publish", legacy: string | null = null, club: string = clubId, actor: string = USER_IDS.ownerAal2) {
      return z.uuid().parse((await client.query(`select ${schema}.transition($1,$2,$3,$4,$5,$6,$7) as data`, [club, expected, generation, digest, legacy, actor, action])).rows[0].data);
    }
    return { db, schema, clubId, documents, connection, close, snapshot, registerRelease, registerWorker, replaceFleet, transition };
  } catch (error) { await close(); throw error; }
}
export type CoordinationProof = Awaited<ReturnType<typeof openCoordinationProof>>;
