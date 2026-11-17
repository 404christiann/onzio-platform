import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";
import { CLUB_IDS } from "../fixtures/entities";

// ADMIN-RE-24c: search on local Alpha (design: admin-plain-search-two-clubs.html).
// One fixture player, "Sam Okafor", is added for the run and removed after.
// Laptop: the sidebar box and ⌘K. Phone: the magnifier, full screen, Cancel.

const ALPHA = CLUB_IDS.alpha;
const FIXTURE = "RE-24c fixture";
const SHOTS = "test-results/admin-reimagined";
const ORIGIN = "http://alpha.localhost:3110";
const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };

test.describe.configure({ mode: "serial" });

async function sql<T extends Record<string, unknown> = Record<string, unknown>>(text: string, values: unknown[] = []): Promise<T[]> {
  const db = new Client(config);
  await db.connect();
  try {
    return (await db.query<T>(text, values)).rows;
  } finally {
    await db.end();
  }
}

let samId = "";

test.beforeAll(async () => {
  await sql("delete from onzio.players where club_id=$1 and caption=$2", [ALPHA, FIXTURE]);
  const [row] = await sql<{ id: string }>(
    "insert into onzio.players (club_id, number, name, position, age, caption, active) values ($1, 9, 'Sam Okafor', 'Forward', 20, $2, true) returning id",
    [ALPHA, FIXTURE],
  );
  samId = row.id;
});

test.afterAll(async () => {
  await sql("delete from onzio.players where club_id=$1 and caption=$2", [ALPHA, FIXTURE]);
});

function dialog(page: Page) {
  return page.getByTestId("admin-search");
}

async function itemLabels(page: Page) {
  return dialog(page)
    .locator("[cmdk-item]")
    .evaluateAll((items) => items.map((item) => item.querySelector("span")?.textContent ?? ""));
}

async function setTheme(context: BrowserContext, theme: "light" | "dark") {
  await context.addCookies([{ name: "onzio-admin-theme", value: theme, url: ORIGIN }]);
}

for (const theme of ["light", "dark"] as const) {
  test(`laptop: the sidebar box and ⌘K, word starts first, query resets (${theme})`, async ({ page, context }) => {
    await setTheme(context, theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/games");
    await page.getByTestId("admin-search-box").click();
    await expect(dialog(page)).toBeVisible();
    const input = dialog(page).getByRole("combobox");
    await expect(input).toBeFocused();
    await input.fill("roster");
    expect((await itemLabels(page))[0]).toBe("Team roster");
    await page.screenshot({ path: `${SHOTS}/search-roster-1440-${theme}.png` });
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/admin\/roster$/);
    await expect(dialog(page)).toHaveCount(0);

    await page.keyboard.press("ControlOrMeta+k");
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole("combobox")).toHaveValue("");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`phone: the magnifier opens full screen; “sam” finds the player, not Sign-up forms (${theme})`, async ({ page, context }) => {
    await setTheme(context, theme);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin");
    await page.getByTestId("admin-search-button").click();
    const box = await dialog(page).boundingBox();
    expect(Math.round(box?.width ?? 0)).toBe(390);
    await dialog(page).getByRole("combobox").fill("sam");
    const labels = await itemLabels(page);
    expect(labels[0]).toBe("Sam Okafor");
    expect(labels).not.toContain("Sign-up forms");
    await page.screenshot({ path: `${SHOTS}/search-sam-390-${theme}.png` });
    await dialog(page).locator(`[data-search-item="player:${samId}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/admin/games/players/${samId}$`));
    await expect(page.getByRole("main").getByRole("heading", { level: 1, name: "Sam Okafor" })).toBeVisible();

    await page.getByTestId("admin-search-button").click();
    await dialog(page).getByRole("combobox").fill("zzzz");
    await expect(dialog(page)).toContainText("Nothing matches.");
    await dialog(page).getByRole("button", { name: /Cancel|Close search/ }).click();
    await expect(dialog(page)).toHaveCount(0);
  });
}

test.describe("a helper", () => {
  const adminState = process.env.ADMIN_REIMAGINED_ADMIN_STORAGE_STATE;
  test.skip(!adminState, "Set ADMIN_REIMAGINED_ADMIN_STORAGE_STATE to the local administrator browser state.");
  test.use({ storageState: adminState });

  test("never sees owner-only pages in search", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin");
    await page.getByTestId("admin-search-box").click();
    await dialog(page).getByRole("combobox").fill("pay");
    expect(await itemLabels(page)).not.toContain("Payments and plan");
    await dialog(page).getByRole("combobox").fill("sign in");
    expect(await itemLabels(page)).not.toContain("Who can sign in");
  });
});
