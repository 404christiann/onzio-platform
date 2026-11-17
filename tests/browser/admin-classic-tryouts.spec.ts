import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";
import type { ViteDevServer } from "vite";
import { emptyTryoutDraft, tryoutDraftToRow } from "@/lib/tryout-admin";
import type { DBTryout } from "@/lib/db-types";
import type { TryoutsPageSaveRequest } from "@/lib/tryouts-page-editor/contract";

const repo = process.cwd();
const evidence = resolve(repo, process.env.CL22_EVIDENCE_DIR ?? ".codex-work/admin-cl-22/browser");
const first = "88888888-8888-4888-8888-888888888811";
const second = "88888888-8888-4888-8888-888888888812";
const createdId = "88888888-8888-4888-8888-888888888813";
const formId = "77777777-7777-4777-8777-777777777771";
let server: ViteDevServer | undefined;
let origin: string;
let png: Buffer;
test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
  png = await readFile(resolve(repo, "tests/fixtures/site-assignment/releases/a/badge.png"));
  const { createServer } = await import("vite");
  server = await createServer({
    root: repo, configFile: false, envDir: false, publicDir: false,
    cacheDir: resolve(evidence, "vite-cache"),
    define: {
      "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify("http://127.0.0.1:54321"),
      "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "inert-local-fixture"),
    },
    resolve: { alias: [{ find: "@", replacement: repo }] },
    oxc: { jsx: { runtime: "automatic" } },
    plugins: [{ name: "cl22-local-fixture", configureServer(vite) {
      vite.middlewares.use((request, _response, next) => {
        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        if (url.pathname === "/admin/cl22-fixture") request.url = "/tests/browser/fixtures/admin-cl-22/index.html" + url.search;
        next();
      });
    } }],
    server: { host: "127.0.0.1", port: 0, watch: { ignored: ["**/.codex-work/**", "**/test-results/**"] } },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Fixture server has no TCP address");
  origin = "http://127.0.0.1:" + address.port;
});
test.afterAll(async () => { await server?.close(); });

type Snapshot = { revision: string; page: Record<string, string>; events: DBTryout[]; registrationForms: Record<string, never> };
type Control = {
  snapshot: Snapshot; requests: TryoutsPageSaveRequest[]; cleanups: string[];
  media: string[]; unknownNext: boolean; conflictNext: boolean; rejectNext: boolean;
  loadDelay: number; releasePost?: () => void; holdPost: boolean;
  releaseUpload?: () => void; holdUpload: boolean; errors: string[]; expectedHttpErrors: number;
};
const controls = new WeakMap<Page, Control>();
function initial(empty = false): Snapshot {
  return { revision: "7", page: { intro_with_tryouts: "Saved intro", intro_no_tryouts: "Saved no events" },
    events: empty ? [] : [first, second].map((id, sortOrder) => ({
      ...tryoutDraftToRow({ ...emptyTryoutDraft(sortOrder), id, headline: sortOrder ? "Second event" : "First event",
        eyebrow: "Stored eyebrow", intro: "Stored introduction", eligibilityCopy: "Stored eligibility",
        whatToExpectCopy: "Stored expectations", preparationCopy: "Stored preparation",
        registrationHref: "https://registration.example.test/start", ctaLabel: "Register",
      }),
      hidden: false, stays_open_after_date: true, sign_up_by_contact: false,
      created_at: "2026-11-14T10:11:12.123456Z", updated_at: "2026-11-14T10:11:12.654321Z",
    })), registrationForms: {} };
}
function apply(control: Control, request: TryoutsPageSaveRequest): Snapshot {
  const previous = control.snapshot;
  const next = {
    revision: String(Number(previous.revision) + 1),
    page: request.page ? { ...request.page } : previous.page,
    events: request.events.map((row) => ({
      ...(previous.events.find((item) => item.id === row.id) ?? {}), ...row,
      id: row.id ?? createdId, club_id: "11111111-1111-4111-8111-111111111111",
      hidden: false, stays_open_after_date: true, sign_up_by_contact: false,
      hero_media_url: row.hero_media_asset_id ? origin + "/cl22-image.png" : undefined,
      created_at: "2026-11-14T10:11:12.123456Z", updated_at: "2026-11-15T10:11:12.654321Z",
    })), registrationForms: {},
  };
  control.snapshot = next;
  return next;
}
async function json(route: Route, body: unknown, status = 200) { await route.fulfill({ status, json: body }); }
async function open(page: Page, theme: string, options: { empty?: boolean; single?: boolean; long?: boolean; delay?: number; portal?: string; unsupported?: boolean } = {}) {
  const control: Control = { snapshot: initial(options.empty), requests: [], cleanups: [], media: [],
    unknownNext: false, conflictNext: false, rejectNext: false, loadDelay: options.delay ?? 0,
    holdPost: false, holdUpload: false, errors: controls.get(page)?.errors ?? [], expectedHttpErrors: 0 };
  if (options.single) control.snapshot.events = control.snapshot.events.slice(0, 1);
  if (options.long) {
    control.snapshot.page.intro_with_tryouts = "Long public introduction for the evaluation. ".repeat(8).slice(0, 320);
    control.snapshot.events[0].headline = "A long evaluation opportunity for returning and new players ".repeat(2).slice(0, 80);
    control.snapshot.events[0].location = "Training field and accessible family entrance ".repeat(4).slice(0, 160);
  }
  controls.set(page, control);
  page.on("pageerror", (error) => control.errors.push("page: " + error.message));
  page.on("console", (entry) => {
    if (entry.type() !== "error") return;
    if (/Failed to load resource: the server responded with a status of (409|422|503)/.test(entry.text()) &&
        entry.location().url.startsWith(origin + "/api/admin/tryouts-page") && control.expectedHttpErrors > 0) {
      control.expectedHttpErrors--; return;
    }
    control.errors.push("console: " + entry.text() + " " + entry.location().url);
  });
  await page.routeWebSocket("**/*", (socket) => {
    const url = new URL(socket.url()), local = new URL(origin);
    if (url.protocol === "ws:" && url.host === local.host && url.pathname === "/" && url.searchParams.has("token")) socket.connectToServer();
    else { control.errors.push("Unexpected WebSocket " + url.origin + url.pathname); socket.close(); }
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin && !url.pathname.startsWith("/api/")) return route.continue();
    control.errors.push("Unexpected network " + url.origin + url.pathname);
    await route.abort();
  });
  await page.route(origin + "/cl22-image.png", (route) => route.fulfill({ body: png, contentType: "image/png" }));
  await page.route(origin + "/api/admin/data", async (route) => {
    const request = route.request().postDataJSON();
    expect(request.operation).toBe("select");
    const rows = request.table === "programs" ? [] : request.table === "contact_profile"
      ? [{ public_email: "owner@example.test" }] : request.table === "registration_forms"
        ? [{ id: formId, title: "Winter form", status: "open" }] : null;
    expect(rows, "Only the original three local read tables may be requested").not.toBeNull();
    await json(route, { data: rows, error: null, count: rows!.length });
  });
  const receipts = new Map<string, Snapshot>();
  await page.route(origin + "/api/admin/tryouts-page**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      if (new URL(request.url()).searchParams.has("operationId")) {
        control.expectedHttpErrors++; return json(route, { error: { code: "DATABASE_OPERATION_FAILED", message: "Status temporarily unavailable" } }, 503);
      }
      if (control.loadDelay) await new Promise((resolve) => setTimeout(resolve, control.loadDelay));
      return json(route, control.snapshot);
    }
    expect(request.method()).toBe("POST");
    const body = request.postDataJSON() as TryoutsPageSaveRequest;
    control.requests.push(body);
    if (control.holdPost) await new Promise<void>((resolve) => { control.releasePost = resolve; });
    if (control.rejectNext) {
      control.rejectNext = false; control.expectedHttpErrors++;
      return json(route, { error: { code: "INVALID_TRYOUTS_PAYLOAD", message: "Review the event fields." } }, 422);
    }
    if (control.conflictNext) {
      control.conflictNext = false; control.expectedHttpErrors++;
      control.snapshot = { ...control.snapshot, revision: String(Number(control.snapshot.revision) + 1),
        events: [...control.snapshot.events, { ...control.snapshot.events[0], id: createdId, headline: "Added elsewhere", sort_order: control.snapshot.events.length }] };
      return json(route, { error: { code: "TRYOUTS_CHANGED", message: "The Tryouts page changed." } }, 409);
    }
    if (receipts.has(body.operationId)) expect(request.headers()["x-editor-recovery"]).toBe("1");
    const receipt = receipts.get(body.operationId) ?? apply(control, body);
    receipts.set(body.operationId, receipt);
    if (control.unknownNext) {
      control.unknownNext = false; control.expectedHttpErrors++;
      return json(route, { error: { code: "DATABASE_OPERATION_FAILED", message: "Response interrupted." } }, 503);
    }
    return json(route, receipt);
  });

  await page.route(origin + "/api/admin/media/authorize", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.surface).toBe("tryouts"); expect(body.kind).toBe("photo"); expect(body.size).toBeGreaterThan(0);
    if (control.holdUpload) await new Promise<void>((resolve) => { control.releaseUpload = resolve; });
    return json(route, { path: "cl22/fixture.png", token: "synthetic-fixture-token", authorization: "synthetic-fixture-authorization" });
  });
  await page.route("http://127.0.0.1:54321/storage/v1/object/upload/sign/onzio-upload-staging/cl22/fixture.png**", async (route) => {
    expect(route.request().method()).toBe("PUT");
    return json(route, { Key: "onzio-upload-staging/cl22/fixture.png" });
  });
  await page.route(origin + "/api/admin/media/finalize", async (route) => {
    expect(route.request().postDataJSON().authorization).toBe("synthetic-fixture-authorization");
    const assetId = "77777777-7777-4777-8777-" + String(900 + control.media.length).padStart(12, "0");
    control.media.push(assetId);
    return json(route, { data: { assetId, storagePath: "tryouts/" + assetId + "/v1.webp", publicUrl: origin + "/cl22-image.png" } });
  });
  await page.route(origin + "/api/admin/media/cleanup", async (route) => {
    control.cleanups.push(route.request().postDataJSON().assetId);
    return json(route, { data: { retired: true } });
  });
  await page.context().addCookies([{ name: "onzio-admin-theme", value: theme, domain: "127.0.0.1", path: "/admin", sameSite: "Lax" }]);
  const response = await page.goto(origin + "/admin/cl22-fixture?" + new URLSearchParams({
    ...(options.portal ? { portal: options.portal } : {}), ...(options.unsupported ? { unsupported: "1" } : {}),
  }));
  expect(response?.status()).toBe(200);
  await expect(page.locator(".admin-theme").first()).toHaveAttribute("data-admin-theme", theme);
  await expect(page.getByRole("heading", { name: "Tryouts", exact: true })).toBeVisible();
  return control;
}
async function ready(page: Page) {
  await expect(page.locator("[data-admin-loading-region]")).toHaveAttribute("data-phase", "content");
  await expect(page.getByRole("button", { name: "Add event", exact: true })).toBeEnabled();
}
async function edit(page: Page, id: string) {
  await page.getByRole("combobox", { name: "Edit event", exact: true }).selectOption(id);
  const dialog = page.getByRole("dialog").filter({ has: page.getByRole("navigation", { name: "Event editor sections" }) });
  await expect(dialog).toBeVisible();
  return dialog;
}
async function done(page: Page) {
  const dialog = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Done", exact: true }) });
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
async function save(page: Page) {
  const button = page.locator("[data-admin-save-button]");
  await expect(button).toHaveAttribute("data-state", "dirty");
  await button.click();
  await expect(button).toHaveAttribute("data-state", "saved");
  return button;
}
async function photo(page: Page) {
  const dialog = page.getByRole("dialog").filter({ has: page.getByRole("navigation", { name: "Event editor sections" }) });
  await dialog.getByRole("button", { name: "Photo", exact: true }).click();
  await dialog.getByLabel("Choose event photo", { exact: true }).setInputFiles({ name: "event.png", mimeType: "image/png", buffer: png });
  await expect(dialog.locator("[data-admin-image-pending]")).toHaveCount(0);
  await expect(dialog.locator("[data-admin-image-preview] img")).toBeVisible();
  await expect.poll(() => dialog.locator("[data-admin-image-preview] img").evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
}
test.afterEach(async ({ page }, info) => {
  const control = controls.get(page);
  if (!control) return;
  expect(control.errors).toEqual([]);
  await writeFile(resolve(evidence, info.testId.replace(/[^a-zA-Z0-9_-]/g, "_") + ".json"),
    JSON.stringify({ title: info.title, requests: control.requests, cleanups: control.cleanups, media: control.media,
      errors: control.errors, remainingExpectedHttpErrors: control.expectedHttpErrors }, null, 2));
});

for (const width of [390, 1280]) for (const theme of ["light", "dark"] as const) for (const motion of ["no-preference", "reduce"] as const) {
  test.describe(width + "px " + theme + " " + motion, () => {
    test.use({ viewport: { width, height: width < 700 ? 844 : 900 }, colorScheme: theme, contextOptions: { reducedMotion: motion } });
    test("complete event fields and client media input retain one confirmed identity through later edits", async ({ page }, info) => {
      const control = await open(page, theme); await ready(page);
      const headerSave = await page.locator("[data-admin-save-button]").boundingBox();
      expect(headerSave!.height).toBeGreaterThanOrEqual(44);
      await page.getByRole("button", { name: "Add event", exact: true }).click();
      const dialog = page.getByRole("dialog").filter({ has: page.getByRole("navigation", { name: "Event editor sections" }) });
      await expect(dialog).toHaveAttribute("data-size", "xl");
      await dialog.getByLabel("Name", { exact: true }).fill("Created event");
      await dialog.getByLabel("Event date", { exact: true }).fill("2027-02-03");
      await dialog.getByLabel("Cost", { exact: true }).fill("$25");
      await dialog.getByLabel("Location", { exact: true }).fill("North training field");
      await dialog.getByRole("button", { name: "Sign-up", exact: true }).click();
      await dialog.getByLabel("Sign-ups", { exact: true }).selectOption("closed");
      await dialog.getByLabel("Onzio registration form", { exact: true }).selectOption(formId);
      await dialog.getByLabel("Button text", { exact: true }).fill("Join evaluations");
      await dialog.getByLabel("External registration destination", { exact: true }).fill("https://registration.example.test/evaluate");
      await dialog.getByLabel("Closed message", { exact: true }).fill("Next dates soon");
      await photo(page);
      await page.screenshot({ path: resolve(evidence, "fields-" + info.project.name + "-" + width + "-" + theme + "-" + motion + ".png") });
      const footer = dialog.locator("[data-slot='admin-dialog-footer']");
      expect(await footer.getByRole("button").evaluateAll((buttons) => buttons.every((button) => button.getBoundingClientRect().height >= 44))).toBe(true);
      await done(page);
      const started = Date.now(), button = await save(page);
      expect(Date.now() - started).toBeGreaterThanOrEqual(370);
      const payload = control.requests[0].events.find((event) => event.id === null)!;
      expect(payload).toMatchObject({ headline: "Created event", status: "closed", event_date: "2027-02-03", cost_text: "$25", location: "North training field",
        registration_form_id: formId, cta_label: "Join evaluations", registration_href: "https://registration.example.test/evaluate",
        closed_message: "Next dates soon", hero_media_asset_id: control.media[0] });
      expect(Object.keys(payload)).toHaveLength(18);
      expect(control.requests[0].events[0]).toMatchObject({ eyebrow: "Stored eyebrow", intro: "Stored introduction", eligibility_copy: "Stored eligibility",
        what_to_expect_copy: "Stored expectations", preparation_copy: "Stored preparation", status: "upcoming" });
      await expect(button).toHaveAttribute("data-state", "clean", { timeout: 4000 });
      const confirmedDialog = await edit(page, createdId);
      await confirmedDialog.getByLabel("Name", { exact: true }).fill("Edited confirmed event");
      await done(page); await save(page);
      expect(control.requests[1].events.find((event) => event.headline === "Edited confirmed event")?.id).toBe(createdId);
      expect(control.snapshot.events.filter((event) => event.id === createdId)).toHaveLength(1);
      expect(control.snapshot.events).toHaveLength(3);
    });

    test("confirmed deletion persists immediately while unrelated page, new-row, reorder and photo drafts survive", async ({ page }) => {
      const control = await open(page, theme); await ready(page);
      await page.getByRole("button", { name: "Page introduction", exact: true }).click();
      await page.getByLabel("Intro shown when tryouts are published", { exact: true }).fill("Unpublished intro");
      await done(page);
      let dialog = await edit(page, second);
      await dialog.getByLabel("Name", { exact: true }).fill("Unpublished survivor");
      await photo(page); await done(page);
      await page.getByRole("button", { name: "Add event", exact: true }).click();
      dialog = page.getByRole("dialog").filter({ has: page.getByRole("navigation", { name: "Event editor sections" }) });
      await dialog.getByLabel("Name", { exact: true }).fill("Unpublished new event");
      await dialog.getByRole("button", { name: "Move up", exact: true }).click();
      await done(page);
      dialog = await edit(page, first);
      await dialog.getByRole("button", { name: "Delete event", exact: true }).click();
      let confirmation = page.getByRole("dialog", { name: "Delete First event?", exact: true });
      await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(confirmation).toHaveCount(0);
      expect(control.requests).toHaveLength(0);
      await dialog.getByRole("button", { name: "Delete event", exact: true }).click();
      confirmation = page.getByRole("dialog", { name: "Delete First event?", exact: true });
      await confirmation.getByRole("button", { name: "Delete event", exact: true }).click();
      await expect(confirmation).toHaveCount(0);
      expect(control.requests).toHaveLength(1);
      await expect(page.getByRole("button", { name: "Add event", exact: true })).toBeFocused();
      expect(control.snapshot.events.map((row) => row.id)).toEqual([second]);
      expect(control.requests[0]).toMatchObject({ expectedRevision: "7", page: null, deletedIds: [first] });
      expect(control.requests[0].events[0]).toMatchObject({ id: second, headline: "Second event", hero_media_asset_id: null, sort_order: 0 });
      expect(control.snapshot.page.intro_with_tryouts).toBe("Saved intro");
      expect(control.cleanups).toEqual([]);
      await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "dirty");
      await expect(page.getByRole("button", { name: "Undo", exact: true })).toHaveCount(0);
      dialog = await edit(page, second);
      await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue("Unpublished survivor");
      await dialog.getByRole("button", { name: "Photo", exact: true }).click();
      await expect(dialog.locator("[data-admin-image-preview] img")).toBeVisible();
      await done(page);
      await page.getByRole("button", { name: "Page introduction", exact: true }).click();
      await expect(page.getByLabel("Intro shown when tryouts are published", { exact: true })).toHaveValue("Unpublished intro");
      await done(page); await save(page);
      expect(control.requests).toHaveLength(2);
      expect(control.requests[1].expectedRevision).toBe("8");
      expect(control.requests[1].events.map((event) => event.headline)).toEqual(["Unpublished new event", "Unpublished survivor"]);
      expect(control.requests[1].events[1].hero_media_asset_id).toBe(control.media[0]);
      expect(control.requests[1].page?.intro_with_tryouts).toBe("Unpublished intro");
      expect(control.snapshot.events.some((event) => event.id === first)).toBe(false);
      await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "clean", { timeout: 4000 });
      await page.getByRole("button", { name: "Add event", exact: true }).click();
      dialog = page.getByRole("dialog").filter({ has: page.getByRole("navigation", { name: "Event editor sections" }) });
      await dialog.getByLabel("Name", { exact: true }).fill("Never published");
      await photo(page);
      await dialog.getByRole("button", { name: "Delete event", exact: true }).click();
      confirmation = page.getByRole("dialog", { name: "Delete Never published?", exact: true });
      await confirmation.getByRole("button", { name: "Delete event", exact: true }).click();
      await expect(confirmation).toHaveCount(0);
      expect(control.requests).toHaveLength(2);
      await expect.poll(() => control.cleanups).toEqual([control.media[1]]);
      await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "clean");
    });

    test("an uncertain isolated deletion retries its exact command and cannot navigate over another dirty draft", async ({ page }) => {
      const control = await open(page, theme); await ready(page);
      let dialog = await edit(page, second);
      await dialog.getByLabel("Name", { exact: true }).fill("Keep this draft");
      await done(page);
      dialog = await edit(page, first);
      await dialog.getByRole("button", { name: "Delete event", exact: true }).click();
      const confirmation = page.getByRole("dialog", { name: "Delete First event?", exact: true });
      control.unknownNext = true;
      await confirmation.getByRole("button", { name: "Delete event", exact: true }).click();
      await expect(confirmation.getByRole("button", { name: "Confirm deletion", exact: true })).toBeVisible();
      expect(control.requests).toHaveLength(1);
      await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(confirmation).toHaveCount(0); await done(page);
      await page.getByRole("link", { name: "Roster", exact: true }).click();
      const guard = page.getByRole("dialog", { name: "Save your changes first?", exact: true });
      await guard.getByRole("button", { name: "Save and leave", exact: true }).click();
      await expect(guard).toBeVisible();
      await expect(guard.getByRole("alert")).toContainText("could not be saved");
      expect(control.requests).toHaveLength(2);
      expect(control.requests[1]).toEqual(control.requests[0]);
      await expect(page.getByLabel("Current page", { exact: true })).toHaveText("Tryouts");
      await expect(guard.getByRole("button", { name: "Save and leave", exact: true })).not.toHaveAttribute("aria-busy", "true");
      await guard.getByRole("button", { name: "Save and leave", exact: true }).click();
      await expect(guard).toHaveCount(0);
      await expect(page.getByLabel("Current page", { exact: true })).toHaveText("Roster");
      expect(control.requests).toHaveLength(3);
      expect(control.requests[2].operationId).not.toBe(control.requests[0].operationId);
      expect(control.requests[2].expectedRevision).toBe("8");
      expect(control.requests[2].events).toHaveLength(1);
      expect(control.requests[2].events[0]).toMatchObject({ id: second, headline: "Keep this draft" });
      expect(control.requests[2].deletedIds).toEqual([]);
    });

    test("validation, conflict review and native Keep editing or Discard preserve the current draft", async ({ page }, info) => {
      const control = await open(page, theme); await ready(page);
      let dialog = await edit(page, first);
      await dialog.getByRole("button", { name: "Sign-up", exact: true }).click();
      await dialog.getByLabel("Button text", { exact: true }).fill("");
      await done(page);
      await page.locator("[data-admin-save-button]").click();
      dialog = page.getByRole("dialog").filter({ has: page.getByRole("navigation", { name: "Event editor sections" }) });
      await expect(dialog.getByLabel("Button text", { exact: true })).toHaveAttribute("aria-invalid", "true");
      expect(control.requests).toHaveLength(0);
      await expect(dialog.getByLabel("Button text", { exact: true })).toBeEnabled();
      await dialog.getByLabel("Button text", { exact: true }).fill("Keep registration");
      await done(page);
      control.rejectNext = true;
      await page.locator("[data-admin-save-button]").click();
      await expect(page.getByRole("alert").first()).toContainText("Review the event fields.");
      await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "dirty");
      control.conflictNext = true;
      await page.locator("[data-admin-save-button]").click();
      await expect(page.getByRole("region", { name: "Review changes from another editor" })).toBeVisible();
      dialog = await edit(page, first);
      const conflictAction = { deleteEnabled: await dialog.getByRole("button", { name: "Delete event", exact: true }).isEnabled(),
        footer: await dialog.locator("[data-slot='admin-dialog-status']").textContent(), requests: control.requests.length };
      await writeFile(resolve(evidence, "conflict-action-" + width + "-" + theme + "-" + motion + ".json"), JSON.stringify(conflictAction, null, 2));
      expect(conflictAction.deleteEnabled, "destructive deletion waits for explicit conflict review").toBe(false);
      expect(conflictAction.footer).toContain("Review the latest saved page before saving or deleting.");
      await done(page);
      await page.getByRole("button", { name: "Keep my draft", exact: true }).click();
      await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "dirty");
      await save(page);
      expect(control.requests.at(-1)?.expectedRevision).toBe("8");
      expect(control.requests.at(-1)?.events.find((event) => event.id === createdId)?.headline).toBe("Added elsewhere");
      await expect(page.locator("[data-admin-save-button]")).toHaveAttribute("data-state", "clean", { timeout: 4000 });
      dialog = await edit(page, first);
      await dialog.getByLabel("Name", { exact: true }).fill("Draft after conflict");
      await page.screenshot({ path: resolve(evidence, "dialog-" + info.project.name + "-" + width + "-" + theme + "-" + motion + ".png") });
      await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
      await page.getByRole("link", { name: "Roster", exact: true }).click();
      let guard = page.getByRole("dialog", { name: "Save your changes first?", exact: true });
      await expect(guard.getByRole("button", { name: "Save and leave", exact: true })).toBeFocused();
      await guard.getByRole("button", { name: "Keep editing", exact: true }).click();
      await expect(guard).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Roster", exact: true })).toBeFocused();
      await page.getByRole("link", { name: "Roster", exact: true }).click();
      guard = page.getByRole("dialog", { name: "Save your changes first?", exact: true });
      await guard.getByRole("button", { name: "Discard changes", exact: true }).click();
      await expect(guard).toHaveCount(0);
      await expect(page.getByLabel("Current page", { exact: true })).toHaveText("Roster");
      expect(control.requests).toHaveLength(3);
      expect(control.snapshot.events[0].headline).toBe("First event");
    });
  });
}

for (const width of [320, 390, 1280]) for (const theme of ["light", "dark"] as const) for (const motion of ["no-preference", "reduce"] as const) {
  test.describe("paint " + width + "px " + theme + " " + motion, () => {
    test.use({ viewport: { width, height: width < 700 ? 844 : 900 }, colorScheme: theme, contextOptions: { reducedMotion: motion } });
    test("opaque pre-data preview paint survives empty and populated arrival before opacity reveal", async ({ page }, info) => {
      await page.addInitScript(() => {
        const frames: unknown[] = [];
        Object.assign(window, { cl22PaintFrames: frames });
        let recorded = false;
        const sample = () => {
          const canvas = document.querySelector<HTMLElement>("[data-tryouts-classic-canvas]");
          const skeleton = canvas?.querySelector<HTMLElement>("[data-admin-skeleton-layer]");
          const content = canvas?.querySelector<HTMLElement>("[data-tryouts-preview-content]");
          if (canvas && content && (skeleton || recorded)) {
            recorded = true;
            const root = canvas.getBoundingClientRect();
            const known = Array.from(document.querySelectorAll("p")).some((node) => node.textContent?.includes("Your public /tryouts page") && !node.textContent.includes("—"));
            const tools = document.querySelector<HTMLElement>("[aria-label='Tryouts editing tools']")?.getBoundingClientRect();
            const picker = document.querySelector<HTMLSelectElement>("[aria-label='Tryouts editing tools'] select")?.getBoundingClientRect();
            frames.push({
              tools: tools ? { x: tools.x, y: tools.y, width: tools.width, height: tools.height } : null,
              picker: picker ? { x: picker.x, y: picker.y, width: picker.width, height: picker.height } : null,
              pageScrollWidth: document.documentElement.scrollWidth,
              phase: canvas.dataset.phase, known, time: performance.now(), canvas: { x: root.x, y: root.y, width: root.width, height: root.height },
              contentOpacity: getComputedStyle(content).opacity, contentVisibility: getComputedStyle(content).visibility,
              skeletonOpacity: skeleton ? getComputedStyle(skeleton).opacity : null,
              skeletonBackground: skeleton ? getComputedStyle(skeleton).backgroundColor : null,
              iframeHeight: content.querySelector("iframe")?.getBoundingClientRect().height,
              authored: [...(content.querySelector("iframe")?.contentDocument?.querySelectorAll<HTMLElement>("[data-tryouts-editor-target]") ?? [])].map((target) => {
                const r = target.getBoundingClientRect();
                return { key: target.dataset.tryoutsEditorTarget, x: r.x, y: r.y, width: r.width, height: r.height };
              }),
              blocks: skeleton ? [...skeleton.querySelectorAll<HTMLElement>("[data-admin-shimmer]")].map((block) => {
                const r = block.getBoundingClientRect();
                return { x: r.x, y: r.y, width: r.width, height: r.height,
                  background: getComputedStyle(block).backgroundColor,
                  visibleHeight: Math.max(0, Math.min(r.bottom, root.bottom, innerHeight) - Math.max(r.top, root.top, 0)) };
              }) : [],
            });
          }
          if (frames.length < 2000 && (!canvas || canvas.dataset.phase !== "content")) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      for (const empty of [true, false]) {
        const control = await open(page, theme, { empty, long: !empty, delay: 400 });
        const region = page.locator("[data-tryouts-classic-canvas]");
        await expect.poll(() => region.getAttribute("data-phase"), { intervals: [16] }).toBe("skeleton");
        const cdp = await page.context().newCDPSession(page);
        const beforePng = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: false, captureBeyondViewport: false });
        await writeFile(resolve(evidence, "paint-before-" + width + "-" + theme + "-" + motion + "-" + empty + ".png"), Buffer.from(beforePng.data, "base64"));
        await expect(region).toHaveAttribute("data-phase", "content");
        const frames = await page.evaluate(() => (window as unknown as { cl22PaintFrames: Array<{
          phase: string; known: boolean; time: number; canvas: { x: number; y: number; width: number; height: number };
          contentOpacity: string; contentVisibility: string; skeletonOpacity: string | null;
          skeletonBackground: string | null; iframeHeight?: number;
          authored: Array<{ key?: string; x: number; y: number; width: number; height: number }>;
          blocks: Array<{ x: number; y: number; width: number; height: number; background: string; visibleHeight: number }>;
        }> }).cl22PaintFrames);
        await writeFile(resolve(evidence, "paint-observed-" + width + "-" + theme + "-" + motion + "-" + empty + ".json"), JSON.stringify(frames, null, 2));
        const opaque = frames.filter((frame) => frame.phase === "skeleton" && Number(frame.skeletonOpacity) === 1);
        const pre = opaque.find((frame) => !frame.known)!;
        expect(pre, "actual opaque pre-data frame").toBeDefined();
        const arrived = opaque.filter((frame) => frame.known);
        const fades = frames.filter((frame) => frame.phase === "crossfade");
        expect(arrived.length + fades.length).toBeGreaterThan(0);
        const firstKnown = arrived[0] ?? fades[0];
        for (const frame of [...opaque, ...fades]) {
          expect(frame.blocks).toHaveLength(pre.blocks.length);
          expect(frame.skeletonBackground).not.toBe("rgba(0, 0, 0, 0)");
          for (let index = 0; index < frame.blocks.length; index++) {
            expect(frame.blocks[index].background).toBe(pre.blocks[index].background);
            for (const key of ["x", "y", "width", "height", "visibleHeight"] as const)
              expect(Math.abs(frame.blocks[index][key] - pre.blocks[index][key])).toBeLessThanOrEqual(1);
          }
        }
        for (const frame of arrived) expect(frame.contentVisibility).toBe("hidden");
        for (const frame of fades) {
          expect(Math.abs(Number(frame.skeletonOpacity) + Number(frame.contentOpacity) - 1)).toBeLessThanOrEqual(.03);
          expect(Math.abs(frame.iframeHeight! - firstKnown.iframeHeight!)).toBeLessThanOrEqual(1);
        }
        const settled = await region.boundingBox();
        const authored = await page.frameLocator("iframe[title='Tryouts page editing preview']").locator("[data-tryouts-preview]").evaluate((root) =>
          [...root.querySelectorAll<HTMLElement>("[data-tryouts-editor-target]")].map((target) => {
            const r = target.getBoundingClientRect();
            return { key: target.dataset.tryoutsEditorTarget, x: r.x, y: r.y, width: r.width, height: r.height };
          }));
        const knownAuthored = [...arrived, ...fades].find((frame) => frame.authored.length === authored.length)?.authored;
        expect(knownAuthored, "known authored hidden or first-fade layout was independently observed").toBeDefined();
        for (let index = 0; index < authored.length; index++) {
          expect(knownAuthored![index].key).toBe(authored[index].key);
          for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(knownAuthored![index][key] - authored[index][key])).toBeLessThanOrEqual(1);
        }
        expect(Math.abs(settled!.height - firstKnown.canvas.height)).toBeLessThanOrEqual(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const afterPng = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: false, captureBeyondViewport: false });
        await writeFile(resolve(evidence, "paint-after-" + width + "-" + theme + "-" + motion + "-" + empty + ".png"), Buffer.from(afterPng.data, "base64"));
        await cdp.detach();
        await writeFile(resolve(evidence, "paint-" + info.project.name + "-" + width + "-" + theme + "-" + motion + "-" + empty + ".json"), JSON.stringify({ frames, initialUnknownExtent: frames[0]?.canvas, pre, firstKnown, settled, authored }, null, 2));
        expect(control.errors).toEqual([]);
      }
    });
  });
}

for (const theme of ["light", "dark"] as const) {
  test.describe("edge 320px " + theme, () => {
    test.use({ viewport: { width: 320, height: 620 }, colorScheme: theme, contextOptions: { reducedMotion: "reduce" } });
    test("short phone sheet keeps real actions reachable and photo readiness blocks dismissal and capture", async ({ page }, info) => {
      const control = await open(page, theme); await ready(page);
      const dialog = await edit(page, first);
      await dialog.getByRole("button", { name: "Photo", exact: true }).click();
      await dialog.getByLabel("Choose event photo", { exact: true }).setInputFiles({ name: "unsafe.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>") });
      await expect(dialog.locator("[data-admin-image-error]")).toContainText("not a supported image");
      await expect(dialog.locator("[data-admin-image-pending]")).toHaveCount(0);
      const overLimit = Buffer.alloc(15 * 1024 * 1024 + 1);
      await dialog.getByLabel("Choose event photo", { exact: true }).setInputFiles({ name: "too-large.png", mimeType: "image/png", buffer: overLimit });
      await expect(dialog.locator("[data-admin-image-error]")).toContainText("too large");
      await expect(dialog.locator("[data-admin-image-pending]")).toHaveCount(0);
      expect(control.media).toEqual([]);
      control.holdUpload = true;
      await dialog.getByLabel("Choose event photo", { exact: true }).setInputFiles({ name: "event.png", mimeType: "image/png", buffer: png });
      await expect(dialog.locator("[data-admin-image-pending]")).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Done", exact: true })).toBeDisabled();
      await expect(dialog.getByRole("button", { name: "When and where", exact: true })).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();
      expect(control.requests).toHaveLength(0);
      await expect.poll(() => typeof control.releaseUpload).toBe("function");
      control.holdUpload = false; control.releaseUpload!();
      await expect(dialog.locator("[data-admin-image-pending]")).toHaveCount(0);
      await dialog.getByRole("button", { name: "When and where", exact: true }).click();
      await dialog.getByLabel("Name", { exact: true }).fill("W".repeat(80));
      const footer = dialog.locator("[data-slot='admin-dialog-footer']");
      const bounds = await footer.boundingBox();
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(621);
      expect(await footer.getByRole("button").evaluateAll((buttons) => buttons.every((button) => button.getBoundingClientRect().height >= 44))).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: resolve(evidence, "edge-320-" + theme + ".png") });
      await done(page); await save(page);
      expect(control.requests[0].events[0].hero_media_asset_id).toBe(control.media[0]);
      expect(control.errors).toEqual([]);
    });
  });
}
test("unsupported presentation stays gated and nonclassic keeps its staged page editor", async ({ page }) => {
  const control = await open(page, "light", { unsupported: true });
  await expect(page.getByText("This website design does not publish a Tryouts page.")).toBeVisible();
  await expect(page.locator("[data-tryouts-classic-canvas]")).toHaveCount(0);
  expect(control.requests).toEqual([]);
  await open(page, "light", { portal: "reimagined" });
  await expect(page.getByRole("button", { name: "Save page", exact: true }).first()).toBeVisible();
  await expect(page.locator("[data-tryouts-classic-canvas]")).toHaveCount(0);
});

for (const variant of [{ width: 390, theme: "light", motion: "no-preference" }, { width: 1280, theme: "dark", motion: "reduce" }] as const) {
  test.describe("native preview " + variant.width + "px " + variant.theme + " " + variant.motion, () => {
    test.use({ viewport: { width: variant.width, height: variant.width === 390 ? 844 : 900 }, colorScheme: variant.theme, contextOptions: { reducedMotion: variant.motion } });
    test("removing the last preview-origin event restores a real fallback and preserves later native Tab focus", async ({ page }) => {
      const control = await open(page, variant.theme, { single: true }); await ready(page);
      await page.evaluate(() => {
        const events: unknown[] = [];
        Object.assign(window, { cl22NativeFocus: events });
        for (const type of ["focusin", "focusout", "keydown"]) document.addEventListener(type, (event) => {
          const target = event.target as HTMLElement | null;
          events.push({ time: performance.timeOrigin + performance.now(), scope: "outer", type, key: event instanceof KeyboardEvent ? event.key : undefined,
            targetTag: target?.tagName, targetSlot: target?.getAttribute("data-slot"), targetInert: Boolean(target?.closest("[inert]")),
            activeTag: document.activeElement?.tagName });
        }, true);
      });
      const frame = page.frameLocator("iframe[title='Tryouts page editing preview']");
      await frame.locator("[data-tryouts-preview]").evaluate((root) => {
        const doc = root.ownerDocument;
        const events = (window.parent as unknown as { cl22NativeFocus: unknown[] }).cl22NativeFocus;
        for (const type of ["focusin", "focusout", "keydown"]) doc.addEventListener(type, (event) => {
          const target = event.target as HTMLElement | null;
          events.push({ time: performance.timeOrigin + performance.now(), scope: "iframe", type,
            targetTag: target?.tagName, targetKey: target?.getAttribute("data-tryouts-editor-target"),
            activeTag: doc.activeElement?.tagName, activeBody: doc.activeElement === doc.body });
        }, true);
      });
      await frame.getByRole("button", { name: "Edit First event", exact: true }).click();
      const editor = page.getByRole("dialog", { name: "First event", exact: true });
      await expect(editor).toBeVisible();
      await editor.getByRole("button", { name: "Delete event", exact: true }).click();
      const confirmation = page.getByRole("dialog", { name: "Delete First event?", exact: true });
      await confirmation.getByRole("button", { name: "Delete event", exact: true }).click();
      await expect(page.locator("[data-slot='admin-dialog']")).toHaveCount(0);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const initialFocus = await page.evaluate(() => {
        const active = document.activeElement;
        const inner = active instanceof HTMLIFrameElement ? active.contentDocument?.activeElement : null;
        return { mainTag: active?.tagName, mainSlot: active?.getAttribute("data-slot"),
          innerTag: inner?.tagName, innerKey: inner?.getAttribute("data-tryouts-editor-target"),
          addFocused: [...document.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Add event" && active === button) };
      });
      await page.keyboard.press("Tab");
      const newer = await page.evaluate(() => {
        const active = document.activeElement;
        const inner = active instanceof HTMLIFrameElement ? active.contentDocument?.activeElement : null;
        const focused = inner ?? active;
        Object.assign(window, { cl22NewerNativeFocus: focused });
        return { tag: focused?.tagName, key: focused?.getAttribute("data-tryouts-editor-target"),
          valid: Boolean(focused?.isConnected && !["BODY", "HTML"].includes(focused.tagName) && !focused.closest("[inert],[hidden],[aria-hidden='true']")) };
      });
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const after = await page.evaluate(() => {
        const active = document.activeElement;
        const focused = active instanceof HTMLIFrameElement ? active.contentDocument?.activeElement : active;
        return { tag: focused?.tagName, key: focused?.getAttribute("data-tryouts-editor-target"),
          same: focused === (window as unknown as { cl22NewerNativeFocus: unknown }).cl22NewerNativeFocus };
      });
      const events = await page.evaluate(() => (window as unknown as { cl22NativeFocus: unknown[] }).cl22NativeFocus);
      await writeFile(resolve(evidence, "native-preview-focus-" + variant.width + "-" + variant.theme + "-" + variant.motion + ".json"),
        JSON.stringify({ initialFocus, newer, after, events }, null, 2));
      expect(control.snapshot.events).toHaveLength(0);
      expect(control.requests).toHaveLength(1);
      expect(initialFocus.addFocused, "removed iframe opener falls back to the existing Add event action").toBe(true);
      expect(newer.valid, "actual Tab reaches a valid focusable control").toBe(true);
      expect(after.same, "queued modal recovery must not steal newer native focus").toBe(true);
    });
  });
}
