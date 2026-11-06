import { randomUUID } from "node:crypto";
import { expect, request, test } from "@playwright/test";
import { Client } from "pg";
import { CLUB_IDS } from "../fixtures/entities";

// While a club's Shop is off, owners can open and save the Shop editor under a
// banner, and nothing reaches visitors. This spec turns local Alpha's switch
// off, adds a throwaway Shop-page kit, saves through the real editor and
// route, then removes every row it created and restores the switch.
const ALPHA = CLUB_IDS.alpha;
const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });

let db: Client;
let previousStore: boolean;
let revisionsBefore: Array<{ surface: string; revision: string }>;
let auditBefore: string;
const assetId = randomUUID();
const operationIds: string[] = [];

test.beforeAll(async () => {
  db = new Client(config);
  await db.connect();
  previousStore = (await db.query("select store_enabled from onzio.clubs where id=$1", [ALPHA])).rows[0].store_enabled;
  revisionsBefore = (await db.query("select surface, revision::text from onzio_private.shop_page_revisions where club_id=$1", [ALPHA])).rows;
  auditBefore = (await db.query("select coalesce(max(id),0)::text as id from onzio.audit_events")).rows[0].id;
  const existing = await db.query("select 1 from onzio.shop_kit_section where club_id=$1 and surface='shop' and kit_variant='home'", [ALPHA]);
  if (existing.rowCount) throw new Error("Alpha already has a Shop-page home kit; this spec only cleans up rows it creates.");
  await db.query("update onzio.clubs set store_enabled=false where id=$1", [ALPHA]);
  await db.query(`insert into onzio.media_assets
    (id,club_id,storage_bucket,storage_path,surface,media_kind,mime_type,byte_size,width,height,checksum_sha256,status,published_at)
    values($1,$2,'onzio-media',$3,'shop','photograph','image/webp',100,100,100,$4,'published',now())`,
  [assetId, ALPHA, `${ALPHA}/shop/${assetId}.webp`, "c".repeat(64)]);
  await db.query(`insert into onzio.shop_kit_section(club_id,surface,kit_variant,eyebrow,title,description,bullet_points,store_note,cta_label,cta_link)
    values($1,'shop','home','Club store','Prepared kit','Ready before launch','[]'::jsonb,'','Order','mailto:orders@alpha.test')`, [ALPHA]);
  await db.query(`insert into onzio.shop_kit_photos(id,club_id,surface,kit_variant,url,sort_order,media_asset_id)
    values($1,$2,'shop','home',$3,0,$4)`, [randomUUID(), ALPHA, `${ALPHA}/shop/${assetId}.webp`, assetId]);
});

test.afterAll(async () => {
  if (!db) return;
  try {
    await db.query("delete from onzio.shop_kit_photos where club_id=$1 and surface='shop' and kit_variant='home'", [ALPHA]);
    await db.query("delete from onzio.shop_kit_section where club_id=$1 and surface='shop' and kit_variant='home'", [ALPHA]);
    await db.query("delete from onzio.media_assets where id=$1", [assetId]);
    if (operationIds.length) await db.query("delete from onzio_private.shop_page_receipts where club_id=$1 and operation_id = any($2::uuid[])", [ALPHA, operationIds]);
    await db.query("delete from onzio_private.shop_page_revisions where club_id=$1", [ALPHA]);
    for (const row of revisionsBefore) {
      await db.query("insert into onzio_private.shop_page_revisions(club_id,surface,revision) values($1,$2,$3)", [ALPHA, row.surface, row.revision]);
    }
    await db.query("delete from onzio.audit_events where club_id=$1 and id > $2::bigint", [ALPHA, auditBefore]);
    await db.query("update onzio.clubs set store_enabled=$2 where id=$1", [ALPHA, previousStore]);
  } finally {
    await db.end();
  }
});

test("owners can open and save the Shop editor while the Shop is off, and visitors still can't see it", async ({ page }) => {
  await page.goto("/admin/shop");
  await expect(page.getByText("Your shop is off. Visitors can't see it yet.", { exact: true })).toBeVisible();
  // The editor used to bounce to the dashboard; it must stay put.
  await page.waitForTimeout(1_000);
  await expect(page).toHaveURL(/\/admin\/shop$/);
  await expect(page.getByRole("link", { name: "Shop", exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Edit kit text", exact: true }).click();
  const title = page.getByLabel("Kit title", { exact: true });
  await expect(title).toHaveValue("Prepared kit");
  await title.fill("Prepared kit, edited while off");
  const saved = page.waitForResponse((response) => response.url().endsWith("/api/admin/shop") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Save page", exact: true }).first().click();
  const response = await saved;
  operationIds.push((response.request().postDataJSON() as { operationId: string }).operationId);
  expect(response.status()).toBe(200);
  await expect(page.getByText("This page was saved.", { exact: true })).toBeVisible();
  expect((await db.query("select title from onzio.shop_kit_section where club_id=$1 and surface='shop' and kit_variant='home'", [ALPHA])).rows[0].title)
    .toBe("Prepared kit, edited while off");

  // A signed-out visitor gets the not-found page and none of the kit. The
  // status is 200, not 404: the tenant layout's loading screen starts the
  // stream before /shop calls notFound() (unchanged by this work).
  const visitor = await request.newContext({ baseURL: test.info().project.use.baseURL });
  try {
    const body = await (await visitor.get("/shop", { maxRedirects: 0 })).text();
    expect(body).toContain("This page could not be found");
    expect(body).not.toContain("Prepared kit");
  } finally {
    await visitor.dispose();
  }
});
