import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";

const connection = () => new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
const profile = { public_email: "concurrent@example.test", public_phone: "312 731 9479", service_area: "Chicago", hours: "Weekdays" };
const page = { eyebrow: "CONTACT", headline: "Concurrent Contact", intro: "Everyone is welcome.", hero_media_asset_id: null };
let admin: Client, legacy: Client, writer: Client, club: string;
async function authenticate() {
  const timestamp = Number((await writer.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await writer.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: USER_IDS.ownerAal2, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp }] })]);
  await writer.query("set role authenticated");
}
async function load(operationId: string | null = null) {
  return (await writer.query("select onzio.load_contact_editor($1,$2) as data", [club, operationId])).rows[0].data;
}
async function save(body: unknown) {
  return (await writer.query("select onzio.save_contact_editor($1,$2::jsonb) as data", [club, JSON.stringify(body)])).rows[0].data;
}
async function request() { return { operationId: randomUUID(), expectedRevision: (await load()).revision, profile, page }; }
async function waitForContactLock(pid: number) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const locks = await admin.query("select granted from pg_locks where pid=$1 and locktype='advisory' and classid=0 and objid=734901289", [pid]);
    if (locks.rows.some(row => row.granted === false)) return;
    await new Promise(resolve => setTimeout(resolve, 15));
  }
  throw new Error("No observed wait for Contact advisory lock 734901289");
}
beforeEach(async () => {
  assertSafeTestEnvironment(); admin = connection(); legacy = connection(); writer = connection();
  await Promise.all([admin.connect(), legacy.connect(), writer.connect()]);
  for (const db of [admin, legacy, writer]) await db.query("set statement_timeout='8s'");
  club = randomUUID();
  await admin.query("insert into onzio.clubs(id,slug,name,kind,lifecycle,public_access) values($1,$2,'Contact concurrency','test','active','live')", [club, `contact-concurrent-${club}`]);
  await admin.query("insert into onzio.club_members(club_id,user_id,role,status) values($1,$2,'owner','active')", [club, USER_IDS.ownerAal2]);
  await authenticate(); await save(await request());
});
afterEach(async () => {
  if (legacy) await legacy.query("rollback").catch(() => undefined);
  if (writer) await writer.query("rollback").catch(() => undefined);
  if (legacy) await legacy.end(); if (writer) await writer.end();
  if (admin) {
    for (const table of ["contact_profile", "contact_page_content", "club_members", "audit_events"]) await admin.query(`delete from onzio.${table} where club_id=$1`, [club]);
    await admin.query("delete from onzio.clubs where id=$1", [club]);
    for (const table of ["onzio.clubs", "onzio_private.contact_editor_revisions", "onzio_private.contact_editor_receipts"]) expect((await admin.query(`select count(*)::int as count from ${table} where ${table === "onzio.clubs" ? "id" : "club_id"}=$1`, [club])).rows).toEqual([{ count: 0 }]);
    await admin.end();
  }
});

describe("Contact content serialization on independent connections", () => {
  it.each(["contact_profile", "contact_page_content"])("waits for legacy %s, rejects stale save atomically, then accepts a fresh save", async table => {
    const stale = await request(), pid = Number((await writer.query("select pg_backend_pid() as pid")).rows[0].pid);
    await legacy.query("begin");
    await legacy.query(`update onzio.${table} set ${table === "contact_profile" ? "hours='Legacy hours'" : "headline='Legacy headline'"} where club_id=$1`, [club]);
    const pending = save(stale).then(value => ({ value, error: null as Error | null }), error => ({ value: null, error: error as Error }));
    try {
      await waitForContactLock(pid); await legacy.query("commit");
      const outcome = await pending; expect(outcome.error).toMatchObject({ message: "CONTACT_CHANGED", code: "PT409" });
      const latest = await load(stale.operationId);
      expect(latest.operation).toEqual({ status: "not-committed" });
      expect(latest.profile).toEqual(table === "contact_profile" ? { ...profile, hours: "Legacy hours" } : profile);
      expect(latest.page).toEqual(table === "contact_page_content" ? { ...page, headline: "Legacy headline" } : page);
      expect((await admin.query("select count(*)::int as count from onzio_private.contact_editor_receipts where club_id=$1 and operation_id=$2", [club, stale.operationId])).rows).toEqual([{ count: 0 }]);
      const fresh = await request(); expect(await save(fresh)).toMatchObject({ profile, page });
    } finally { await legacy.query("rollback"); await pending; }
  });
  it.each(["contact_profile", "contact_page_content"])("makes legacy %s wait for committed RPC and advance the shared revision", async table => {
    const body = await request(); await writer.query("begin"); const receipt = await save(body);
    const pid = Number((await legacy.query("select pg_backend_pid() as pid")).rows[0].pid);
    const pending = legacy.query(`update onzio.${table} set ${table === "contact_profile" ? "hours='Legacy after RPC'" : "headline='Legacy after RPC'"} where club_id=$1`, [club]);
    try {
      await waitForContactLock(pid); await writer.query("commit"); await pending;
      const latest = await load(body.operationId); expect(BigInt(latest.revision)).toBe(BigInt(receipt.revision) + BigInt(1));
      expect(latest.operation).toEqual({ status: "committed", receipt }); expect(await save(body)).toEqual(receipt);
      expect(latest[table === "contact_profile" ? "profile" : "page"][table === "contact_profile" ? "hours" : "headline"]).toBe("Legacy after RPC");
    } finally { await writer.query("rollback"); await pending; }
  });
});
