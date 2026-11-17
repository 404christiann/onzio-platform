import { expect, test, type Page } from "@playwright/test";
import { aboutPageEditableContent } from "../../lib/about-editor/save";
import { Client } from "pg";
import sharp from "sharp";
import { createHash, randomUUID } from "node:crypto";
import { presentationDocumentForTemplate } from "../helpers/presentation-fixture";
import { parsePresentationDocument } from "../../packages/presentation";
import { EMPTY_ABOUT_PAGE_CONTENT, EMPTY_CLUB_LOGO_PAGE_CONTENT } from "../../lib/about-content";
import type { AboutEditorSaveRequest } from "../../lib/about-editor/contract";

const releases = new Set<() => void>();
test.afterEach(() => { for (const release of releases) release(); releases.clear(); });
test.afterEach(async ({ page }, info) => {
  if (info.title.startsWith("loading reserves")) {
    const phases = await page.evaluate(() => (window as unknown as { cl14LoadingPhases?: unknown[] }).cl14LoadingPhases ?? []);
    await info.attach("loading-final-phase-samples", { body: JSON.stringify(phases), contentType: "application/json" });
  }
});

const content = () => ({ ...EMPTY_ABOUT_PAGE_CONTENT, hero_title: "Our club", story_paragraphs: ["A club for our community."], values_heading: "Our values", values: [{ title: "Together", description: "Everyone belongs." }, { title: "Progress", description: "Keep learning." }], closing_text: "Join us on the field.", closing_cta_label: "See the schedule", closing_cta_href: "/schedule" });

async function fixture(page: Page, options: { delay?: number; empty?: boolean; values?: number } = {}) {
  await page.route("**/admin/about", route => route.continue({ headers: { ...route.request().headers(), "cache-control": "no-cache" } }));
  let saved = content();
  let savedLogo = { ...EMPTY_CLUB_LOGO_PAGE_CONTENT, features: [{ title: "Original crest", description: "Our crest", patch_url: "", icon_url: "", icon_size: 60, icon_scale: 1 }] };
  if (options.empty) saved = { ...saved, hero_title: "", story_paragraphs: [], values: [] };
  if (options.values) saved.values = Array.from({ length: options.values }, (_, i) => ({ title: `Value ${i + 1}`, description: "Club value" }));
  const submissions: AboutEditorSaveRequest[] = [];
  await page.route("**/api/admin/about-editor**", async route => {
    if (route.request().method() === "GET") {
      if (options.delay) await new Promise(resolve => setTimeout(resolve, options.delay));
      const target = new URL(route.request().url()).searchParams.get("page") === "logo" ? "logo" : "about";
      return route.fulfill({ json: { page: target, revision: "1", designRevision: "test-design", content: target === "logo" ? savedLogo : saved } });
    }
    const request = route.request().postDataJSON() as AboutEditorSaveRequest;
    submissions.push(request);
    if (request.page === "about") saved = { ...saved, ...request.content };
    else savedLogo = { ...savedLogo, ...request.content } as typeof savedLogo;
    return route.fulfill({ json: { page: request.page, revision: String(submissions.length + 1), designRevision: "test-design", content: request.content } });
  });
  return { submissions, read: () => saved };
}

async function open(page: Page, section: string) {
  await expect(page.locator('[data-slot="admin-dialog"][inert]:visible')).toHaveCount(0);
  const target = page.frameLocator(".aep-frame").getByRole("button", { name: section, exact: true });
  await target.click();
  const dialog = page.locator('[data-slot="admin-dialog"]').filter({ visible: true });
  await expect(dialog).toBeVisible();
  return { target, dialog };
}
async function done(page: Page) { await page.getByRole("button", { name: "Done", exact: true }).click(); await expect(page.getByRole("dialog")).toHaveCount(0); await expect(page.locator('[data-slot="admin-dialog-backdrop"]:visible')).toHaveCount(0); }
async function save(page: Page) { await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "dirty"); await page.locator("[data-admin-save-button]").click(); }

test("classic About edits the public canvas live and Done keeps the draft", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const { submissions } = await fixture(page);
  await page.goto("/admin/about");
  const { target, dialog } = await open(page, "Edit Page heading");
  await page.getByRole("textbox", { name: "Page heading", exact: true }).fill("A new chapter");
  await expect(page.frameLocator(".aep-frame").getByRole("heading", { name: "A new chapter", exact: true })).toHaveText("A new chapter");
  await dialog.evaluate(element => {
    const events: unknown[] = [];
    Object.assign(window, { cl14FocusTransfers: events });
    document.addEventListener("focusin", event => {
      const target = event.target;
      if (target instanceof HTMLElement && !element.contains(target)) events.push({ tag: target.tagName, guard: target.hasAttribute("data-base-ui-focus-guard"), label: target.getAttribute("aria-label") });
    });
  });
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement)), { timeout: 250, intervals: [10, 20, 50] }).toBe(true);
  }
  await info.attach("native-focus-transfers", { body: JSON.stringify(await page.evaluate(() => (window as unknown as { cl14FocusTransfers: unknown[] }).cl14FocusTransfers)), contentType: "application/json" });
  await done(page);
  await expect(target).toBeFocused();
  expect(submissions).toEqual([]);
  await save(page);
  await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saved");
  expect(submissions).toHaveLength(1);
  expect(submissions[0]).toMatchObject({ page: "about", content: aboutPageEditableContent({ page: "about", content: { ...content(), hero_title: "A new chapter" } }), retiredMediaUrls: [] });
  await page.getByRole("button", { name: "Phone", exact: true }).click();
  await expect.poll(() => page.frameLocator(".aep-frame").locator("body").evaluate(() => innerWidth)).toBe(390);
  await page.getByRole("button", { name: "Desktop", exact: true }).click();
  await expect.poll(() => page.frameLocator(".aep-frame").locator("body").evaluate(() => innerWidth)).toBe(1440);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `.codex-work/admin-cl-14/self-${info.project.name}-canvas.png`, fullPage: true });
  await open(page, "Edit Club story");
  await page.screenshot({ path: `.codex-work/admin-cl-14/self-${info.project.name}-story.png`, fullPage: true });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("heading and values validation mark their regions and Undo preserves later edits", async ({ page }) => {
  await fixture(page, { empty: true }); await page.goto("/admin/about");
  const preview = page.frameLocator(".aep-frame");
  await expect(preview.getByText("Your story goes here.")).toBeVisible();
  await expect(preview.getByText("Add a feature image")).toBeVisible();
  await expect(preview.getByText("Add values to show this section.")).toBeVisible();
  await open(page, "Edit Club story"); await page.getByRole("textbox", { name: "Story Paragraphs", exact: true }).fill("A first paragraph."); await done(page); await save(page);
  await expect(page.locator(".aep-error-bar")).toHaveText("Add a page heading before saving.");
  await expect(preview.getByRole("button", { name: "Edit Page heading", exact: true })).toHaveAttribute("data-invalid", "true");
  await open(page, "Edit Page heading"); await page.getByRole("textbox", { name: "Page heading", exact: true }).fill("Our club"); await done(page);
  await open(page, "Edit Club values"); await page.getByRole("button", { name: "Add value", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Value 1 Title", exact: true })).toBeFocused(); await done(page); await save(page);
  await expect(page.locator(".aep-error-bar")).toHaveText("Give every value a title, or remove the empty ones, before saving.");
  await open(page, "Edit Club values"); await page.getByRole("textbox", { name: "Value 1 Title", exact: true }).fill("Together");
  await page.getByRole("button", { name: "Add value", exact: true }).click(); await page.getByRole("textbox", { name: "Value 2 Title", exact: true }).fill("Progress");
  await page.getByRole("button", { name: "Move value 2 earlier", exact: true }).click(); await expect(page.getByRole("textbox", { name: "Value 1 Title", exact: true })).toHaveValue("Progress");
  await page.getByRole("button", { name: "Remove value 1", exact: true }).click(); await page.getByRole("textbox", { name: "Value 1 Description", exact: true }).fill("A newer edit");
  await page.getByRole("button", { name: "Undo: Removed Progress", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Value 1 Title", exact: true })).toHaveValue("Progress"); await expect(page.getByRole("textbox", { name: "Value 2 Description", exact: true })).toHaveValue("A newer edit");
  await expect(page.getByRole("button", { name: "Undo: Removed Progress", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Remove value 1", exact: true }).click();
  await page.getByRole("button", { name: "Undo: Removed Progress", exact: true }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Value 1 Title", exact: true })).toHaveValue("Progress");
  await expect(page.getByRole("button", { name: "Undo: Removed Progress", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Remove value 1", exact: true }).click(); await done(page);
  await page.getByRole("button", { name: "Undo: Removed Progress", exact: true }).click();
  await open(page, "Edit Club values"); await expect(page.getByRole("textbox", { name: "Value 1 Title", exact: true })).toHaveValue("Progress");
  await expect(page.getByRole("textbox", { name: "Value 2 Description", exact: true })).toHaveValue("A newer edit");
});

test("values cap remains 24 and rejects SVG using real 15 MB photo rules", async ({ page }) => {
  await fixture(page, { values: 24 }); await page.goto("/admin/about");
  await open(page, "Edit Club values"); await expect(page.getByText("Values · 24 of 24", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Add value", exact: true })).toBeDisabled(); await done(page);
  await open(page, "Edit Club story"); await expect(page.getByText("JPG, PNG, WebP up to 15 MB", { exact: true })).toBeVisible();
  await page.locator('[data-admin-image-field] input[type=file]').setInputFiles({ name: "unsafe.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  await expect(page.locator('[data-admin-image-error]')).toContainText("not a supported image");
});

test("an older save preserves newer text and leaves it dirty", async ({ page }) => {
  await fixture(page); let release: () => void = () => {}; const hold = new Promise<void>(resolve => { release = resolve; releases.add(resolve); });
  let submitted: AboutEditorSaveRequest | null = null;
  await page.route("**/api/admin/about-editor", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    submitted = route.request().postDataJSON(); await hold;
    return route.fulfill({ json: { page: "about", revision: "2", designRevision: "test-design", content: submitted!.content } });
  });
  await page.goto("/admin/about"); await open(page, "Edit Club story"); await page.getByRole("textbox", { name: "Story Paragraphs", exact: true }).fill("First saved text"); await done(page); await save(page);
  await expect.poll(() => submitted !== null).toBe(true);
  await open(page, "Edit Club story"); await page.getByRole("textbox", { name: "Story Paragraphs", exact: true }).fill("A newer draft"); await done(page); release();
  await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "dirty");
  await expect(page.frameLocator(".aep-frame").getByText("A newer draft", { exact: true })).toBeVisible();
  await open(page, "Edit Club story"); await expect(page.getByRole("textbox", { name: "Story Paragraphs", exact: true })).toHaveValue("A newer draft");
});

test("guard stays on About with a controlled newer draft during its Save", async ({ page }, info) => {
  await fixture(page); let release: () => void = () => {}; const hold = new Promise<void>(resolve => { release = resolve; releases.add(resolve); }); let received = false;
  await page.route("**/api/admin/about-editor", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    const request = route.request().postDataJSON(); received = true; await hold;
    return route.fulfill({ json: { page: "about", revision: "2", designRevision: "test-design", content: request.content } });
  });
  await page.goto("/admin/about"); await open(page, "Edit Club story"); await page.getByRole("textbox", { name: "Story Paragraphs", exact: true }).fill("Before navigation");
  await page.evaluate(() => { const link = document.createElement("a"); link.href = "/admin/sponsors"; link.textContent = "Sponsors"; document.body.append(link); link.click(); });
  await page.getByRole("button", { name: "Save and leave", exact: true }).click(); await expect.poll(() => received).toBe(true);
  const retained = page.getByRole("textbox", { name: "Story Paragraphs", exact: true, includeHidden: true });
  expect(await page.getByRole("textbox", { name: "Story Paragraphs", exact: true }).count()).toBe(0);
  await expect(retained).toHaveCount(1);
  const concurrentEditControl = await retained.evaluate(element => {
    const field = element as HTMLTextAreaElement;
    const hidden = Boolean(field.closest('[aria-hidden="true"],[inert]'));
    const before = field.value;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "Arrived during the save");
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return { controlledConcurrentEditInjection: true, nativeValueSetterAndBubblingReactEvents: true, hidden, before, after: field.value, backgroundRemainsInert: Boolean(field.closest('[inert]')) };
  });
  expect(concurrentEditControl.hidden).toBe(true);
  expect(concurrentEditControl.after).toBe("Arrived during the save");
  await info.attach("controlled-concurrent-edit", { body: JSON.stringify(concurrentEditControl), contentType: "application/json" });
  release();
  await expect(page.getByRole("alert").filter({ hasText: "Your changes could not be saved" })).toBeVisible(); await expect(page).toHaveURL(/\/admin\/about$/);
  await page.getByRole("button", { name: "Keep editing", exact: true }).click(); await expect(page.getByRole("dialog", { name: "Unsaved changes", exact: true })).toHaveCount(0); await open(page, "Edit Club story"); await expect(page.getByRole("textbox", { name: "Story Paragraphs", exact: true })).toHaveValue("Arrived during the save");
});

test("pending image validation is guarded before it changes the draft", async ({ page }) => {
  await page.addInitScript(() => {
    const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src")!;
    Object.defineProperty(HTMLImageElement.prototype, "src", { configurable: true, get: source.get, set(value: string) {
      if (value.startsWith("blob:")) setTimeout(() => source.set!.call(this, value), 900);
      else source.set!.call(this, value);
    } });
  });
  const { submissions } = await fixture(page); await page.goto("/admin/about"); await open(page, "Edit Club story");
  await page.locator('[data-admin-image-field] input[type=file]').setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not a readable image") });
  await expect(page.locator('[data-admin-image-pending]')).toBeVisible();
  await page.evaluate(() => { const link = document.createElement("a"); link.href = "/admin/sponsors"; link.textContent = "Sponsors"; document.body.append(link); link.click(); });
  await page.getByRole("button", { name: "Save and leave", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Your changes could not be saved" })).toBeVisible(); await expect(page).toHaveURL(/\/admin\/about$/);
  expect(submissions).toEqual([]); await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page.locator('[data-admin-image-error]')).toContainText("not a readable image");
});

test("new media arriving during an older save remains in the next exact payload", async ({ page }) => {
  const { submissions } = await fixture(page); let release: () => void = () => {}; const hold = new Promise<void>(resolve => { release = resolve; releases.add(resolve); }); let first = true, received = false;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/EkAAAAASUVORK5CYII=", "base64");
  const assetId = "77777777-7777-4777-8777-777777777777", storagePath = `11111111-1111-4111-8111-111111111111/about/${assetId}.png`, publicUrl = `http://127.0.0.1:54321/storage/v1/object/public/onzio-media/${storagePath}`;
  await page.route("**/api/admin/media/authorize", route => route.fulfill({ json: { path: storagePath, token: "isolated-test", authorization: "isolated-test" } }));
  await page.route("**/storage/v1/object/upload/sign/**", route => route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST,PUT,OPTIONS", "access-control-allow-headers": "authorization,apikey,content-type,x-client-info,x-upsert" }, json: { Key: `onzio-upload-staging/${storagePath}` } }));
  await page.route("**/api/admin/media/finalize", route => route.fulfill({ json: { data: { assetId, storagePath, publicUrl } } }));
  await page.route("**/storage/v1/object/public/onzio-media/**", route => route.fulfill({ contentType: "image/png", body: png }));
  await page.route("**/api/admin/about-editor", async route => {
    if (route.request().method() !== "POST" || !first) return route.fallback(); first = false;
    const request = route.request().postDataJSON(); received = true; await hold;
    return route.fulfill({ json: { page: "about", revision: "2", designRevision: "test-design", content: request.content } });
  });
  await page.goto("/admin/about"); await open(page, "Edit Club story"); await page.getByRole("textbox", { name: "Story Paragraphs", exact: true }).fill("First save"); await done(page); await save(page); await expect.poll(() => received).toBe(true);
  await open(page, "Edit Club story"); await page.locator('[data-admin-image-field] input[type=file]').setInputFiles({ name: "new.png", mimeType: "image/png", buffer: png });
  await expect(page.locator('[data-admin-image-preview] img')).toHaveAttribute("src", publicUrl); await expect(page.locator('[data-admin-image-pending]')).toHaveCount(0); release();
  await expect(page.getByRole("textbox", { name: "Story Paragraphs", exact: true })).toHaveValue("First save"); await done(page); await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "dirty"); await save(page);
  await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saved"); expect(submissions.at(-1)).toMatchObject({ content: { feature_image_url: publicUrl, story_paragraphs: ["First save"] }, expectedRevision: "2" });
});

test("uncertain saves retry the identical UUID and payload, then conflicts use shared confirmation", async ({ page }) => {
  await fixture(page); const submitted: AboutEditorSaveRequest[] = []; let conflict = false;
  await page.route("**/api/admin/about-editor**", async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() === "GET" && url.searchParams.has("operationId")) return route.abort();
    if (request.method() !== "POST") return route.fallback();
    const input = request.postDataJSON(); submitted.push(input);
    if (conflict) return route.fulfill({ status: 409, json: { error: { code: "ABOUT_CHANGED", message: "Another editor saved this page" } } });
    if (submitted.length === 1) return route.abort();
    return route.fulfill({ json: { page: "about", revision: "2", designRevision: "test-design", content: input.content } });
  });
  await page.goto("/admin/about"); await open(page, "Edit Club story"); await page.getByRole("textbox", { name: "Story Paragraphs", exact: true }).fill("Retry this exact draft"); await done(page); await save(page);
  await expect(page.getByRole("button", { name: "Retry exact save", exact: true })).toBeVisible();
  await open(page, "Edit Club story"); await expect(page.getByRole("textbox", { name: "Story Paragraphs", exact: true })).toBeDisabled(); await done(page);
  await page.getByRole("button", { name: "Retry exact save", exact: true }).click(); await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saved");
  expect(submitted).toHaveLength(2); expect(submitted[1]).toEqual(submitted[0]);
  conflict = true; await open(page, "Edit Club story"); await page.getByRole("textbox", { name: "Story Paragraphs", exact: true }).fill("Conflicting local text"); await done(page); await save(page);
  await page.getByRole("button", { name: "Reload latest page", exact: true }).click(); await expect(page.getByRole("dialog", { name: "Another editor saved this page", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click(); await expect(page).toHaveURL(/\/admin\/about$/);
});

test("loading reserves the same visible canvas anchors at phone, tablet and desktop widths", async ({ page }, info) => {
  await page.addInitScript(() => {
    const samples: unknown[] = [], phases: unknown[] = [];
    Object.assign(window, { cl14LayoutShifts: samples, cl14LoadingPhases: phases });
    new PerformanceObserver(list => { for (const entry of list.getEntries()) samples.push(entry.toJSON()); }).observe({ type: "layout-shift", buffered: true });
    function sample() {
      const browser = document.querySelector<HTMLElement>(".aep-browser");
      const frame = browser?.querySelector<HTMLIFrameElement>(".aep-frame");
      const viewport = browser?.querySelector(".aep-frame-viewport");
      if (browser && frame && viewport) {
        const hostStyle = getComputedStyle(browser), frameStyle = getComputedStyle(frame), bounds = viewport.getBoundingClientRect();
        phases.push({ at: performance.now(), mainTimeOrigin: performance.timeOrigin, iframeTimeOrigin: frame.contentWindow?.performance.timeOrigin, phase: browser.dataset.phase, ready: browser.dataset.contentReady === "true", hostVisibility: hostStyle.visibility, hostOpacity: Number(hostStyle.opacity), iframeVisibility: frameStyle.visibility, iframeOpacity: Number(frameStyle.opacity), viewport: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } });
      }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  for (const width of [1280, 820, 390]) {
    await page.setViewportSize({ width, height: 900 }); await fixture(page, { delay: 250 }); await page.goto("/admin/about");
    await expect.poll(() => page.locator('.aep-browser[data-phase="skeleton"]').count(), { timeout: 5000, intervals: [16] }).toBe(1);
    await expect(page.locator('.aep-browser[data-phase="skeleton"]')).toBeVisible();
    const read = () => page.evaluate(() => Object.fromEntries([".aep-canvas", ".aep-canvas-top", ".aep-frame-viewport"].map(selector => { const r = document.querySelector(selector)!.getBoundingClientRect(); return [selector, { top: r.top, left: r.left, width: r.width, height: r.height }]; })));
    const initial = await read();
    await expect.poll(() => page.locator('.aep-browser[data-content-ready="true"][data-phase="skeleton"]').count(), { timeout: 5000, intervals: [16] }).toBe(1);
    await expect(page.locator('.aep-browser[data-content-ready="true"][data-phase="skeleton"]')).toBeVisible();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const before = await read();
    await expect(page.locator('.aep-browser[data-phase="content"]')).toBeVisible();
    const after = await read();
    for (const selector of Object.keys(initial)) for (const property of ["top", "left", "width"] as const) expect(Math.abs(after[selector][property] - initial[selector][property])).toBeLessThanOrEqual(1);
    for (const selector of Object.keys(before)) for (const property of ["top", "left", "width", "height"] as const) expect(Math.abs(after[selector][property] - before[selector][property])).toBeLessThanOrEqual(1);
    await info.attach(`loading-${width}`, { body: JSON.stringify({ initial, before, after, unknownInitialExtent: { before: initial[".aep-frame-viewport"].height, after: after[".aep-frame-viewport"].height }, layoutShifts: await page.evaluate(() => (window as unknown as { cl14LayoutShifts: unknown[] }).cl14LayoutShifts), phases: await page.evaluate(() => (window as unknown as { cl14LoadingPhases: unknown[] }).cl14LoadingPhases), initialExtentKnown: false }), contentType: "application/json" });
    await page.unrouteAll({ behavior: "wait" });
  }
});


async function publishClubhouse() {
  const db = new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
  const club = "11111111-1111-4111-8111-111111111111";
  await db.connect();
  const original = (await db.query("select to_jsonb(s) as state,d.configuration from onzio.presentation_state s join onzio.presentation_documents d on d.id=s.published_document_id where s.club_id=$1", [club])).rows[0];
  if (!original) { await db.end(); throw new Error("Synthetic Alpha presentation is required."); }
  const configuration = parsePresentationDocument(presentationDocumentForTemplate(original.configuration, "clubhouse"), { surface: "production" });
  const id = randomUUID();
  try {
    const version = Number((await db.query("select coalesce(max(version),0)+1 as version from onzio.presentation_documents where club_id=$1", [club])).rows[0].version);
    await db.query("insert into onzio.presentation_documents(id,club_id,version,schema_version,template_id,template_version,configuration,configuration_digest,created_by) values($1,$2,$3,1,'clubhouse',1,$4::jsonb,$5,$6)",
      [id, club, version, JSON.stringify(configuration), createHash("sha256").update(JSON.stringify(configuration)).digest("hex"), original.state.updated_by]);
    await db.query("update onzio.presentation_state set published_document_id=$1 where club_id=$2", [id, club]);
  } finally { await db.end(); }
  return async () => {
    const restore = new Client({ host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" });
    await restore.connect();
    try {
      await restore.query("begin");
      await restore.query("set local session_replication_role=replica");
      const names = Object.keys(original.state).sort().map(key => '"' + key + '"').join(",");
      await restore.query("update onzio.presentation_state set (" + names + ")=(select " + names + " from jsonb_populate_record(null::onzio.presentation_state,$1::jsonb)) where club_id=$2", [JSON.stringify(original.state), club]);
      await restore.query("delete from onzio.presentation_documents where id=$1 and club_id=$2", [id, club]);
      await restore.query("commit");
      expect((await restore.query("show session_replication_role")).rows[0].session_replication_role).toBe("origin");
      expect((await restore.query("select to_jsonb(s) as state from onzio.presentation_state s where club_id=$1", [club])).rows[0].state).toEqual(original.state);
    } catch (error) { await restore.query("rollback"); throw error; }
    finally { await restore.end(); }
  };
}

test("an exact retry confirms the original request and preserves newer text and media", async ({ page }) => {
  await fixture(page);
  let release: () => void = () => {};
  const hold = new Promise<void>(resolve => { release = resolve; releases.add(resolve); });
  const submitted: AboutEditorSaveRequest[] = [];
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/EkAAAAASUVORK5CYII=", "base64");
  const asset = "77777777-7777-4777-8777-777777777777", path = "11111111-1111-4111-8111-111111111111/about/" + asset + ".png";
  const publicUrl = "http://127.0.0.1:54321/storage/v1/object/public/onzio-media/" + path;
  await page.route("**/api/admin/media/authorize", route => route.fulfill({ json: { path, token: "isolated-test", authorization: "isolated-test" } }));
  await page.route("**/storage/v1/object/upload/sign/**", route => route.fulfill({ headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST,PUT,OPTIONS", "access-control-allow-headers": "authorization,apikey,content-type,x-client-info,x-upsert" }, json: { Key: "onzio-upload-staging/" + path } }));
  await page.route("**/api/admin/media/finalize", route => route.fulfill({ json: { data: { assetId: asset, storagePath: path, publicUrl } } }));
  await page.route("**/storage/v1/object/public/onzio-media/**", route => route.fulfill({ contentType: "image/png", body: png }));
  await page.route("**/api/admin/about-editor**", async route => {
    if (route.request().method() === "GET" && new URL(route.request().url()).searchParams.has("operationId")) return route.abort();
    if (route.request().method() !== "POST") return route.fallback();
    const input = route.request().postDataJSON(); submitted.push(input);
    if (submitted.length === 1) { await hold; return route.abort(); }
    return route.fulfill({ json: { page: "about", revision: String(submitted.length), designRevision: "test-design", content: input.content } });
  });
  await page.goto("/admin/about");
  await open(page, "Edit Club story"); await page.getByRole("textbox", { name: "Story Paragraphs", exact: true }).fill("Original request"); await done(page); await save(page);
  await expect.poll(() => submitted.length).toBe(1);
  await open(page, "Edit Club story"); await page.getByRole("textbox", { name: "Story Paragraphs", exact: true }).fill("Newer text");
  await page.locator('[data-admin-image-field] input[type=file]').setInputFiles({ name: "newer.png", mimeType: "image/png", buffer: png });
  await expect(page.locator("[data-admin-image-preview] img")).toHaveAttribute("src", publicUrl);
  await expect(page.locator("[data-admin-image-pending]")).toHaveCount(0); await done(page); release();
  await expect(page.getByRole("button", { name: "Retry exact save", exact: true })).toBeVisible();
  await page.evaluate(() => { const link = document.createElement("a"); link.href = "/admin/sponsors"; link.textContent = "Sponsors"; document.body.append(link); link.click(); });
  await page.getByRole("button", { name: "Save and leave", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Your changes could not be saved" })).toBeVisible();
  expect(submitted[1]).toEqual(submitted[0]); await expect.poll(() => new URL(page.url()).pathname).toBe("/admin/about");
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await open(page, "Edit Club story");
  await expect(page.getByRole("textbox", { name: "Story Paragraphs", exact: true })).toHaveValue("Newer text");
  await expect(page.locator("[data-admin-image-preview] img")).toHaveAttribute("src", publicUrl);
  await done(page); await save(page);
  await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saved");
  expect(submitted[2]).toMatchObject({ expectedRevision: "2", content: { story_paragraphs: ["Newer text"], feature_image_url: publicUrl } });
});

test("the same open navigation guard retries after destinations finish loading", async ({ page }) => {
  const restore = await publishClubhouse();
  let release: () => void = () => {};
  const hold = new Promise<void>(resolve => { release = resolve; releases.add(resolve); });
  let resolved = false;
  try {
    const { submissions } = await fixture(page);
    await page.route("**/api/admin/about-destinations", async route => { await hold; await route.fulfill({ json: { options: [{ href: "/schedule", label: "Schedule" }] } }); resolved = true; });
    await page.goto("/admin/about");
    await open(page, "Edit Club story"); await page.getByRole("textbox", { name: "Story Paragraphs", exact: true }).fill("Save after destinations"); await done(page);
    await page.evaluate(() => { const link = document.createElement("a"); link.href = "/admin/sponsors"; link.textContent = "Sponsors"; document.body.append(link); link.click(); });
    await page.getByRole("button", { name: "Save and leave", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Your changes could not be saved" })).toBeVisible(); expect(submissions).toHaveLength(0);
    release(); await expect.poll(() => resolved).toBe(true);
    await page.getByRole("button", { name: "Save and leave", exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/admin/sponsors");
    expect(submissions).toHaveLength(1); expect(submissions[0].content).toMatchObject({ story_paragraphs: ["Save after destinations"] });
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); await restore(); }
});

test("an exact Logo retry preserves its newer feature draft", async ({ page }) => {
  const restore = await publishClubhouse();
  let release: () => void = () => {};
  const hold = new Promise<void>(resolve => { release = resolve; releases.add(resolve); });
  const submissions: AboutEditorSaveRequest[] = [];
  try {
    await fixture(page);
    await page.route("**/api/admin/about-editor**", async route => {
      if (route.request().method() === "GET" && new URL(route.request().url()).searchParams.has("operationId")) return route.abort();
      if (route.request().method() !== "POST") return route.fallback();
      const input = route.request().postDataJSON(); submissions.push(input);
      if (submissions.length === 1) { await hold; return route.abort(); }
      return route.fulfill({ json: { page: input.page, revision: String(submissions.length), designRevision: "test-design", content: input.content } });
    });
    await page.goto("/admin/about"); await page.getByRole("button", { name: /Club Logo page/ }).click();
    await page.frameLocator(".aep-frame").getByRole("button", { name: "Edit Crest feature", exact: true }).first().click(); await page.getByRole("textbox", { name: "Feature 1 Title", exact: true }).fill("Original request"); await done(page); await save(page);
    await expect.poll(() => submissions.length).toBe(1);
    await page.frameLocator(".aep-frame").getByRole("button", { name: "Edit Crest feature", exact: true }).first().click(); await page.getByRole("textbox", { name: "Feature 1 Title", exact: true }).fill("Newer crest"); await done(page); release();
    await expect(page.locator(".aep-error-bar").getByRole("button", { name: "Retry exact save", exact: true })).toBeVisible();
    await page.locator(".aep-error-bar").getByRole("button", { name: "Retry exact save", exact: true }).click();
    await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "dirty");
    expect(submissions[1]).toEqual(submissions[0]);
    await page.frameLocator(".aep-frame").getByRole("button", { name: "Edit Crest feature", exact: true }).first().click(); await expect(page.getByRole("textbox", { name: "Feature 1 Title", exact: true })).toHaveValue("Newer crest");
    await page.locator(".aep-inspector-save").getByRole("button", { name: "Save Club Logo", exact: true }).click();
    await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saved");
    expect(submissions[2]).toMatchObject({ page: "logo", expectedRevision: "2", content: { features: [{ title: "Newer crest" }] } });
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); await restore(); }
});

test("Undo remains reachable during Done exit and works by pointer and keyboard on the page", async ({ page }, info) => {
  await fixture(page); await page.goto("/admin/about"); await open(page, "Edit Club values");
  await page.getByRole("button", { name: "Remove value 1", exact: true }).click();
  const undo = page.getByRole("button", { name: "Undo: Removed Together", exact: true });
  await expect(undo).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const interval = await undo.evaluate(element => ({
    inert: Boolean(element.closest("[inert]")),
    dialog: Boolean(element.closest('[data-slot="admin-dialog"]')),
    closing: Boolean(document.querySelector('[data-slot="admin-dialog"][inert]')),
    label: element.getAttribute("aria-label"),
  }));
  await info.attach("done-exit-undo", { body: JSON.stringify(interval), contentType: "application/json" });
  expect(interval.inert).toBe(false); expect(interval.closing).toBe(true);
  const point = await undo.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const x = bounds.left + bounds.width / 2, y = bounds.top + bounds.height / 2;
    return { x, y, hit: element.contains(document.elementFromPoint(x, y)) };
  });
  expect(point.hit).toBe(true);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('[data-slot="admin-dialog-backdrop"]:visible')).toHaveCount(0);
  await open(page, "Edit Club values"); await expect(page.getByRole("textbox", { name: "Value 1 Title", exact: true })).toHaveValue("Together");
  await page.getByRole("button", { name: "Remove value 1", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await undo.focus();
  expect(await undo.evaluate(element => ({ inert: Boolean(element.closest("[inert]")), closing: Boolean(document.querySelector('[data-slot="admin-dialog"][inert]')) }))).toEqual({ inert: false, closing: true });
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-slot="admin-dialog-backdrop"]:visible')).toHaveCount(0);
  await open(page, "Edit Club values"); await expect(page.getByRole("textbox", { name: "Value 1 Title", exact: true })).toHaveValue("Together");
  await page.screenshot({ path: ".codex-work/admin-cl-14/fix-r2/" + info.project.name + "-undo.png", fullPage: true });
  await expect(undo).toHaveCount(0);
  await page.evaluate(() => {
    const timing = { firstSeenAt: 0, exitAt: 0, removedAt: 0 };
    Object.assign(window, { cl14UndoTiming: timing });
    new MutationObserver(() => {
      const button = document.querySelector('button[aria-label="Undo: Removed Together"]');
      if (button) {
        timing.firstSeenAt ||= performance.now(); timing.removedAt = 0;
        if (button.closest('[data-phase="exit"]')) timing.exitAt ||= performance.now();
      } else if (timing.firstSeenAt) timing.removedAt = performance.now();
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-phase"] });
  });
  await page.getByRole("button", { name: "Remove value 1", exact: true }).click();
  await page.waitForTimeout(2000); await done(page);
  await expect.poll(() => undo.count(), { timeout: 4000, intervals: [50] }).toBe(0);
  const timing = await page.evaluate(() => (window as unknown as { cl14UndoTiming: { firstSeenAt: number; exitAt: number; removedAt: number } }).cl14UndoTiming);
  expect(timing.exitAt - timing.firstSeenAt).toBeGreaterThanOrEqual(4800);
  expect(timing.exitAt - timing.firstSeenAt).toBeLessThan(5500);
  expect(timing.removedAt - timing.firstSeenAt).toBeLessThan(5800);
  await info.attach("original-undo-deadline", { body: JSON.stringify(timing), contentType: "application/json" });
});

test("Clubhouse heading stays editable through empty content and repeated live edits", async ({ page }, info) => {
  const restore = await publishClubhouse();
  try {
    await fixture(page, { empty: true }); await page.goto("/admin/about");
    const preview = page.frameLocator(".aep-frame");
    await expect(preview.locator(".clubhouse-about-page")).toBeVisible();
    for (const heading of ["Our community", "", "A new chapter"]) {
      const target = preview.getByRole("button", { name: "Edit Page heading", exact: true });
      await target.focus(); await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog", { name: "Page heading", exact: true })).toBeVisible();
      await page.getByRole("textbox", { name: "Page heading", exact: true }).fill(heading);
      if (heading) await expect(preview.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      await done(page); await expect(target).toBeFocused(); await expect(target).toBeVisible();
    }
    await page.screenshot({ path: ".codex-work/admin-cl-14/fix-r2/" + info.project.name + "-clubhouse-heading.png", fullPage: true });
  } finally { await page.unrouteAll({ behavior: "wait" }); await restore(); }
});

test("About header fills phones without state shifts and reduced reveal keeps its short opacity fade", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const frames: Array<{ opacity: number; animation: string; duration: string; transform: string }> = [];
    Object.assign(window, { cl14ReducedReveal: frames });
    function sample() {
      const frame = document.querySelector(".aep-browser[data-phase=crossfade] .aep-frame");
      if (frame) {
        const style = getComputedStyle(frame);
        frames.push({ opacity: Number(style.opacity), animation: style.animationName, duration: style.animationDuration, transform: style.transform });
      }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page, { delay: 400 });
    await page.goto("/admin/about");
    await expect(page.locator(".aep-browser")).toHaveAttribute("data-phase", "content");
    const button = page.locator("[data-admin-save-button]");
    const geometry = () => button.evaluate(element => {
      const box = (node: Element) => {
        const bounds = node.getBoundingClientRect();
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
      };
      const status = document.querySelector("[data-admin-save-status]")!;
      return { button: box(element), status: box(status), actions: box(status.parentElement!) };
    });
    const clean = await geometry();
    await open(page, "Edit Page heading");
    await page.getByRole("textbox", { name: "Page heading", exact: true }).fill("A new header");
    await done(page);
    expect(await geometry()).toEqual(clean);
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("data-state", "saving");
    expect(await geometry()).toEqual(clean);
    await expect(button).toHaveAttribute("data-state", "saved");
    expect(await geometry()).toEqual(clean);
    expect(clean.button.width).toBeGreaterThanOrEqual(150);
    if (width < 640) {
      expect(clean.button.width).toBeCloseTo(clean.actions.width, 0);
      expect(clean.button.height).toBeGreaterThanOrEqual(44);
      expect(clean.status.x + clean.status.width / 2).toBeCloseTo(clean.button.x + clean.button.width / 2, 0);
    }
    const frames = await page.evaluate(() => (window as unknown as { cl14ReducedReveal: Array<{ opacity: number; animation: string; duration: string; transform: string }> }).cl14ReducedReveal);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every(frame => frame.animation === "aep-reveal" && frame.duration === "0.12s")).toBe(true);
    expect(frames.some(frame => frame.opacity > 0 && frame.opacity < 1)).toBe(true);
    expect(new Set(frames.map(frame => frame.transform)).size).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await info.attach(`header-reduced-${width}`, { body: JSON.stringify({ clean, frames }), contentType: "application/json" });
    await page.unrouteAll({ behavior: "wait" });
  }
});


test("classic skeleton paints its muted host and reveals the iframe without moving visible anchors", async ({ page }, info) => {
  const theme = info.project.use.colorScheme === "dark" ? "dark" : "light";
  await page.context().addCookies([{ name: "onzio-admin-theme", value: theme, domain: "alpha.localhost", path: "/admin" }]);
  await page.addInitScript(() => {
    const frames: Array<{ phase: string; visibility: string; opacity: number; duration: string; transform: string }> = [];
    Object.assign(window, { cl14PaintReveal: frames });
    function sample() {
      const browser = document.querySelector<HTMLElement>(".aep-browser");
      const frame = browser?.querySelector("iframe");
      if (browser?.dataset.phase === "crossfade" && frame) {
        const style = getComputedStyle(frame);
        frames.push({ phase: browser.dataset.phase, visibility: style.visibility, opacity: Number(style.opacity), duration: style.animationDuration, transform: style.transform });
      }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  await fixture(page);
  let release: () => void = () => {};
  const held = new Promise<void>(resolve => { release = resolve; releases.add(resolve); });
  await page.route("**/api/admin/about-editor**", async route => {
    if (route.request().method() === "GET") await held;
    await route.fallback();
  });
  try {
    await page.goto("/admin/about");
    await expect(page.locator(".admin-theme")).toHaveAttribute("data-admin-theme", theme);
    await expect(page.locator(".aep-browser")).toHaveAttribute("data-phase", "skeleton");
    const viewport = page.locator(".aep-frame-viewport");
    await page.frameLocator(".aep-frame").locator("[data-about-preview]").waitFor({ state: "attached" });
    await page.frameLocator(".aep-frame").locator("body").evaluate(async () => { await document.fonts.ready; });
    const before = await viewport.boundingBox();
    expect(before).not.toBeNull();
    const clip = { x: Math.ceil(before!.x + before!.width / 2 - 32), y: Math.ceil(before!.y + 24), width: 64, height: 64 };
    await viewport.evaluate(element => {
      for (const animation of element.getAnimations({ subtree: true })) {
        if ((animation as CSSAnimation).animationName === "aep-shimmer") { animation.pause(); animation.currentTime = 800; }
      }
    });
    const band = await page.screenshot({ clip });
    const hideBand = await page.addStyleTag({ content: ".aep-classic .aep-browser[data-loading] .aep-frame-viewport::after { visibility:hidden!important; }" });
    const base = await page.screenshot({ clip });
    const expected = await viewport.evaluate(element => getComputedStyle(element).backgroundColor.match(/\d+/g)!.slice(0, 3).map(Number));
    const basePixels = await sharp(base).removeAlpha().raw().toBuffer();
    const bandPixels = await sharp(band).removeAlpha().raw().toBuffer();
    let largestBaseError = 0, largestBandDifference = 0;
    for (let index = 0; index < basePixels.length; index++) {
      largestBaseError = Math.max(largestBaseError, Math.abs(basePixels[index] - expected[index % 3]));
      largestBandDifference = Math.max(largestBandDifference, Math.abs(basePixels[index] - bandPixels[index]));
    }
    await info.attach("painted-skeleton-base", { body: base, contentType: "image/png" });
    await info.attach("painted-skeleton-band", { body: band, contentType: "image/png" });
    await info.attach("skeleton-pixel-proof", { body: JSON.stringify({ theme, expected, largestBaseError, largestBandDifference, before }), contentType: "application/json" });
    expect(largestBaseError, "The painted loading base must match the theme host, not the public iframe background").toBeLessThanOrEqual(1);
    expect(largestBandDifference, "The shimmer must remain visible over the actual loading base").toBeGreaterThanOrEqual(5);
    expect(await viewport.boundingBox()).toEqual(before);
    await hideBand.evaluate(element => (element as HTMLStyleElement).remove());
    release();
    await expect(page.locator(".aep-browser")).toHaveAttribute("data-phase", "content");
    const after = await viewport.boundingBox();
    for (const key of ["x", "y", "width"] as const) expect(Math.abs(after![key] - before![key])).toBeLessThanOrEqual(1);
    const frames = await page.evaluate(() => (window as unknown as { cl14PaintReveal: Array<{ phase: string; visibility: string; opacity: number; duration: string; transform: string }> }).cl14PaintReveal);
    expect(frames.some(frame => frame.visibility === "visible" && frame.opacity > 0 && frame.opacity < 1)).toBe(true);
    expect(new Set(frames.map(frame => frame.transform)).size).toBe(1);
    await expect(page.locator(".aep-frame")).toBeVisible();
    await info.attach("paint-reveal", { body: JSON.stringify({ before, after, unknownInitialExtent: true, frames }), contentType: "application/json" });
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});


test("removing a focused value preserves Undo focus through modal recovery", async ({ page }) => {
  await fixture(page);
  await page.goto("/admin/about");
  await open(page, "Edit Club values");
  const clockStart = Date.now();
  await page.clock.install({ time: clockStart });
  await page.clock.pauseAt(clockStart + 10000);
  await page.getByRole("button", { name: "Remove value 1", exact: true }).click();
  await page.clock.runFor(0);
  const undo = page.getByRole("button", { name: "Undo: Removed Together", exact: true });
  await undo.focus();
  await expect(undo).toBeFocused();
  await page.clock.runFor(32);
  await expect(undo).toBeFocused();
  await page.clock.resume();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Value 1 Title", exact: true })).toHaveValue("Together");
  await expect(undo).toHaveCount(0);
});
