import { Client } from "pg";
import { CLUB_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "./environment";

// The shared local database keeps whatever a test run commits and does not delete. Left alone it grows
// with every run: audit rows for the shared test clubs (about 700 per `test:db` run, tens of thousands
// over a few weeks), Stripe and email event records, Supabase auth log entries, and published
// presentation documents. This records where the database stood before a local run and, when the run
// ends, removes only what the run itself added. Rows that were already there are never touched. It
// does nothing unless the run targets the local database, and it never fails a run.
// Used by the vitest `globalSetup` (tests/global-setup) and by the local Playwright configs.
const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres", connectionTimeoutMillis: 3_000 };
const sharedClubs = [CLUB_IDS.alpha, CLUB_IDS.bravo, CLUB_IDS.charlie];
export type LocalTestDataStart = { auditId: string; startedAt: string };

async function withClient<T>(action: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client(config);
  await db.connect();
  try {
    await db.query("set statement_timeout='30s'");
    return await action(db);
  } finally { await db.end().catch(() => undefined); }
}

export async function recordLocalTestDataStart(): Promise<LocalTestDataStart | null> {
  try {
    assertSafeTestEnvironment();
    return await withClient(async db => (await db.query(
      "select coalesce((select max(id) from onzio.audit_events),0)::text as \"auditId\", clock_timestamp()::text as \"startedAt\"")).rows[0] as LocalTestDataStart);
  } catch { return null; }
}

// Presentation documents and publications are immutable on purpose, so a test cannot remove its own.
// Their guard triggers are switched off for one transaction that removes only what this run added and
// nothing still published or referenced by an older publication; any error rolls the whole thing back.
async function removePresentationAdded(db: Client, startedAt: string) {
  await db.query("begin");
  try {
    await db.query("lock table onzio.presentation_documents in access exclusive mode");
    await db.query("alter table onzio.presentation_publications disable trigger presentation_publications_immutable");
    await db.query("alter table onzio.presentation_documents disable trigger presentation_documents_immutable");
    const publications = await db.query("delete from onzio.presentation_publications where created_at >= $1::timestamptz", [startedAt]);
    const documents = await db.query(
      `delete from onzio.presentation_documents d where d.created_at >= $1::timestamptz
         and not exists (select 1 from onzio.presentation_state s where s.published_document_id = d.id)
         and not exists (select 1 from onzio.presentation_publications p where p.previous_document_id = d.id or p.next_document_id = d.id)`,
      [startedAt]);
    await db.query("alter table onzio.presentation_documents enable trigger presentation_documents_immutable");
    await db.query("alter table onzio.presentation_publications enable trigger presentation_publications_immutable");
    await db.query("commit");
    return `${publications.rowCount} presentation publications, ${documents.rowCount} presentation documents`;
  } catch (error) {
    await db.query("rollback").catch(() => undefined);
    throw error;
  }
}

export async function removeLocalTestDataAddedSince(before: LocalTestDataStart | null) {
  if (before === null) return;
  const { auditId, startedAt } = before;
  const removed: string[] = [];
  const skipped: string[] = [];
  const attempt = async (label: string, run: (db: Client) => Promise<string>) => {
    try { removed.push(await withClient(run)); } catch (error) { skipped.push(`${label}: ${error instanceof Error ? error.message : String(error)}`); }
  };
  await attempt("audit rows", async db => {
    const result = await db.query(
      `delete from onzio.audit_events a where a.id > $1::bigint
         and (a.club_id is null or a.club_id = any($2::uuid[]) or not exists (select 1 from onzio.clubs c where c.id = a.club_id))`,
      [auditId, sharedClubs]);
    return `${result.rowCount} audit rows`;
  });
  for (const [label, table] of [["Stripe events", "onzio.stripe_events"], ["email delivery events", "onzio.email_delivery_events"], ["auth log entries", "auth.audit_log_entries"]] as const) {
    await attempt(label, async db => `${(await db.query(`delete from ${table} where created_at >= $1::timestamptz`, [startedAt])).rowCount} ${label}`);
  }
  await attempt("presentation documents", db => removePresentationAdded(db, startedAt));
  console.log(`[local-test-data-cleanup] removed what this run added: ${removed.join(", ")}`);
  if (skipped.length) console.warn(`[local-test-data-cleanup] skipped: ${skipped.join("; ")}`);
}
