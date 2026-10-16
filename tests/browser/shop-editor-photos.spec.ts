import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { Client } from "pg";
import { expect, test, type Page } from "@playwright/test";
import { retirePublishedMedia } from "@/lib/media-processing";
import type { ShopSaveRequest, ShopSnapshot } from "@/lib/shop-editor/contract";
import { parsePresentationDocument, switchPresentationTemplate, type PresentationDocument } from "@/packages/presentation";

const alpha = "11111111-1111-4111-8111-111111111111";
const bravo = "22222222-2222-4222-8222-222222222222";
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const contentTables = ["onzio.shop_kit_section", "onzio.shop_kit_photos", "onzio.shop_carousel_photos", "onzio.shop_purchase_details"] as const;
const revisionTable = "onzio_private.shop_page_revisions";
const stateTable = "onzio.presentation_state";
const receiptTable = "onzio_private.shop_page_receipts";
const documentTable = "onzio.presentation_documents";
const tables = [...contentTables, revisionTable, stateTable, receiptTable, documentTable];
type Asset = { assetId: string; storagePath: string; publicUrl: string };
type Backup = Record<string, string>;

async function rows(db: Client, table: string, club: string): Promise<string> {
  return (await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]')::text as rows from ${table} t where club_id=$1`, [club])).rows[0].rows;
}

async function capture(db: Client, club: string): Promise<Backup> {
  const backup: Backup = {};
  for (const table of tables) backup[table] = await rows(db, table, club);
  return backup;
}

async function restore(db: Client, backup: Backup) {
  await db.query("begin");
  try {
    for (const table of [...contentTables, stateTable, revisionTable]) {
      await db.query(`delete from ${table} where club_id=$1`, [alpha]);
      await db.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`, [backup[table]]);
    }
    await db.query("commit");
  } catch (error) { await db.query("rollback"); throw error; }
  for (const table of [...contentTables, stateTable, revisionTable]) expect(await rows(db, table, alpha), `Restored ${table}`).toBe(backup[table]);
}

async function publishCinematic(db: Client) {
  const original = (await db.query("select d.configuration from onzio.presentation_state s join onzio.presentation_documents d on d.id=s.published_document_id and d.club_id=s.club_id where s.club_id=$1", [alpha])).rows[0].configuration as PresentationDocument;
  const switched = switchPresentationTemplate(original, { id: "cinematic", version: 1 });
  const configuration = parsePresentationDocument(switched.document, { surface: "production" });
  const digest = createHash("sha256").update(JSON.stringify(configuration)).digest("hex");
  const id = randomUUID();
  await db.query(`insert into onzio.presentation_documents(id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by)
    values($1,$2,(select coalesce(max(version),0)+1 from onzio.presentation_documents where club_id=$2),1,'cinematic',1,$3,$4,$5)`, [id, alpha, JSON.stringify(configuration), digest, owner]);
  await db.query("update onzio.presentation_state set published_document_id=$1,updated_by=$2 where club_id=$3", [id, owner, alpha]);
  return id;
}

async function load(page: Page, surface: "home" | "shop", operationId?: string): Promise<ShopSnapshot> {
  const response = await page.request.get(`/api/admin/shop?surface=${surface}${operationId ? `&operationId=${operationId}` : ""}`);
  expect(response.status()).toBe(200);
  return response.json();
}

async function assertImage(page: Page, url: string) {
  const image = page.locator(`img[src="${url}"]`).filter({ visible: true }).first();
  await expect(image).toBeAttached();
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
  expect(await image.evaluate((node: HTMLImageElement) => node.currentSrc)).toBe(url);
}

for (const scenario of [
  { template: "academy", width: 1440, lostResponse: false },
  { template: "cinematic", width: 1440, lostResponse: false },
  { template: "cinematic", width: 390, lostResponse: true },
] as const) {
  test(`${scenario.template} ${scenario.width}px real Shop photos save and reload${scenario.lostResponse ? " after a committed response is lost" : ""}`, async ({ page }, info) => {
    for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_TEST_URL"]) {
      expect(["127.0.0.1", "localhost"]).toContain(new URL(process.env[name]!).hostname);
    }
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY, "Export the local service environment for fixture cleanup").toBeTruthy();
    const db = new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
    await db.connect();
    const assets = new Map<string, Asset>();
    const responseJobs: Promise<void>[] = [];
    const responseErrors: string[] = [];
    const pageErrors: string[] = [];
    const saveRequests: ShopSaveRequest[] = [];
    const receiptRequests: string[] = [];
    const uploadStatuses: number[] = [];
    const authorizationStatuses: number[] = [];
    let lostCommit: ShopSnapshot | undefined;
    let restored = false;
    const retainedPresentationDocuments: string[] = [];
    const cleanupErrors: unknown[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname !== "/api/admin/shop") return;
      if (request.method() === "POST") saveRequests.push(request.postDataJSON());
      if (request.method() === "GET" && url.searchParams.has("operationId")) receiptRequests.push(url.searchParams.get("operationId")!);
    });
    page.on("response", (response) => {
      const path = new URL(response.url()).pathname;
      if (path === "/api/admin/media/authorize") authorizationStatuses.push(response.status());
      if (path.includes("/object/upload/sign/onzio-upload-staging/")) uploadStatuses.push(response.status());
      if (path === "/api/admin/media/finalize") responseJobs.push((async () => {
        expect(response.status()).toBe(200);
        const { data } = await response.json();
        expect(typeof data.assetId).toBe("string");
        assets.set(data.assetId, data);
        await appendFile(info.outputPath("uploaded-assets.jsonl"), JSON.stringify({ assetId: data.assetId, storagePath: data.storagePath, publicUrl: data.publicUrl }) + "\n", { mode: 0o600 });
      })().catch((error: unknown) => { responseErrors.push(String(error)); }));
    });
    try {
      const original = await capture(db, alpha);
      const otherTenant = await capture(db, bravo);
      const state = JSON.parse(original[stateTable]);
      expect(state[0].published_document_id).toBe("88888888-8888-4888-8888-888888888804");
      expect(JSON.parse(original["onzio.shop_kit_photos"]).filter((row: { surface: string }) => row.surface === "shop")).toEqual([]);
      expect(JSON.parse(original["onzio.shop_carousel_photos"])).toEqual([]);
      await mkdir(info.outputDir, { recursive: true, mode: 0o700 });
      await writeFile(info.outputPath("fixture-backup.json"), JSON.stringify({ alpha: original, bravo: otherTenant }), { mode: 0o600 });
      try {
        if (scenario.template === "cinematic") retainedPresentationDocuments.push(await publishCinematic(db));
        const homeBefore = await load(page, "home");
        const before = await load(page, "shop");
        expect(before.templateKey).toBe(`${scenario.template}@1`);
        await page.setViewportSize({ width: scenario.width, height: 900 });
        await page.goto("/admin/shop");
        await page.getByRole("button", { name: "Edit kit text", exact: true }).click();
        const title = `Shop photo verification ${randomUUID().slice(0, 8)}`;
        await page.getByLabel("Kit title", { exact: true }).fill(title);
        await page.getByRole("button", { name: "Done", exact: true }).click();
        const expected: { kit: string[]; row: string[] } = { kit: [], row: [] };
        for (const collection of scenario.template === "cinematic" ? ["kit", "row"] as const : ["kit"] as const) {
          const priorIds = new Set(assets.keys());
          const label = collection === "kit" ? "kit" : "photo row";
          await page.getByRole("button", { name: collection === "kit" ? "Edit kit photos" : "Edit photo row", exact: true }).click();
          const files = await Promise.all([1, 2].map(async (index) => ({
            name: `Shop ${label} ${index}.jpg`, mimeType: "image/jpeg",
            buffer: await readFile(`public/images/home/homepageSlideShowPic${index}.jpeg`),
          })));
          await page.locator(`input[type="file"][aria-label="Add ${label} photos"]`).setInputFiles(files);
          await expect.poll(() => assets.size).toBe(priorIds.size + 2);
          await expect(page.locator(".shop-page-inspector")).toContainText("2/6 photos.");
          await expect(page.getByRole("button", { name: "Save page", exact: true }).filter({ visible: true }).first()).toBeEnabled();
          expected[collection] = [...assets.keys()].filter((id) => !priorIds.has(id)).reverse();
          await page.getByRole("button", { name: `Move ${label} photo 2 up`, exact: true }).click();
          await page.getByRole("button", { name: "Done", exact: true }).click();
        }
        if (scenario.lostResponse) await page.route("**/api/admin/shop", async (route) => {
          if (route.request().method() !== "POST") return route.continue();
          try {
            const actual = await route.fetch();
            expect(actual.status()).toBe(200);
            lostCommit = await actual.json();
          } finally { await route.abort("connectionreset"); }
        }, { times: 1 });
        await page.getByRole("button", { name: "Save page", exact: true }).filter({ visible: true }).first().click();
        await expect(page.getByRole("status").filter({ hasText: "This page was saved." })).toBeVisible();
        expect(saveRequests).toHaveLength(1);
        if (scenario.lostResponse) {
          expect(lostCommit).toBeDefined();
          expect(receiptRequests).toEqual([saveRequests[0].operationId]);
        }
        const saved = await load(page, "shop");
        expect(saved.revision).not.toBe(before.revision);
        expect(saved.photos.map((photo) => photo.assetId)).toEqual(expected.kit);
        expect(saved.photoRows.map((photo) => photo.assetId)).toEqual(expected.row);
        expect(saved.photos.map((photo) => photo.order)).toEqual([0, 1]);
        if (expected.row.length) expect(saved.photoRows.map((photo) => photo.order)).toEqual([0, 1]);
        expect(saved.sections.find((section) => section.kit_variant === "home")?.title).toBe(title);
        for (const photo of [...saved.photos, ...saved.photoRows]) {
          const asset = assets.get(photo.assetId!)!;
          expect(photo.url).toBe(asset.publicUrl);
          expect(photo.url).toBe(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/onzio-media/${asset.storagePath}`);
          const image = await page.request.get(photo.url);
          expect(image.status()).toBe(200);
          expect(image.headers()["content-type"]).toContain("image/webp");
          const stored = (await db.query("select storage_bucket,storage_path,status,club_id from onzio.media_assets where id=$1", [photo.assetId])).rows[0];
          expect(stored).toEqual({ storage_bucket: "onzio-media", storage_path: asset.storagePath, status: "published", club_id: alpha });
        }
        for (const [table, ids] of [["onzio.shop_kit_photos", expected.kit], ["onzio.shop_carousel_photos", expected.row]] as const) {
          const stored = (await db.query(`select media_asset_id,url from ${table} where club_id=$1${table === "onzio.shop_kit_photos" ? " and surface='shop'" : ""} order by sort_order`, [alpha])).rows;
          expect(stored.map((row: { media_asset_id: string }) => row.media_asset_id)).toEqual(ids);
          expect(stored.map((row: { media_asset_id: string; url: string }) => row.url)).toEqual(ids.map((id) => assets.get(id)!.storagePath));
        }
        const receipt = await load(page, "shop", saveRequests[0].operationId);
        expect(receipt.operation?.status).toBe("committed");
        if (receipt.operation?.status !== "committed") throw new Error("Shop receipt was not committed");
        expect(receipt.operation.receipt.photos).toEqual(saved.photos);
        expect(receipt.operation.receipt.photoRows).toEqual(saved.photoRows);
        const replay = await page.request.post("/api/admin/shop", { data: saveRequests[0], headers: { "X-Editor-Recovery": "1" } });
        expect(replay.status()).toBe(200);
        expect((await replay.json()).revision).toBe(saved.revision);
        expect((await load(page, "shop")).revision).toBe(saved.revision);
        expect((await db.query("select count(*)::int as count from onzio_private.shop_page_receipts where club_id=$1 and operation_id=$2", [alpha, saveRequests[0].operationId])).rows[0].count).toBe(1);
        await page.reload();
        await page.getByRole("button", { name: "Edit kit photos", exact: true }).click();
        for (const photo of saved.photos) await assertImage(page, photo.url);
        await page.getByRole("button", { name: "Done", exact: true }).click();
        if (scenario.lostResponse) {
          await page.getByRole("button", { name: "Edit kit photos", exact: true }).click();
          await page.getByRole("button", { name: "Remove kit photo 1", exact: true }).click();
          await page.getByRole("button", { name: "Done", exact: true }).click();
          await page.getByRole("button", { name: "Save page", exact: true }).filter({ visible: true }).first().click();
          await expect(page.getByRole("status").filter({ hasText: "This page was saved." })).toBeVisible();
          const earlier = await load(page, "shop", saveRequests[0].operationId);
          expect(earlier.media.some((asset) => asset.id === expected.kit[0])).toBe(false);
          if (earlier.operation?.status !== "committed") throw new Error("Earlier Shop receipt disappeared");
          expect(earlier.operation.receipt.photos).toEqual(saved.photos);
          expect(earlier.operation.receipt.photoRows).toEqual(saved.photoRows);
        }
        await page.goto("/shop");
        const published = await load(page, "shop");
        for (const photo of [...published.photos, ...published.photoRows]) await assertImage(page, photo.url);
        await page.screenshot({ path: info.outputPath("public-shop.png"), fullPage: true });
        expect(await load(page, "home")).toEqual(homeBefore);
        const tenantDenial = await page.request.get(new URL("/api/admin/shop?surface=shop", page.url()).toString().replace("alpha.localhost", "bravo.localhost"));
        expect(tenantDenial.status()).toBe(404);
        expect(await tenantDenial.text()).toBe("Not found");
        expect(await capture(db, bravo)).toEqual(otherTenant);
        expect(pageErrors).toEqual([]);
        expect(responseErrors).toEqual([]);
        expect(authorizationStatuses).toHaveLength(assets.size);
        expect(authorizationStatuses.every((status) => status === 200)).toBe(true);
        expect(uploadStatuses).toHaveLength(assets.size);
        expect(uploadStatuses.every((status) => status >= 200 && status < 300)).toBe(true);
      } finally {
        try {
          await expect(page.getByRole("button", { name: "Uploading…", exact: true })).toHaveCount(0, { timeout: 30_000 });
          await page.unrouteAll({ behavior: "wait" });
        } catch (error) { cleanupErrors.push(error); }
        await Promise.all(responseJobs);
        try {
          await restore(db, original);
          const afterReceipts = JSON.parse(await rows(db, receiptTable, alpha));
          for (const originalReceipt of JSON.parse(original[receiptTable])) {
            expect(afterReceipts.find((row: { operation_id: string; actor_id: string }) => row.operation_id === originalReceipt.operation_id && row.actor_id === originalReceipt.actor_id)).toEqual(originalReceipt);
          }
          const originalDocuments = JSON.parse(original[documentTable]);
          const afterDocuments = JSON.parse(await rows(db, documentTable, alpha));
          for (const document of originalDocuments) expect(afterDocuments.find((row: { id: string }) => row.id === document.id)).toEqual(document);
          const originalIds = new Set(originalDocuments.map((row: { id: string }) => row.id));
          expect(afterDocuments.filter((row: { id: string }) => !originalIds.has(row.id)).map((row: { id: string }) => row.id).sort()).toEqual([...retainedPresentationDocuments].sort());
        } catch (error) { cleanupErrors.push(error); }
        for (const asset of assets.values()) {
          try {
            const result = await retirePublishedMedia({ clubId: alpha, actorId: owner, assetId: asset.assetId });
            expect(result.status).toBe("retired");
            expect(result.cleanupQueued).toBe(false);
            const stored = (await db.query("select status,deleted_at from onzio.media_assets where id=$1", [asset.assetId])).rows[0];
            expect(stored.status).toBe("orphaned");
            expect(stored.deleted_at).not.toBeNull();
            expect([400, 404]).toContain((await page.request.get(asset.publicUrl)).status());
          } catch (error) { cleanupErrors.push(error); }
        }
        try { expect(await capture(db, bravo)).toEqual(otherTenant); } catch (error) { cleanupErrors.push(error); }
        if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "Shop fixture restoration failed");
        restored = true;
      }
    } finally {
      await writeFile(info.outputPath("verification.json"), JSON.stringify({ scenario, assets: [...assets.values()], saveRequests: saveRequests.map(({ operationId, surface }) => ({ operationId, surface })), receiptRequests, authorizationStatuses, uploadStatuses, responseErrors, pageErrors, retainedPresentationDocuments, cleanupErrors: cleanupErrors.map(String), restored }, null, 2), { mode: 0o600 });
      await db.end();
    }
  });
}
