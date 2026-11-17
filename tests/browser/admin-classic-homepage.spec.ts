import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { ViteDevServer } from "vite";
import { homepageDraft } from "../fixtures/homepage-editor";
import { resolveHomepageBindings, resolveHomepageCapabilities, type HomepageRenderer } from "../../lib/homepage-editor/capabilities";
import { checkAdminDialog } from "./helpers/admin-design-checks";
const repo = process.cwd();
const evidence = resolve(repo, process.env.CL17_EVIDENCE_DIR ?? ".codex-work/admin-cl-17/browser");
let server: ViteDevServer | undefined;
let origin: string;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAYAAAChS3wfAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAlElEQVRogeXOMQEAIAzAsMqeFrTgjcnIwZE/zbnvZ+mAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgJYOaOmAlg5o6YCWDmjpgLb69Z3wSh87CQAAAABJRU5ErkJggg==", "base64");
function gate() { let release = () => { }; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
test.beforeAll(async () => {
    await mkdir(evidence, { recursive: true });
    const { createServer } = await import("vite");
    const fixture = resolve(repo, "tests/browser/fixtures/admin-cl-17");
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
    if (!address || typeof address === "string")
        throw Error("No fixture address");
    origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { await server?.close(); });
test.afterEach(async ({ page }, info) => { if (info.status !== info.expectedStatus)
    await page.screenshot({ path: info.outputPath("failure.png"), fullPage: true }); });
async function backend(page: Page, kind: "academy" | "clubhouse" | "default" | "fixed" = "academy") {
    const design: HomepageRenderer = { templateKey: kind === "academy" ? "academy@1" : kind === "clubhouse" ? "clubhouse@1" : null, slideshowVariant: kind === "academy" ? "none" : "matchday", heroVariant: kind === "fixed" ? "legacy-fixed" : "editable" };
    const binding = resolveHomepageBindings({ capabilities: resolveHomepageCapabilities(design) });
    const content = homepageDraft();
    content.photos.items = content.photos.items.map(photo => ({ ...photo, url: origin + "/__cl17__/asset/" + photo.clientId }));
    const state = { snapshot: { revision: "1", designRevision: "fixture-design-1", design: { ...design, binding: { key: binding.key, revision: binding.revision } }, content, media: [], videoSource: "" }, posts: [] as any[], cleanups: [] as string[], uploads: 0, failUpload: false, finalized: [] as string[], expectedHttpErrors: 0, errors: [] as string[], readGate: null as ReturnType<typeof gate> | null, postGate: null as ReturnType<typeof gate> | null, uploadGate: null as ReturnType<typeof gate> | null, uncertain: false };
    page.on("pageerror", error => state.errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") {
        if (state.expectedHttpErrors && message.text().includes("503"))
            state.expectedHttpErrors--;
        else
            state.errors.push(message.text());
    } });
    await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) {
            if (url.hostname === "vz-dab9684b-901.b-cdn.net" && /^\/(e49b4657-7396-48d7-b55b-09d38d892c72|f84f9cbb-4b03-43f8-94f3-33010680533e)\/play_720p\.mp4$/.test(url.pathname) && route.request().method() === "GET")
                return route.fulfill({ status: 200, contentType: "video/mp4", body: Buffer.alloc(0) });
            if (url.hostname === "127.0.0.1" && url.port === "54321" && url.pathname.includes("/storage/"))
                return route.fulfill({ contentType: "image/png", body: png });
            return route.abort();
        }
        if (url.pathname === "/favicon.ico" || url.pathname.startsWith("/__cl17__/asset/") || url.pathname.startsWith("/images/"))
            return route.fulfill({ contentType: "image/png", body: png });
        if (url.pathname === "/__cl17__/data") {
            const request = route.request().postDataJSON();
            return route.fulfill({ json: { error: null, data: request.single ? null : [], count: 0 } });
        }
        if (url.pathname === "/__cl17__/upload") {
            state.uploads++;
            await state.uploadGate?.promise;
            if (state.failUpload) {
                state.failUpload = false;
                return route.fulfill({ json: { data: null, error: { message: "This file could not be added." } } });
            }
            const assetId = crypto.randomUUID();
            state.finalized.push(assetId);
            return route.fulfill({ json: { data: { assetId, path: url.searchParams.get("path") }, error: null } });
        }
        if (url.pathname === "/api/admin/homepage/upload-cleanup") {
            state.cleanups.push(route.request().postDataJSON().assetId);
            return route.fulfill({ json: { ok: true } });
        }
        if (url.pathname !== "/api/admin/homepage")
            return route.continue();
        if (route.request().method() === "GET") {
            await state.readGate?.promise;
            return route.fulfill({ json: state.snapshot });
        }
        const request = route.request().postDataJSON();
        state.posts.push(request);
        await state.postGate?.promise;
        if (state.uncertain) {
            state.uncertain = false;
            state.expectedHttpErrors++;
            return route.fulfill({ status: 503, json: { error: { code: "SAVE_UNCERTAIN", message: "We could not confirm your save. Your changes are still here." } } });
        }
        const next = structuredClone(state.snapshot.content);
        if (request.sections.hero)
            Object.assign(next.hero, request.sections.hero);
        if (request.sections.story)
            next.story = request.sections.story;
        if (request.sections.video)
            next.video = request.sections.video;
        if (request.sections.photos)
            next.photos = { seasonLabel: request.sections.photos.seasonLabel ?? next.photos.seasonLabel, items: request.sections.photos.items.map((photo: any) => ({ ...photo, rowId: photo.rowId ?? crypto.randomUUID(), url: origin + "/__cl17__/asset/" + photo.clientId, upload: "ready" })) };
        state.snapshot = { ...state.snapshot, revision: String(Number(state.snapshot.revision) + 1), content: next };
        return route.fulfill({ json: state.snapshot });
    });
    return state;
}
async function open(page: Page, theme: string, kind = "academy", wait = true) {
    await page.goto(`${origin}/tests/browser/fixtures/admin-cl-17/?theme=${theme}&${kind}=1`);
    await expect(page.getByRole("heading", { level: 1, name: "Homepage", exact: true })).toBeVisible();
    if (wait)
        await expect(page.frameLocator(".hc-canvas iframe").locator('[data-homepage-piece="' + (kind === "fixed" ? "photos" : "hero.heading") + '"]')).toBeVisible();
}
const frame = (page: Page) => page.frameLocator(".hc-canvas iframe");
const save = (page: Page) => page.locator("[data-admin-save-button]").first();
async function done(page: Page) { await page.getByRole("dialog").filter({ visible: true }).getByRole("button", { name: "Done", exact: true }).click(); }
async function geometry(page: Page, width: number) {
    await expect.poll(() => save(page).evaluate(element => element.getAnimations().filter(animation =>
        Number.isFinite(animation.effect?.getComputedTiming().endTime) &&
        (animation.pending || (animation.playState !== "finished" && animation.playState !== "idle")),
    ).length)).toBe(0);
    const box = await save(page).boundingBox();
    const header = await page.locator(".hc-heading").boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(150);
    expect(box!.height).toBeGreaterThanOrEqual(width <= 700 ? 44 : 38);
    if (width <= 640)
        expect(Math.abs(box!.width - header!.width)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
for (const width of [320, 390, 1280])
    for (const theme of ["light", "dark"] as const)
        for (const motion of ["no-preference", "reduce"] as const) {
            test.describe(`${width}px ${theme} ${motion}`, () => {
                test.use({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: theme, contextOptions: { reducedMotion: motion } });
                test("Hero dialog edits all existing fields and header Save keeps exact uncertain retry", async ({ page }, info) => {
                    const state = await backend(page);
                    await open(page, theme);
                    await geometry(page, width);
                    await page.locator(".hc-canvas iframe").hover();
                    await page.mouse.wheel(0, 450);
                    await expect.poll(() => frame(page).locator("html").evaluate(() => scrollY)).toBeGreaterThan(0);
                    await page.mouse.wheel(0, -450);
                    await expect.poll(() => frame(page).locator("html").evaluate(() => scrollY)).toBe(0);
                    await frame(page).locator('[data-homepage-piece="hero.heading"]').click();
                    const dialog = page.getByRole("dialog", { name: "Hero", exact: true });
                    await expect(dialog).toBeVisible();
                    expect(await checkAdminDialog(page)).toEqual([]);
                    await dialog.getByLabel("Line one", { exact: true }).fill("Homepage dialog headline");
                    await dialog.getByLabel("Short paragraph", { exact: true }).fill("A newer community introduction.");
                    await expect(dialog.getByText("31/320 characters")).toBeVisible();
                    await expect(dialog.getByLabel("Where the button goes")).toHaveCount(2);
                    await expect(frame(page).locator('[data-homepage-piece="hero.heading"]')).toContainText("Homepage dialog headline");
                    expect(state.posts).toHaveLength(0);
                    await done(page);
                    await expect(frame(page).locator('[data-homepage-piece="hero.heading"]')).toBeFocused();
                    await frame(page).locator('[data-homepage-piece="story.text"]').click();
                    await page.getByRole("dialog", { name: "Our story", exact: true }).getByLabel("Main heading", { exact: true }).fill("Our shared story");
                    await done(page);
                    state.uncertain = true;
                    await save(page).click();
                    await expect(page.getByRole("alert")).toContainText("could not confirm");
                    await expect(save(page)).toHaveAttribute("data-state", "dirty");
                    await save(page).click();
                    await expect(save(page)).toHaveAttribute("data-state", "saved");
                    expect(state.posts).toHaveLength(2);
                    expect(state.posts[1]).toEqual(state.posts[0]);
                    expect(state.snapshot.content.hero.headline_line_one).toBe("Homepage dialog headline");
                    expect(state.snapshot.content.story.heading).toBe("Our shared story");
                    expect(state.posts[1].sections).toHaveProperty("story");
                    await expect(page.getByRole("alert")).toHaveCount(0);
                    await geometry(page, width);
                    await page.screenshot({ path: info.outputPath("hero-saved.png"), fullPage: true });
                    expect(state.errors).toEqual([]);
                });
                test("same-open navigation guard retries latest edits and keeps failed saves on the page", async ({ page }) => {
                    const state = await backend(page);
                    await open(page, theme);
                    await frame(page).locator('[data-homepage-piece="hero.heading"]').click();
                    await page.getByLabel("Line one", { exact: true }).fill("First guard version");
                    await done(page);
                    state.uncertain = true;
                    await page.getByRole("link", { name: "Roster", exact: true }).click();
                    const guard = page.getByRole("dialog", { name: "Save your changes first?" });
                    await expect(guard.getByText("Your browser draft and any unconfirmed save will be kept when you leave.")).toHaveCount(0);
                    await guard.getByRole("button", { name: "Keep editing" }).click();
                    await expect(page.getByRole("link", { name: "Roster", exact: true })).toBeFocused();
                    await page.getByRole("link", { name: "Roster", exact: true }).click();
                    await guard.getByRole("button", { name: "Save and leave" }).click();
                    await expect(guard.getByRole("alert")).toBeVisible();
                    const retained = guard.getByText("Your browser draft and any unconfirmed save will be kept when you leave.");
                    await expect(retained).toBeVisible();
                    const retentionId = await retained.getAttribute("id");
                    expect((await guard.getAttribute("aria-describedby"))?.split(" ")).toContain(retentionId);
                    await guard.getByRole("button", { name: "Save and leave" }).click();
                    await expect(guard).not.toBeVisible();
                    await expect(page.getByRole("status", { name: "Current page" })).toHaveText("/admin/roster");
                    expect(state.posts).toHaveLength(2);
                    expect(state.posts[1]).toEqual(state.posts[0]);
                    expect(state.errors).toEqual([]);
                });
                test("photo rows preserve description, reordering and Undo after Done", async ({ page }, info) => {
                    const state = await backend(page, "default");
                    await open(page, theme, "default");
                    await frame(page).locator('[data-homepage-piece="photos"]').click();
                    const dialog = page.getByRole("dialog", { name: "Photo slideshow", exact: true });
                    await expect(dialog).toBeVisible();
                    expect(await checkAdminDialog(page)).toEqual([]);
                    await expect(dialog.getByText("Slide 1", { exact: true })).toBeVisible();
                    await dialog.getByLabel("Describe this photo").first().fill("A team training together");
                    await dialog.getByRole("button", { name: "Move photo 1 down" }).click();
                    await expect(dialog.getByLabel("Describe this photo").last()).toHaveValue("A team training together");
                    await dialog.getByRole("button", { name: "Remove photo 1" }).click();
                    await expect(dialog.getByLabel("Describe this photo")).toHaveCount(1);
                    if (width <= 700)
                        expect((await page.getByRole("button", { name: "Undo: Photo removed", exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
                    await done(page);
                    if (width <= 700)
                        expect((await page.getByRole("button", { name: "Undo: Photo removed", exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
                    await page.getByRole("button", { name: "Undo: Photo removed", exact: true }).click();
                    await frame(page).locator('[data-homepage-piece="photos"]').click();
                    await expect(dialog.getByLabel("Describe this photo")).toHaveCount(2);
                    await page.screenshot({ path: info.outputPath("photos-restored.png"), fullPage: true });
                    await done(page);
                    await save(page).click();
                    await expect(save(page)).toHaveAttribute("data-state", "saved");
                    expect(state.posts[0].sections.photos.items.map((photo: any) => photo.alt)).toEqual(["Players training in photo 2", "A team training together"]);
                    await frame(page).locator('[data-homepage-piece="photos"]').click();
                    state.failUpload = true;
                    await dialog.locator('input[type="file"]').setInputFiles({ name: "retry.png", mimeType: "image/png", buffer: png });
                    await expect(dialog.locator(".hc-photo-status").getByRole("alert")).toContainText("This photo could not be added");
                    await dialog.getByRole("button", { name: "Try this photo again", exact: true }).click();
                    await expect(dialog.locator("[data-photo-id]")).toHaveCount(3);
                    await expect(dialog.locator(".hc-photo-status")).toHaveCount(0);
                    state.uploadGate = gate();
                    await dialog.locator('input[type="file"]').setInputFiles({ name: "removed-pending.png", mimeType: "image/png", buffer: png });
                    await expect(dialog.locator(".hc-photo-status")).toHaveCount(1);
                    await dialog.locator(".hc-photo-status").getByRole("button", { name: "Remove photo", exact: true }).click();
                    state.uploadGate.release();
                    state.uploadGate = null;
                    await expect.poll(() => state.cleanups.length).toBe(1);
                    expect(state.cleanups[0]).toBe(state.finalized.at(-1));
                    await expect(dialog.locator("[data-admin-photo-message]")).toHaveText("");
                    await expect(dialog.locator("[data-photo-id]")).toHaveCount(3);
                    expect(state.errors).toEqual([]);
                });
                test("pending photo preparation prevents navigation before any upload URI exists", async ({ page }) => {
                    const state = await backend(page, "default");
                    await open(page, theme, "default");
                    await frame(page).locator('[data-homepage-piece="photos"]').click();
                    state.uploadGate = gate();
                    await page.getByRole("dialog", { name: "Photo slideshow" }).locator('input[type="file"]').setInputFiles({ name: "training.png", mimeType: "image/png", buffer: png });
                    await expect.poll(() => state.uploads).toBe(1);
                    await done(page);
                    await page.getByRole("link", { name: "Roster", exact: true }).click();
                    const guard = page.getByRole("dialog", { name: "Save your changes first?" });
                    await guard.getByRole("button", { name: "Save and leave" }).click();
                    await expect(guard.getByRole("alert")).toBeVisible();
                    expect(state.posts).toHaveLength(0);
                    state.uploadGate.release();
                    state.uploadGate = null;
                    await expect.poll(async () => (await page.locator('[data-photo-id]').count())).toBe(3);
                    await guard.getByRole("button", { name: "Save and leave" }).click();
                    await expect(guard).not.toBeVisible();
                    expect(state.posts).toHaveLength(1);
                    expect(state.posts[0].sections.photos.items).toHaveLength(3);
                    expect(state.errors).toEqual([]);
                });
                test("empty second button stays hidden through preview save reload and public rendering", async ({ page }, info) => {
                    const state = await backend(page);
                    await open(page, theme);
                    await frame(page).locator('[data-homepage-piece="hero.cta"]').click();
                    const second = page.getByRole("group", { name: "Second button", exact: true });
                    await second.getByLabel("Button text", { exact: true }).fill("   ");
                    await expect(frame(page).locator('[data-homepage-piece="hero.cta"] a')).toHaveCount(1);
                    await done(page);
                    await save(page).click();
                    await expect(save(page)).toHaveAttribute("data-state", "saved");
                    expect(state.posts[0].sections.hero.secondary_cta_label).toBe("   ");
                    expect(state.snapshot.content.hero.secondary_cta_href).toBe("/roster");
                    await page.reload();
                    await expect(frame(page).locator('[data-homepage-piece="hero.cta"] a')).toHaveCount(1);
                    await page.goto(`${origin}/tests/browser/fixtures/admin-cl-17/?academy=1&public=1&theme=${theme}`);
                    const publicHeading = page.locator("[data-cl17-public] h1");
                    await expect(publicHeading).toBeVisible();
                    await expect(publicHeading.locator("..").locator("a")).toHaveCount(1);
                    await expect(page.locator("[data-homepage-piece]")).toHaveCount(0);
                    await page.screenshot({ path: info.outputPath("public-one-button.png"), fullPage: true });
                    await open(page, theme);
                    await frame(page).locator('[data-homepage-piece="hero.cta"]').click();
                    await page.getByRole("group", { name: "Second button", exact: true }).getByLabel("Button text", { exact: true }).fill("Meet the neighbors");
                    await done(page);
                    await save(page).click();
                    await expect(save(page)).toHaveAttribute("data-state", "saved");
                    await page.goto(`${origin}/tests/browser/fixtures/admin-cl-17/?academy=1&public=1&theme=${theme}`);
                    await expect(page.locator("[data-cl17-public] h1")).toBeVisible();
                    await expect(page.getByRole("link", { name: "Meet the neighbors", exact: true })).toHaveAttribute("href", "/roster");
                    expect(state.posts).toHaveLength(2);
                    expect(state.errors).toEqual([]);
                });
                test("browser recovery reviews only changed fields and keeps newer server copy", async ({ page }, info) => {
                    const state = await backend(page);
                    await open(page, theme);
                    await frame(page).locator('[data-homepage-piece="hero.heading"]').click();
                    await page.getByLabel("Line one", { exact: true }).fill("Retained browser draft");
                    await done(page);
                    await page.waitForTimeout(900);
                    await page.reload();
                    await expect(frame(page).locator('[data-homepage-piece="hero.heading"]')).toContainText("Retained browser draft");
                    expect(state.posts).toHaveLength(0);
                    state.snapshot = { ...state.snapshot, revision: "2", content: { ...state.snapshot.content, hero: { ...state.snapshot.content.hero, intro: "Newer server introduction" } } };
                    await page.reload();
                    await expect(page.getByRole("button", { name: "Review recovered draft", exact: true })).toBeVisible();
                    await geometry(page, width);
                    await page.getByRole("button", { name: "Review recovered draft", exact: true }).click();
                    const review = page.getByRole("dialog", { name: "Recovered homepage draft", exact: true });
                    await expect(review).toContainText("Retained browser draft");
                    expect(await checkAdminDialog(page)).toEqual([]);
                    await page.screenshot({ path: info.outputPath("recovery-review.png"), fullPage: true });
                    await page.keyboard.press("Escape");
                    await expect(page.getByRole("button", { name: "Review recovered draft", exact: true })).toBeFocused();
                    await page.getByRole("button", { name: "Review recovered draft", exact: true }).click();
                    await review.getByRole("button", { name: "Use recovered changes", exact: true }).click();
                    await expect(save(page)).toBeFocused();
                    await expect(frame(page).locator('[data-homepage-piece="hero.heading"]')).toContainText("Retained browser draft");
                    await expect(frame(page).locator('[data-homepage-piece="hero.intro"]')).toHaveText("Newer server introduction");
                    expect(state.posts).toHaveLength(0);
                    await save(page).click();
                    await expect(save(page)).toHaveAttribute("data-state", "saved");
                    expect(state.posts[0].expectedRevision).toBe("2");
                    expect(state.snapshot.content.hero.intro).toBe("Newer server introduction");
                    expect(state.errors).toEqual([]);
                });
                test("photo validation rejects SVG, oversized and unreadable files before upload", async ({ page }) => {
                    const state = await backend(page, "default");
                    await open(page, theme, "default");
                    await frame(page).locator('[data-homepage-piece="photos"]').click();
                    const dialog = page.getByRole("dialog", { name: "Photo slideshow" });
                    const input = dialog.locator('input[type="file"]');
                    await input.setInputFiles({ name: "vector.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
                    await expect(dialog.locator("[data-admin-photo-message]")).toContainText("not a supported image");
                    await input.setInputFiles({ name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(16 * 1024 * 1024) });
                    await expect(dialog.locator("[data-admin-photo-message]")).toContainText("15 MB");
                    await input.setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("broken") });
                    await expect(dialog.locator("[data-admin-photo-message]")).toContainText("not a readable image");
                    expect(state.uploads).toBe(0);
                    await expect(dialog.locator("[data-photo-id]")).toHaveCount(2);
                    await input.setInputFiles({ name: "valid.png", mimeType: "image/png", buffer: png });
                    await expect(dialog.locator("[data-photo-id]")).toHaveCount(3);
                    expect(state.uploads).toBe(1);
                    expect(state.errors).toEqual([]);
                });
                test("iframe loader paints the selected theme before real preview content", async ({ page }, info) => {
                    const state = await backend(page);
                    state.readGate = gate();
                    await open(page, theme, "academy", false);
                    const loading = frame(page).locator("#homepage-frame-loading");
                    await expect(loading).toBeVisible();
                    await expect.poll(() => loading.evaluate(node => getComputedStyle(node).opacity)).toBe("1");
                    expect(await loading.evaluate(node => getComputedStyle(node).backgroundColor)).toBe(theme === "dark" ? "rgb(17, 24, 39)" : "rgb(255, 255, 255)");
                    await page.screenshot({ path: info.outputPath("iframe-loading.png"), fullPage: true });
                    state.readGate.release();
                    state.readGate = null;
                    await expect(frame(page).locator('[data-homepage-piece="hero.heading"]')).toBeVisible();
                    await expect(frame(page).locator("#homepage-frame-loading")).not.toBeVisible();
                    expect(state.errors).toEqual([]);
                });
            });
        }
test("legacy-fixed Hero stays unavailable, video source stays disabled, and whole preview uses Desktop/Phone", async ({ page }, info) => {
    const state = await backend(page, "fixed");
    await open(page, "light", "fixed");
    await expect(frame(page).locator('[data-homepage-piece^="hero."]')).toHaveCount(0);
    await frame(page).locator('[data-homepage-piece="video"]').click();
    await expect(page.getByRole("switch", { name: "Show video on homepage" })).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText("No video yet. Ask Onzio to connect one.")).toBeVisible();
    await done(page);
    await page.getByRole("button", { name: "Preview of your homepage", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Preview of your homepage", exact: true });
    await expect(dialog).toBeVisible();
    expect(await checkAdminDialog(page)).toEqual([]);
    await dialog.getByRole("button", { name: "Phone", exact: true }).click();
    expect((await dialog.locator("iframe").boundingBox())!.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: info.outputPath("whole-phone.png"), fullPage: true });
    expect(state.errors).toEqual([]);
});
test("default guard omits retention DOM before and after failed retries", async ({ page }) => {
    const state = await backend(page);
    await page.goto(`${origin}/tests/browser/fixtures/admin-cl-17/?defaultguard=1`);
    await expect(page.getByRole("heading", { name: "Default guard consumer" })).toBeVisible();
    await page.getByRole("link", { name: "Roster", exact: true }).click();
    const guard = page.getByRole("dialog", { name: "Save your changes first?" });
    await expect(guard).toBeVisible();
    const description = await guard.getAttribute("aria-describedby");
    expect(description?.split(" ")).toHaveLength(1);
    await expect(guard.locator('[id$="-retention"]')).toHaveCount(0);
    await expect(guard).toContainText("will lose those changes unless you save them");
    await guard.getByRole("button", { name: "Save and leave" }).click();
    await expect(guard.getByRole("alert")).toBeVisible();
    await expect(guard).toHaveAttribute("aria-describedby", description!);
    await expect(guard.locator('[id$="-retention"]')).toHaveCount(0);
    await guard.getByRole("button", { name: "Save and leave" }).click();
    await expect(guard).not.toBeVisible();
    await expect(page.getByRole("status", { name: "Save attempts" })).toHaveText("2");
    await page.getByLabel("Choose photos for Default photos").setInputFiles({ name: "empty-return.png", mimeType: "image/png", buffer: png });
    await expect(page.locator("[data-admin-photo-message]")).toHaveText("The photos could not be uploaded. Try again.");
    expect(state.errors).toEqual([]);
});

for (const profile of [{ width: 390, theme: "light", motion: "no-preference" }, { width: 1280, theme: "dark", motion: "reduce" }] as const) {
    test.describe(`focus replacement ${profile.width}px ${profile.theme} ${profile.motion}`, () => {
        test.use({ viewport: { width: profile.width, height: 900 }, colorScheme: profile.theme, contextOptions: { reducedMotion: profile.motion } });
        test("Story hide Done", async ({ page }, info) => {
            const state = await backend(page);
            await open(page, profile.theme);
            const piece = frame(page).locator('[data-homepage-piece="story.text"]');
            await piece.click();
            const original = await piece.elementHandle();
            const dialog = page.getByRole("dialog", { name: "Our story", exact: true });
            await expect(dialog).toBeVisible();
            await dialog.getByRole("switch", { name: "Show our story on homepage" }).click();
            await expect.poll(() => original!.evaluate(node => node.isConnected)).toBe(false);
            const replacement = frame(page).locator('[data-homepage-piece="story.text"]');
            await expect(replacement).toBeVisible();
            await done(page);
            await expect(dialog).not.toBeVisible();
            await expect(page.locator('[data-slot="admin-dialog"]')).toHaveCount(0);
            await page.screenshot({ path: info.outputPath("story-hidden-done.png"), fullPage: true });
            const observation = {
                oldConnected: await original!.evaluate(node => node.isConnected),
                replacement: await replacement.evaluate(node => ({ tag: node.tagName, piece: node.getAttribute("data-homepage-piece"), focused: node.ownerDocument.activeElement === node, active: node.ownerDocument.activeElement?.outerHTML.slice(0, 800) })),
                parent: await page.evaluate(() => ({ tag: document.activeElement?.tagName, html: document.activeElement?.outerHTML.slice(0, 800) })),
            };
            await writeFile(info.outputPath("native-focus.json"), JSON.stringify(observation, null, 2));
            try { await expect(replacement).toBeFocused(); }
            finally {
                await writeFile(info.outputPath("settled-native-focus.json"), JSON.stringify({
                    popups: await page.locator('[data-slot="admin-dialog"]').count(),
                    oldConnected: await original!.evaluate(node => node.isConnected),
                    replacement: await replacement.evaluate(node => ({ tag: node.tagName, focused: node.ownerDocument.activeElement === node, activeTag: node.ownerDocument.activeElement?.tagName, activePiece: node.ownerDocument.activeElement?.getAttribute("data-homepage-piece") })),
                    parent: await page.evaluate(() => ({ tag: document.activeElement?.tagName, save: document.activeElement?.hasAttribute("data-admin-save-button") })),
                }, null, 2));
            }
            expect(state.errors).toEqual([]);
        });
    });
}

for (const profile of [{ width: 390, theme: "light", motion: "no-preference" }, { width: 1280, theme: "dark", motion: "reduce" }] as const) {
    test.describe(`focus transitions ${profile.width}px ${profile.theme} ${profile.motion}`, () => {
        test.use({ viewport: { width: profile.width, height: 900 }, colorScheme: profile.theme, contextOptions: { reducedMotion: profile.motion } });
        test("Story hidden placeholder shows text with Escape", async ({ page }, info) => {
            const state = await backend(page);
            state.snapshot.content.story.visible = false;
            await open(page, profile.theme);
            await expect(page.locator("[data-admin-theme]").first()).toHaveAttribute("data-admin-theme", profile.theme);
            const piece = frame(page).locator('[data-homepage-piece="story.text"]');
            await expect(piece).toHaveJSProperty("tagName", "BUTTON");
            await piece.click();
            const original = await piece.elementHandle();
            const dialog = page.getByRole("dialog", { name: "Our story", exact: true });
            await dialog.getByRole("switch", { name: "Show our story on homepage" }).click();
            await expect.poll(() => original!.evaluate(node => node.isConnected)).toBe(false);
            await expect(piece).toHaveJSProperty("tagName", "DIV");
            await page.keyboard.press("Escape");
            await expect(dialog).not.toBeVisible();
            await expect(page.locator('[data-slot="admin-dialog"]')).toHaveCount(0);
            await expect(piece).toBeFocused();
            await page.screenshot({ path: info.outputPath("story-shown-escape.png"), fullPage: true });
            expect(state.errors).toEqual([]);
        });
        test("Story CTA hide Escape resolves placeholder and show Done resolves text", async ({ page }) => {
            const state = await backend(page);
            await open(page, profile.theme);
            const cta = frame(page).locator('[data-homepage-piece="story.cta"]');
            await cta.click();
            const original = await cta.elementHandle();
            const dialog = page.getByRole("dialog", { name: "Our story", exact: true });
            await expect(dialog.getByLabel("Button text", { exact: true })).toBeFocused();
            await dialog.getByRole("switch", { name: "Show our story on homepage" }).click();
            await expect.poll(() => original!.evaluate(node => node.isConnected)).toBe(false);
            const piece = frame(page).locator('[data-homepage-piece="story.text"]');
            await expect(piece).toHaveJSProperty("tagName", "BUTTON");
            await page.keyboard.press("Escape");
            await expect(dialog).not.toBeVisible();
            await expect(page.locator('[data-slot="admin-dialog"]')).toHaveCount(0);
            await expect(piece).toBeFocused();
            await page.keyboard.press("Enter");
            await expect(dialog).toBeVisible();
            const hidden = await piece.elementHandle();
            await dialog.getByRole("switch", { name: "Show our story on homepage" }).click();
            await expect.poll(() => hidden!.evaluate(node => node.isConnected)).toBe(false);
            await done(page);
            await expect(dialog).not.toBeVisible();
            await expect(page.locator('[data-slot="admin-dialog"]')).toHaveCount(0);
            await expect(piece).toHaveJSProperty("tagName", "DIV");
            await expect(piece).toBeFocused();
            expect(state.errors).toEqual([]);
        });
        test("Video source show Done and hide Escape return to current piece", async ({ page }, info) => {
            const state = await backend(page, "default");
            state.snapshot.videoSource = origin + "/__cl17__/video.mp4";
            await page.route(origin + "/__cl17__/video.mp4", route => route.fulfill({ status: 200, contentType: "video/mp4", body: Buffer.alloc(0) }));
            await open(page, profile.theme, "default");
            const piece = frame(page).locator('[data-homepage-piece="video"]');
            await expect(piece).toHaveJSProperty("tagName", "BUTTON");
            await piece.click();
            const hidden = await piece.elementHandle();
            const dialog = page.getByRole("dialog", { name: "Video feature", exact: true });
            await expect(dialog.getByRole("switch", { name: "Show video on homepage" })).not.toHaveAttribute("aria-disabled", "true");
            await dialog.getByRole("switch", { name: "Show video on homepage" }).click();
            await expect.poll(() => hidden!.evaluate(node => node.isConnected)).toBe(false);
            await expect(piece).toHaveJSProperty("tagName", "SECTION");
            await done(page);
            await expect(dialog).not.toBeVisible();
            await expect(page.locator('[data-slot="admin-dialog"]')).toHaveCount(0);
            await expect(piece).toBeFocused();
            await page.keyboard.press("Enter");
            const shown = await piece.elementHandle();
            await dialog.getByRole("switch", { name: "Show video on homepage" }).click();
            await expect.poll(() => shown!.evaluate(node => node.isConnected)).toBe(false);
            await page.keyboard.press("Escape");
            await expect(dialog).not.toBeVisible();
            await expect(page.locator('[data-slot="admin-dialog"]')).toHaveCount(0);
            await expect(piece).toHaveJSProperty("tagName", "BUTTON");
            await expect(piece).toBeFocused();
            await page.screenshot({ path: info.outputPath("video-hidden-escape.png"), fullPage: true });
            expect(state.errors).toEqual([]);
        });
        test("Final slideshow photo removal Escape returns to empty placeholder", async ({ page }, info) => {
            const state = await backend(page, "default");
            state.snapshot.content.photos.items = state.snapshot.content.photos.items.slice(0, 1);
            await open(page, profile.theme, "default");
            const piece = frame(page).locator('[data-homepage-piece="photos"]');
            await piece.click();
            const original = await piece.elementHandle();
            const dialog = page.getByRole("dialog", { name: "Photo slideshow", exact: true });
            await dialog.getByRole("button", { name: "Remove photo 1" }).click();
            await expect.poll(() => original!.evaluate(node => node.isConnected)).toBe(false);
            await expect(piece).toHaveJSProperty("tagName", "BUTTON");
            await page.keyboard.press("Escape");
            await expect(dialog).not.toBeVisible();
            await expect(page.locator('[data-slot="admin-dialog"]')).toHaveCount(0);
            await expect(piece).toBeFocused();
            await page.screenshot({ path: info.outputPath("final-photo-empty-escape.png"), fullPage: true });
            expect(state.errors).toEqual([]);
        });
        test("Connected Hero opener stays exact and later native navigation guard keeps focus", async ({ page }) => {
            const state = await backend(page);
            await open(page, profile.theme);
            const piece = frame(page).locator('[data-homepage-piece="hero.heading"]');
            await piece.click();
            const original = await piece.elementHandle();
            await page.getByLabel("Line one", { exact: true }).fill("Focus return control");
            await done(page);
            await expect(page.getByRole("dialog", { name: "Hero", exact: true })).not.toBeVisible();
            await expect(page.locator('[data-slot="admin-dialog"]')).toHaveCount(0);
            await expect(piece).toBeFocused();
            expect(await original!.evaluate(node => node.isConnected && node.ownerDocument.activeElement === node)).toBe(true);
            await page.getByRole("link", { name: "Roster", exact: true }).click();
            const guard = page.getByRole("dialog", { name: "Save your changes first?" });
            await expect(guard).toBeVisible();
            await guard.getByRole("button", { name: "Keep editing" }).click();
            await expect(guard).not.toBeVisible();
            await expect(page.locator('[data-slot="admin-dialog"]')).toHaveCount(0);
            await expect(page.getByRole("link", { name: "Roster", exact: true })).toBeFocused();
            await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
            await expect(page.getByRole("link", { name: "Roster", exact: true })).toBeFocused();
            expect(state.errors).toEqual([]);
        });
    });
}

for (const profile of [{ width: 390, theme: "light", motion: "no-preference" }, { width: 1280, theme: "dark", motion: "reduce" }] as const) {
    test.describe("retry readiness " + profile.width + "px " + profile.theme + " " + profile.motion, () => {
        test.use({ viewport: { width: profile.width, height: profile.width === 390 ? 844 : 900 }, colorScheme: profile.theme, contextOptions: { reducedMotion: profile.motion } });
        for (const placement of ["page", "section"] as const) {
            test(placement + " notification Retry accepts one eligible immutable attempt", async ({ page }, info) => {
                await page.addInitScript(() => {
                    if (window === window.top && location.pathname === "/tests/browser/fixtures/admin-cl-17/") {
                        document.cookie = "onzio-admin-theme=" + (new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light") + "; path=/";
                    }
                });
                const state = await backend(page);
                await open(page, profile.theme);
                await expect(page.locator(".admin-theme").first()).toHaveAttribute("data-admin-theme", profile.theme);
                expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(profile.motion === "reduce");
                expect(await frame(page).locator("html").evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(profile.motion === "reduce");
                await frame(page).locator('[data-homepage-piece="hero.heading"]').click();
                await page.getByRole("dialog", { name: "Hero", exact: true }).getByLabel("Line one", { exact: true }).fill("Retry readiness " + placement);
                await done(page);
                await expect(page.locator('[data-slot="admin-dialog"]')).toHaveCount(0);
                await page.evaluate(() => {
                    const samples: { time: number; save: string | null; disabled: boolean }[] = [];
                    const sample = () => {
                        const retry = [...document.querySelectorAll<HTMLButtonElement>(".hp-notification-action")].find(button => button.textContent === "Try saving again");
                        if (retry) samples.push({ time: performance.now(), save: document.querySelector(".hc-heading [data-admin-save-button]")?.getAttribute("data-state") ?? null, disabled: retry.disabled });
                    };
                    const observer = new MutationObserver(sample); observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
                    (window as any).__cl17RetryReadiness = { samples, stop: () => observer.disconnect() }; sample();
                });
                state.uncertain = true;
                if (placement === "section") state.postGate = gate();
                try {
                    await save(page).click();
                    if (placement === "section") {
                        await expect.poll(() => state.posts.length).toBe(1);
                        await frame(page).locator('[data-homepage-piece="hero.heading"]').click();
                        const popup = page.getByRole("dialog", { name: "Hero", exact: true });
                        await expect(popup).toBeVisible();
                        await expect.poll(() => popup.evaluate(element => element.getAnimations({ subtree: true }).filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime) && (animation.pending || (animation.playState !== "finished" && animation.playState !== "idle"))).length)).toBe(0);
                        state.postGate!.release(); state.postGate = null;
                    }
                    const host = placement === "section" ? page.getByRole("dialog", { name: "Hero", exact: true }) : page.locator(".hc-editor");
                    await expect(host.locator('[data-notification-kind="error"]')).toContainText("could not confirm");
                    const retry = host.getByRole("button", { name: "Try saving again", exact: true });
                    if (placement === "page") {
                        const early = await page.evaluate(() => (window as any).__cl17RetryReadiness.samples);
                        expect(early.some((sample: any) => sample.save === "saving" && sample.disabled)).toBe(true);
                        await expect(retry).toBeEnabled();
                        await expect(save(page)).toHaveAttribute("data-state", "dirty");
                        await expect(save(page)).toBeFocused();
                        await page.keyboard.press("Tab"); await expect(retry).toBeFocused(); await page.keyboard.press("Enter");
                    } else {
                        await retry.click();
                    }
                    await expect(host.locator('[data-notification-kind="success"]')).toBeVisible();
                    await expect(host.locator('[data-notification-kind="success"] p')).toHaveText("Homepage saved.");
                    await expect(save(page)).toHaveAttribute("data-state", "saved");
                    expect(state.posts).toHaveLength(2); expect(state.posts[1]).toEqual(state.posts[0]);
                    expect(state.posts[0].operationId).toEqual(expect.any(String));
                    expect(state.posts[0].expectedRevision).toBe("1");
                    expect(new Set(state.posts.map(post => post.operationId)).size).toBe(1);
                    expect(state.snapshot.revision).toBe("2"); expect(state.snapshot.content.hero.headline_line_one).toBe("Retry readiness " + placement);
                    const samples = await page.evaluate(() => { (window as any).__cl17RetryReadiness.stop(); return (window as any).__cl17RetryReadiness.samples; });
                    expect(samples.length).toBeGreaterThan(0);
                    expect(samples.filter((sample: any) => sample.save === "saving").every((sample: any) => sample.disabled)).toBe(true);
                    expect(samples.filter((sample: any) => !sample.disabled).every((sample: any) => sample.save !== "saving")).toBe(true);
                    await writeFile(info.outputPath("retry-readiness.json"), JSON.stringify({ profile, placement, samples, postCount: state.posts.length, operationIds: state.posts.map(post => post.operationId), expectedRevision: state.posts[0].expectedRevision, finalRevision: state.snapshot.revision }, null, 2));
                    await page.screenshot({ path: info.outputPath("retry-saved.png"), fullPage: placement === "page" });
                    expect(state.errors).toEqual([]);
                } finally {
                    state.postGate?.release(); await page.evaluate(() => (window as any).__cl17RetryReadiness?.stop());
                }
            });
        }
    });
}
