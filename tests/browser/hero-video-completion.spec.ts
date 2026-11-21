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
  phase: "uploading" | "preparing" | "live" | "failed" | null;
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
    replacesPerDay: 5,
    maxBytes: 500 * 1024 * 1024,
    maxSeconds: 600,
    pending: store.phase === "preparing" && store.guid
      ? { videoGuid: store.guid, encodeProgress: store.encode, phase: "preparing" as const }
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
  if (action === "finalize") {
    store.videos.delete(store.previous);
    store.previous = store.live;
    store.live = parsed.videoGuid;
    store.phase = "live";
    store.encode = null;
    return { status: 200, body: { received: true, outcome: "live" } };
  }
  if (action === "fail") {
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
    store.phase = "uploading";
    store.guid = NEXT;
    store.videos.add(NEXT);
    store.replacesUsed += 1;
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
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "preparing" }) });
    return;
  }
  await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: "INVALID_HERO_VIDEO_REQUEST" }) });
}

async function openEditor(page: Page) {
  await installRoutes(page);
  await page.goto(`${origin}/tests/browser/fixtures/hero-video-completion/`);
  await expect(page.getByRole("button", { name: "Replace video" })).toBeVisible();
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

test("upload, preparing, leave, webhook, come back live; closing mid-upload does not go live", async ({ page }) => {
  await openEditor(page);
  await chooseVideo(page);
  await expect(page.getByText("Uploading your video. Keep this page open until the upload finishes.")).toBeVisible();
  await expect.poll(async () => page.getByRole("progressbar", { name: "Video upload progress" }).getAttribute("aria-valuenow"), { timeout: 15_000 }).not.toBe("0");
  await page.getByRole("link", { name: "Roster" }).click();
  await expect(page).toHaveURL(/hero-video-completion/);
  await page.screenshot({ path: resolve(artifactDir, "hero-video-uploading.png") });
  openGate();
  await expect(page.locator("[data-hero-check]")).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: resolve(artifactDir, "hero-video-upload-done.png") });
  await expect(page.getByText("Preparing your video. This usually takes a few minutes. You can keep editing.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("4 of 5 replaces left today. Maximum file size 500 MB, up to 10 minutes, at least 720p.")).toBeVisible();
  await page.screenshot({ path: resolve(artifactDir, "hero-video-preparing.png") });

  await page.getByRole("link", { name: "Roster" }).click();
  await expect(page.getByRole("heading", { name: "Roster" })).toBeVisible();
  const raw = JSON.stringify({ VideoLibraryId: 723074, VideoGuid: NEXT, Status: 3 });
  const webhook = await page.evaluate(async ({ body, signature }) => {
    const response = await fetch("/api/webhooks/bunny-stream", {
      method: "POST",
      headers: { "x-bunnystream-signature": signature, "x-bunnystream-signature-version": "v1", "x-bunnystream-signature-algorithm": "hmac-sha256" },
      body,
    });
    return { status: response.status, body: await response.json() };
  }, { body: raw, signature: sign(raw) });
  expect(webhook).toEqual({ status: 200, body: { received: true, outcome: "live" } });
  expect(store.live).toBe(NEXT);
  expect(store.videos.has(PREVIOUS)).toBe(false);
  expect(store.videos.has(LIVE)).toBe(true);

  await page.goto(`${origin}/tests/browser/fixtures/hero-video-completion/`);
  await expect(page.getByText("Your new video is live.")).toBeVisible();
  await expect(page.locator("[data-refreshed]")).toHaveAttribute("data-refreshed", "7:8");
  await page.screenshot({ path: resolve(artifactDir, "hero-video-live.png") });
});

test("closing the tab during the upload leaves the current video live", async ({ page }) => {
  await openEditor(page);
  await chooseVideo(page);
  await expect(page.getByText("Uploading your video. Keep this page open until the upload finishes.")).toBeVisible();
  await page.close();
  const next = await page.context().newPage();
  await installRoutes(next);
  await next.goto(`${origin}/tests/browser/fixtures/hero-video-completion/`);
  await expect(next.getByRole("button", { name: "Replace video" })).toBeEnabled();
  await expect(next.getByRole("button", { name: "Revert to previous" })).toBeEnabled();
  await expect(next.getByText("Preparing your video. This usually takes a few minutes. You can keep editing.")).toHaveCount(0);
  await expect(next.getByText("Your new video is live.")).toHaveCount(0);
  await expect(next.locator("video")).toHaveAttribute("src", new RegExp(LIVE));
  expect(store.live).toBe(LIVE);
  expect(store.videos.has(PREVIOUS)).toBe(true);
  await next.close();
});

test("a failed encode shows plain copy and reduced motion stays still", async ({ page }) => {
  await openEditor(page);
  await chooseVideo(page);
  await expect(page.getByText("Uploading your video. Keep this page open until the upload finishes.")).toBeVisible();
  openGate();
  await expect(page.getByText("Preparing your video. This usually takes a few minutes. You can keep editing.")).toBeVisible({ timeout: 15_000 });
  store.phase = "failed";
  store.failure = "VIDEO_FAILED";
  await expect(page.getByRole("alert")).toContainText("That video could not be processed", { timeout: 12_000 });
  await expect(page.getByRole("alert")).not.toContainText(/bunny|video service/i);
  await page.screenshot({ path: resolve(artifactDir, "hero-video-failed.png") });
});

test.describe("reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("preparing and the upload check render without motion", async ({ page }) => {
    await openEditor(page);
    await chooseVideo(page);
    await expect(page.getByText("Uploading your video. Keep this page open until the upload finishes.")).toBeVisible();
    openGate();
    await expect(page.locator("[data-hero-check]")).toBeVisible({ timeout: 15_000 });
    const checkAnimation = await page.locator("[data-hero-check] path").evaluate((element) => getComputedStyle(element).animationName);
    expect(checkAnimation).toBe("none");
    await page.screenshot({ path: resolve(artifactDir, "hero-video-reduced-motion-uploaded.png") });
    await expect(page.locator("[data-hero-working]")).toBeVisible({ timeout: 15_000 });
    const workingAnimation = await page.locator("[data-hero-working] span").first().evaluate((element) => getComputedStyle(element).animationName);
    expect(workingAnimation).toBe("none");
    await page.screenshot({ path: resolve(artifactDir, "hero-video-reduced-motion-preparing.png") });
  });
});
