import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { expect, it } from "vitest";
import { USER_IDS } from "../fixtures/entities";
import { coordinationDigests, openCoordinationProof } from "../helpers/site-coordination-proof";

it("populates its own complete Academy, preserves current content and billing through rollback, and verifies cleanup", async () => {
  const proof = await openCoordinationProof();
  const failures: unknown[] = [];
  try {
    const parameters = await proof.populateAcademy();
    expect(parameters.programSlug).toBe("proof-academy-program");
    expect((await stat(proof.recoveryFile)).mode & 0o777).toBe(0o600);
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
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, "Full-site regression and cleanup both failed");
  expect(JSON.parse(await readFile(proof.recoveryFile, "utf8")).stage).toBe("verified-clean");
  await expect(proof.close()).resolves.toBeUndefined();
}, 60_000);
