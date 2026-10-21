import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, it } from "vitest";
import { z } from "zod";
import { type HomepageSaveRequest } from "@/lib/homepage-editor/contract";
import { USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";

const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };
const tokens = z.object({ revision: z.string(), designRevision: z.string() }).passthrough();
async function actor(db: Client) {
  await db.query("begin");
  const second = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({
    sub: USER_IDS.ownerAal2, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second }],
  })]);
  await db.query("set local role authenticated");
}
async function load(db: Client, club: string) {
  return tokens.parse((await db.query("select onzio.load_homepage($1) as data", [club])).rows[0].data);
}
async function save(db: Client, club: string, payload: HomepageSaveRequest) {
  return (await db.query("select onzio.save_homepage($1,$2) as data", [club, payload])).rows[0].data;
}
async function waiting(observer: Client, db: Client) {
  const pid = Number((await db.query("select pg_backend_pid() as pid")).rows[0].pid);
  return async () => {
    await expect.poll(async () => (await observer.query("select wait_event from pg_stat_activity where pid=$1", [pid])).rows[0]?.wait_event,
      { timeout: 3000, interval: 20 }).toBe("advisory");
  };
}
async function fixture(run: (setup: Client, first: Client, second: Client, club: string, a: string, b: string) => Promise<void>) {
  assertSafeTestEnvironment();
  const setup = new Client(config), first = new Client(config), second = new Client(config);
  const club = randomUUID(), a = randomUUID(), b = randomUUID();
  await Promise.all([setup.connect(), first.connect(), second.connect()]);
  try {
    for (const db of [setup, first, second]) await db.query("set statement_timeout='8s'");
    await setup.query("begin");
    await setup.query("insert into onzio.clubs(id,slug,name,kind,lifecycle,public_access) values($1,$2,'Committed assignment test','test','active','live')", [club, `assignment-${club}`]);
    await setup.query("insert into onzio.club_members(club_id,user_id,role,status) values($1,$2,'owner','active')", [club, USER_IDS.ownerAal2]);
    for (const [index, id] of [a, b].entries()) {
      await setup.query(`insert into onzio.presentation_documents
        (id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
        values($1,$2,$3,1,'academy',1,$4,$5,$6)`,
      [id, club, index + 1, { schemaVersion: 1, template: { id: "academy", version: 1 } }, "a".repeat(64), USER_IDS.ownerAal2]);
    }
    await setup.query("insert into onzio.presentation_state(club_id,published_document_id,updated_by) values($1,$2,$3)", [club, a, USER_IDS.ownerAal2]);
    await setup.query("commit");
    await run(setup, first, second, club, a, b);
  } finally {
    await Promise.all([first.query("rollback"), second.query("rollback")]);
    await setup.query("rollback");
    await setup.query("begin");
    try {
      await setup.query("delete from onzio.presentation_state where club_id=$1", [club]);
      await setup.query("alter table onzio.presentation_documents disable trigger presentation_documents_immutable");
      await setup.query("delete from onzio.presentation_documents where club_id=$1", [club]);
      await setup.query("alter table onzio.presentation_documents enable trigger presentation_documents_immutable");
      for (const table of ["homepage_hero_content", "club_members", "audit_events"]) await setup.query(`delete from onzio.${table} where club_id=$1`, [club]);
      await setup.query("delete from onzio.clubs where id=$1", [club]);
      expect((await setup.query("select * from onzio_private.homepage_assignment_epochs where club_id=$1", [club])).rows).toEqual([]);
      await setup.query("commit");
    } finally {
      await setup.query("rollback");
      await Promise.all([setup.end(), first.end(), second.end()]);
    }
  }
}

it("rejects ABA across independent committed pointer transitions", async () => {
  await fixture(async (setup, first, second, club, a, b) => {
    await actor(first);
    const before = await load(first, club);
    await first.query("commit");
    await setup.query("update onzio.presentation_state set published_document_id=$2 where club_id=$1", [club, b]);
    await second.query("update onzio.presentation_state set published_document_id=$2 where club_id=$1", [club, a]);
    await actor(first);
    const current = await load(first, club);
    expect(current.revision).toBe(before.revision);
    expect(current.designRevision).not.toBe(before.designRevision);
    await expect(save(first, club, { operationId: randomUUID(), expectedRevision: before.revision, designRevision: before.designRevision,
      sections: { hero: { intro: "Stale committed ABA" } } })).rejects.toMatchObject({ message: "DESIGN_CHANGED", code: "PT409" });
    await first.query("rollback");
    expect((await setup.query("select * from onzio_private.homepage_save_receipts where club_id=$1", [club])).rows).toEqual([]);
    expect((await setup.query("select * from onzio.homepage_hero_content where club_id=$1", [club])).rows).toEqual([]);
  });
});

it.each(["save-first", "transition-first"] as const)("observes the real advisory wait for %s and preserves committed exact replay", async order => {
  await fixture(async (setup, first, second, club, a, b) => {
    await actor(first);
    const before = await load(first, club);
    const payload: HomepageSaveRequest = { operationId: randomUUID(), expectedRevision: before.revision, designRevision: before.designRevision,
      sections: { hero: { intro: "Committed response-loss receipt" } } };
    const receipt = await save(first, club, payload);
    const waitForTransition = await waiting(setup, second);
    if (order === "save-first") {
      await second.query("begin");
      const switched = second.query("update onzio.presentation_state set published_document_id=$2 where club_id=$1", [club, b]);
      await waitForTransition();
      await first.query("commit");
      await switched;
      await second.query("update onzio.presentation_state set published_document_id=$2 where club_id=$1", [club, a]);
      await second.query("commit");
    } else {
      await first.query("commit");
      await second.query("begin");
      await second.query("update onzio.presentation_state set published_document_id=$2 where club_id=$1", [club, b]);
      await second.query("update onzio.presentation_state set published_document_id=$2 where club_id=$1", [club, a]);
      await actor(first);
      const waitForSave = await waiting(setup, first);
      const stale = save(first, club, { ...payload, operationId: randomUUID() }).then(
        result => ({ result, error: null }), error => ({ result: null, error }),
      );
      await waitForSave();
      await second.query("commit");
      expect((await stale).error).toMatchObject({ message: "DESIGN_CHANGED", code: "PT409" });
      await first.query("rollback");
    }
    const stored = (await setup.query("select request_hash,response from onzio_private.homepage_save_receipts where club_id=$1", [club])).rows;
    await second.query("begin");
    await second.query("update onzio.presentation_state set published_document_id=$2 where club_id=$1", [club, b]);
    await actor(first);
    const waitForReplay = await waiting(setup, first);
    const replay = save(first, club, payload);
    await waitForReplay();
    await second.query("commit");
    expect(await replay).toEqual(receipt);
    await first.query("commit");
    expect((await setup.query("select request_hash,response from onzio_private.homepage_save_receipts where club_id=$1", [club])).rows).toEqual(stored);
    await actor(first);
    await expect(save(first, club, { ...payload, sections: { hero: { intro: "Changed operation" } } })).rejects.toMatchObject({ message: "OPERATION_REUSED" });
    await first.query("rollback");
  });
});

it("replays a genuine committed historical-format receipt through assignment and current-resolution faults", async () => {
  await fixture(async (setup, first, second, club, a, b) => {
    await actor(first);
    await first.query("reset role");
    const source = z.string().parse((await first.query("select pg_get_functiondef('onzio_private.homepage_snapshot(uuid)'::regprocedure) as source")).rows[0].source);
    expect(source).toContain("onzio_private.homepage_save_design(p_club_id)");
    await first.query(source.replaceAll("onzio_private.homepage_save_design(p_club_id)", "onzio_private.homepage_design(p_club_id)"));
    await first.query("set local role authenticated");
    const historical = await load(first, club);
    const payload: HomepageSaveRequest = { operationId: randomUUID(), expectedRevision: historical.revision, designRevision: historical.designRevision,
      sections: { hero: { intro: "Actual old snapshot receipt" } } };
    const receipt = await save(first, club, payload);
    await first.query("reset role");
    await first.query(source);
    await first.query("commit");
    const stored = (await setup.query("select request_hash,response from onzio_private.homepage_save_receipts where club_id=$1", [club])).rows;
    expect(stored).toHaveLength(1);
    await second.query("update onzio.presentation_state set published_document_id=$2 where club_id=$1", [club, b]);
    await second.query("update onzio.presentation_state set published_document_id=$2 where club_id=$1", [club, a]);
    await actor(first);
    expect(await save(first, club, payload)).toEqual(receipt);
    await first.query("commit");
    const invalid = randomUUID();
    await setup.query(`insert into onzio.presentation_documents
      (id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
      values($1,$2,3,1,'academy',1,$3,$4,$5)`,
    [invalid, club, { schemaVersion: 1, template: { id: "heritage", version: 1 } }, "a".repeat(64), USER_IDS.ownerAal2]);
    await setup.query("update onzio.presentation_state set published_document_id=$2 where club_id=$1", [club, invalid]);
    await actor(first);
    expect(await save(first, club, payload)).toEqual(receipt);
    await first.query("commit");
    await actor(first);
    await expect(save(first, club, { ...payload, operationId: randomUUID() })).rejects.toMatchObject({ message: "INVALID_HOMEPAGE_DESIGN" });
    await first.query("rollback");
    await setup.query("update onzio.presentation_state set published_document_id=$2 where club_id=$1", [club, a]);
    await setup.query("begin");
    await setup.query("delete from onzio_private.homepage_assignment_epochs where club_id=$1", [club]);
    await setup.query("commit");
    try {
      await actor(first);
      expect(await save(first, club, payload)).toEqual(receipt);
      await first.query("commit");
      await actor(first);
      await expect(save(first, club, { ...payload, operationId: randomUUID() })).rejects.toMatchObject({ message: "HOMEPAGE_ASSIGNMENT_UNAVAILABLE" });
      await first.query("rollback");
      await actor(first);
      await expect(save(first, club, { ...payload, designRevision: "changed" })).rejects.toMatchObject({ message: "OPERATION_REUSED" });
      await first.query("rollback");
      await setup.query("update onzio.club_members set status='removed',removed_at=now() where club_id=$1", [club]);
      await actor(first);
      await expect(save(first, club, payload)).rejects.toMatchObject({ message: "NOT_AUTHORIZED" });
      await first.query("rollback");
      expect((await setup.query("select request_hash,response from onzio_private.homepage_save_receipts where club_id=$1", [club])).rows).toEqual(stored);
    } finally {
      await first.query("rollback");
      await setup.query("insert into onzio_private.homepage_assignment_epochs(club_id) values($1)", [club]);
    }
  });
});
