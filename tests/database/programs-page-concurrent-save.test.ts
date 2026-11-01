import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";

const connection = () => new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
const blank = {
  slug: "recreated-program", nav_label: "", display_title: "Recreated program", kicker: "", summary: "", body: "", highlights: [], layout_variant: "statement_band",
  hero_media_asset_id: null, detail_media_asset_id: null, external_cta_label: "", external_cta_href: "", registration_form_id: null, registration_enabled: false,
  registration_eyebrow: "", registration_headline: "", registration_body: "", registration_pending_body: "", registration_pending_label: "", status: "active", sort_order: 0,
};
const fields = Object.keys(blank);
let admin: Client, legacy: Client, writer: Client, club: string, programId: string;
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

type Surface = "page" | "directory";
type Race = { surface: Surface; table: "programs" | "program_media"; action: "insert" | "update" | "delete"; conflicts: boolean };
const races: Race[] = [
  { surface: "page", table: "programs", action: "insert", conflicts: false },
  { surface: "page", table: "programs", action: "update", conflicts: true },
  { surface: "page", table: "programs", action: "delete", conflicts: true },
  { surface: "page", table: "program_media", action: "insert", conflicts: true },
  { surface: "page", table: "program_media", action: "update", conflicts: true },
  { surface: "page", table: "program_media", action: "delete", conflicts: true },
  { surface: "directory", table: "programs", action: "insert", conflicts: true },
  { surface: "directory", table: "programs", action: "update", conflicts: true },
  { surface: "directory", table: "programs", action: "delete", conflicts: true },
];

async function authenticate() {
  const timestamp = Number((await writer.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await writer.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: USER_IDS.ownerAal2, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp }] })]);
  await writer.query("set role authenticated");
}
const loadPage = async (operationId: string | null = null) => (await writer.query("select onzio.load_program_page($1,$2,$3) as data", [club, programId, operationId])).rows[0].data;
const loadDirectory = async (operationId: string | null = null) => (await writer.query("select onzio.load_program_directory($1,$2) as data", [club, operationId])).rows[0].data;
const loadStatus = (surface: Surface, operationId: string) => surface === "page" ? loadPage(operationId) : loadDirectory(operationId);
const save = async (surface: Surface, body: unknown) =>
  (await writer.query(`select onzio.save_program_${surface === "page" ? "page" : "directory"}($1,$2::jsonb) as data`, [club, JSON.stringify(body)])).rows[0].data;
const receiptTable = (surface: Surface) => surface === "page" ? "program_page_receipts" : "program_directory_receipts";

async function request(surface: Surface) {
  if (surface === "directory") {
    const listed = await loadDirectory();
    return {
      operationId: randomUUID(), expected: listed.programs.map((row: any) => ({ id: row.id, updatedAt: row.updated_at })),
      programs: listed.programs.map((row: any, sortOrder: number) => ({ id: row.id, sortOrder, status: row.id === programId ? "hidden" : row.status })),
    };
  }
  const snapshot = await loadPage(), row = snapshot.program;
  return {
    operationId: randomUUID(), programId: row ? row.id : null,
    expected: { programUpdatedAt: row ? row.updated_at : null, gallery: snapshot.gallery.map((item: any) => ({ id: item.id, updatedAt: item.updated_at })) },
    program: { ...(row ? Object.fromEntries(fields.map(key => [key, row[key]])) : blank), display_title: "Writer save" },
    gallery: snapshot.gallery.map((item: any, sortOrder: number) => ({ id: item.id, mediaAssetId: item.media_asset_id, alt: item.alt, sortOrder })),
  };
}
function mutate(db: Client, { table, action }: Race) {
  if (table === "programs") {
    if (action === "insert") return db.query("insert into onzio.programs(club_id,slug,display_title) values($1,'legacy-other','Legacy other')", [club]);
    if (action === "update") return db.query("update onzio.programs set body='Legacy mutation' where id=$1", [programId]);
    return db.query("delete from onzio.programs where id=$1", [programId]);
  }
  if (action === "insert") return db.query("insert into onzio.program_media(club_id,program_id,url,alt,sort_order) values($1,$2,'/legacy.webp','Legacy',1)", [club, programId]);
  if (action === "update") return db.query("update onzio.program_media set alt='Legacy mutation' where program_id=$1", [programId]);
  return db.query("delete from onzio.program_media where program_id=$1", [programId]);
}
async function expectLegacy({ table, action }: Race) {
  const page = await loadPage(), directory = await loadDirectory();
  if (table === "programs") {
    if (action === "insert") expect(directory.programs.map((row: any) => row.slug).sort()).toEqual(["concurrent-program", "legacy-other"]);
    if (action === "update") expect(page.program.body).toBe("Legacy mutation");
    if (action === "delete") { expect(page.program).toBeNull(); expect(directory.programs).toEqual([]); }
    return;
  }
  expect(page.gallery.map((item: any) => item.alt).sort()).toEqual(action === "insert" ? ["Legacy", "Original photo"] : action === "update" ? ["Legacy mutation"] : []);
}
async function waitForProgramsLock(pid: number, holder: Client) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const locks = await admin.query("select granted from pg_locks where pid=$1 and locktype='advisory' and classid=0 and objid=734901281", [pid]);
    if (locks.rows.some(row => row.granted === false)) {
      const holderPid = Number((await holder.query("select pg_backend_pid() as pid")).rows[0].pid);
      expect((await admin.query("select objid::int as lock from pg_locks where pid=$1 and locktype='advisory' and classid=0 and objid in (734901281,734901284) and granted order by objid", [holderPid])).rows).toEqual([{ lock: 734901281 }, { lock: 734901284 }]);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 15));
  }
  throw new Error("No observed wait for Programs advisory lock 734901281");
}
const receipts = async (surface: Surface, operationId: string) =>
  (await admin.query(`select count(*)::int as count from onzio_private.${receiptTable(surface)} where club_id=$1 and operation_id=$2`, [club, operationId])).rows[0].count;
const backendPid = async (db: Client) => Number((await db.query("select pg_backend_pid() as pid")).rows[0].pid);

beforeEach(async () => {
  assertSafeTestEnvironment(); admin = connection(); legacy = connection(); writer = connection();
  await Promise.all([admin.connect(), legacy.connect(), writer.connect()]);
  for (const db of [admin, legacy, writer]) await db.query("set statement_timeout='20s'");
  club = randomUUID(); programId = randomUUID();
  await admin.query("insert into onzio.clubs(id,slug,name,kind,lifecycle,public_access) values($1,$2,'Programs concurrency','test','active','live')", [club, `programs-concurrent-${club}`]);
  await admin.query("insert into onzio.club_members(club_id,user_id,role,status) values($1,$2,'owner','active')", [club, USER_IDS.ownerAal2]);
  await admin.query("insert into onzio.programs(id,club_id,slug,display_title) values($1,$2,'concurrent-program','Original program')", [programId, club]);
  await admin.query("insert into onzio.program_media(club_id,program_id,url,alt,sort_order) values($1,$2,'/original.webp','Original photo',0)", [club, programId]);
  await authenticate();
});
afterEach(async () => {
  if (legacy) await legacy.query("rollback").catch(() => undefined);
  if (writer) await writer.query("rollback").catch(() => undefined);
  if (legacy) await legacy.end();
  if (writer) await writer.end();
  if (admin) {
    for (const table of ["program_media", "programs", "club_members", "audit_events"]) await admin.query(`delete from onzio.${table} where club_id=$1`, [club]);
    await admin.query("delete from onzio.clubs where id=$1", [club]);
    for (const table of ["onzio.clubs", "onzio_private.program_page_receipts", "onzio_private.program_directory_receipts"]) {
      expect((await admin.query(`select count(*)::int as count from ${table} where ${table === "onzio.clubs" ? "id" : "club_id"}=$1`, [club])).rows).toEqual([{ count: 0 }]);
    }
    await admin.end();
  }
});

describe("Programs content serialization on independent connections", () => {
  it.each(races)("waits for legacy $surface-save $table $action, then decides the stale save (conflicts=$conflicts)", async race => {
    const stale = await request(race.surface), pid = await backendPid(writer);
    await legacy.query("begin"); await mutate(legacy, race);
    const pending = save(race.surface, stale).then(value => ({ value, error: null as Error | null }), error => ({ value: null, error: error as Error }));
    try {
      await waitForProgramsLock(pid, legacy); await legacy.query("commit");
      const outcome = await pending;
      if (race.conflicts) {
        expect(outcome.error).toMatchObject({ message: "CONTENT_CHANGED", code: "PT409" });
        expect((await loadStatus(race.surface, stale.operationId)).operation).toEqual({ status: "not-committed" });
        expect(await receipts(race.surface, stale.operationId)).toBe(0);
        await expectLegacy(race);
        const fresh = await request(race.surface), saved = await save(race.surface, fresh);
        expect(saved.operationId).toBe(fresh.operationId);
        expect(await receipts(race.surface, fresh.operationId)).toBe(1);
      } else {
        expect(outcome.error).toBeNull();
        expect(outcome.value!.program.display_title).toBe("Writer save");
        expect(await receipts(race.surface, stale.operationId)).toBe(1);
        await expectLegacy(race);
      }
    } finally { await legacy.query("rollback"); await pending; }
  });

  it.each(races)("makes legacy $surface-save $table $action wait for the committed save and keeps its receipt (conflicts=$conflicts)", async race => {
    const body = await request(race.surface);
    await writer.query("begin"); const receipt = await save(race.surface, body);
    const pid = await backendPid(legacy);
    const pending = mutate(legacy, race);
    try {
      await waitForProgramsLock(pid, writer); await writer.query("commit"); await pending;
      expect((await loadStatus(race.surface, body.operationId)).operation).toEqual({ status: "committed", receipt });
      expect(await save(race.surface, body)).toEqual(receipt);
      expect(await receipts(race.surface, body.operationId)).toBe(1);
      await expectLegacy(race);
    } finally { await writer.query("rollback"); await pending; }
  });
});
