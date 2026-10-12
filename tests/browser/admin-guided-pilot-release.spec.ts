import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { Client } from "pg";
import { expect, test, type Page, type Locator } from "@playwright/test";

const clubId = "11111111-1111-4111-8111-111111111111";
const tables = ["players", "staff", "matches", "player_photos", "player_match_stats", "goalkeeper_match_stats", "player_season_stats", "goalkeeper_season_stats"] as const;
type Kind = "players" | "staff" | "matches";
type Row = Record<string, unknown> & { id: string };
const imageFile = "public/images/home/homepageSlideShowPic1.jpeg";
const logoFile = "public/images/logo/rosecityLogo.png";
const artifacts = "/private/tmp/onzio-guided-pilot-release";

async function originals(db: Client) {
  const snapshot: Record<string, Row[]> = {};
  for (const table of [...tables, "media_assets"]) snapshot[table] = (await db.query(`select to_jsonb(r) as row from onzio.${table} r where club_id=$1 order by to_jsonb(r)::text`, [clubId])).rows.map(r => r.row);
  return snapshot;
}
async function created(db: Client, kind: Kind, marker: string): Promise<Row[]> {
  return (await db.query(`select to_jsonb(r) as row from onzio.${kind} r where club_id=$1 and ${kind === "matches" ? "opponent" : "name"}=$2`, [clubId, marker])).rows.map(r => r.row);
}
async function blockProviders(page: Page) {
  await page.route("https://**/*", route => route.abort());
  for (const endpoint of ["checkout", "portal", "connect"]) await page.route(`**/api/stripe/${endpoint}**`, route => route.abort());
}
async function openRecord(page: Page, kind: Kind, marker: string) {
  await page.goto(kind === "matches" ? "/admin/schedule" : "/admin/roster");
  if (kind === "staff") await page.getByRole("tab", { name: "Staff", exact: true }).click();
  await page.getByRole("searchbox", { name: kind === "players" ? "Search players by name or jersey number" : kind === "staff" ? "Search staff by name or role" : "Search matches by opponent or venue", exact: true }).fill(marker);
  if (kind === "matches") await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  else await page.getByRole("main").getByRole("button").filter({ hasText: marker }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(kind === "matches" ? "#match-opponent" : kind === "players" ? "#player-name" : "#staff-name")).toHaveValue(marker);
  return dialog;
}
async function save(page: Page, dialog: Locator, kind: Kind) {
  const pending = page.waitForResponse(response => response.url().endsWith("/api/admin/data") && response.request().postDataJSON()?.table === kind && response.request().postDataJSON()?.operation === "insert", { timeout: 15_000 });
  await dialog.getByRole("button", { name: kind === "players" ? "Save player" : kind === "staff" ? "Save staff member" : "Save match", exact: true }).click();
  const response = await pending;
  expect(response.ok()).toBe(true);
  expect((await response.json()).error).toBeNull();
  await expect(dialog).not.toBeVisible();
}

for (const width of [390, 1440]) {
  for (const kind of ["players", "staff", "matches"] as const) {
    test(`${width}px ${kind}: actual validated image Save/Reload and status/removal confirmation`, async ({ page, baseURL }) => {
      test.setTimeout(180_000);
      if (!baseURL || new URL(baseURL).hostname !== "alpha.localhost") throw new Error("Pilot acceptance requires synthetic local Alpha.");
      const db = new Client({ host: "127.0.0.1", port: 54322, database: "postgres", user: "postgres", password: "postgres" });
      await db.connect();
      const marker = `Pilot QA ${kind} ${randomUUID().slice(0, 8)}`;
      const before = await originals(db);
      await mkdir(artifacts, { recursive: true, mode: 0o700 });
      await writeFile(`${artifacts}/original-${width}-${kind}-${marker.split(" ").at(-1)}.json`, JSON.stringify({ clubId, kind, marker, before }, null, 2), { mode: 0o600 });
      const assetIds = new Set(before.media_assets.map(row => row.id));
      const uploadedAssetIds = new Set<string>();
      page.on("response", async response => {
        if (response.url().endsWith("/api/admin/media/finalize") && response.ok()) {
          const body = await response.json().catch(() => null);
          if (typeof body?.data?.assetId === "string") uploadedAssetIds.add(body.data.assetId);
        }
      });
      try {
        await blockProviders(page);
        await page.setViewportSize({ width, height: 844 });
        await page.goto(kind === "matches" ? "/admin/schedule" : "/admin/roster");
        if (kind === "staff") await page.getByRole("tab", { name: "Staff", exact: true }).click();
        await page.getByRole("button", { name: kind === "players" ? "Add player" : kind === "staff" ? "Add staff" : /Add match/, exact: kind !== "matches" }).click();
        let dialog = page.getByRole("dialog");
        if (kind === "players") {
          await dialog.locator("#player-name").fill(marker);
          await dialog.locator("#player-number").fill("87");
          await dialog.locator("#player-position").selectOption("Forward");
          await dialog.locator("#player-nationality").click();
          await dialog.getByRole("textbox", { name: "Search nationalities", exact: true }).fill("American");
          await dialog.getByRole("option", { name: /American/ }).click();
          await dialog.locator("#player-height").fill("5'10\"");
          await dialog.locator("#player-weight").fill("165 lbs");
          await dialog.locator("#player-age").fill("22");
          await dialog.locator("#player-hometown").fill("Synthetic QA hometown");
          await dialog.locator('input[type="file"][aria-label="Upload player photo"]').setInputFiles(imageFile);
        } else if (kind === "staff") {
          await dialog.locator("#staff-initials").fill("QA");
          await dialog.locator("#staff-name").fill(marker);
          await dialog.locator("#staff-role").fill("Synthetic assistant coach");
          await dialog.locator("#staff-hometown").fill("Synthetic QA hometown");
          await dialog.locator('input[type="file"][aria-label="Upload staff photo"]').setInputFiles(imageFile);
        } else {
          const active = await db.query("select id from onzio.seasons where club_id=$1 and active=true", [clubId]);
          expect(active.rows).toHaveLength(1);
          await dialog.locator("#match-season").selectOption(active.rows[0].id);
          await dialog.locator("#match-date").click();
          const today = await page.evaluate(() => new Date().toLocaleDateString());
          await page.locator(`button[data-day="${today}"]`).click();
          await dialog.locator("#match-time").fill("18:00");
          await dialog.locator("#match-opponent").fill(marker);
          await dialog.locator("#match-venue").fill("Synthetic QA field");
          let authorizeCount = 0;
          page.on("request", request => { if (request.url().endsWith("/api/admin/media/authorize")) authorizeCount++; });
          await expect(dialog.locator("#match-opponent-logo")).toHaveAttribute("accept", "image/png,image/webp");
          await dialog.locator("#match-opponent-logo").setInputFiles(imageFile);
          await expect(dialog.getByText("Choose a PNG or WebP logo.", { exact: true })).toBeVisible();
          expect(authorizeCount).toBe(0);
          expect(await created(db, kind, marker)).toHaveLength(0);
          await dialog.locator("#match-opponent-logo").setInputFiles(logoFile);
          await expect(dialog.getByRole("button", { name: "Replace opponent logo", exact: true })).toBeVisible();
        }
        await save(page, dialog, kind);
        const rows = await created(db, kind, marker);
        expect(rows).toHaveLength(1);
        const row = rows[0];
        const assetId = row[kind === "matches" ? "opponent_logo_asset_id" : "photo_asset_id"];
        expect(typeof assetId).toBe("string");
        expect(assetIds.has(String(assetId))).toBe(false);
        uploadedAssetIds.add(String(assetId));
        const media = (await db.query("select status,storage_path,mime_type,width,height from onzio.media_assets where club_id=$1 and id=$2", [clubId, assetId])).rows[0];
        expect(media.status).toBe("published");
        expect(media.width).toBeGreaterThan(0); expect(media.height).toBeGreaterThan(0);
        expect(media.mime_type).toMatch(/^image\/(jpeg|png|webp)$/);
        const publicUrl = String(row[kind === "matches" ? "opponent_logo_url" : "photo_url"]);
        expect(new URL(publicUrl).hostname).toBe("127.0.0.1");
        expect(publicUrl).toContain("/storage/v1/object/public/onzio-media/");
        expect(publicUrl).not.toContain("/render/image/");
        const raw = await page.request.get(publicUrl);
        expect(raw.ok()).toBe(true);
        expect(raw.headers()["content-type"]).toMatch(/^image\//);
        await page.reload();
        dialog = await openRecord(page, kind, marker);
        const preview = dialog.locator('img[src*="/onzio-media/"]').first();
        await expect(preview).toBeVisible();
        await expect.poll(() => preview.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        await page.screenshot({ path: `${artifacts}/reload-${width}-${kind}.png`, fullPage: true });
        if (kind === "players") {
          await dialog.getByRole("button", { name: "Deactivate player", exact: true }).click();
          await expect(dialog.getByRole("group", { name: "Confirm player deactivation", exact: true })).toBeVisible();
          await dialog.getByRole("button", { name: "Keep active", exact: true }).click();
          expect((await created(db, kind, marker))[0].active).toBe(true);
          await dialog.getByRole("button", { name: "Deactivate player", exact: true }).click();
          await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
          await expect(dialog).not.toBeVisible();
          expect((await created(db, kind, marker))[0].active).toBe(false);
          dialog = await openRecord(page, kind, marker);
          await dialog.getByRole("button", { name: "Activate player", exact: true }).click();
          await expect(dialog).not.toBeVisible();
          expect((await created(db, kind, marker))[0].active).toBe(true);
          expect((await db.query("select player_id from onzio.player_season_stats where club_id=$1 and player_id=$2", [clubId, row.id])).rows).toHaveLength(1);
        } else if (kind === "staff") {
          await dialog.getByRole("button", { name: "Deactivate", exact: true }).click();
          await expect(dialog).not.toBeVisible();
          expect((await created(db, kind, marker))[0].active).toBe(false);
          dialog = await openRecord(page, kind, marker);
          await dialog.getByRole("button", { name: "Activate", exact: true }).click();
          await expect(dialog).not.toBeVisible();
          expect((await created(db, kind, marker))[0].active).toBe(true);
        } else {
          const trigger = dialog.getByRole("button", { name: "Delete match", exact: true });
          await trigger.click();
          const confirmation = page.getByRole("dialog", { name: "Delete this match?", exact: true });
          await expect(confirmation).toContainText(marker);
          await expect(confirmation.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
          for (let index = 0; index < 4; index++) {
            await page.keyboard.press("Tab");
            await expect.poll(() => confirmation.evaluate(el => el.contains(document.activeElement))).toBe(true);
          }
          await page.keyboard.press("Escape");
          await expect(confirmation).not.toBeVisible();
          await expect(trigger).toBeFocused();
          expect(await created(db, kind, marker)).toHaveLength(1);
          await trigger.click();
          await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
          await expect(confirmation).not.toBeVisible();
          await expect(trigger).toBeFocused();
          expect(await created(db, kind, marker)).toHaveLength(1);
          await trigger.click();
          let failDeleteOnce = true;
          await page.route("**/api/admin/data", async route => {
            const request = route.request().postDataJSON();
            if (failDeleteOnce && request.table === "matches" && request.operation === "delete") {
              failDeleteOnce = false;
              return route.abort("failed");
            }
            return route.continue();
          });
          await confirmation.getByRole("button", { name: "Delete match", exact: true }).click();
          await expect(confirmation.getByRole("alert")).toContainText(/Failed to fetch|could not be deleted/);
          await expect(confirmation.getByRole("button", { name: "Cancel", exact: true })).toBeEnabled();
          await expect(confirmation.getByRole("button", { name: "Delete match", exact: true })).toBeEnabled();
          expect(await created(db, kind, marker)).toHaveLength(1);
          await page.keyboard.press("Escape");
          await expect(confirmation).not.toBeVisible();
          await expect(trigger).toBeFocused();
          await trigger.click();
          await confirmation.getByRole("button", { name: "Delete match", exact: true }).click();
          await expect(confirmation).not.toBeVisible();
          await expect(dialog).not.toBeVisible();
          expect(await created(db, kind, marker)).toHaveLength(0);
        }
      } finally {
        try {
          const owned = await created(db, kind, marker);
          const originalIds = new Set(before[kind].map(row => row.id));
          for (const row of owned) {
            if (originalIds.has(row.id)) throw new Error("Refusing to remove original fixture.");
            await db.query(`delete from onzio.${kind} where club_id=$1 and id=$2`, [clubId, row.id]);
          }
          // Scope cleanup to newly published assets, including response-loss
          // assets captured in the local DB after a failure. No original media
          // record/object is retired and no audit history is suppressed.
          const current = await originals(db);
          for (const row of current.media_assets) if (!assetIds.has(row.id)) uploadedAssetIds.add(row.id);
          for (const id of uploadedAssetIds) {
            expect(assetIds.has(id)).toBe(false);
            const result = await page.request.post("/api/admin/media/cleanup", { data: { assetId: id } });
            expect(result.ok()).toBe(true);
            expect((await result.json()).data.status).toBe("retired");
            expect((await db.query("select status from onzio.media_assets where club_id=$1 and id=$2", [clubId, id])).rows[0]?.status).toBe("orphaned");
          }
          const after = await originals(db);
          for (const table of tables) expect(after[table]).toEqual(before[table]);
          expect(after.media_assets.filter(row => assetIds.has(row.id))).toEqual(before.media_assets);
        } finally { await db.end(); }
      }
    });
  }
}
