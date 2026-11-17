import { randomUUID, createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
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
async function openPiece(page: Page, piece: string) {
  const target = page.frameLocator('iframe[title="Homepage preview"]').locator(`[data-homepage-piece="${piece}"]`).first();
  // The Rose City header is sticky (top:0, z-index:10) since 2f70087, which landed after this spec was written. Scroll
  // each piece to just below it so the (12, 12) click lands on the piece, not on the header covering its top edge.
  await target.evaluate(element => {
    element.scrollIntoView({ block: "start" });
    const header = element.ownerDocument.querySelector(".club-header");
    if (header && header !== element) element.ownerDocument.defaultView?.scrollBy(0, -header.getBoundingClientRect().bottom);
  });
  await target.click({ position: { x: 12, y: 12 } });
  await target.click({ position: { x: 12, y: 12 } });
  await expect(page.locator(".hp-panel")).toBeVisible();
}
async function editorReady(page: Page) {
  await expect(page.frameLocator('iframe[title="Homepage preview"]').locator(".cinematic-slides img")).toHaveCount(7, { timeout: 20_000 });
}
async function done(page: Page) { await page.getByRole("button", { name: "Done", exact: true }).filter({ visible: true }).first().click(); await expect(page.locator(".hp-panel")).toHaveCount(0); }
async function saveThroughUi(page: Page) {
  const button = page.getByRole("button", { name: "Save homepage", exact: true }).filter({ visible: true }).first();
  await expect(button).toBeEnabled();
  const response = page.waitForResponse(result => result.url().endsWith("/api/admin/homepage") && result.request().method() === "POST");
  await button.click(); expect((await response).status()).toBe(200);
  await expect(page.locator(".hp-status")).toHaveText("Saved. Your homepage is updated.");
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
      const frame = page.frameLocator('iframe[title="Homepage preview"]');
      await editorReady(page);
      await openPiece(page, "revamp.navigation");
      await page.locator(".hp-panel").getByLabel("Community", { exact: true }).fill(`Community ${viewport.name}`);
      await done(page);
      await openPiece(page, "revamp.prices");
      await page.locator(".hp-panel").getByLabel("Price or offer", { exact: true }).first().fill("$8");
      await done(page);
      await openPiece(page, "revamp.ticket");
      await page.locator(".hp-panel").getByLabel("Show ticket and map on homepage", { exact: true }).uncheck();
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
      await page.locator(".hp-panel").getByLabel("Show ticket and map on homepage", { exact: true }).check();
      await done(page);
      await openPiece(page, "revamp.raffle");
      await page.locator(".hp-panel").getByLabel("Replace image", { exact: true }).setInputFiles("assets/rose-city-2027/inputs/trophies.webp");
      await expect(page.locator(".hp-panel").getByText("Adding your image…", { exact: true })).toHaveCount(0);
      await expect(page.locator(".hp-panel").getByRole("alert")).toHaveCount(0);
      await expect.poll(async () => await frame.locator(".raffle img").getAttribute("src")).not.toBe(originalRevamp.raffle.url);
      await expect(page.locator(".hp-panel img")).toBeVisible();
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
