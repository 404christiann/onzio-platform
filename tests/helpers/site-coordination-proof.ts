import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";
import { Client } from "pg";
import { z } from "zod";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { academyTenantFingerprint, academySchemaFingerprint, populateAcademyContent, removeAcademyContent } from "./academy-coordination-content";
import type { AcademyProofParameters } from "../../scripts/pilot-academy-documents";
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
  let initial: string;
  let initialTrigger: { tgenabled: string }[];
  try {
    await db.query("set statement_timeout='8s'");
    initial = await protectedFingerprint(db);
    initialTrigger = (await db.query("select tgenabled from pg_trigger where tgrelid='onzio.presentation_documents'::regclass and tgname='presentation_documents_immutable'")).rows;
    assert.deepEqual(initialTrigger, [{ tgenabled: "O" }], "Presentation immutability must be enabled before local proof");
  } catch (error) {
    await db.end();
    throw error;
  }
  const schema = `site_coordination_${randomUUID().replaceAll("-", "")}`;
  const clubId = randomUUID();
  const documents = { a: randomUUID(), b: randomUUID(), legacy: randomUUID() };
  const clients: Client[] = [];
  const journalDirectory = await mkdtemp(join(tmpdir(), "onzio-academy-proof-")).catch(async error => { await db.end(); throw error; });
  const recoveryFile = join(journalDirectory, "recovery.json");
  let lifecycle: "open" | "cleaning" | "cleanup-failed" | "closed" = "open";
  let cleanup: Promise<void> | undefined;
  let dbClosed = false;
  let fullParameters: AcademyProofParameters | undefined;
  let fullInitial: { clubs: string[]; fingerprint: Awaited<ReturnType<typeof academyTenantFingerprint>>; schema: string } | undefined;
  const journal = (stage: string) => writeFile(recoveryFile, `${JSON.stringify({ version: 1, clubId, schema, documents, stage }, null, 2)}\n`, { mode: 0o600 });
  await writeFile(recoveryFile, `${JSON.stringify({ version: 1, clubId, schema, documents, stage: "prepared" }, null, 2)}\n`, { mode: 0o600, flag: "wx" }).catch(async error => { await db.end(); throw error; });
  async function close(): Promise<void> {
    if (lifecycle === "closed") return;
    if (cleanup) return cleanup;
    lifecycle = "cleaning";
    cleanup = (async () => {
      await journal("cleaning");
      const closingClients = [...clients];
      const outcomes = await Promise.allSettled(closingClients.map(async client => {
        await client.query("rollback").catch(() => undefined);
        await client.end();
      }));
      outcomes.forEach((outcome, index) => {
        if (outcome.status === "fulfilled") clients.splice(clients.indexOf(closingClients[index]), 1);
      });
      if (!dbClosed) {
        try { await db.query("rollback"); } finally { await db.end(); dbClosed = true; }
      }
      assert(outcomes.every(outcome => outcome.status === "fulfilled"), "Coordination proof clients failed to close");
      const cleanupDb = new Client(config);
      try {
        await cleanupDb.connect();
        await cleanupDb.query("set statement_timeout='8s'");
        await cleanupDb.query("begin");
        try {
          await cleanupDb.query("lock table onzio.presentation_documents in access exclusive mode");
          await cleanupDb.query(`drop schema if exists ${schema} cascade`);
          await removeAcademyContent(cleanupDb, clubId);
          await cleanupDb.query("delete from onzio.presentation_state where club_id=$1", [clubId]);
          await cleanupDb.query("alter table onzio.presentation_documents disable trigger presentation_documents_immutable");
          await cleanupDb.query("delete from onzio.presentation_documents where club_id=$1", [clubId]);
          await cleanupDb.query("alter table onzio.presentation_documents enable trigger presentation_documents_immutable");
          for (const table of ["homepage_hero_content", "homepage_story_section", "club_domains", "club_members", "audit_events"]) {
            await cleanupDb.query(`delete from onzio.${table} where club_id=$1`, [clubId]);
          }
          await cleanupDb.query("delete from onzio.clubs where id=$1", [clubId]);
          assert.equal(await protectedFingerprint(cleanupDb), initial, "Alpha/Bravo changed during coordination proof");
          if (fullInitial) {
            assert.deepEqual(await academyTenantFingerprint(cleanupDb, fullInitial.clubs, true), fullInitial.fingerprint, "Unrelated tenant state changed during full-site proof");
            assert.equal(await academySchemaFingerprint(cleanupDb, schema), fullInitial.schema, "Application schema changed during full-site proof");
          }
          await cleanupDb.query("commit");
        } catch (error) { await cleanupDb.query("rollback"); throw error; }
        assert.equal((await cleanupDb.query("select count(*)::int as n from onzio.clubs where id=$1", [clubId])).rows[0].n, 0);
        assert.equal((await cleanupDb.query("select count(*)::int as n from pg_namespace where nspname=$1", [schema])).rows[0].n, 0);
        assert.deepEqual((await cleanupDb.query("select tgenabled from pg_trigger where tgrelid='onzio.presentation_documents'::regclass and tgname='presentation_documents_immutable'")).rows, initialTrigger);
      } finally { await cleanupDb.end(); }
      await journal("verified-clean");
      lifecycle = "closed";
    })().catch(async error => {
      lifecycle = "cleanup-failed";
      try { await journal("cleanup-failed"); } catch (journalError) { throw new AggregateError([error, journalError], "Cleanup failed and its recovery journal could not be updated"); }
      throw error;
    }).finally(() => { cleanup = undefined; });
    return cleanup;
  }
  try {
    await db.query("begin");
    await db.query(`insert into onzio.clubs(id,slug,name,kind,lifecycle,public_access,tier,primary_color,secondary_color,store_enabled)
      select $1,$2,name,'test','active','live',tier,primary_color,secondary_color,store_enabled from onzio.clubs where id=$3`,
    [clubId, "pilot", CLUB_IDS.alpha]);
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
    async function populateAcademy() {
      assert.equal(lifecycle, "open", "Cannot populate a closing coordination fixture");
      assert(!fullParameters && !fullInitial, "Full Academy fixture can only be populated once");
      const clubs = z.array(z.object({ id: z.uuid() })).parse((await db.query("select id from onzio.clubs where id<>$1 order by id", [clubId])).rows).map(row => row.id);
      fullInitial = { clubs, fingerprint: await academyTenantFingerprint(db, clubs, true), schema: await academySchemaFingerprint(db, schema) };
      await journal("populating");
      fullParameters = await populateAcademyContent(db, clubId);
      await journal("populated");
      return fullParameters;
    }
    async function checkpoint() {
      assert(fullParameters && fullInitial, "Populate the complete Academy fixture before preservation checks");
      return { club: await academyTenantFingerprint(db, [clubId]), unrelated: await academyTenantFingerprint(db, fullInitial.clubs, true), schema: await academySchemaFingerprint(db, schema) };
    }
    async function assertPreserved(before: Awaited<ReturnType<typeof checkpoint>>) {
      assert.deepEqual(await checkpoint(), before, "Rollback changed content, billing, editor receipts, unrelated tenants or schema");
    }
    async function assignmentAuthority() {
      return { state: await snapshot(), epoch: z.uuid().parse((await db.query("select epoch from onzio_private.homepage_assignment_epochs where club_id=$1", [clubId])).rows[0].epoch) };
    }
    async function invalidAssignment() {
      const pointer = (await db.query("select published_document_id from onzio.presentation_state where club_id=$1", [clubId])).rows[0].published_document_id;
      const wrong = pointer === documents.legacy ? documents.a : documents.legacy;
      await db.query("update onzio.presentation_state set published_document_id=$2 where club_id=$1", [clubId, wrong]);
      return async () => { await db.query("update onzio.presentation_state set published_document_id=$2 where club_id=$1", [clubId, pointer]); };
    }
    return { db, schema, clubId, documents, recoveryFile, connection, close, snapshot, registerRelease, registerWorker, replaceFleet, transition, populateAcademy, checkpoint, assertPreserved, assignmentAuthority, invalidAssignment };
  } catch (error) {
    try { await close(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], "Coordination proof setup and cleanup failed"); }
    throw error;
  }
}
export type CoordinationProof = Awaited<ReturnType<typeof openCoordinationProof>>;
