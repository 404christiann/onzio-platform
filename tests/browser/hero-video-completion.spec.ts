import { mkdir } from "node:fs/promises";
import { createHmac } from "node:crypto";
import { resolve } from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";
import type { ViteDevServer } from "vite";
import { classifyBunnyStreamStatus, parseBunnyStreamWebhook, verifyBunnyStreamSignature } from "../../lib/bunny-stream-webhook";

const repo = process.cwd();
const artifactDir = process.env.HERO_VIDEO_SCREENSHOT_DIR ?? resolve(repo, "test-results/hero-video-completion");
const SECRET = "read-only-library-key";
const LIVE = "11111111-1111-4111-8111-111111111111";
const PREVIOUS = "22222222-2222-4222-8222-222222222222";
const NEXT = "33333333-3333-4333-8333-333333333333";

type Store = {
  live: string;
  previous: string;
  phase: "uploading" | "preparing" | "preparing_overdue" | "live" | "failed" | null;
  guid: string | null;
  encode: number | null;
  failure: string | null;
  videos: Set<string>;
  replacesUsed: number;
};

let server: ViteDevServer | undefined;
let origin = "";
let store: Store;
let openGate: () => void = () => undefined;
let gate = Promise.resolve();
let uploadLength = "0";
let patches = 0;

function resetStore() {
  patches = 0;
  uploadLength = "0";
  gate = new Promise<void>((resolve) => { openGate = resolve; });
  store = {
    live: LIVE, previous: PREVIOUS, phase: null, guid: null, encode: null, failure: null,
    videos: new Set([LIVE, PREVIOUS]), replacesUsed: 0,
  };
}

function statusBody() {
  return {
    liveGuid: store.live,
    previousGuid: store.previous,
    replacesUsedToday: store.replacesUsed,
    replacesPerDay: 10,
    maxBytes: 500 * 1024 * 1024,
    maxSeconds: 600,
    pending: store.guid && store.phase
      ? { videoGuid: store.guid, encodeProgress: store.encode, effective: store.phase }
      : null,
    failure: store.phase === "failed" && store.failure ? { code: store.failure } : null,
    completion: store.phase === "live" && store.guid ? { videoGuid: store.guid, revisionBefore: "7", revisionAfter: "8" } : null,
  };
}

function sign(raw: string) {
  return createHmac("sha256", SECRET).update(raw, "utf8").digest("hex");
}

function applyWebhook(raw: string, signature: string | null, version: string | null, algorithm: string | null) {
  if (!verifyBunnyStreamSignature({ rawBody: raw, signature, version, algorithm, secret: SECRET })) {
    return { status: 401, body: { error: "INVALID_SIGNATURE" } };
  }
  const parsed = parseBunnyStreamWebhook(raw);
  if (!parsed || parsed.videoGuid !== store.guid || !store.videos.has(parsed.videoGuid)) {
    return { status: 200, body: { received: true, outcome: "ignored" } };
  }
  const action = classifyBunnyStreamStatus(parsed.status);
  if (action === "ready") {
    store.videos.delete(store.previous);
    store.previous = store.live;
    store.live = parsed.videoGuid;
    store.phase = "live";
    store.encode = null;
    return { status: 200, body: { received: true, outcome: "live" } };
  }
  if (action === "reject" || action === "upload_failed") {
    store.videos.delete(parsed.videoGuid);
    store.phase = "failed";
    store.failure = "VIDEO_FAILED";
    return { status: 200, body: { received: true, outcome: "failed" } };
  }
  return { status: 200, body: { received: true, outcome: action } };
}

async function installRoutes(page: Page) {
  await page.route("https://video.bunnycdn.com/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, HEAD, PATCH, OPTIONS", "Access-Control-Allow-Headers": "*", "Access-Control-Expose-Headers": "Location, Upload-Offset, Upload-Length, Tus-Resumable", "Tus-Resumable": "1.0.0" } });
      return;
    }
    if (request.method() === "POST") {
      uploadLength = request.headers()["upload-length"] ?? "0";
      await route.fulfill({ status: 201, headers: { Location: "https://video.bunnycdn.com/tusupload/vid", "Tus-Resumable": "1.0.0", "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Location, Upload-Offset, Tus-Resumable" } });
      return;
    }
    if (request.method() === "HEAD") {
      await route.fulfill({ status: 200, headers: { "Upload-Offset": "0", "Upload-Length": uploadLength, "Tus-Resumable": "1.0.0", "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Upload-Offset, Upload-Length, Tus-Resumable" } });
      return;
    }
    patches += 1;
    const cors = { "Tus-Resumable": "1.0.0", "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Upload-Offset, Tus-Resumable" };
    const total = Number(uploadLength);
    if (patches === 1 && total > 1) {
      await route.fulfill({ status: 204, headers: { "Upload-Offset": String(Math.floor(total / 2)), ...cors } });
      return;
    }
    await gate;
    await route.fulfill({ status: 204, headers: { "Upload-Offset": uploadLength, ...cors } });
  });
  await page.route("**/api/admin/homepage/hero-video", async (route) => respondApi(route));
  await page.route("**/api/webhooks/bunny-stream", async (route) => {
    const raw = route.request().postData() ?? "";
    const result = applyWebhook(raw, route.request().headers()["x-bunnystream-signature"] ?? null, route.request().headers()["x-bunnystream-signature-version"] ?? null, route.request().headers()["x-bunnystream-signature-algorithm"] ?? null);
    await route.fulfill({ status: result.status, contentType: "application/json", body: JSON.stringify(result.body) });
  });
  await page.route("**/admin/roster", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Roster</title><h1>Roster</h1>" }));
}

async function respondApi(route: Route) {
  const request = route.request();
  if (request.method() === "GET") {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(statusBody()) });
    return;
  }
  const body = request.postDataJSON() as { action?: string; videoGuid?: string };
  if (body.action === "start") {
    if (store.replacesUsed >= 10) {
      await route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ code: "DAILY_LIMIT", message: "limit" }) });
      return;
    }
    store.phase = "uploading";
    store.guid = NEXT;
    store.videos.add(NEXT);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        videoGuid: NEXT,
        maxBytes: 500 * 1024 * 1024,
        upload: { endpoint: "https://video.bunnycdn.com/tusupload", libraryId: "723074", videoId: NEXT, expire: 1_900_000_000, signature: "sig", enabledResolutions: "240p,360p,480p,720p" },
      }),
    });
    return;
  }
  if (body.action === "uploaded" && body.videoGuid === store.guid) {
    store.phase = "preparing";
    store.encode = null;
    store.replacesUsed += 1;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "preparing" }) });
    return;
  }
  await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: "INVALID_HERO_VIDEO_REQUEST" }) });
}

async function openEditor(page: Page) {
  await installRoutes(page);
  await page.goto(`${origin}/tests/browser/fixtures/hero-video-completion/`);
  await expect(zoneOf(page)).toBeVisible();
}

async function chooseVideo(page: Page) {
  await page.getByLabel("Choose hero video").setInputFiles({ name: "hero.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(64 * 1024, 7) });
}

test.beforeAll(async () => {
  await mkdir(artifactDir, { recursive: true });
  const { createServer } = await import("vite");
  const fixture = resolve(repo, "tests/browser/fixtures/hero-video-completion");
  server = await createServer({
    root: repo,
    configFile: false,
    envDir: false,
    publicDir: resolve(repo, "public"),
    cacheDir: resolve(repo, ".codex-work/hero-video-completion/vite-cache"),
    resolve: {
      alias: [
        { find: "next/link", replacement: fixture + "/navigation.tsx" },
        { find: "next/navigation", replacement: fixture + "/navigation.tsx" },
        { find: "next/image", replacement: fixture + "/image.tsx" },
        { find: "next/dynamic", replacement: fixture + "/dynamic.tsx" },
        { find: "@", replacement: repo },
      ],
    },
    define: { "process.env.NODE_ENV": JSON.stringify("development") },
    oxc: { jsx: { runtime: "automatic" } },
    server: { host: "127.0.0.1", port: 0, watch: { ignored: ["**/.codex-work/**", "**/test-results/**"] } },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Fixture server has no TCP address");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => { await server?.close(); });
test.beforeEach(() => { resetStore(); });

const FAILED = "We couldn't finish this video. Try again or use a different file.";
const LEAVE = "You can leave this page; we'll finish in the background.";
const KEEP_OPEN = "Keep this page open until the upload finishes.";
const LIVE_COPY = "Your new video is live.";
const CAP = (left: number) => `${left} of 10 replaces left today.`;
const LIMITS = "MP4, MOV or WebM · up to 500 MB · up to 10 minutes · at least 720p";
const zoneOf = (page: Page) => page.getByRole("button", { name: /Click to upload/ });
const bar = (page: Page) => page.getByRole("progressbar", { name: "Hero video progress" });
const fill = (page: Page) => bar(page).locator(":scope > div");
const shot = (page: Page, name: string) => page.screenshot({ path: resolve(artifactDir, `readiness-${name}.png`) });
/** Desktop (the config default) and 375px captures of the uploader in one state. */
async function uploaderShots(page: Page, state: string) {
  await page.screenshot({ path: resolve(artifactDir, `uploader-${state}-desktop.png`) });
  const size = page.viewportSize();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: resolve(artifactDir, `uploader-${state}-375.png`) });
  if (size) await page.setViewportSize(size);
}
const liveText = (page: Page) => page.locator('[role="status"][aria-live="polite"]').first();

type Sample = { bars: number; now: number | null; text: string | null; label: string; check: number; alert: boolean };

/** Records every distinct state of the progress UI as the DOM changes, so a test can prove the bar never vanished or moved back. */
async function recordProgress(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __hero: Sample[] };
    w.__hero = [];
    const read = () => {
      const bars = document.querySelectorAll('[role="progressbar"]');
      const first = bars[0] as HTMLElement | undefined;
      const sample: Sample = {
        bars: bars.length,
        now: first ? Number(first.getAttribute("aria-valuenow")) : null,
        text: first?.getAttribute("aria-valuetext") ?? null,
        label: document.querySelector('[role="status"][aria-live="polite"]')?.textContent ?? "",
        check: document.querySelectorAll("[data-hero-check]").length,
        alert: document.querySelector('[role="alert"]') !== null,
      };
      const last = w.__hero.at(-1);
      if (!last || JSON.stringify(last) !== JSON.stringify(sample)) w.__hero.push(sample);
    };
    new MutationObserver(read).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    read();
  });
  return async () => page.evaluate(() => (window as unknown as { __hero: Sample[] }).__hero);
}

async function postReadyWebhook(page: Page) {
  const raw = JSON.stringify({ VideoLibraryId: 723074, VideoGuid: NEXT, Status: 3 });
  return page.evaluate(async ({ body, signature }) => {
    const response = await fetch("/api/webhooks/bunny-stream", {
      method: "POST",
      headers: { "x-bunnystream-signature": signature, "x-bunnystream-signature-version": "v1", "x-bunnystream-signature-algorithm": "hmac-sha256" },
      body,
    });
    return { status: response.status, body: await response.json() };
  }, { body: raw, signature: sign(raw) });
}

/** Chooses a file and lets the bytes land, leaving the tab in the processing stage. */
async function uploadToProcessing(page: Page) {
  await chooseVideo(page);
  await expect(bar(page)).toHaveAttribute("aria-valuetext", "Uploading…");
  openGate();
  await expect(bar(page)).toHaveAttribute("aria-valuetext", "Processing…", { timeout: 15_000 });
}

test("idle: the drop zone reads like an upload area, with the limits and the allowance under it", async ({ page }) => {
  await openEditor(page);
  await expect(zoneOf(page)).toBeEnabled();
  await expect(zoneOf(page)).toHaveText(/Click to upload or drag and drop/);
  await expect(page.getByText(LIMITS)).toBeVisible();
  await expect(page.getByText(CAP(10))).toBeVisible();
  await expect(page.locator("[data-hero-row]")).toHaveCount(0);
  await expect(page.getByText("Completed", { exact: true })).toHaveCount(0);
  await uploaderShots(page, "idle");
});

test("dropping a file on the zone starts the upload row with its name and size", async ({ page }) => {
  await openEditor(page);
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(64 * 1024)], "dropped-hero.mp4", { type: "video/mp4" }));
    return data;
  });
  const target = zoneOf(page);
  await target.dispatchEvent("dragenter", { dataTransfer: transfer });
  await target.dispatchEvent("dragover", { dataTransfer: transfer });
  await expect(target).toHaveAttribute("data-dragging", "true");
  await target.dispatchEvent("drop", { dataTransfer: transfer });
  await expect(bar(page)).toHaveAttribute("aria-valuetext", "Uploading…");
  await expect(page.getByText("dropped-hero.mp4", { exact: true })).toBeVisible();
  await expect(page.getByText("0.1 MB", { exact: true })).toBeVisible();
  // The file row takes the drop zone's place while the video uploads.
  await expect(zoneOf(page)).toHaveCount(0);
});

test("Enter on the focused zone opens the file picker", async ({ page }) => {
  await openEditor(page);
  await zoneOf(page).focus();
  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  expect((await chooser).isMultiple()).toBe(false);
});

test("the file name and size show in the row", async ({ page }) => {
  await openEditor(page);
  await chooseVideo(page);
  await expect(page.getByText("hero.mp4", { exact: true })).toBeVisible();
  await expect(page.getByText("0.1 MB", { exact: true })).toBeVisible();
});

test("cancelling mid-upload with the trash button returns to idle with nothing swapped or counted", async ({ page }) => {
  await openEditor(page);
  let swaps = 0;
  page.on("request", (request) => { if (request.method() === "POST" && request.url().includes("/api/admin/homepage/hero-video") && (request.postData() ?? "").includes('"uploaded"')) swaps += 1; });
  await chooseVideo(page);
  await expect(bar(page)).toHaveAttribute("aria-valuetext", "Uploading…");
  await page.getByRole("button", { name: "Cancel upload" }).click();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.locator("[data-hero-row]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancel upload" })).toHaveCount(0);
  await expect(page.getByText("Upload canceled. Your current video is unchanged.")).toBeVisible();
  await expect(zoneOf(page)).toBeEnabled();
  await expect(page.getByText(CAP(10))).toBeVisible();
  await expect(page.locator("video")).toHaveAttribute("src", new RegExp(LIVE));
  openGate();
  await page.waitForTimeout(500);
  expect(swaps).toBe(0);
  expect(store.replacesUsed).toBe(0);
  expect(store.live).toBe(LIVE);
});

test("Completed and the check appear only at live", async ({ page }) => {
  await openEditor(page);
  await uploadToProcessing(page);
  await expect(page.getByText("Completed", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-hero-check]")).toHaveCount(0);
  await postReadyWebhook(page);
  await expect(page.getByText("Completed", { exact: true })).toBeVisible({ timeout: 12_000 });
  await expect(page.locator("[data-hero-check]")).toHaveCount(1);
});

test("Try again on a failed row opens the file picker", async ({ page }) => {
  await openEditor(page);
  await uploadToProcessing(page);
  store.phase = "failed";
  store.failure = "MP4_MISSING";
  await expect(page.locator('[data-hero-row="failed"]')).toBeVisible({ timeout: 12_000 });
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Try again" }).click();
  await chooser;
});

test("after a video goes live, a rejected second file shows a red row without the live file's name or size", async ({ page }) => {
  await openEditor(page);
  await uploadToProcessing(page);
  await postReadyWebhook(page);
  await expect(page.getByText("Completed", { exact: true })).toBeVisible({ timeout: 12_000 });
  await expect(page.getByText("hero.mp4", { exact: true })).toHaveCount(0);
  await page.getByLabel("Choose hero video").setInputFiles({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(1024, 1) });
  const row = page.locator('[data-hero-row="failed"]');
  await expect(row).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText(/^That file is not a video we can use\./);
  await expect(row.getByText("Video", { exact: true })).toBeVisible();
  await expect(page.getByText("hero.mp4", { exact: true })).toHaveCount(0);
  await expect(page.getByText("0.1 MB", { exact: true })).toHaveCount(0);
});

test("while the editor is disabled the zone is aria-disabled, and a click or a drop starts nothing", async ({ page }) => {
  await installRoutes(page);
  let starts = 0;
  page.on("request", (request) => { if (request.method() === "POST" && (request.postData() ?? "").includes('"start"')) starts += 1; });
  let choosers = 0;
  page.on("filechooser", () => { choosers += 1; });
  // The status loads, so the controller itself would accept a file: only the zone's own guard can stop it.
  await page.goto(`${origin}/tests/browser/fixtures/hero-video-completion/?disabled`);
  await expect(page.getByText(CAP(10))).toBeVisible();
  const zone = zoneOf(page);
  await expect(zone).toBeDisabled();
  await expect(zone).not.toHaveAttribute("disabled", "");
  await zone.click({ force: true });
  await zone.focus();
  await page.keyboard.press("Enter");
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(64 * 1024)], "blocked.mp4", { type: "video/mp4" }));
    return data;
  });
  await zone.dispatchEvent("dragenter", { dataTransfer: transfer });
  await zone.dispatchEvent("dragover", { dataTransfer: transfer });
  await expect(zone).not.toHaveAttribute("data-dragging", "true");
  const dropped = await zone.evaluate((element, data) => {
    const event = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: data as DataTransfer });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  }, transfer);
  expect(dropped).toBe(true);
  await page.waitForTimeout(500);
  await expect(page.locator("[data-hero-row]")).toHaveCount(0);
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page).toHaveURL(/hero-video-completion/);
  expect(starts).toBe(0);
  expect(choosers).toBe(0);
});

test("one bar runs from upload through processing to live, never backwards, with one success state", async ({ page }) => {
  await openEditor(page);
  const samples = await recordProgress(page);
  await chooseVideo(page);
  await expect(bar(page)).toHaveAttribute("aria-valuetext", "Uploading…");
  await expect(page.getByText(KEEP_OPEN)).toBeVisible();
  await expect(page.getByText(LEAVE)).toHaveCount(0);
  await expect.poll(async () => Number(await bar(page).getAttribute("aria-valuenow")), { timeout: 15_000 }).toBeGreaterThan(0);
  expect(Number(await bar(page).getAttribute("aria-valuenow"))).toBeLessThanOrEqual(40);
  // The upload-phase guard is unchanged: an in-app link does not navigate while bytes move.
  await page.getByRole("link", { name: "Roster" }).click();
  await expect(page).toHaveURL(/hero-video-completion/);
  await shot(page, "uploading");
  await uploaderShots(page, "uploading");

  openGate();
  await expect(bar(page)).toHaveAttribute("aria-valuetext", "Processing…", { timeout: 15_000 });
  await expect(bar(page)).toHaveAttribute("aria-valuenow", "40");
  await expect(page.locator("[data-hero-check]")).toHaveCount(0);
  await expect(page.getByText(LEAVE)).toBeVisible();
  await expect(page.getByText(KEEP_OPEN)).toHaveCount(0);
  await expect(page.getByText(CAP(9))).toBeVisible();
  await expect(page.getByText(LIMITS)).toHaveCount(0); // the drop zone, with its limits line, gives its place to the file row while processing
  expect(await fill(page).evaluate((element) => getComputedStyle(element).animationName)).not.toBe("none");

  store.encode = 50;
  await expect(bar(page)).toHaveAttribute("aria-valuenow", "70", { timeout: 12_000 });
  await shot(page, "processing");
  await uploaderShots(page, "processing");

  expect(await postReadyWebhook(page)).toEqual({ status: 200, body: { received: true, outcome: "live" } });
  await expect(page.getByText("Completed", { exact: true })).toBeVisible({ timeout: 12_000 });
  await expect(liveText(page)).toHaveText(LIVE_COPY);
  // Visually hidden (a 1px clipped box): it is for screen readers only.
  expect(await liveText(page).evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
  // At live the bar is gone: the success card says Completed and nothing else.
  await expect(bar(page)).toHaveCount(0);
  await expect(page.locator('[data-hero-row="completed"]')).toBeVisible();
  await expect(page.locator("[data-hero-check]")).toHaveCount(1);
  await expect(page.getByText(LEAVE)).toHaveCount(0);
  await expect(page.getByText("100%")).toHaveCount(0);
  await expect(zoneOf(page)).toHaveCount(0);
  await shot(page, "live");
  await uploaderShots(page, "completed");

  const all = await samples();
  const run = all.slice(all.findIndex((sample) => sample.bars > 0));
  const barRun = run.filter((sample) => sample.bars > 0);
  expect(barRun.every((sample) => sample.bars === 1)).toBe(true);
  const values = barRun.map((sample) => sample.now as number);
  expect(values).toEqual([...values].sort((a, b) => a - b));
  expect(values.at(-1)).toBe(70);
  expect([...new Set(barRun.map((sample) => sample.text))]).toEqual(["Uploading…", "Processing…"]);
  expect(run.filter((sample) => sample.check > 0).every((sample) => sample.bars === 0 && sample.label === LIVE_COPY)).toBe(true);
  expect(run.some((sample) => sample.alert)).toBe(false);
});

/** Text that is on screen: sr-only (1px, clipped) and aria-hidden-free content only. */
const visibleCopy = (page: Page, text: string) => page.evaluate((copy) => [...document.querySelectorAll("body *")].some((element) => {
  if (element.children.length > 0 || element.textContent?.trim() !== copy) return false;
  const box = element.getBoundingClientRect();
  return box.width > 1 && box.height > 1;
}), text);

test("at live the success card replaces the zone in its box, holds, then fades back to the drop zone", async ({ page }) => {
  await openEditor(page);
  const zoneBox = (await zoneOf(page).boundingBox())!;
  await uploadToProcessing(page);
  await postReadyWebhook(page);
  const card = page.locator('[data-hero-row="completed"]');
  await expect(card).toBeVisible({ timeout: 12_000 });
  await expect(card).toHaveText(/Completed/);
  await expect(card).toHaveText(/Your new video is live on your website\./);
  await expect(card.locator("[data-hero-check]")).toHaveCount(1);
  await expect(bar(page)).toHaveCount(0);
  await expect(page.getByText("100%")).toHaveCount(0);
  await expect(zoneOf(page)).toHaveCount(0);
  await expect(card).toHaveAttribute("aria-hidden", "true");
  const cardBox = (await card.boundingBox())!;
  expect(cardBox.width).toBeCloseTo(zoneBox.width, 0);
  expect(Math.abs(cardBox.height - zoneBox.height)).toBeLessThanOrEqual(2);
  expect(Math.abs(cardBox.y - zoneBox.y)).toBeLessThanOrEqual(2);
  await expect(liveText(page)).toHaveText(LIVE_COPY);

  // Hold, then fade; the zone returns in the same spot with the allowance line under it.
  await expect(page.locator("[data-hero-row]")).toHaveCount(0, { timeout: 5_000 });
  await expect(zoneOf(page)).toBeVisible();
  await expect(zoneOf(page)).toBeEnabled();
  await expect(zoneOf(page)).toHaveAttribute("data-returning", "true");
  await expect(page.getByText(CAP(9))).toBeVisible();
  expect(await visibleCopy(page, LIVE_COPY)).toBe(false);
  await expect(liveText(page)).toHaveText("");
  await expect(page.locator("[data-hero-check]")).toHaveCount(0);
  await expect(page.getByText("Completed", { exact: true })).toHaveCount(0);
  await page.waitForTimeout(300);
  const returnedBox = (await zoneOf(page).boundingBox())!;
  expect(Math.abs(returnedBox.y - zoneBox.y)).toBeLessThanOrEqual(2);
  expect(await zoneOf(page).evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  await uploaderShots(page, "returned");
});

test("at 375px the success card keeps the zone's height (its limits line wraps), so nothing below moves", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openEditor(page);
  const zoneBox = (await zoneOf(page).boundingBox())!;
  const capBefore = (await page.getByText(CAP(10)).boundingBox())!;
  await uploadToProcessing(page);
  await postReadyWebhook(page);
  const card = page.locator('[data-hero-row="completed"]');
  await expect(card).toBeVisible({ timeout: 12_000 });
  const cardBox = (await card.boundingBox())!;
  expect(Math.abs(cardBox.height - zoneBox.height)).toBeLessThanOrEqual(1);
  const capDuring = (await page.getByText(CAP(9)).boundingBox())!;
  expect(Math.abs(capDuring.y - capBefore.y)).toBeLessThanOrEqual(1);
  await expect(page.locator("[data-hero-row]")).toHaveCount(0, { timeout: 5_000 });
  await page.waitForTimeout(300);
  const capAfter = (await page.getByText(CAP(9)).boundingBox())!;
  expect(Math.abs(capAfter.y - capBefore.y)).toBeLessThanOrEqual(1);
});

test("closing and reopening the control after the card faded does not show Completed again", async ({ page }) => {
  await openEditor(page);
  await uploadToProcessing(page);
  await postReadyWebhook(page);
  await expect(page.locator('[data-hero-row="completed"]')).toBeVisible({ timeout: 12_000 });
  await expect(page.locator("[data-hero-row]")).toHaveCount(0, { timeout: 5_000 });
  await page.getByRole("button", { name: "Hide video control" }).click();
  await expect(zoneOf(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Show video control" }).click();
  await expect(zoneOf(page)).toBeVisible();
  await expect(zoneOf(page)).not.toHaveAttribute("data-returning", "true");
  await expect(page.locator("[data-hero-row]")).toHaveCount(0);
  await expect(page.getByText("Completed", { exact: true })).toHaveCount(0);
  expect(await visibleCopy(page, LIVE_COPY)).toBe(false);
  await expect(liveText(page)).toHaveText("");
  await page.waitForTimeout(400);
  await expect(page.locator("[data-hero-row]")).toHaveCount(0);
});

test("reopening the control while the card is still holding restarts the hold", async ({ page }) => {
  await openEditor(page);
  await uploadToProcessing(page);
  await postReadyWebhook(page);
  await expect(page.locator('[data-hero-row="completed"]')).toBeVisible({ timeout: 12_000 });
  await page.getByRole("button", { name: "Hide video control" }).click();
  await page.getByRole("button", { name: "Show video control" }).click();
  await expect(page.locator('[data-hero-row="completed"]')).toBeVisible();
  await expect(page.locator("[data-hero-row]")).toHaveCount(0, { timeout: 5_000 });
  await expect(zoneOf(page)).toBeVisible();
});

test("leaving mid-processing keeps going: the webhook lands while away and the next visit shows live", async ({ page }) => {
  await openEditor(page);
  await uploadToProcessing(page);
  await expect(page.getByText(LEAVE)).toBeVisible();
  await expect(page.locator("[data-hero-check]")).toHaveCount(0);

  await page.getByRole("link", { name: "Roster" }).click();
  await expect(page.getByRole("heading", { name: "Roster" })).toBeVisible();
  expect(await postReadyWebhook(page)).toEqual({ status: 200, body: { received: true, outcome: "live" } });
  expect(store.live).toBe(NEXT);
  expect(store.videos.has(PREVIOUS)).toBe(false);
  expect(store.videos.has(LIVE)).toBe(true);

  await page.goto(`${origin}/tests/browser/fixtures/hero-video-completion/`);
  await expect(liveText(page)).toHaveText(LIVE_COPY);
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  await expect(bar(page)).toHaveCount(0);
  await expect(page.locator("[data-hero-check]")).toHaveCount(1);
  // A fresh page load shows the notice but never refreshes the revision: the editor just loaded the current one.
  await expect(page.locator("[data-refreshed]")).toHaveAttribute("data-refreshed", "");
});

test("coming back while it is still processing resumes the bar, not an empty form", async ({ page }) => {
  await openEditor(page);
  await uploadToProcessing(page);
  store.encode = 50;
  await page.getByRole("link", { name: "Roster" }).click();
  await expect(page.getByRole("heading", { name: "Roster" })).toBeVisible();
  await page.goto(`${origin}/tests/browser/fixtures/hero-video-completion/`);
  await expect(bar(page)).toHaveAttribute("aria-valuetext", "Processing…");
  await expect(bar(page)).toHaveAttribute("aria-valuenow", "70");
  await expect(page.getByText(LEAVE)).toBeVisible();
  await expect(zoneOf(page)).toHaveCount(0);
});

test("reloading during the upload leaves Replace and Revert on, with no bar", async ({ page }) => {
  await openEditor(page);
  await chooseVideo(page);
  await expect(bar(page)).toHaveAttribute("aria-valuetext", "Uploading…");
  await page.reload();
  await expect(zoneOf(page)).toBeEnabled();
  await expect(page.getByRole("button", { name: "Revert to previous" })).toBeEnabled();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.getByText("An upload is in progress in another window, or it was interrupted. Choosing a new video replaces it.")).toBeVisible();
  expect(store.replacesUsed).toBe(0);
  expect(store.videos.has(NEXT)).toBe(true);
});

test("closing the tab during the upload leaves the current video live", async ({ page }) => {
  await openEditor(page);
  await chooseVideo(page);
  await expect(bar(page)).toHaveAttribute("aria-valuetext", "Uploading…");
  await page.close();
  const next = await page.context().newPage();
  await installRoutes(next);
  await next.goto(`${origin}/tests/browser/fixtures/hero-video-completion/`);
  await expect(zoneOf(next)).toBeEnabled();
  await expect(next.getByRole("button", { name: "Revert to previous" })).toBeEnabled();
  await expect(next.getByRole("progressbar")).toHaveCount(0);
  await expect(next.getByText(LIVE_COPY)).toHaveCount(0);
  await expect(next.getByText("Completed", { exact: true })).toHaveCount(0);
  await expect(next.locator("video")).toHaveAttribute("src", new RegExp(LIVE));
  expect(store.live).toBe(LIVE);
  expect(store.videos.has(PREVIOUS)).toBe(true);
  await next.close();
});

test("a missing mp4 shows the plain failure copy, with Replace and Revert still enabled", async ({ page }) => {
  await openEditor(page);
  await uploadToProcessing(page);
  store.phase = "failed";
  store.failure = "MP4_MISSING";
  await expect(page.getByRole("alert")).toHaveText(new RegExp(`^${FAILED}`), { timeout: 12_000 });
  await expect(page.getByRole("alert")).not.toContainText(/bunny|video service|MP4_MISSING/i);
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.locator("[data-hero-check]")).toHaveCount(0);
  await expect(zoneOf(page)).toBeEnabled();
  await expect(page.getByRole("button", { name: "Revert to previous" })).toBeEnabled();
  await shot(page, "failed");
  await uploaderShots(page, "failed");
});

test("a video below 720p says what to change, with Replace and Revert still enabled", async ({ page }) => {
  await openEditor(page);
  await uploadToProcessing(page);
  store.phase = "failed";
  store.failure = "RESOLUTION_TOO_LOW";
  await expect(page.getByRole("alert")).toHaveText(/^This video is below 720p\. Use a video that is at least 720p\./, { timeout: 12_000 });
  await expect(page.getByRole("alert")).not.toContainText(FAILED);
  await expect(page.getByRole("alert")).not.toContainText(/bunny|video service|RESOLUTION_TOO_LOW/i);
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(zoneOf(page)).toBeEnabled();
  await expect(page.getByRole("button", { name: "Revert to previous" })).toBeEnabled();
  await shot(page, "failed-resolution");
});

test("a video that is not live by its deadline shows the same failure copy", async ({ page }) => {
  await openEditor(page);
  await uploadToProcessing(page);
  store.phase = "preparing_overdue";
  await expect(page.getByRole("alert")).toHaveText(new RegExp(`^${FAILED}`), { timeout: 12_000 });
  await expect(zoneOf(page)).toBeEnabled();
  await expect(page.getByRole("button", { name: "Revert to previous" })).toBeEnabled();
  await shot(page, "failed-overdue");
});

test("the daily allowance reads 10, and the limit message uses that number", async ({ page }) => {
  await openEditor(page);
  await expect(page.getByText(CAP(10))).toBeVisible();
  await page.close();
  const full = await page.context().newPage();
  store.replacesUsed = 10;
  await installRoutes(full);
  await full.goto(`${origin}/tests/browser/fixtures/hero-video-completion/`);
  await expect(full.getByText(CAP(0))).toBeVisible();
  await chooseVideo(full);
  await expect(full.getByRole("alert")).toContainText("You have used all 10 video replacements for today. Try again tomorrow.");
  await full.close();
});

test.describe("reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("the bar and the live check render without motion", async ({ page }) => {
    await openEditor(page);
    await chooseVideo(page);
    await expect(bar(page)).toHaveAttribute("aria-valuetext", "Uploading…");
    expect(await fill(page).evaluate((element) => getComputedStyle(element).transitionDuration)).toBe("0s");
    openGate();
    await expect(bar(page)).toHaveAttribute("aria-valuetext", "Processing…", { timeout: 15_000 });
    await expect(page.locator("[data-hero-check]")).toHaveCount(0);
    expect(await fill(page).evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
    await shot(page, "reduced-motion-processing");
    expect(await postReadyWebhook(page)).toEqual({ status: 200, body: { received: true, outcome: "live" } });
    await expect(page.locator("[data-hero-check]")).toBeVisible({ timeout: 12_000 });
    expect(await page.locator("[data-hero-check] path").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
    await shot(page, "reduced-motion-live");
  });
});
