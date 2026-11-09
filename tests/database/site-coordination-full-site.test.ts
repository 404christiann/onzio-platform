import { execFile, fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { promisify } from "node:util";
import { Client } from "pg";
import { z } from "zod";
import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { academySchemaFingerprint } from "../helpers/academy-coordination-content";
import { USER_IDS } from "../fixtures/entities";
import { coordinationDigests, discardVerifiedCleanJournal, openCoordinationProof, recoverCoordinationProof } from "../helpers/site-coordination-proof";

it("populates its own complete Academy, preserves current content and billing through rollback, and verifies cleanup", async () => {
  const proof = await openCoordinationProof();
  const failures: unknown[] = [];
  try {
    const parameters = await proof.populateAcademy();
    expect(parameters.programSlug).toBe("proof-academy-program");
    expect((await stat(proof.recoveryFile)).mode & 0o777).toBe(0o600);
    const journal = JSON.parse(await readFile(proof.recoveryFile, "utf8"));
    expect(journal).toMatchObject({ version: 2, ownerPid: process.pid, stage: "populated", baseline: { scope: "academy", immutableTrigger: "O" } });
    expect(journal.baseline.protectedSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(journal.baseline.schemaSha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(recoverCoordinationProof(proof.recoveryFile)).rejects.toThrow("Cannot recover a live proof owner");
    for (const [table, minimum] of [["programs", 1], ["tryouts", 1], ["players", 2], ["staff", 1], ["matches", 2], ["shop_kit_section", 4], ["registration_forms", 1], ["club_subscriptions", 1], ["stripe_events", 1]] as const) {
      expect((await proof.db.query(`select count(*)::int as count from onzio.${table} where club_id=$1`, [proof.clubId])).rows[0].count).toBeGreaterThanOrEqual(minimum);
    }
    expect((await proof.db.query("select environment from onzio.club_stripe_connect where club_id=$1", [proof.clubId])).rows).toEqual([{ environment: "test" }]);
    await proof.registerRelease(coordinationDigests.a, proof.documents.a);
    await proof.registerRelease(coordinationDigests.b, proof.documents.b);
    const worker = await proof.registerWorker([coordinationDigests.a, coordinationDigests.b]);
    const generation = await proof.replaceFleet((await proof.snapshot()).generation, [worker]);
    const a = await proof.transition(null, generation, coordinationDigests.a);
    const b = await proof.transition(a, generation, coordinationDigests.b);
    const actor = await proof.connection("authenticated");
    const second = Number((await proof.db.query("select floor(extract(epoch from now()))::bigint as value")).rows[0].value);
    await actor.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: USER_IDS.ownerAal2, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second }] })]);
    const loaded = (await actor.query("select onzio.load_homepage($1) as data", [proof.clubId])).rows[0].data;
    await actor.query("select onzio.save_homepage($1,$2) as data", [proof.clubId, { operationId: randomUUID(), expectedRevision: loaded.revision, designRevision: loaded.designRevision, sections: { hero: { intro: "Current full-site content before rollback" } } }]);
    const before = await proof.checkpoint();
    await proof.db.query("begin");
    try {
      await proof.db.query("update onzio.club_subscriptions set paid_through=paid_through+interval '1 day' where club_id=$1", [proof.clubId]);
      await expect(proof.assertPreserved(before)).rejects.toThrow("Rollback changed content");
    } finally { await proof.db.query("rollback"); }
    const authorityBefore = await proof.assignmentAuthority();
    const rollback = await proof.transition(b, generation, coordinationDigests.a, proof.db, "rollback");
    await proof.assertPreserved(before);
    const authorityAfter = await proof.assignmentAuthority();
    expect(authorityAfter.state).toMatchObject({ pointer: proof.documents.a, event: { id: rollback, previousId: b } });
    expect(authorityAfter.epoch).not.toBe(authorityBefore.epoch);
    expect((await proof.db.query("select intro from onzio.homepage_hero_content where club_id=$1", [proof.clubId])).rows[0].intro).toBe("Current full-site content before rollback");
    const restore = await proof.invalidAssignment();
    expect((await proof.snapshot()).pointer).not.toBe(proof.documents.a);
    await restore();
    expect((await proof.snapshot()).pointer).toBe(proof.documents.a);
  } catch (error) { failures.push(error); }
  const cleanup = await Promise.allSettled([proof.close(), proof.close()]);
  for (const result of cleanup) {
    if (result.status === "rejected" && !failures.includes(result.reason)) failures.push(result.reason);
  }
  // A failed test whose cleanup still verified clean has nothing left to recover, so do not leave its folder behind.
  if (failures.length > 0) await discardVerifiedCleanJournal(proof.recoveryFile).catch(() => undefined);
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "Full-site regression and cleanup both failed");
  expect(JSON.parse(await readFile(proof.recoveryFile, "utf8")).stage).toBe("verified-clean");
  await expect(proof.close()).resolves.toBeUndefined();
  await discardVerifiedCleanJournal(proof.recoveryFile);
}, 60_000);

it("recovers the original baselines after a cleanup failure and owner exit", async () => {
  const control = `academy_recovery_control_${randomUUID().replaceAll("-", "")}`;
  const db = new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
  await db.connect();
  let child: ReturnType<typeof fork> | undefined;
  let exited: Promise<unknown[]> | undefined;
  const failures: unknown[] = [];
  let target: { recoveryFile: string; clubId: string; schema: string } | undefined;
  let controlCreated = false;
  let changedControl = false;
  let wrongOwner = false;
  const peerId = randomUUID();
  let peerCreated = false;
  let fixtureVerifiedClean = false;
  async function removePeer() {
    await db.query("begin");
    try {
      await db.query("delete from onzio.club_members where club_id=$1", [peerId]);
      await db.query("delete from onzio.audit_events where club_id=$1", [peerId]);
      await db.query("delete from onzio.clubs where id=$1", [peerId]);
      await db.query("commit");
      peerCreated = false;
    } catch (error) { await db.query("rollback"); throw error; }
  }
  async function message(phase: "opened" | "populated" | "cleanup-failed") {
    if (!child || !exited) throw new Error("Recovery child has not started");
    const active = child;
    const done = exited;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const value = await Promise.race([
        once(active, "message").then(([value]) => value),
        done.then(() => { throw new Error("Recovery child exited before its expected message"); }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Recovery child ${phase} message timed out`)), 30_000); }),
      ]);
      if (typeof value === "object" && value !== null && "kind" in value && value.kind === "unexpected-failure") {
        const failure = z.object({ kind: z.literal("unexpected-failure"), phase: z.enum(["opening", "populating", "closing"]), code: z.string().regex(/^(?:[0-9A-Z]{5}|UNKNOWN)$/) }).strict().parse(value);
        throw new Error(`Recovery child failed during ${failure.phase} (${failure.code})`);
      }
      return value;
    } finally { if (timer) clearTimeout(timer); }
  }
  try {
    await db.query("set statement_timeout='8s'");
    const schemaBefore = await academySchemaFingerprint(db, `site_coordination_${randomUUID().replaceAll("-", "")}`);
    await db.query(`create schema ${control}`);
    controlCreated = true;
    child = fork(resolve("tests/fixtures/site-coordination/recovery-child.ts"), [], {
      execArgv: ["--import", createRequire(import.meta.url).resolve("tsx")], detached: true,
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    exited = once(child, "exit");
    target = z.object({ kind: z.literal("opened"), recoveryFile: z.string(), clubId: z.uuid(), schema: z.string().regex(/^site_coordination_[a-f0-9]{32}$/) }).strict().parse(await message("opened"));
    await expect(recoverCoordinationProof(target.recoveryFile)).rejects.toThrow("Cannot recover a live proof owner");
    const populated = message("populated");
    child.send({ action: "populate" });
    expect(await populated).toEqual({ kind: "populated" });
    const persisted = JSON.parse(await readFile(target.recoveryFile, "utf8"));
    expect(persisted).toMatchObject({ version: 2, ownerPid: child.pid, baseline: { scope: "academy" } });
    expect((await db.query("select obj_description(oid,'pg_namespace') as owner from pg_namespace where nspname=$1", [target.schema])).rows).toEqual([{ owner: `onzio-academy-proof:${target.clubId}` }]);
    await db.query("begin");
    await db.query("lock table onzio.presentation_documents in access share mode");
    const failed = message("cleanup-failed");
    child.send({ action: "close" });
    expect(await failed).toEqual({ kind: "cleanup-failed", code: "57014" });
    expect(await exited).toEqual([0, null]);
    await db.query("rollback");
    await db.query(`comment on schema ${target.schema} is 'onzio-academy-proof:${randomUUID()}'`);
    wrongOwner = true;
    await expect(recoverCoordinationProof(target.recoveryFile)).rejects.toThrow("Recovery schema does not belong to its club");
    expect((await db.query("select count(*)::int as n from onzio.clubs where id=$1", [target.clubId])).rows[0].n).toBe(1);
    await db.query(`comment on schema ${target.schema} is 'onzio-academy-proof:${target.clubId}'`);
    wrongOwner = false;
    await db.query("begin");
    await db.query(`insert into onzio.clubs(id,slug,name,kind,lifecycle,public_access,tier,primary_color,secondary_color,store_enabled)
      select $1,$2,'Recovery peer','test','active','live',tier,primary_color,secondary_color,store_enabled from onzio.clubs where id=$3`,
      [peerId, `recovery-peer-${peerId}`, target.clubId]);
    await db.query("insert into onzio.club_members(club_id,user_id,role,status) values($1,$2,'owner','active')", [peerId, USER_IDS.ownerAal2]);
    await db.query("commit");
    peerCreated = true;
    await expect(recoverCoordinationProof(target.recoveryFile)).rejects.toThrow("Unrelated club inventory changed during full-site proof");
    expect((await db.query("select count(*)::int as n from onzio.clubs where id=$1", [target.clubId])).rows[0].n).toBe(1);
    expect((await db.query("select count(*)::int as n from onzio.clubs where id=$1", [peerId])).rows[0].n).toBe(1);
    await removePeer();
    await db.query(`create table ${control}.changed_after_baseline(id integer)`);
    changedControl = true;
    await expect(recoverCoordinationProof(target.recoveryFile)).rejects.toThrow("Application schema changed during full-site proof");
    expect((await db.query("select count(*)::int as n from onzio.clubs where id=$1", [target.clubId])).rows[0].n).toBe(1);
    expect((await db.query("select count(*)::int as n from pg_namespace where nspname=$1", [target.schema])).rows[0].n).toBe(1);
    await db.query(`drop table ${control}.changed_after_baseline`);
    changedControl = false;
    const recovered = await promisify(execFile)(process.execPath, ["--import", createRequire(import.meta.url).resolve("tsx"), resolve("scripts/recover-pilot-site-coordination.ts"), "--recovery", target.recoveryFile], {
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: tmpdir(), TMPDIR: tmpdir(), LANG: "en_US.UTF-8", CI: "1", NODE_ENV: "test", SUPABASE_LOCAL: "1", SUPABASE_TEST_URL: "http://127.0.0.1:54321" },
      timeout: 30_000, killSignal: "SIGKILL",
    });
    expect(JSON.parse(recovered.stdout)).toEqual({ verdict: "VERIFIED-CLEAN", recoveryFile: target.recoveryFile });
    expect(JSON.parse(await readFile(target.recoveryFile, "utf8")).stage).toBe("verified-clean");
    expect((await stat(target.recoveryFile)).mode & 0o777).toBe(0o600);
    const committed = JSON.parse(await readFile(target.recoveryFile, "utf8"));
    await writeFile(target.recoveryFile, JSON.stringify({ ...committed, stage: "cleaning" }), { mode: 0o600 });
    await recoverCoordinationProof(target.recoveryFile);
    await db.query(`create table ${control}.changed_after_baseline(id integer)`);
    changedControl = true;
    await expect(recoverCoordinationProof(target.recoveryFile)).rejects.toThrow("Application schema changed during full-site proof");
    await db.query(`drop table ${control}.changed_after_baseline`);
    changedControl = false;
    await recoverCoordinationProof(target.recoveryFile);
    expect((await db.query("select count(*)::int as n from onzio.clubs where id=$1", [target.clubId])).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int as n from pg_namespace where nspname=$1", [target.schema])).rows[0].n).toBe(0);
    expect((await db.query("select tgenabled from pg_trigger where tgrelid='onzio.presentation_documents'::regclass and tgname='presentation_documents_immutable'")).rows).toEqual([{ tgenabled: "O" }]);
    fixtureVerifiedClean = true;
    await db.query(`drop schema ${control}`);
    controlCreated = false;
    expect(await academySchemaFingerprint(db, target.schema)).toBe(schemaBefore);
  } catch (error) { failures.push(error); }
  try {
    await db.query("rollback");
    if (child && exited && child.exitCode === null && child.signalCode === null) {
      try { if (child.pid) process.kill(-child.pid, "SIGTERM"); } catch (error) {
        if (!(typeof error === "object" && error !== null && "code" in error && error.code === "ESRCH")) throw error;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const stopped = await Promise.race([exited.then(() => true), new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 3_000); })]);
        if (!stopped && child.pid) {
          process.kill(-child.pid, "SIGKILL");
          await exited;
        }
      } finally { if (timer) clearTimeout(timer); }
    }
    if (wrongOwner && target) await db.query(`comment on schema ${target.schema} is 'onzio-academy-proof:${target.clubId}'`);
    if (changedControl) await db.query(`drop table ${control}.changed_after_baseline`);
    if (peerCreated) await removePeer();
    if (target && !fixtureVerifiedClean) await recoverCoordinationProof(target.recoveryFile);
    if (target) await discardVerifiedCleanJournal(target.recoveryFile);
    if (controlCreated) await db.query(`drop schema ${control}`);
  } catch (error) { failures.push(error); }
  try { await db.end(); } catch (error) { failures.push(error); }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "Recovery regression and cleanup both failed");
}, 90_000);


it("closes live connections after a journal failure and retries from the unchanged baseline", async () => {
  const proof = await openCoordinationProof();
  const service = await proof.connection();
  const failures: unknown[] = [];
  try {
    await chmod(dirname(proof.recoveryFile), 0o500);
    await expect(proof.close()).rejects.toThrow();
    await expect(proof.db.query("select 1")).rejects.toThrow();
    await expect(service.query("select 1")).rejects.toThrow();
  } catch (error) { failures.push(error); }
  try {
    await chmod(dirname(proof.recoveryFile), 0o700);
    await proof.close();
    expect(JSON.parse(await readFile(proof.recoveryFile, "utf8")).stage).toBe("verified-clean");
    await discardVerifiedCleanJournal(proof.recoveryFile);
  } catch (error) { failures.push(error); }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "Journal-failure regression and cleanup both failed");
}, 30_000);
