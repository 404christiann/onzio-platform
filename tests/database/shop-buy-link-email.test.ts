import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLUB_IDS, USER_IDS } from "../fixtures/entities";
import { assertSafeTestEnvironment } from "../helpers/environment";

// ADMIN-PLATFORM-FIXES-02: a kit's buy link may be an email address
// (decision 0008 amended), so Diverse City's imported `mailto:` order link no
// longer blocks every Shop-page save.
const SEEDED_ORDER_LINK = "mailto:diverse.cityfc@gmail.com?subject=Diverse%20City%20FC%20Jersey%20Order";

let db: Client;
const clubId = CLUB_IDS.alpha;

async function actor() {
  await db.query("reset role");
  const second = Number((await db.query("select floor(extract(epoch from now()))::bigint as second")).rows[0].second);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({
    sub: USER_IDS.ownerAal2, role: "authenticated", aal: "aal1", amr: [{ method: "otp", timestamp: second }],
  })]);
  await db.query("set local role authenticated");
}

async function design(template: string) {
  await db.query("reset role");
  const id = randomUUID();
  await db.query(`insert into onzio.presentation_documents
    (id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
    values ($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,$3,1,$4,$5,$6)`,
  [id, clubId, template, JSON.stringify({ schemaVersion: 1, template: { id: template, version: 1 } }), "a".repeat(64), USER_IDS.ownerAal2]);
  await db.query(`insert into onzio.presentation_state(club_id,published_document_id,updated_by)
    values($1,$2,$3) on conflict(club_id) do update set published_document_id=$2`, [clubId, id, USER_IDS.ownerAal2]);
  await actor();
}

async function asset() {
  const id = randomUUID();
  await db.query("reset role");
  await db.query(`insert into onzio.media_assets
    (id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at)
    values($1,$2,'onzio-media',$3,'shop','photograph','image/webp',100,100,100,$4,'published',now())`,
  [id, clubId, `${clubId}/shop/${id}.webp`, "b".repeat(64)]);
  await actor();
  return id;
}

async function load() {
  return (await db.query("select onzio.load_shop_page($1,'shop') as data", [clubId])).rows[0].data;
}

async function save(request: unknown) {
  return (await db.query("select onzio.save_shop_page($1,$2::jsonb) as data", [clubId, JSON.stringify(request)])).rows[0].data;
}

async function rejects(action: () => Promise<unknown>, message: string) {
  await db.query("savepoint expected_failure");
  try { await expect(action()).rejects.toThrow(message); }
  finally { await db.query("rollback to savepoint expected_failure"); }
}

const section = (cta_link: string) => ({
  eyebrow: "Official Club Store", title: "Match Jersey", description: "Our jersey",
  bullet_points: ["Available item: Match Jersey"], store_note: "Ask the club", cta_label: "Contact the Club to Order", cta_link,
});

async function kitRequest(cta_link: string, purchase?: Record<string, unknown>) {
  const before = await load();
  const photo = await asset();
  return {
    operationId: randomUUID(), surface: "shop", expectedRevision: before.revision, designRevision: before.designRevision,
    variants: { home: { section: section(cta_link), photos: [{ rowId: null, assetId: photo, order: 0 }] } },
    ...(purchase ? { purchase } : {}),
  };
}

beforeEach(async () => {
  assertSafeTestEnvironment();
  db = new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
  await db.connect();
  await db.query("begin");
  await design("academy");
});
afterEach(async () => { if (db) { await db.query("rollback"); await db.end(); } });

describe("Shop kit buy link may be an email address", () => {
  it("saves and reloads the imported order-by-email link", async () => {
    const result = await save(await kitRequest(SEEDED_ORDER_LINK));
    expect(result.sections.find((item: { kit_variant: string }) => item.kit_variant === "home").cta_link).toBe(SEEDED_ORDER_LINK);
    expect((await load()).sections.find((item: { kit_variant: string }) => item.kit_variant === "home").cta_link).toBe(SEEDED_ORDER_LINK);
  });

  it("still accepts web addresses and local pages", async () => {
    for (const link of ["https://store.example.com/jersey", "/shop", "mailto:orders@club.org"]) {
      const result = await save(await kitRequest(link));
      expect(result.sections.find((item: { kit_variant: string }) => item.kit_variant === "home").cta_link).toBe(link);
    }
  });

  it.each(["mailto:", "mailto:not-an-email", "mailto:a b@club.org", "javascript:alert(1)", "ftp://example.com"])(
    "rejects the unsafe or malformed link %s",
    async (link) => {
      const request = await kitRequest(link);
      await rejects(() => save(request), "INVALID_SHOP_PAYLOAD");
    },
  );

  it("keeps the purchase-details closing button web-only", async () => {
    const purchase = { heading: "", cards: [], cta_eyebrow: "", cta_text: "", cta_label: "Order", cta_link: "mailto:orders@club.org" };
    const request = await kitRequest("https://store.example.com/jersey", purchase);
    await rejects(() => save(request), "INVALID_SHOP_PAYLOAD");
  });

  it("keeps the replaced validator invoker-only with narrow grants", async () => {
    await db.query("reset role");
    const row = (await db.query(`select p.prosecdef, p.provolatile, p.proconfig,
      has_function_privilege('anon','onzio_private.validate_shop_section(jsonb)','execute') as anon,
      has_function_privilege('authenticated','onzio_private.validate_shop_section(jsonb)','execute') as authenticated
      from pg_proc p where p.oid='onzio_private.validate_shop_section(jsonb)'::regprocedure`)).rows[0];
    expect(row).toEqual({ prosecdef: false, provolatile: "i", proconfig: ["search_path=\"\""], anon: false, authenticated: true });
  });
});
