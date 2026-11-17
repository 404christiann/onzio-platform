import { Client } from "pg";
import { expect } from "@playwright/test";

export function localContactDatabase() {
  return new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
}

const club = "11111111-1111-4111-8111-111111111111";
const tables = ["onzio.clubs", "onzio.presentation_state", "onzio.presentation_documents", "onzio.presentation_publications", "onzio.contact_profile", "onzio.contact_page_content", "onzio_private.contact_editor_revisions", "onzio_private.contact_editor_receipts"] as const;
export type ContactRows = Map<typeof tables[number], Record<string, unknown>[]>;

export async function captureContactRows(db: Client): Promise<ContactRows> {
  const rows: ContactRows = new Map();
  for (const table of tables) {
    const column = table === "onzio.clubs" ? "id" : "club_id";
    rows.set(table, (await db.query(`select to_jsonb(t) as row from ${table} t where ${column}=$1 order by to_jsonb(t)::text`, [club])).rows.map(item => item.row));
  }
  return rows;
}

export async function restoreContactRows(db: Client, before: ContactRows) {
  await db.query("begin");
  try {
    await db.query("set local session_replication_role=replica");
    const current = await captureContactRows(db);
    for (const table of tables) {
      if (JSON.stringify(current.get(table)) === JSON.stringify(before.get(table))) continue;
      if (table === "onzio.clubs") {
        for (const row of before.get(table)!) {
          const columns = Object.keys(row).map(column => `"${column.replaceAll('"', '""')}"`).join(",");
          await db.query(`update ${table} set (${columns})=(select ${columns} from jsonb_populate_record(null::${table},$1::jsonb)) where id=$2`, [JSON.stringify(row), club]);
        }
      } else {
        await db.query(`delete from ${table} where club_id=$1`, [club]);
        for (const row of before.get(table)!) await db.query(`insert into ${table} select * from jsonb_populate_record(null::${table},$1::jsonb)`, [JSON.stringify(row)]);
      }
    }
    await db.query("commit");
  } catch (error) { await db.query("rollback"); throw error; }
  expect((await db.query("show session_replication_role")).rows[0].session_replication_role).toBe("origin");
  expect(await captureContactRows(db)).toEqual(before);
}
