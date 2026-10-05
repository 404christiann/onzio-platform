import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, it } from "vitest";
import { USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";

const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };
async function actor(client: Client) {
  const timestamp = Number((await client.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: USER_IDS.ownerAal2, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp }] })]);
  await client.query("set local role authenticated");
}
async function fixture(client: Client) {
  const clubId = randomUUID();
  await client.query("insert into onzio.clubs(id,slug,name,kind,lifecycle,public_access) values($1,$2,'About concurrency fixture','test','active','live')", [clubId, `about-${clubId}`]);
  await client.query("insert into onzio.club_members(club_id,user_id,role,status) values($1,$2,'owner','active')", [clubId, USER_IDS.ownerAal2]);
  return { clubId };
}
async function cleanup(client: Client, clubId: string) {
  for (const table of ["about_page_content", "club_logo_page_content", "club_members", "audit_events"]) {
    await client.query(`delete from onzio.${table} where club_id=$1`, [clubId]);
  }
  await client.query("delete from onzio.clubs where id=$1", [clubId]);
}
function request(snapshot: any) {
  return { operationId: randomUUID(), page: "about", expectedRevision: snapshot.revision, designRevision: snapshot.designRevision,
    content: { hero_title: "Concurrent draft", story_paragraphs: [], feature_image_url: "", values_heading: "Values", values: [], closing_text: "Join", closing_cta_label: "Schedule", closing_cta_href: "/schedule" } };
}

it("waits for an independent design availability change and rejects its stale About design", async () => {
  assertSafeTestEnvironment();
  const setup = new Client(config), publisher = new Client(config), editor = new Client(config);
  await Promise.all([setup.connect(), publisher.connect(), editor.connect()]);
  let clubId: string | undefined;
  try {
    const created = await fixture(setup); clubId = created.clubId;
    await publisher.query("begin"); await publisher.query("set local statement_timeout='5s'"); await editor.query("begin");
    await editor.query("set local statement_timeout='5s'"); await actor(editor);
    const baseline = (await editor.query("select onzio.load_about_editor($1,'about') as data", [clubId])).rows[0].data;
    const payload = request(baseline);
    // load_about_editor holds the same transaction locks as Save. End the
    // read transaction before testing an independent design change against Save.
    await editor.query("commit"); await editor.query("begin");
    await editor.query("set local statement_timeout='5s'"); await actor(editor);
    const pid = (await editor.query("select pg_backend_pid() as pid")).rows[0].pid;
    // Store availability uses the same presentation serialization trigger and
    // contributes to About designRevision, without creating immutable history.
    await publisher.query("update onzio.clubs set store_enabled=not store_enabled where id=$1", [clubId]);
    let settled = false;
    const competing = editor.query("select onzio.save_about_editor($1,$2::jsonb)", [clubId, JSON.stringify(payload)])
      .then(value => { settled = true; return { value, error: null }; }, error => { settled = true; return { value: null, error }; });
    await expect.poll(async () => (await setup.query("select wait_event from pg_stat_activity where pid=$1", [pid])).rows[0]?.wait_event).toBe("advisory");
    expect(settled).toBe(false);
    await publisher.query("commit");
    const outcome = await competing;
    expect(outcome.error).toMatchObject({ message: "DESIGN_CHANGED", code: "PT409" });
    await editor.query("rollback");
    expect((await setup.query("select count(*)::int as count from onzio.about_page_content where club_id=$1", [clubId])).rows[0].count).toBe(0);
    expect((await setup.query("select count(*)::int as count from onzio_private.about_editor_receipts where club_id=$1", [clubId])).rows[0].count).toBe(0);
  } finally {
    await Promise.all([publisher.query("rollback"), editor.query("rollback")]);
    if (clubId) await cleanup(setup, clubId);
    await Promise.all([setup.end(), publisher.end(), editor.end()]);
  }
});

it("removes private About revisions and receipts during the existing club purge sequence", async () => {
  assertSafeTestEnvironment(); const db = new Client(config); await db.connect();
  let clubId: string | undefined;
  try {
    clubId = (await fixture(db)).clubId;
    await db.query("begin"); await actor(db);
    const baseline = (await db.query("select onzio.load_about_editor($1,'about') as data", [clubId])).rows[0].data;
    await db.query("select onzio.save_about_editor($1,$2::jsonb)", [clubId, JSON.stringify(request(baseline))]);
    await db.query("commit");
    expect((await db.query("select count(*)::int as count from onzio_private.about_editor_receipts where club_id=$1", [clubId])).rows[0].count).toBe(1);
    await cleanup(db, clubId);
    for (const table of ["about_editor_revisions", "about_editor_receipts"]) {
      expect((await db.query(`select count(*)::int as count from onzio_private.${table} where club_id=$1`, [clubId])).rows[0].count).toBe(0);
    }
    clubId = undefined;
  } finally { await db.query("rollback"); await db.query("reset role"); if (clubId) await cleanup(db, clubId); await db.end(); }
});
