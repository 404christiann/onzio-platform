import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, it } from "vitest";
import { z } from "zod";
import { type HomepageSaveRequest } from "@/lib/homepage-editor/contract";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { coordinationBinding, coordinationDigests as digests, openCoordinationProof, type CoordinationProof } from "../helpers/site-coordination-proof";

const tokens = z.object({ revision: z.string(), designRevision: z.string() }).passthrough();
async function actor(db: Client, userId: string = USER_IDS.ownerAal2) {
  await db.query("begin");
  const second = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: userId, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second }] })]);
  await db.query("set local role authenticated");
}
async function load(db: Client, club: string) {
  return tokens.parse((await db.query("select onzio.load_homepage($1) as data", [club])).rows[0].data);
}
async function save(db: Client, club: string, payload: HomepageSaveRequest) {
  return (await db.query("select onzio.save_homepage($1,$2) as data", [club, payload])).rows[0].data as unknown;
}
async function ready(proof: CoordinationProof) {
  await proof.registerRelease(digests.a, proof.documents.a);
  await proof.registerRelease(digests.b, proof.documents.b);
  const old = await proof.registerWorker([digests.a]);
  const next = await proof.registerWorker([digests.a, digests.b]);
  const generation = await proof.replaceFleet((await proof.snapshot()).generation, [next]);
  const event = await proof.transition(null, generation, digests.a);
  return { old, next, generation, event };
}
async function waits(observer: Client, pid: number) {
  await expect.poll(async () => (await observer.query("select wait_event from pg_stat_activity where pid=$1", [pid])).rows[0]?.wait_event,
    { timeout: 3000, interval: 20 }).toBe("advisory");
}
async function fixture(action: (proof: CoordinationProof) => Promise<void>) {
  const proof = await openCoordinationProof();
  try { await action(proof); } finally { await proof.close(); }
}

it("keeps explicit legacy, missing and authored states distinct and couples the exact projection", async () => {
  await fixture(async p => {
    expect((await p.snapshot()).event).toBeNull();
    await p.registerRelease(digests.a, p.documents.a);
    const worker = await p.registerWorker([digests.a]);
    const generation = await p.replaceFleet((await p.snapshot()).generation, [worker]);
    const legacy = await p.transition(null, generation, null, p.db, "publish", p.documents.legacy);
    expect((await p.snapshot()).event).toMatchObject({ id: legacy, digest: null, legacyId: p.documents.legacy });
    const event = await p.transition(legacy, generation, digests.a);
    expect(await p.snapshot()).toMatchObject({ pointer: p.documents.a, event: { id: event, previousId: legacy, documentId: p.documents.a, digest: digests.a, binding: coordinationBinding } });
    await expect(p.transition(event, generation, digests.a)).rejects.toMatchObject({ message: "ALREADY_ASSIGNED" });
  });
});

it("rejects activation without traffic and leaves assignment and actual pointer unchanged", async () => {
  await fixture(async p => {
    await p.registerRelease(digests.a, p.documents.a);
    const before = await p.snapshot();
    await expect(p.transition(null, before.generation, digests.a)).rejects.toMatchObject({ message: "NO_TRAFFIC" });
    expect(await p.snapshot()).toEqual(before);
    const worker = await p.registerWorker([digests.a]);
    const generation = await p.replaceFleet(before.generation, [worker]);
    await expect(p.transition(null, generation, "9".repeat(64))).rejects.toMatchObject({ message: "TARGET_UNAVAILABLE" });
    expect((await p.snapshot()).event).toBeNull();
    expect((await p.snapshot()).pointer).toBe(before.pointer);
  });
});

it("rejects partial rollout and requires retained active and previous code on admission", async () => {
  await fixture(async p => {
    const r = await ready(p);
    let generation = await p.replaceFleet(r.generation, [r.old, r.next]);
    const before = await p.snapshot();
    await expect(p.transition(r.event, generation, digests.b)).rejects.toMatchObject({ message: "CAPABILITY_MISSING" });
    expect(await p.snapshot()).toEqual(before);
    generation = await p.replaceFleet(generation, [r.next]);
    const b = await p.transition(r.event, generation, digests.b);
    await expect(p.replaceFleet(generation, [r.old])).rejects.toMatchObject({ message: "CAPABILITY_MISSING" });
    await expect(p.replaceFleet(generation, [])).rejects.toMatchObject({ message: "INVALID_FLEET" });
    await expect(p.replaceFleet(generation, [r.next, r.next])).rejects.toMatchObject({ message: "INVALID_FLEET" });
    await expect(p.replaceFleet(generation, [randomUUID()])).rejects.toMatchObject({ message: "INVALID_FLEET" });
    expect((await p.snapshot()).event?.id).toBe(b);
  });
});

it("compares prepared generation atomically across an independent committed membership change", async () => {
  await fixture(async p => {
    const r = await ready(p), other = await p.connection();
    const before = await p.snapshot();
    const changed = await p.replaceFleet(r.generation, [r.old, r.next], other);
    expect(changed).not.toBe(r.generation);
    await expect(p.transition(r.event, r.generation, digests.b)).rejects.toMatchObject({ message: "FLEET_CHANGED", code: "PT409" });
    await expect(p.replaceFleet(r.generation, [r.next])).rejects.toMatchObject({ message: "FLEET_CHANGED", code: "PT409" });
    expect((await p.snapshot()).event).toEqual(before.event);
    expect((await p.snapshot()).pointer).toBe(before.pointer);
  });
});

it("allows exactly one concurrent event commit and rejects stale event ABA and rollback targets", async () => {
  await fixture(async p => {
    const r = await ready(p), first = await p.connection(), second = await p.connection();
    await first.query("begin");
    const b = await p.transition(r.event, r.generation, digests.b, first);
    const pid = Number((await second.query("select pg_backend_pid() as pid")).rows[0].pid);
    const loser = p.transition(r.event, r.generation, digests.b, second).then(() => null, error => error);
    await waits(p.db, pid);
    await first.query("commit");
    expect(await loser).toMatchObject({ message: "ASSIGNMENT_CHANGED", code: "PT409" });
    await expect(p.transition(b, r.generation, digests.b, p.db, "rollback")).rejects.toMatchObject({ message: "ALREADY_ASSIGNED" });
    await expect(p.transition(b, r.generation, null, p.db, "rollback", p.documents.legacy)).rejects.toMatchObject({ message: "ROLLBACK_TARGET_CHANGED" });
    const a = await p.transition(b, r.generation, digests.a, p.db, "rollback");
    expect(a).not.toBe(r.event);
    await expect(p.transition(r.event, r.generation, digests.b)).rejects.toMatchObject({ message: "ASSIGNMENT_CHANGED" });
  });
});

it("rejects legacy pointer divergence and atomically rolls back an event on pointer-write failure", async () => {
  await fixture(async p => {
    const r = await ready(p);
    await p.db.query("update onzio.presentation_state set published_document_id=$2 where club_id=$1", [p.clubId, p.documents.legacy]);
    expect(await p.snapshot()).toMatchObject({ pointer: p.documents.legacy, event: { documentId: p.documents.a } });
    await expect(p.transition(r.event, r.generation, digests.b)).rejects.toMatchObject({ message: "PROJECTION_CHANGED", code: "PT409" });
    await expect(p.replaceFleet(r.generation, [r.old, r.next])).rejects.toMatchObject({ message: "PROJECTION_CHANGED" });
    await p.db.query("update onzio.presentation_state set published_document_id=$2 where club_id=$1", [p.clubId, p.documents.a]);
    const before = await p.snapshot();
    const epoch = (await p.db.query("select epoch from onzio_private.homepage_assignment_epochs where club_id=$1", [p.clubId])).rows;
    await p.db.query(`create function ${p.schema}.fail_pointer() returns trigger language plpgsql as $$ begin
      if new.club_id='${p.clubId}'::uuid then raise exception 'POINTER_FAILURE'; end if; return new; end $$;
      create trigger coordination_pointer_failure before update on onzio.presentation_state for each row execute function ${p.schema}.fail_pointer()`);
    try { await expect(p.transition(r.event, r.generation, digests.b)).rejects.toMatchObject({ message: "POINTER_FAILURE" }); }
    finally { await p.db.query("drop trigger coordination_pointer_failure on onzio.presentation_state"); }
    expect(await p.snapshot()).toEqual(before);
    expect((await p.db.query("select epoch from onzio_private.homepage_assignment_epochs where club_id=$1", [p.clubId])).rows).toEqual(epoch);
    expect(Number((await p.db.query(`select count(*) from ${p.schema}.events`)).rows[0].count)).toBe(1);
  });
});

it("enforces immutable identity, exact Academy bindings, tenant foreign keys and publisher grants", async () => {
  await fixture(async p => {
    const r = await ready(p);
    await expect(p.registerRelease(digests.a, p.documents.a)).rejects.toMatchObject({ code: "23505" });
    await expect(p.registerWorker([digests.a], p.db, r.old)).rejects.toMatchObject({ code: "23505" });
    await expect(p.db.query(`update ${p.schema}.releases set platform=$1`, ["9".repeat(64)])).rejects.toMatchObject({ message: "IMMUTABLE" });
    await expect(p.db.query(`delete from ${p.schema}.events`)).rejects.toMatchObject({ message: "IMMUTABLE" });
    await expect(p.db.query(`select ${p.schema}.register_release($1,$2,$3,$4,$5,$5,$5)`, [p.clubId, "9".repeat(64), p.documents.legacy, { ...coordinationBinding, revision: 2 }, "c".repeat(64)])).rejects.toMatchObject({ message: "INVALID_BINDING" });
    await expect(p.registerRelease("9".repeat(64), p.documents.a, p.db, CLUB_IDS.bravo)).rejects.toMatchObject({ message: "INVALID_PROJECTION" });
    await expect(p.transition(null, r.generation, digests.a, p.db, "publish", null, CLUB_IDS.bravo)).rejects.toMatchObject({ message: "NOT_AUTHORIZED" });
    await expect(p.transition(r.event, r.generation, digests.b, p.db, "publish", null, p.clubId, USER_IDS.unaffiliated)).rejects.toMatchObject({ message: "NOT_AUTHORIZED" });
    for (const role of ["anon", "authenticated"] as const) {
      const restricted = await p.connection(role);
      await expect(p.snapshot(restricted)).rejects.toMatchObject({ code: "42501" });
      await expect(p.transition(r.event, r.generation, digests.b, restricted)).rejects.toMatchObject({ code: "42501" });
      await expect(p.replaceFleet(r.generation, [r.next], restricted)).rejects.toMatchObject({ code: "42501" });
      await expect(p.registerRelease("9".repeat(64), p.documents.legacy, restricted)).rejects.toMatchObject({ code: "42501" });
      await expect(p.registerWorker([digests.a], restricted)).rejects.toMatchObject({ code: "42501" });
    }
    const publisher = await p.connection();
    await expect(publisher.query(`update ${p.schema}.state set current_id=current_id`)).rejects.toMatchObject({ code: "42501" });
  });
});

it("uses actual committed save authority for authored ABA, original receipts, actor and request-hash scope", async () => {
  await fixture(async p => {
    const r = await ready(p), saver = await p.connection("postgres");
    await actor(saver);
    const before = await load(saver, p.clubId);
    const payload: HomepageSaveRequest = { operationId: randomUUID(), expectedRevision: before.revision, designRevision: before.designRevision, sections: { hero: { intro: "Committed authored receipt" } } };
    const receipt = await save(saver, p.clubId, payload);
    await saver.query("commit");
    const stored = (await p.db.query("select request_hash,response from onzio_private.homepage_save_receipts where club_id=$1", [p.clubId])).rows;
    const b = await p.transition(r.event, r.generation, digests.b);
    const a = await p.transition(b, r.generation, digests.a, p.db, "rollback");
    expect(a).not.toBe(r.event);
    await actor(saver);
    const current = await load(saver, p.clubId);
    expect(current.designRevision).not.toBe(before.designRevision);
    expect(await save(saver, p.clubId, payload)).toEqual(receipt);
    await saver.query("commit");
    await actor(saver);
    await expect(save(saver, p.clubId, { ...payload, operationId: randomUUID(), expectedRevision: current.revision })).rejects.toMatchObject({ message: "DESIGN_CHANGED", code: "PT409" });
    await saver.query("rollback");
    await actor(saver);
    await expect(save(saver, p.clubId, { ...payload, operationId: randomUUID(), designRevision: current.designRevision })).rejects.toMatchObject({ message: "CONTENT_CHANGED", code: "PT409" });
    await saver.query("rollback");
    await p.db.query("insert into onzio.club_members(club_id,user_id,role,status) values($1,$2,'admin','active')", [p.clubId, USER_IDS.adminAal2]);
    await actor(saver, USER_IDS.adminAal2);
    await expect(save(saver, p.clubId, payload)).rejects.toMatchObject({ message: "DESIGN_CHANGED" });
    await saver.query("rollback");
    await actor(saver);
    await expect(save(saver, p.clubId, { ...payload, sections: { hero: { intro: "Changed original request" } } })).rejects.toMatchObject({ message: "OPERATION_REUSED" });
    await saver.query("rollback");
    await actor(saver, USER_IDS.unaffiliated);
    await expect(save(saver, p.clubId, payload)).rejects.toMatchObject({ message: "NOT_AUTHORIZED" });
    await saver.query("rollback");
    await actor(saver);
    await expect(save(saver, CLUB_IDS.bravo, payload)).rejects.toMatchObject({ message: "NOT_AUTHORIZED" });
    await saver.query("rollback");
    expect((await p.db.query("select request_hash,response from onzio_private.homepage_save_receipts where club_id=$1", [p.clubId])).rows).toEqual(stored);
  });
});

it.each(["save-first", "transition-first"] as const)("observes actual advisory blocking and fresh-save results for %s", async order => {
  await fixture(async p => {
    const r = await ready(p), saver = await p.connection("postgres"), publisher = await p.connection();
    await actor(saver);
    const before = await load(saver, p.clubId);
    const payload: HomepageSaveRequest = { operationId: randomUUID(), expectedRevision: before.revision, designRevision: before.designRevision, sections: { hero: { intro: "Actual authored interleaving" } } };
    if (order === "save-first") {
      const receipt = await save(saver, p.clubId, payload);
      const pid = Number((await publisher.query("select pg_backend_pid() as pid")).rows[0].pid);
      const switched = p.transition(r.event, r.generation, digests.b, publisher);
      await waits(p.db, pid);
      await saver.query("commit");
      await switched;
      await actor(saver);
      expect(await save(saver, p.clubId, payload)).toEqual(receipt);
      await saver.query("commit");
    } else {
      await saver.query("commit");
      await publisher.query("begin");
      await p.transition(r.event, r.generation, digests.b, publisher);
      await actor(saver);
      const pid = Number((await saver.query("select pg_backend_pid() as pid")).rows[0].pid);
      const saving = save(saver, p.clubId, payload).then(result => ({ result, error: null }), error => ({ result: null, error }));
      await waits(p.db, pid);
      await publisher.query("commit");
      expect((await saving).error).toMatchObject({ message: "DESIGN_CHANGED", code: "PT409" });
      await saver.query("rollback");
      expect((await p.db.query("select * from onzio_private.homepage_save_receipts where club_id=$1", [p.clubId])).rows).toEqual([]);
    }
  });
});
