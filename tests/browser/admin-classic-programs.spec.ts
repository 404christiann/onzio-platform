import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { ViteDevServer } from "vite";
import { backend, gate, ids, formId, png } from "./fixtures/admin-cl-21/backend";
import { checkAdminDialog } from "./helpers/admin-design-checks";
const repo = process.cwd();
const evidence = resolve(repo, process.env.CL21_EVIDENCE_DIR ?? ".codex-work/admin-cl-21/implementation/collection");
let server: ViteDevServer | undefined;
let origin: string;
test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
  const { createServer } = await import("vite");
  const fixture = resolve(repo, "tests/browser/fixtures/admin-cl-21");
  server = await createServer({ root: repo, configFile: false, envDir: false, publicDir: resolve(repo, "public"), cacheDir: resolve(evidence, "vite-cache"),
    resolve: { alias: [
      { find: "@/lib/admin-client", replacement: fixture + "/client.ts" },
      { find: "@/lib/supabase-browser", replacement: fixture + "/client.ts" },
      { find: "@/lib/supabase", replacement: fixture + "/client.ts" },
      { find: "next/navigation", replacement: fixture + "/navigation.tsx" },
      { find: "next/link", replacement: fixture + "/navigation.tsx" },
      { find: "next/dynamic", replacement: fixture + "/dynamic.tsx" },
      { find: "next/image", replacement: fixture + "/image.tsx" },
      { find: "@", replacement: repo },
    ] }, define: { "process.env.NODE_ENV": JSON.stringify("development"), "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify("http://127.0.0.1:54321") },
    oxc: { jsx: { runtime: "automatic" } }, server: { host: "127.0.0.1", port: 0, watch: { ignored: ["**/.codex-work/**", "**/test-results/**"] } } });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === "string") throw Error("No fixture address");
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { await server?.close(); });
test.afterEach(async ({ page }, info) => { if (info.status !== info.expectedStatus) await page.screenshot({ path: info.outputPath("failure.png"), fullPage: true }); });
const frame = (page: Page) => page.frameLocator(".classic-programs-render iframe");
const headerSave = (page: Page) => page.locator(".classic-programs-header-actions").getByRole("button", { name: /Save changes|Confirm save|Saved|Saving/ });
const dialog = (page: Page) => page.getByRole("dialog").filter({ visible: true }).last();
async function open(page: Page, theme = "light", extra = "", wait = true) {
  await page.context().addCookies([{ name: "onzio-admin-theme", value: theme, url: origin }]);
  await page.goto(origin + "/tests/browser/fixtures/admin-cl-21/?theme=" + theme + extra);
  await expect(page.locator(".admin-theme")).toHaveAttribute("data-admin-theme", theme);
  await expect(page.getByRole("heading", { level: 1, name: "Programs", exact: true })).toBeVisible();
  if (wait) await expect(page.locator(".classic-programs-canvas")).toHaveAttribute("data-programs-phase", "content");
}
async function done(page: Page) { await dialog(page).getByRole("button", { name: "Done", exact: true }).click(); }
async function edit(page: Page, slug = "academy") {
  await frame(page).locator('[data-program-editor-card="' + slug + '"]').click();
  await expect(dialog(page)).toBeVisible();
}
async function section(page: Page, name: string) { await dialog(page).getByRole("navigation", { name: "Program editor sections" }).getByRole("button", { name, exact: true }).click(); }
async function geometry(page: Page, width: number) {
  const save = await headerSave(page).boundingBox(); expect(save!.width).toBeGreaterThanOrEqual(150); expect(save!.height).toBeGreaterThanOrEqual(38);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (width < 700) { const actions = await page.locator(".classic-programs-header-actions").boundingBox(); expect(save!.width).toBeGreaterThanOrEqual(actions!.width / 2 - 6); }
}
for (const width of [390, 1280])
  for (const theme of ["light", "dark"] as const)
    for (const motion of ["no-preference", "reduce"] as const) {
      test.describe(`${width}px ${theme} ${motion}`, () => {
        test.use({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: theme, contextOptions: { reducedMotion: motion } });
        test("page heading closing and homepage words preserve all eleven fields", async ({ page }, info) => {
          const state = await backend(page, origin); await open(page, theme); await geometry(page, width);
          await frame(page).getByRole("button", { name: "Edit Page heading", exact: true }).click();
          expect(await checkAdminDialog(page)).toEqual([]);
          for (const [label, value] of [["Eyebrow", "Our pathway"], ["Headline line 1", "Play together"], ["Headline line 2", "Grow together"], ["Intro paragraph", "A place for every player."]]) await dialog(page).getByLabel(label, { exact: true }).fill(value);
          await page.screenshot({ path: info.outputPath("page-heading-dialog.png") });
          await done(page); await expect(frame(page).getByRole("button", { name: "Edit Page heading", exact: true })).toBeFocused();
          await frame(page).getByRole("button", { name: "Edit Closing band", exact: true }).click();
          for (const [label, value] of [["Heading line 1", "Find your place"], ["Heading line 2", "Join our club"], ["Paragraph", "Come and play."], ["Button label", "Contact us"]]) await dialog(page).getByLabel(label, { exact: true }).fill(value);
          await done(page); await page.getByRole("button", { name: "Homepage band", exact: true }).click();
          for (const [label, value] of [["Eyebrow", "Pathway"], ["Heading", "A shared future"], ["Intro paragraph", "From first touch to lifelong friends."]]) await dialog(page).getByLabel(label, { exact: true }).fill(value);
          await done(page); expect(state.posts).toHaveLength(0); await headerSave(page).click();
          await expect(headerSave(page)).toHaveAttribute("data-state", "saved"); await expect(headerSave(page)).toHaveAccessibleName("Saved");
          expect(state.posts.map(post => post.kind)).toEqual(["copy"]);
          expect(state.copy).toMatchObject({ hero_eyebrow: "Our pathway", hero_headline_line_one: "Play together", hero_headline_line_two: "Grow together", hero_intro: "A place for every player.", closing_heading_line_one: "Find your place", closing_heading_line_two: "Join our club", closing_body: "Come and play.", closing_cta_label: "Contact us", pathway_eyebrow: "Pathway", pathway_heading: "A shared future", pathway_intro: "From first touch to lifelong friends." });
          await page.reload(); await expect(page.locator(".classic-programs-canvas")).toHaveAttribute("data-programs-phase", "content"); await expect(frame(page).getByRole("button", { name: "Edit Page heading", exact: true })).toContainText("Play together");
          await page.screenshot({ path: info.outputPath("page-words.png"), fullPage: true }); expect(state.errors).toEqual([]);
        });
        test("program XL sections preserve fields registration links and live preview", async ({ page }, info) => {
          const state = await backend(page, origin); await open(page, theme); await edit(page);
          expect(await checkAdminDialog(page)).toEqual([]);
          await expect(dialog(page).getByLabel("Slug", { exact: true })).toHaveCount(0);
          await expect(page.getByRole("button", { name: "Add a program", exact: true })).toHaveCount(0);
          for (const [label, value] of [["Navigation label", "Club academy"], ["Display title", "Academy for all"], ["Kicker", "Learn and play"], ["Summary", "Every player belongs."], ["Body", "Skills and friendships built together."]]) await dialog(page).getByLabel(label, { exact: true }).fill(value);
          await dialog(page).getByLabel("Highlight 1", { exact: true }).fill("New skills");
          await dialog(page).getByRole("button", { name: "Move highlight 1 down", exact: true }).click();
          await expect(dialog(page).getByLabel("Highlight 2", { exact: true })).toHaveValue("New skills");
          await dialog(page).getByLabel("Layout variant", { exact: true }).selectOption("detail_focus");
          await section(page, "Sign-up"); await dialog(page).getByLabel("Show the registration section on this program page").check();
          await dialog(page).getByLabel("Onzio registration form", { exact: true }).selectOption(formId);
          for (const [label, value] of [["Button label", "Join academy"], ["Button link", "https://example.test/join"], ["Registration eyebrow", "Sign up"], ["Registration headline", "Your next step"], ["Registration body — link published", "Join us this season."], ["Registration body — no link yet", "Dates are coming soon."], ["Placeholder button text — no link yet", "Coming soon"]]) await dialog(page).getByLabel(label, { exact: true }).fill(value);
          await section(page, "Preview");
          const detail = dialog(page).frameLocator("iframe");
          const viewport = dialog(page).locator("iframe");
          const firstHeight = await viewport.evaluate(element => element.getBoundingClientRect().height);
          await page.waitForTimeout(200);
          const settledHeight = await viewport.evaluate(element => element.getBoundingClientRect().height);
          expect(settledHeight).toBe(firstHeight); expect(settledHeight).toBeLessThanOrEqual(900);
          await writeFile(info.outputPath("detail-viewport.json"), JSON.stringify({ firstHeight, settledHeight, width, fixedViewport: true }));
          await expect(detail.getByText("Your next step", { exact: true })).toBeVisible();
          await expect(detail.locator("button").filter({ hasText: "Join academy" })).toHaveAttribute("inert", "");
          await detail.getByRole("button", { name: "Edit Program hero", exact: true }).click();
          await expect(dialog(page).getByLabel("Navigation label", { exact: true })).toBeFocused();
          const sectionGeometry = await dialog(page).getByRole("navigation", { name: "Program editor sections" }).evaluate(nav => {
            const active = nav.querySelector('[aria-current="true"]')!.getBoundingClientRect(), bounds = nav.getBoundingClientRect();
            return { left: active.left - bounds.left, right: bounds.right - active.right };
          });
          expect(sectionGeometry.left).toBeGreaterThanOrEqual(-1); expect(sectionGeometry.right).toBeGreaterThanOrEqual(-1);
          await page.screenshot({ path: info.outputPath("program-dialog.png") });
          await done(page); await headerSave(page).click(); await expect(headerSave(page)).toHaveAttribute("data-state", "saved"); await expect(headerSave(page)).toHaveAccessibleName("Saved");
          const request = state.posts.find(post => post.kind === "program")!.body;
          expect(request.program).toMatchObject({ slug: "academy", nav_label: "Club academy", display_title: "Academy for all", kicker: "Learn and play", summary: "Every player belongs.", body: "Skills and friendships built together.", highlights: ["Teamwork", "New skills"], layout_variant: "detail_focus", registration_form_id: formId, registration_enabled: true, external_cta_label: "Join academy", external_cta_href: "https://example.test/join", registration_eyebrow: "Sign up", registration_headline: "Your next step", registration_body: "Join us this season.", registration_pending_body: "Dates are coming soon.", registration_pending_label: "Coming soon" });
          expect(Object.keys(request).sort()).toEqual(["expected", "gallery", "operationId", "program", "programId"]);
          await page.screenshot({ path: info.outputPath("program-saved.png"), fullPage: true }); expect(state.errors).toEqual([]);
        });
        test("order visibility and combined save advance only the fresh directory baseline", async ({ page }) => {
          const state = await backend(page, origin); await open(page, theme); await edit(page); await dialog(page).getByLabel("Display title", { exact: true }).fill("Updated academy"); await done(page);
          await page.getByRole("button", { name: "Order and visibility", exact: true }).click();
          await dialog(page).getByRole("button", { name: "Move Academy Pathway down", exact: true }).click();
          await expect(dialog(page).getByRole("button", { name: "Move Academy Pathway down", exact: true })).toBeFocused();
          await dialog(page).getByRole("switch", { name: "Show Academy Pathway on your website" }).click();
          await dialog(page).getByLabel("Find a program", { exact: true }).fill("Futsal"); await expect(dialog(page).getByRole("button", { name: "Move Winter Futsal down" })).toBeDisabled();
          await dialog(page).getByLabel("Find a program", { exact: true }).clear(); await done(page);
          state.programOutcome = "receipt";
          await headerSave(page).click(); await expect(headerSave(page)).toHaveAttribute("data-state", "saved"); await expect(headerSave(page)).toHaveAccessibleName("Saved");
          expect(state.posts.map(post => post.kind)).toEqual(["program", "directory"]);
          const program = state.posts[0].body, directory = state.posts[1].body;
          expect(program.program).toMatchObject({ status: "active", sort_order: 0, display_title: "Updated academy" });
          expect(directory.programs.find((item: any) => item.id === ids[0])).toMatchObject({ status: "hidden", sortOrder: 1 });
          const receipt = state.receipts.get(program.operationId);
          expect(directory.expected.find((item: any) => item.id === ids[0]).updatedAt).toBe(receipt.program.updated_at);
          expect(directory.expected.find((item: any) => item.id === ids[0]).updatedAt).not.toBe(program.expected.programUpdatedAt);
          await expect(frame(page).locator('[data-program-editor-card="academy"]')).toContainText("Hidden from your website");
          await page.reload(); await expect(frame(page).locator('[data-program-editor-card]')).toHaveCount(3); expect(state.errors).toEqual([]);
        });
        test("same-open guard keeps uncertain command immutable and refuses unknown discard", async ({ page }) => {
          const state = await backend(page, origin); await open(page, theme); await edit(page); await dialog(page).getByLabel("Display title", { exact: true }).fill("Guard version"); await done(page);
          state.programOutcome = "uncertain";
          await page.getByRole("link", { name: "Roster", exact: true }).click();
          const guard = page.getByRole("dialog", { name: "Save your changes first?", exact: true });
          await guard.getByRole("button", { name: "Keep editing", exact: true }).click(); await expect(page.getByRole("link", { name: "Roster", exact: true })).toBeFocused();
          await page.getByRole("link", { name: "Roster", exact: true }).click(); await guard.getByRole("button", { name: "Save and leave", exact: true }).click(); await expect(guard.getByRole("alert")).toBeVisible();
          await guard.getByRole("button", { name: "Discard changes", exact: true }).click(); await expect(guard.getByRole("alert")).toContainText("could not be discarded");
          await expect(page.locator('output[aria-label="Current page"]')).toHaveText("Programs");
          await guard.getByRole("button", { name: "Save and leave", exact: true }).click(); await expect(guard).not.toBeVisible();
          await expect(page.getByRole("status", { name: "Current page" })).toHaveText("/admin/roster");
          expect(state.posts).toHaveLength(2); expect(state.posts[1].body).toEqual(state.posts[0].body); expect(state.posts[1].recovery).toBe("1"); expect(state.errors).toEqual([]);
        });
        test("partial copy failure preserves its draft and confirmed program is not resubmitted", async ({ page }) => {
          const state = await backend(page, origin); await open(page, theme); await edit(page); await dialog(page).getByLabel("Display title", { exact: true }).fill("Saved program"); await done(page);
          await page.getByRole("button", { name: "Homepage band", exact: true }).click(); await dialog(page).getByLabel("Heading", { exact: true }).fill("Words still here"); await done(page); state.copyFailure = true;
          await headerSave(page).click(); await expect(page.getByRole("alert")).toContainText("Page words could not be saved.");
          await expect(headerSave(page)).toBeEnabled(); await page.getByRole("button", { name: "Homepage band", exact: true }).click(); await expect(dialog(page).getByLabel("Heading", { exact: true })).toHaveValue("Words still here"); await done(page);
          await headerSave(page).click(); await expect(headerSave(page)).toHaveAttribute("data-state", "saved"); await expect(headerSave(page)).toHaveAccessibleName("Saved");
          expect(state.posts.map(post => post.kind)).toEqual(["program", "copy", "copy"]); expect(state.rows[0].display_title).toBe("Saved program"); expect(state.copy.pathway_heading).toBe("Words still here"); expect(state.errors).toEqual([]);
        });
        test("conflict review keeps drafts and destructive reset asks before discarding", async ({ page }) => {
          const state = await backend(page, origin); await open(page, theme); await edit(page); await dialog(page).getByLabel("Display title", { exact: true }).fill("My reviewed draft"); await done(page); state.programOutcome = "conflict";
          await headerSave(page).click(); const review = page.getByRole("region", { name: "Review latest program", exact: true }); await expect(review).toContainText("Saved elsewhere");
          await review.getByRole("button", { name: "Keep my draft", exact: true }).click(); await headerSave(page).click(); await expect(headerSave(page)).toHaveAttribute("data-state", "saved"); await expect(headerSave(page)).toHaveAccessibleName("Saved"); expect(state.rows[0].display_title).toBe("My reviewed draft");
          await edit(page); await dialog(page).getByLabel("Display title", { exact: true }).fill("Draft to discard"); await done(page); state.programOutcome = "conflict"; await headerSave(page).click(); await expect(review).toBeVisible();
          await review.getByRole("button", { name: "Use latest saved page", exact: true }).click(); const confirm = page.getByRole("dialog", { name: "Use the latest saved page?", exact: true });
          await expect(confirm).toBeVisible(); await confirm.getByRole("button", { name: "Cancel", exact: true }).click(); await expect(review).toBeVisible();
          await review.getByRole("button", { name: "Use latest saved page", exact: true }).click(); await confirm.getByRole("button", { name: "Use latest saved page", exact: true }).click(); await expect(review).toHaveCount(0);
          await edit(page); await expect(dialog(page).getByLabel("Display title", { exact: true })).toHaveValue("Saved elsewhere"); expect(state.errors).toEqual([]);
        });
        test("photos wait before URI then gallery reorder remove and cleanup stay owned", async ({ page }) => {
          const state = await backend(page, origin); await open(page, theme); await edit(page); await section(page, "Photos");
          state.uploadGate = gate();
          await dialog(page).getByLabel("Choose hero image", { exact: true }).setInputFiles({ name: "hero.png", mimeType: "image/png", buffer: png });
          await expect.poll(() => state.uploads).toBe(1); await expect(dialog(page).getByRole("button", { name: "Done", exact: true })).toBeDisabled();
          expect(state.posts).toHaveLength(0); state.uploadGate.release(); state.uploadGate = null;
          await expect(dialog(page).getByRole("button", { name: "Done", exact: true })).toBeEnabled();
          await section(page, "Sign-up");
          for (const name of ["one.png", "two.png"]) { await dialog(page).getByLabel("Choose gallery image", { exact: true }).setInputFiles({ name, mimeType: "image/png", buffer: png }); await expect.poll(() => state.assets.length).toBe(name === "one.png" ? 2 : 3); }
          await dialog(page).getByLabel("Gallery image 1 description", { exact: true }).fill("Players together"); await dialog(page).getByRole("button", { name: "Move gallery image 1 down", exact: true }).click(); await expect(dialog(page).getByLabel("Gallery image 2 description", { exact: true })).toHaveValue("Players together");
          await dialog(page).getByRole("button", { name: "Remove gallery image 1", exact: true }).click(); await done(page); await headerSave(page).click(); await expect(headerSave(page)).toHaveAttribute("data-state", "saved"); await expect(headerSave(page)).toHaveAccessibleName("Saved");
          expect(state.posts[0].body.gallery).toHaveLength(1); expect(state.posts[0].body.gallery[0].alt).toBe("Players together"); expect(state.cleanups).toHaveLength(1); expect(state.cleanups[0]).toContain("two.png");
          await edit(page); await section(page, "Photos"); await dialog(page).getByLabel("Choose detail image", { exact: true }).setInputFiles({ name: "unused.png", mimeType: "image/png", buffer: png }); await expect.poll(() => state.assets.length).toBe(4); await done(page);
          state.cleanupFailure = true; await page.getByRole("link", { name: "Roster", exact: true }).click(); const guard = page.getByRole("dialog", { name: "Save your changes first?", exact: true }); await guard.getByRole("button", { name: "Discard changes", exact: true }).click(); await expect(guard.getByRole("alert")).toBeVisible();
          await guard.getByRole("button", { name: "Discard changes", exact: true }).click(); await expect(guard).not.toBeVisible(); expect(state.cleanups).toHaveLength(2); expect(state.cleanups[1]).toContain("unused.png"); expect(state.errors).toEqual([]);
        });
        test("loading phases use fixed authored skeleton and measured public canvas", async ({ page }, info) => {
          await page.addInitScript(() => {
            const samples: unknown[] = [];
            Object.assign(window, { __cl21LoadingSamples: samples });
            let remaining = 1800;
            function sample() {
              const root = document.querySelector<HTMLElement>(".classic-programs-canvas");
              const skeleton = root?.querySelector<HTMLElement>(".classic-programs-loading");
              const child = root?.querySelector<HTMLIFrameElement>("iframe");
              if (root && skeleton) {
                const box = root.getBoundingClientRect(), style = getComputedStyle(skeleton);
                samples.push({ time: performance.now(), phase: root.dataset.programsPhase, top: box.top, height: box.height, skeletonOpacity: style.opacity, skeletonBackground: style.backgroundColor, frameHeight: child?.getBoundingClientRect().height, publicBackground: child?.contentDocument?.body ? getComputedStyle(child.contentDocument.body).backgroundColor : null });
              }
              if (--remaining > 0) requestAnimationFrame(sample);
            }
            requestAnimationFrame(sample);
          });
          const state = await backend(page, origin); state.readGate = gate(); await open(page, theme, "", false);
          await expect(page.locator(".classic-programs-canvas")).toHaveAttribute("data-programs-phase", "skeleton");
          const skeleton = page.locator(".classic-programs-loading"); await expect(skeleton).toBeVisible();
          const before = await skeleton.locator(":scope > div").evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height)); await page.screenshot({ path: info.outputPath("loading-opaque.png") });
          expect(await skeleton.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
          const cdp = await page.context().newCDPSession(page);
          state.readGate.release(); state.readGate = null;
          await expect.poll(() => page.locator(".classic-programs-canvas").getAttribute("data-programs-phase"), { intervals: [16], timeout: 5000 }).toBe("crossfade");
          const fade = await cdp.send("Page.captureScreenshot", { format: "png" });
          await writeFile(info.outputPath("loading-first-fade.png"), Buffer.from(fade.data, "base64"));
          await expect(page.locator(".classic-programs-canvas")).toHaveAttribute("data-programs-phase", "content");
          const samples = await page.evaluate(() => (window as typeof window & { __cl21LoadingSamples: any[] }).__cl21LoadingSamples);
          expect(samples.some(sample => sample.phase === "skeleton")).toBe(true); expect(samples.some(sample => sample.phase === "crossfade")).toBe(true);
          await writeFile(info.outputPath("loading-phases.json"), JSON.stringify({ authoredBefore: before, samples, unknownInitialExtent: true }, null, 2));
          const after = await skeleton.locator(":scope > div").evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height)); expect(after).toEqual(before);
          const frameHeight = await page.locator(".classic-programs-render iframe").evaluate(element => element.getBoundingClientRect().height); expect(frameHeight).toBeGreaterThan(600);
          await page.getByRole("button", { name: "Phone", exact: true }).click(); expect((await page.locator(".classic-programs-render iframe").boundingBox())!.width).toBeLessThanOrEqual(390);
          await page.screenshot({ path: info.outputPath("settled-phone.png"), fullPage: true }); await geometry(page, width); expect(state.errors).toEqual([]);
        });
      });
    }
test.describe("edge controls", () => {
  test.use({ viewport: { width: 320, height: 480 }, contextOptions: { reducedMotion: "reduce" } });
  test("long empty fields validation native keyboard and short phone sheet", async ({ page }) => {
    const state = await backend(page, origin); state.rows[0].display_title = "A".repeat(120); state.rows[0].summary = "長".repeat(320); state.rows[0].highlights = []; await open(page); await geometry(page, 320);
    await frame(page).locator('[data-program-editor-card="academy"]').focus(); await page.keyboard.press("Enter"); await expect(dialog(page).getByLabel("Navigation label", { exact: true })).toBeFocused(); await dialog(page).getByLabel("Display title", { exact: true }).clear(); await done(page); await headerSave(page).click(); await expect(page.getByRole("alert")).toContainText("Review the highlighted fields"); await expect(headerSave(page)).toHaveAttribute("data-state", "dirty");
    await edit(page); await expect(dialog(page).getByLabel("Display title", { exact: true })).toHaveAttribute("aria-invalid", "true"); expect(await checkAdminDialog(page)).toEqual([]); await page.keyboard.press("Escape"); await expect(frame(page).locator('[data-program-editor-card="academy"]')).toBeFocused(); expect(state.posts).toHaveLength(0); expect(state.errors).toEqual([]);
  });
  test("unsupported template never reads or mounts program data", async ({ page }) => {
    const state = await backend(page, origin); await page.goto(origin + "/tests/browser/fixtures/admin-cl-21/?unsupported=1"); await expect(page.locator(".classic-programs")).toHaveCount(0); await page.waitForTimeout(100); expect(state.reads).toEqual([]); expect(state.posts).toEqual([]); expect(state.errors).toEqual([]);
  });
  test("legacy portal retains inspector layout and original field controls", async ({ page }) => {
    const state = await backend(page, origin); await page.setViewportSize({ width: 1280, height: 900 }); await open(page, "light", "&legacy=1", false); await expect(page.locator(".program-editor-navigation").getByRole("button", { name: /^Manage programs/ })).toBeVisible(); await expect(page.locator(".classic-programs")).toHaveCount(0); await expect(page.locator(".program-canvas-browser iframe")).toBeVisible(); expect(state.errors).toEqual([]);
  });
  test("gallery preserves the actual twelve image limit and image validation", async ({ page }) => {
    const state = await backend(page, origin);
    state.media = Array.from({ length: 12 }, (_, index) => ({ id: "gallery-" + index, program_id: ids[0], media_asset_id: "asset-" + index, alt: "Training " + index, sort_order: index, updated_at: state.rows[0].updated_at, url: origin + "/__cl21__/asset/" + index }));
    await open(page); await edit(page); await section(page, "Sign-up");
    await expect(dialog(page).getByLabel("Choose gallery image", { exact: true })).toBeDisabled(); await expect(dialog(page).getByRole("textbox", { name: /Gallery image \d+ description/ })).toHaveCount(12);
    await dialog(page).getByRole("button", { name: "Remove gallery image 12", exact: true }).click(); await dialog(page).getByLabel("Choose gallery image", { exact: true }).setInputFiles({ name: "invalid.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") }); await expect(dialog(page).locator("[data-admin-image-error]")).toContainText("JPG"); expect(state.uploads).toBe(0);
    await dialog(page).getByLabel("Choose gallery image", { exact: true }).setInputFiles({ name: "valid.png", mimeType: "image/png", buffer: png }); await expect(dialog(page).getByRole("textbox", { name: /Gallery image \d+ description/ })).toHaveCount(12); await done(page); await headerSave(page).click(); await expect(headerSave(page)).toHaveAttribute("data-state", "saved"); await expect(headerSave(page)).toHaveAccessibleName("Saved"); expect(state.posts[0].body.gallery).toHaveLength(12); expect(state.errors).toEqual([]);
  });
  test("confirmed uncertain program precedes a fresh directory command without rebasing replay", async ({ page }) => {
    const state = await backend(page, origin); await open(page); await edit(page); await dialog(page).getByLabel("Display title", { exact: true }).fill("Pending program plus order"); await done(page); await page.getByRole("button", { name: "Order and visibility", exact: true }).click(); await dialog(page).getByRole("button", { name: "Move Academy Pathway down", exact: true }).click(); await done(page); state.programOutcome = "uncertain";
    await headerSave(page).click(); await expect(page.getByRole("alert")).toContainText("Save is unconfirmed."); await expect(headerSave(page)).toBeEnabled(); await headerSave(page).click(); await expect(headerSave(page)).toHaveAttribute("data-state", "saved"); await expect(headerSave(page)).toHaveAccessibleName("Saved");
    expect(state.posts.map(post => post.kind)).toEqual(["program", "program", "directory"]); expect(state.posts[1].body).toEqual(state.posts[0].body); const receipt = state.receipts.get(state.posts[1].body.operationId); expect(state.posts[2].body.expected.find((item: any) => item.id === ids[0]).updatedAt).toBe(receipt.program.updated_at); expect(state.errors).toEqual([]);
  });
  test("uncertain directory retains its exact UUID payload and original versions", async ({ page }) => {
    const state = await backend(page, origin); await open(page); await page.getByRole("button", { name: "Order and visibility", exact: true }).click(); await dialog(page).getByRole("button", { name: "Move Academy Pathway down", exact: true }).click(); await done(page); state.directoryOutcome = "uncertain";
    await headerSave(page).click(); await expect(page.getByRole("alert")).toContainText("Save is unconfirmed."); await expect(headerSave(page)).toBeEnabled(); await headerSave(page).click(); await expect(headerSave(page)).toHaveAttribute("data-state", "saved"); await expect(headerSave(page)).toHaveAccessibleName("Saved");
    expect(state.posts).toHaveLength(2); expect(state.posts[1].body).toEqual(state.posts[0].body); expect(state.posts[1].recovery).toBe("1"); expect(state.rows.map(row => row.id)).toEqual([ids[1], ids[0], ids[2]]); expect(state.errors).toEqual([]);
  });
  test("invalid registration link reopens its section and focuses the error", async ({ page }) => {
    const state = await backend(page, origin); await open(page); await edit(page); await section(page, "Sign-up"); await dialog(page).getByLabel("Button label", { exact: true }).fill("Join"); await dialog(page).getByLabel("Button link", { exact: true }).fill("javascript:alert(1)"); await done(page); await headerSave(page).click(); await expect(page.getByRole("alert")).toContainText("Review the highlighted fields"); await expect(headerSave(page)).toHaveAttribute("data-state", "dirty");
    await edit(page); await expect(dialog(page).getByRole("navigation", { name: "Program editor sections" }).getByRole("button", { name: "Sign-up", exact: true })).toHaveAttribute("aria-current", "true"); await expect(dialog(page).getByLabel("Button link", { exact: true })).toHaveAttribute("aria-invalid", "true"); await expect(dialog(page).getByLabel("Button link", { exact: true })).toBeFocused();
    await section(page, "Photos"); await done(page); await edit(page); await expect(dialog(page).getByRole("navigation", { name: "Program editor sections" }).getByRole("button", { name: "Sign-up", exact: true })).toHaveAttribute("aria-current", "true"); await expect(dialog(page).getByLabel("Button link", { exact: true })).toBeFocused();
    await done(page); await frame(page).locator('[data-program-editor-card="futsal"]').click(); const guard = page.getByRole("dialog", { name: "Save your changes first?", exact: true }); await guard.getByRole("button", { name: "Discard changes", exact: true }).click(); await expect(guard).not.toBeVisible(); await expect(dialog(page).getByRole("navigation", { name: "Program editor sections" }).getByRole("button", { name: "Basics", exact: true })).toHaveAttribute("aria-current", "true"); await expect(dialog(page).getByLabel("Navigation label", { exact: true })).toHaveValue("Futsal"); expect(state.posts).toHaveLength(0); expect(state.errors).toEqual([]);
  });
  test("permission rejection keeps the draft and makes no confirmed success claim", async ({ page }) => {
    const state = await backend(page, origin); await open(page); await edit(page); await dialog(page).getByLabel("Display title", { exact: true }).fill("Denied change"); await section(page, "Sign-up"); await dialog(page).getByLabel("Button label", { exact: true }).fill("Join"); await dialog(page).getByLabel("Button link", { exact: true }).fill("https://example.test/join"); await done(page); state.programOutcome = "denied"; await headerSave(page).click(); await expect(page.getByRole("alert")).toContainText("You cannot save this program."); await expect(headerSave(page)).toHaveAttribute("data-state", "dirty"); await edit(page); await expect(dialog(page).getByRole("navigation", { name: "Program editor sections" }).getByRole("button", { name: "Basics", exact: true })).toHaveAttribute("aria-current", "true"); await expect(dialog(page).getByLabel("Display title", { exact: true })).toHaveValue("Denied change"); expect(state.rows[0].display_title).toBe("Academy Pathway"); expect(state.errors).toEqual([]);
  });
});

for(const width of [390,1280]){
test.describe("EARLY "+width+"px",()=>{
 test.use({viewport:{width,height:width===390?844:900},colorScheme:"light",contextOptions:{reducedMotion:"reduce"}});
 test("enabled navigation guard retries original request during header saving display",async({page},info)=>{
  const state=await backend(page,origin);await open(page);await edit(page);await dialog(page).getByLabel("Display title",{exact:true}).fill("Early guard original");await done(page);
  await expect.poll(()=>page.evaluate(()=>matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  await headerSave(page).scrollIntoViewIfNeeded();
  await page.evaluate(()=>{
   const samples:any[]=[];let firstSaving:number|null=null;
   const read=()=>{const area=document.querySelector(".classic-programs-header-actions");const save=area?.querySelector("[data-admin-save-button]");const pending=area?.querySelector('button[aria-busy="true"]');const phase=save?.getAttribute("data-state")??(pending?"saving-pending":"other");if(firstSaving===null&&phase==="saving")firstSaving=performance.now();return{at:performance.now(),phase,text:pending?.textContent??save?.textContent??null}};
   const observer=new MutationObserver(()=>samples.push(read()));observer.observe(document.documentElement,{subtree:true,attributes:true,childList:true});
   const keys:any[]=[];document.addEventListener("keydown",(e)=>{if(e.key==="Enter"){const target=e.target as HTMLElement;keys.push({...read(),firstSaving,elapsed:firstSaving===null?null:performance.now()-firstSaving,role:target.getAttribute("role"),text:target.textContent,disabled:(target as HTMLButtonElement).disabled??null,ariaDisabled:target.getAttribute("aria-disabled")})}},true);
   (window as any).__cl21Early={samples,keys,stop:()=>observer.disconnect()};
  });
  state.programOutcome="uncertain";state.postGate=gate();
  try{
   await headerSave(page).click();
   await expect.poll(()=>state.posts.length).toBe(1);
   for(let i=0;i<12;i++){if(await page.getByRole("link",{name:"Roster",exact:true}).evaluate(e=>e===document.activeElement))break;await page.keyboard.press("Shift+Tab");}
   await expect(page.getByRole("link",{name:"Roster",exact:true})).toBeFocused();await page.keyboard.press("Enter");
   const guard=page.getByRole("dialog",{name:"Save your changes first?",exact:true});const action=guard.getByRole("button",{name:"Save and leave",exact:true});
   await expect(action).toBeFocused();state.postGate.release();state.postGate=null;
   await expect(page.locator(".classic-programs-header-actions button[aria-busy=\"true\"]")).toHaveCount(1);
   await expect(action).toBeEnabled();await page.keyboard.press("Enter");
   const key=await page.evaluate(()=>(window as any).__cl21Early.keys.filter((x:any)=>x.text?.startsWith("Save and leave")).at(-1));expect(key).toBeTruthy();expect(key.phase).toBe("saving-pending");expect(key.disabled).toBe(false);expect(key.ariaDisabled).toBeNull();expect(key.elapsed).toBeGreaterThanOrEqual(0);expect(key.elapsed).toBeLessThan(400);
   await expect(page.locator('output[aria-label="Current page"]')).toHaveText("/admin/roster",{timeout:2000});
   expect(state.posts).toHaveLength(2);expect(state.posts[1].body).toEqual(state.posts[0].body);expect(state.posts[1].recovery).toBe("1");expect(state.rows[0].display_title).toBe("Early guard original");expect(state.errors).toEqual([]);
  }finally{
   state.postGate?.release();
   const observation=await page.evaluate(()=>{const x=(window as any).__cl21Early;x.stop();return{samples:x.samples,keys:x.keys}});
   await writeFile(info.outputPath("early-guard-proof.json"),JSON.stringify({width,observation,posts:state.posts,currentPage:await page.locator('output[aria-label="Current page"]').textContent(),guardErrors:await page.getByRole("dialog",{name:"Save your changes first?",exact:true}).getByRole("alert").allTextContents(),errors:state.errors},null,2));
   await page.screenshot({path:info.outputPath("early-guard.png"),fullPage:true});
  }
 });
});
}
