import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";

let admin: Client, publisher: Client, writer: Client, clubId: string, photoId: string;
const connection = () => new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
async function publish(db: Client, template: string) {
  const documentId = randomUUID();
  await db.query(`insert into onzio.presentation_documents
    (id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
    values($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,$3,1,$4,$5,$6)`,
    [documentId, clubId, template, JSON.stringify({ schemaVersion: 1, template: { id: template, version: 1 } }), "a".repeat(64), USER_IDS.ownerAal2]);
  await db.query(`insert into onzio.presentation_state(club_id,published_document_id,updated_by)
    values($1,$2,$3) on conflict(club_id) do update set published_document_id=$2`, [clubId, documentId, USER_IDS.ownerAal2]);
}
async function authenticate() {
  const timestamp = Number((await writer.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await writer.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: USER_IDS.ownerAal2, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp }] })]);
  await writer.query("set role authenticated");
}
const program = { slug: "new-program", nav_label: "New", display_title: "New", kicker: "", summary: "", body: "", highlights: [], layout_variant: "statement_band",
  hero_media_asset_id: null, detail_media_asset_id: null, external_cta_label: "", external_cta_href: "", registration_form_id: null, registration_enabled: false,
  registration_eyebrow: "", registration_headline: "", registration_body: "", registration_pending_body: "", registration_pending_label: "", status: "active", sort_order: 0 };
const cases = [
  { label: "Tryouts template change", initial: "academy", next: "clubhouse", rpc: "save_tryouts_page", receipt: "tryouts_page_save_receipts", error: "PAGE_UNAVAILABLE" },
  { label: "Program page template change", initial: "academy", next: "clubhouse", rpc: "save_program_page", receipt: "program_page_receipts", error: "PAGE_UNAVAILABLE" },
  { label: "Programs directory template change", initial: "academy", next: "clubhouse", rpc: "save_program_directory", receipt: "program_directory_receipts", error: "PAGE_UNAVAILABLE" },
  { label: "Editorial Store disable", initial: "editorial", next: null, rpc: "save_shop_page", receipt: "shop_page_receipts", error: "PAGE_UNAVAILABLE" },
  { label: "Shop design revision change", initial: "cinematic", next: "heritage", rpc: "save_shop_page", receipt: "shop_page_receipts", error: "DESIGN_CHANGED" },
];
beforeEach(async () => {
  assertSafeTestEnvironment();
  admin = connection(); publisher = connection(); writer = connection();
  await Promise.all([admin.connect(), publisher.connect(), writer.connect()]);
  clubId = randomUUID(); photoId = randomUUID();
  await admin.query("insert into onzio.clubs(id,slug,name,kind,lifecycle,public_access,store_enabled) values($1,$2,'Serialization test','test','active','live',true)", [clubId, `serialization-${clubId}`]);
  await admin.query("insert into onzio.club_members(club_id,user_id,role,status) values($1,$2,'owner','active')", [clubId, USER_IDS.ownerAal2]);
  await admin.query(`insert into onzio.media_assets
    (id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at)
    values($1,$2,'onzio-media',$3,'shop','photograph','image/webp',100,100,100,$4,'published',now())`, [photoId, clubId, `${clubId}/shop/${photoId}.webp`, "b".repeat(64)]);
  await authenticate();
});
afterEach(async () => {
  if (publisher) await publisher.query("rollback").catch(() => undefined);
  if (writer) await writer.end();
  if (publisher) await publisher.end();
  if (admin) {
    // Only this test's synthetic tenant is committed; deterministic fixtures stay untouched.
    for (const table of ["program_media", "programs", "tryouts", "tryouts_page_content", "shop_kit_photos", "shop_carousel_photos", "shop_kit_section", "shop_purchase_details", "media_assets", "club_members"]) {
      await admin.query(`delete from onzio.${table} where club_id=$1`, [clubId]);
    }
    // Presentation documents are immutable, including cascade deletes. Archive
    // this synthetic tenant; the parent's next local reset removes test history.
    await admin.query("update onzio.clubs set lifecycle='archived',public_access='suspended' where id=$1", [clubId]);
    await admin.end();
  }
});

describe("remaining editor saves serialize with publication on independent connections", () => {
  it.each(cases)("waits for $label and rejects without content or receipt writes", async target => {
    await publish(admin, target.initial);
    const operationId = randomUUID();
    let payload: Record<string, unknown>;
    if (target.rpc === "save_shop_page") {
      const baseline = (await writer.query("select onzio.load_shop_page($1,'shop') as data", [clubId])).rows[0].data;
      payload = { operationId, surface: "shop", expectedRevision: baseline.revision, designRevision: baseline.designRevision,
        variants: { home: { section: { eyebrow: "Kit", title: "New kit", description: "", bullet_points: [], store_note: "", cta_label: "", cta_link: "" }, photos: [{ rowId: null, assetId: photoId, order: 0 }] } } };
    } else if (target.rpc === "save_tryouts_page") {
      const baseline = (await writer.query("select onzio.load_tryouts_page($1) as data", [clubId])).rows[0].data;
      payload = { operationId, expectedRevision: baseline.revision, page: { intro_with_tryouts: "New", intro_no_tryouts: "Later" }, events: [], deletedIds: [] };
    } else if (target.rpc === "save_program_page") payload = { operationId, programId: null, expected: { programUpdatedAt: null, gallery: [] }, program, gallery: [] };
    else payload = { operationId, expected: [], programs: [] };

    const writerPid = Number((await writer.query("select pg_backend_pid() as pid")).rows[0].pid);
    await publisher.query("begin");
    if (target.next) await publish(publisher, target.next);
    else await publisher.query("update onzio.clubs set store_enabled=false where id=$1", [clubId]);
    let settled = false;
    const saving = writer.query(`select onzio.${target.rpc}($1,$2::jsonb) as data`, [clubId, JSON.stringify(payload)])
      .then(result => ({ result, error: null }), (error: Error) => ({ result: null, error })).finally(() => { settled = true; });
    try {
      let waiting = false;
      const deadline = Date.now() + 3000;
      while (!settled && Date.now() < deadline) {
        waiting = (await admin.query("select exists(select 1 from pg_locks where pid=$1 and locktype='advisory' and classid=0 and objid=734901281 and not granted) as waiting", [writerPid])).rows[0].waiting;
        if (waiting) break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      expect(settled).toBe(false);
      await publisher.query("commit");
      const outcome = await saving;
      expect(outcome.error?.message).toContain(target.error);
      expect((await admin.query(`select count(*)::int as n from onzio_private.${target.receipt} where club_id=$1 and operation_id=$2`, [clubId, operationId])).rows[0].n).toBe(0);
      for (const table of ["programs", "tryouts_page_content", "shop_kit_section"]) {
        expect((await admin.query(`select count(*)::int as n from onzio.${table} where club_id=$1`, [clubId])).rows[0].n).toBe(0);
      }
    } finally {
      await publisher.query("rollback");
      await saving;
    }
  });
});
