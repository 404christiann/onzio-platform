import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { ShopSaveRequest, ShopSnapshot } from "../../lib/shop-editor/contract";
import { checkAdminDialog, checkAdminSaveButton } from "./helpers/admin-design-checks";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { presentationDocumentForTemplate } from "../helpers/presentation-fixture";
import { parsePresentationDocument } from "../../packages/presentation";

const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
const evidence = resolve(process.cwd(), ".codex-work/admin-cl-16/browser");
const photoId = (index: number) => `97a51639-b15d-4ac4-8097-12aaac91ec${String(index).padStart(2, "0")}`;
const consoleRecords = new WeakMap<Page, { errors: Array<{ message: string; url: string }>; warnings: string[]; pageErrors: string[]; expectedHttp: Array<{ url: string; status: number }> }>();
function expectedHttp(page: Page, url: string, status: number) {
  consoleRecords.get(page)!.expectedHttp.push({ url, status });
}
async function installLocalAnalytics(page: Page) {
  const url = new URL("/_vercel/insights/script.js", test.info().project.use.baseURL!);
  await page.route(url.href, (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
}
function snapshot(surface: "shop" | "home" = "shop"): ShopSnapshot {
  return { revision: "1", designRevision: "classic-shop-test", templateKey: null, surface,
    sections: [{ id: "section", kit_variant: "home", eyebrow: "Season", title: "Home kit", description: "Original description", bullet_points: ["Sizes: Adult"], store_note: "Pickup", cta_label: "Order", cta_link: "https://example.test/order" }],
    photos: [1, 2, 3].map((index) => ({ rowId: photoId(index), assetId: index === 1 ? null : photoId(index + 10), url: `${pixel}#${index}`, order: index - 1, kit_variant: "home" as const })),
    photoRows: [], purchase: { heading: "How to order", cards: [{ label: "Sizes", title: "Retained title", body: "Adult and youth" }], cta_eyebrow: "Ask us", cta_text: "Contact the office", cta_label: "Contact", cta_link: "https://example.test/contact" }, media: [],
  };
}

async function withShopFixture(page: Page, run: (db: Client, assetIds: string[]) => Promise<void>) {
  const clubId = "11111111-1111-4111-8111-111111111111";
  const db = new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
  await db.connect();
  const tables = ["onzio.shop_kit_section", "onzio.shop_kit_photos", "onzio.shop_carousel_photos", "onzio.shop_purchase_details", "onzio_private.shop_page_revisions", "onzio_private.shop_page_receipts"];
  const before = new Map<string, string>();
  const rawRows = async (table: string) => (await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text as raw from ${table} t where club_id=$1`, [clubId])).rows[0].raw as string;
  for (const table of tables) before.set(table, await rawRows(table));
  const assetIds = (await db.query("select id from onzio.media_assets where club_id=$1", [clubId])).rows.map((row) => row.id);
  const auditStart = (await db.query("select coalesce(max(id),0)::text as id from onzio.audit_events where club_id=$1", [clubId])).rows[0].id;
  try { await run(db, assetIds); }
  finally {
    try {
      await page.unrouteAll({ behavior: "wait" });
      await installLocalAnalytics(page);
    await db.query("begin");
    try {
      await db.query("set local session_replication_role=replica");
      for (const table of [...tables].reverse()) {
        const raw = before.get(table)!;
        if (await rawRows(table) === raw) continue;
        await db.query(`delete from ${table} where club_id=$1`, [clubId]);
        await db.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`, [raw]);
      }
      await db.query("commit");
    } catch (error) { await db.query("rollback"); throw error; }
    const additions = (await db.query("select id,storage_bucket,storage_path from onzio.media_assets where club_id=$1 and not(id=any($2::uuid[]))", [clubId, assetIds])).rows;
    const client = createClient(process.env.SUPABASE_TEST_URL!, process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const cleanupErrors: string[] = [];
    for (const asset of additions) {
      try {
        const referenced = (await db.query("select 1 from onzio.shop_kit_photos where club_id=$1 and media_asset_id=$2 union all select 1 from onzio.shop_carousel_photos where club_id=$1 and media_asset_id=$2", [clubId, asset.id])).rows;
        if (referenced.length) { cleanupErrors.push(`Owned asset ${asset.id} is still referenced.`); continue; }
        const { error } = await client.storage.from(asset.storage_bucket).remove([asset.storage_path]);
        if (error) { cleanupErrors.push(`Owned asset ${asset.id}: ${String(error)}`); continue; }
        await db.query("delete from onzio.media_assets where club_id=$1 and id=$2", [clubId, asset.id]);
      } catch (error) { cleanupErrors.push(`Owned asset ${asset.id}: ${String(error)}`); }
    }
    try { await db.query("delete from onzio.audit_events where club_id=$1 and id>$2::bigint", [clubId, auditStart]); }
    catch (error) { cleanupErrors.push(`Audit cleanup: ${String(error)}`); }
    for (const table of tables) {
      try { if (await rawRows(table) !== before.get(table)) cleanupErrors.push(`Fixture rows differ in ${table}.`); }
      catch (error) { cleanupErrors.push(`Fixture ${table}: ${String(error)}`); }
    }
    expect(cleanupErrors).toEqual([]);
    } finally { await db.end(); }
  }
}

async function withClubhouse(run: () => Promise<void>) {
  const clubId = "11111111-1111-4111-8111-111111111111";
  const db = new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
  await db.connect();
  const raw = async (table: string, key = "club_id") => (await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text as raw from ${table} t where ${key}=$1`, [clubId])).rows[0].raw as string;
  const state = await raw("onzio.presentation_state");
  const documents = await raw("onzio.presentation_documents");
  const publications = await raw("onzio.presentation_publications");
  const club = await raw("onzio.clubs", "id");
  const auditStart = (await db.query("select coalesce(max(id),0)::text as id from onzio.audit_events where club_id=$1", [clubId])).rows[0].id;
  const original = JSON.parse(state)[0];
  const source = JSON.parse(documents).at(-1);
  if (!original || !source) { await db.end(); throw new Error("Synthetic presentation is required."); }
  const configuration = parsePresentationDocument(presentationDocumentForTemplate(source.configuration, "clubhouse"), { surface: "production" });
  const id = randomUUID();
  try {
    const version = Number((await db.query("select coalesce(max(version),0)+1 as version from onzio.presentation_documents where club_id=$1", [clubId])).rows[0].version);
    await db.query("insert into onzio.presentation_documents(id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by) values($1,$2,$3,1,'clubhouse',1,$4::jsonb,$5,$6)",
      [id, clubId, version, JSON.stringify(configuration), createHash("sha256").update(JSON.stringify(configuration)).digest("hex"), original.updated_by]);
    await db.query("update onzio.presentation_state set published_document_id=$1 where club_id=$2", [id, clubId]);
    await run();
  } finally {
    try {
      await db.query("begin");
      try {
        await db.query("set local session_replication_role=replica");
        for (const [table, key, captured] of [["presentation_state", "club_id", state], ["clubs", "id", club]]) {
          if (await raw(`onzio.${table}`, key) === captured) continue;
          const columns = (await db.query("select column_name from information_schema.columns where table_schema='onzio' and table_name=$1 order by ordinal_position", [table])).rows.map((row) => `"${row.column_name}"`);
          await db.query(`update onzio.${table} set (${columns.join(",")})=(select ${columns.join(",")} from jsonb_populate_record(null::onzio.${table},$1::jsonb)) where ${key}=$2`, [JSON.stringify(JSON.parse(captured)[0]), clubId]);
        }
        await db.query("delete from onzio.presentation_documents where id=$1 and club_id=$2", [id, clubId]);
        await db.query("delete from onzio.audit_events where club_id=$1 and id>$2::bigint", [clubId, auditStart]);
        await db.query("commit");
      } catch (error) { await db.query("rollback"); throw error; }
      expect(await raw("onzio.presentation_state")).toBe(state);
      expect(await raw("onzio.presentation_documents")).toBe(documents);
      expect(await raw("onzio.presentation_publications")).toBe(publications);
      expect(await raw("onzio.clubs", "id")).toBe(club);
      expect((await db.query("show session_replication_role")).rows[0].session_replication_role).toBe("origin");
    } finally { await db.end(); }
  }
}

async function open(page: Page, responses?: (request: ShopSaveRequest) => Promise<{ status: number; body: unknown }>, delay = 0, mode = "normal") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const sent: ShopSaveRequest[] = [];
  const state = { shop: snapshot(), home: snapshot("home") };
  if (mode === "empty") { state.shop.sections = []; state.shop.photos = []; state.shop.purchase = null; }
  if (mode === "clubhouse-kits") {
    state.shop.sections = (["home", "away", "third"] as const).map((variant) => ({ ...state.shop.sections[0], id: `section-${variant}`, kit_variant: variant, title: `${variant[0].toUpperCase()}${variant.slice(1)} kit` }));
    state.shop.photos = (["home", "away", "third"] as const).map((variant, index) => ({ rowId: photoId(index + 1), assetId: null, url: `${pixel}#${variant}`, order: 0, kit_variant: variant }));
  }
  if (mode === "long") {
    state.shop.sections[0].title = "Long kit title ".repeat(16);
    state.shop.sections[0].description = "Details for every supporter. ".repeat(100);
    state.shop.sections[0].bullet_points = Array.from({ length: 8 }, (_, index) => `Detail ${index + 1}: ${"Length ".repeat(8)}`);
  }
  await page.route("**/api/admin/shop**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const surface = url.searchParams.get("surface") === "home" ? "home" : "shop";
    if (request.method() === "GET") {
      if (delay && !url.searchParams.has("operationId")) await new Promise((resolve) => setTimeout(resolve, delay));
      await route.fulfill({ json: url.searchParams.has("operationId") ? { ...state[surface], operation: { status: "not-committed" } } : state[surface] });
      return;
    }
    const payload = request.postDataJSON() as ShopSaveRequest;
    sent.push(payload);
    if (responses) {
      const response = await responses(payload);
      if (response.status >= 400) expectedHttp(page, request.url(), response.status);
      await route.fulfill({ status: response.status, json: response.body });
      return;
    }
    const current = structuredClone(state[payload.surface]);
    for (const [key, kit] of Object.entries(payload.variants)) {
      if (!kit) continue;
      current.sections = [...current.sections.filter((section) => section.kit_variant !== key), { ...kit.section, id: `section-${key}`, kit_variant: key as "home" }];
      const old = current.photos;
      current.photos = [...old.filter((photo) => photo.kit_variant !== key), ...kit.photos.map((photo, index) => ({ ...photo, rowId: photo.rowId ?? photoId(50 + index), url: old.find((item) => item.rowId === photo.rowId)?.url ?? pixel, kit_variant: key as "home" }))];
    }
    if (payload.purchase) current.purchase = payload.purchase;
    current.revision = String(Number(current.revision) + 1);
    state[payload.surface] = current;
    await route.fulfill({ json: current });
  });
  await page.setExtraHTTPHeaders({ "Cache-Control": "no-cache" });
  await page.goto("/admin/shop");
  await expect(page.getByRole("heading", { name: "Shop", exact: true })).toBeVisible();
  const shop = page.getByRole("button", { name: /^Shop page/ });
  if (await shop.count()) await shop.click();
  await expect(page.getByRole("tab", { name: "Home kit", exact: true })).toBeVisible();
  const frame = page.frameLocator("iframe[title$='Shop page preview']");
  await expect(frame.getByRole("button", { name: "Edit kit text", exact: true }).first()).toBeVisible();
  if (mode === "clubhouse-kits") await expect(frame.locator(".clubhouse-store-page")).toBeVisible();
  else await expect(frame.locator(".clubhouse-store-page")).toHaveCount(0);
  return { sent, state, frame, errors };
}

test.beforeAll(async () => { await mkdir(evidence, { recursive: true }); });
test.beforeEach(async ({ page, baseURL }, info) => {
  await page.context().addCookies([{ name: "onzio-admin-theme", value: info.project.use.colorScheme === "dark" ? "dark" : "light", domain: new URL(baseURL!).hostname, path: "/admin" }]);
  await installLocalAnalytics(page);
  const records = { errors: [] as Array<{ message: string; url: string }>, warnings: [] as string[], pageErrors: [] as string[], expectedHttp: [] as Array<{ url: string; status: number }> };
  consoleRecords.set(page, records);
  page.on("console", (message) => {
    if (message.type() === "error") records.errors.push({ message: message.text(), url: message.location().url });
    if (message.type() === "warning") records.warnings.push(message.text());
  });
  page.on("pageerror", (error) => records.pageErrors.push(error.message));
});
test.afterEach(async ({ page }, info) => {
  const records = consoleRecords.get(page)!;
  await writeFile(resolve(evidence, `console-${info.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 100)}-${info.project.name}-${info.project.use.colorScheme}.json`), JSON.stringify(records, null, 2));
  expect(records.errors.filter((error) => {
    const status = /^Failed to load resource: the server responded with a status of (\d+)\b/.exec(error.message)?.[1];
    return !status || !records.expectedHttp.some((expected) => expected.url === error.url && expected.status === Number(status));
  })).toEqual([]);
  expect(records.pageErrors).toEqual([]);
  await expect(page.locator(".admin-theme").first()).toHaveAttribute("data-admin-theme", info.project.use.colorScheme === "dark" ? "dark" : "light");
});

test("classic loading uses the measured public layout without an iframe scroller", async ({ page }, info) => {
  for (const mode of ["normal", "empty", "long"]) {
    await page.addInitScript(() => {
      const shifts: Array<{ value: number; recent: boolean; sources: unknown[] }> = [];
      Object.assign(window, { shopLayoutShifts: shifts });
      new PerformanceObserver((list) => {
        for (const item of list.getEntries()) {
          const entry = item as PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: Array<{ node?: Element; previousRect?: DOMRectReadOnly; currentRect?: DOMRectReadOnly }> };
          shifts.push({ value: entry.value, recent: entry.hadRecentInput, sources: (entry.sources ?? []).map((source) => ({ tag: source.node?.tagName ?? "unknown", class: String(source.node?.className ?? ""), before: source.previousRect, after: source.currentRect })) });
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    const opening = open(page, undefined, 1200, mode);
    const frame = page.frameLocator("iframe[title$='Shop page preview']");
    await frame.locator("[data-phase='skeleton']").waitFor({ state: "attached" });
    const initial = await page.locator("[data-shop-classic-canvas]").boundingBox();
    await expect.poll(() => frame.locator("[data-phase='skeleton'] [data-shop-editor-target='copy']").count(), { timeout: 15000, intervals: [16] }).toBeGreaterThan(0);
    await frame.locator("[data-phase='skeleton'] [data-shop-editor-target='copy']").waitFor({ state: "attached" });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const before = await page.locator("[data-shop-classic-canvas]").boundingBox();
    const anchorBefore = await frame.locator("[data-shop-editor-target='copy']").boundingBox();
    const authoredBefore = await frame.locator("[data-shop-preview-content]").evaluate((element) => element.getBoundingClientRect().height);
    await opening;
    await expect(frame.locator("[data-admin-loading-region]")).toHaveAttribute("data-phase", "content");
    const after = await page.locator("[data-shop-classic-canvas]").boundingBox();
    const anchorAfter = await frame.locator("[data-shop-editor-target='copy']").boundingBox();
    const authoredAfter = await frame.locator("[data-shop-preview-content]").evaluate((element) => element.getBoundingClientRect().height);
    expect(Math.abs(authoredAfter - authoredBefore)).toBeLessThanOrEqual(1);
    expect(before!.height).toBeGreaterThanOrEqual(after!.height - 1);
    expect(Math.abs(anchorAfter!.y - anchorBefore!.y)).toBeLessThanOrEqual(1);
    expect(await frame.locator("body").evaluate((body) => Math.abs(body.scrollHeight - body.ownerDocument.documentElement.clientHeight))).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    const shifts = await page.evaluate(() => (window as unknown as { shopLayoutShifts: unknown }).shopLayoutShifts);
    const previewShifts = await frame.locator("body").evaluate((body) => (body.ownerDocument.defaultView as unknown as { shopLayoutShifts: unknown }).shopLayoutShifts);
    await writeFile(resolve(evidence, `loading-${mode}-${info.project.name}-${info.project.use.colorScheme}.json`), JSON.stringify({ initialUnknownExtent: initial, before, after, authoredBefore, authoredAfter, anchorBefore, anchorAfter, shifts, previewShifts }, null, 2));
    await page.screenshot({ path: resolve(evidence, `preview-${mode}-${info.project.name}-${info.project.use.colorScheme}.png`), fullPage: true });
    await page.unrouteAll({ behavior: "wait" });
    await installLocalAnalytics(page);
  }
});

test("classic Shop shows the public preview and live dialog drafts at both sizes", async ({ page }, info) => {
  const { frame, errors, sent } = await open(page);
  await expect(page.getByRole("tab", { name: "Away kit", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Third kit", exact: true })).toBeVisible();
  expect(await checkAdminSaveButton(page)).toEqual([]);
  const opener = frame.getByRole("button", { name: "Edit kit text", exact: true }).first();
  await opener.focus();
  await opener.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Kit text", exact: true });
  await expect(dialog).toBeVisible();
  expect(await checkAdminDialog(page)).toEqual([]);
  await dialog.getByLabel("Kit title", { exact: true }).fill("Live home kit");
  await expect(frame.getByRole("heading", { name: "Live home kit", exact: true })).toBeVisible();
  await page.screenshot({ path: resolve(evidence, `text-${info.project.name}-${info.config.projects[0].use.colorScheme}-${info.project.use.contextOptions?.reducedMotion}.png`), fullPage: true });
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  await opener.press("Enter");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(dialog).toBeVisible();
  await page.locator("[data-slot='admin-dialog-backdrop']").click({ position: { x: 8, y: 8 } });
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  expect(sent).toHaveLength(0);
  await page.getByRole("button", { name: "Phone", exact: true }).click();
  await expect(page.locator("iframe")).toHaveAttribute("title", "Phone Shop page preview");
  await page.getByRole("button", { name: "Desktop", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
});

test("classic purchase cards preserve every field and cap at four", async ({ page }) => {
  const { frame, sent } = await open(page);
  await frame.getByRole("button", { name: "Edit purchase details", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Purchase details", exact: true });
  await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue("Retained title");
  await dialog.getByLabel("Text", { exact: true }).fill("Updated details");
  for (let count = 1; count < 4; count++) await dialog.getByRole("button", { name: "Add detail card", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Add detail card", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Remove detail card 2", exact: true }).click();
  expect(await checkAdminDialog(page)).toEqual([]);
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saved");
  expect(sent[0].purchase?.cards[0]).toEqual({ label: "Sizes", title: "Retained title", body: "Updated details" });
  expect(sent[0].purchase?.cards).toHaveLength(3);
});

test("classic missing-photo validation selects and marks the offending kit", async ({ page }) => {
  const { frame, sent } = await open(page);
  await page.getByRole("tab", { name: "Away kit", exact: true }).click();
  await frame.getByRole("button", { name: "Edit kit text", exact: true }).click();
  await page.getByLabel("Kit title", { exact: true }).fill("Away match kit");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("tab", { name: "Home kit", exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator("main [role='alert']")).toHaveText("Add at least one photo to the away kit before saving.");
  await expect(page.getByRole("tab", { name: "Away kit Needs a photo", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(frame.locator("[data-shop-editor-target='photos']")).toHaveAttribute("data-invalid", "true");
  expect(sent).toHaveLength(0);
});

test("classic photo Undo remains usable inside the dialog and after Done with current reorder", async ({ page }, info) => {
  const { frame, sent } = await open(page);
  await frame.getByRole("button", { name: "Edit kit photos", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Kit photos", exact: true });
  await expect(dialog.locator("[data-photo-id]")).toHaveCount(3);
  await dialog.getByRole("button", { name: "Remove photo 2", exact: true }).click();
  const undo = dialog.getByRole("button", { name: "Undo: Photo removed", exact: true });
  await expect(undo).toBeVisible();
  await undo.focus(); await undo.press("Enter");
  await expect(dialog.locator("[data-photo-id]")).toHaveCount(3);
  await dialog.getByRole("button", { name: "Remove photo 2", exact: true }).click();
  await dialog.getByRole("button", { name: "Move photo 2 earlier", exact: true }).click();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  const pageUndo = page.getByRole("button", { name: "Undo: Photo removed", exact: true }).last();
  await expect(pageUndo).toBeVisible();
  await pageUndo.click();
  await expect(page.locator("[data-slot='admin-dialog']")).toHaveCount(0);
  await frame.getByRole("button", { name: "Edit kit photos", exact: true }).first().click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-photo-id]")).toHaveCount(3);
  const ids = await dialog.locator("[data-photo-id]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-photo-id")));
  expect(ids).toEqual([photoId(13), photoId(1), photoId(12)]);
  await page.screenshot({ path: resolve(evidence, `photos-${info.project.name}-${info.project.use.colorScheme}.png`), fullPage: true });
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  expect(sent).toHaveLength(0);
});

test("classic Save waits for normalized and legacy photo Undo before capturing", async ({ page }) => {
  const { frame, sent } = await open(page);
  await frame.getByRole("button", { name: "Edit kit photos", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Kit photos", exact: true });
  await dialog.getByRole("button", { name: "Remove photo 1", exact: true }).click();
  await dialog.getByRole("button", { name: "Remove photo 1", exact: true }).click();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saving");
  await page.waitForTimeout(250);
  expect(sent).toHaveLength(0);
  const undos = page.getByRole("button", { name: "Undo: Photo removed", exact: true });
  await undos.first().click(); await undos.last().click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0].variants.home?.photos.map((photo) => photo.rowId)).toEqual([photoId(1), photoId(2), photoId(3)]);
});

test("classic expiry sends one save and unknown recovery retries the exact request with newer draft retained", async ({ page }) => {
  let attempts = 0;
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const { frame, sent } = await open(page, async (payload) => {
    attempts++;
    if (attempts === 1) { await held; return { status: 503, body: { error: { message: "Synthetic unknown save" } } }; }
    const receipt = snapshot();
    receipt.sections[0] = { ...receipt.sections[0], ...payload.variants.home!.section };
    receipt.photos = receipt.photos.filter((photo) => payload.variants.home!.photos.some((entry) => entry.rowId === photo.rowId));
    return { status: 200, body: receipt };
  });
  await frame.getByRole("button", { name: "Edit kit photos", exact: true }).first().click();
  await page.getByRole("button", { name: "Remove photo 2", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const start = Date.now();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect.poll(() => sent.length, { timeout: 7000 }).toBe(1);
  expect(Date.now() - start).toBeGreaterThan(4500);
  await frame.getByRole("button", { name: "Edit kit text", exact: true }).first().click();
  await page.getByLabel("Kit title", { exact: true }).fill("Newer field while saving");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  release!();
  await expect(page.getByRole("button", { name: "Retry exact save", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retry exact save", exact: true }).click();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]).toEqual(sent[0]);
  await expect(frame.getByRole("heading", { name: "Newer field while saving", exact: true })).toBeVisible();
  await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "dirty");
});

test("classic aggregate guard keeps both surfaces on partial failure and saves only remaining changes", async ({ page }) => {
  let homeAttempts = 0;
  const { frame, sent } = await open(page, async (payload) => {
    if (payload.surface === "home" && homeAttempts++ === 0) return { status: 400, body: { error: { message: "Homepage fixture rejected", code: "INVALID_CONTENT" } } };
    const receipt = snapshot(payload.surface);
    receipt.sections[0] = { ...receipt.sections[0], ...payload.variants.home!.section };
    return { status: 200, body: receipt };
  });
  await frame.getByRole("button", { name: "Edit kit text", exact: true }).first().click();
  await page.getByLabel("Kit title", { exact: true }).fill("Shop page draft");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Kit text", exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: /^Homepage shop feature/ }).click();
  await frame.getByRole("button", { name: "Edit kit text", exact: true }).first().click();
  await page.getByLabel("Kit title", { exact: true }).fill("Homepage feature draft");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Kit text", exact: true })).not.toBeVisible();
  if (test.info().project.name === "phone") await page.getByRole("button", { name: "Open admin navigation", exact: true }).click();
  const navigation = page.getByRole("navigation", { name: "Primary admin navigation" });
  await navigation.getByRole("button", { name: "Competition", exact: true }).click();
  await navigation.getByRole("link", { name: "Schedule", exact: true }).click();
  const guard = page.getByRole("dialog", { name: "Save your changes first?", exact: true });
  await guard.getByRole("button", { name: "Save and leave", exact: true }).click();
  await expect(guard.getByRole("alert")).toContainText("could not be saved");
  expect(sent.map((payload) => payload.surface)).toEqual(["shop", "home"]);
  expect(sent[0].variants.home?.section.title).toBe("Shop page draft");
  expect(sent[1].variants.home?.section.title).toBe("Homepage feature draft");
  await guard.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(guard).not.toBeVisible();
  await expect(frame.getByRole("heading", { name: "Homepage feature draft", exact: true })).toBeVisible();
  const closeNavigation = page.getByRole("button", { name: "Close admin navigation", exact: true });
  if (await closeNavigation.isVisible()) await closeNavigation.click();
  await expect(page.getByRole("dialog", { name: "Admin navigation", exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saved");
  expect(sent.map((payload) => payload.surface)).toEqual(["shop", "home", "home"]);
});

test("classic conflict keeps the draft until an explicit latest-page confirmation", async ({ page }) => {
  const { frame } = await open(page, async () => ({ status: 409, body: { error: { message: "Content changed", code: "CONTENT_CHANGED" } } }));
  await frame.getByRole("button", { name: "Edit kit text", exact: true }).first().click();
  await page.getByLabel("Kit title", { exact: true }).fill("My conflict draft");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  const review = page.getByRole("region", { name: "Review latest Shop page", exact: true });
  await expect(review).toContainText("Another editor saved this page. Your draft is still here.");
  await review.getByRole("button", { name: "Use latest saved page", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Use the latest saved page?", exact: true });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(frame.getByRole("heading", { name: "My conflict draft", exact: true })).toBeVisible();
  await expect(confirm).not.toBeVisible();
  await review.getByRole("button", { name: "Use latest saved page", exact: true }).click();
  await confirm.getByRole("button", { name: "Use latest saved page", exact: true }).click();
  await expect(frame.getByRole("heading", { name: "Home kit", exact: true })).toBeVisible();
  await expect(review).toHaveCount(0);
});

test("classic real upload, save, reload and both legacy and normalized photo Undo preserve exact references", async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  if (new URL(baseURL!).hostname !== "alpha.localhost" || new URL(process.env.SUPABASE_TEST_URL!).hostname !== "127.0.0.1") throw new Error("Real Shop fixture requires synthetic loopback Alpha");
  const clubId = "11111111-1111-4111-8111-111111111111";
  const sent: ShopSaveRequest[] = [];
  let releaseFinalization: (() => void) | undefined;
  const finalization = new Promise<void>((resolve) => { releaseFinalization = resolve; });
  const cleanupRequests: string[] = [];
  page.on("request", (request) => { if (request.url().endsWith("/api/admin/shop") && request.method() === "POST") sent.push(request.postDataJSON()); });
  page.on("request", (request) => { if (request.url().endsWith("/api/admin/media/cleanup") && request.method() === "POST") cleanupRequests.push(request.postDataJSON().assetId); });
  await withShopFixture(page, async (db, assetIds) => {
  try {
    await db.query("begin");
    try {
      await db.query("set local session_replication_role=replica");
      await db.query("delete from onzio.shop_kit_photos where club_id=$1 and surface='shop'", [clubId]);
      await db.query("delete from onzio.shop_kit_section where club_id=$1 and surface='shop'", [clubId]);
      await db.query("commit");
    } catch (error) { await db.query("rollback"); throw error; }
    await page.goto("/admin/shop");
    const surface = page.getByRole("button", { name: /^Shop page/ });
    if (await surface.count()) await surface.click();
    const frame = page.frameLocator("iframe[title$='Shop page preview']");
    await frame.getByRole("button", { name: "Edit kit text", exact: true }).first().click();
    await page.getByLabel("Small heading", { exact: true }).fill("2026 local season");
    await page.getByLabel("Kit title", { exact: true }).fill("Classic real kit");
    await page.getByLabel("Description", { exact: true }).fill("Real pipeline and persistence");
    await page.getByLabel("Bullet points, one per line", { exact: true }).fill("Sizes: Adult\nFit: Regular");
    await page.getByLabel("Store information", { exact: true }).fill("Local pickup");
    await page.getByLabel("Button text", { exact: true }).fill("Order the kit");
    await page.getByLabel("Buy link", { exact: true }).fill("orders@alpha.test");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Kit text", exact: true })).not.toBeVisible();
    await frame.getByRole("button", { name: "Edit kit photos", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Kit photos", exact: true });
    await expect(dialog).toBeVisible();
    let firstFinalize = true;
    await page.route("**/api/admin/media/finalize", async (route) => {
      if (!firstFinalize) { await route.continue(); return; }
      firstFinalize = false;
      const response = await route.fetch();
      await finalization;
      await route.fulfill({ response });
    });
    const png = await page.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = 800; canvas.height = 600; const context = canvas.getContext("2d")!; context.fillStyle = "#123a68"; context.fillRect(0, 0, 800, 600); return canvas.toDataURL("image/png").split(",")[1]; });
    await dialog.locator("input[type=file]").setInputFiles({ name: "classic-real.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    await expect(dialog.locator("[data-admin-photo-pending]")).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    if (test.info().project.name === "phone") await page.getByRole("button", { name: "Open admin navigation", exact: true }).click();
    const navigation = page.getByRole("navigation", { name: "Primary admin navigation" });
    await navigation.getByRole("button", { name: "Competition", exact: true }).click();
    await navigation.getByRole("link", { name: "Schedule", exact: true }).click();
    const guard = page.getByRole("dialog", { name: "Save your changes first?", exact: true });
    await expect(guard).toBeVisible();
    await guard.getByRole("button", { name: "Save and leave", exact: true }).click();
    await expect(guard.getByRole("alert")).toContainText("Your changes could not be saved");
    expect(sent).toHaveLength(0);
    releaseFinalization!();
    await expect(page.locator("[data-admin-photo-pending]")).toHaveCount(0, { timeout: 30000 });
    const newAssets = (await db.query("select id from onzio.media_assets where club_id=$1 and not(id=any($2::uuid[])) and status='published'", [clubId, assetIds])).rows;
    expect(newAssets).toHaveLength(1);
    const normalizedId = newAssets[0].id;
    await guard.getByRole("button", { name: "Save and leave", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/schedule$/, { timeout: 15000 });
    expect(sent).toHaveLength(1);
    expect(sent[0].variants.home?.section).toEqual({ eyebrow: "2026 local season", title: "Classic real kit", description: "Real pipeline and persistence", bullet_points: ["Sizes: Adult", "Fit: Regular"], store_note: "Local pickup", cta_label: "Order the kit", cta_link: "mailto:orders@alpha.test" });
    expect(sent[0].variants.home?.photos.some((photo) => photo.assetId === normalizedId)).toBe(true);
    const legacyId = randomUUID();
    const nextOrder = (await db.query("select count(*)::int as count from onzio.shop_kit_photos where club_id=$1 and surface='shop' and kit_variant='home'", [clubId])).rows[0].count;
    await db.query("insert into onzio.shop_kit_photos(id,club_id,surface,kit_variant,url,sort_order) values($1,$2,'shop','home','/images/shop/rosecityshirt1.webp',$3)", [legacyId, clubId, nextOrder]);
    await page.goto("/admin/shop");
    await expect(frame.getByRole("heading", { name: "Classic real kit", exact: true })).toBeVisible();
    for (const id of [legacyId, normalizedId]) {
      await frame.getByRole("button", { name: "Edit kit photos", exact: true }).first().click();
      const count = await dialog.locator("[data-photo-id]").count();
      await dialog.locator(`[data-photo-id='${id}']`).getByRole("button", { name: /^Remove/ }).click();
      await page.getByRole("button", { name: "Done", exact: true }).click();
      const previous = sent.length;
      await page.getByRole("button", { name: "Save changes", exact: true }).click();
      await page.waitForTimeout(150);
      expect(sent).toHaveLength(previous);
      await page.getByRole("button", { name: "Undo: Photo removed", exact: true }).last().click();
      await expect.poll(() => sent.length).toBe(previous + 1);
      await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saved");
      expect((await db.query("select count(*)::int as count from onzio.shop_kit_photos where club_id=$1 and surface='shop' and kit_variant='home'", [clubId])).rows[0].count).toBe(count);
      expect((await db.query("select status from onzio.media_assets where id=$1", [normalizedId])).rows[0].status).toBe("published");
    }
    await frame.getByRole("button", { name: "Edit kit photos", exact: true }).first().click();
    await expect(dialog).toBeVisible();
    const input = dialog.locator("input[type=file]");
    await input.setInputFiles({ name: "unsafe.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
    await expect(dialog.locator("[data-admin-photo-message]")).toContainText("not a supported image");
    await input.setInputFiles({ name: "oversized.png", mimeType: "image/png", buffer: Buffer.alloc(15 * 1024 * 1024 + 1) });
    await expect(dialog.locator("[data-admin-photo-message]")).toContainText("The limit is 15 MB");
    await input.setInputFiles({ name: "unreadable.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
    await expect(dialog.locator("[data-admin-photo-message]")).toContainText("not a readable image");
    await dialog.locator("[data-admin-photo-manager]").evaluate((manager) => {
      const canvas = document.createElement("canvas"); canvas.width = 100; canvas.height = 100;
      const bytes = Uint8Array.from(atob(canvas.toDataURL("image/png").split(",")[1]), (char) => char.charCodeAt(0));
      const transfer = new DataTransfer();
      for (let index = 0; index < 5; index++) transfer.items.add(new File([bytes], `cap-${index}.png`, { type: "image/png" }));
      manager.querySelector("[class*='drop']")!.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer }));
    });
    await expect(dialog.locator("[data-admin-photo-message]")).toContainText("Only 6 photos fit. 1 were not added.");
    await expect(dialog.locator("[data-admin-photo-pending]")).toHaveCount(0, { timeout: 30000 });
    await expect(dialog.locator("[data-photo-id]")).toHaveCount(6);
    await expect(dialog.getByRole("button", { name: "Add photos", exact: true })).toBeDisabled();
    await dialog.getByRole("button", { name: "Move photo 2 earlier", exact: true }).click();
    const order = await dialog.locator("[data-photo-id]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-photo-id")));
    if (test.info().project.name === "desktop") {
      await dialog.locator("[data-photo-id]").first().dragTo(dialog.locator("[data-photo-id]").last());
    } else {
      const move = dialog.getByRole("button", { name: "Move photo 1 later", exact: true });
      await move.focus(); await move.press("Enter");
    }
    await expect.poll(async () => dialog.locator("[data-photo-id]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-photo-id")))).not.toEqual(order);
    const expectedIds = await dialog.locator("[data-photo-id]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-photo-id")));
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saved");
    expect(sent.at(-1)?.variants.home?.photos.map((photo) => photo.assetId ?? photo.rowId)).toEqual(expectedIds);
    await page.reload();
    await frame.getByRole("button", { name: "Edit kit photos", exact: true }).first().click();
    await expect(dialog.locator("[data-photo-id]")).toHaveCount(6);
    await dialog.getByRole("button", { name: "Remove photo 1", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Add photos", exact: true })).toBeEnabled({ timeout: 7000 });
    const beforeUncertain = (await db.query("select id from onzio.media_assets where club_id=$1", [clubId])).rows.map((row) => row.id);
    await dialog.locator("input[type=file]").setInputFiles({ name: "uncertain.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    await expect(dialog.locator("[data-admin-photo-pending]")).toBeVisible();
    await expect(dialog.locator("[data-admin-photo-pending]")).toHaveCount(0, { timeout: 30000 });
    const uncertainAssets = (await db.query("select id from onzio.media_assets where club_id=$1 and not(id=any($2::uuid[])) and status='published'", [clubId, beforeUncertain])).rows;
    expect(uncertainAssets).toHaveLength(1);
    const uncertainAsset = uncertainAssets[0].id;
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    let firstUnknown = true;
    await page.route("**/api/admin/shop**", async (route) => {
      const request = route.request();
      if (request.method() === "GET" && new URL(request.url()).searchParams.has("operationId")) {
        expectedHttp(page, request.url(), 503);
        await route.fulfill({ status: 503, json: { error: { message: "Injected receipt unavailable" } } });
      } else if (request.method() === "POST" && firstUnknown) {
        firstUnknown = false;
        const committed = await route.fetch();
        expect(committed.ok()).toBe(true);
        expectedHttp(page, request.url(), 503);
        await route.fulfill({ status: 503, json: { error: { message: "Injected lost commit response" } } });
      } else await route.continue();
    });
    const beforeUnknownRequests = sent.length;
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.getByRole("button", { name: "Retry exact save", exact: true })).toBeVisible();
    await frame.getByRole("button", { name: "Edit kit photos", exact: true }).first().click();
    await dialog.locator(`[data-photo-id='${uncertainAsset}']`).getByRole("button", { name: /^Remove/ }).click();
    await expect(dialog.getByRole("button", { name: "Undo: Photo removed", exact: true })).toHaveCount(0, { timeout: 7000 });
    expect((await db.query("select status from onzio.media_assets where id=$1", [uncertainAsset])).rows[0].status).toBe("published");
    expect((await db.query("select count(*)::int as count from onzio.shop_kit_photos where club_id=$1 and media_asset_id=$2", [clubId, uncertainAsset])).rows[0].count).toBe(1);
    expect(cleanupRequests).not.toContain(uncertainAsset);
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.getByRole("button", { name: "Retry exact save", exact: true }).click();
    await expect.poll(() => sent.length).toBe(beforeUnknownRequests + 2);
    expect(sent[beforeUnknownRequests + 1]).toEqual(sent[beforeUnknownRequests]);
    await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "dirty");
    expect((await db.query("select status from onzio.media_assets where id=$1", [uncertainAsset])).rows[0].status).toBe("published");
    expect(cleanupRequests).not.toContain(uncertainAsset);
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saved");
    const retiredUncertain = (await db.query("select status,deleted_at from onzio.media_assets where id=$1", [uncertainAsset])).rows[0];
    expect(retiredUncertain.status).toBe("orphaned");
    expect(retiredUncertain.deleted_at).not.toBeNull();

    await frame.getByRole("button", { name: "Edit kit photos", exact: true }).first().click();
    await expect(dialog).toBeVisible();
    const beforeExpiry = (await db.query("select id from onzio.media_assets where club_id=$1", [clubId])).rows.map((row) => row.id);
    await dialog.locator("input[type=file]").setInputFiles({ name: "expire-unsaved.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    await expect(dialog.locator("[data-admin-photo-pending]")).toBeVisible();
    await expect(dialog.locator("[data-admin-photo-pending]")).toHaveCount(0, { timeout: 30000 });
    const expiryAssets = (await db.query("select id,storage_bucket,storage_path from onzio.media_assets where club_id=$1 and not(id=any($2::uuid[])) and status='published'", [clubId, beforeExpiry])).rows;
    expect(expiryAssets).toHaveLength(1);
    const expiryAsset = expiryAssets[0];
    const removedAt = Date.now();
    await dialog.locator(`[data-photo-id='${expiryAsset.id}']`).getByRole("button", { name: /^Remove/ }).click();
    expect((await db.query("select status from onzio.media_assets where id=$1", [expiryAsset.id])).rows[0].status).toBe("published");
    await expect.poll(async () => (await db.query("select status from onzio.media_assets where id=$1", [expiryAsset.id])).rows[0].status, { timeout: 8000 }).toBe("orphaned");
    expect((await db.query("select deleted_at from onzio.media_assets where id=$1", [expiryAsset.id])).rows[0].deleted_at).not.toBeNull();
    expect(cleanupRequests.filter((assetId) => assetId === expiryAsset.id)).toHaveLength(1);
    expect(Date.now() - removedAt).toBeGreaterThanOrEqual(4800);
    const deleted = await fetch(`${process.env.SUPABASE_TEST_URL}/storage/v1/object/public/${expiryAsset.storage_bucket}/${expiryAsset.storage_path}`);
    expect([400, 404]).toContain(deleted.status);
  } finally { releaseFinalization?.(); }
  });
});


test("classic Save holds Saving and resets Saved for the header", async ({ page }) => {
  const { sent } = await open(page);
  await page.getByRole("group", { name: "Kit editing tools" }).getByRole("button", { name: "Edit kit text", exact: true }).click();
  await page.getByLabel("Kit title", { exact: true }).fill("Timed kit");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator('[data-slot="admin-dialog-backdrop"]:visible')).toHaveCount(0);
  await page.locator("[data-admin-save-button]").evaluate((button) => {
    const phases: Array<{ state: string | null; at: number }> = [];
    Object.assign(window, { shopSavePhases: phases });
    new MutationObserver(() => phases.push({ state: button.getAttribute("data-state"), at: performance.now() })).observe(button, { attributes: true, attributeFilter: ["data-state"] });
  });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saving");
  await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saved");
  await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "clean", { timeout: 4000 });
  const phases = await page.evaluate(() => (window as unknown as { shopSavePhases: Array<{ state: string; at: number }> }).shopSavePhases);
  const saving = phases.find((phase) => phase.state === "saving")!;
  const saved = phases.find((phase) => phase.state === "saved")!;
  const clean = phases.find((phase) => phase.state === "clean" && phase.at > saved.at)!;
  expect(saved.at - saving.at).toBeGreaterThanOrEqual(380);
  expect(clean.at - saved.at).toBeGreaterThanOrEqual(1880);
  expect(clean.at - saved.at).toBeLessThan(2300);
  await writeFile(resolve(evidence, `r2-header-timing-${test.info().project.name}.json`), JSON.stringify(phases, null, 2));
  expect(sent).toHaveLength(1);
});

test("classic exact retry holds Saving and resets Saved without changing its request", async ({ page }) => {
  let attempts = 0;
  const { sent } = await open(page, async (payload) => {
    if (++attempts === 1) return { status: 503, body: { error: { message: "Synthetic unknown save" } } };
    const receipt = snapshot();
    receipt.revision = "2";
    receipt.sections[0] = { ...receipt.sections[0], ...payload.variants.home!.section };
    return { status: 200, body: receipt };
  });
  await page.getByRole("group", { name: "Kit editing tools" }).getByRole("button", { name: "Edit kit text", exact: true }).click();
  await page.getByLabel("Kit title", { exact: true }).fill("Timed exact retry");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator('[data-slot="admin-dialog-backdrop"]:visible')).toHaveCount(0);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry exact save", exact: true })).toBeEnabled();
  await page.locator("[data-admin-save-button]").evaluate((button) => {
    const phases: Array<{ state: string | null; at: number }> = [];
    Object.assign(window, { shopRetryPhases: phases });
    new MutationObserver(() => phases.push({ state: button.getAttribute("data-state"), at: performance.now() })).observe(button, { attributes: true, attributeFilter: ["data-state"] });
  });
  await page.getByRole("button", { name: "Retry exact save", exact: true }).click();
  await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saving");
  await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saved");
  await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "clean", { timeout: 4000 });
  const phases = await page.evaluate(() => (window as unknown as { shopRetryPhases: Array<{ state: string; at: number }> }).shopRetryPhases);
  const saving = phases.find((phase) => phase.state === "saving")!;
  const saved = phases.find((phase) => phase.state === "saved")!;
  const clean = phases.find((phase) => phase.state === "clean" && phase.at > saved.at)!;
  expect(saved.at - saving.at).toBeGreaterThanOrEqual(380);
  expect(clean.at - saved.at).toBeGreaterThanOrEqual(1880);
  expect(clean.at - saved.at).toBeLessThan(2300);
  await writeFile(resolve(evidence, `r2-retry-timing-${test.info().project.name}.json`), JSON.stringify(phases, null, 2));
  expect(sent).toHaveLength(2);
  expect(sent[1]).toEqual(sent[0]);
});

test("classic partial upload keeps its successful photo and failed-file message", async ({ page }) => {
  const { sent } = await open(page);
  let calls = 0;
  const assetId = photoId(90);
  await page.route("**/api/admin/media/authorize", async (route) => {
    calls++;
    if (calls === 2) {
      expectedHttp(page, route.request().url(), 400);
      await route.fulfill({ status: 400, json: { error: { code: "TEST_UPLOAD_REJECTED", message: "second.png could not be uploaded." } } });
    } else await route.fulfill({ json: { path: "classic-partial/first.png", token: "inert-local-fixture", authorization: "inert-local-fixture" } });
  });
  await page.route("**/storage/v1/object/upload/sign/onzio-upload-staging/**", (route) => route.fulfill({ json: { Key: "classic-partial/first.png" } }));
  await page.route("**/api/admin/media/finalize", (route) => route.fulfill({ json: { data: { assetId, storagePath: "classic-partial/first.png", publicUrl: pixel } } }));
  await page.getByRole("group", { name: "Kit editing tools" }).getByRole("button", { name: "Edit kit photos", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Kit photos", exact: true });
  const png = await page.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = 80; canvas.height = 60; return canvas.toDataURL("image/png").split(",")[1]; });
  await dialog.locator("input[type=file]").setInputFiles(["first.png", "second.png"].map((name) => ({ name, mimeType: "image/png", buffer: Buffer.from(png, "base64") })));
  await expect(dialog.locator("[data-admin-photo-pending]")).toHaveCount(0, { timeout: 15000 });
  await expect(dialog.locator("[data-photo-id]")).toHaveCount(4);
  await expect(page.getByRole("alert").filter({ hasText: "second.png could not be uploaded." })).toContainText("second.png could not be uploaded.");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator('[data-slot="admin-dialog-backdrop"]:visible')).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: "second.png could not be uploaded." })).toContainText("second.png could not be uploaded.");
  await page.screenshot({ path: resolve(evidence, `r2-partial-upload-${test.info().project.name}.png`), fullPage: true });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saved");
  expect(calls).toBe(2);
  expect(sent).toHaveLength(1);
  expect(sent[0].variants.home?.photos).toHaveLength(4);
  expect(sent[0].variants.home?.photos.at(-1)?.assetId).toBe(assetId);
});

test("classic empty Clubhouse kits can create text and photos and persist every kit", async ({ page }) => {
  test.setTimeout(120000);
  await withClubhouse(async () => withShopFixture(page, async (db) => {
    const clubId = "11111111-1111-4111-8111-111111111111";
    await db.query("begin");
    try {
      await db.query("set local session_replication_role=replica");
      await db.query("delete from onzio.shop_kit_photos where club_id=$1 and surface='shop'", [clubId]);
      await db.query("delete from onzio.shop_kit_section where club_id=$1 and surface='shop'", [clubId]);
      await db.query("commit");
    } catch (error) { await db.query("rollback"); throw error; }
    await page.setExtraHTTPHeaders({ "Cache-Control": "no-cache" });
    await page.goto("/admin/shop");
    const frame = page.frameLocator("iframe[title$='Shop page preview']");
    await expect(frame.locator(".clubhouse-store-page")).toBeVisible();
    await expect(frame.locator(".clubhouse-store-product-card")).toHaveCount(0);
    const tools = page.getByRole("group", { name: "Kit editing tools" });
    const png = await page.evaluate(() => { const canvas = document.createElement("canvas"); canvas.width = 800; canvas.height = 600; const context = canvas.getContext("2d")!; context.fillStyle = "#123a68"; context.fillRect(0, 0, 800, 600); return canvas.toDataURL("image/png").split(",")[1]; });
    for (const variant of ["Home", "Away", "Third"]) {
      await page.getByRole("tab", { name: `${variant} kit`, exact: true }).click();
      await tools.getByRole("button", { name: "Edit kit text", exact: true }).click();
      const text = page.getByRole("dialog", { name: "Kit text", exact: true });
      await expect(text).toContainText(`Shop page · ${variant} kit`);
      await text.getByLabel("Kit title", { exact: true }).fill(`New ${variant} kit`);
      await text.getByRole("button", { name: "Done", exact: true }).click();
      await expect(page.locator('[data-slot="admin-dialog-backdrop"]:visible')).toHaveCount(0);
      await tools.getByRole("button", { name: "Edit kit photos", exact: true }).click();
      const photos = page.getByRole("dialog", { name: "Kit photos", exact: true });
      await photos.locator("input[type=file]").setInputFiles({ name: `${variant.toLowerCase()}.png`, mimeType: "image/png", buffer: Buffer.from(png, "base64") });
      await expect(photos.locator("[data-photo-id]")).toHaveCount(1, { timeout: 30000 });
      await expect(photos.locator("[data-admin-photo-pending]")).toHaveCount(0, { timeout: 30000 });
      await photos.getByRole("button", { name: "Done", exact: true }).click();
      await expect(page.locator('[data-slot="admin-dialog-backdrop"]:visible')).toHaveCount(0);
    }
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saved", { timeout: 30000 });
    const sections = (await db.query("select kit_variant,title from onzio.shop_kit_section where club_id=$1 and surface='shop' order by kit_variant", [clubId])).rows;
    expect(sections).toEqual(["away", "home", "third"].map((variant) => ({ kit_variant: variant, title: `New ${variant[0].toUpperCase()}${variant.slice(1)} kit` })));
    expect((await db.query("select media_asset_id from onzio.shop_kit_photos where club_id=$1 and surface='shop'", [clubId])).rows).toHaveLength(3);
    await page.reload();
    await expect(frame.locator(".clubhouse-store-product-card")).toHaveCount(3);
    for (const variant of ["Home", "Away", "Third"]) await expect(frame.locator(".clubhouse-store-product-card").filter({ hasText: `New ${variant} kit` })).toHaveCount(1);
    await page.screenshot({ path: resolve(evidence, `r2-empty-clubhouse-${test.info().project.name}.png`), fullPage: true });
  }));
});

test("classic Clubhouse keyboard activation edits the activated Away and Third kit", async ({ page }) => {
  await withClubhouse(async () => {
    await page.setExtraHTTPHeaders({ "Cache-Control": "no-cache" });
    const { frame, sent } = await open(page, undefined, 0, "clubhouse-kits");
    const dialog = page.getByRole("dialog", { name: "Kit text", exact: true });
    for (const [variant, key, photo] of [["Away", "Enter", 2], ["Third", "Space", 3]] as const) {
      await page.getByRole("tab", { name: "Home kit", exact: true }).click();
      const card = frame.locator(".clubhouse-store-product-card").filter({ hasText: `${variant} kit` });
      await card.focus();
      await page.keyboard.press(key);
      await expect(dialog).toContainText(`Shop page · ${variant} kit`);
      await expect(dialog.getByLabel("Kit title", { exact: true })).toHaveValue(`${variant} kit`);
      await dialog.getByLabel("Kit title", { exact: true }).fill(`Keyboard ${variant} kit`);
      await dialog.getByRole("button", { name: "Done", exact: true }).click();
      await expect(page.locator('[data-slot="admin-dialog-backdrop"]:visible')).toHaveCount(0);
      await page.getByRole("group", { name: "Kit editing tools" }).getByRole("button", { name: "Edit kit photos", exact: true }).click();
      const photos = page.getByRole("dialog", { name: "Kit photos", exact: true });
      await expect(photos.locator("[data-photo-id]")).toHaveAttribute("data-photo-id", photoId(photo));
      await photos.getByRole("button", { name: "Done", exact: true }).click();
      await expect(page.locator('[data-slot="admin-dialog-backdrop"]:visible')).toHaveCount(0);
    }
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saved");
    expect(sent[0].variants.away?.section.title).toBe("Keyboard Away kit");
    expect(sent[0].variants.third?.section.title).toBe("Keyboard Third kit");
    expect(sent[0].variants.home).toBeUndefined();
    await page.screenshot({ path: resolve(evidence, `r2-keyboard-clubhouse-${test.info().project.name}.png`), fullPage: true });
  });
});


test("classic natural loading keeps known authored geometry at 100 and 400ms", async ({ page }, info) => {
  for (const delay of [100, 400]) for (const mode of ["empty", "normal", "long"]) {
    await page.addInitScript(() => {
      const frames: Array<{ phase: string | undefined; visibility: string; height: number; viewport: number; targets: Array<{ name: string | null; x: number; y: number; width: number; height: number }> }> = [];
      Object.assign(window, { shopKnownGeometry: frames });
      const sample = () => {
        const root = document.querySelector<HTMLElement>("[data-admin-loading-region]");
        const content = root?.querySelector<HTMLElement>("[data-shop-preview-content]");
        if (root && content) frames.push({
          phase: root.dataset.phase, visibility: getComputedStyle(content).visibility,
          height: content.getBoundingClientRect().height, viewport: document.documentElement.clientHeight,
          targets: Array.from(content.querySelectorAll("[data-shop-editor-target]")).map((target) => {
            const box = target.getBoundingClientRect();
            return { name: target.getAttribute("data-shop-editor-target"), x: box.x, y: box.y, width: box.width, height: box.height };
          }),
        });
        if (frames.length < 2000) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    const { frame } = await open(page, undefined, delay, mode);
    const root = frame.locator("[data-admin-loading-region]");
    await expect(root).toHaveAttribute("data-phase", "content");
    const geometry = await root.evaluate((element) => {
      const content = element.querySelector<HTMLElement>("[data-shop-preview-content]")!;
      return {
        height: content.getBoundingClientRect().height, viewport: document.documentElement.clientHeight,
        scrollHeight: document.body.scrollHeight,
        targets: Array.from(content.querySelectorAll("[data-shop-editor-target]")).map((target) => {
          const box = target.getBoundingClientRect();
          return { name: target.getAttribute("data-shop-editor-target"), x: box.x, y: box.y, width: box.width, height: box.height };
        }),
        frames: (window as unknown as { shopKnownGeometry: Array<{ phase: string; visibility: string; height: number; viewport: number; targets: Array<{ name: string | null; x: number; y: number; width: number; height: number }> }> }).shopKnownGeometry,
      };
    });
    const known = geometry.frames.filter((frame) => frame.targets.length > 0 && frame.visibility === "hidden").at(-1);
    if (delay === 400) expect(known, "the delayed authored layout was measured before reveal").toBeDefined();
    if (known) {
      expect(Math.abs(known.height - geometry.height)).toBeLessThanOrEqual(1);
      expect(known.viewport).toBeGreaterThanOrEqual(Math.ceil(geometry.height));
      expect(known.targets.map(({ name }) => name)).toEqual(geometry.targets.map(({ name }) => name));
      for (let index = 0; index < known.targets.length; index++) for (const key of ["x", "y", "width", "height"] as const) {
        expect(Math.abs(known.targets[index][key] - geometry.targets[index][key])).toBeLessThanOrEqual(1);
      }
    }
    expect(Math.abs(geometry.scrollHeight - geometry.viewport)).toBeLessThanOrEqual(1);
    expect(geometry.viewport).toBe(Math.ceil(geometry.height));
    await writeFile(resolve(evidence, "natural-" + delay + "-" + mode + "-" + info.project.name + "-" + info.project.use.colorScheme + ".json"), JSON.stringify(geometry, null, 2));
    await page.unrouteAll({ behavior: "wait" });
    await installLocalAnalytics(page);
  }
});

test("classic pre-data Shop skeleton paints the active theme across its iframe reveal", async ({ page }, info) => {
  let release!: () => void;
  const response = new Promise<void>((resolve) => { release = resolve; });
  const initialTheme = info.project.use.colorScheme === "dark" ? "dark" : "light";
  await page.context().addCookies([{ name: "onzio-admin-theme", value: initialTheme, domain: new URL(info.project.use.baseURL!).hostname, path: "/admin" }]);
  await page.route("**/api/admin/shop**", async (route) => {
    await response;
    await route.fulfill({ json: { ...snapshot(new URL(route.request().url()).searchParams.get("surface") === "home" ? "home" : "shop"), sections: [], photos: [], purchase: null } });
  });
  const frame = page.frameLocator("iframe[title$='Shop page preview']");
  const root = frame.locator("[data-admin-loading-region]");
  const loading = page.locator('[data-shop-preview-skeleton-host] [aria-label="Loading Shop page"]');
  const anchors = () => page.locator("main h1,[data-admin-save-button],[role=tablist],[aria-label='Kit editing tools']").evaluateAll((nodes) =>
    nodes.map((node) => ({ x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
  const paint = () => loading.evaluate((element) => {
    const css = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const scale = box.width / (element as HTMLElement).offsetWidth;
    return {
      background: css.backgroundColor, height: (element as HTMLElement).offsetHeight,
      muted: css.getPropertyValue("--muted").trim(), foreground: css.getPropertyValue("--foreground").trim(),
      spans: Array.from(element.querySelectorAll("[data-admin-shimmer]")).map((span) => ({
        background: getComputedStyle(span).backgroundColor,
        gradient: getComputedStyle(span, "::after").backgroundImage,
        animation: getComputedStyle(span, "::after").animationName,
        duration: getComputedStyle(span, "::after").animationDuration,
        x: (span.getBoundingClientRect().x - box.x) / scale, y: (span.getBoundingClientRect().y - box.y) / scale,
         width: (span as HTMLElement).offsetWidth, height: (span as HTMLElement).offsetHeight,
      })),
    };
  });
  const expectedPaint = () => page.locator(".admin-theme").first().evaluate((element) => {
    const probe = element.ownerDocument.createElement("span");
    probe.style.cssText = "position:fixed;visibility:hidden;background:hsl(var(--muted))";
    element.append(probe);
    const mutedColor = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { mutedColor, muted: getComputedStyle(element).getPropertyValue("--muted").trim(),
      foreground: getComputedStyle(element).getPropertyValue("--foreground").trim(),
      background: getComputedStyle(element).backgroundColor };
  });
  try {
    await page.goto("/admin/shop");
    await expect(root).toHaveAttribute("data-phase", "skeleton");
    await expect(root).toHaveCSS("opacity", "1");
    await expect(loading.locator("[data-admin-shimmer]")).toHaveCount(3);
    const beforeAnchors = await anchors();
    const before = await paint();
    const expected = await expectedPaint();
    const otherTheme = initialTheme === "light" ? "dark" : "light";
    await page.getByRole("button", { name: "Switch to " + otherTheme + " theme" }).click();
    await expect(page.locator(".admin-theme").first()).toHaveAttribute("data-admin-theme", otherTheme);
    const changed = await paint();
    const changedExpected = await expectedPaint();
    await page.getByRole("button", { name: "Switch to " + initialTheme + " theme" }).click();
    await expect(page.locator(".admin-theme").first()).toHaveAttribute("data-admin-theme", initialTheme);
    const restored = await paint();
    const themedAnchors = await anchors();
    await loading.evaluate((element) => {
      const originalSpans = Array.from(element.querySelectorAll("[data-admin-shimmer]"));
      const frames: Array<{ phase: string | undefined; theme: string | null; sameNode: boolean; opacity: string; targets: number; browserBottom: number; canvasBottom: number; hostBottom: number; contentVisibility: string; skeletonOpacity: string; contentOpacity: string; spans: Array<{ x: number; y: number; width: number; height: number; paintedHeight: number; background: string }> }> = [];
      Object.assign(window, { shopOpaquePaintFrames: frames });
      const iframe = document.querySelector<HTMLIFrameElement>("iframe[title$='Shop page preview']")!;
      const root = iframe.contentDocument!.querySelector<HTMLElement>("[data-admin-loading-region]")!;
      const host = element.closest<HTMLElement>("[data-shop-preview-skeleton-host]")!;
      const sample = () => {
        const content = root.querySelector<HTMLElement>("[data-shop-preview-content]");
        const phase = root.dataset.phase;
        frames.push({ phase, theme: element.getAttribute("data-admin-theme"), sameNode: document.querySelector('[aria-label="Loading Shop page"]') === element,
          opacity: getComputedStyle(root).opacity, targets: root.querySelectorAll("[data-shop-editor-target]").length,
          browserBottom: iframe.parentElement!.parentElement!.getBoundingClientRect().bottom,
          canvasBottom: iframe.closest("[data-shop-classic-canvas]")!.getBoundingClientRect().bottom,
          hostBottom: host.getBoundingClientRect().bottom,
          contentVisibility: content ? getComputedStyle(content).visibility : "visible",
          contentOpacity: content ? getComputedStyle(content).opacity : "1",
          skeletonOpacity: getComputedStyle(host).opacity,
          spans: originalSpans.map((span) => {
            const box = span.getBoundingClientRect(), loadingBox = element.getBoundingClientRect(), hostBox = host.getBoundingClientRect();
            const scale = loadingBox.width / (element as HTMLElement).offsetWidth;
            return { x: (box.x - loadingBox.x) / scale, y: (box.y - loadingBox.y) / scale,
              width: (span as HTMLElement).offsetWidth, height: (span as HTMLElement).offsetHeight,
              paintedHeight: Math.max(0, Math.min(hostBox.bottom, box.bottom, innerHeight) - Math.max(hostBox.top, box.top, 0)),
              background: getComputedStyle(span).backgroundColor }; }) });
        if (phase !== "content" && frames.length < 2000) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    release();
    await expect.poll(() => page.evaluate(() => (window as unknown as { shopOpaquePaintFrames: Array<{ phase: string; targets: number }> }).shopOpaquePaintFrames.some((frame) => frame.phase === "skeleton" && frame.targets > 0)), { intervals: [16] }).toBe(true);
    const arrivalAnchors = await anchors();
    await page.getByRole("button", { name: "Switch to " + otherTheme + " theme" }).click();
    await expect(loading).toHaveAttribute("data-admin-theme", otherTheme);
    const loadedThemePaint = await paint();
    for (let index = 0; index < loadedThemePaint.spans.length; index++) for (const key of ["x", "y", "width", "height"] as const) {
      expect(Math.abs(loadedThemePaint.spans[index][key] - restored.spans[index][key])).toBeLessThanOrEqual(1);
    }
    expect(loadedThemePaint.spans[0].background).toBe(changedExpected.mutedColor);
    await expect(root).toHaveAttribute("data-phase", "content");
    await expect(loading).toHaveCount(0);
    await page.getByRole("button", { name: "Switch to " + initialTheme + " theme" }).click();
    await expect(page.locator(".admin-theme").first()).toHaveAttribute("data-admin-theme", initialTheme);
    const paintFrames = await page.evaluate(() => (window as unknown as { shopOpaquePaintFrames: Array<{ phase: string; theme: string | null; sameNode: boolean; opacity: string; targets: number; browserBottom: number; canvasBottom: number; hostBottom: number; contentVisibility: string; skeletonOpacity: string; contentOpacity: string; spans: Array<{ x: number; y: number; width: number; height: number; paintedHeight: number; background: string }> }> }).shopOpaquePaintFrames);
    const opaqueFrames = paintFrames.filter((frame) => frame.phase === "skeleton");
    expect(opaqueFrames.some((frame) => frame.targets > 0)).toBe(true);
    for (const frame of opaqueFrames) {
      expect(frame.sameNode).toBe(true);
      expect(frame.opacity).toBe("1");
      expect(frame.contentVisibility).toBe("hidden");
      expect(frame.browserBottom).toBeGreaterThanOrEqual(frame.hostBottom - 1);
      expect(frame.canvasBottom).toBeGreaterThanOrEqual(frame.hostBottom - 1);
      const wantedColor = frame.theme === initialTheme ? expected.mutedColor : changedExpected.mutedColor;
      for (let index = 0; index < frame.spans.length; index++) {
        const span = frame.spans[index], original = restored.spans[index];
        for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(span[key] - original[key])).toBeLessThanOrEqual(1);
        expect(span.background).toBe(wantedColor);
        expect(Math.abs(span.paintedHeight - opaqueFrames[0].spans[index].paintedHeight)).toBeLessThanOrEqual(1);
      }
    }
    for (const frame of paintFrames.filter((frame) => frame.phase === "crossfade")) {
      expect(frame.browserBottom).toBeGreaterThanOrEqual(frame.hostBottom - 1);
      expect(frame.canvasBottom).toBeGreaterThanOrEqual(frame.hostBottom - 1);
      if (frame.spans.some((span, index) => span.paintedHeight < opaqueFrames[0].spans[index].paintedHeight - 1)) {
        expect(Number(frame.skeletonOpacity), "clipped outgoing skeleton is visibly fading").toBeLessThan(1);
      }
      expect(Math.abs(Number(frame.skeletonOpacity) + Number(frame.contentOpacity) - 1)).toBeLessThanOrEqual(.02);
    }
    await writeFile(resolve(evidence, `paint-stable-${info.project.name}-${info.project.use.colorScheme}.json`), JSON.stringify({ before, changed, restored, paintFrames }, null, 2));
    const settledAnchors = await anchors();
    const boundary = await root.evaluate((element) => ({
      adminScopes: element.querySelectorAll(".admin-theme,.admin-portal").length,
      muted: getComputedStyle(element).getPropertyValue("--muted"),
      foreground: getComputedStyle(element).getPropertyValue("--foreground"),
    }));
    expect(themedAnchors).toEqual(beforeAnchors);
    expect(arrivalAnchors).toEqual(beforeAnchors);
    expect(settledAnchors).toEqual(beforeAnchors);
    expect(boundary).toEqual({ adminScopes: 0, muted: "", foreground: "" });
    for (const [actual, wanted] of [[before, expected], [changed, changedExpected], [restored, expected]] as const) {
      expect(actual.height).toBe(610);
      expect(actual.background).toBe(wanted.background);
      expect(actual.muted).toBe(wanted.muted);
      expect(actual.foreground).toBe(wanted.foreground);
      expect(actual.spans.map((span) => span.height)).toEqual([32, 224, 96]);
      for (const span of actual.spans) {
        expect(span.background).toBe(wanted.mutedColor);
        expect(span.background).not.toBe("rgba(0, 0, 0, 0)");
        expect(span.gradient).toContain("linear-gradient");
        if (info.project.use.contextOptions?.reducedMotion === "reduce") expect(span.animation).toBe("none");
        else { expect(span.animation).not.toBe("none"); expect(span.duration).toBe("1.6s"); }
      }
    }
    expect(changed.spans[0].background).not.toBe(before.spans[0].background);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
    await installLocalAnalytics(page);
  }
});
