import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { currentTotp } from "../helpers/mfa";
import { assertSafeTestEnvironment } from "../helpers/environment";

const LOCAL_OWNER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const PUBLIC_ROUTES = [
  ["/", "One Community"],
  ["/programs", "Building Future Champions"],
  ["/programs/youth-academy", "Building Future Champions"],
  ["/contact", "Reach out. We're here for you."],
  ["/tryouts", "No tryouts published"],
  ["/roster", "Roster coming soon"],
  ["/schedule", "Schedule coming soon"],
  ["/shop", "Diverse City FC Match Jersey"],
  ["/sponsors", "Community Partners"],
  ["/club/about", "About Club"],
] as const;

async function health(page: Page) {
  return page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    overlay: Boolean(document.querySelector("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay")),
    brokenImages: Array.from(document.images)
      .filter((image) => image.complete && image.naturalWidth <= 0)
      .map((image) => image.currentSrc || image.src),
    forbiddenMedia: performance.getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => url.includes("/storage/v1/render/image/") || url.includes("/_next/image")),
    forbiddenCopy: /Pasadena|Niky's|Player 0|Opponent TBA|Sponsor opportunity|google\.com/i.test(document.body.innerText),
  }));
}

async function expectHealthy(page: Page) {
  expect(await health(page)).toEqual({
    overflow: 0,
    overlay: false,
    brokenImages: [],
    forbiddenMedia: [],
    forbiddenCopy: false,
  });
}

test("approved public rollout renders at desktop and mobile without hidden content or tenant bleed", async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ] as const) {
    await page.setViewportSize(viewport);
    for (const [route, expectedText] of PUBLIC_ROUTES) {
      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page.getByText(expectedText, { exact: false }).first()).toBeVisible();
      await expectHealthy(page);
    }
    await page.goto("/", { waitUntil: "networkidle" });
    await page.screenshot({
      path: testInfo.outputPath(`dcfc-403-public-${viewport.name}.png`),
      fullPage: true,
    });
  }
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test.describe("local protected admin acceptance", () => {
  let service: ReturnType<typeof createClient>;

  async function clearFactors() {
    const factors = await service.auth.admin.mfa.listFactors({ userId: LOCAL_OWNER_ID });
    if (factors.error) throw factors.error;
    for (const factor of factors.data?.factors ?? []) {
      const deletion = await service.auth.admin.mfa.deleteFactor({
        userId: LOCAL_OWNER_ID,
        id: factor.id,
      });
      if (deletion.error) throw deletion.error;
    }
  }

  test.beforeAll(async () => {
    const { supabaseUrl } = assertSafeTestEnvironment();
    service = createClient(supabaseUrl, process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
    });
    await clearFactors();
  });

  test.afterAll(async () => {
    if (service) await clearFactors();
  });

  test("the local owner reaches Diverse City admin domains with AAL2", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/login", { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill("owner-aal2@alpha.local");
    await page.getByLabel("Password").fill("local-contract-only");
    const enrollmentResponse = page.waitForResponse(
      (response) => response.url().includes("/auth/v1/factors") &&
        response.request().method() === "POST" && response.status() === 200,
    );
    await page.getByRole("button", { name: "Continue" }).click();
    const enrollment = (await (await enrollmentResponse).json()) as { totp?: { secret?: string } };
    expect(enrollment.totp?.secret).toBeTruthy();
    await page.getByLabel("Authenticator code").fill(currentTotp(enrollment.totp!.secret!));
    await page.getByRole("button", { name: "Verify MFA" }).click();
    await page.waitForURL(/\/admin$/);

    for (const viewport of [
      { name: "desktop", width: 1440, height: 900 },
      { name: "mobile", width: 390, height: 844 },
    ] as const) {
      await page.setViewportSize(viewport);
      for (const route of ["/admin/programs", "/admin/contact", "/admin/tryouts", "/admin/shop", "/admin/about"]) {
        await page.goto(route, { waitUntil: "networkidle" });
        await expect(page.locator("h1").first()).toBeVisible();
        await expect(page.getByText("requires Pro", { exact: false })).toHaveCount(0);
        await expectHealthy(page);
      }
      await page.screenshot({
        path: testInfo.outputPath(`dcfc-403-admin-${viewport.name}.png`),
        fullPage: true,
      });
    }
  });
});
