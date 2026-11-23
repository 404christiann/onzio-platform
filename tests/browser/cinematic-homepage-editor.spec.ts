import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { expect, test, type Page } from "@playwright/test";
import type { DBSiteSponsorLogo } from "@/lib/db-types";
import { cinematicHomepageSaveContent, type CinematicHomepageContent } from "@/lib/cinematic-homepage-content";
import type { HomepageEditorSnapshot } from "@/lib/homepage-editor/adapter";
import { createLocalClients } from "../helpers/supabase";

type Upload = { assetId: string; publicUrl: string };
async function snapshot(page: Page): Promise<HomepageEditorSnapshot> {
  const response = await page.request.get("/api/admin/homepage");
  expect(response.status()).toBe(200);
  return await response.json();
}
async function saveContent(page: Page, content: CinematicHomepageContent) {
  const current = await snapshot(page);
  const response = await page.request.post("/api/admin/homepage", { data: { operationId: randomUUID(), expectedRevision: current.revision, designRevision: current.designRevision, sections: { revamp: cinematicHomepageSaveContent(content) } } });
  expect(response.status()).toBe(200);
  return await response.json() as HomepageEditorSnapshot;
}
/** Normal authenticated authorize/staging/finalize APIs, with no database bypass. */
async function uploadArtwork(page: Page, buffer: Buffer, mimeType: string, fileName: string): Promise<Upload> {
  const authorized = await page.request.post("/api/admin/media/authorize", { data: { surface: "homepage", kind: "graphic", fileName, mimeType, size: buffer.length } });
  expect(authorized.status()).toBe(200);
  const authorization = await authorized.json();
  const { anon } = createLocalClients();
  const staged = await anon.storage.from("onzio-upload-staging").uploadToSignedUrl(authorization.path, authorization.token, buffer, { contentType: mimeType, upsert: false });
  expect(staged.error).toBeNull();
  const finalized = await page.request.post("/api/admin/media/finalize", { data: { authorization: authorization.authorization } });
  expect(finalized.status()).toBe(200);
  return (await finalized.json()).data;
}
/** The Overview draws the real public page in inert frames; each numbered part is a button over its block. */
const PART_TITLES = { "revamp.navigation": "Menu and footer", "revamp.prices": "Ticket prices", "revamp.ticket": "Ticket and map", "revamp.raffle": "Raffle" } as const;
const overviewFrame = (page: Page) => page.frameLocator('iframe[title="Homepage preview"]').first();
const partDialog = (page: Page) => page.locator("[data-editor-dialog]");
async function openPiece(page: Page, piece: keyof typeof PART_TITLES) {
  const button = page.getByRole("button", { name: new RegExp(`^Edit ${PART_TITLES[piece]}`) }).first();
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await expect(partDialog(page)).toBeVisible();
}
async function editorReady(page: Page) {
  await expect(overviewFrame(page).locator(".cinematic-slides img")).toHaveCount(7, { timeout: 30_000 });
  await expect(page.locator("button[data-part]").first()).toBeVisible({ timeout: 30_000 });
}
async function done(page: Page) { await page.getByRole("button", { name: "Done", exact: true }).filter({ visible: true }).first().click(); await expect(partDialog(page)).toHaveCount(0); }
async function saveThroughUi(page: Page) {
  const button = page.locator("[data-page-save-button]").filter({ visible: true }).first();
  await expect(button).toHaveAttribute("data-state", "dirty");
  const response = page.waitForResponse(result => result.url().endsWith("/api/admin/homepage") && result.request().method() === "POST");
  await button.click(); expect((await response).status()).toBe(200);
  await expect(button).toHaveAttribute("data-state", "saved");
}
async function plainArtwork(page: Page) {
  for (const selector of [".raffle img", ".ticket-art img"]) {
    await expect(page.locator(selector)).toHaveCount(1, { timeout: 20_000 });
    await page.locator(selector).scrollIntoViewIfNeeded();
    await expect.poll(async () => page.locator(selector).evaluate(element => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
    expect(await page.locator(selector).evaluate(element => element.closest("a,button,[role=button]") === null)).toBe(true);
  }
}

for (const viewport of [{ name: "desktop", width: 1440, height: 900 }, { name: "phone", width: 390, height: 844 }]) {
  test(`${viewport.name}: real homepage editing, artwork upload and save/reload parity`, async ({ page }, info) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const original = await snapshot(page);
    expect(original.design.templateKey).toBe("cinematic@2");
    expect(original.content.photos.items).toHaveLength(7);
    expect(original.content.revamp).toBeTruthy();
    const originalRevamp = structuredClone(original.content.revamp!);
    const originalRaffle = await page.request.get(originalRevamp.raffle.url!);
    expect(originalRaffle.status()).toBe(200);
    const originalBuffer = await originalRaffle.body();
    const originalMime = originalRaffle.headers()["content-type"].split(";")[0];
    const sevenPhotos = original.content.photos.items.map(({ rowId, assetId, alt, order }) => ({ rowId, assetId, alt, order }));
    let replaced = false;
    const authorizationKinds: { surface: string; kind: string }[] = [];
    page.on("request", request => {
      if (request.url().endsWith("/api/admin/media/authorize") && request.method() === "POST") {
        const body = request.postDataJSON(); authorizationKinds.push({ surface: body.surface, kind: body.kind });
      }
    });
    try {
      await page.goto("/", { waitUntil: "domcontentloaded" }); await plainArtwork(page);
      await page.goto("/admin/homepage", { waitUntil: "domcontentloaded" });
      const frame = overviewFrame(page);
      await editorReady(page);
      await openPiece(page, "revamp.navigation");
      await partDialog(page).getByLabel("Community", { exact: true }).fill(`Community ${viewport.name}`);
      await done(page);
      await openPiece(page, "revamp.prices");
      await partDialog(page).getByLabel("Price or offer", { exact: true }).first().fill("$8");
      await done(page);
      await openPiece(page, "revamp.ticket");
      await partDialog(page).getByLabel("Show ticket and map on homepage", { exact: true }).uncheck();
      await done(page);
      await expect(frame.locator(".ticket-art")).toHaveCount(0);
      await saveThroughUi(page);
      const firstSave = await snapshot(page);
      expect(firstSave.content.revamp?.navigation.labels.community).toBe(`Community ${viewport.name}`);
      expect(firstSave.content.revamp?.prices.rows[0].price).toBe("$8");
      expect(firstSave.content.revamp?.ticket.visible).toBe(false);
      expect(firstSave.content.photos.items.map(({ rowId, assetId, alt, order }) => ({ rowId, assetId, alt, order }))).toEqual(sevenPhotos);
      await page.reload({ waitUntil: "domcontentloaded" });
      await editorReady(page);
      await expect(frame.locator(".ticket-art")).toHaveCount(0);
      await expect(frame.locator(".price-item h3").first()).toContainText("$8");
      await openPiece(page, "revamp.ticket");
      await partDialog(page).getByLabel("Show ticket and map on homepage", { exact: true }).check();
      await done(page);
      await openPiece(page, "revamp.raffle");
      await partDialog(page).getByLabel("Replace image", { exact: true }).setInputFiles("assets/rose-city-2027/inputs/trophies.webp");
      await expect(partDialog(page).getByText("Adding your image…", { exact: true })).toHaveCount(0);
      await expect(partDialog(page).getByRole("alert")).toHaveCount(0);
      await expect.poll(async () => await frame.locator(".raffle img").getAttribute("src")).not.toBe(originalRevamp.raffle.url);
      await expect(partDialog(page).locator("img").first()).toBeVisible();
      await done(page);
      replaced = true;
      await saveThroughUi(page);
      const secondSave = await snapshot(page);
      expect(secondSave.content.revamp?.ticket.visible).toBe(true);
      expect(secondSave.content.revamp?.raffle.assetId).not.toBe(originalRevamp.raffle.assetId);
      expect(authorizationKinds).toContainEqual({ surface: "homepage", kind: "graphic" });
      await page.reload({ waitUntil: "domcontentloaded" });
      await editorReady(page);
      await expect(frame.locator(".raffle img")).toHaveAttribute("src", secondSave.content.revamp!.raffle.url!);
      await expect(frame.locator(".cinematic-slides img")).toHaveCount(7);
      await page.screenshot({ path: info.outputPath(`${viewport.name}-editor.png`), fullPage: true });
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(page.locator(".price-item h3").first()).toContainText("$8");
      await expect(page.locator(".club-header")).toContainText(`Community ${viewport.name}`);
      await expect(page.locator(".raffle img")).toHaveAttribute("src", secondSave.content.revamp!.raffle.url!);
      await plainArtwork(page);
      await expect(page.locator(".cinematic-slides img")).toHaveCount(7);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${viewport.name}-public-edited.png`), fullPage: true });
    } finally {
      // The old raffle asset may already be retired by the real committed save.
      // Re-upload its original bytes through normal APIs rather than relinking
      // a retired identity. All original text/settings and seven photo IDs stay.
      const restore = structuredClone(originalRevamp);
      if (replaced) {
        const uploaded = await uploadArtwork(page, originalBuffer, originalMime, `restored-raffle-${viewport.name}.${originalMime === "image/png" ? "png" : "webp"}`);
        restore.raffle.assetId = uploaded.assetId; restore.raffle.url = uploaded.publicUrl;
      }
      const restored = await saveContent(page, restore);
      const expected = cinematicHomepageSaveContent(originalRevamp);
      const actual = cinematicHomepageSaveContent(restored.content.revamp!);
      expect({ ...actual, raffle: { ...actual.raffle, assetId: originalRevamp.raffle.assetId } }).toEqual(expected);
      expect(restored.content.photos.items.map(({ rowId, assetId, alt, order }) => ({ rowId, assetId, alt, order }))).toEqual(sevenPhotos);
      await info.attach("normal-api-restoration", { contentType: "application/json", body: Buffer.from(JSON.stringify({ viewport: viewport.name, originalRaffleAssetId: originalRevamp.raffle.assetId, restoredRaffleAssetId: restored.content.revamp!.raffle.assetId, originalArtworkSourceSha256: createHash("sha256").update(originalBuffer).digest("hex"), preservedPhotoIdentities: sevenPhotos.length, restoredEditableCopy: true })) });
      await page.goto("/", { waitUntil: "domcontentloaded" }); await plainArtwork(page);
      await page.screenshot({ path: info.outputPath(`${viewport.name}-public-restored.png`), fullPage: true });
    }
  });
}

// ---------------------------------------------------------------------------
// TELEMETRY-03: sponsor telemetry in a real browser, with no server and no database.
// Rose City's public site is held and no local club has the telemetry add-on, so
// the real app cannot render the sponsor strip with telemetry on. This harness
// bundles the real SiteTelemetry + CinematicSponsors with esbuild and serves them
// through context.route on the config's host: the page document, the bundle and
// POST /api/t are fulfilled in memory, every other request on any host is aborted,
// and navigator.sendBeacon is left alone (page.route sees its "ping" requests).
// ---------------------------------------------------------------------------
const HARNESS_PATH = "/__telemetry-harness";
const WIRE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const logoSvg = (fill: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="60"><rect width="240" height="60" fill="${fill}"/></svg>`)}`;
const sponsorRow = (id: string, name: string, fill: string, website: string | null, order: number): DBSiteSponsorLogo => ({ id, placement: null, name, logo_url: logoSvg(fill), sort_order: order, show_on_homepage: true, show_in_footer: false, website_url: website, created_at: "2026-01-01T00:00:00.000Z" });
/** Three linked database sponsors, one database sponsor without a website, and one built-in fallback that has a website but must never be linked or counted. */
const HARNESS_SPONSORS: DBSiteSponsorLogo[] = [
  sponsorRow("0f1c2d3e-0001-4a00-8a00-00000000000a", "Alpha Plumbing", "#E80B25", "https://alpha.example/", 0),
  sponsorRow("0f1c2d3e-0001-4a00-8a00-00000000000b", "Bravo Bakery", "#4F8DC3", "https://bravo.example/", 1),
  sponsorRow("0f1c2d3e-0001-4a00-8a00-00000000000c", "Charlie Cafe", "#94C946", null, 2),
  sponsorRow("0f1c2d3e-0001-4a00-8a00-00000000000d", "Delta Dental", "#141414", "https://delta.example/", 3),
  sponsorRow("default-carousel-chronic", "Chronic Tacos", "#F5A623", "https://chronic.example/", 4),
];
const COUNTED = HARNESS_SPONSORS.filter(sponsor => WIRE_UUID.test(sponsor.id));
const LINKED = COUNTED.filter(sponsor => sponsor.website_url);
const UNLINKED = HARNESS_SPONSORS.filter(sponsor => !LINKED.includes(sponsor));
const COUNTED_IDS = COUNTED.map(sponsor => sponsor.id).sort();
const FALLBACK_ID = "default-carousel-chronic";

type Beacon = Record<string, unknown>;
type HarnessWindow = Window & {
  __NativeIntersectionObserver: typeof IntersectionObserver;
  /** IntersectionObservers the page under test constructed (the test's own probe uses the native class and is not counted). */
  __observerCount: number;
  /** Greatest intersection ratio each sponsor's original and aria-hidden clone reached while the strip was on screen. */
  __probeRatios: Record<string, { original: number; clone: number }>;
};

const harnessEntry = `
import { createRoot } from "react-dom/client";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { SiteTelemetry } from "@/components/telemetry/TelemetryContext";
import CinematicSponsors from "@/components/cinematic/CinematicSponsors";
const sponsors = ${JSON.stringify(HARNESS_SPONSORS)};
const strip = (
  <div className="cinematic-site">
    <div style={{ height: 1800 }} />
    <CinematicSponsors sponsors={sponsors} treatments={{}} heading="Partners" />
    <button id="after-strip" type="button">After the strip</button>
  </div>
);
const telemetry = new URLSearchParams(location.search).get("telemetry") !== "off";
createRoot(document.getElementById("root")!).render(
  <PathnameContext.Provider value="${HARNESS_PATH}">{telemetry ? <SiteTelemetry>{strip}</SiteTelemetry> : strip}</PathnameContext.Provider>,
);
`;

let harnessBundle = "";
let harnessHtml = "";
async function buildHarness() {
  const root = path.resolve(__dirname, "..", "..");
  const result = await build({
    stdin: { contents: harnessEntry, resolveDir: root, loader: "tsx", sourcefile: "telemetry-harness-entry.tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    tsconfig: path.join(root, "tsconfig.json"),
  });
  harnessBundle = result.outputFiles[0].text;
  const css = readFileSync(path.join(root, "components/cinematic/cinematic.css"), "utf8");
  // The second style block holds the marquee still so strip geometry, and therefore what counts as seen, is deterministic.
  harnessHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TELEMETRY-03 harness</title><style>${css}</style><style>body{margin:0}.cinematic-site .sponsor-track{animation-play-state:paused!important}</style></head><body><div id="root"></div><script src="${HARNESS_PATH}.js"></script></body></html>`;
}

const beaconsOf = (posts: Beacon[], t: string) => posts.filter(body => body.t === t);
const sortedIds = (batches: Beacon[]) => batches.flatMap(batch => batch.s as string[]).sort();

/** Every body that left the page must match the frozen wire contract exactly: no other keys, no other shapes. */
function expectWireContract(posts: Beacon[]) {
  for (const body of posts) {
    if (body.t === "view") {
      expect(Object.keys(body).sort()).toEqual(["p", "q", "r", "t"]);
      expect([typeof body.p, typeof body.r, typeof body.q]).toEqual(["string", "string", "string"]);
    } else if (body.t === "logo_seen") {
      expect(Object.keys(body).sort()).toEqual(["p", "s", "t"]);
      const ids = body.s as string[];
      expect(typeof body.p).toBe("string");
      expect(Array.isArray(ids) && ids.length >= 1 && ids.length <= 10).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(WIRE_UUID);
    } else if (body.t === "heartbeat") {
      expect(Object.keys(body).sort()).toEqual(["e", "p", "t"]);
      expect(typeof body.p).toBe("string");
      expect(Number.isInteger(body.e) && (body.e as number) >= 1_000 && (body.e as number) <= 60_000).toBe(true);
    } else {
      throw new Error(`Unexpected beacon body ${JSON.stringify(body)}`);
    }
  }
}

async function openHarness(page: Page, baseURL: string, options: { telemetry?: boolean; reducedMotion?: boolean } = {}) {
  const { telemetry = true, reducedMotion = false } = options;
  const origin = new URL(baseURL).origin;
  const posts: Beacon[] = [];
  const linkHits: string[] = [];
  await page.addInitScript(() => {
    const w = window as unknown as HarnessWindow;
    const Native = window.IntersectionObserver;
    w.__NativeIntersectionObserver = Native;
    w.__observerCount = 0;
    window.IntersectionObserver = class extends Native {
      constructor(...args: ConstructorParameters<typeof IntersectionObserver>) { super(...args); w.__observerCount += 1; }
    };
  });
  // Context level, so a link that opens a new tab stays inside the harness too.
  await page.context().route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (request.method() === "GET" && url.pathname === HARNESS_PATH) return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: harnessHtml });
    if (request.method() === "GET" && url.pathname === `${HARNESS_PATH}.js`) return route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: harnessBundle });
    if (request.method() === "POST" && url.pathname === "/api/t") {
      posts.push(JSON.parse(request.postData() ?? "null") as Beacon);
      return route.fulfill({ status: 204 });
    }
    if (url.pathname.startsWith("/r/")) linkHits.push(url.pathname);
    return route.abort();
  });
  if (reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(telemetry ? HARNESS_PATH : `${HARNESS_PATH}?telemetry=off`);
  await expect(page.locator(".sponsor-track")).toBeAttached();
  // The first view beacon proves this commit's effects ran. Without the add-on there is no beacon, so wait for the marquee to start instead.
  if (telemetry) await expect.poll(() => beaconsOf(posts, "view").length, { timeout: 15_000 }).toBe(1);
  else if (!reducedMotion) await expect(page.locator(".sponsor-track")).toHaveCSS("animation-name", "cinematic-sponsor-travel");
  return { posts, linkHits };
}

/**
 * Scrolls the strip into view and resolves once a native IntersectionObserver
 * (created here, after the page's own, so it is notified in the same frame)
 * reports a logo at least half visible. `settleMs` then waits in the page, so
 * the time after the dwell timer started is measured without Playwright latency.
 */
async function revealStrip(page: Page, settleMs = 0) {
  await page.evaluate(async ms => {
    const w = window as unknown as HarnessWindow;
    const ratios: HarnessWindow["__probeRatios"] = {};
    let half!: () => void;
    const reachedHalf = new Promise<void>(resolve => { half = resolve; });
    const observer = new w.__NativeIntersectionObserver(entries => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        const slot = (ratios[element.dataset.sponsorId as string] ??= { original: 0, clone: 0 });
        const copy = element.closest('[aria-hidden="true"]') ? "clone" : "original";
        slot[copy] = Math.max(slot[copy], entry.intersectionRatio);
        if (entry.intersectionRatio >= 0.5) half();
      }
    }, { threshold: [0, 0.5, 1] });
    document.querySelectorAll("[data-sponsor-id]").forEach(element => observer.observe(element));
    w.__probeRatios = ratios;
    document.querySelector(".partner-row")!.scrollIntoView({ block: "center" });
    await reachedHalf;
    if (ms) await new Promise(resolve => setTimeout(resolve, ms));
  }, settleMs);
}

/** Waits for the first logo_seen batch, then one more full 2 s batch window so a late duplicate would show. */
async function settledLogoSeen(page: Page, posts: Beacon[]) {
  await expect.poll(() => beaconsOf(posts, "logo_seen").length, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(2_400);
  return beaconsOf(posts, "logo_seen");
}

/** The page really reports hidden: document.hidden and visibilityState change, then visibilitychange fires. */
async function setTabVisibility(page: Page, state: "hidden" | "visible") {
  await page.evaluate(next => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => next === "hidden" });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => next });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

async function expectSponsorLinks(page: Page) {
  for (const sponsor of LINKED) {
    const href = `/r/${sponsor.id}`;
    const original = page.locator(`.sponsor-set:not([aria-hidden]) a[href="${href}"]`);
    const clone = page.locator(`.sponsor-set[aria-hidden="true"] a[href="${href}"]`);
    await expect(page.locator(`a[href="${href}"]`)).toHaveCount(2);
    await expect(original).toHaveCount(1);
    await expect(clone).toHaveCount(1);
    for (const link of [original, clone]) {
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "sponsored noopener");
    }
    expect(await original.evaluate(element => element.hasAttribute("tabindex"))).toBe(false);
    await expect(clone).toHaveAttribute("tabindex", "-1");
    // The sponsor's own address stays server-side behind /r/<id>.
    await expect(page.locator(`a[href*="${new URL(sponsor.website_url!).host}"]`)).toHaveCount(0);
    // Hidden from the accessibility tree, the clone leaves exactly one link per sponsor.
    await expect(page.getByRole("link", { name: sponsor.name })).toHaveCount(1);
  }
  await expect(page.locator("a")).toHaveCount(LINKED.length * 2);
  for (const sponsor of UNLINKED) {
    await expect(page.locator(`a[href="/r/${sponsor.id}"]`)).toHaveCount(0);
    const image = page.locator(`.sponsor-set:not([aria-hidden]) img[alt="${sponsor.name}"]`);
    await expect(image).toHaveCount(1);
    expect(await image.evaluate(element => element.closest("a"))).toBeNull();
  }
}

/** Viewport point at the centre of a stamped field inside whichever Overview column shows it (scrolled into view first). */
async function fieldPoint(page: Page, target: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const point = await page.evaluate(id => {
      for (const frame of Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe[title="Homepage preview"]'))) {
        const node = Array.from(frame.contentDocument?.querySelectorAll("[data-edit-target]") ?? []).find(element => element.getAttribute("data-edit-target") === id);
        const clip = frame.closest("[data-column]")?.firstElementChild?.getBoundingClientRect();
        if (!node || !clip) continue;
        const box = frame.getBoundingClientRect();
        const scale = box.width / frame.clientWidth;
        const rect = node.getBoundingClientRect();
        const x = box.left + (rect.left + rect.width / 2) * scale;
        const y = box.top + (rect.top + rect.height / 2) * scale;
        if (x > clip.left && x < clip.right && y > clip.top && y < clip.bottom) return { x, y };
      }
      return null;
    }, target);
    if (!point) throw new Error(`no visible preview node for ${target}`);
    // Clear of the sticky admin header and the phone Save bar, which sit above the preview.
    if (point.y > 120 && point.y < page.viewportSize()!.height - 140) return point;
    // The admin content scrolls in its own container: scroll the part button that covers the point.
    await page.evaluate(({ x, y }) => {
      const covering = Array.from(document.querySelectorAll<HTMLElement>("button[data-part]")).filter(button => {
        const r = button.getBoundingClientRect();
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      }).sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height)[0];
      covering?.scrollIntoView({ block: "center", behavior: "instant" });
    }, point);
    await page.waitForTimeout(300);
  }
  throw new Error(`could not bring ${target} into view`);
}
const focusedTarget = (page: Page) => page.evaluate(() => document.activeElement?.closest("[data-edit-target]")?.getAttribute("data-edit-target") ?? null);

test.describe("UI-PREVIEW-CLICK-HOMEPAGE: click a preview field to edit it", () => {
  /** Rose City's hero is the video alone; its heading only shows when Line one has words, so type a draft (never saved). */
  async function ready(page: Page) {
    await page.goto("/admin/homepage", { waitUntil: "domcontentloaded" });
    await expect(page.locator("button[data-part]").first()).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => overviewFrame(page).locator("[data-edit-target]").count(), { timeout: 30_000 }).toBeGreaterThan(5);
    if (!(await snapshot(page)).content.hero.headline_line_one) {
      await page.getByRole("button", { name: /^Edit Top of the page/ }).first().focus();
      await page.keyboard.press("Enter");
      await partDialog(page).getByLabel("Line one", { exact: true }).fill("Click to field");
      await done(page);
    }
    await expect.poll(() => overviewFrame(page).locator('h1[data-edit-target="homepage.hero.headlineLineOne"]').evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThan(20);
  }
  test.beforeEach(async ({ page }) => { await ready(page); });
  test.afterEach(async ({ page }) => {
    // Throw the draft away so nothing is saved and no browser recovery copy is left for the next test.
    if (await partDialog(page).count()) await page.keyboard.press("Escape");
    const discard = page.getByRole("button", { name: "Discard changes" }).filter({ visible: true }).first();
    if (await discard.count()) { await discard.click(); await page.getByRole("button", { name: "Discard and reload" }).click(); }
  });

  test("hero heading opens Top of the page with Line one focused and ringed", async ({ page }) => {
    const { x, y } = await fieldPoint(page, "homepage.hero.headlineLineOne");
    await page.mouse.move(x, y);
    await expect(page.locator("[data-field-hover]:not([hidden])")).toHaveAttribute("data-target", "homepage.hero.headlineLineOne");
    await page.mouse.click(x, y);
    await expect(partDialog(page).locator('[data-editor-dialog-panel="hero"]')).toBeVisible();
    await expect.poll(() => focusedTarget(page)).toBe("homepage.hero.headlineLineOne");
    await expect(partDialog(page).locator(":focus")).toHaveAccessibleName("Line one");
    await expect(partDialog(page).locator('[data-edit-target="homepage.hero.headlineLineOne"]')).toHaveAttribute("data-edit-target-flash", "");
    await expect(partDialog(page).locator("[data-edit-target-flash]")).toHaveCount(0, { timeout: 3_000 });
  });

  test("a stamped link (the hero's second button, a Next Link) opens its field and never opens a tab or leaves the admin", async ({ page }) => {
    const target = "homepage.hero.secondaryCtaLabel";
    const isLink = await overviewFrame(page).locator(`[data-edit-target="${target}"]`).first().evaluate(node => node.closest("a[href]") !== null);
    expect(isLink, `${target} is a link`).toBe(true);
    const { x, y } = await fieldPoint(page, target);
    const before = page.url();
    const popup = page.context().waitForEvent("page", { timeout: 1_500 }).catch(() => null);
    await page.mouse.click(x, y);
    expect(await popup, "clicking a stamped link opened a new tab").toBeNull();
    await expect(partDialog(page).locator('[data-editor-dialog-panel="hero"]')).toBeVisible();
    await expect.poll(() => focusedTarget(page)).toBe(target);
    expect(page.url()).toBe(before);
    expect(page.context().pages()).toHaveLength(1);
  });

  test("a ticket price opens Ticket prices with that row's Price or offer focused", async ({ page }) => {
    const rows = (await snapshot(page)).content.revamp!.prices.rows;
    // The last option that shows a price (a row whose price is blank has no price on the page), not the first.
    const row = rows.filter(item => item.price).at(-1)!;
    expect(rows.indexOf(row)).toBeGreaterThan(0);
    const target = `homepage.prices.row:${row.id}.price`;
    const { x, y } = await fieldPoint(page, target);
    await page.mouse.click(x, y);
    await expect(partDialog(page).locator('[data-editor-dialog-panel="prices"]')).toBeVisible();
    await expect.poll(() => focusedTarget(page)).toBe(target);
    await expect(partDialog(page).locator(":focus")).toHaveAccessibleName("Price or offer");
    await expect(partDialog(page).locator(":focus")).toHaveValue(row.price);
  });

  test("Schedule-owned text and the keyboard open the part, with no field focused", async ({ page }) => {
    await page.getByRole("button", { name: /^Edit Ticket prices/ }).first().focus();
    await page.keyboard.press("Enter");
    await expect(partDialog(page).locator('[data-editor-dialog-panel="prices"]')).toBeVisible();
    await page.waitForTimeout(400);
    expect(await focusedTarget(page)).toBeNull();
    await expect(partDialog(page).locator("[data-edit-target-flash]")).toHaveCount(0);
  });

  test("closing and reopening with the part button does not jump back to the last field", async ({ page }) => {
    const { x, y } = await fieldPoint(page, "homepage.hero.headlineLineOne");
    await page.mouse.click(x, y);
    await expect.poll(() => focusedTarget(page)).toBe("homepage.hero.headlineLineOne");
    await page.keyboard.press("Escape");
    await expect(partDialog(page)).toHaveCount(0);
    await page.getByRole("button", { name: /^Edit Top of the page/ }).first().focus();
    await page.keyboard.press("Enter");
    await expect(partDialog(page).locator('[data-editor-dialog-panel="hero"]')).toBeVisible();
    await page.waitForTimeout(400);
    expect(await focusedTarget(page)).toBeNull();
  });

  test("reduced motion: the ring shows without animating", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { x, y } = await fieldPoint(page, "homepage.hero.headlineLineOne");
    await page.mouse.click(x, y);
    const field = partDialog(page).locator('[data-edit-target="homepage.hero.headlineLineOne"]');
    await expect(field).toHaveAttribute("data-edit-target-flash", "static");
    expect(await field.evaluate(element => getComputedStyle(element).animationName)).toBe("none");
  });

  test.describe("phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("the sheet opens on the field's section and focuses it", async ({ page }) => {
      const { x, y } = await fieldPoint(page, "homepage.hero.headlineLineOne");
      await page.mouse.click(x, y);
      await expect(partDialog(page)).toHaveAttribute("data-view", "section");
      await expect(partDialog(page).locator('[data-editor-dialog-panel="hero"]')).toBeVisible();
      await expect.poll(() => focusedTarget(page)).toBe("homepage.hero.headlineLineOne");
    });
  });
});

test.describe("TELEMETRY-03 sponsor telemetry harness", () => {
  // At 2400 px one five-logo set (1400 px) leaves room for the clone's first four logos, so every counted sponsor is on screen twice at once.
  test.use({ viewport: { width: 2400, height: 900 } });
  test.beforeAll(buildHarness);

  test("logo_seen: nothing before the strip is on screen, then only database sponsors after the dwell and batch window", async ({ page, baseURL }) => {
    const harness = await openHarness(page, baseURL!);
    expect(beaconsOf(harness.posts, "view")).toEqual([{ t: "view", p: HARNESS_PATH, r: "", q: "" }]);
    await page.waitForTimeout(3_500); // longer than the 1 s dwell plus the 2 s batch window
    expect(beaconsOf(harness.posts, "logo_seen")).toEqual([]);

    await revealStrip(page);
    const batches = await settledLogoSeen(page, harness.posts);
    for (const batch of batches) expect(batch.p).toBe(HARNESS_PATH);
    expect(sortedIds(batches)).toEqual(COUNTED_IDS);
    expect(JSON.stringify(harness.posts)).not.toContain(FALLBACK_ID);
    expectWireContract(harness.posts);
  });

  test("logo_seen: the aria-hidden clone never adds a second count for the same sponsor", async ({ page, baseURL }) => {
    const harness = await openHarness(page, baseURL!);
    await revealStrip(page);
    const batches = await settledLogoSeen(page, harness.posts);
    const ids = sortedIds(batches);
    expect(ids).toEqual(COUNTED_IDS);
    expect(new Set(ids).size).toBe(ids.length);
    // Both copies of every counted logo really were at least half visible during the wait, so the dedupe is what held the count to one.
    const ratios = await page.evaluate(() => (window as unknown as HarnessWindow).__probeRatios);
    expect(Object.keys(ratios).sort()).toEqual(COUNTED_IDS);
    for (const id of COUNTED_IDS) {
      expect(ratios[id].original).toBeGreaterThanOrEqual(0.5);
      expect(ratios[id].clone).toBeGreaterThanOrEqual(0.5);
    }
    expectWireContract(harness.posts);
  });

  test("heartbeat: hiding the tab reports the visible time once, with an in-range e", async ({ page, baseURL }) => {
    const harness = await openHarness(page, baseURL!);
    expect(beaconsOf(harness.posts, "heartbeat")).toEqual([]);
    await page.waitForTimeout(1_600); // visible for longer than the 1 s floor
    await setTabVisibility(page, "hidden");
    await expect.poll(() => beaconsOf(harness.posts, "heartbeat").length, { timeout: 5_000 }).toBe(1);
    const [beat] = beaconsOf(harness.posts, "heartbeat");
    expect(beat.p).toBe(HARNESS_PATH);
    expect(Number.isInteger(beat.e)).toBe(true);
    expect(beat.e as number).toBeGreaterThanOrEqual(1_500);
    expect(beat.e as number).toBeLessThanOrEqual(60_000);
    expectWireContract(harness.posts);
  });

  test("hiding the tab sends queued logo ids immediately, before the 2 s batch window ends", async ({ page, baseURL }) => {
    const harness = await openHarness(page, baseURL!);
    // The 1 s dwell has passed (every id is queued) but the batch timer, which started with the first id, has 1.5 s left.
    await revealStrip(page, 1_500);
    expect(beaconsOf(harness.posts, "logo_seen")).toEqual([]);
    await setTabVisibility(page, "hidden");
    // A timer-driven batch would only arrive after this one-second poll gives up.
    await expect.poll(() => beaconsOf(harness.posts, "logo_seen").length, { timeout: 1_000 }).toBe(1);
    expect(sortedIds(beaconsOf(harness.posts, "logo_seen"))).toEqual(COUNTED_IDS);
    expect(beaconsOf(harness.posts, "heartbeat")).toHaveLength(1);
    expectWireContract(harness.posts);
  });

  test("links: linked database sponsors get /r/<id> links, the clone's are out of the tab order, the rest stay plain images", async ({ page, baseURL }) => {
    await openHarness(page, baseURL!);
    await expectSponsorLinks(page);
  });

  test("keyboard: Tab goes region, original links in order, then out of the strip; the clone is never focused; ring only, no layout change", async ({ page, baseURL }) => {
    await openHarness(page, baseURL!);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const active = () => page.evaluate(() => {
      const element = document.activeElement as HTMLElement;
      const image = element.querySelector("img");
      const box = element.getBoundingClientRect();
      const imageBox = image?.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        id: element.id, href: element.getAttribute("href"), region: element.matches('.partner-row[role="region"]'),
        insideHidden: element.closest('[aria-hidden="true"]') !== null,
        focusVisible: element.matches(":focus-visible"), outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, textDecorationLine: style.textDecorationLine,
        box: { width: box.width, height: box.height }, imageBox: imageBox ? { width: imageBox.width, height: imageBox.height } : null,
      };
    });
    const hrefs = LINKED.map(sponsor => `/r/${sponsor.id}`);

    await page.keyboard.press("Tab");
    expect(await active()).toMatchObject({ region: true, insideHidden: false });
    for (const href of hrefs) {
      await page.keyboard.press("Tab");
      const stop = await active();
      expect(stop).toMatchObject({ href, insideHidden: false, focusVisible: true, textDecorationLine: "none" });
      expect(stop.outlineStyle).not.toBe("none");
      expect(stop.outlineWidth).not.toBe("0px");
      expect(stop.imageBox).not.toBeNull();
      expect(Math.abs(stop.box.height - stop.imageBox!.height)).toBeLessThan(0.5);
      expect(Math.abs(stop.box.width - stop.imageBox!.width)).toBeLessThan(0.5);
    }
    await page.keyboard.press("Tab");
    expect(await active()).toMatchObject({ id: "after-strip", insideHidden: false });

    // Backwards: the same three links, then the region, never the clone.
    for (const href of [...hrefs].reverse()) {
      await page.keyboard.press("Shift+Tab");
      expect(await active()).toMatchObject({ href, insideHidden: false });
    }
    await page.keyboard.press("Shift+Tab");
    expect(await active()).toMatchObject({ region: true, insideHidden: false });
  });

  test("reduced motion: the clone is display:none, the original links still work and each sponsor is counted once", async ({ page, baseURL }) => {
    const harness = await openHarness(page, baseURL!, { reducedMotion: true });
    await expect(page.locator('.sponsor-set[aria-hidden="true"]')).toHaveCSS("display", "none");
    await expect(page.locator(".sponsor-set:not([aria-hidden])")).toBeVisible();
    const originals = page.locator(".sponsor-set:not([aria-hidden]) a");
    await expect(originals).toHaveCount(LINKED.length);
    for (let index = 0; index < LINKED.length; index += 1) await expect(originals.nth(index)).toBeVisible();

    await revealStrip(page);
    const batches = await settledLogoSeen(page, harness.posts);
    expect(sortedIds(batches)).toEqual(COUNTED_IDS);
    const ratios = await page.evaluate(() => (window as unknown as HarnessWindow).__probeRatios);
    for (const id of COUNTED_IDS) {
      expect(ratios[id].original).toBeGreaterThanOrEqual(0.5);
      expect(ratios[id].clone).toBe(0);
    }

    await originals.first().click();
    await expect.poll(() => harness.linkHits, { timeout: 5_000 }).toEqual([`/r/${LINKED[0].id}`]);
    expectWireContract(harness.posts);
  });

  test("without SiteTelemetry: no beacons, no observers, and the links are unchanged", async ({ page, baseURL }) => {
    const harness = await openHarness(page, baseURL!, { telemetry: false });
    await revealStrip(page, 3_500); // dwell plus batch window, with the strip fully on screen
    expect(harness.posts).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as HarnessWindow).__observerCount)).toBe(0);
    await setTabVisibility(page, "hidden"); // would flush a queue or a heartbeat if anything were running
    await page.waitForTimeout(500);
    expect(harness.posts).toEqual([]);
    await expectSponsorLinks(page);
  });
});

/**
 * UI-PREVIEW-OVERVIEW-OVERLAY-FIX. Each numbered part button must sit on its own section as that column's frame shows it
 * (not as some other frame laid it out), and no part's section may be blank in the preview. The sections are found here by
 * their public markup, independently of the Overview's own measuring code.
 */
const SECTION_SELECTORS: Record<string, readonly string[]> = {
  menu: ['[data-homepage-piece="revamp.navigation"]', "footer.club-footer"],
  hero: ["section.hero"],
  raffle: ['[data-homepage-piece="revamp.raffle"]'],
  match: ['[data-homepage-piece="revamp.match"]'],
  prices: ['[data-homepage-piece="revamp.prices"]'],
  ticket: ['[data-homepage-piece="revamp.ticket"]'],
  photos: ['[data-homepage-piece="photos"]'],
  championship: ['[data-homepage-piece="revamp.championship"]'],
  video: ['[data-homepage-piece="video"]'],
  // "a|b": the nearest b around the first a.
  sponsors: ['[data-homepage-piece="revamp.sponsors"]|section'],
};
/** The titles the part buttons must carry, written out here so a label can never quietly move to another part. */
const PART_LABELS = { menu: "Menu and footer", hero: "Top of the page", raffle: "Raffle", match: "Next home match", prices: "Ticket prices", ticket: "Ticket and map", photos: "Photo slideshow", championship: "Championship", video: "Behind the Rose video", sponsors: "Partners strip" } as const;
type Box = { left: number; top: number; right: number; bottom: number };
type OverlayCheck = { part: string; label: string; column: string; iou: number; button: Box; section: Box | null };

/** For every visible part button: the IoU between the button and its own section (in the same column's frame), both clipped to the column. */
async function overlayChecks(page: Page): Promise<OverlayCheck[]> {
  return await page.evaluate((selectors) => {
    const box = (r: DOMRect | Box): Box => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    const clip = (a: Box, b: Box): Box | null => {
      const out = { left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) };
      return out.right - out.left > 0.5 && out.bottom - out.top > 0.5 ? out : null;
    };
    const area = (b: Box | null) => b ? (b.right - b.left) * (b.bottom - b.top) : 0;
    const iou = (a: Box | null, b: Box | null) => { const i = a && b ? clip(a, b) : null; const u = area(a) + area(b) - area(i); return u > 0 ? area(i) / u : 0; };
    const out: OverlayCheck[] = [];
    for (const column of Array.from(document.querySelectorAll<HTMLElement>("[data-column], [data-actual]"))) {
      const frame = column.querySelector<HTMLIFrameElement>('iframe[title="Homepage preview"]');
      const doc = frame?.contentDocument;
      if (!frame || !doc) continue;
      const frameBox = frame.getBoundingClientRect();
      const scale = frameBox.width / frame.clientWidth;
      // Whole page: the column box clips the frame. Actual size: the frame and buttons scroll together, so nothing clips.
      // (the column's visible slice is its first child, the clip; the box itself can be taller than the slice).
      const view = column.hasAttribute("data-actual") ? null : clip(box(column.getBoundingClientRect()), box((column.firstElementChild as HTMLElement).getBoundingClientRect()));
      const find = (selector: string) => { const [first, around] = selector.split("|"); const node = doc.querySelector(first); return around ? node?.closest(around) ?? null : node; };
      const sectionsOf = (part: string) => (selectors[part] ?? []).map(find).filter((node): node is Element => !!node).map(node => {
        const r = node.getBoundingClientRect();
        const page = { left: frameBox.left + r.left * scale, top: frameBox.top + r.top * scale, right: frameBox.left + r.right * scale, bottom: frameBox.top + r.bottom * scale };
        return view ? clip(page, view) : page;
      });
      for (const button of Array.from(column.querySelectorAll<HTMLButtonElement>("button[data-part]"))) {
        const label = button.getAttribute("aria-label") ?? "";
        if (label.includes("Hidden on the page")) continue;
        const part = button.dataset.part!;
        const own = view ? clip(box(button.getBoundingClientRect()), view) : box(button.getBoundingClientRect());
        const candidates = sectionsOf(part);
        const best = candidates.reduce<{ section: Box | null; iou: number }>((top, section) => { const value = iou(own, section); return value > top.iou ? { section, iou: value } : top; }, { section: null, iou: 0 });
        out.push({ part, label, column: column.dataset.column ?? "actual", iou: Math.round(best.iou * 1000) / 1000, button: own!, section: best.section });
      }
    }
    return out;
  }, SECTION_SELECTORS);
}
const misplaced = (checks: OverlayCheck[]) => checks.filter(check => check.iou <= 0.9).map(check => `${check.label} [column ${check.column}] IoU ${check.iou}`);

/** Every part section a column shows (≥ 40 design px tall and inside the column) has a button in that column. */
async function partsWithoutButtons(page: Page): Promise<string[]> {
  return await page.evaluate((selectors) => {
    const missing: string[] = [];
    for (const column of Array.from(document.querySelectorAll<HTMLElement>("[data-column], [data-actual]"))) {
      const frame = column.querySelector<HTMLIFrameElement>('iframe[title="Homepage preview"]');
      const doc = frame?.contentDocument;
      if (!frame || !doc) continue;
      const frameBox = frame.getBoundingClientRect();
      const scale = frameBox.width / frame.clientWidth;
      const view = column.hasAttribute("data-actual") ? null : (column.firstElementChild as HTMLElement).getBoundingClientRect();
      const parts = new Set(Array.from(column.querySelectorAll<HTMLElement>("button[data-part]")).map(button => button.dataset.part));
      for (const [part, list] of Object.entries(selectors)) {
        for (const selector of list) {
          const [first, around] = selector.split("|");
          const found = doc.querySelector(first);
          const node = around ? found?.closest(around) : found;
          if (!node) continue;
          const r = node.getBoundingClientRect();
          if (r.height < 40) continue;
          const mid = frameBox.top + (r.top + r.height / 2) * scale;
          if (view && (mid < view.top || mid > view.bottom)) continue;
          if (!parts.has(part)) missing.push(`${part} [column ${column.dataset.column ?? "actual"}]`);
        }
      }
    }
    return missing;
  }, SECTION_SELECTORS);
}

test.describe("UI-PREVIEW-OVERVIEW-OVERLAY-FIX: overlays sit on their own sections and no section is blank", () => {
  async function open(page: Page) {
    await page.goto("/admin/homepage", { waitUntil: "domcontentloaded" });
    await expect(page.locator("button[data-part]").first()).toBeVisible({ timeout: 60_000 });
    await page.mouse.move(1, 1);
  }
  /** Scroll every part button into view in turn (lazy content, if any, gets its chance to load and move things). */
  async function scrollThrough(page: Page) {
    const count = await page.locator("button[data-part]").count();
    for (let index = 0; index < count; index++) {
      await page.locator("button[data-part]").nth(index).evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
      await page.waitForTimeout(120);
    }
    await page.mouse.move(1, 1);
  }
  async function expectAligned(page: Page) {
    await expect.poll(async () => misplaced(await overlayChecks(page)), { timeout: 20_000, message: "part buttons off their sections" }).toEqual([]);
    await expect.poll(() => partsWithoutButtons(page), { timeout: 10_000 }).toEqual([]);
    expect((await overlayChecks(page)).length).toBeGreaterThanOrEqual(8);
  }

  /**
   * The columns are about the same height: their difference is within 5% of the page of the best split the page allows
   * (the split can only land on a block's top), so neither column ends in a long blank stretch.
   */
  async function expectBalanced(page: Page) {
    await expect.poll(async () => page.evaluate(() => {
      const frame = document.querySelector<HTMLIFrameElement>('[data-column="0"] iframe[title="Homepage preview"]')!;
      const doc = frame.contentDocument!;
      const total = doc.body.getBoundingClientRect().height;
      const tops = Array.from(doc.querySelectorAll("[data-homepage-piece]:not([data-homepage-piece='revamp.navigation']), section, footer")).map(node => node.getBoundingClientRect().top).filter(top => top > 0);
      const best = Math.min(...tops.map(top => Math.abs(total - 2 * top)));
      const scale = frame.getBoundingClientRect().width / frame.clientWidth;
      const [left, right] = Array.from(document.querySelectorAll<HTMLElement>("[data-column]")).map(column => (column.firstElementChild as HTMLElement).getBoundingClientRect().height / scale);
      return Math.abs(left - right) <= best + 0.05 * total ? "balanced" : `left ${Math.round(left)} vs right ${Math.round(right)}; best possible difference ${Math.round(best)} of ${Math.round(total)}`;
    }), { timeout: 15_000 }).toBe("balanced");
  }

  test("Whole page: every part button covers its own section in its own column (IoU > 0.9), on load and after scrolling", async ({ page }) => {
    await open(page);
    expect(await page.locator("[data-column]").count()).toBe(2);
    await expectAligned(page);
    await scrollThrough(page);
    await expectAligned(page);
    await expectBalanced(page);
    // The label and the box come from the same part: the button's name is its own part's title.
    for (const check of await overlayChecks(page)) expect(check.label).toMatch(new RegExp(`^Edit ${(PART_LABELS as Record<string, string>)[check.part]}`));
  });

  test("Actual size: every part button covers its own section (IoU > 0.9), on load and after scrolling", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Actual size", exact: true }).click();
    await expect(page.locator("[data-actual] button[data-part]").first()).toBeVisible({ timeout: 30_000 });
    await expectAligned(page);
    await scrollThrough(page);
    await expectAligned(page);
  });

  test("Whole page: when the second frame lays the page out differently (its raffle picture not loaded), its column's buttons follow that frame", async ({ page }) => {
    await open(page);
    await expectAligned(page);
    // Lazy pictures clipped out of a column can stay unloaded in that column's frame; collapse the raffle there only.
    await page.evaluate(() => {
      const frame = document.querySelector<HTMLIFrameElement>('[data-column="1"] iframe[title="Homepage preview"]')!;
      const style = frame.contentDocument!.createElement("style");
      style.textContent = '[data-homepage-piece="revamp.raffle"] img { display: none !important; }';
      frame.contentDocument!.head.appendChild(style);
    });
    await expectAligned(page);
  });

  test("Whole page: a large picture arriving late rebalances the columns, so neither ends in a long blank stretch", async ({ page }) => {
    const raffle = (await snapshot(page)).content.revamp!.raffle.url!;
    expect(raffle).toBeTruthy();
    let held = 0;
    await page.route(url => url.href === raffle, async route => { held++; await new Promise(resolve => setTimeout(resolve, 4_000)); await route.continue(); });
    await open(page);
    await expect.poll(async () => page.evaluate(() => Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe[title="Homepage preview"]')).every(frame => {
      const image = frame.contentDocument?.querySelector<HTMLImageElement>('[data-homepage-piece="revamp.raffle"] img');
      return !!image && image.complete && image.naturalWidth > 0;
    })), { timeout: 30_000 }).toBe(true);
    expect(held).toBeGreaterThan(0);
    await expectAligned(page);
    await expectBalanced(page);
  });

  /** Every visible part section in every column: fully opaque, pictures loaded, and painted (not one flat colour). */
  async function blankSections(page: Page): Promise<string[]> {
    const { PNG } = await import("pngjs");
    const problems: string[] = [];
    // The part buttons on the page (External forms sits above the preview, in no column).
    const onPage = page.locator(":is([data-column], [data-actual]) button[data-part]");
    const count = await onPage.count();
    expect(count).toBeGreaterThanOrEqual(8);
    for (let index = 0; index < count; index++) {
      const button = onPage.nth(index);
      const label = (await button.getAttribute("aria-label")) ?? "";
      if (label.includes("Hidden on the page")) continue;
      await button.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
      await page.mouse.move(1, 1);
      await page.waitForTimeout(250);
      // The section in this column's frame: fully opaque, visible, and its pictures loaded.
      const state = await button.evaluate((element, selectors) => {
        const column = element.closest<HTMLElement>("[data-column], [data-actual]")!;
        const doc = column.querySelector<HTMLIFrameElement>('iframe[title="Homepage preview"]')!.contentDocument!;
        const part = (element as HTMLElement).dataset.part!;
        const nodes = (selectors[part] ?? []).map(selector => { const [first, around] = selector.split("|"); const node = doc.querySelector(first); return around ? node?.closest(around) ?? null : node; }).filter((node): node is Element => !!node);
        const faded = nodes.flatMap(node => {
          const issues: string[] = [];
          for (let current: Element | null = node; current; current = current.parentElement) {
            const style = doc.defaultView!.getComputedStyle(current);
            if (Number(style.opacity) < 1) issues.push(`opacity ${style.opacity} on <${current.tagName.toLowerCase()} class="${current.getAttribute("class") ?? ""}">`);
            if (style.visibility !== "visible") issues.push(`visibility ${style.visibility}`);
          }
          node.querySelectorAll("*").forEach(child => { const style = doc.defaultView!.getComputedStyle(child); if (Number(style.opacity) === 0 && style.visibility === "visible" && child.getBoundingClientRect().height > 80 && !child.closest(".cinematic-slides")) issues.push(`invisible <${child.tagName.toLowerCase()} class="${child.getAttribute("class") ?? ""}">`); });
          node.querySelectorAll("img").forEach(image => { if (image.closest('[aria-hidden="true"]')) return; if (image.getBoundingClientRect().height > 0 && !(image.complete && image.naturalWidth > 0)) issues.push(`image not loaded ${image.getAttribute("src")?.slice(-40)}`); });
          return issues;
        });
        return { faded };
      }, SECTION_SELECTORS);
      if (state.faded.length) problems.push(`${label}: ${state.faded.join("; ")}`);
      const clipBox = await button.evaluate(element => {
        const column = element.closest<HTMLElement>("[data-column], [data-actual]")!;
        const a = element.getBoundingClientRect(), b = column.getBoundingClientRect();
        const left = Math.max(a.left, b.left, 0), top = Math.max(a.top, b.top, 0), right = Math.min(a.right, b.right, innerWidth), bottom = Math.min(a.bottom, b.bottom, innerHeight);
        return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
      });
      if (clipBox.width < 20 || clipBox.height < 20) continue;
      const png = PNG.sync.read(await page.screenshot({ clip: clipBox }));
      const counts = new Map<number, number>();
      for (let offset = 0; offset < png.data.length; offset += 4) { const key = (png.data[offset] >> 3) << 10 | (png.data[offset + 1] >> 3) << 5 | (png.data[offset + 2] >> 3); counts.set(key, (counts.get(key) ?? 0) + 1); }
      const pixels = png.data.length / 4;
      const dominant = Math.max(...counts.values()) / pixels;
      // A blank (unpainted or fully faded) section is one flat colour; real content always has more than 1.5% other pixels.
      if (dominant > 0.985) problems.push(`${label}: blank region (${Math.round(dominant * 1000) / 10}% one colour)`);
    }
    return problems;
  }

  test("no part section is blank in the preview: opacity 1 and a painted, non-uniform region in every column that shows it", async ({ page }) => {
    await open(page);
    await expectAligned(page);
    expect(await blankSections(page)).toEqual([]);
    // Again with the second frame missing its raffle picture (a lazy picture clipped out of its column): the lower parts of
    // the right column must still sit on painted sections, not on the white past the end of that frame's page.
    await page.evaluate(() => {
      const frame = document.querySelector<HTMLIFrameElement>('[data-column="1"] iframe[title="Homepage preview"]')!;
      const style = frame.contentDocument!.createElement("style");
      style.textContent = '[data-homepage-piece="revamp.raffle"] img { display: none !important; }';
      frame.contentDocument!.head.appendChild(style);
    });
    await page.waitForTimeout(500);
    expect(await blankSections(page)).toEqual([]);
  });

});
