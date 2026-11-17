import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { createFreshLocalClient } from "../helpers/mfa";

const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };
const club = CLUB_IDS.alpha;
const migration = "supabase/migrations/20261030170000_programs_content_policy.sql";
const historicalMigration = "supabase/migrations/20261002204000_program_page_atomic_save.sql";
const functions = ["load_program_page", "save_program_page", "load_program_directory", "save_program_directory"];
const PAYLOAD = "INVALID_PROGRAM_PAGE_PAYLOAD";
const MEDIA = "INVALID_PROGRAM_MEDIA";
const program = {
  slug: "maintained-program", nav_label: "Pathway", display_title: "Maintained program", kicker: "Ages 8 to 12", summary: "A full season of training.",
  body: "Weekly sessions and match days.", highlights: ["Small groups", "Qualified coaches"], layout_variant: "detail_focus",
  hero_media_asset_id: null, detail_media_asset_id: null, external_cta_label: "Apply", external_cta_href: "https://registration.example.test/apply?program=maintained#start",
  registration_form_id: null, registration_enabled: true, registration_eyebrow: "REGISTER", registration_headline: "Join this program", registration_body: "Spaces are limited.",
  registration_pending_body: "Registration opens soon.", registration_pending_label: "Opening soon", status: "active", sort_order: 0,
};
const fields = Object.keys(program);
const empty = { program: null, gallery: [] };
let db: Client;

async function actor(user: string = USER_IDS.ownerAal2, ageDays = 0, amr = true) {
  await db.query("reset role");
  const second = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user, role: "authenticated", aal: "aal1", ...(amr ? { amr: [{ method: "otp", timestamp: second - ageDays * 86400 }] } : {}) })]);
  await db.query("set local role authenticated");
}
async function design(template: string | null, id: string = club) {
  await db.query("reset role");
  if (template === null) await db.query("delete from onzio.presentation_state where club_id=$1", [id]);
  else {
    const document = randomUUID();
    await db.query(`insert into onzio.presentation_documents(id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
      values($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,$3,1,$4,$5,$6)`,
    [document, id, template, { schemaVersion: 1, template: { id: template, version: 1 }, navigation: { groups: [{ routes: ["home"] }] } }, "a".repeat(64), USER_IDS.ownerAal2]);
    await db.query(`insert into onzio.presentation_state(club_id,published_document_id,updated_by) values($1,$2,$3)
      on conflict(club_id) do update set published_document_id=excluded.published_document_id`, [id, document, USER_IDS.ownerAal2]);
  }
  await actor();
}
async function newClub() {
  await db.query("reset role");
  const id = randomUUID();
  await db.query("insert into onzio.clubs(id,slug,name,kind,lifecycle,public_access) values($1,$2,'Programs policy','test','active','live')", [id, `programs-policy-${id}`]);
  await db.query("insert into onzio.club_members(club_id,user_id,role,status) values($1,$2,'owner','active')", [id, USER_IDS.ownerAal2]);
  return id;
}
async function asset(changes: { owner?: string; surface?: string; status?: string; deleted?: boolean } = {}) {
  await db.query("reset role");
  const id = randomUUID(), owner = changes.owner ?? club;
  await db.query(`insert into onzio.media_assets(id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at,deleted_at,created_by)
    values($1,$2,'onzio-media',$3,$4,'photograph','image/webp',100,50,50,$5,$6,now(),$7,$8)`,
  [id, owner, `${owner}/programs/${id}.webp`, changes.surface ?? "programs", "b".repeat(64), changes.status ?? "published", changes.deleted ? new Date() : null, USER_IDS.ownerAal2]);
  await actor();
  return id;
}
async function form(id: string = club) {
  await db.query("reset role");
  const formId = randomUUID();
  await db.query("insert into onzio.registration_forms(id,club_id,slug,title,status) values($1,$2,$3,'Registration','draft')", [formId, id, `form-${formId}`]);
  await actor();
  return formId;
}
async function legacy(sql: string, ...args: unknown[]) {
  await db.query("reset role");
  await db.query(sql, args);
  await actor();
}

const loadPage = async (programId: string | null = null, operationId: string | null = null, id: string = club) =>
  (await db.query("select onzio.load_program_page($1,$2,$3) as data", [id, programId, operationId])).rows[0].data;
const loadDirectory = async (operationId: string | null = null, id: string = club) =>
  (await db.query("select onzio.load_program_directory($1,$2) as data", [id, operationId])).rows[0].data;
const savePage = async (body: unknown, id: string = club) =>
  (await db.query("select onzio.save_program_page($1,$2::jsonb) as data", [id, JSON.stringify(body)])).rows[0].data;
const saveDirectory = async (body: unknown, id: string = club) =>
  (await db.query("select onzio.save_program_directory($1,$2::jsonb) as data", [id, JSON.stringify(body)])).rows[0].data;

const keep = (snapshot: any) => snapshot.gallery.map((item: any, sortOrder: number) => ({ id: item.id, mediaAssetId: item.media_asset_id, alt: item.alt, sortOrder }));
function pageRequest(snapshot: any, changes: Record<string, unknown> = {}, gallery: unknown[] = keep(snapshot), overrides: Record<string, unknown> = {}) {
  const row = snapshot.program;
  return {
    operationId: randomUUID(), programId: row?.id ?? null,
    expected: { programUpdatedAt: row?.updated_at ?? null, gallery: snapshot.gallery.map((item: any) => ({ id: item.id, updatedAt: item.updated_at })) },
    program: { ...(row ? Object.fromEntries(fields.map(key => [key, row[key]])) : program), ...changes }, gallery, ...overrides,
  };
}
function directoryRequest(snapshot: any, hidden: string[] = [], order: any[] = snapshot.programs) {
  return {
    operationId: randomUUID(), expected: snapshot.programs.map((row: any) => ({ id: row.id, updatedAt: row.updated_at })),
    programs: order.map((row, sortOrder) => ({ id: row.id, sortOrder, status: hidden.includes(row.id) ? "hidden" : row.status })),
  };
}
async function created(changes: Record<string, unknown> = {}, gallery: unknown[] = [], id: string = club) {
  const saved = await savePage(pageRequest(empty, changes, gallery), id);
  return { id: saved.program.id as string, saved };
}

async function fingerprint(id: string = club) {
  await db.query("savepoint observation");
  try {
    await db.query("reset role");
    return (await db.query(`select
      (select jsonb_agg(to_jsonb(s) order by id) from onzio.programs s where club_id=$1) as programs,
      (select jsonb_agg(to_jsonb(s) order by id) from onzio.program_media s where club_id=$1) as gallery,
      (select jsonb_agg(to_jsonb(s) order by actor_id,operation_id) from onzio_private.program_page_receipts s where club_id=$1) as page_receipts,
      (select jsonb_agg(to_jsonb(s) order by actor_id,operation_id) from onzio_private.program_directory_receipts s where club_id=$1) as directory_receipts,
      (select count(*)::text||':'||coalesce(max(id),0)::text from onzio.audit_events where club_id=$1) as audit,
      (select jsonb_agg(to_jsonb(s) order by id) from onzio.media_assets s where club_id=$1) as media,
      (select to_jsonb(s) from onzio.presentation_state s where club_id=$1) as presentation`, [id])).rows[0];
  } finally { await db.query("rollback to savepoint observation"); }
}
async function rejected(action: () => Promise<unknown>, error: string, id: string = club, code?: string) {
  const before = await fingerprint(id);
  await db.query("savepoint expected_failure");
  try {
    await expect(action()).rejects.toThrow(error);
    if (code) {
      await db.query("rollback to savepoint expected_failure");
      await expect(action()).rejects.toMatchObject({ code });
    }
  } finally { await db.query("rollback to savepoint expected_failure"); }
  expect(await fingerprint(id)).toEqual(before);
}
const pageDenied = (body: unknown, error = PAYLOAD, id: string = club, code?: string) => rejected(() => savePage(body, id), error, id, code);
const directoryDenied = (body: unknown, error = PAYLOAD, id: string = club, code?: string) => rejected(() => saveDirectory(body, id), error, id, code);
async function receiptCount(table: string, operationId: string) {
  await db.query("savepoint receipt_count");
  try {
    await db.query("reset role");
    return (await db.query(`select count(*)::int as count from onzio_private.${table} where operation_id=$1`, [operationId])).rows[0].count;
  } finally { await db.query("rollback to savepoint receipt_count"); }
}
async function everyRequestDenied(ctx: { programId: string; page: unknown; directory: unknown }, error: string, id: string = club) {
  await rejected(() => loadPage(ctx.programId, null, id), error, id);
  await rejected(() => loadPage(ctx.programId, randomUUID(), id), error, id);
  await rejected(() => loadDirectory(null, id), error, id);
  await rejected(() => loadDirectory(randomUUID(), id), error, id);
  await rejected(() => savePage(ctx.page, id), error, id);
  await rejected(() => saveDirectory(ctx.directory, id), error, id);
}
async function prepared() {
  const { id } = await created({ body: "Prepared" });
  return { programId: id, page: pageRequest(await loadPage(id), { body: "Fresh page save" }), directory: directoryRequest(await loadDirectory(), [id]) };
}
async function withGallery() {
  const photo = await asset(), other = await asset();
  const { id } = await created({}, [{ id: null, mediaAssetId: photo, alt: "First", sortOrder: 0 }]);
  const snapshot = await loadPage(id);
  return { id, photo, other, snapshot, item: keep(snapshot)[0] };
}

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
beforeEach(async () => {
  assertSafeTestEnvironment(); db = new Client(config); await db.connect();
  await db.query("set statement_timeout='30s'"); await db.query("begin"); await actor();
});
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("Programs content independent of display", () => {
  for (const [role, user] of [["owner", USER_IDS.ownerAal2], ["admin", USER_IDS.adminAal2]] as const) {
    it.each([null, "cinematic", "heritage", "academy", "clubhouse", "editorial"])(`lets ${role} maintain full nonempty content under %s`, async template => {
      await design(template);
      const hero = await asset(), detail = await asset(), photo = await asset(), second = await asset(), linked = await form();
      await actor(user);
      const before = await fingerprint();
      const first = await savePage(pageRequest(empty, { hero_media_asset_id: hero, detail_media_asset_id: detail, registration_form_id: linked },
        [{ id: null, mediaAssetId: photo, alt: "Players training", sortOrder: 0 }]));
      expect(first.program).toMatchObject({ ...program, hero_media_asset_id: hero, detail_media_asset_id: detail, registration_form_id: linked, id: expect.any(String) });
      expect(first.gallery).toEqual([expect.objectContaining({ media_asset_id: photo, alt: "Players training", sort_order: 0, url: `/${club}/programs/${photo}.webp` })]);
      expect(await loadPage(first.program.id)).toEqual({ program: first.program, gallery: first.gallery });
      const loaded = await loadPage(first.program.id);
      const updated = await savePage(pageRequest(loaded, { display_title: "Updated program", highlights: ["Updated"], external_cta_href: "/contact" },
        [{ id: loaded.gallery[0].id, mediaAssetId: photo, alt: "Updated alt", sortOrder: 0 }, { id: null, mediaAssetId: second, alt: "Second photo", sortOrder: 1 }]));
      expect(updated.program).toMatchObject({ display_title: "Updated program", highlights: ["Updated"], external_cta_href: "/contact", hero_media_asset_id: hero });
      expect(updated.gallery.map((item: any) => item.alt)).toEqual(["Updated alt", "Second photo"]);
      expect(updated.retiredMediaAssetIds).toEqual([]);
      const listed = await loadDirectory();
      expect(listed.programs.map((row: any) => row.id)).toContain(first.program.id);
      const lead = listed.programs.find((row: any) => row.id === first.program.id);
      const managed = await saveDirectory(directoryRequest(listed, [first.program.id], [lead, ...listed.programs.filter((row: any) => row.id !== lead.id)]));
      expect(managed.programs[0]).toMatchObject({ id: first.program.id, status: "hidden", sort_order: 0 });
      expect(await loadDirectory()).toMatchObject({ programs: managed.programs });
      expect((await fingerprint()).presentation).toEqual(before.presentation);
    });
  }
  it("creates a program and manages the directory on a true legacy club without presentation history", async () => {
    const id = await newClub(); await actor();
    expect(await loadPage(null, null, id)).toEqual(empty);
    expect(await loadDirectory(null, id)).toEqual({ programs: [] });
    const first = await created({}, [], id);
    expect(first.saved.program).toMatchObject(program);
    const hidden = await saveDirectory(directoryRequest(await loadDirectory(null, id), [first.id]), id);
    expect(hidden.programs).toMatchObject([{ id: first.id, status: "hidden", sort_order: 0 }]);
    await db.query("reset role");
    expect((await db.query("select count(*)::int as count from onzio.presentation_documents where club_id=$1", [id])).rows).toEqual([{ count: 0 }]);
  });
  it.each([null, 0, true, [], "invalid"].map(value => ({ value })))("rejects invalid envelope $value on both saves", async ({ value }) => {
    await pageDenied(value); await directoryDenied(value);
  });
});

describe("strict validation and field ownership", () => {
  const pageEnvelope: [string, (body: any) => void][] = [
    ["root extra key", body => { body.club_id = club; }],
    ...["operationId", "programId", "expected", "program", "gallery"].map(key => [`missing ${key}`, (body: any) => { delete body[key]; }] as [string, (body: any) => void]),
    ["expected extra key", body => { body.expected.extra = 1; }],
    ["expected missing programUpdatedAt", body => { delete body.expected.programUpdatedAt; }],
    ["expected missing gallery", body => { delete body.expected.gallery; }],
    ["expected gallery not an array", body => { body.expected.gallery = {}; }],
    ["program extra key", body => { body.program.club_id = club; }],
    ["program missing key", body => { delete body.program.kicker; }],
    ["gallery above 12", body => { body.gallery = Array.from({ length: 13 }, (_, sortOrder) => ({ id: null, mediaAssetId: randomUUID(), alt: "", sortOrder })); }],
    ["gallery not an array", body => { body.gallery = {}; }],
    ["operation id invalid", body => { body.operationId = "bad"; }],
    ["operation id null", body => { body.operationId = null; }],
    ["program id invalid", body => { body.programId = "bad"; }],
    ["highlights above 200", body => { body.program.highlights = Array.from({ length: 201 }, () => "x"); }],
    ["highlight not a string", body => { body.program.highlights = [1]; }],
    ["highlight above 320 characters", body => { body.program.highlights = ["x".repeat(321)]; }],
    ["highlights not an array", body => { body.program.highlights = "x"; }],
    ["invalid layout_variant", body => { body.program.layout_variant = "bad"; }],
    ["invalid status", body => { body.program.status = "bad"; }],
    ["null slug", body => { body.program.slug = null; }],
    ["null display_title", body => { body.program.display_title = null; }],
    ["uncastable field", body => { body.program.registration_enabled = "bad"; }],
  ];
  it.each(pageEnvelope)("denies page %s with no effect", async (_label, mutate) => {
    const body = pageRequest(empty), { operationId } = body; mutate(body); await pageDenied(body);
    expect(await receiptCount("program_page_receipts", operationId)).toBe(0);
  });

  const galleryKinds: [string, (ctx: any) => unknown[], string][] = [
    ["item extra key", ctx => [{ ...ctx.item, extra: 1 }], PAYLOAD],
    ["item missing key", ctx => [{ id: ctx.item.id, mediaAssetId: ctx.item.mediaAssetId, sortOrder: 0 }], PAYLOAD],
    ["item not an object", () => [false], PAYLOAD],
    ["sort order out of position", ctx => [{ ...ctx.item, sortOrder: 1 }], MEDIA],
    ["sort order not a number", ctx => [{ ...ctx.item, sortOrder: "0" }], MEDIA],
    ["alt above 200", ctx => [{ ...ctx.item, alt: "x".repeat(201) }], MEDIA],
    ["alt not a string", ctx => [{ ...ctx.item, alt: null }], MEDIA],
    ["unknown gallery id", ctx => [{ ...ctx.item, id: randomUUID() }], MEDIA],
    ["invalid gallery id", ctx => [{ ...ctx.item, id: "bad" }], MEDIA],
    ["duplicate gallery id", ctx => [ctx.item, { ...ctx.item, sortOrder: 1 }], MEDIA],
    ["repeated asset", ctx => [{ id: null, mediaAssetId: ctx.other, alt: "A", sortOrder: 0 }, { id: null, mediaAssetId: ctx.other, alt: "B", sortOrder: 1 }], MEDIA],
    ["null asset on a new item", ctx => [ctx.item, { id: null, mediaAssetId: null, alt: "New", sortOrder: 1 }], MEDIA],
    ["null asset on an item that has one", ctx => [{ ...ctx.item, mediaAssetId: null }], MEDIA],
    ["invalid asset id", () => [{ id: null, mediaAssetId: "bad", alt: "A", sortOrder: 0 }], MEDIA],
  ];
  it.each(galleryKinds)("denies gallery %s with no effect", async (_label, build, error) => {
    const ctx = await withGallery(); const body = pageRequest(ctx.snapshot, { body: "Must not persist" }, build(ctx));
    await pageDenied(body, error); expect(await receiptCount("program_page_receipts", body.operationId)).toBe(0);
  });

  const directoryKinds: [string, (body: any, foreign: string) => void][] = [
    ["root extra key", body => { body.club_id = club; }],
    ...["operationId", "expected", "programs"].map(key => [`missing ${key}`, (body: any) => { delete body[key]; }] as [string, (body: any) => void]),
    ["operation id invalid", body => { body.operationId = "bad"; }],
    ["operation id null", body => { body.operationId = null; }],
    ["expected not an array", body => { body.expected = {}; }],
    ["programs not an array", body => { body.programs = {}; }],
    ["length mismatch", body => { body.programs.pop(); }],
    ["above 200", body => {
      body.expected = Array.from({ length: 201 }, () => body.expected[0]);
      body.programs = Array.from({ length: 201 }, (_, sortOrder) => ({ ...body.programs[0], sortOrder }));
    }],
    ["expected item extra key", body => { body.expected[0].extra = 1; }],
    ["expected id invalid", body => { body.expected[0].id = "bad"; }],
    ["duplicate expected id", body => { body.expected[1].id = body.expected[0].id; }],
    ["programs item extra key", body => { body.programs[0].extra = 1; }],
    ["programs item missing status", body => { delete body.programs[0].status; }],
    ["unknown program id", body => { body.programs[0].id = randomUUID(); }],
    ["foreign program id", (body, foreign) => { body.programs[0].id = foreign; }],
    ["duplicate program id", body => { body.programs[1].id = body.programs[0].id; }],
    ["sortOrder out of position", body => { body.programs[0].sortOrder = 1; }],
    ["sortOrder not a number", body => { body.programs[0].sortOrder = "0"; }],
    ["invalid status", body => { body.programs[0].status = "bad"; }],
  ];
  it.each(directoryKinds)("denies directory %s with no effect", async (_label, mutate) => {
    await created({ slug: "second-program" }); await created({ slug: "third-program" });
    const foreign = randomUUID();
    await legacy("insert into onzio.programs(id,club_id,slug,display_title) values($1,$2,'foreign-program','Foreign')", foreign, CLUB_IDS.bravo);
    const body: any = directoryRequest(await loadDirectory()), { operationId } = body; mutate(body, foreign);
    await directoryDenied(body); expect(await receiptCount("program_directory_receipts", operationId)).toBe(0);
  });

  it.each([["slug", "changed-public-url"], ["status", "hidden"], ["sort_order", 7]] as const)("denies %s changes on an existing program under a hidden template", async (field, value) => {
    await design("clubhouse"); const { id } = await created();
    const body = pageRequest(await loadPage(id), { [field]: value });
    await pageDenied(body, "FIELD_UNAVAILABLE"); expect(await receiptCount("program_page_receipts", body.operationId)).toBe(0);
    const unchanged = pageRequest(await loadPage(id), { body: "Copy only" });
    expect((await savePage(unchanged)).program).toMatchObject({ slug: program.slug, status: "active", sort_order: 0, body: "Copy only" });
  });

  const accepted = ["", "/", "/programs", "/programs?group=u12#register", "https://registration.example.test/form", "http://registration.example.test/form", "mailto:join@example.test",
    "/path with-space", "/\\evil.test", "/path\ncontrol"];
  const deniedBySql = ["//evil.test", "//", "javascript:alert(1)", "data:text/html,a", "tel:123", "ftp://example.test/file", "relative/path", "https://", "mailto:",
    " https://example.test", "https://exa mple.test", "mailto:join @example.test"];
  const deniedByTable = ["HTTPS://EXAMPLE.TEST", "MAILTO:join@example.test", `/${"x".repeat(2048)}`];
  it.each(accepted)("accepts href %j", async external_cta_href => {
    expect((await savePage(pageRequest(empty, { external_cta_href }))).program.external_cta_href).toBe(external_cta_href);
  });
  it.each(deniedBySql)("denies href %j in the SQL predicate", async external_cta_href => { await pageDenied(pageRequest(empty, { external_cta_href })); });
  it.each(deniedByTable)("denies href %j at the table constraint", async external_cta_href => {
    await pageDenied(pageRequest(empty, { external_cta_href }), "check constraint", club, "23514");
  });

  const unusableMedia: [string, Record<string, unknown> | "missing"][] = [["foreign owner", { owner: CLUB_IDS.bravo }], ["wrong surface", { surface: "tryouts" }],
    ["staged", { status: "staged" }], ["orphaned", { status: "orphaned" }], ["deleted", { deleted: true }], ["missing", "missing"]];
  it.each(["hero", "detail", "gallery"].flatMap(slot => unusableMedia.map(([kind, changes]) => [slot, kind, changes] as const)))("rejects %s media that is %s", async (slot, _kind, changes) => {
    const media = changes === "missing" ? randomUUID() : await asset(changes);
    const body = slot === "gallery" ? pageRequest(empty, {}, [{ id: null, mediaAssetId: media, alt: "A", sortOrder: 0 }]) : pageRequest(empty, { [`${slot}_media_asset_id`]: media });
    await pageDenied(body, MEDIA); expect(await receiptCount("program_page_receipts", body.operationId)).toBe(0);
  });
});

describe("content revision CAS", () => {
  const staleness: [string, string][] = [
    ["stale programUpdatedAt", "update onzio.programs set body='Legacy edit' where id=$1"],
    ["stale gallery updatedAt", "update onzio.program_media set alt='Legacy edit' where program_id=$1"],
    ["stale gallery count", "insert into onzio.program_media(club_id,program_id,url,alt,sort_order) select club_id,id,'/legacy.webp','Legacy',5 from onzio.programs where id=$1"],
  ];
  it.each(staleness)("fails %s with CONTENT_CHANGED, no receipt and no effect", async (_label, change) => {
    const { id, snapshot } = await withGallery(); const body = pageRequest(snapshot, { body: "Stale save" });
    await legacy(change, id);
    await pageDenied(body, "CONTENT_CHANGED", club, "PT409"); expect(await receiptCount("program_page_receipts", body.operationId)).toBe(0);
    expect((await loadPage(id)).program.body).not.toBe("Stale save");
  });
  const mismatches: [string, (body: any, snapshot: any) => void][] = [
    ["programId null with a baseline", (body: any, snapshot: any) => { body.programId = null; body.expected.programUpdatedAt = snapshot.program.updated_at; }],
    ["existing programId without a baseline", (body: any) => { body.expected.programUpdatedAt = null; }],
    ["unknown programId", (body: any) => { body.programId = randomUUID(); }],
    ["expected gallery with a foreign id", (body: any) => { body.expected.gallery[0].id = randomUUID(); }],
  ];
  it.each(mismatches)("fails %s with CONTENT_CHANGED", async (_label, mutate) => {
    const { snapshot } = await withGallery(); const body: any = pageRequest(snapshot, { body: "Mismatched baseline" }); mutate(body, snapshot);
    await pageDenied(body, "CONTENT_CHANGED", club, "PT409"); expect(await receiptCount("program_page_receipts", body.operationId)).toBe(0);
  });
  it.each([
    ["stale expected updatedAt", "update onzio.programs set body='Legacy edit' where id=$1"],
    ["stale expected count", "insert into onzio.programs(club_id,slug,display_title) select club_id,'legacy-extra','Legacy extra' from onzio.programs where id=$1"],
  ])("fails directory %s with CONTENT_CHANGED, no receipt and no effect", async (_label, change) => {
    const { id } = await created(); const body = directoryRequest(await loadDirectory(), [id]);
    await legacy(change, id);
    await directoryDenied(body, "CONTENT_CHANGED", club, "PT409"); expect(await receiptCount("program_directory_receipts", body.operationId)).toBe(0);
  });
  it("fails a directory save that lists a foreign program in the expected baseline", async () => {
    await created(); const foreign = randomUUID();
    await legacy("insert into onzio.programs(id,club_id,slug,display_title) values($1,$2,'foreign-program','Foreign')", foreign, CLUB_IDS.bravo);
    const body: any = directoryRequest(await loadDirectory()); body.expected[0].id = foreign;
    await directoryDenied(body, "CONTENT_CHANGED", club, "PT409");
  });
});

describe("receipts", () => {
  it("returns the original page receipt before CAS and media checks and rejects every changed request", async () => {
    const hero = await asset(), photo = await asset();
    const body = pageRequest(empty, { hero_media_asset_id: hero }, [{ id: null, mediaAssetId: photo, alt: "Original", sortOrder: 0 }]);
    const receipt = await savePage(body);
    await savePage(pageRequest(await loadPage(receipt.program.id), { hero_media_asset_id: null, body: "Later content" }, []));
    await legacy("update onzio.media_assets set status='orphaned',deleted_at=now() where id=any($1)", [hero, photo]);
    const later = await fingerprint();
    expect(await savePage(body)).toEqual(receipt);
    expect((await loadPage(receipt.program.id, body.operationId)).operation).toEqual({ status: "committed", receipt });
    expect(await fingerprint()).toEqual(later);
    for (const changed of [{ ...body, program: { ...body.program, body: "Changed" } }, { ...body, gallery: [] }, { ...body, programId: randomUUID() },
      { ...body, expected: { ...body.expected, programUpdatedAt: "2026-01-01T00:00:00+00:00" } }]) await pageDenied(changed, "OPERATION_REUSED", club, "PT409");
    await actor(USER_IDS.adminAal2);
    expect((await loadPage(receipt.program.id, body.operationId)).operation).toEqual({ status: "not-committed" });
    await db.query("reset role");
    expect((await db.query("select request_hash=encode(sha256(convert_to($3::jsonb::text,'UTF8')),'hex') as exact from onzio_private.program_page_receipts where club_id=$1 and actor_id=$2 and operation_id=$4",
      [club, USER_IDS.ownerAal2, JSON.stringify(body), body.operationId])).rows).toEqual([{ exact: true }]);
  });
  it("returns the original directory receipt before CAS and rejects every changed request", async () => {
    const { id } = await created(); const listed = await loadDirectory(), body = directoryRequest(listed, [id]);
    const receipt = await saveDirectory(body);
    await saveDirectory(directoryRequest(await loadDirectory(), [], [...(await loadDirectory()).programs].reverse()));
    expect(await saveDirectory(body)).toEqual(receipt);
    expect((await loadDirectory(body.operationId)).operation).toEqual({ status: "committed", receipt });
    for (const changed of [{ ...body, programs: body.programs.map((item: any, index: number) => index === 0 ? { ...item, status: item.status === "active" ? "hidden" : "active" } : item) },
      { ...body, expected: body.expected.slice(1), programs: body.programs.slice(1) }]) await directoryDenied(changed, "OPERATION_REUSED", club, "PT409");
    await actor(USER_IDS.adminAal2);
    expect((await loadDirectory(body.operationId)).operation).toEqual({ status: "not-committed" });
    await db.query("reset role");
    expect((await db.query("select request_hash=encode(sha256(convert_to($3::jsonb::text,'UTF8')),'hex') as exact from onzio_private.program_directory_receipts where club_id=$1 and actor_id=$2 and operation_id=$4",
      [club, USER_IDS.ownerAal2, JSON.stringify(body), body.operationId])).rows).toEqual([{ exact: true }]);
  });
});

describe("authority", () => {
  it.each([USER_IDS.unaffiliated, USER_IDS.removed])("denies outsider or removed actor %s on every request", async user => {
    const ctx = await prepared(); await actor(user); await everyRequestDenied(ctx, "NOT_AUTHORIZED");
  });
  it.each(["expired", "missing AMR", "foreign", "anonymous"])("denies %s on every request", async kind => {
    const ctx = await prepared();
    if (kind === "expired") await actor(USER_IDS.ownerAal2, 31);
    if (kind === "missing AMR") await actor(USER_IDS.ownerAal2, 0, false);
    if (kind === "anonymous") { await db.query("reset role"); await db.query("set local role anon"); }
    await everyRequestDenied(ctx, kind === "anonymous" ? "permission denied" : "NOT_AUTHORIZED", kind === "foreign" ? CLUB_IDS.bravo : club);
  });
  it.each(["archived", "suspended", "expired", "membership"])("requires current %s authority before fresh save, replay and status", async kind => {
    const ctx = await prepared(); await savePage(ctx.page);
    ctx.directory = directoryRequest(await loadDirectory(), [ctx.programId]); const directory = await saveDirectory(ctx.directory);
    await db.query("reset role");
    if (kind === "archived") await db.query("update onzio.clubs set lifecycle='archived',public_access='suspended' where id=$1", [club]);
    if (kind === "suspended") await db.query("update onzio.clubs set kind='customer',public_access='suspended' where id=$1", [club]);
    if (kind === "membership") await db.query("update onzio.club_members set status='removed',removed_at=now() where club_id=$1 and user_id=$2", [club, USER_IDS.ownerAal2]);
    await actor(USER_IDS.ownerAal2, kind === "expired" ? 31 : 0);
    await pageDenied(ctx.page, "NOT_AUTHORIZED"); await pageDenied({ ...ctx.page, operationId: randomUUID() }, "NOT_AUTHORIZED");
    await directoryDenied(ctx.directory, "NOT_AUTHORIZED"); await directoryDenied({ ...ctx.directory, operationId: randomUUID() }, "NOT_AUTHORIZED");
    await rejected(() => loadPage(ctx.programId, ctx.page.operationId), "NOT_AUTHORIZED");
    await rejected(() => loadDirectory(ctx.directory.operationId), "NOT_AUTHORIZED");
    if (kind === "suspended") {
      expect((await loadPage(ctx.programId)).program).toEqual(directory.programs.find((row: any) => row.id === ctx.programId));
      expect((await loadDirectory()).programs).toEqual(directory.programs);
    }
  });
  it.each(["onboarding", "grace"])("allows existing %s content authority", async state => {
    await db.query("reset role");
    await db.query("update onzio.clubs set kind='customer',lifecycle=$2,public_access=$3 where id=$1", [club, state === "onboarding" ? "onboarding" : "active", state === "onboarding" ? "preview" : "grace"]);
    await actor();
    const { id } = await created();
    expect((await saveDirectory(directoryRequest(await loadDirectory(), [id]))).programs.find((row: any) => row.id === id).status).toBe("hidden");
  });
});

describe("atomicity", () => {
  const faults = [
    ["programs update", "before update on onzio.programs", "new.display_title='FAIL'", "page"],
    ["second gallery row", "before insert or update on onzio.program_media", "new.alt='FAIL'", "page"],
    ["page receipt insert", "before insert on onzio_private.program_page_receipts", "true", "page"],
    ["second program update", "before update on onzio.programs", "new.display_title='FAIL'", "directory"],
    ["directory receipt insert", "before insert on onzio_private.program_directory_receipts", "true", "directory"],
  ] as const;
  it.each(faults)("rolls back every earlier write and the receipt on failed %s", async (kind, timing, condition, surface) => {
    const photo = await asset(), other = await asset();
    const { id } = await created({}, [{ id: null, mediaAssetId: photo, alt: "Existing", sortOrder: 0 }]);
    const doomed = await created({ slug: "doomed-program", display_title: "FAIL" });
    await db.query("reset role");
    await db.query("create function pg_temp.reject_programs_write() returns trigger language plpgsql as $$ begin raise exception 'injected Programs failure'; end $$");
    await db.query(`create trigger test_reject_programs ${timing} for each row when (${condition}) execute function pg_temp.reject_programs_write()`);
    await actor();
    let body: any, receiptTable: string;
    if (surface === "page") {
      const snapshot = await loadPage(id);
      body = kind === "programs update" ? pageRequest(snapshot, { display_title: "FAIL" })
        : pageRequest(snapshot, { display_title: "Earlier write" }, [...keep(snapshot), { id: null, mediaAssetId: other, alt: kind === "second gallery row" ? "FAIL" : "New photo", sortOrder: 1 }]);
      receiptTable = "program_page_receipts";
      await pageDenied(body, "injected Programs failure");
    } else {
      const listed = await loadDirectory();
      const order = [listed.programs.find((row: any) => row.id === id), listed.programs.find((row: any) => row.id === doomed.id), ...listed.programs.filter((row: any) => row.id !== id && row.id !== doomed.id)];
      body = directoryRequest(listed, [id], order);
      receiptTable = "program_directory_receipts";
      await directoryDenied(body, "injected Programs failure");
    }
    expect(await receiptCount(receiptTable, body.operationId)).toBe(0);
  });
});

describe("historic receipts", () => {
  it("preserves original hashes, actor isolation and genuine historic receipts through the complete migration", async () => {
    await db.query("reset role");
    const historical = readFileSync(historicalMigration, "utf8");
    for (const name of functions) {
      const start = historical.indexOf(`create function onzio.${name}(`), end = historical.indexOf("end $$;", start) + "end $$;".length;
      expect(start).toBeGreaterThan(0); await db.query(historical.slice(start, end).replace("create function", "create or replace function"));
    }
    await design("academy");
    const hero = await asset(), photo = await asset();
    const originalPage = pageRequest(empty, { hero_media_asset_id: hero }, [{ id: null, mediaAssetId: photo, alt: "Original", sortOrder: 0 }]);
    const pageReceipt = await savePage(originalPage), programId = pageReceipt.program.id;
    const originalDirectory = directoryRequest(await loadDirectory(), [programId]);
    const directoryReceipt = await saveDirectory(originalDirectory);
    const before = await fingerprint(); await db.query("reset role");
    const securityQuery = `select proname,proacl,prosecdef,proconfig from pg_proc where oid in ('onzio.load_program_page(uuid,uuid,uuid)'::regprocedure,'onzio.save_program_page(uuid,jsonb)'::regprocedure,
      'onzio.load_program_directory(uuid,uuid)'::regprocedure,'onzio.save_program_directory(uuid,jsonb)'::regprocedure) order by proname`;
    const security = (await db.query(securityQuery)).rows;
    expect(security).toHaveLength(4);
    await db.query(readFileSync(migration, "utf8"));
    expect(await fingerprint()).toEqual(before); expect((await db.query(securityQuery)).rows).toEqual(security);

    await design("clubhouse"); await actor(USER_IDS.adminAal2);
    expect((await loadPage(programId, originalPage.operationId)).operation).toEqual({ status: "not-committed" });
    expect((await loadDirectory(originalDirectory.operationId)).operation).toEqual({ status: "not-committed" });
    const adminPage = await savePage(pageRequest(await loadPage(programId), { hero_media_asset_id: null, display_title: "Admin later content" }, []));
    expect(adminPage.program.display_title).toBe("Admin later content");
    const current = await loadDirectory();
    await saveDirectory(directoryRequest(current, [], [...current.programs].reverse()));
    await legacy("update onzio.media_assets set status='orphaned',deleted_at=now() where id=any($1)", [hero, photo]);

    const later = await fingerprint();
    expect(await savePage(originalPage)).toEqual(pageReceipt);
    expect((await loadPage(programId, originalPage.operationId)).operation).toEqual({ status: "committed", receipt: pageReceipt });
    expect(await saveDirectory(originalDirectory)).toEqual(directoryReceipt);
    expect((await loadDirectory(originalDirectory.operationId)).operation).toEqual({ status: "committed", receipt: directoryReceipt });
    expect(await fingerprint()).toEqual(later);
    for (const changed of [{ ...originalPage, expected: { ...originalPage.expected, programUpdatedAt: "2026-01-01T00:00:00+00:00" } },
      { ...originalPage, program: { ...originalPage.program, display_title: "Changed" } }, { ...originalPage, gallery: [] }]) await pageDenied(changed, "OPERATION_REUSED", club, "PT409");
    for (const changed of [{ ...originalDirectory, expected: [] , programs: [] },
      { ...originalDirectory, programs: originalDirectory.programs.map((item: any, index: number) => index === 0 ? { ...item, status: item.status === "active" ? "hidden" : "active" } : item) }]) await directoryDenied(changed, "OPERATION_REUSED", club, "PT409");
    await db.query("reset role");
    for (const [table, body] of [["program_page_receipts", originalPage], ["program_directory_receipts", originalDirectory]] as const) {
      expect((await db.query(`select request_hash=encode(sha256(convert_to($3::jsonb::text,'UTF8')),'hex') as exact from onzio_private.${table} where club_id=$1 and actor_id=$2 and operation_id=$4`,
        [club, USER_IDS.ownerAal2, JSON.stringify(body), body.operationId])).rows).toEqual([{ exact: true }]);
    }
  });
});

it("commits a hidden full program through loopback PostgREST, retries, reads status and denies outsiders", async () => {
  await db.query("rollback"); const id = await newClub();
  const owner = await createFreshLocalClient({ userId: USER_IDS.ownerAal2, email: "owner-aal2@alpha.local" });
  try {
    await db.query("begin"); await design("clubhouse", id);
    const hero = await asset({ owner: id }), detail = await asset({ owner: id }), photo = await asset({ owner: id }), linked = await form(id);
    await db.query("reset role"); await db.query("commit");
    const rpc = async (name: string, args: Record<string, unknown>) => {
      const result = await owner.client.rpc(name, args as any).abortSignal(AbortSignal.timeout(5000)); expect(result.error).toBeNull(); return result.data as any;
    };
    const pageBody = pageRequest(await rpc("load_program_page", { p_club_id: id }), { hero_media_asset_id: hero, detail_media_asset_id: detail, registration_form_id: linked },
      [{ id: null, mediaAssetId: photo, alt: "Training", sortOrder: 0 }]);
    const saved = await rpc("save_program_page", { p_club_id: id, p_request: pageBody });
    expect(saved.program).toMatchObject({ ...pageBody.program, id: expect.any(String) });
    expect(saved.gallery).toEqual([expect.objectContaining({ media_asset_id: photo, alt: "Training", sort_order: 0 })]);
    expect(await rpc("load_program_page", { p_club_id: id, p_program_id: saved.program.id })).toEqual({ program: saved.program, gallery: saved.gallery });
    const directoryBody = directoryRequest(await rpc("load_program_directory", { p_club_id: id }), [saved.program.id]);
    const hidden = await rpc("save_program_directory", { p_club_id: id, p_request: directoryBody });
    expect(hidden.programs).toMatchObject([{ id: saved.program.id, status: "hidden", sort_order: 0 }]);
    expect((await rpc("load_program_directory", { p_club_id: id })).programs).toEqual(hidden.programs);
    expect(await rpc("save_program_page", { p_club_id: id, p_request: pageBody })).toEqual(saved);
    expect(await rpc("save_program_directory", { p_club_id: id, p_request: directoryBody })).toEqual(hidden);
    expect((await rpc("load_program_page", { p_club_id: id, p_program_id: saved.program.id, p_operation_id: pageBody.operationId })).operation).toEqual({ status: "committed", receipt: saved });
    expect((await rpc("load_program_directory", { p_club_id: id, p_operation_id: directoryBody.operationId })).operation).toEqual({ status: "committed", receipt: hidden });
    expect((await db.query("select slug,status,hero_media_asset_id,detail_media_asset_id,registration_form_id from onzio.programs where club_id=$1", [id])).rows)
      .toEqual([{ slug: program.slug, status: "hidden", hero_media_asset_id: hero, detail_media_asset_id: detail, registration_form_id: linked }]);
    expect((await db.query("select media_asset_id,alt from onzio.program_media where club_id=$1", [id])).rows).toEqual([{ media_asset_id: photo, alt: "Training" }]);
    const outsider = await createFreshLocalClient({ userId: USER_IDS.unaffiliated, email: "unaffiliated@alpha.local" });
    try {
      await db.query("begin"); const untouched = await fingerprint(id);
      for (const [name, args] of [["save_program_page", { p_club_id: id, p_request: { ...pageBody, operationId: randomUUID() } }],
        ["save_program_directory", { p_club_id: id, p_request: { ...directoryBody, operationId: randomUUID() } }],
        ["load_program_page", { p_club_id: id, p_program_id: saved.program.id }], ["load_program_directory", { p_club_id: id }]] as const) {
        const denied = await outsider.client.rpc(name, args as any).abortSignal(AbortSignal.timeout(5000));
        expect(denied.status).toBe(403); expect(denied.error).toMatchObject({ code: "42501", message: "NOT_AUTHORIZED" });
      }
      expect(await fingerprint(id)).toEqual(untouched); await db.query("rollback");
    } finally { await outsider.cleanup(); }
  } finally {
    await db.query("rollback"); await db.query("reset role"); await db.query("begin");
    try {
      await db.query("lock table onzio.presentation_documents in access exclusive mode"); await db.query("delete from onzio.presentation_state where club_id=$1", [id]);
      await db.query("alter table onzio.presentation_documents disable trigger presentation_documents_immutable"); await db.query("delete from onzio.presentation_documents where club_id=$1", [id]); await db.query("alter table onzio.presentation_documents enable trigger presentation_documents_immutable");
      for (const table of ["program_media", "programs", "registration_forms", "media_assets", "club_members", "audit_events"]) await db.query(`delete from onzio.${table} where club_id=$1`, [id]);
      await db.query("delete from onzio.clubs where id=$1", [id]);
      for (const table of ["onzio.clubs", "onzio.presentation_documents", "onzio_private.program_page_receipts", "onzio_private.program_directory_receipts"]) expect((await db.query(`select count(*)::int as count from ${table} where ${table === "onzio.clubs" ? "id" : "club_id"}=$1`, [id])).rows).toEqual([{ count: 0 }]);
      await db.query("commit");
    } catch (error) { await db.query("rollback"); throw error; }
    finally { await owner.cleanup(); }
  }
});
