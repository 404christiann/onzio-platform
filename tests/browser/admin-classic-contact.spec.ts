import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import type { ContactEditorSaveRequest, ContactEditorSnapshot } from "@/lib/contact-page-editor/contract";
import { captureContactRows, localContactDatabase, restoreContactRows } from "./helpers/contact-editor-fixture";

const snapshot: ContactEditorSnapshot = {
  revision: "41",
  profile: { public_email: "hello@example.org", public_phone: "+1 (312) 555-0199", service_area: "Chicago and the near western suburbs", hours: "Mon to Fri, 9 AM to 5 PM" },
  page: { eyebrow: "Contact the club", headline: "Start a conversation", intro: "Questions about the club? Reach out.", hero_media_asset_id: null },
  socialLinks: [{ id: "instagram", label: "Instagram", href: "https://instagram.com/example", icon: "/images/logo/instagramLogo.svg", sort_order: 0, updated_at: "2026-11-15T00:00:00Z" }],
};
const preview = (page: Page) => page.frameLocator('iframe[title="Public Contact page preview"]').last();
const region = (page: Page, label: string) => preview(page).getByRole("button", { name: `Edit ${label}`, exact: true });
const done = (page: Page) => page.getByRole("button", { name: "Done", exact: true });
const save = (page: Page) => page.locator("[data-admin-save-button]");
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name, exact: true });

async function closeEditor(page: Page) {
  await done(page).click();
  await expect(page.locator('[data-slot="admin-dialog-backdrop"]').filter({ visible: true })).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: "onzio-admin-theme", value: process.env.ADMIN_CLASSIC_COLOR_SCHEME ?? "light", url: process.env.ADMIN_CLASSIC_BASE_URL ?? "http://alpha.localhost:3110" }]);
  await localOnly(page);
});

async function localOnly(page: Page) {
  await page.route("**/*", route => {
    const host = new URL(route.request().url()).hostname;
    return host === "127.0.0.1" || host === "localhost" || host.endsWith(".localhost") ? route.fallback() : route.abort();
  });
}

async function mock(page: Page, value = snapshot) {
  await page.route("**/api/admin/contact-editor", route => route.request().method() === "GET" ? route.fulfill({ json: value }) : route.fallback());
}

async function open(page: Page) {
  await page.goto("/admin/contact");
  await expect(page.locator('[data-admin-loading-region]')).toHaveAttribute("data-phase", "content");
  await expect(region(page, "page heading")).toBeVisible();
}

test("Contact canvas opens shared dialogs, previews drafts, and restores keyboard focus", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await mock(page); await open(page);
  await expect(page.locator(".cep-section-guide,.cep-savebar,.cep-mobile-save,.cep-inspector")).toHaveCount(0);
  const headingStyles = await page.getByRole("heading", { name: "Contact", level: 1 }).evaluate(element => ({ font: getComputedStyle(element).fontFamily, transform: getComputedStyle(element).textTransform }));
  await region(page, "page heading").focus(); await page.keyboard.press("Enter");
  await expect(dialog(page, "Page heading")).toBeVisible();
  await expect(page.getByLabel("Eyebrow", { exact: true })).toBeFocused();
  await expect(page.getByText("Contact page only", { exact: true })).toBeVisible();
  await expect(dialog(page, "Page heading")).toContainText("/80");
  await page.getByLabel("Headline", { exact: false }).fill("A new conversation");
  await expect(preview(page).locator("h1")).toHaveText("A new conversation");
  await dialog(page, "Page heading").evaluate(element => {
    const state = { events: [] as unknown[], listener: null as unknown as EventListener };
    state.listener = event => {
      const target = event.target as HTMLElement;
      state.events.push({ at: performance.now(), inside: element.contains(target), guard: target.hasAttribute("data-base-ui-focus-guard"), tag: target.tagName, role: target.getAttribute("role"), label: target.getAttribute("aria-label") });
    };
    (window as unknown as Record<string, unknown>).contactFocusProof = state;
    document.addEventListener("focusin", state.listener, true);
  });
  const focusSamples = [];
  for (let index = 0; index < 10; index++) {
    const started = Date.now();
    await page.keyboard.press("Tab");
    const inspect = () => dialog(page, "Page heading").evaluate(element => {
      const target = document.activeElement as HTMLElement;
      return { inside: element.contains(target), guard: target.hasAttribute("data-base-ui-focus-guard"), tag: target.tagName, role: target.getAttribute("role"), label: target.getAttribute("aria-label") };
    });
    const immediate = await inspect();
    expect(immediate.inside || immediate.guard).toBe(true);
    await expect.poll(async () => (await inspect()).inside, { timeout: 500, intervals: [0, 5, 10, 20, 50] }).toBe(true);
    const settled = await inspect();
    focusSamples.push({ index, immediate, settled, elapsedMilliseconds: Date.now() - started });
  }
  const focusEvents = await page.evaluate(() => {
    const state = (window as unknown as { contactFocusProof: { events: { inside: boolean; guard: boolean }[]; listener: EventListener } }).contactFocusProof;
    document.removeEventListener("focusin", state.listener, true);
    return state.events;
  });
  expect(focusEvents.filter(event => !event.inside && !event.guard)).toEqual([]);
  const focusReceipt = info.outputPath("native-focus-proof.json");
  await writeFile(focusReceipt, JSON.stringify({ focusSamples, focusEvents }, null, 2));
  await info.attach("native-focus-proof.json", { path: focusReceipt, contentType: "application/json" });

  await closeEditor(page); await expect(region(page, "page heading")).toBeFocused();
  await region(page, "contact details").click();
  const email = page.getByLabel("Public email", { exact: true });
  await expect(email).toBeFocused();
  await dialog(page, "Contact details").evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
  const emailBox = await email.boundingBox(), phoneBox = await page.getByLabel("Public phone", { exact: true }).boundingBox();
  expect(emailBox!.width).toBeGreaterThanOrEqual(info.project.name === "phone" ? 120 : 160);
  if (info.project.name === "phone") expect(phoneBox!.y).toBeGreaterThan(emailBox!.y); else expect(Math.abs(phoneBox!.y - emailBox!.y)).toBeLessThanOrEqual(1);
  await expect.poll(async () => { const bounds = await dialog(page, "Contact details").boundingBox(); return Boolean(bounds && bounds.y + bounds.height <= page.viewportSize()!.height + 1); }).toBe(true);
  await page.screenshot({ path: info.outputPath("contact-details.png") });
  await page.keyboard.press("Escape"); await expect(dialog(page, "Contact details")).not.toBeVisible();
  await page.getByRole("button", { name: "Phone", exact: true }).click();
  await expect(page.getByRole("button", { name: "Phone", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: info.outputPath("contact-canvas.png"), fullPage: true });
  const frameSizes = await preview(page).locator("html").evaluate(element => ({ scroll: element.scrollHeight, client: element.clientHeight }));
  expect(frameSizes.scroll).toBeLessThanOrEqual(frameSizes.client + 1);
  expect(await page.getByRole("heading", { name: "Contact", level: 1 }).evaluate(element => ({ font: getComputedStyle(element).fontFamily, transform: getComputedStyle(element).textTransform }))).toEqual(headingStyles);
  expect(errors).toEqual([]);
});

test("Contact validation identifies each region and clears only corrected fields", async ({ page }) => {
  await mock(page); await open(page);
  await region(page, "page heading").click(); await page.getByLabel("Headline", { exact: false }).fill(""); await closeEditor(page);
  await region(page, "contact details").click(); await page.getByLabel("Public email", { exact: true }).fill("invalid"); await page.getByLabel("Public phone", { exact: true }).fill("123"); await closeEditor(page);
  await save(page).click();
  await expect(page.getByText("Review the highlighted fields before saving.", { exact: true })).toBeVisible();
  await expect(page.getByText("Add a headline.", { exact: true })).toBeVisible();
  await page.getByLabel("Headline", { exact: false }).fill("Fixed headline"); await closeEditor(page);
  await expect(region(page, "page heading")).not.toHaveAttribute("data-invalid");
  await expect(region(page, "contact details")).toHaveAttribute("data-invalid");
  await region(page, "contact details").click();
  await expect(page.getByText("Enter a valid email address.", { exact: true })).toBeVisible();
  await expect(page.getByText("Enter a valid phone number.", { exact: true })).toBeVisible();
  await page.getByLabel("Public email", { exact: true }).fill("fixed@example.org");
  await expect(page.getByText("Enter a valid email address.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Enter a valid phone number.", { exact: true })).toBeVisible();
  await page.getByLabel("Public phone", { exact: true }).fill("+1 312 555 0199");
  await expect(page.getByText("Review the highlighted fields before saving.", { exact: true })).toHaveCount(0);
  await closeEditor(page); await expect(region(page, "contact details")).not.toHaveAttribute("data-invalid");
});

test("Contact empty regions remain editable and social ownership navigates to existing settings", async ({ page }) => {
  await mock(page, { ...snapshot, profile: null, page: null, socialLinks: [] }); await open(page);
  await expect(preview(page).getByText("Add contact details to show this section.")).toBeVisible();
  await expect(preview(page).getByText("No social links yet.")).toBeVisible();
  await region(page, "social links").click();
  const social = dialog(page, "Social links");
  await expect(social.locator("input,textarea")).toHaveCount(0);
  await expect(social).toContainText("Shared club data");
  const settings = social.getByRole("link", { name: "Edit social links in Club settings" });
  await expect(settings).toBeFocused(); await expect(settings).toHaveAttribute("href", "/admin/branding");
  await settings.click(); await expect(page).toHaveURL(/\/admin\/branding$/);
});

test("Contact touch edit tags stay visible and taps open their own region", async ({ browser, context }, info) => {
  const touch = await browser.newContext({ storageState: await context.storageState(), hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 }, colorScheme: process.env.ADMIN_CLASSIC_COLOR_SCHEME === "dark" ? "dark" : "light", reducedMotion: process.env.ADMIN_CLASSIC_REDUCED_MOTION === "1" ? "reduce" : "no-preference" });
  try {
    const page = await touch.newPage(); await localOnly(page); await mock(page); await open(page);
    await page.getByRole("button", { name: "Phone", exact: true }).click();
    const heading = region(page, "page heading");
    expect(await heading.locator("span").last().evaluate(element => getComputedStyle(element).opacity)).toBe("1");
    await heading.tap(); await expect(dialog(page, "Page heading")).toBeVisible(); await closeEditor(page);
    await region(page, "contact details").tap(); await expect(dialog(page, "Contact details")).toBeVisible();
    await dialog(page, "Contact details").evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
    await page.screenshot({ path: info.outputPath("touch-contact-details.png") });
  } finally { await touch.close(); }
});

test("Contact dialog fits a changing phone viewport and dismisses from its backdrop", async ({ page }, info) => {
  await mock(page); await open(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await region(page, "page heading").click();
  const editor = dialog(page, "Page heading");
  for (const field of await editor.locator("input,textarea").all()) expect(await field.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  try {
    for (const visible of [{ height: 330, top: 0 }, { height: 330, top: 85 }]) {
      await page.evaluate(({ height, top }) => {
        Object.defineProperty(visualViewport!, "height", { configurable: true, value: height });
        Object.defineProperty(visualViewport!, "offsetTop", { configurable: true, value: top });
        visualViewport!.dispatchEvent(new Event("resize"));
      }, visible);
      await page.getByLabel("Introduction", { exact: true }).focus();
      await expect.poll(async () => { const bounds = await done(page).boundingBox(); return Boolean(bounds && bounds.y >= visible.top && bounds.y + bounds.height <= visible.top + visible.height); }).toBe(true);
    }
    await page.screenshot({ path: info.outputPath("contact-keyboard-viewport.png") });
  } finally {
    await page.evaluate(() => { delete (visualViewport as unknown as Record<string, unknown>).height; delete (visualViewport as unknown as Record<string, unknown>).offsetTop; visualViewport!.dispatchEvent(new Event("resize")); });
  }
  await page.mouse.click(8, 8); await expect(editor).not.toBeVisible();
});

test("Contact loading keeps visible anchors and reports initial extent separately from reveal", async ({ page }, info) => {
  await page.addInitScript(() => {
    const metrics = { cls: 0, samples: [] as { phase: string; top: number; height: number; header: number; toolbar: number }[] };
    (window as unknown as Record<string, unknown>).contactMetrics = metrics;
    new PerformanceObserver(list => { for (const entry of list.getEntries()) { const shift = entry as PerformanceEntry & { hadRecentInput: boolean; value: number }; if (!shift.hadRecentInput) metrics.cls += shift.value; } }).observe({ type: "layout-shift", buffered: true });
    const sample = () => {
      const element = document.querySelector<HTMLElement>(".cc-loading-region");
      if (element) { const rect = element.getBoundingClientRect(); metrics.samples.push({ phase: element.dataset.phase ?? "", top: rect.top, height: rect.height, header: document.querySelector("[data-admin-page-header]")!.getBoundingClientRect().top, toolbar: document.querySelector(".cc-preview-toolbar")!.getBoundingClientRect().top }); }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  let release: (() => void) | undefined;
  await page.route("**/api/admin/contact-editor", async route => {
    await new Promise<void>(resolve => { release = resolve; }); await route.fulfill({ json: snapshot });
  });
  await page.goto("/admin/contact");
  await expect(page.locator(".cc-loading-region")).toHaveAttribute("data-phase", "skeleton");
  await expect.poll(() => Boolean(release)).toBe(true); release!();
  await expect(page.locator(".cc-loading-region")).toHaveAttribute("data-phase", "content");
  await expect(region(page, "page heading")).toBeVisible();
  await page.waitForTimeout(250);
  const metrics = await page.evaluate(() => (window as unknown as { contactMetrics: { cls: number; samples: { phase: string; top: number; height: number; header: number; toolbar: number }[] } }).contactMetrics);
  const first = metrics.samples[0], last = metrics.samples.at(-1)!;
  const reveal = metrics.samples.filter(sample => sample.phase === "crossfade" || sample.phase === "content");
  const swap = Math.max(...reveal.map(sample => Math.abs(sample.height - last.height)));
  expect(swap).toBeLessThanOrEqual(1);
  expect(Math.max(...metrics.samples.map(sample => Math.abs(sample.header - last.header)))).toBeLessThanOrEqual(1);
  expect(Math.max(...metrics.samples.map(sample => Math.abs(sample.toolbar - last.toolbar)))).toBeLessThanOrEqual(1);
  const receipt = info.outputPath("contact-loading.json");
  await writeFile(receipt, JSON.stringify({ ...metrics, revealHeightSwap: swap, initialUnknownExtentChange: last.height - first.height }));
  await info.attach("contact-loading.json", { path: receipt, contentType: "application/json" });
});

for (const failure of ["committed-500", "committed-network-loss", "unavailable-receipt", "not-committed"] as const) {
  test(`Contact reconciles ${failure} with the exact atomic payload`, async ({ page }) => {
    const withHero: ContactEditorSnapshot = { ...snapshot, page: { ...snapshot.page!, hero_media_asset_id: "55555555-5555-4555-8555-555555555501" } };
    await mock(page, withHero);
    const submitted: ContactEditorSaveRequest[] = [], checked: string[] = [];
    let last: ContactEditorSnapshot = withHero;
    await page.route("**/api/admin/contact-editor?operationId=*", async route => {
      checked.push(new URL(route.request().url()).searchParams.get("operationId")!);
      if (failure === "unavailable-receipt" && checked.length === 1) return route.abort();
      return route.fulfill({ json: { ...snapshot, operation: failure.startsWith("committed") ? { status: "committed", receipt: last } : { status: "not-committed" } } });
    });
    await page.route("**/api/admin/contact-editor", async route => {
      if (route.request().method() !== "POST") return route.fallback();
      const request = route.request().postDataJSON(); submitted.push(request);
      last = { ...snapshot, profile: request.profile, page: request.page, revision: "42" };
      if (submitted.length > 1) return route.fulfill({ json: last });
      return failure === "committed-network-loss" ? route.abort() : route.fulfill({ status: 500, json: { error: { code: "DATABASE_OPERATION_FAILED" } } });
    });
    await open(page); await region(page, "page heading").click(); await page.getByLabel("Headline", { exact: false }).fill("Recovery headline"); await closeEditor(page); await save(page).click();
    if (!failure.startsWith("committed")) {
      await expect(page.locator(".cc-error")).toContainText("exact save");
      await region(page, "page heading").click(); await expect(page.getByLabel("Headline", { exact: false })).toBeDisabled(); await closeEditor(page);
      await page.getByRole("button", { name: "Confirm save", exact: true }).click();
      expect(submitted).toHaveLength(2); expect(submitted[1]).toEqual(submitted[0]);
    }
    await expect(save(page)).toHaveAttribute("data-state", "saved");
    expect(checked).toEqual([submitted[0].operationId]);
      expect(submitted[0]).toMatchObject({ expectedRevision: "41", profile: withHero.profile, page: { ...withHero.page, headline: "Recovery headline" } });
    await expect(page.locator(".cc-error")).toHaveCount(0);
  });
}

test("Contact preserves newer edits during an older save and blocks Save and leave", async ({ page }) => {
  await mock(page);
  let release: (() => void) | undefined, submitted: ContactEditorSaveRequest | undefined;
  await page.route("**/api/admin/contact-editor", async route => {
    if (route.request().method() !== "POST") return route.fallback();
    submitted = route.request().postDataJSON();
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: { ...snapshot, profile: submitted!.profile, page: submitted!.page, revision: "42" } });
  });
  try {
  await open(page); await region(page, "page heading").click(); await page.getByLabel("Headline", { exact: false }).fill("Submitted headline"); await closeEditor(page); await save(page).click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await region(page, "page heading").click(); await page.getByLabel("Headline", { exact: false }).fill("Newer headline"); await closeEditor(page);
  await region(page, "social links").click(); await page.getByRole("link", { name: "Edit social links in Club settings" }).click();
  const guard = dialog(page, "Save your changes first?"); await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Save and leave", exact: true }).click();
  await expect(save(page)).toHaveAttribute("data-state", "saving");
  release!();
  await expect(save(page)).toHaveAttribute("data-state", "dirty");
  await expect(guard.getByRole("button", { name: "Keep editing", exact: true })).toBeEnabled();
  await expect(guard).toBeVisible(); await expect(page).toHaveURL(/\/admin\/contact$/);
  await guard.getByRole("button", { name: "Keep editing", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(preview(page).locator("h1")).toHaveText("Newer headline");
  await expect(save(page)).toHaveAttribute("data-state", "dirty");
  } finally { release?.(); }
});

test("Contact Save and leave saves every region together and stays open on failure", async ({ page }) => {
  await mock(page);
  const requests: ContactEditorSaveRequest[] = [];
  let fail = true;
  await page.route("**/api/admin/contact-editor", route => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON(); requests.push(body);
    return fail ? route.fulfill({ status: 403, json: { error: { code: "NOT_AUTHORIZED", message: "Contact permission changed" } } }) : route.fulfill({ json: { ...snapshot, profile: body.profile, page: body.page, revision: "42" } });
  });
  await open(page); await region(page, "page heading").click(); await page.getByLabel("Headline", { exact: false }).fill("Guarded headline"); await closeEditor(page);
  await region(page, "contact details").click(); await page.getByLabel("Public email", { exact: true }).fill("guard@example.org"); await page.getByLabel("Hours", { exact: true }).fill("Every afternoon"); await closeEditor(page);
  await region(page, "social links").click(); await page.getByRole("link", { name: "Edit social links in Club settings" }).click();
  const guard = dialog(page, "Save your changes first?"); await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Save and leave", exact: true }).click();
  await expect(save(page)).toHaveAttribute("data-state", "dirty");
  await expect(guard).toBeVisible(); await expect(page).toHaveURL(/\/admin\/contact$/);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ profile: { ...snapshot.profile, public_email: "guard@example.org", hours: "Every afternoon" }, page: { ...snapshot.page, headline: "Guarded headline" } });
  fail = false; await guard.getByRole("button", { name: "Save and leave", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/branding$/);
  expect(requests).toHaveLength(2); expect(requests[1].profile).toEqual(requests[0].profile); expect(requests[1].page).toEqual(requests[0].page);
});

test("Contact keeps failed drafts and restyles both conflict decisions", async ({ page }) => {
  await mock(page);
  let mode = "failure";
  const bodies: ContactEditorSaveRequest[] = [];
  await page.route("**/api/admin/contact-editor", route => {
    if (route.request().method() !== "POST") return route.fulfill({ json: mode === "conflict" ? { ...snapshot, revision: "45", page: { ...snapshot.page!, headline: "Latest headline" } } : snapshot });
    const body = route.request().postDataJSON(); bodies.push(body);
    if (mode === "success") return route.fulfill({ json: { ...snapshot, profile: body.profile, page: body.page, revision: "46" } });
    return route.fulfill({ status: mode === "conflict" ? 409 : 403, json: { error: { code: mode === "conflict" ? "CONTACT_CHANGED" : "NOT_AUTHORIZED", message: "Specific Contact save error" } } });
  });
  await open(page); await region(page, "page heading").click(); await page.getByLabel("Headline", { exact: false }).fill("My draft"); await closeEditor(page); await save(page).click();
  await expect(page.locator(".cc-error")).toContainText("Specific Contact save error"); await expect(preview(page).locator("h1")).toHaveText("My draft");
  mode = "conflict"; await save(page).click();
  const conflict = dialog(page, "Another editor saved this page"); await expect(conflict).toBeVisible(); await expect(conflict).toContainText("Latest headline");
  await conflict.getByRole("button", { name: "Keep my draft and save over latest", exact: true }).click();
  mode = "success"; await save(page).click(); await expect(save(page)).toHaveAttribute("data-state", "saved"); expect(bodies.at(-1)?.expectedRevision).toBe("45");
  await region(page, "page heading").click(); await page.getByLabel("Headline", { exact: false }).fill("Discard this"); await closeEditor(page); mode = "conflict"; await save(page).click();
  await conflict.getByRole("button", { name: "Discard draft and load latest", exact: true }).click();
  await dialog(page, "Discard your Contact draft?").getByRole("button", { name: "Discard draft and load latest", exact: true }).click();
  await expect(preview(page).locator("h1")).toHaveText("Latest headline"); await expect(save(page)).toHaveAttribute("data-state", "clean");
});

test("Contact real save persists both owners, preserves hero identity, reloads, and reaches the public page", async ({ page, context }, info) => {
  const db = localContactDatabase();
  await db.connect();
  const before = await captureContactRows(db);
  const submitted: ContactEditorSaveRequest[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/admin/contact-editor" && request.method() === "POST") submitted.push(request.postDataJSON()); });
  try {
    await open(page);
    const original = await (await page.request.get("/api/admin/contact-editor")).json() as ContactEditorSnapshot;
    const headline = "A new conversation", email = `contact-${randomUUID().slice(0, 8)}@example.org`;
    await region(page, "page heading").click(); await page.getByLabel("Headline", { exact: false }).fill(headline); await closeEditor(page);
    await region(page, "contact details").click(); await page.getByLabel("Public email", { exact: true }).fill(email); await closeEditor(page); await save(page).click();
    await expect(save(page)).toHaveAttribute("data-state", "saved");
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toEqual({
      operationId: expect.any(String), expectedRevision: original.revision,
      profile: { public_email: email, public_phone: original.profile?.public_phone.trim() ?? "", service_area: original.profile?.service_area.trim() ?? "", hours: original.profile?.hours.trim() ?? "" },
      page: { eyebrow: original.page?.eyebrow.trim() ?? "", headline, intro: original.page?.intro.trim() ?? "", hero_media_asset_id: original.page?.hero_media_asset_id ?? null },
    });
    const stored = await (await page.request.get("/api/admin/contact-editor")).json(); expect(stored.page.headline).toBe(headline); expect(stored.profile.public_email).toBe(email);
    await page.reload(); await expect(preview(page).locator("h1")).toHaveText(headline);
    const publicPage = await context.newPage(); await localOnly(publicPage); await publicPage.setViewportSize({ width: 390, height: 844 }); await publicPage.goto("/contact"); await expect(publicPage.getByRole("heading", { name: headline, exact: true })).toBeVisible(); await expect(publicPage.getByRole("link", { name: email, exact: true }).first()).toBeVisible(); await expect(publicPage.locator("footer").getByRole("link", { name: email, exact: true })).toBeVisible();
    await publicPage.screenshot({ path: info.outputPath("public-contact-clipping390.png"), fullPage: true });
    const publicHeading = await publicPage.getByRole("heading", { name: headline, exact: true }).evaluate(element => ({ text: element.textContent, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, fontSize: getComputedStyle(element).fontSize, overflowWrap: getComputedStyle(element).overflowWrap, classes: element.className, heroOverflow: getComputedStyle(element.closest("section")!).overflow }));
    const receipt = info.outputPath("inherited-public-heading390.json");
    await writeFile(receipt, JSON.stringify(publicHeading));
    await info.attach("inherited-public-heading390.json", { path: receipt, contentType: "application/json" });
    await publicPage.goto("/"); await expect(publicPage.locator("footer").getByRole("link", { name: email, exact: true })).toBeVisible(); await publicPage.close();
  } finally {
    try { await restoreContactRows(db, before); }
    finally { await db.end(); }
  }
});


test("Contact same open guard retries the original uncertain operation", async ({ page }, info) => {
  await mock(page);
  const requests: ContactEditorSaveRequest[] = [];
  const receiptChecks: string[] = [];
  await page.route("**/api/admin/contact-editor?operationId=*", route => {
    receiptChecks.push(new URL(route.request().url()).searchParams.get("operationId")!);
    return route.fulfill({ json: { ...snapshot, operation: { status: "not-committed" } } });
  });
  await page.route("**/api/admin/contact-editor", route => {
    if (route.request().method() !== "POST") return route.fallback();
    const request = route.request().postDataJSON() as ContactEditorSaveRequest;
    requests.push(request);
    return requests.length === 1
      ? route.fulfill({ status: 500, json: { error: { code: "DATABASE_OPERATION_FAILED" } } })
      : route.fulfill({ json: { ...snapshot, profile: request.profile, page: request.page, revision: "42" } });
  });
  await open(page);
  await region(page, "page heading").click();
  await page.getByLabel("Headline", { exact: false }).fill("Same prompt exact retry");
  await closeEditor(page);
  await region(page, "social links").click();
  await page.getByRole("link", { name: "Edit social links in Club settings" }).click();
  const guard = dialog(page, "Save your changes first?");
  const leave = guard.getByRole("button", { name: "Save and leave", exact: true });
  await leave.click();
  await expect(page.locator(".cc-error")).toContainText("exact save");
  await expect(leave).toBeEnabled();
  await expect(guard).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/contact$/);
  expect(requests).toHaveLength(1);
  expect(receiptChecks).toEqual([requests[0].operationId]);
  await page.screenshot({ path: info.outputPath("same-open-uncertain-guard.png") });
  await leave.click();
  await expect(page).toHaveURL(/\/admin\/branding$/);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  expect(requests[0]).toMatchObject({ expectedRevision: "41", profile: snapshot.profile, page: { ...snapshot.page, headline: "Same prompt exact retry" } });
});

test("Contact same open guard saves newer edits with the confirmed revision", async ({ page }, info) => {
  let current = snapshot;
  await page.route("**/api/admin/contact-editor", async route => {
    if (route.request().method() !== "POST") return route.fulfill({ json: current });
    const request = route.request().postDataJSON() as ContactEditorSaveRequest;
    requests.push(request);
    if (requests.length === 1) await new Promise<void>(resolve => { release = resolve; });
    if (request.expectedRevision !== current.revision) return route.fulfill({ status: 409, json: { error: { code: "CONTACT_CHANGED" } } });
    current = { ...snapshot, profile: request.profile, page: request.page, revision: requests.length === 1 ? "42" : "43" };
    return route.fulfill({ json: current });
  });
  const requests: ContactEditorSaveRequest[] = [];
  let release: (() => void) | undefined;
  try {
    await open(page);
    await region(page, "page heading").click();
    await page.getByLabel("Headline", { exact: false }).fill("Older submitted headline");
    await closeEditor(page);
    await save(page).click();
    await expect.poll(() => Boolean(release)).toBe(true);
    await region(page, "page heading").click();
    await page.getByLabel("Headline", { exact: false }).fill("Newer headline remains");
    await closeEditor(page);
    await region(page, "social links").click();
    await page.getByRole("link", { name: "Edit social links in Club settings" }).click();
    const guard = dialog(page, "Save your changes first?");
    const leave = guard.getByRole("button", { name: "Save and leave", exact: true });
    await leave.click();
    release!();
    await expect(save(page)).toHaveAttribute("data-state", "dirty");
    await expect(leave).toBeEnabled();
    await expect(guard).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/contact$/);
    await expect(preview(page).locator("h1")).toHaveText("Newer headline remains");
    expect(requests).toHaveLength(1);
    expect(current.revision).toBe("42");
    await page.screenshot({ path: info.outputPath("same-open-newer-guard.png") });
    await leave.click();
    await expect.poll(() => requests.length).toBe(2);
    expect(requests[1]).toMatchObject({ expectedRevision: "42", profile: snapshot.profile, page: { ...snapshot.page, headline: "Newer headline remains" } });
    expect(requests[1].operationId).not.toBe(requests[0].operationId);
    await expect(page).toHaveURL(/\/admin\/branding$/);
    expect(current.revision).toBe("43");
  } finally { release?.(); }
});

test("Contact header actions fill phones and keep Save labels stable", async ({ page }, info) => {
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  let mode: "hold" | "uncertain" = "hold", release: (() => void) | undefined;
  const measurements: object[] = [];
  await mock(page);
  await page.route("**/api/admin/contact-editor?operationId=*", route => route.fulfill({ json: { ...snapshot, operation: { status: "not-committed" } } }));
  await page.route("**/api/admin/contact-editor", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: snapshot });
    if (mode === "uncertain") return route.fulfill({ status: 500, json: { error: { code: "DATABASE_OPERATION_FAILED" } } });
    await new Promise<void>(resolve => { release = resolve; });
    const submitted = route.request().postDataJSON() as ContactEditorSaveRequest;
    await route.fulfill({ json: { ...snapshot, revision: "42", profile: submitted.profile, page: submitted.page } });
  });
  await open(page);
  const widths = new Map<number, number>();
  async function measure(label: string, confirm = false) {
    const button = confirm ? page.locator(".cc-confirm-actions button") : save(page);
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      const metrics = await button.evaluate(element => {
        const button = element as HTMLButtonElement, actions = document.querySelector("[data-admin-page-actions]")!;
        const bounds = button.getBoundingClientRect(), row = actions.getBoundingClientRect();
        return { width: button.offsetWidth, rowWidth: actions.clientWidth, rightGap: row.right - bounds.right, height: button.offsetHeight, overflow: document.documentElement.scrollWidth - innerWidth };
      });
      measurements.push({ label, viewport: width, ...metrics });
      expect(metrics.overflow).toBeLessThanOrEqual(1);
      if (width < 640) {
        expect(Math.abs(metrics.width - metrics.rowWidth)).toBeLessThanOrEqual(1);
        expect(Math.abs(metrics.rightGap)).toBeLessThanOrEqual(1);
        expect(metrics.height).toBeGreaterThanOrEqual(44);
      } else expect(metrics.width).toBe(150);
      if (label === "clean") widths.set(width, metrics.width);
      expect(metrics.width).toBe(widths.get(width));
    }
  }
  async function edit(text: string) {
    await region(page, "page heading").click();
    await page.getByLabel("Headline", { exact: false }).fill(text);
    await closeEditor(page);
    await expect(region(page, "page heading")).toBeFocused();
  }
  await measure("clean");
  await edit("Header layout draft");
  await measure("dirty");
  await expect(page.locator("[data-admin-save-status]")).toHaveText("Unsaved changes");
  await save(page).focus();
  await page.keyboard.press("Enter");
  await expect(save(page)).toHaveAttribute("data-state", "saving");
  await measure("saving");
  await expect(save(page)).toBeFocused();
  expect(release).toBeDefined(); release!();
  await expect(save(page)).toHaveAttribute("data-state", "saved");
  await save(page).evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
  await measure("saved");
  await expect(save(page)).toBeFocused();
  await page.screenshot({ path: info.outputPath("header-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-slot="sidebar"]').evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
  await page.screenshot({ path: info.outputPath("header-phone.png") });
  mode = "uncertain";
  await edit("Unconfirmed header draft");
  await save(page).click();
  const confirm = page.locator(".cc-confirm-actions button");
  await expect(confirm).toBeEnabled();
  await expect(confirm).toHaveText("Confirm save");
  await measure("confirmation-ready", true);
  await expect(page.locator(".cc-confirm-actions > span")).toHaveText("Confirm the previous save before editing.");
  mode = "hold"; release = undefined;
  await confirm.focus();
  await page.keyboard.press("Space");
  await expect(confirm).toHaveText("Saving…");
  await expect(confirm).toBeDisabled();
  await measure("confirmation-saving", true);
  expect(release).toBeDefined(); release!();
  await expect(save(page)).toHaveAttribute("data-state", "saved");
  expect(pageErrors).toEqual([]);
  await writeFile(info.outputPath("header-widths.json"), JSON.stringify({ measurements, pageErrors }, null, 2));
});
