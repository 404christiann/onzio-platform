import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
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
    // Audit rows pile up in the shared local database (tens of thousands for Alpha), so hashing every
    // row made this check slower with each run and pushed it past the test timeout. A per-club
    // count and highest id still prove no audit row was added or removed.
    const query = table === "onzio.audit_events"
      ? `select jsonb_agg(jsonb_build_object('club_id',club_id,'rows',rows,'max_id',max_id) order by club_id) as data
          from (select club_id, count(*) as rows, max(id) as max_id from ${table} where club_id=any($1::uuid[]) group by club_id) t`
      : `select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) as data from ${table} t where ${column}=any($1::uuid[])`;
    values.push((await db.query(query, [[CLUB_IDS.alpha, CLUB_IDS.bravo]])).rows[0].data);
  }
  return JSON.stringify(values);
}

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const protectedBaseline = z.object({ protectedSha256: sha256, immutableTrigger: z.literal("O") }).strict();
const recoveryBaseline = z.discriminatedUnion("scope", [
  protectedBaseline.extend({ scope: z.literal("base") }),
  protectedBaseline.extend({
    scope: z.literal("academy"), clubs: z.array(z.uuid()),
    tenant: z.object({ content: sha256, billing: sha256, editor: sha256, authority: sha256 }).strict(),
    schemaSha256: sha256,
  }),
]);
const recoveryRecordSchema = z.object({
  version: z.literal(2), ownerPid: z.number().int().positive(),
  clubId: z.uuid(), schema: z.string().regex(/^site_coordination_[a-f0-9]{32}$/),
  documents: z.object({ a: z.uuid(), b: z.uuid(), legacy: z.uuid() }).strict(),
  stage: z.enum(["prepared", "populating", "populated", "cleaning", "cleanup-failed", "verified-clean"]),
  baseline: recoveryBaseline,
}).strict().superRefine((record, context) => {
  if (new Set(Object.values(record.documents)).size !== 3) context.addIssue({ code: "custom", message: "Recovery document IDs must be distinct" });
  if (["populating", "populated"].includes(record.stage) && record.baseline.scope !== "academy") context.addIssue({ code: "custom", message: "Populated recovery requires the Academy baseline" });
  if (record.baseline.scope === "academy" && (new Set(record.baseline.clubs).size !== record.baseline.clubs.length || record.baseline.clubs.includes(record.clubId))) context.addIssue({ code: "custom", message: "Unrelated recovery clubs must be distinct and exclude the fixture" });
});
type RecoveryRecord = z.infer<typeof recoveryRecordSchema>;
const hashProtected = (value: string) => createHash("sha256").update(value).digest("hex");
const schemaOwner = (clubId: string) => `onzio-academy-proof:${clubId}`;

async function recoveryPath(file: string, existing = true) {
  assert.equal(basename(file), "recovery.json", "Recovery requires its named journal");
  const parent = dirname(file);
  const directory = await lstat(parent);
  assert(directory.isDirectory() && !directory.isSymbolicLink(), "Recovery directory must be a private regular directory");
  assert(/^onzio-academy-proof-[A-Za-z0-9]+$/.test(basename(parent)), "Recovery requires its owned directory");
  assert.equal(directory.mode & 0o777, 0o700, "Recovery directory must have mode 700");
  assert.equal(directory.uid, process.getuid?.(), "Recovery directory must belong to the current user");
  assert.equal(await realpath(parent), parent, "Recovery path must be canonical");
  if (existing) {
    const info = await lstat(file);
    assert(info.isFile() && !info.isSymbolicLink(), "Recovery journal must be a regular file");
    assert.equal(info.mode & 0o777, 0o600, "Recovery journal must have mode 600");
    assert.equal(info.uid, process.getuid?.(), "Recovery journal must belong to the current user");
  }
}

async function writeRecovery(file: string, value: RecoveryRecord, existing = true) {
  const record = recoveryRecordSchema.parse(value);
  await recoveryPath(file, existing);
  const temporary = join(dirname(file), `.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
  return record;
}

async function assertRecoveryBaseline(db: Client, record: RecoveryRecord) {
  assert.equal(hashProtected(await protectedFingerprint(db)), record.baseline.protectedSha256, "Alpha/Bravo changed during coordination proof");
  if (record.baseline.scope === "academy") {
    const clubs = (await db.query("select id from onzio.clubs where id<>$1 order by id", [record.clubId])).rows.map(row => row.id);
    assert.deepEqual(clubs, record.baseline.clubs, "Unrelated club inventory changed during full-site proof");
    assert.deepEqual(await academyTenantFingerprint(db, record.baseline.clubs, true), record.baseline.tenant, "Unrelated tenant state changed during full-site proof");
    assert.equal(await academySchemaFingerprint(db, record.schema), record.baseline.schemaSha256, "Application schema changed during full-site proof");
  }
}

async function cleanRecordedProof(file: string, input: RecoveryRecord, statementTimeoutMs = 60_000) {
  const record = await writeRecovery(file, { ...input, stage: "cleaning" });
  const db = new Client(config);
  const failures: unknown[] = [];
  try {
    await db.connect();
    await db.query("select set_config('statement_timeout',$1,false)", [`${statementTimeoutMs}ms`]);
    await db.query("begin");
    try {
      await db.query("lock table onzio.presentation_documents in access exclusive mode");
      assert.deepEqual((await db.query("select tgenabled from pg_trigger where tgrelid='onzio.presentation_documents'::regclass and tgname='presentation_documents_immutable'")).rows, [{ tgenabled: record.baseline.immutableTrigger }]);
      const clubs = (await db.query("select id,kind,slug from onzio.clubs where id=$1", [record.clubId])).rows;
      const schemas = (await db.query("select obj_description(oid,'pg_namespace') as owner from pg_namespace where nspname=$1", [record.schema])).rows;
      if (clubs.length || schemas.length) {
        assert.deepEqual(clubs, [{ id: record.clubId, kind: "test", slug: "pilot" }], "Recovery target is not its disposable club");
        assert.deepEqual(schemas, [{ owner: schemaOwner(record.clubId) }], "Recovery schema does not belong to its club");
        assert.deepEqual((await db.query("select hostname,is_primary,active,environment,verified_at is not null as verified from onzio.club_domains where club_id=$1", [record.clubId])).rows,
          [{ hostname: "pilot.localhost", is_primary: true, active: true, environment: "production", verified: true }], "Recovery domain differs from its owned fixture");
        assert.deepEqual((await db.query("select id from onzio.presentation_documents where club_id=$1 order by id", [record.clubId])).rows.map(row => row.id), Object.values(record.documents).sort(), "Recovery documents differ from its inventory");
        await db.query(`drop schema ${record.schema} cascade`);
        await removeAcademyContent(db, record.clubId);
        await db.query("delete from onzio.presentation_state where club_id=$1", [record.clubId]);
        await db.query("alter table onzio.presentation_documents disable trigger presentation_documents_immutable");
        await db.query("delete from onzio.presentation_documents where club_id=$1", [record.clubId]);
        await db.query("alter table onzio.presentation_documents enable trigger presentation_documents_immutable");
        for (const table of ["homepage_hero_content", "homepage_story_section", "club_domains", "club_members", "audit_events"]) await db.query(`delete from onzio.${table} where club_id=$1`, [record.clubId]);
        await db.query("delete from onzio.clubs where id=$1", [record.clubId]);
      }
      await assertRecoveryBaseline(db, record);
      await db.query("commit");
    } catch (error) {
      try { await db.query("rollback"); } catch (rollbackError) { throw new AggregateError([error, rollbackError], "Recovery and rollback failed"); }
      throw error;
    }
    assert.equal((await db.query("select count(*)::int as n from onzio.clubs where id=$1", [record.clubId])).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int as n from pg_namespace where nspname=$1", [record.schema])).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int as n from onzio.presentation_documents where club_id=$1", [record.clubId])).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int as n from onzio.club_domains where club_id=$1", [record.clubId])).rows[0].n, 0);
    assert.deepEqual((await db.query("select tgenabled from pg_trigger where tgrelid='onzio.presentation_documents'::regclass and tgname='presentation_documents_immutable'")).rows, [{ tgenabled: record.baseline.immutableTrigger }]);
  } catch (error) { failures.push(error); }
  try { await db.end(); } catch (error) { failures.push(error); }
  if (failures.length) {
    try { await writeRecovery(file, { ...record, stage: "cleanup-failed" }); } catch (error) { failures.push(error); }
    if (failures.length === 1) throw failures[0];
    throw new AggregateError(failures, "Coordination recovery failed");
  }
  return writeRecovery(file, { ...record, stage: "verified-clean" });
}

export async function recoverCoordinationProof(file: string): Promise<void> {
  assertSafeTestEnvironment();
  await recoveryPath(file);
  const value: unknown = JSON.parse(await readFile(file, "utf8"));
  assert(!(typeof value === "object" && value !== null && "version" in value && value.version === 1), "Version 1 journals require manual recovery because their verification baseline was not persisted");
  const record = recoveryRecordSchema.parse(value);
  let alive = true;
  try { process.kill(record.ownerPid, 0); }
  catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ESRCH") alive = false;
    else throw error;
  }
  assert(!alive, "Cannot recover a live proof owner");
  await cleanRecordedProof(file, record);
}

export async function openCoordinationProof(options: { cleanupStatementTimeoutMs?: number } = {}) {
  assertSafeTestEnvironment();
  const db = new Client(config);
  await db.connect();
  let initialProtectedSha256: string;
  let initialTrigger: { tgenabled: string }[];
  try {
    await db.query("set statement_timeout='8s'");
    initialProtectedSha256 = hashProtected(await protectedFingerprint(db));
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
  const journalDirectory = await mkdtemp(join(tmpdir(), "onzio-academy-proof-")).then(path => realpath(path)).catch(async error => { await db.end(); throw error; });
  const recoveryFile = join(journalDirectory, "recovery.json");
  let lifecycle: "open" | "cleaning" | "cleanup-failed" | "closed" = "open";
  let cleanup: Promise<void> | undefined;
  let dbClosed = false;
  let fullParameters: AcademyProofParameters | undefined;
  let fullInitial: { clubs: string[]; fingerprint: Awaited<ReturnType<typeof academyTenantFingerprint>>; schema: string } | undefined;
  let record: RecoveryRecord = {
    version: 2, ownerPid: process.pid, clubId, schema, documents, stage: "prepared",
    baseline: { scope: "base", protectedSha256: initialProtectedSha256, immutableTrigger: "O" },
  };
  const journal = async (stage: RecoveryRecord["stage"], baseline = record.baseline) => {
    record = await writeRecovery(recoveryFile, { ...record, stage, baseline });
  };
  await writeRecovery(recoveryFile, record, false).catch(async error => { await db.end(); throw error; });
  async function close(): Promise<void> {
    if (lifecycle === "closed") return;
    if (cleanup) return cleanup;
    lifecycle = "cleaning";
    cleanup = (async () => {
      const errors: unknown[] = [];
      try { await journal("cleaning"); } catch (error) { errors.push(error); }
      const closingClients = [...clients];
      const outcomes = await Promise.allSettled(closingClients.map(async client => {
        await client.query("rollback").catch(() => undefined);
        await client.end();
      }));
      outcomes.forEach((outcome, index) => {
        if (outcome.status === "fulfilled") clients.splice(clients.indexOf(closingClients[index]), 1);
        else errors.push(outcome.reason);
      });
      if (!dbClosed) {
        try { await db.query("rollback"); } catch (error) { errors.push(error); }
        try { await db.end(); dbClosed = true; } catch (error) { errors.push(error); }
      }
      if (errors.length) {
        try { await journal("cleanup-failed"); } catch (error) { errors.push(error); }
        if (errors.length === 1) throw errors[0];
        throw new AggregateError(errors, "Coordination proof clients or journal failed to close");
      }
      record = await cleanRecordedProof(recoveryFile, record, options.cleanupStatementTimeoutMs);
      lifecycle = "closed";
    })().catch(error => { lifecycle = "cleanup-failed"; throw error; }).finally(() => { cleanup = undefined; });
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
    await db.query(`comment on schema ${schema} is '${schemaOwner(clubId)}'`);
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
      await journal("populating", { scope: "academy", protectedSha256: initialProtectedSha256, immutableTrigger: "O", clubs: fullInitial.clubs, tenant: fullInitial.fingerprint, schemaSha256: fullInitial.schema });
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
