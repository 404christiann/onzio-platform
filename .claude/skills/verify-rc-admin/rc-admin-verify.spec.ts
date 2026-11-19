// verify-rc-admin: gates 2, 3, 4 and 6 against two production builds of the classic admin on the
// shared local stack: HEAD (the package worktree) and BASE (pristine origin/main), both serving
// rose-city.localhost and diverse-city.localhost with ONZIO_ENVIRONMENT=staging.
// Run only through scripts/verify.sh (it owns the lock, the reset, the seed and the servers).
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { KIT_ANY_FIELD_SELECTOR, KIT_DIALOG_SELECTOR, KIT_DONE_SELECTOR, KIT_EDIT_SELECTOR, KIT_ENABLED_FIELD_SELECTOR, KIT_LIST_SELECTOR, KIT_WAIT_MS, chooseOpenPath, firstMarkableIndex, isPhoneWidth, listProblems, retryLockCheck, sectionTryOrder, sheetBarProblems } from "./scripts/kit-path.mjs";
import { ROSTER_SAVE_BUTTON, SEASON_CREATE_BUTTON, gate3Plan, isAdminDataRead, isEditorSave, isMutating, stepsPass } from "./scripts/editors.mjs";
import { BUSY_SELECTOR, LOADING_TEXT, isEnvironmentNoise, savedColourProblems, waitUntilSettled } from "./scripts/settle.mjs";
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
// A page that is still loading shows its skeleton, not its h1. Under a loaded machine (3 verify runs plus builds, load average 30+)
// that took over 15 s three times on 2026-11-19: wait for the heading itself, bounded, never for a fixed time.
const LOAD_MS = 45_000;
const record = (name: string, value: unknown) => writeFileSync(join(OUT, "results", `${name}.json`), JSON.stringify(value, null, 2));

// ---------------------------------------------------------------------------------------------
// Rose City editors. `save` matches the mutating request(s) the editor's Save sends; `open`
// brings the editor to a state where `field` is editable. Keys are what --touched takes.
type Editor = {
  key: string; route: string; save: RegExp;
  open?: (page: Page) => Promise<void>;         // make the field editable (open a piece, a panel, an article)
  field?: (page: Page) => Locator;              // default: first enabled text field in main or an open dialog
  beforeSave?: (page: Page) => Promise<void>;   // close the panel or dialog, if Save needs it
  // An editor whose fields sit in its own dialog (not the kit's EditorDialog): `closeDialog` closes it so the page Save is reachable,
  // `reopenDialog` opens it again if it was closed and pins the same field. Gates 3 and 4 use them where they would use the kit's Done.
  // Both must be no-ops on a build that has no such dialog (main's old workspace), so one row serves main and the rebuild.
  closeDialog?: (page: Page) => Promise<void>;
  reopenDialog?: (page: Page) => Promise<void>;
  saveButton?: (page: Page) => Locator;         // default: the visible Save button, either kind (see SAVE_BUTTON)
  // Editors that save through the shared POST /api/admin/data (reads are POSTs too): narrow `save` by the body's operation and table.
  ops?: string[]; tables?: string[];
  // An editor with no text field and no page Save button (it saves each action at once): `act` does one deterministic save action
  // for gate 2 (the request is captured and aborted). Gate 3 reports it not applicable, from `lacks.pageSave`.
  act?: (page: Page) => Promise<void>;
  // What the editor does not have, with the reason, so gate 3 reports those as "not applicable" for this editor only.
  // pageSave: the whole of gate 3. retry / conflict / discard: just that step. clean, dirty, saving and saved are never skippable.
  lacks?: Partial<Record<"pageSave" | "retry" | "conflict" | "discard" | "status", string>>;
  // Lacks that hold only while the page still saves with the old AdminSaveButton (read from the page's own button). With the kit's
  // PageSaveButton those parts run for real, so one row serves main's old editor and its rebuild.
  lacksOnAdminButton?: Partial<Record<"retry" | "conflict" | "discard" | "status", string>>;
};
const saveOf = (editor: Editor, request: Request) => isEditorSave(editor, { method: request.method(), pathname: new URL(request.url()).pathname, body: request.postData() ?? "" });
// page.route() sees only the URL; a shared endpoint needs the body too, so match the path and hand every other request on.
async function routeSave(page: Page, editor: Editor, handler: (route: import("@playwright/test").Route) => Promise<void> | void, options: { times?: number } = {}) {
  let used = 0;
  await page.route((url) => editor.save.test(url.pathname), async (route) => {
    if (!saveOf(editor, route.request()) || (options.times !== undefined && used >= options.times)) return route.fallback();
    used++;
    await handler(route);
  });
}
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
// Rose City's Stats tables: "Edit <player>" opens a dialog whose number boxes change the page draft at once; Done closes it; the page Save
// publishes. Main's old workspace has no such dialog: its stat inputs sit on the page, so both hooks do nothing there.
const statsDialog = (page: Page) => page.locator("[role=dialog]").filter({ has: page.locator("[data-slot=stat-input]") });
const STATS_DIALOG: Pick<Editor, "closeDialog" | "reopenDialog"> = {
  closeDialog: async (page) => {
    const dialog = statsDialog(page);
    if (await dialog.count()) { await dialog.getByRole("button", { name: "Done", exact: true }).click(); await expect(dialog).toHaveCount(0, { timeout: 10_000 }); }
  },
  reopenDialog: async (page) => {
    if (await statsDialog(page).count() === 0) {
      const edit = page.getByRole("button", { name: /^Edit / }).filter({ visible: true }).first();
      if (await edit.count()) await edit.click(); // Rose City; on main there is no Edit button and the input is already on the page
    }
    const scope = (await statsDialog(page).count()) ? statsDialog(page) : page.locator("main");
    const input = scope.locator("[data-slot=stat-input]").filter({ visible: true }).first();
    await expect(input).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => document.querySelectorAll("[data-rcv-field]").forEach((el) => el.removeAttribute("data-rcv-field")));
    await input.evaluate((element) => element.setAttribute("data-rcv-field", ""));
  },
};
const STATS_OLD_BUTTON_LACKS = {
  conflict: "Main's old Stats header Save (AdminSaveButton) has no conflict control: its writes are upserts with no revision check",
  discard: "Main's old Stats has no Reload or Discard control",
  status: "Main's old Stats header Save has no \"Unsaved changes\" line beside it",
};
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
  // Shared with Diverse City (RC-ADMIN-4b-0). These save through POST /api/admin/data (reads are POSTs too), so each names its operations and tables.
  { key: "branding", route: "/admin/branding", save: /\/api\/admin\/data$/, ops: ["upsert"], tables: ["site_branding", "site_social_links"],
    // The footer tagline where the club shows one; otherwise the first social link (a web address: markable, see mark()).
    field: (page) => page.locator("#footer-tagline, input[id^=social-]").filter({ visible: true }).first(),
    lacks: { retry: "Branding has no \"Retry same save\" control: a failed save keeps its stages and Save sends them again", conflict: "Branding has no conflict control: its writes are upserts with no revision check", discard: "Branding has no Reload or Discard control: its unsaved-work guard asks when you leave the page" } },
  { key: "members", route: "/admin/members", save: /\/api\/admin\/members$/,
    act: async (page) => { await page.locator("#new-admin-email").fill("rcv-gate2@example.com"); await visibleButton(page, "Add administrator").click(); },
    lacks: { pageSave: "adding and removing an administrator act at once; there is no page Save" } },
  { key: "seasons", route: "/admin/seasons", save: /\/api\/admin\/data$/, ops: ["insert"], tables: ["seasons"],
    act: async (page) => { await page.getByRole("button", { name: SEASON_CREATE_BUTTON }).filter({ visible: true }).first().click(); await page.getByRole("dialog").getByRole("button", { name: /^Create/ }).click(); },
    lacks: { pageSave: "Create Next Season (or Create <year> season), Set active and Delete act at once; there is no page Save" } },
  { key: "roster", route: "/admin/roster", save: /\/api\/admin\/data$/, ops: ["update"], tables: ["players"],
    act: async (page) => {
      const row = page.locator("[data-player-id]").first();
      await expect(row).toBeVisible({ timeout: 30_000 });
      const edit = row.getByRole("button", { name: /^Edit\b/ });
      if (await edit.count()) await edit.first().click(); else await row.click();
      const name = page.locator("#player-name");
      await expect(name).toBeVisible();
      await mark(name, "rcv");
      await page.getByRole("dialog").getByRole("button", { name: ROSTER_SAVE_BUTTON }).click();
    },
    lacks: { pageSave: "a player is saved from its own dialog; the stats tab's Save is not covered here" } },
  { key: "stats-match", route: "/admin/stats?view=match", save: /\/api\/admin\/data$/, ops: ["upsert"], tables: ["player_match_stats", "goalkeeper_match_stats"],
    // No stat input exists until a match is chosen (the season's first match is enough).
    open: async (page) => {
      await page.locator("main select").filter({ has: page.locator("option", { hasText: "Select a match" }) }).first().selectOption({ index: 1 });
      // Rose City's tables list "Edit <player>"; main's workspace lists "Select <player>" (on a phone the player list shows first).
      await page.getByRole("button", { name: /^(Edit|Select) / }).filter({ visible: true }).first().click();
    },
    field: (page) => page.locator("[data-slot=stat-input]").filter({ visible: true }).first(),
    ...STATS_DIALOG,
    lacks: { retry: "re-sends the draft; /api/admin/data has no operationId, so there is no \"Retry same save\" pending state" },
    lacksOnAdminButton: STATS_OLD_BUTTON_LACKS },
  { key: "stats-season", route: "/admin/stats?view=season", save: /\/api\/admin\/data$/, ops: ["upsert"],
    open: async (page) => { await page.getByRole("button", { name: /^(Edit|Select) / }).filter({ visible: true }).first().click(); }, // "Edit <player>" on Rose City, "Select <player>" on main
    tables: ["player_season_stats", "goalkeeper_season_stats", "player_season_adjustments", "goalkeeper_season_adjustments"],
    field: (page) => page.locator("[data-slot=stat-input]").filter({ visible: true }).first(),
    ...STATS_DIALOG,
    lacks: { retry: "re-sends the draft; /api/admin/data has no operationId, so there is no \"Retry same save\" pending state" },
    lacksOnAdminButton: STATS_OLD_BUTTON_LACKS },
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

// An editor saves with either the old AdminSaveButton (`data-admin-save-button`) or the editor kit's
// PageSaveButton (`data-page-save-button`, inside PageFrame; under 768px PageFrame moves it into a
// fixed bottom bar, it is still the one button). Both carry `data-state`; the check mark, the
// "Unsaved changes" status and the retry/error/conflict states differ and are mapped below.
const SAVE_BUTTON = "[data-admin-save-button], [data-page-save-button]";
const SAVE_CHECK = "[data-admin-save-check], [data-page-save-check]";
const saveLocator = (page: Page) => page.locator(SAVE_BUTTON).filter({ visible: true }).first();
// A row's saveButton names the OLD page's button ("Save homepage"); a kit page has the one PageSaveButton, so the row is ignored there.
const saveButton = (page: Page, editor?: Editor) => (kitState.get(page)?.kit ? undefined : editor?.saveButton?.(page)) ?? saveLocator(page);
type SaveKind = "admin" | "page";
// Does this editor declare it has no discard control, given which Save button the page actually has (see Editor.lacksOnAdminButton)?
async function lacksDiscard(page: Page, editor: Editor) {
  const button = saveLocator(page);
  const kind = (await button.count()) ? await saveKind(button) : undefined;
  return Boolean(gate3Plan(editor, kind).skipped.discard);
}
const saveKind = (button: Locator): Promise<SaveKind> => button.evaluate((el) => (el.hasAttribute("data-page-save-button") ? "page" : "admin"));
// The editor's own "Reload saved page" control, or PageFrame's "Discard changes" (which opens the same confirmation).
// The confirm dialog's button: "Discard and reload" on the older editors, "Discard changes" where a kit page words it so.
const DISCARD_CONFIRM = /^Discard( and reload| changes)$/;
const discardTrigger = (page: Page) => page.getByRole("button", { name: /^(Reload saved pages?|Discard changes)$/ }).filter({ visible: true }).first();

// Gates 3 and 4 need an editable field. A route outside EDITORS (a hub or index page) that has
// no text field and no Save button reports "not applicable" instead of FAIL. A route listed in
// EDITORS is always applicable, so a slow or broken editor still fails.
type Applicability = { applicable: true } | { applicable: false; reason: string };
let applicability: Promise<Applicability> | undefined;
function editableRoute(browser: Browser): Promise<Applicability> {
  applicability ??= (async (): Promise<Applicability> => {
    if (editorFor(ROUTE)) return { applicable: true };
    const context = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 900 } });
    try {
      const page = await context.newPage();
      await page.goto(HEAD + ROUTE);
      await expect(page.locator("h1").first()).toBeVisible({ timeout: LOAD_MS });
      try { // a text field on the page, or a kit Edit control that opens the fields in a dialog
        await Promise.any([genericField(page).waitFor({ state: "visible", timeout: 15_000 }), kitEditLocator(page).waitFor({ state: "visible", timeout: 15_000 })]);
        return { applicable: true };
      } catch { /* no field: look for a Save button below */ }
      if (await saveLocator(page).count()) return { applicable: true }; // a Save button without a field is a broken editor: let the gates fail it
      return { applicable: false, reason: `${ROUTE} has no editable field and no Save button` };
    } finally { await context.close(); }
  })();
  return applicability;
}

// ---------------------------------------------------------------------------------------------
// Kit editors (PreviewCards / SectionCards + EditorDialog): no text field on the page. The fields
// live in a dialog opened by an Edit control marked data-kit-edit (editor-kit/kitEdit.ts). openEditor
// takes that path whenever such a control is visible in main, whatever the row says; otherwise the
// row's own open/field/beforeSave run exactly as before. The dialog covers the page, so a test that
// edits then clicks Save closes it with commitKit and reopens it with revealKit when it needs the field again.
const kitEditLocator = (page: Page) => page.locator(`main ${KIT_EDIT_SELECTOR}`).filter({ visible: true }).first();
const kitDialog = (page: Page) => page.locator(KIT_DIALOG_SELECTOR);
// Where the field lives: `index` is its position among ALL text fields of the section's panel (enabled or not),
// `section` the dialog section to switch to first (null: the section the clicked part opened).
type KitState = { kit: boolean; index: number; section: number | null; clsBeforeOpen?: number; ownDialog?: Editor };
const kitState = new WeakMap<Page, KitState>();
const pinned = (page: Page) => page.locator("[data-rcv-field]");
const panelOf = (page: Page) => kitDialog(page).locator("[data-editor-dialog-panel]");
const enabledFields = (page: Page) => panelOf(page).locator(KIT_ENABLED_FIELD_SELECTOR).filter({ visible: true });
const sectionButtons = (page: Page) => kitDialog(page).locator("[data-editor-dialog-sections] button");

async function waitForPanel(page: Page) {
  const dialog = kitDialog(page);
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(panelOf(page)).toBeVisible({ timeout: 30_000 });
  await expect(dialog.locator("[aria-busy=true]")).toHaveCount(0, { timeout: 30_000 });
}
/** Show section `index` of the dialog. Desktop: the section nav is always there. Phone sheet: Back to the Sections list first. */
async function gotoSection(page: Page, index: number) {
  const dialog = kitDialog(page);
  const back = dialog.locator("[data-editor-dialog-back]");
  if (await back.count() && await back.first().isVisible()) await back.first().click(); // inside a section the list is hidden: Back shows it
  await sectionButtons(page).nth(index).click();
  await waitForPanel(page);
}
// Position (among the enabled fields) of the first one the test may append to: never a URL, email, phone, slug or path field.
async function markableIndex(page: Page) {
  return firstMarkableIndex(await enabledFields(page).evaluateAll((els) => els.map((el) => {
    const input = el as HTMLInputElement;
    const named = (id: string) => id.split(/\s+/).map((part) => document.getElementById(part)?.textContent ?? "").join(" ");
    // The accessible name, however the kit wired it: aria-label, a <label>, aria-labelledby, a wrapping label, or the text just before the field.
    const label = input.getAttribute("aria-label") || input.labels?.[0]?.textContent || named(input.getAttribute("aria-labelledby") ?? "") || input.closest("label")?.textContent || input.previousElementSibling?.textContent || input.parentElement?.previousElementSibling?.textContent || "";
    return { value: input.value, label: label.trim() };
  })));
}
async function hasEnabledField(page: Page, wait: number) {
  try { await expect.poll(() => markableIndex(page), { timeout: wait }).toBeGreaterThanOrEqual(0); return true; } catch { return false; }
}
async function pinFirstEnabled(page: Page) {
  const pick = await markableIndex(page);
  const found = enabledFields(page).nth(pick);
  await expect(found).toBeEditable();
  console.log(`kit field: #${pick} "${await found.evaluate((el) => (el as HTMLInputElement).labels?.[0]?.textContent ?? el.getAttribute("aria-label") ?? "")}"`);
  const index = await found.evaluate((el, selector) => Array.from(el.closest("[data-editor-dialog-panel]")!.querySelectorAll(selector)).indexOf(el), KIT_ANY_FIELD_SELECTOR);
  await page.evaluate(() => document.querySelectorAll("[data-rcv-field]").forEach((el) => el.removeAttribute("data-rcv-field")));
  await found.evaluate((element) => element.setAttribute("data-rcv-field", ""));
  return index;
}
/**
 * The first editable text field a kit dialog has. The section the clicked part opened is tried first; a part with no
 * text field (an image, a crop, switches) moves on through the dialog's own section list, top to bottom. A hidden,
 * disabled or read-only field never counts, and neither does a switch or a slider.
 */
async function findKitField(page: Page): Promise<{ index: number; section: number | null }> {
  await waitForPanel(page);
  if (await hasEnabledField(page, 3_000)) return { index: await pinFirstEnabled(page), section: null };
  const phone = await kitDialog(page).locator("[data-editor-dialog-back]").count() > 0;
  if (phone) await kitDialog(page).locator("[data-editor-dialog-back]").click();
  const count = await sectionButtons(page).count();
  const active = phone ? -1 : await sectionButtons(page).evaluateAll((els) => els.findIndex((el) => el.getAttribute("aria-current") === "true"));
  for (const index of sectionTryOrder(count, active)) {
    // Every step goes through gotoSection: after a section with no text field (an image-only Club logo) the phone sheet is still inside
    // that section with the list hidden, so Back must be pressed again before the next section button can be clicked.
    await gotoSection(page, index);
    if (await hasEnabledField(page, 1_000)) return { index: await pinFirstEnabled(page), section: index };
  }
  throw new Error(`no section of the editor dialog has an enabled text field (${count} sections)`);
}
/** Reopen the kit dialog (first Edit control) if it is closed, go to the section the field lives in, and pin the same field again. No-op off the kit path. */
async function revealKit(page: Page) {
  const state = kitState.get(page);
  if (state?.ownDialog?.reopenDialog) { await state.ownDialog.reopenDialog(page); return; }
  if (!state?.kit) return;
  if (await kitDialog(page).count() === 0) {
    await kitEditLocator(page).click();
    await waitForPanel(page);
    if (state.section !== null) await gotoSection(page, state.section);
  }
  const found = panelOf(page).locator(KIT_ANY_FIELD_SELECTOR).nth(state.index); // may be disabled: a locked form keeps its fields
  await expect(found).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => document.querySelectorAll("[data-rcv-field]").forEach((el) => el.removeAttribute("data-rcv-field")));
  await found.evaluate((element) => element.setAttribute("data-rcv-field", ""));
}
/** Close the kit dialog with Done (the phone sheet's Done is the same control) so Save and Discard are reachable. Returns false off the kit path. */
async function commitKit(page: Page) {
  const own = kitState.get(page)?.ownDialog;
  if (own?.closeDialog) { await own.closeDialog(page); return true; }
  if (!kitState.get(page)?.kit) return false;
  const dialog = kitDialog(page);
  if (await dialog.count()) {
    await dialog.locator(KIT_DONE_SELECTOR).filter({ visible: true }).first().click();
    await expect(dialog).toHaveCount(0, { timeout: 10_000 });
  }
  return true;
}
// Lists and tables from the kit's fields (StringListField, ObjectListField, TableEditor). When the field we edit is an
// item or a cell of one, editing it must not add or remove items; the Add and Remove buttons must agree with the limit line.
async function listState(field: Locator) {
  return field.evaluate((el, selector) => {
    const box = el.closest(selector);
    if (!box) return null;
    const buttons = Array.from(box.querySelectorAll("button"));
    const removes = buttons.filter((b) => /^Remove /.test(b.getAttribute("aria-label") ?? ""));
    const add = buttons.find((b) => /^Add /.test(b.textContent?.trim() ?? ""));
    return {
      items: removes.length,
      addDisabled: Boolean(add?.disabled),
      limit: document.getElementById(box.getAttribute("aria-describedby") ?? "")?.textContent ?? "",
      removeDisabled: removes.map((b) => b.disabled),
    };
  }, KIT_LIST_SELECTOR);
}
// Is the phone Save button on top at its own centre? The page behind a modal is inert and not hit-testable, so inert is lifted for the
// instant of the probe (and put back), which asks "what is painted there", not "what takes clicks".
async function saveBarProbe(page: Page) {
  return page.evaluate(() => {
    const button = document.querySelector<HTMLElement>("[data-page-save-button]");
    if (!button) return { visible: false, topIsBar: false };
    const rect = button.getBoundingClientRect();
    const visible = rect.width > 0 && rect.height > 0 && getComputedStyle(button).visibility !== "hidden";
    const lifted = Array.from(document.querySelectorAll<HTMLElement>("[inert]")).filter((el) => el.inert);
    lifted.forEach((el) => { el.inert = false; });
    const top = visible ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) : null;
    lifted.forEach((el) => { el.inert = true; });
    return { visible, topIsBar: Boolean(top && button.contains(top)) };
  });
}
// Which way this page opens: a kit Edit control, or the row's own path. A row with no `open` races
// the control against its text field; a row with an `open` gives the control KIT_WAIT_MS first.
async function detectOpenPath(page: Page, editor: Editor) {
  const timeout = editor.open ? KIT_WAIT_MS : 30_000;
  const kit = kitEditLocator(page).waitFor({ state: "visible", timeout }).then(() => "kit" as const, () => "none" as const);
  const row = editor.open
    ? new Promise<"row">((done) => setTimeout(() => done("row"), timeout))
    : (editor.field ?? genericField)(page).waitFor({ state: "visible", timeout }).then(() => "row" as const, () => "none" as const);
  const winner = await Promise.race([kit, row]);
  // Both can be on screen in the same frame: the kit control wins, because its fields are not on the page.
  return chooseOpenPath(winner === "row" && await kitEditLocator(page).isVisible() ? "kit" : winner);
}

// Does origin/main's page offer anything to open (a kit Edit control, or the row's text field)? Short wait, on a throwaway page.
async function baseOpensEditor(context: BrowserContext, editor: Editor) {
  const page = await context.newPage();
  try {
    await page.goto(BASE + editor.route);
    await expect(page.locator("h1").first()).toBeVisible({ timeout: LOAD_MS });
    const kit = kitEditLocator(page).waitFor({ state: "visible", timeout: 8_000 }).then(() => true, () => false);
    const row = (editor.field ?? genericField)(page).waitFor({ state: "visible", timeout: 8_000 }).then(() => true, () => false);
    return await new Promise<boolean>((done) => {
      void kit.then((found) => found && done(true));
      void row.then((found) => found && done(true));
      void Promise.all([kit, row]).then(() => done(false));
    });
  } finally { await page.close(); }
}

// `settle`: on the kit path, let the page sit 1.5 s and read the layout shift BEFORE the dialog opens (kitState.clsBeforeOpen).
// Opening a modal locks page scroll, which can drop the scrollbar and move the page behind it; that is the dialog's, not the page load's.
async function openEditor(page: Page, base: string, editor: Editor, options: { settle?: boolean } = {}) {
  await page.goto(base + editor.route);
  await expect(page.locator("h1").first()).toBeVisible({ timeout: LOAD_MS });
  const path = await detectOpenPath(page, editor);
  kitState.set(page, { kit: path === "kit", index: -1, section: null, ownDialog: path === "kit" || !editor.closeDialog ? undefined : editor });
  if (path === "kit") {
    if (options.settle) {
      await page.waitForTimeout(1_500);
      kitState.get(page)!.clsBeforeOpen = await page.evaluate(() => (window as unknown as { __cls?: number }).__cls);
    }
    await kitEditLocator(page).click();
    const where = await findKitField(page);
    Object.assign(kitState.get(page)!, where);
    return pinned(page);
  }
  if (editor.open) await editor.open(page);
  const found = (editor.field ?? genericField)(page);
  await expect(found).toBeVisible({ timeout: 30_000 });
  await expect(found).toBeEditable();
  // Pin the element: the generic selector skips disabled fields, so it would jump to another
  // field while a save locks the form.
  await found.evaluate((element) => element.setAttribute("data-rcv-field", ""));
  return pinned(page);
}

// Deterministic edit: append a marker, trimming first if the field would overflow maxlength.
async function mark(field: Locator, marker: string) {
  if (await field.evaluate((el) => (el as HTMLInputElement).type === "number")) { // a stat: bump it by one instead of appending text
    const next = String(Number(await field.inputValue()) + 1);
    await field.fill(next);
    return next;
  }
  if (await field.evaluate((el) => (el as HTMLInputElement).type === "url")) { // a web address: change its query, or give an empty one a value
    const url = await field.inputValue();
    const next = url ? `${url.replace(/[?&]rcv=\w+$/, "")}${url.includes("?") ? "&" : "?"}rcv=${marker}` : `https://example.com/${marker}`;
    await field.fill(next);
    return next;
  }
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
    const mutating = isMutating({ method: request.method(), pathname: url.pathname, body: request.postData() ?? "" });
    const ours = url.pathname.startsWith("/api/") || (url.port === "54321" && /^\/(rest|storage)\//.test(url.pathname));
    if (armed && mutating && ours) {
      const body = request.postData() ?? "";
      requests.push({ method: request.method(), path: url.pathname + url.search, contentType: request.headers()["content-type"] ?? "", body, sha256: createHash("sha256").update(body).digest("hex") });
      return route.abort("failed"); // never reaches the database: both builds see the same state
    }
    return route.continue();
  });
  try {
    if (editor.act) {
      await page.goto(base + editor.route);
      await expect(page.locator("h1").first()).toBeVisible({ timeout: LOAD_MS });
      armed = true;
      await editor.act(page);
    } else {
      const field = await openEditor(page, base, editor);
      await mark(field, "rcv");
      if (!(await commitKit(page))) await editor.beforeSave?.(page);
      armed = true;
      await saveButton(page, editor).click();
    }
    await expect.poll(() => requests.some((r) => isEditorSave(editor, { method: r.method, pathname: new URL(r.path, base).pathname, body: r.body })), { timeout: 15_000 }).toBe(true);
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
    // An editor that declares it has no page Save button (EDITORS `lacks.pageSave`): the save states have nothing to act on. Only gate 3 is
    // not applicable for it; gate 4's visuals (CLS, overflow, axe, reduced motion at load) still run on its page.
    const declaredPlan = gate3Plan(editor);
    if (!declaredPlan.applicable) {
      record("save-behaviour", { gate: 3, route: ROUTE, applicable: false, reason: declaredPlan.reason, steps: {} });
      test.info().annotations.push({ type: "not applicable", description: declaredPlan.reason! });
      return;
    }
    const probe = await editableRoute(browser);
    if (!probe.applicable) {
      record("save-behaviour", { gate: 3, route: ROUTE, applicable: false, reason: probe.reason, steps: {} });
      test.info().annotations.push({ type: "not applicable", description: probe.reason });
      return;
    }
    const steps: Record<string, string> = {};
    // The plan is read when each step starts: `kind` (old AdminSaveButton or the kit's PageSaveButton) is only known once the "clean" step has looked at the page.
    const planNow = () => gate3Plan(editor, kind);
    const step = async (name: string, body: () => Promise<void>) => {
      const skip = planNow().skipped[name];
      if (skip) { steps[name] = `n/a: ${skip}`; return; } // declared in EDITORS `lacks` / `lacksOnAdminButton`, optional steps only
      try { await body(); steps[name] = "pass"; } catch (error) { steps[name] = `FAIL: ${String(error).split("\n").slice(0, 3).join(" ")}`; }
    };
    const context = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const button = saveLocator(page);
    let kind: SaveKind = "admin";
    const isSave = (r: Request) => saveOf(editor, r);
    let field!: Locator;
    let saved = "";

    await step("clean", async () => {
      field = await openEditor(page, HEAD, editor);
      saved = await field.inputValue();
      kind = await saveKind(button);
      await expect(button).toHaveAttribute("data-state", "clean");
      await expect(button).toHaveAttribute("aria-disabled", "true");
      if (kind === "page") await expect(button).toHaveText("Save");
      await forbiddenCopy(page);
    });
    let listBefore: Awaited<ReturnType<typeof listState>> = null;
    await step("dirty", async () => {
      await revealKit(page);
      listBefore = kitState.get(page)?.kit ? await listState(field) : null;
      await mark(field, "d1");
      await expect(button).toHaveAttribute("data-state", "dirty");
      if (kind === "admin" && !planNow().noStatus) await expect(page.locator("[data-cinematic-save-bar] [role=status], [data-admin-save-status]").first()).toHaveText("Unsaved changes");
      else if (kind === "admin") await expect(button).toHaveAttribute("aria-disabled", "false"); // declared in EDITORS lacks.status: the text line is not checked
      else { // PageSaveButton has no status line: it is the enabled "Save" button
        await expect(button).toHaveAttribute("aria-disabled", "false");
        await expect(button).toHaveText("Save");
      }
    });
    if (listBefore) await step("list", async () => {
      const problems = listProblems(listBefore!, { items: (await listState(field))!.items });
      expect(problems, "list field limits").toEqual([]);
    });
    await step("saving", async () => {
      await routeSave(page, editor, async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); }, { times: 1 });
      await commitKit(page);
      await button.click();
      await expect(button).toHaveAttribute("data-state", "saving");
      await expect(button).toHaveAttribute("aria-busy", "true");
    });
    await step("saved", async () => {
      await expect(button).toHaveAttribute("data-state", "saved", { timeout: 20_000 });
      await expect(button.locator(SAVE_CHECK)).toBeVisible();
      // The colour fades in over 220 ms and the button pops for 320 ms: wait until every animation and transition on it has
      // finished, then read the settled colour once. Sampling at the moment data-state flips caught rgb(52, 199, 90) mid-fade.
      const settledSave = await button.evaluate(async (el) => {
        // A finished animation with fill-mode "both" (the check mark's draw) stays listed forever: only unfinished ones count.
        const finite = () => el.getAnimations({ subtree: true }).filter((a) => a.playState !== "finished" && a.playState !== "idle" && a.effect?.getComputedTiming().iterations !== Infinity);
        for (let round = 0; round < 10 && finite().length; round++) await Promise.allSettled(finite().map((a) => a.finished));
        return { state: el.getAttribute("data-state"), colour: getComputedStyle(el).backgroundColor, running: finite().length };
      });
      const savedProblems = savedColourProblems(settledSave, SAVED_GREENS);
      if (savedProblems.length) throw new Error(savedProblems.join("; "));
      await page.screenshot({ path: join(OUT, "screenshots", "save-saved.png") });
      await forbiddenCopy(page);
      await expect(button).toHaveAttribute("data-state", "clean", { timeout: 5_000 });
      await revealKit(page);
      saved = await field.inputValue();
    });
    await step("retry", async () => {
      await revealKit(page);
      await mark(field, "r1");
      let lost = "";
      await routeSave(page, editor, (route) => { lost = route.request().postData() ?? ""; return route.abort("failed"); }, { times: 1 });
      await page.route((url) => editor.save.test(url.pathname) && url.searchParams.has("operationId"), (route) => route.abort("failed"));
      await commitKit(page);
      await button.click();
      const retry = page.getByRole("button", { name: /^Retry( the)? same save$/ }).filter({ visible: true }).first();
      await expect(retry).toBeVisible();
      if (kind === "page") await expect(button).toHaveAttribute("data-state", "retry");
      // The form must be locked while the save is pending. Old UI: the field on the page is disabled.
      // Kit: the dialog is closed, so every Edit control must be disabled, or the reopened dialog's field is.
      const edits = page.locator(`main ${KIT_EDIT_SELECTOR}`).filter({ visible: true });
      const lock = retryLockCheck(kitState.get(page)?.kit ? "kit" : "row", {
        editControls: await edits.count(),
        editControlsDisabled: await edits.evaluateAll((els) => els.filter((el) => (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true").length),
      });
      if (lock === "reopen-dialog-field") await revealKit(page);
      if (lock !== "edit-controls") await expect(field).toBeDisabled();
      await page.waitForTimeout(400); // a reopened kit dialog finishes fading in
      await page.screenshot({ path: join(OUT, "screenshots", "save-retry.png") });
      await commitKit(page);
      await page.unrouteAll({ behavior: "wait" });
      const resent = page.waitForRequest(isSave);
      await retry.click();
      expect((await resent).postData(), "retry must resend the identical request (same operationId)").toBe(lost);
      await expect(button).toHaveAttribute("data-state", "saved", { timeout: 20_000 });
      await expect(button).toHaveAttribute("data-state", "clean", { timeout: 5_000 });
      await revealKit(page);
      saved = await field.inputValue();
    });
    await step("conflict", async () => {
      // A real conflict: another signed-in session saves first, so this page's revision is stale.
      const other = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 900 } });
      try {
        const otherPage = await other.newPage();
        const otherField = await openEditor(otherPage, HEAD, editor);
        await mark(otherField, "c2");
        await commitKit(otherPage);
        await saveLocator(otherPage).click();
        await expect(saveLocator(otherPage)).toHaveAttribute("data-state", "saved", { timeout: 20_000 });
      } finally { await other.close(); }
      await revealKit(page);
      const mine = await mark(field, "c1");
      await commitKit(page);
      await button.click();
      await expect(page.getByRole("alert").first()).toBeVisible({ timeout: 20_000 });
      const keep = page.getByRole("button", { name: "Load latest and keep my edits" });
      await expect(keep).toBeVisible();
      if (kind === "page") await expect(button).toHaveAttribute("data-state", "conflict");
      await page.screenshot({ path: join(OUT, "screenshots", "save-conflict.png") });
      await keep.click();
      await revealKit(page);
      await expect(field).toHaveValue(mine);
      await expect(button).toHaveAttribute("data-state", "dirty");
      await commitKit(page);
      await button.click();
      await expect(button).toHaveAttribute("data-state", "saved", { timeout: 20_000 });
      await expect(button).toHaveAttribute("data-state", "clean", { timeout: 5_000 });
      await revealKit(page);
      saved = await field.inputValue();
    });
    await step("discard", async () => {
      await revealKit(page);
      await mark(field, "x1");
      await expect(button).toHaveAttribute("data-state", "dirty");
      await commitKit(page);
      await discardTrigger(page).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: DISCARD_CONFIRM }).click();
      await revealKit(page);
      await expect(field).toHaveValue(saved);
      await expect(button).toHaveAttribute("data-state", "clean");
    });
    // Only /admin/sponsors: the new website field has no row in the first-text-field walk above (the first field is the name),
    // so one save types a website into the first sponsor's "Their website (optional)", saves, reloads and checks it persisted.
    // It then clears the website again so later gates see the seeded page.
    if (ROUTE === "/admin/sponsors") {
      await step("website", async () => {
        const websiteField = () => page.getByLabel("Their website (optional)").first();
        const openFirst = async () => {
          await page.goto(HEAD + ROUTE);
          await expect(page.locator("h1").first()).toBeVisible({ timeout: LOAD_MS });
          await kitEditLocator(page).click();
          await expect(websiteField()).toBeVisible({ timeout: 15_000 });
        };
        const saveWith = async (value: string) => {
          await websiteField().fill(value);
          await page.locator("[data-editor-dialog-done]").filter({ visible: true }).first().click();
          await expect(button).toHaveAttribute("data-state", "dirty");
          await button.click();
          await expect(button).toHaveAttribute("data-state", "saved", { timeout: 20_000 });
        };
        await openFirst();
        await saveWith("rcv-gate3.example.com");
        await openFirst(); // a fresh load: the stored value, normalized with https://, must come back
        await expect(websiteField()).toHaveValue("https://rcv-gate3.example.com");
        await saveWith("");
      });
    }
    await context.close();
    record("save-behaviour", { gate: 3, route: ROUTE, applicable: true, saveButton: kind, steps });
    for (const [name, outcome] of Object.entries(steps)) expect.soft(stepsPass({ [name]: outcome }), `save behaviour: ${name} (${outcome})`).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// Gate 4: visual, layout shift, reduced motion, accessibility (package build).
async function trackShift(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number; __shifts: { value: number; at: number; nodes: string[] }[] };
    w.__cls = 0;
    w.__shifts = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean; startTime: number; sources?: { node?: Element }[] }[]) {
        if (entry.hadRecentInput) continue;
        w.__cls += entry.value;
        // Which elements moved, so a shift can be handed to the right owner.
        const name = (el?: Element) => (el ? `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""}` : "?");
        w.__shifts.push({ value: Math.round(entry.value * 1e5) / 1e5, at: Math.round(entry.startTime), nodes: (entry.sources ?? []).slice(0, 4).map((source) => name(source.node)) });
      }
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

// Phone (390px): PageFrame moves its Save button into a fixed bottom bar. It must stay fully on
// screen and must not cover the end of the page content. A route that still uses AdminSaveButton
// has no bar to check.
type SaveBar = { kind: SaveKind; problems: string[]; fixed?: boolean; button?: { top: number; bottom: number }; contentBottom?: number; barTop?: number };
async function checkSaveBar(page: Page): Promise<SaveBar> {
  const kind = await saveKind(saveLocator(page));
  if (kind === "admin") return { kind, problems: [] };
  const found = await page.evaluate(() => {
    const button = document.querySelector("[data-page-save-button]") as HTMLElement;
    const group = button.closest("[data-page-frame-save]") as HTMLElement | null;
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
    const rect = button.getBoundingClientRect();
    const bar = group?.getBoundingClientRect();
    const content = document.querySelector("[data-page-frame]")?.lastElementChild as HTMLElement | null;
    const last = (content?.lastElementChild ?? content) as HTMLElement | null;
    const contentBottom = last ? last.getBoundingClientRect().bottom : undefined;
    const fixed = !!group && getComputedStyle(group).position === "fixed";
    const result = { fixed, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, vh: window.innerHeight, vw: window.innerWidth, barTop: bar?.top, contentBottom };
    window.scrollTo({ top: 0, behavior: "instant" });
    return result;
  });
  const problems: string[] = [];
  if (!found.fixed) problems.push("Save is not in a fixed bottom bar under 768px");
  if (found.top < 0 || found.bottom > found.vh + 0.5 || found.left < 0 || found.right > found.vw + 0.5) problems.push(`Save is not fully on screen (top ${found.top}, bottom ${found.bottom}, viewport ${found.vw}x${found.vh})`);
  if (found.barTop !== undefined && found.contentBottom !== undefined && found.contentBottom > found.barTop + 0.5) problems.push(`the bar covers the end of the page (content ends ${found.contentBottom}, bar starts ${found.barTop})`);
  return { kind, problems, fixed: found.fixed, button: { top: found.top, bottom: found.bottom }, contentBottom: found.contentBottom, barTop: found.barTop };
}

test.describe("gate 4: visual", () => {
  const editor = editorFor(ROUTE) ?? { key: ROUTE.replace(/\W+/g, "-"), route: ROUTE, save: /\/api\/admin\// };
  for (const width of [390, 1440]) for (const scheme of ["light", "dark"] as const) {
    test(`visual ${width} ${scheme}`, async ({ browser }) => {
      const context = await browser.newContext({ storageState: STORAGE, viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: scheme });
      const page = await context.newPage();
      await trackShift(page);
      const slug = `${editor.key}-${width}-${scheme}`;
      const probe = await editableRoute(browser);
      if (!probe.applicable) {
        await page.goto(HEAD + ROUTE);
        await expect(page.locator("h1").first()).toBeVisible({ timeout: LOAD_MS });
        await page.waitForTimeout(1_500);
        await page.screenshot({ path: join(OUT, "screenshots", `${slug}.png`), fullPage: true });
        // Informational, never a verdict on a not-applicable route: layout shift of the page and of origin/main's copy of it
        // (the shell top bar moving when a framed page registers its frame shows up here).
        const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
        const basePage = await context.newPage();
        await trackShift(basePage);
        await basePage.goto(BASE + ROUTE);
        await expect(basePage.locator("h1").first()).toBeVisible({ timeout: LOAD_MS });
        await basePage.waitForTimeout(1_500);
        const baseCls = await basePage.evaluate(() => (window as unknown as { __cls: number }).__cls);
        await context.close();
        record(`visual-${slug}`, { gate: 4, width, scheme, applicable: false, reason: probe.reason, cls, baseCls });
        test.info().annotations.push({ type: "not applicable", description: probe.reason });
        return;
      }
      if (editor.lacks?.pageSave) {
        // No page Save to edit through (declared): the visual checks that do not need one still run on the page as it loads. CLS from load,
        // sideways scroll, axe on main with the usual ratchet against origin/main. No edit, no Save bar, no discard dialog.
        await page.goto(HEAD + ROUTE);
        await expect(page.locator("h1").first()).toBeVisible({ timeout: LOAD_MS });
        await page.waitForTimeout(1_500); // editors keep polling, so networkidle never settles
        await page.screenshot({ path: join(OUT, "screenshots", `${slug}.png`), fullPage: true });
        const noSaveCls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
        const noSaveShifts = await page.evaluate(() => (window as unknown as { __shifts: unknown[] }).__shifts);
        const noSaveOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        const headForm = await axe(page, ["main"]);
        const basePage = await context.newPage();
        await basePage.goto(BASE + ROUTE);
        await expect(basePage.locator("h1").first()).toBeVisible({ timeout: LOAD_MS });
        await basePage.waitForTimeout(1_500);
        const baseForm = await axe(basePage, ["main"]);
        await context.close();
        const newForm = fresh(headForm, baseForm);
        record(`visual-${slug}`, { gate: 4, width, scheme, applicable: true, baseline: "origin/main", saveParts: `n/a: ${editor.lacks.pageSave}`, saveBar: undefined, cls: noSaveCls, clsAfterOpen: noSaveCls, shifts: noSaveShifts, overflow: noSaveOverflow, formViolations: headForm, dialogViolations: [], kitDialogViolations: [], sheetProblems: [], newFormViolations: newForm, newDialogViolations: [] });
        expect.soft(noSaveCls, "layout shift on load (CLS)").toBeLessThan(CLS_LIMIT);
        expect.soft(noSaveOverflow, "page scrolls sideways").toBeLessThanOrEqual(1);
        expect.soft(newForm, "axe violations on the page that origin/main does not have").toEqual([]);
        return;
      }
      const field = await openEditor(page, HEAD, editor, { settle: true });
      await page.waitForTimeout(1_500); // editors keep polling, so networkidle never settles
      const clsAfterOpen = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
      const shifts = await page.evaluate(() => (window as unknown as { __shifts: unknown[] }).__shifts);
      const cls = kitState.get(page)?.clsBeforeOpen ?? clsAfterOpen; // kit: the shift of the page load, before the dialog's scroll lock
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      // Kit editor: the fields are in the dialog. Record it open (screenshot, axe), then close it so the page itself is what gets checked.
      let kitDialogViolations: AxeViolation[] = [];
      const sheetProblems: string[] = [];
      if (kitState.get(page)?.ownDialog && await page.getByRole("dialog").count()) { // the editor's own dialog (Rose City's Stats): scan it open, informational, then close it
        await page.screenshot({ path: join(OUT, "screenshots", `${slug}-edit-dialog.png`) });
        kitDialogViolations = await axe(page, ["[role=dialog]"]);
        await commitKit(page);
        await page.waitForTimeout(300);
      }
      if (kitState.get(page)?.kit) {
        await page.screenshot({ path: join(OUT, "screenshots", `${slug}-edit-dialog.png`) });
        kitDialogViolations = await axe(page, ["[role=dialog]"]);
        if (isPhoneWidth(width)) { // the full-screen sheet: it opened straight into a section; Back shows the Sections list; the Save bar steps aside
          await page.screenshot({ path: join(OUT, "screenshots", `${slug}-sheet-section.png`) });
          const open = await saveBarProbe(page);
          const back = kitDialog(page).locator("[data-editor-dialog-back]");
          if (await back.count()) {
            await back.click();
            await expect(kitDialog(page).locator("[data-editor-dialog-sections]")).toBeVisible();
            await page.waitForTimeout(300);
            await page.screenshot({ path: join(OUT, "screenshots", `${slug}-sheet-list.png`) });
          } else sheetProblems.push("the phone sheet has no Back to the Sections list");
          await commitKit(page);
          await page.waitForTimeout(300);
          const closed = await saveBarProbe(page);
          sheetProblems.push(...sheetBarProblems({ openTopIsBar: open.topIsBar, closedBarVisible: closed.visible, closedTopIsBar: closed.topIsBar }));
        } else {
          await commitKit(page);
          await page.waitForTimeout(300);
        }
      }
      await page.screenshot({ path: join(OUT, "screenshots", `${slug}.png`), fullPage: true });
      const formViolations = await axe(page, ["main"]);
      const saveBar = width === 390 ? await checkSaveBar(page) : undefined;
      await revealKit(page);
      await mark(field, "v1");
      await commitKit(page);
      // An editor that declares it has no discard control (EDITORS `lacks.discard`, e.g. Stats) has no discard dialog to scan.
      let dialogViolations: AxeViolation[] = [];
      const noDiscard = await lacksDiscard(page, editor);
      if (!noDiscard) {
        await discardTrigger(page).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(OUT, "screenshots", `${slug}-dialog.png`) });
        dialogViolations = await axe(page, ["[role=dialog]"]);
        await dialog.getByRole("button", { name: DISCARD_CONFIRM }).click();
        // Discarding must really discard, at this width (the phone's bottom-bar Discard included): clean again, edit gone.
        await expect(saveLocator(page)).toHaveAttribute("data-state", "clean");
        await revealKit(page);
        await expect(field).not.toHaveValue(/ ·v1$/);
        await commitKit(page);
      }
      // Same checks on origin/main: only violations main does not have fail (a ratchet); the
      // rest are reported as existing debt.
      // origin/main's page may have no editable field and no kit control at all (the old Schedule opens its editor from a side panel
      // after Add match): there is then nothing to open and no baseline, so every violation in the package's page and dialog counts as new.
      // Only a route with no `open` step is probed; a route that needs one keeps the old path untouched. Never loosens anything.
      let baseForm: AxeViolation[] = [], baseDialog: AxeViolation[] = [], baseline = "origin/main";
      if (!editor.open && !(await baseOpensEditor(context, editor))) {
        baseline = "none (origin/main's page has no editor to open)";
      } else {
        const basePage = await context.newPage();
        const baseField = await openEditor(basePage, BASE, editor);
        await basePage.waitForTimeout(1_500);
        await commitKit(basePage); // origin/main may already be a kit page: scan its page, not the dialog over it
        baseForm = await axe(basePage, ["main"]);
        await revealKit(basePage);
        await mark(baseField, "v1");
        await commitKit(basePage);
        // An older editor on origin/main may have no discard control at all (the old Shop): then there is no baseline dialog, so every
        // violation in the package's discard dialog counts as new.
        if (await discardTrigger(basePage).waitFor({ state: "visible", timeout: 3_000 }).then(() => true, () => false)) {
          await discardTrigger(basePage).click();
          await expect(basePage.getByRole("dialog")).toBeVisible();
          await basePage.waitForTimeout(400);
          baseDialog = await axe(basePage, ["[role=dialog]"]);
          await basePage.getByRole("dialog").getByRole("button", { name: DISCARD_CONFIRM }).click();
        }
      }
      await context.close();
      const newForm = fresh(formViolations, baseForm);
      const newDialog = fresh(dialogViolations, baseDialog);
      record(`visual-${slug}`, { gate: 4, width, scheme, applicable: true, baseline, saveBar, cls, clsAfterOpen, shifts, overflow, formViolations, dialogViolations, kitDialogViolations, sheetProblems, newFormViolations: newForm, newDialogViolations: newDialog });
      expect.soft(cls, "layout shift on load (CLS)").toBeLessThan(CLS_LIMIT);
      expect.soft(overflow, "page scrolls sideways").toBeLessThanOrEqual(1);
      if (saveBar) expect.soft(saveBar.problems, "phone Save bar").toEqual([]);
      expect.soft(sheetProblems, "phone edit sheet and Save bar").toEqual([]);
      expect.soft(newForm, "axe violations in the editor form that origin/main does not have").toEqual([]);
      expect.soft(newDialog, "axe violations in the discard dialog that origin/main does not have").toEqual([]);
    });
  }
  test("reduced motion", async ({ browser }) => {
    if (editor.lacks?.pageSave) { // no edit or save to sample: the page's own load is what can still move
      const quiet = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
      const loaded = await quiet.newPage();
      await loaded.goto(HEAD + ROUTE);
      await expect(loaded.locator("h1").first()).toBeVisible({ timeout: LOAD_MS });
      await loaded.waitForTimeout(1_000);
      const samples = [{ moment: "load", moving: await movingAnimations(loaded) }];
      await quiet.close();
      record("reduced-motion", { gate: 4, applicable: true, saveParts: `n/a: ${editor.lacks.pageSave}`, samples });
      expect.soft(samples.filter((s) => s.moving.length), "movement while prefers-reduced-motion: reduce").toEqual([]);
      return;
    }
    const probe = await editableRoute(browser);
    if (!probe.applicable) {
      record("reduced-motion", { gate: 4, applicable: false, reason: probe.reason, samples: [] });
      test.info().annotations.push({ type: "not applicable", description: probe.reason });
      return;
    }
    const context = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const samples: { moment: string; moving: Awaited<ReturnType<typeof movingAnimations>> }[] = [];
    const field = await openEditor(page, HEAD, editor);
    if (kitState.get(page)?.kit) { // the kit dialog opening is the first thing that moves
      samples.push({ moment: "edit dialog opening", moving: await movingAnimations(page) });
      await commitKit(page);
      await page.waitForTimeout(60);
      samples.push({ moment: "edit dialog closing", moving: await movingAnimations(page) });
      await page.waitForTimeout(400);
    }
    samples.push({ moment: "load", moving: await movingAnimations(page) });
    await revealKit(page);
    await mark(field, "m1");
    if (await commitKit(page)) await page.waitForTimeout(400); // let the kit dialog finish closing before sampling the page
    samples.push({ moment: "dirty", moving: await movingAnimations(page) });
    if (!(await lacksDiscard(page, editor))) { // an editor that declares no discard control has no discard dialog to open and close
      await discardTrigger(page).click();
      await page.waitForTimeout(60);
      samples.push({ moment: "dialog opening", moving: await movingAnimations(page) });
      await page.getByRole("dialog").getByRole("button", { name: /^(Cancel|Keep editing)$/ }).click();
      await page.waitForTimeout(60);
      samples.push({ moment: "dialog closing", moving: await movingAnimations(page) });
    }
    await saveLocator(page).click();
    await page.waitForTimeout(60);
    samples.push({ moment: "saving", moving: await movingAnimations(page) });
    await expect(saveLocator(page)).toHaveAttribute("data-state", "saved", { timeout: 20_000 });
    samples.push({ moment: "saved", moving: await movingAnimations(page) });
    await context.close();
    const offenders = samples.filter((s) => s.moving.length);
    record("reduced-motion", { gate: 4, applicable: true, samples });
    expect.soft(offenders, "movement while prefers-reduced-motion: reduce").toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Gate 6: Diverse City's classic admin renders the same on both builds.
const DC_PAGES = ["/admin", "/admin/homepage", "/admin/programs", "/admin/contact", "/admin/shop", "/admin/about", "/admin/schedule", "/admin/sponsors",
  // Club settings and competition editors shared with Rose City (RC-ADMIN-4b-0): render identity on both builds.
  "/admin/roster", "/admin/seasons", "/admin/stats?view=match", "/admin/stats?view=season", "/admin/standings", "/admin/branding", "/admin/members"];
async function dcSnapshot(context: BrowserContext, base: string, path: string, shot?: string) {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && !isEnvironmentNoise(m.location().url)) errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  // Which request a console "Failed to load resource" was (the message has no URL), and which asset loads are still in flight.
  const failed: string[] = [];
  const inflight = new Set<Request>();
  const asset = (r: Request) => ["image", "font", "stylesheet", "script", "media"].includes(r.resourceType());
  // Also the editors' own loads through /api/admin/data (operation "select"): Stats compared with its Match select still disabled
  // because the matches had not arrived. Other XHR/fetch (polling) stays out of it, or a polling page would never settle.
  const dataRead = (r: Request) => isAdminDataRead({ method: r.method(), pathname: new URL(r.url()).pathname, body: r.postData() ?? "" });
  page.on("request", (r) => { if (asset(r) || dataRead(r)) inflight.add(r); });
  page.on("requestfinished", (r) => inflight.delete(r));
  page.on("requestfailed", (r) => inflight.delete(r));
  page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.request().method()} ${r.url().replace(/\?.*$/, "")}`); });
  const response = await page.goto(dcUrl(base) + path);
  // Compare a page only once it finished loading: document complete, no skeleton or aria-busy marker, no animation still playing,
  // and the main aria tree unchanged across consecutive reads. (A fixed sleep lost to a slow fetch: Contact and Shop were
  // compared while still loading.) Editors keep polling, so networkidle never settles.
  const settle = await waitUntilSettled(async () => {
    const seen = await page.evaluate(([busySelector, loadingText]) => ({
      ready: document.readyState === "complete",
      // Only markers that are showing count: Programs keeps its (hidden) skeleton in the DOM after it loaded.
      // Plus any live region whose text says "Loading ..." (About announces "Loading About page" in an sr-only status).
      busy: [...document.querySelectorAll(busySelector)].filter((el) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true })).length
        + [...document.querySelectorAll("[role=status]")].filter((el) => new RegExp(loadingText, "i").test(el.textContent ?? "")).length,
      running: document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getComputedTiming().iterations !== Infinity).length,
    }), [BUSY_SELECTOR, LOADING_TEXT.source] as const);
    // Asset loads (images, fonts, scripts, styles) still in flight count as loading too; XHR/fetch do not (editors poll).
    return { ...seen, busy: seen.busy + inflight.size, key: await page.locator("main").first().ariaSnapshot({ timeout: 2_000 }).catch((e) => `ERROR ${String(e).slice(0, 80)}`) };
  });
  const status = response?.status() ?? 0;
  const h1 = await page.locator("h1").first().textContent().catch(() => null);
  const aria = await page.locator("main").first().ariaSnapshot().catch((e) => `ERROR ${e}`);
  if (shot) await page.screenshot({ path: shot, fullPage: true });
  await page.close();
  return { status, h1, aria, errors, failed, settled: settle.settled, notSettled: settle.settled ? undefined : settle.why };
}
test("gate 6: Diverse City admin smoke", async ({ browser }) => {
  const context = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 900 } });
  const pages = [];
  for (const path of DC_PAGES) {
    const head = await dcSnapshot(context, HEAD, path, join(OUT, "screenshots", `diverse-city${path.replace(/[^a-z0-9]+/gi, "-")}.png`));
    const base = await dcSnapshot(context, BASE, path);
    const newErrors = head.errors.filter((e) => !base.errors.includes(e));
    pages.push({ path, status: head.status, h1: head.h1, errors: newErrors, failed: head.failed, baseFailed: base.failed, settled: head.settled && base.settled, notSettled: [head.notSettled && `package: ${head.notSettled}`, base.notSettled && `origin/main: ${base.notSettled}`].filter(Boolean).join("; ") || undefined, baseErrors: base.errors.length, sameAsMain: head.aria === base.aria, headAria: head.aria === base.aria ? undefined : head.aria, baseAria: head.aria === base.aria ? undefined : base.aria });
  }
  await context.close();
  record("diverse-city", { gate: 6, sharedFix: SHARED_FIX, pages });
  for (const p of pages) {
    expect.soft(p.settled, `${p.path} never finished loading (${p.notSettled})`).toBe(true);
    expect.soft(p.status, `${p.path} status`).toBeLessThan(400);
    expect.soft(p.h1, `${p.path} has a heading`).toBeTruthy();
    expect.soft(p.errors, `${p.path} console errors not present on origin/main`).toEqual([]);
    if (!SHARED_FIX) expect.soft(p.sameAsMain, `${p.path} accessibility tree differs from origin/main`).toBe(true);
  }
});
