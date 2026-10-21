import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { expect, it } from "vitest";
import { assertSafeTestEnvironment } from "../helpers/environment";

const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };
function migration() {
  const directory = join(process.cwd(), "supabase/migrations");
  const filename = readdirSync(directory).find(name => name.endsWith("_homepage_assignment_saves.sql"));
  if (!filename) throw new Error("Homepage assignment migration not found");
  return readFileSync(join(directory, filename), "utf8");
}
async function installedSnapshot(db: Client) {
  const result = await db.query(`select pg_get_functiondef('onzio_private.homepage_snapshot(uuid)'::regprocedure) as definition,
    (select jsonb_agg(to_jsonb(e) order by club_id) from onzio_private.homepage_assignment_epochs e) as epochs`);
  return result.rows;
}

it("the migration aborts without changes when a writer holds a table lock while waiting for the homepage lock", async () => {
  assertSafeTestEnvironment();
  const observer = new Client(config), holder = new Client(config), writer = new Client(config), migrator = new Client(config);
  await Promise.all([observer.connect(), holder.connect(), writer.connect(), migrator.connect()]);
  let pending: Promise<unknown> | undefined;
  try {
    const before = await installedSnapshot(observer);
    await holder.query("begin");
    await holder.query("select pg_advisory_xact_lock(734901281)");
    await writer.query("begin");
    await writer.query("set local statement_timeout='8s'");
    const pid = Number((await writer.query("select pg_backend_pid() as pid")).rows[0].pid);
    pending = writer.query("update onzio.presentation_state set published_document_id=published_document_id where club_id='11111111-1111-4111-8111-111111111111'").then(() => null, error => error);
    await expect.poll(async () => (await observer.query("select wait_event from pg_stat_activity where pid=$1", [pid])).rows[0]?.wait_event).toBe("advisory");
    await migrator.query("begin");
    await migrator.query("set local statement_timeout='2s'");
    await expect(migrator.query(migration())).rejects.toMatchObject({ code: "55P03" });
    await migrator.query("rollback");
    expect(await installedSnapshot(observer)).toEqual(before);
    await holder.query("rollback");
    expect(await pending).toBeNull();
    await writer.query("rollback");
  } finally {
    await holder.query("rollback");
    if (pending) await pending;
    await writer.query("rollback");
    await migrator.query("rollback");
    await Promise.all([observer.end(), holder.end(), writer.end(), migrator.end()]);
  }
});

it("the migration releases its table locks after a failed nonblocking homepage-lock attempt", async () => {
  assertSafeTestEnvironment();
  const observer = new Client(config), holder = new Client(config), migrator = new Client(config), writer = new Client(config);
  await Promise.all([observer.connect(), holder.connect(), migrator.connect(), writer.connect()]);
  try {
    const before = await installedSnapshot(observer);
    await holder.query("begin");
    await holder.query("select pg_advisory_xact_lock(734901281)");
    await migrator.query("begin");
    await migrator.query("set local statement_timeout='2s'");
    await expect(migrator.query(migration())).rejects.toMatchObject({ code: "55P03" });
    await migrator.query("rollback");
    expect(await installedSnapshot(observer)).toEqual(before);
    await writer.query("begin");
    await writer.query("lock table onzio.clubs,onzio.presentation_documents,onzio.presentation_state in access exclusive mode nowait");
    await writer.query("rollback");
  } finally {
    await holder.query("rollback");
    await migrator.query("rollback");
    await writer.query("rollback");
    await Promise.all([observer.end(), holder.end(), migrator.end(), writer.end()]);
  }
});
