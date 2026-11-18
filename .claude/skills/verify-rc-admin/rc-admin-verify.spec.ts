// verify-rc-admin: gates 2, 3, 4 and 6 against two production builds of the classic admin on the
// shared local stack: HEAD (the package worktree) and BASE (pristine origin/main), both serving
// rose-city.localhost and diverse-city.localhost with ONZIO_ENVIRONMENT=staging.
// Run only through scripts/verify.sh (it owns the lock, the reset, the seed and the servers).
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test, type Browser, type BrowserContext, type Locator, type Page, type Request } from "@playwright/test";

const HEAD = process.env.RCV_HEAD_URL!;            // http://rose-city.localhost:3110
const BASE = process.env.RCV_MAIN_URL!;            // http://rose-city.localhost:3111
const OUT = process.env.RCV_OUT!;
const STORAGE = process.env.RCV_STORAGE!;
const ROUTE = process.env.RCV_ROUTE ?? "/admin/chick-fil-a";
const TOUCHED = new Set((process.env.RCV_TOUCHED ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const SHARED_FIX = process.env.RCV_SHARED_FIX === "1";
const AXE = resolve(process.env.RCV_AXE ?? "node_modules/axe-core/axe.min.js");
const dcUrl = (base: string) => base.replace("rose-city.localhost", "diverse-city.localhost");

for (const dir of ["results", "payloads", "screenshots"]) mkdirSync(join(OUT, dir), { recursive: true });
const record = (name: string, value: unknown) => writeFileSync(join(OUT, "results", `${name}.json`), JSON.stringify(value, null, 2));

// ---------------------------------------------------------------------------------------------
// Rose City editors. `save` matches the mutating request(s) the editor's Save sends; `open`
// brings the editor to a state where `field` is editable. Keys are what --touched takes.
type Editor = {
  key: string; route: string; save: RegExp;
  open?: (page: Page) => Promise<void>;         // make the field editable (open a piece, a panel, an article)
  field?: (page: Page) => Locator;              // default: first enabled text field in main or an open dialog
  beforeSave?: (page: Page) => Promise<void>;   // close the panel or dialog, if Save needs it
  saveButton?: (page: Page) => Locator;         // default: [data-admin-save-button]
};
const genericField = (page: Page) => page.locator(["main", "[role=dialog]"].flatMap((scope) => [
  `${scope} input:not([type]):not([disabled])`, `${scope} input[type=text]:not([disabled])`, `${scope} textarea:not([disabled])`,
]).join(",")).filter({ visible: true }).first();
// Homepage pieces live in the preview iframe; the sticky header covers a piece's top edge, so
// scroll it below the header and click twice at (12,12), as tests/browser/cinematic-homepage-editor.spec.ts does.
async function openHomepagePiece(page: Page, piece: string) {
  const target = page.frameLocator('iframe[title="Homepage preview"]').locator(`[data-homepage-piece="${piece}"]`).first();
  await expect(target).toBeAttached({ timeout: 30_000 });
  await target.evaluate((element) => {
    element.scrollIntoView({ block: "start" });
    const header = element.ownerDocument.querySelector(".club-header");
    if (header && header !== element) element.ownerDocument.defaultView?.scrollBy(0, -header.getBoundingClientRect().bottom);
  });
  await target.click({ position: { x: 12, y: 12 } });
  await target.click({ position: { x: 12, y: 12 } });
  await expect(page.locator(".hp-panel")).toBeVisible();
}
const visibleButton = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).filter({ visible: true }).first();
export const EDITORS: Editor[] = [
  { key: "stadium", route: "/admin/stadium", save: /\/api\/admin\/visitor-pages\/robinson$/ },
  { key: "foothill-transit", route: "/admin/foothill-transit", save: /\/api\/admin\/visitor-pages\/stadium$/ },
  { key: "chick-fil-a", route: "/admin/chick-fil-a", save: /\/api\/admin\/visitor-pages\/chick-fil-a$/ },
  { key: "tickets", route: "/admin/tickets", save: /\/api\/admin\/tickets-editor$/ },
  { key: "season-membership", route: "/admin/season-membership", save: /\/api\/admin\/visitor-pages\/season-membership$/ },
  { key: "know-before-you-go", route: "/admin/know-before-you-go", save: /\/api\/admin\/visitor-pages\/know-before-you-go$/ },
  { key: "policies", route: "/admin/policies", save: /\/api\/admin\/cinematic-policies$/ },
  { key: "partners", route: "/admin/partners", save: /\/api\/admin\/cinematic-partners$/ },
  { key: "injury-report", route: "/admin/injury-report", save: /\/api\/admin\/cinematic-injury-report$/ },
  { key: "contact", route: "/admin/contact", save: /\/api\/admin\/cinematic-contact$/ },
  { key: "about", route: "/admin/about", save: /\/api\/admin\/about-editor$/,
    open: async (page) => {
      const target = page.frameLocator('iframe[title="Public About page preview"]').getByLabel("Edit Page heading");
      await expect(target).toBeVisible({ timeout: 30_000 });
      await target.click();
    },
    beforeSave: (page) => page.getByRole("dialog").getByRole("button", { name: "Done", exact: true }).click() },
  { key: "homepage", route: "/admin/homepage", save: /\/api\/admin\/homepage$/,
    open: (page) => openHomepagePiece(page, "revamp.navigation"),
    field: (page) => page.locator(".hp-panel").getByLabel("Community", { exact: true }),
    beforeSave: (page) => visibleButton(page, "Done").click(),
    saveButton: (page) => visibleButton(page, "Save homepage") },
  { key: "shop", route: "/admin/shop", save: /\/api\/admin\/shop$/,
    open: (page) => visibleButton(page, "Edit kit text").click(),
    saveButton: (page) => visibleButton(page, "Save page") },
  { key: "news", route: "/admin/news", save: /\/api\/admin\/cinematic-news$/,
    open: (page) => page.getByRole("button", { name: /^Edit\b/ }).filter({ visible: true }).first().click(),
    saveButton: (page) => visibleButton(page, "Save article") },
];
const editorFor = (route: string) => EDITORS.find((e) => e.route === route);

// Same UUIDs and clock on both builds, so a byte-identical payload is a real comparison. The
// clock is pinned to the run's start (not a constant): a clock past the access token's expiry
// makes supabase-js refresh, which rotates the one refresh token every context shares and
// signs the rest of the run out.
const FIXED_NOW = new Date(Math.floor(Date.now() / 60_000) * 60_000);
async function deterministic(page: Page) {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.addInitScript(() => {
    let n = 0;
    Object.defineProperty(crypto, "randomUUID", { value: () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}` });
  });
}

const saveButton = (page: Page, editor?: Editor) => editor?.saveButton?.(page) ?? page.locator("[data-admin-save-button]").first();

async function openEditor(page: Page, base: string, editor: Editor) {
  await page.goto(base + editor.route);
  await expect(page.locator("h1").first()).toBeVisible();
  if (editor.open) await editor.open(page);
  const found = (editor.field ?? genericField)(page);
  await expect(found).toBeVisible({ timeout: 30_000 });
  await expect(found).toBeEditable();
  // Pin the element: the generic selector skips disabled fields, so it would jump to another
  // field while a save locks the form.
  await found.evaluate((element) => element.setAttribute("data-rcv-field", ""));
  return page.locator("[data-rcv-field]");
}

// Deterministic edit: append a marker, trimming first if the field would overflow maxlength.
async function mark(field: Locator, marker: string) {
  const [value, max] = await field.evaluate((el: HTMLInputElement) => [el.value, el.maxLength] as const);
  const base = value.replace(/ ·\w+$/, "");
  const room = max > 0 ? max - marker.length - 2 : Infinity;
  const next = `${base.slice(0, Math.max(0, room))} ·${marker}`;
  await field.fill(next);
  return next;
}

// ---------------------------------------------------------------------------------------------
// Gate 2: payload identity for every editor the package does not touch.
type Captured = { method: string; path: string; contentType: string; body: string; sha256: string };
async function capture(browser: Browser, base: string, editor: Editor): Promise<{ requests: Captured[]; error?: string }> {
  const context = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await deterministic(page);
  const requests: Captured[] = [];
  let armed = false;
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const mutating = request.method() !== "GET" && request.method() !== "HEAD";
    const ours = url.pathname.startsWith("/api/") || (url.port === "54321" && /^\/(rest|storage)\//.test(url.pathname));
    if (armed && mutating && ours) {
      const body = request.postData() ?? "";
      requests.push({ method: request.method(), path: url.pathname + url.search, contentType: request.headers()["content-type"] ?? "", body, sha256: createHash("sha256").update(body).digest("hex") });
      return route.abort("failed"); // never reaches the database: both builds see the same state
    }
    return route.continue();
  });
  try {
    const field = await openEditor(page, base, editor);
    await mark(field, "rcv");
    await editor.beforeSave?.(page);
    armed = true;
    await saveButton(page, editor).click();
    await expect.poll(() => requests.some((r) => editor.save.test(new URL(r.path, base).pathname)), { timeout: 15_000 }).toBe(true);
    await page.waitForTimeout(500); // any second request in the same save
    return { requests };
  } catch (error) {
    await page.screenshot({ path: join(OUT, "payloads", `${editor.key}.${base === HEAD ? "head" : "base"}.error.png`) }).catch(() => {});
    return { requests, error: String(error).replace(/\u001b\[\d+m/g, "").split("\n").slice(0, 4).join(" ") };
  } finally {
    await context.close();
  }
}

test.describe("gate 2: save payloads of untouched editors match origin/main", () => {
  for (const editor of EDITORS) {
    test(`payload ${editor.key}`, async ({ browser }) => {
      const touched = TOUCHED.has(editor.key);
      const head = await capture(browser, HEAD, editor);
      const base = await capture(browser, BASE, editor);
      writeFileSync(join(OUT, "payloads", `${editor.key}.head.json`), JSON.stringify(head, null, 2));
      writeFileSync(join(OUT, "payloads", `${editor.key}.base.json`), JSON.stringify(base, null, 2));
      const identical = !head.error && !base.error && head.requests.length > 0
        && JSON.stringify(head.requests.map((r) => [r.method, r.path, r.body])) === JSON.stringify(base.requests.map((r) => [r.method, r.path, r.body]));
      record(`payload-${editor.key}`, { gate: 2, editor: editor.key, touched, identical, headError: head.error, baseError: base.error, head: head.requests.map(({ body: _b, ...r }) => r), base: base.requests.map(({ body: _b, ...r }) => r) });
      if (touched) test.info().annotations.push({ type: "touched", description: `${editor.key}: payload change allowed, recorded for review` });
      else {
        expect(base.error, `${editor.key}: could not capture the origin/main payload`).toBeUndefined();
        expect(head.error, `${editor.key}: could not capture the package payload`).toBeUndefined();
        expect(identical, `${editor.key}: save payload differs from origin/main (see payloads/${editor.key}.*.json)`).toBe(true);
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Gate 3: save behaviour on the editor under test, against the real API (package build).
const forbiddenCopy = async (page: Page) => expect(await page.locator("body").innerText(), "the words \"All changes saved\" must never show").not.toContain("All changes saved");
const SAVED_GREENS = ["rgb(52, 199, 89)", "rgb(48, 209, 88)"];

test.describe("gate 3: save behaviour", () => {
  test(`save states on ${ROUTE}`, async ({ browser }) => {
    const editor = editorFor(ROUTE) ?? { key: ROUTE, route: ROUTE, save: /\/api\/admin\// };
    const steps: Record<string, string> = {};
    const step = async (name: string, body: () => Promise<void>) => {
      try { await body(); steps[name] = "pass"; } catch (error) { steps[name] = `FAIL: ${String(error).split("\n").slice(0, 3).join(" ")}`; }
    };
    const context = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const button = page.locator("[data-admin-save-button]");
    const isSave = (r: Request) => r.method() === "POST" && editor.save.test(new URL(r.url()).pathname);
    let field!: Locator;
    let saved = "";

    await step("clean", async () => {
      field = await openEditor(page, HEAD, editor);
      saved = await field.inputValue();
      await expect(button).toHaveAttribute("data-state", "clean");
      await expect(button).toHaveAttribute("aria-disabled", "true");
      await forbiddenCopy(page);
    });
    await step("dirty", async () => {
      await mark(field, "d1");
      await expect(button).toHaveAttribute("data-state", "dirty");
      await expect(page.locator("[data-cinematic-save-bar] [role=status], [data-admin-save-status]").first()).toHaveText("Unsaved changes");
    });
    await step("saving", async () => {
      await page.route(editor.save, async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); }, { times: 1 });
      await button.click();
      await expect(button).toHaveAttribute("data-state", "saving");
      await expect(button).toHaveAttribute("aria-busy", "true");
    });
    await step("saved", async () => {
      await expect(button).toHaveAttribute("data-state", "saved", { timeout: 20_000 });
      await expect(button.locator("[data-admin-save-check]")).toBeVisible();
      expect(SAVED_GREENS).toContain(await button.evaluate((el) => getComputedStyle(el).backgroundColor));
      await page.screenshot({ path: join(OUT, "screenshots", "save-saved.png") });
      await forbiddenCopy(page);
      await expect(button).toHaveAttribute("data-state", "clean", { timeout: 5_000 });
      saved = await field.inputValue();
    });
    await step("retry", async () => {
      await mark(field, "r1");
      let lost = "";
      await page.route(editor.save, (route) => { lost = route.request().postData() ?? ""; return route.abort("failed"); }, { times: 1 });
      await page.route((url) => editor.save.test(url.pathname) && url.searchParams.has("operationId"), (route) => route.abort("failed"));
      await button.click();
      const retry = page.getByRole("button", { name: /^Retry( the)? same save$/ });
      await expect(retry).toBeVisible();
      await expect(field).toBeDisabled();
      await page.screenshot({ path: join(OUT, "screenshots", "save-retry.png") });
      await page.unrouteAll({ behavior: "wait" });
      const resent = page.waitForRequest(isSave);
      await retry.click();
      expect((await resent).postData(), "retry must resend the identical request (same operationId)").toBe(lost);
      await expect(button).toHaveAttribute("data-state", "saved", { timeout: 20_000 });
      await expect(button).toHaveAttribute("data-state", "clean", { timeout: 5_000 });
      saved = await field.inputValue();
    });
    await step("conflict", async () => {
      // A real conflict: another signed-in session saves first, so this page's revision is stale.
      const other = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 900 } });
      try {
        const otherPage = await other.newPage();
        const otherField = await openEditor(otherPage, HEAD, editor);
        await mark(otherField, "c2");
        await otherPage.locator("[data-admin-save-button]").click();
        await expect(otherPage.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saved", { timeout: 20_000 });
      } finally { await other.close(); }
      const mine = await mark(field, "c1");
      await button.click();
      await expect(page.getByRole("alert").first()).toBeVisible({ timeout: 20_000 });
      const keep = page.getByRole("button", { name: "Load latest and keep my edits" });
      await expect(keep).toBeVisible();
      await page.screenshot({ path: join(OUT, "screenshots", "save-conflict.png") });
      await keep.click();
      await expect(field).toHaveValue(mine);
      await expect(button).toHaveAttribute("data-state", "dirty");
      await button.click();
      await expect(button).toHaveAttribute("data-state", "saved", { timeout: 20_000 });
      await expect(button).toHaveAttribute("data-state", "clean", { timeout: 5_000 });
      saved = await field.inputValue();
    });
    await step("discard", async () => {
      await mark(field, "x1");
      await expect(button).toHaveAttribute("data-state", "dirty");
      await page.getByRole("button", { name: /^Reload saved pages?$/ }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Discard and reload" }).click();
      await expect(field).toHaveValue(saved);
      await expect(button).toHaveAttribute("data-state", "clean");
    });
    await context.close();
    record("save-behaviour", { gate: 3, route: ROUTE, steps });
    for (const [name, outcome] of Object.entries(steps)) expect.soft(outcome, `save behaviour: ${name}`).toBe("pass");
  });
});

// ---------------------------------------------------------------------------------------------
// Gate 4: visual, layout shift, reduced motion, accessibility (package build).
async function trackShift(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!entry.hadRecentInput) (window as unknown as { __cls: number }).__cls += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
}
type AxeViolation = { id: string; impact: string; help: string; nodes: { target: string[] }[] };
// Sub-pixel rounding (~1e-5) is not a visible shift; anything a person could see is far above this.
const CLS_LIMIT = 0.001;
// CSS-module hashes can differ between builds; compare rule + target with the hash stripped.
const violationKeys = (list: AxeViolation[]) => list.flatMap((v) => v.nodes.map((n) => `${v.id} ${n.target.join(" ").replace(/__[A-Za-z0-9_-]{5}\b/g, "")}`));
const fresh = (head: AxeViolation[], base: AxeViolation[]) => { const known = new Set(violationKeys(base)); return violationKeys(head).filter((key) => !known.has(key)); };
async function axe(page: Page, include: string[]): Promise<AxeViolation[]> {
  if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ path: AXE });
  return page.evaluate(async (scope) => {
    const result = await (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: AxeViolation[] }> } }).axe.run(
      { include: scope.map((selector) => [selector]), exclude: [["[aria-label='Page preview']"], ["iframe"]] },
      { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] },
    );
    return result.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => ({ target: n.target })) }));
  }, include);
}
// Movement that ignores prefers-reduced-motion: any running animation or transition that moves,
// scales or resizes for longer than 50 ms. Opacity and colour changes are allowed.
const MOVING = /^(transform|translate|scale|rotate|top|left|right|bottom|width|height|inset.*|margin.*)$/;
async function movingAnimations(page: Page) {
  return page.evaluate((pattern) => document.getAnimations().flatMap((animation) => {
    const effect = animation.effect as KeyframeEffect | null;
    const duration = Number(effect?.getComputedTiming().duration ?? 0);
    if (!effect || duration <= 50) return [];
    const properties = new Set(effect.getKeyframes().flatMap((frame) => Object.keys(frame)).filter((key) => !["offset", "computedOffset", "easing", "composite"].includes(key)));
    const transition = (animation as unknown as { transitionProperty?: string }).transitionProperty;
    if (transition) properties.add(transition);
    const moving = [...properties].filter((p) => new RegExp(pattern).test(p));
    const target = effect.target as Element | null;
    return moving.length ? [{ properties: moving, duration, target: target ? `${target.tagName.toLowerCase()}${target.id ? "#" + target.id : ""}.${[...target.classList].join(".")}`.slice(0, 120) : "?" }] : [];
  }), MOVING.source);
}

test.describe("gate 4: visual", () => {
  const editor = editorFor(ROUTE) ?? { key: ROUTE.replace(/\W+/g, "-"), route: ROUTE, save: /\/api\/admin\// };
  for (const width of [390, 1440]) for (const scheme of ["light", "dark"] as const) {
    test(`visual ${width} ${scheme}`, async ({ browser }) => {
      const context = await browser.newContext({ storageState: STORAGE, viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: scheme });
      const page = await context.newPage();
      await trackShift(page);
      const slug = `${editor.key}-${width}-${scheme}`;
      const field = await openEditor(page, HEAD, editor);
      await page.waitForTimeout(1_500); // editors keep polling, so networkidle never settles
      const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      await page.screenshot({ path: join(OUT, "screenshots", `${slug}.png`), fullPage: true });
      const formViolations = await axe(page, ["main"]);
      await mark(field, "v1");
      await page.getByRole("button", { name: /^Reload saved pages?$/ }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(OUT, "screenshots", `${slug}-dialog.png`) });
      const dialogViolations = await axe(page, ["[role=dialog]"]);
      await dialog.getByRole("button", { name: "Discard and reload" }).click();
      // Same checks on origin/main: only violations main does not have fail (a ratchet); the
      // rest are reported as existing debt.
      const basePage = await context.newPage();
      const baseField = await openEditor(basePage, BASE, editor);
      await basePage.waitForTimeout(1_500);
      const baseForm = await axe(basePage, ["main"]);
      await mark(baseField, "v1");
      await basePage.getByRole("button", { name: /^Reload saved pages?$/ }).click();
      await expect(basePage.getByRole("dialog")).toBeVisible();
      await basePage.waitForTimeout(400);
      const baseDialog = await axe(basePage, ["[role=dialog]"]);
      await basePage.getByRole("dialog").getByRole("button", { name: "Discard and reload" }).click();
      await context.close();
      const newForm = fresh(formViolations, baseForm);
      const newDialog = fresh(dialogViolations, baseDialog);
      record(`visual-${slug}`, { gate: 4, width, scheme, cls, overflow, formViolations, dialogViolations, newFormViolations: newForm, newDialogViolations: newDialog });
      expect.soft(cls, "layout shift on load (CLS)").toBeLessThan(CLS_LIMIT);
      expect.soft(overflow, "page scrolls sideways").toBeLessThanOrEqual(1);
      expect.soft(newForm, "axe violations in the editor form that origin/main does not have").toEqual([]);
      expect.soft(newDialog, "axe violations in the discard dialog that origin/main does not have").toEqual([]);
    });
  }
  test("reduced motion", async ({ browser }) => {
    const context = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const samples: { moment: string; moving: Awaited<ReturnType<typeof movingAnimations>> }[] = [];
    const field = await openEditor(page, HEAD, editor);
    samples.push({ moment: "load", moving: await movingAnimations(page) });
    await mark(field, "m1");
    samples.push({ moment: "dirty", moving: await movingAnimations(page) });
    await page.getByRole("button", { name: /^Reload saved pages?$/ }).click();
    await page.waitForTimeout(60);
    samples.push({ moment: "dialog opening", moving: await movingAnimations(page) });
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await page.waitForTimeout(60);
    samples.push({ moment: "dialog closing", moving: await movingAnimations(page) });
    await page.locator("[data-admin-save-button]").click();
    await page.waitForTimeout(60);
    samples.push({ moment: "saving", moving: await movingAnimations(page) });
    await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "saved", { timeout: 20_000 });
    samples.push({ moment: "saved", moving: await movingAnimations(page) });
    await context.close();
    const offenders = samples.filter((s) => s.moving.length);
    record("reduced-motion", { gate: 4, samples });
    expect.soft(offenders, "movement while prefers-reduced-motion: reduce").toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Gate 6: Diverse City's classic admin renders the same on both builds.
const DC_PAGES = ["/admin", "/admin/homepage", "/admin/programs", "/admin/contact", "/admin/shop", "/admin/about", "/admin/schedule", "/admin/sponsors"];
async function dcSnapshot(context: BrowserContext, base: string, path: string, shot?: string) {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  const response = await page.goto(dcUrl(base) + path);
  await page.waitForTimeout(2_000); // editors keep polling, so networkidle never settles
  const status = response?.status() ?? 0;
  const h1 = await page.locator("h1").first().textContent().catch(() => null);
  const aria = await page.locator("main").first().ariaSnapshot().catch((e) => `ERROR ${e}`);
  if (shot) await page.screenshot({ path: shot, fullPage: true });
  await page.close();
  return { status, h1, aria, errors };
}
test("gate 6: Diverse City admin smoke", async ({ browser }) => {
  const context = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 900 } });
  const pages = [];
  for (const path of DC_PAGES) {
    const head = await dcSnapshot(context, HEAD, path, join(OUT, "screenshots", `diverse-city${path.replace(/\//g, "-")}.png`));
    const base = await dcSnapshot(context, BASE, path);
    const newErrors = head.errors.filter((e) => !base.errors.includes(e));
    pages.push({ path, status: head.status, h1: head.h1, errors: newErrors, baseErrors: base.errors.length, sameAsMain: head.aria === base.aria, headAria: head.aria === base.aria ? undefined : head.aria, baseAria: head.aria === base.aria ? undefined : base.aria });
  }
  await context.close();
  record("diverse-city", { gate: 6, sharedFix: SHARED_FIX, pages });
  for (const p of pages) {
    expect.soft(p.status, `${p.path} status`).toBeLessThan(400);
    expect.soft(p.h1, `${p.path} has a heading`).toBeTruthy();
    expect.soft(p.errors, `${p.path} console errors not present on origin/main`).toEqual([]);
    if (!SHARED_FIX) expect.soft(p.sameAsMain, `${p.path} accessibility tree differs from origin/main`).toBe(true);
  }
});
