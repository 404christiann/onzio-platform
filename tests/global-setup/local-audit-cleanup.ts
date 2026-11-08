import { Client } from "pg";
import { CLUB_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";

// The shared local database keeps every audit row a test run writes for the shared test clubs. Tests
// that commit (and the rows their cleanup deletes) left about 700 per `test:db` run, tens of thousands
// over a few weeks. This records the highest audit id before a database run and, when the run ends,
// removes only what the run itself added for the shared clubs, rows with no club and rows of clubs
// that no longer exist. Rows that were already there are never touched. It does nothing unless the
// run targets the local database, and it never fails a run.
const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres", connectionTimeoutMillis: 3_000 };
const sharedClubs = [CLUB_IDS.alpha, CLUB_IDS.bravo, CLUB_IDS.charlie];
let watermark: string | null = null;

async function withClient<T>(action: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client(config);
  await db.connect();
  try {
    await db.query("set statement_timeout='20s'");
    return await action(db);
  } finally { await db.end().catch(() => undefined); }
}

export async function setup() {
  if (process.env.SUPABASE_LOCAL !== "1") return;
  try {
    assertSafeTestEnvironment();
    watermark = await withClient(async db => (await db.query("select coalesce(max(id),0)::text as id from onzio.audit_events")).rows[0].id as string);
  } catch { watermark = null; }
}

export async function teardown() {
  if (watermark === null) return;
  try {
    const removed = await withClient(db => db.query(
      `delete from onzio.audit_events a where a.id > $1::bigint
         and (a.club_id is null or a.club_id = any($2::uuid[]) or not exists (select 1 from onzio.clubs c where c.id = a.club_id))`,
      [watermark, sharedClubs]));
    console.log(`[local-audit-cleanup] removed ${removed.rowCount} audit rows this run added for the shared test clubs`);
  } catch (error) {
    console.warn(`[local-audit-cleanup] skipped: ${error instanceof Error ? error.message : String(error)}`);
  }
}
