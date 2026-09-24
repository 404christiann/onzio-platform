import { createHash, randomUUID } from "node:crypto";
import { copyFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { expect, test } from "@playwright/test";
import {
  parsePresentationDocument,
  switchPresentationTemplate,
  type PresentationDocument,
  type TemplateId,
} from "@/packages/presentation";
import { retirePublishedMedia } from "@/lib/media-processing";

// These cases exercise the real local media pipeline (authorize -> staged
// upload -> finalize) through the actual admin route, not a mock. Only the
// deliberately-failed file's authorize call is intercepted; every other
// request is a genuine local Supabase Storage / media_assets write.

const ALPHA_CLUB_ID = "11111111-1111-4111-8111-111111111111";
/** seed.sql publishes exactly this Academy document for Alpha. Every spec here
 * republishes Alpha's presentation fixture and restores it in `finally`, but a
 * crashed or interrupted run cannot reach that `finally` — and because each run
 * captures "whatever is published now" as its baseline, a leak then becomes the
 * new baseline and stays forever. Fail loudly instead of inheriting it. */
const ALPHA_SEEDED_PRESENTATION_ID = "88888888-8888-4888-8888-888888888804";

function assertSeededPresentation(publishedDocumentId: string | null) {
  if (publishedDocumentId !== ALPHA_SEEDED_PRESENTATION_ID) {
    throw new Error(
      `Alpha's published presentation fixture is ${publishedDocumentId}, not the seeded ` +
      `${ALPHA_SEEDED_PRESENTATION_ID}. An earlier browser run was interrupted before it ` +
      "restored the fixture. Run `npm run fixture:homepage:restore:local` first.",
    );
  }
}

const OWNER_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const FIXTURE_PHOTOS = [
  "public/images/home/homepageSlideShowPic1.jpeg",
  "public/images/home/homepageSlideShowPic2.jpeg",
  "public/images/home/homepageSlideShowPic3.jpeg",
];

type OriginalState = {
  draft_document_id: string | null;
  published_document_id: string | null;
  updated_by: string;
};

const localDb = () => new Client({
  host: "127.0.0.1",
  port: 54322,
  user: "postgres",
  password: "postgres",
  database: "postgres",
});

async function readOriginalState(db: Client): Promise<OriginalState & { configuration: PresentationDocument }> {
  const stateResult = await db.query<OriginalState & { configuration: PresentationDocument }>(
    `select s.draft_document_id, s.published_document_id, s.updated_by, d.configuration
       from onzio.presentation_state s
       left join onzio.presentation_documents d
         on d.club_id = s.club_id and d.id = s.published_document_id
      where s.club_id = $1`,
    [ALPHA_CLUB_ID],
  );
  const original = stateResult.rows[0];
  if (!original?.configuration) throw new Error("Alpha has no published presentation fixture.");
  assertSeededPresentation(original.published_document_id);
  return original;
}

async function publishTemplate(db: Client, source: PresentationDocument, templateId: TemplateId, createdBy: string) {
  const switched = switchPresentationTemplate(source, { id: templateId, version: 1 });
  const id = randomUUID();
  const configuration = parsePresentationDocument(switched.document, { surface: "production" });
  const digest = createHash("sha256").update(JSON.stringify(configuration)).digest("hex");
  const versionResult = await db.query(
    "select coalesce(max(version), 0) + 1 as version from onzio.presentation_documents where club_id = $1",
    [ALPHA_CLUB_ID],
  );
  const version = Number(versionResult.rows[0].version);
  await db.query(
    `insert into onzio.presentation_documents
      (id, club_id, version, schema_version, template_id, template_version,
       configuration, configuration_digest, created_by)
     values ($1, $2, $3, 1, $4, 1, $5::jsonb, $6, $7)`,
    [id, ALPHA_CLUB_ID, version, templateId, JSON.stringify(configuration), digest, createdBy],
  );
  await db.query(
    `update onzio.presentation_state
     set published_document_id = $1, updated_by = $2
     where club_id = $3`,
    [id, createdBy, ALPHA_CLUB_ID],
  );
}

async function restoreTemplate(db: Client, original: OriginalState) {
  await db.query(
    `update onzio.presentation_state
     set draft_document_id = $1, published_document_id = $2, updated_by = $3
     where club_id = $4`,
    [original.draft_document_id, original.published_document_id, original.updated_by, ALPHA_CLUB_ID],
  );
}

/** Clears every photo row/setting and retires every media asset this test
 * created, restoring Alpha to the empty photo state it starts from. */
async function restorePhotos(db: Client) {
  const assets = await db.query<{ id: string }>(
    "select media_asset_id as id from onzio.homepage_slideshow_photos where club_id=$1 and media_asset_id is not null",
    [ALPHA_CLUB_ID],
  );
  await db.query("delete from onzio.homepage_slideshow_photos where club_id=$1", [ALPHA_CLUB_ID]);
  await db.query("delete from onzio.homepage_slideshow_settings where club_id=$1", [ALPHA_CLUB_ID]);
  for (const row of assets.rows) {
    await retirePublishedMedia({ clubId: ALPHA_CLUB_ID, actorId: OWNER_USER_ID, assetId: row.id }).catch(() => {});
  }
}

test.describe("homepage editor photo queue", () => {
  test("uploads photos through the real local pipeline, keeps a successful photo when a sibling fails, retries only the failed file, enforces the six-photo limit, reorders and removes", async ({ page }, info) => {
    test.setTimeout(180_000);
    const db = localDb();
    await db.connect();
    const original = await readOriginalState(db);
    const source = parsePresentationDocument(original.configuration, { surface: "production" });
    let failOnce = true;
    await page.route("**/api/admin/media/authorize", async route => {
      const body = route.request().postDataJSON() as { fileName?: string };
      if (failOnce && body.fileName === "homepageSlideShowPic2.jpeg") {
        failOnce = false;
        return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: { code: "MEDIA_UPLOAD_NOT_PERMITTED", message: "Injected authorization failure for this test." } }) });
      }
      return route.continue();
    });
    try {
      await publishTemplate(db, source, "clubhouse", original.updated_by);
      await page.goto("/admin/homepage");
      expect((await (await page.request.get("/api/admin/homepage")).json()).design.templateKey).toBe("clubhouse@1");
      const frame = page.frameLocator('iframe[title="Homepage preview"]');
      const toolbar = page.locator(".hp-toolbar");
      const panel = page.locator(".hp-panel");
      const photoInput = page.getByLabel("Choose homepage photos");

      // Zero-photo area is selectable.
      const emptyPiece = frame.locator('[data-homepage-piece="photos"]');
      await expect(emptyPiece).toHaveText("Photos · Add photo");
      await emptyPiece.click();
      await emptyPiece.click();
      await toolbar.getByRole("button", { name: "Add photo" }).click();
      await photoInput.setInputFiles([FIXTURE_PHOTOS[0], FIXTURE_PHOTOS[1]]);

      const photos = panel.locator(".hp-photo");
      await expect(photos).toHaveCount(2);
      const failed = photos.filter({ has: page.getByRole("alert") });
      const ready = photos.filter({ hasNot: page.getByRole("alert") });
      await expect(failed).toHaveCount(1);
      await expect(ready).toHaveCount(1);
      await expect(ready.getByRole("status")).toHaveCount(0);
      await expect(ready.locator("img")).toBeVisible();

      // Retrying only the failed file leaves the successful photo untouched.
      await failed.getByRole("button", { name: "Try this photo again" }).click();
      await expect(panel.locator(".hp-photo").filter({ has: page.getByRole("alert") })).toHaveCount(0);
      await expect(photos).toHaveCount(2);
      await expect(photos.nth(0).locator("img")).toBeVisible();
      await expect(photos.nth(1).locator("img")).toBeVisible();

      await photos.nth(0).getByLabel("Describe this photo").fill("First photo");
      await photos.nth(1).getByLabel("Describe this photo").fill("Second photo");

      // Fill to the six-photo limit with distinctly-named copies, then prove
      // the seventh is rejected outright.
      for (let i = 0; i < 4; i++) {
        const filler = info.outputPath(`filler-${i}.jpeg`);
        copyFileSync(path.resolve(FIXTURE_PHOTOS[i % FIXTURE_PHOTOS.length]), filler);
        await toolbar.getByRole("button", { name: "Add photo" }).click();
        await photoInput.setInputFiles([filler]);
        await expect(photos).toHaveCount(3 + i);
        await expect(photos.nth(2 + i).getByRole("status")).toHaveCount(0);
        await expect(photos.nth(2 + i).getByRole("alert")).toHaveCount(0);
      }
      await expect(page.getByText("6 of 6 photos used", { exact: true })).toBeVisible();
      await expect(toolbar.getByRole("button", { name: "Add photo" })).toBeDisabled();
      const overflow = info.outputPath("overflow.jpeg");
      copyFileSync(path.resolve(FIXTURE_PHOTOS[0]), overflow);
      await photoInput.setInputFiles([overflow]);
      await expect(photos).toHaveCount(6);

      // The last description and the one Save action remain reachable in
      // a short mobile sheet. This is layout evidence, not a real OS keyboard.
      await page.setViewportSize({ width: 390, height: 408 });
      await photos.nth(5).getByLabel("Describe this photo").fill("Last photo on mobile");
      await expect(panel.getByRole("button", { name: "Done", exact: true })).toBeInViewport();
      await expect(panel.getByRole("button", { name: "Save homepage", exact: true })).toBeInViewport();
      await panel.getByRole("button", { name: "Done", exact: true }).click();
      await page.setViewportSize({ width: 1440, height: 900 });
      await expect(frame.locator('[data-homepage-piece="photos"] button').first()).toHaveJSProperty("inert", true);
      await page.getByRole("button", { name: "Playback preview", exact: true }).click();
      const secondSlide = frame.locator('.clubhouse-matchday-slide').nth(1);
      await frame.getByRole("button", { name: "Show matchday photo 1", exact: true }).click();
      const nextPhoto = frame.getByRole("button", { name: "Next matchday photo", exact: true });
      await nextPhoto.focus(); await nextPhoto.press("Enter");
      await expect(secondSlide).toHaveAttribute("data-active", "true");
      await page.getByRole("button", { name: "Back to editing", exact: true }).click();
      await frame.locator('[data-homepage-piece="photos"]').click();
      await frame.locator('[data-homepage-piece="photos"]').click();
      await expect(photos.nth(5).getByLabel("Describe this photo")).toHaveValue("Last photo on mobile");

      // Reorder: move the second described photo up to the first slot.
      await expect(photos.nth(1).getByLabel("Describe this photo")).toHaveValue("Second photo");
      await photos.nth(1).getByRole("button", { name: "Move up" }).click();
      await expect(photos.nth(0).getByLabel("Describe this photo")).toHaveValue("Second photo");
      await expect(photos.nth(1).getByLabel("Describe this photo")).toHaveValue("First photo");
      await expect(photos.nth(0).getByRole("button", { name: "Move up" })).toBeDisabled();
      await expect(photos.nth(5).getByRole("button", { name: "Move down" })).toBeDisabled();

      // Removal frees a slot and keeps the remaining order contiguous.
      const removedSrc = await photos.nth(2).locator("img").getAttribute("src");
      expect(removedSrc).toBeTruthy();
      const removedPath = decodeURIComponent(new URL(removedSrc!).pathname.split("/storage/v1/object/public/onzio-media/")[1]);
      const removedAsset = await db.query("select id from onzio.media_assets where storage_path=$1", [removedPath]);
      expect(removedAsset.rows).toHaveLength(1);
      await photos.nth(2).getByRole("button", { name: "Remove photo" }).click();
      await expect(photos).toHaveCount(5);
      await expect(toolbar.getByRole("button", { name: "Add photo" })).toBeEnabled();
      await expect.poll(async () => (await db.query("select status from onzio.media_assets where id=$1", [removedAsset.rows[0].id])).rows[0]?.status).toBe("orphaned");

      await page.getByRole("button", { name: "Save homepage", exact: true }).filter({ visible: true }).click();
      await expect(page.getByText("Saved. Your homepage is updated.", { exact: true })).toBeVisible();
      const saved = await (await page.request.get("/api/admin/homepage")).json();
      expect(saved.content.photos.items).toHaveLength(5);
      expect(saved.content.photos.items.map((item: { order: number }) => item.order)).toEqual([0, 1, 2, 3, 4]);
      expect(saved.content.photos.items[0].alt).toBe("Second photo");
      await page.screenshot({ path: info.outputPath("clubhouse-photos-saved.png"), fullPage: true });
    } finally {
      await restorePhotos(db);
      await restoreTemplate(db, original);
      await db.end();
    }
  });

  test("removing a photo while finalization is in flight retires the completed upload", async ({ page }) => {
    const db = localDb();
    await db.connect();
    const original = await readOriginalState(db);
    const source = parsePresentationDocument(original.configuration, { surface: "production" });
    let releaseFinalize: (() => void) | undefined;
    const finalizeReleased = new Promise<void>(resolve => { releaseFinalize = resolve; });
    let finalizeStarted: (() => void) | undefined;
    const finalized = new Promise<void>(resolve => { finalizeStarted = resolve; });
    let uploadedAssetId: string | null = null;
    await page.route("**/api/admin/media/finalize", async route => {
      const response = await route.fetch();
      const body = await response.json() as { data?: { assetId?: string } };
      uploadedAssetId = body.data?.assetId ?? null;
      finalizeStarted?.();
      await finalizeReleased;
      await route.fulfill({ response });
    });
    try {
      await publishTemplate(db, source, "clubhouse", original.updated_by);
      await page.goto("/admin/homepage");
      const frame = page.frameLocator('iframe[title="Homepage preview"]');
      await frame.locator('[data-homepage-piece="photos"]').click();
      await frame.locator('[data-homepage-piece="photos"]').click();
      await page.getByRole("button", { name: "Add photo" }).filter({ visible: true }).first().click();
      await page.getByLabel("Choose homepage photos").setInputFiles(FIXTURE_PHOTOS[0]);
      await finalized;
      expect(uploadedAssetId).toBeTruthy();
      const photo = page.locator(".hp-panel .hp-photo");
      await expect(photo).toHaveCount(1);
      await photo.getByRole("button", { name: "Remove photo" }).click();
      await expect(photo).toHaveCount(0);
      releaseFinalize?.();
      await expect.poll(async () => (await db.query("select status from onzio.media_assets where id=$1", [uploadedAssetId])).rows[0]?.status).toBe("orphaned");
    } finally {
      releaseFinalize?.();
      await restorePhotos(db);
      await restoreTemplate(db, original);
      if (uploadedAssetId) {
        await db.query("delete from onzio.audit_events where resource_id=$1", [uploadedAssetId]);
        await db.query("delete from onzio.media_assets where id=$1", [uploadedAssetId]);
      }
      await db.end();
    }
  });

  test("Leave without saving retires an uploaded photo before navigating", async ({ page }) => {
    const db = localDb();
    await db.connect();
    const original = await readOriginalState(db);
    const source = parsePresentationDocument(original.configuration, { surface: "production" });
    let uploadedAssetId: string | null = null;
    try {
      await publishTemplate(db, source, "clubhouse", original.updated_by);
      await page.goto("/admin/homepage");
      const frame = page.frameLocator('iframe[title="Homepage preview"]');
      await frame.locator('[data-homepage-piece="photos"]').click();
      await frame.locator('[data-homepage-piece="photos"]').click();
      await page.getByRole("button", { name: "Add photo" }).filter({ visible: true }).first().click();
      await page.getByLabel("Choose homepage photos").setInputFiles(FIXTURE_PHOTOS[0]);
      const photo = page.locator(".hp-panel .hp-photo");
      await expect(photo.locator("img")).toBeVisible();
      const src = await photo.locator("img").getAttribute("src");
      const storagePath = decodeURIComponent(new URL(src!).pathname.split("/storage/v1/object/public/onzio-media/")[1]);
      uploadedAssetId = (await db.query("select id from onzio.media_assets where storage_path=$1", [storagePath])).rows[0]?.id ?? null;
      expect(uploadedAssetId).toBeTruthy();
      await page.getByRole("button", { name: "Edit in About" }).filter({ visible: true }).click();
      await page.getByRole("dialog").filter({ hasText: "Save your homepage changes?" }).getByRole("button", { name: "Leave without saving" }).click();
      await expect(page).toHaveURL(/\/admin\/about$/);
      expect((await db.query("select status from onzio.media_assets where id=$1", [uploadedAssetId])).rows[0]?.status).toBe("orphaned");
    } finally {
      await restorePhotos(db);
      await restoreTemplate(db, original);
      if (uploadedAssetId) {
        await db.query("delete from onzio.audit_events where resource_id=$1", [uploadedAssetId]);
        await db.query("delete from onzio.media_assets where id=$1", [uploadedAssetId]);
      }
      await db.end();
    }
  });

  test("partial recovered-draft cleanup keeps photos unsaveable until discard is retried", async ({ page }) => {
    const db = localDb();
    await db.connect();
    const original = await readOriginalState(db);
    const source = parsePresentationDocument(original.configuration, { surface: "production" });
    const uploadedAssetIds: string[] = [];
    let baselineIntro: string | null = null;
    const newerIntro = `Newer homepage ${crypto.randomUUID().slice(0, 8)}`;
    try {
      await publishTemplate(db, source, "clubhouse", original.updated_by);
      const baseline = await (await page.request.get("/api/admin/homepage")).json();
      baselineIntro = baseline.content.hero.intro;
      await page.goto("/admin/homepage");
      const frame = page.frameLocator('iframe[title="Homepage preview"]');
      await frame.locator('[data-homepage-piece="photos"]').click();
      await frame.locator('[data-homepage-piece="photos"]').click();
      await page.getByRole("button", { name: "Add photo" }).filter({ visible: true }).first().click();
      await page.getByLabel("Choose homepage photos").setInputFiles(FIXTURE_PHOTOS.slice(0, 2));
      const photos = page.locator(".hp-panel .hp-photo img");
      await expect(photos).toHaveCount(2);
      for (let index = 0; index < 2; index += 1) {
        await expect(photos.nth(index)).toBeVisible();
        const src = await photos.nth(index).getAttribute("src");
        const storagePath = decodeURIComponent(new URL(src!).pathname.split("/storage/v1/object/public/onzio-media/")[1]);
        const assetId = (await db.query("select id from onzio.media_assets where storage_path=$1", [storagePath])).rows[0]?.id;
        expect(assetId).toBeTruthy();
        uploadedAssetIds.push(assetId);
      }
      // Give the debounced IndexedDB write time to persist the uploaded asset.
      await page.waitForTimeout(900);
      const newer = await page.request.post("/api/admin/homepage", { data: {
        operationId: crypto.randomUUID(), expectedRevision: baseline.revision,
        designRevision: baseline.designRevision, sections: { hero: { intro: newerIntro } },
      } });
      expect(newer.ok()).toBe(true);
      await page.reload();
      const discard = page.getByRole("button", { name: "Discard recovered draft", exact: true });
      await expect(discard).toBeVisible();

      await page.route("**/api/admin/homepage/upload-cleanup", route => {
        const { assetId } = route.request().postDataJSON() as { assetId: string };
        if (assetId !== uploadedAssetIds[1]) return route.continue();
        return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "MEDIA_CLEANUP_FAILED" } }) });
      });
      await discard.click();
      await expect(page.getByRole("alert").filter({ hasText: "An unused photo could not be removed" })).toBeVisible();
      await expect(discard).toBeVisible();
      await expect.poll(async () => (await db.query("select status from onzio.media_assets where id=$1", [uploadedAssetIds[0]])).rows[0]?.status).toBe("orphaned");
      expect((await db.query("select status from onzio.media_assets where id=$1", [uploadedAssetIds[1]])).rows[0]?.status).toBe("published");
      const recoveryPhotos = await page.evaluate(async () => {
        const request = indexedDB.open("onzio-homepage-editor", 1);
        const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        try {
          const records = await new Promise<Array<{ draft: { photos: { items: Array<{ upload: string; assetId: string | null; localFileKey?: string }> } } }>>((resolve, reject) => {
            const tx = db.transaction("drafts", "readonly");
            const read = tx.objectStore("drafts").getAll();
            read.onsuccess = () => resolve(read.result);
            read.onerror = () => reject(read.error);
          });
          return records[0]?.draft.photos.items ?? [];
        } finally { db.close(); }
      });
      expect(recoveryPhotos).toHaveLength(2);
      expect(recoveryPhotos.map(photo => photo.upload)).toEqual(["failed", "failed"]);
      expect(recoveryPhotos.map(photo => photo.assetId)).toEqual(uploadedAssetIds);
      expect(recoveryPhotos.every(photo => !!photo.localFileKey)).toBe(true);

      await page.reload();
      await expect(discard).toBeVisible();

      await page.unroute("**/api/admin/homepage/upload-cleanup");
      await discard.click();
      await expect(discard).toHaveCount(0);
      await expect.poll(async () => (await db.query("select status from onzio.media_assets where id=$1", [uploadedAssetIds[1]])).rows[0]?.status).toBe("orphaned");
      await page.reload();
      await expect(page.getByRole("button", { name: "Discard recovered draft", exact: true })).toHaveCount(0);
    } finally {
      await page.unroute("**/api/admin/homepage/upload-cleanup");
      try {
        for (const assetId of uploadedAssetIds) await page.request.post("/api/admin/homepage/upload-cleanup", { data: { assetId } }).catch(() => {});
        if (baselineIntro !== null) {
          const current = await (await page.request.get("/api/admin/homepage")).json();
          if (current.content.hero.intro === newerIntro) {
            const restore = await page.request.post("/api/admin/homepage", { data: {
              operationId: crypto.randomUUID(), expectedRevision: current.revision,
              designRevision: current.designRevision, sections: { hero: { intro: baselineIntro } },
            } });
            expect(restore.ok(), JSON.stringify(await restore.json())).toBe(true);
          }
        }
      } finally {
        await restorePhotos(db);
        await restoreTemplate(db, original);
        for (const assetId of uploadedAssetIds) {
          await db.query("delete from onzio.audit_events where resource_id=$1", [assetId]);
          await db.query("delete from onzio.media_assets where id=$1", [assetId]);
        }
        await db.end();
      }
    }
  });

  test("shared About shortcut offers Save and continue, Keep editing and Leave without saving while dirty", async ({ page }) => {
    const db = localDb();
    await db.connect();
    const original = await readOriginalState(db);
    const source = parsePresentationDocument(original.configuration, { surface: "production" });
    // A fixed marker cannot be re-typed once a crashed run leaves it behind:
    // the field would already hold it, nothing would be dirty, and Save would
    // stay disabled forever. Keep every assertion, make the value unique.
    const dirtyMarker = `Dirty before leaving ${crypto.randomUUID().slice(0, 8)}`;
    const savedMarker = `Saved before leaving ${crypto.randomUUID().slice(0, 8)}`;
    let baselineHero: Record<string, unknown> | null = null;
    try {
      await publishTemplate(db, source, "clubhouse", original.updated_by);
      baselineHero = (await (await page.request.get("/api/admin/homepage")).json()).content.hero;
      await page.goto("/admin/homepage");
      const frame = page.frameLocator('iframe[title="Homepage preview"]');
      const heading = frame.locator('[data-homepage-piece="hero.heading"]');
      await heading.click();
      await page.getByRole("button", { name: "Change the words" }).filter({ visible: true }).click();
      await page.getByLabel("Line one", { exact: true }).fill(dirtyMarker);
      await page.getByRole("button", { name: "Done", exact: true }).filter({ visible: true }).click();

      // Shared content is not drawn on the editing canvas any more; the editor
      // offers it as an explicit shortcut, which is what raises the leave guard.
      await expect(frame.locator('[data-homepage-piece="shared.story"]')).toHaveCount(0);
      await page.getByRole("button", { name: "Edit in About" }).filter({ visible: true }).click();

      const dialog = page.getByRole("dialog").filter({ hasText: "Save your homepage changes?" });
      await expect(dialog).toBeVisible();
      await expect(page).toHaveURL(/\/admin\/homepage$/);

      await dialog.getByRole("button", { name: "Keep editing" }).click();
      await expect(dialog).toBeHidden();
      await expect(page).toHaveURL(/\/admin\/homepage$/);
      await expect(page.getByLabel("Line one", { exact: true })).toHaveCount(0);

      await page.getByRole("button", { name: "Edit in About" }).filter({ visible: true }).click();
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Leave without saving" }).click();
      await expect(page).toHaveURL(/\/admin\/about$/);

      await page.goto("/admin/homepage");
      const reloadedHeading = frame.locator('[data-homepage-piece="hero.heading"]');
      await expect(reloadedHeading).not.toContainText(dirtyMarker);

      await reloadedHeading.click();
      await page.getByRole("button", { name: "Change the words" }).filter({ visible: true }).click();
      await page.getByLabel("Line one", { exact: true }).fill(savedMarker);
      await page.getByRole("button", { name: "Done", exact: true }).filter({ visible: true }).click();
      // Shared content left the editing canvas; the editor's explicit shortcut
      // is now what raises the unsaved-changes guard.
      await page.getByRole("button", { name: "Edit in About" }).filter({ visible: true }).click();
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Save and continue" }).click();
      await expect(page).toHaveURL(/\/admin\/about$/);
      const afterSave = await (await page.request.get("/api/admin/homepage")).json();
      expect(afterSave.content.hero.headline_line_one).toBe(savedMarker);
    } finally {
      const current = await (await page.request.get("/api/admin/homepage")).json();
      if (baselineHero && current.content.hero.headline_line_one === savedMarker) {
        // Clubhouse does not expose "eyebrow" as an editable hero field;
        // resubmitting it here is rejected with FIELD_UNAVAILABLE, which
        // would otherwise leave this restore silently failed.
        const { eyebrow: _eyebrow, ...restorableHero } = baselineHero;
        const restore = await page.request.post("/api/admin/homepage", { data: { operationId: crypto.randomUUID(), expectedRevision: current.revision, designRevision: current.designRevision, sections: { hero: restorableHero } } });
        if (!restore.ok()) throw new Error(`Failed to restore Alpha's hero content: ${await restore.text()}`);
      }
      await restoreTemplate(db, original);
      await db.end();
    }
  });

  test("a hidden section can be selected and shown again", async ({ page }) => {
    const db = localDb();
    await db.connect();
    const original = await readOriginalState(db);
    const source = parsePresentationDocument(original.configuration, { surface: "production" });
    try {
      await publishTemplate(db, source, "cinematic", original.updated_by);
      await db.query(
        `insert into onzio.behind_the_rose_section(club_id,visible,video_url) values($1,false,'https://example.test/local-video.mp4')
         on conflict(club_id) do update set visible=false, video_url='https://example.test/local-video.mp4'`,
        [ALPHA_CLUB_ID],
      );
      await page.goto("/admin/homepage");
      const frame = page.frameLocator('iframe[title="Homepage preview"]');
      const hidden = frame.locator('[data-homepage-piece="video"]');
      await expect(hidden).toHaveText("Video feature · Hidden from homepage");
      await hidden.click();
      const toolbar = page.locator(".hp-toolbar");
      const visibilityToggle = toolbar.getByLabel("Show on homepage");
      await expect(visibilityToggle).not.toBeChecked();
      await visibilityToggle.check();
      await expect(frame.locator('[data-homepage-piece="video"]')).not.toHaveText("Video feature · Hidden from homepage");
      await visibilityToggle.uncheck();
      await expect(frame.locator('[data-homepage-piece="video"]')).toHaveText("Video feature · Hidden from homepage");
    } finally {
      await db.query("delete from onzio.behind_the_rose_section where club_id=$1", [ALPHA_CLUB_ID]);
      await restoreTemplate(db, original);
      await db.end();
    }
  });
});
