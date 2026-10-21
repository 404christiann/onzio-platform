import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { Client } from "pg";
import { z } from "zod";
import { homepageHeroSchema } from "@/lib/homepage-editor/contract";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { artifactDigest, contentFingerprint, releaseIds, resolveAssignment, type Proof } from "./site-assignment-proof";

export const snapshotSchema = z.object({ revision: z.string(), designRevision: z.string(),
  content: z.object({ hero: homepageHeroSchema }) });


async function waitForAdvisory(db: Client, pid: number) {
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    if ((await db.query("select wait_event from pg_stat_activity where pid=$1", [pid])).rows[0]?.wait_event === "advisory") return;
    await pause(20);
  }
  assert.fail("The competing transaction never waited on the actual advisory lock");
}

async function contentActor(proof: Proof) {
  const db = await proof.connection("authenticated");
  await db.query("begin");
  const second = Number((await db.query("select floor(extract(epoch from now())) as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({
    sub: USER_IDS.ownerAal2, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second }],
  })]);
  return db;
}

export async function exerciseAssignmentSql(proof: Proof) {
  const { db, schema } = proof;
  const before = await contentFingerprint(db);
  assert.equal((await proof.selected()).kind, "missing");
  assert.equal(proof.releases.length, 2);
  assert.equal((await resolveAssignment(CLUB_IDS.alpha, async () => ({}), proof.releases)).kind, "invalid");
  const legacyId = z.uuid().parse((await db.query("select published_document_id from onzio.presentation_state where club_id=$1", [CLUB_IDS.alpha])).rows[0].published_document_id);
  const legacy = await proof.transition(db, null, null, "publish", legacyId);
  assert.equal((await proof.selected()).kind, "legacy");
  let current = await proof.publish(db, legacy, releaseIds.a);
  const aToken = current;
  const first = await proof.connection(), second = await proof.connection();
  await first.query("begin"); await second.query("begin");
  current = await proof.publish(first, current, releaseIds.b);
  const pid = Number((await second.query("select pg_backend_pid() as pid")).rows[0].pid);
  const losing = proof.transition(second, aToken, releaseIds.b).then(() => null, error => ({ message: error.message, code: error.code }));
  await waitForAdvisory(db, pid);
  await first.query("commit");
  assert.deepEqual(await losing, { message: "ASSIGNMENT_CHANGED", code: "PT409" }); await second.query("rollback");
  current = await proof.publish(db, current, releaseIds.a, "rollback");
  assert.notEqual(current, aToken);
  await assert.rejects(proof.transition(db, aToken, releaseIds.b), /ASSIGNMENT_CHANGED/);
  await assert.rejects(proof.transition(db, current, releaseIds.a, "rollback"), /ROLLBACK_TARGET_CHANGED/);
  const count = Number((await db.query(`select count(*) from ${schema}.events`)).rows[0].count);
  assert.equal(count, 4);
  await assert.rejects(db.query(`update ${schema}.releases set binding='changed'`), /IMMUTABLE/);
  await assert.rejects(db.query(`delete from ${schema}.events`), /IMMUTABLE/);
  await assert.rejects(proof.transition(db, null, releaseIds.a, "publish", null, CLUB_IDS.bravo), /foreign key/i);
  await assert.rejects(proof.transition(db, null, null, "publish", legacyId, CLUB_IDS.bravo), /foreign key/i);
  assert.equal(Number((await db.query(`select count(*) from ${schema}.events`)).rows[0].count), count);
  for (const role of ["anon", "authenticated"]) {
    const restricted = await proof.connection(role);
    await assert.rejects(proof.transition(restricted, current, releaseIds.b), /permission denied/i);
    assert.equal((await resolveAssignment(CLUB_IDS.alpha, () => restricted.query(`select * from ${schema}.state`), proof.releases)).kind, "lookup-failed");
  }
  await assert.rejects(first.query(`update ${schema}.state set current_id=null`), /permission denied/i);
  const valid = await proof.selected(); assert.equal(valid.kind, "published");
  if (valid.kind !== "published") throw new Error("Expected the installed assignment");
  assert.equal((await resolveAssignment(CLUB_IDS.bravo, async () => valid.event, proof.releases)).kind, "invalid");
  assert.equal((await resolveAssignment(CLUB_IDS.alpha, async () => ({ ...valid.event, digest: "0".repeat(64) }), proof.releases)).kind, "invalid");
  assert.equal((await resolveAssignment(CLUB_IDS.alpha, () => proof.lookup(), [])).kind, "unavailable");
  const badge = join(valid.release.root, "badge.png"), bytes = await readFile(badge);
  await unlink(badge);
  try { assert.equal((await proof.selected()).kind, "unavailable"); }
  finally { await writeFile(badge, bytes); }
  assert.equal(await artifactDigest(valid.release.root), valid.release.digest);
  current = await proof.publish(db, current, releaseIds.b);
  await unlink(badge);
  try { await assert.rejects(proof.publish(db, current, releaseIds.a, "rollback"), /TARGET_UNAVAILABLE/); }
  finally { await writeFile(badge, bytes); }
  current = await proof.publish(db, current, releaseIds.a, "rollback");
  const eventCount = Number((await db.query(`select count(*) from ${schema}.events`)).rows[0].count);
  await db.query(`create function ${schema}.fail_pointer() returns trigger language plpgsql as $$ begin raise exception 'POINTER_FAILURE'; end $$;
    create trigger fail_pointer before update on ${schema}.state for each row execute function ${schema}.fail_pointer()`);
  try { await assert.rejects(proof.transition(db, current, releaseIds.b), /POINTER_FAILURE/); }
  finally { await db.query(`drop trigger fail_pointer on ${schema}.state`); }
  assert.equal(Number((await db.query(`select count(*) from ${schema}.events`)).rows[0].count), eventCount);

  const saver = await contentActor(proof);
  const baseline = snapshotSchema.parse((await saver.query("select onzio.load_homepage($1) as data", [CLUB_IDS.alpha])).rows[0].data);
  const payload = { operationId: randomUUID(), expectedRevision: baseline.revision, designRevision: baseline.designRevision,
    sections: { hero: { intro: "Assignment proof draft content" } } };
  const saved = (await saver.query("select onzio.save_homepage($1,$2) as data", [CLUB_IDS.alpha, payload])).rows[0].data;
  const replay = (await saver.query("select onzio.save_homepage($1,$2) as data", [CLUB_IDS.alpha, payload])).rows[0].data;
  assert.deepEqual(replay, saved);
  const switchPid = Number((await first.query("select pg_backend_pid() as pid")).rows[0].pid);
  const waitingSwitch = proof.transition(first, current, releaseIds.b);
  await waitForAdvisory(db, switchPid);
  await saver.query("rollback"); current = await waitingSwitch;
  assert.equal(await contentFingerprint(db), before);

  await first.query("begin");
  current = await proof.publish(first, current, releaseIds.a, "rollback");
  const otherSaver = await contentActor(proof);
  const savePid = Number((await otherSaver.query("select pg_backend_pid() as pid")).rows[0].pid);
  const waitingSave = otherSaver.query("select onzio.save_homepage($1,$2) as data", [CLUB_IDS.alpha, payload]);
  await waitForAdvisory(db, savePid);
  await first.query("commit");
  const actual = (await waitingSave).rows[0].data;
  assert.equal(snapshotSchema.parse(actual).content.hero.intro, payload.sections.hero.intro);
  assert.deepEqual((await otherSaver.query("select onzio.save_homepage($1,$2) as data", [CLUB_IDS.alpha, payload])).rows[0].data, actual);
  await otherSaver.query("savepoint reused");
  await assert.rejects(otherSaver.query("select onzio.save_homepage($1,$2) as data", [CLUB_IDS.alpha, { ...payload, sections: { hero: { intro: "Different request" } } }]), /OPERATION_REUSED/);
  await otherSaver.query("rollback");
  assert.equal(await contentFingerprint(db), before);
  const alphaReader = await contentActor(proof);
  const hero = snapshotSchema.parse((await alphaReader.query("select onzio.load_homepage($1) as data", [CLUB_IDS.alpha])).rows[0].data).content.hero;
  await alphaReader.query("rollback");
  return { hero, current, results: ["explicit-state-resolution", "immutable-history", "tenant-and-role-denials", "real-CAS-race", "ABA-rejection", "rollback-target-check", "missing-artifact-fails-closed", "save-lock-order-both-directions", "transactional-receipt-replay", "fixture-preservation"] };
}
