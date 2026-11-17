import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";

const connection = () => new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
const page = { intro_with_tryouts: "Concurrent intro", intro_no_tryouts: "More soon" };
let admin: Client, legacy: Client, writer: Client, club: string;
async function authenticate() {
  const timestamp = Number((await writer.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await writer.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: USER_IDS.ownerAal2, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp }] })]);
  await writer.query("set role authenticated");
}
async function load(operationId: string | null = null) {
  return (await writer.query("select onzio.load_tryouts_page($1,$2) as data", [club, operationId])).rows[0].data;
}
async function save(body: unknown) {
  return (await writer.query("select onzio.save_tryouts_page($1,$2::jsonb) as data", [club, JSON.stringify(body)])).rows[0].data;
}
async function request(): Promise<{ operationId: string; expectedRevision: string; page: typeof page | null; events: Record<string, unknown>[]; deletedIds: string[] }> { return { operationId: randomUUID(), expectedRevision: (await load()).revision, page, events: (await load()).events.map((row: Record<string, unknown>, sort_order: number) => ({ id: row.id, program_id: row.program_id, status: row.status, eyebrow: row.eyebrow, headline: row.headline, intro: row.intro, hero_media_asset_id: row.hero_media_asset_id, eligibility_copy: row.eligibility_copy, what_to_expect_copy: row.what_to_expect_copy, preparation_copy: row.preparation_copy, event_date: row.event_date, location: row.location, cost_text: row.cost_text, cta_label: row.cta_label, registration_href: row.registration_href, registration_form_id: row.registration_form_id, closed_message: row.closed_message, sort_order })), deletedIds: [] }; }
async function waitForTryoutsLock(pid: number, holder: Client) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const locks = await admin.query("select granted from pg_locks where pid=$1 and locktype='advisory' and classid=0 and objid=734901281", [pid]);
    if (locks.rows.some(row => row.granted === false)) {
      const holderPid = Number((await holder.query("select pg_backend_pid() as pid")).rows[0].pid);
      expect((await admin.query("select objid::int as lock from pg_locks where pid=$1 and locktype='advisory' and classid=0 and objid in (734901281,734901282) and granted order by objid", [holderPid])).rows).toEqual([{ lock: 734901281 }, { lock: 734901282 }]);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 15));
  }
  throw new Error("No observed wait for Tryouts advisory lock 734901281");
}
beforeEach(async () => {
  assertSafeTestEnvironment(); admin = connection(); legacy = connection(); writer = connection();
  await Promise.all([admin.connect(), legacy.connect(), writer.connect()]);
  for (const db of [admin, legacy, writer]) await db.query("set statement_timeout='8s'");
  club = randomUUID();
  await admin.query("insert into onzio.clubs(id,slug,name,kind,lifecycle,public_access) values($1,$2,'Tryouts concurrency','test','active','live')", [club, `tryouts-concurrent-${club}`]);
  await admin.query("insert into onzio.club_members(club_id,user_id,role,status) values($1,$2,'owner','active')", [club, USER_IDS.ownerAal2]);
  await admin.query("insert into onzio.tryouts(club_id,headline) values($1,'Original event')", [club]);
  await authenticate(); await save(await request());
});
afterEach(async () => {
  if (legacy) await legacy.query("rollback").catch(() => undefined);
  if (writer) await writer.query("rollback").catch(() => undefined);
  if (legacy) await legacy.end(); if (writer) await writer.end();
  if (admin) {
    for (const table of ["tryouts", "tryouts_page_content", "club_members", "audit_events"]) await admin.query(`delete from onzio.${table} where club_id=$1`, [club]);
    await admin.query("delete from onzio.clubs where id=$1", [club]);
    for (const table of ["onzio.clubs", "onzio_private.tryouts_page_revisions", "onzio_private.tryouts_page_save_receipts"]) expect((await admin.query(`select count(*)::int as count from ${table} where ${table === "onzio.clubs" ? "id" : "club_id"}=$1`, [club])).rows).toEqual([{ count: 0 }]);
    await admin.end();
  }
});

const mutations = ["tryouts", "tryouts_page_content"].flatMap(table => ["insert", "update", "delete"].map(action => ({ table, action })));
async function prepare(table: string, action: string) {
  if (table === "tryouts_page_content" && action === "insert") await admin.query("delete from onzio.tryouts_page_content where club_id=$1", [club]);
}
async function mutate(db: Client, table: string, action: string) {
  if (action === "insert") return table === "tryouts"
    ? db.query("insert into onzio.tryouts(club_id,headline,sort_order) values($1,'Legacy mutation',1)", [club])
    : db.query("insert into onzio.tryouts_page_content(club_id,intro_with_tryouts) values($1,'Legacy mutation')", [club]);
  if (action === "delete") return db.query(`delete from onzio.${table} where club_id=$1`, [club]);
  return db.query(`update onzio.${table} set ${table === "tryouts" ? "headline" : "intro_with_tryouts"}='Legacy mutation' where club_id=$1`, [club]);
}
async function expectLegacy(table: string, action: string, latest: any) {
  if (table === "tryouts") {
    expect(latest.events.map((row: any) => row.headline)).toEqual(action === "delete" ? [] : action === "insert" ? ["Original event", "Legacy mutation"] : ["Legacy mutation"]);
  } else expect(latest.page).toEqual(action === "delete" ? {} : action === "insert" ? { intro_with_tryouts: "Legacy mutation", intro_no_tryouts: "" } : { ...page, intro_with_tryouts: "Legacy mutation" });
}

describe("Tryouts content serialization on independent connections", () => {
  it.each(mutations)("waits for legacy $table $action, rejects stale save atomically, then accepts a fresh save", async ({ table, action }) => {
    await prepare(table, action);
    const stale = await request(), pid = Number((await writer.query("select pg_backend_pid() as pid")).rows[0].pid);
    await legacy.query("begin"); await mutate(legacy, table, action);
    const pending = save(stale).then(value => ({ value, error: null as Error | null }), error => ({ value: null, error: error as Error }));
    try {
      await waitForTryoutsLock(pid, legacy); await legacy.query("commit");
      const outcome = await pending; expect(outcome.error).toMatchObject({ message: "TRYOUTS_CHANGED", code: "PT409" });
      const latest = await load(stale.operationId); expect(latest.operation).toEqual({ status: "not-committed" });
      await expectLegacy(table, action, latest);
      expect((await admin.query("select count(*)::int as count from onzio_private.tryouts_page_save_receipts where club_id=$1 and operation_id=$2", [club, stale.operationId])).rows).toEqual([{ count: 0 }]);
      expect(await save(await request())).toMatchObject({ page });
    } finally { await legacy.query("rollback"); await pending; }
  });
  it.each(mutations)("makes legacy $table $action wait for committed RPC and advance the shared revision", async ({ table, action }) => {
    await prepare(table, action);
    const body = await request();
    if (table === "tryouts_page_content" && action === "insert") body.page = null;
    await writer.query("begin"); const receipt = await save(body);
    const pid = Number((await legacy.query("select pg_backend_pid() as pid")).rows[0].pid);
    const pending = mutate(legacy, table, action);
    try {
      await waitForTryoutsLock(pid, writer); await writer.query("commit"); await pending;
      const latest = await load(body.operationId); expect(BigInt(latest.revision)).toBe(BigInt(receipt.revision) + BigInt(1));
      expect(latest.operation).toEqual({ status: "committed", receipt }); expect(await save(body)).toEqual(receipt); await expectLegacy(table, action, latest);
    } finally { await writer.query("rollback"); await pending; }
  });
});
