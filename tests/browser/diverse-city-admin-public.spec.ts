import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { currentTotp } from "../helpers/mfa";
import { assertSafeTestEnvironment } from "../helpers/environment";
import { USER_IDS } from "../fixtures/entities";

const PUBLIC_ROUTES = [
  ["/programs", "Alpha Academy Pathway"],
  ["/programs/alpha-academy-pathway", "Alpha Academy Pathway"],
  ["/contact", "Talk with Alpha FC"],
  ["/tryouts", "Alpha Open Evaluation"],
] as const;

async function pageHealth(page: Page) {
  return page.evaluate(() => ({
    horizontalOverflow:
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    hasErrorOverlay: Boolean(
      document.querySelector(
        "[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay",
      ),
    ),
    brokenImages: Array.from(document.images)
      .filter((image) => image.complete && image.naturalWidth <= 0)
      .map((image) => image.currentSrc || image.src),
    forbiddenMedia: performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter(
        (url) =>
          url.includes("/storage/v1/render/image/") ||
          url.includes("/_next/image"),
      ),
  }));
}

async function expectHealthy(page: Page) {
  expect(await pageHealth(page)).toEqual({
    horizontalOverflow: 0,
    hasErrorOverlay: false,
    brokenImages: [],
    forbiddenMedia: [],
  });
}

test("Academy public routes render isolated editable content at desktop and mobile", async ({
  page,
}, testInfo) => {
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
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const [route, expectedText] of PUBLIC_ROUTES) {
      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page.getByText(expectedText, { exact: true }).first()).toBeVisible();
      await expect(page.getByText("Bravo Must Stay Isolated", { exact: false })).toHaveCount(0);
      await expectHealthy(page);
    }

    await page.goto("/tryouts", { waitUntil: "networkidle" });
    await expect(page.getByText("TBA", { exact: true })).toHaveCount(3);
    const registration = page.getByRole("link", {
      name: "Continue to external registration",
    });
    await expect(registration).toHaveAttribute("target", "_blank");
    await expect(registration).toHaveAttribute("rel", "noopener noreferrer");
    await page.screenshot({
      path: testInfo.outputPath(`dcfc-304-public-${viewport.name}.png`),
      fullPage: true,
    });
  }

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test.describe("protected admin browser acceptance", () => {
  let service: ReturnType<typeof createClient>;

  async function clearLocalFactors() {
    const factors = await service.auth.admin.mfa.listFactors({
      userId: USER_IDS.adminAal2,
    });
    if (factors.error) throw factors.error;
    for (const factor of factors.data?.factors ?? []) {
      const deletion = await service.auth.admin.mfa.deleteFactor({
        userId: USER_IDS.adminAal2,
        id: factor.id,
      });
      if (deletion.error) throw deletion.error;
    }
  }

  test.beforeAll(async () => {
    const { supabaseUrl } = assertSafeTestEnvironment();
    service = createClient(
      supabaseUrl,
      process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: {
          transport: WebSocket as unknown as typeof globalThis.WebSocket,
        },
      },
    );
    await clearLocalFactors();
  });

  test.afterAll(async () => {
    if (service) await clearLocalFactors();
  });

  test("AAL2 admin pages work at desktop and mobile without tenant overflow", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/admin/login", { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill("admin-aal2@alpha.local");
    await page.getByLabel("Password").fill("local-contract-only");
    const enrollmentResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/auth/v1/factors") &&
        response.request().method() === "POST" &&
        response.status() === 200,
    );
    await page.getByRole("button", { name: "Continue" }).click();
    const enrollment = (await (await enrollmentResponse).json()) as {
      totp?: { secret?: string };
    };
    expect(enrollment.totp?.secret).toBeTruthy();
    await page.getByLabel("Authenticator code").fill(currentTotp(enrollment.totp!.secret!));
    await page.getByRole("button", { name: "Verify MFA" }).click();
    await page.waitForURL(/\/admin$/);

    for (const viewport of [
      { name: "desktop", width: 1440, height: 900 },
      { name: "mobile", width: 390, height: 844 },
    ] as const) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const route of ["/admin/programs", "/admin/contact", "/admin/tryouts"]) {
        await page.goto(route, { waitUntil: "networkidle" });
        await expect(page.locator("h1")).toBeVisible();
        await expect(page.getByText("requires Pro", { exact: false })).toHaveCount(0);
        await expectHealthy(page);
      }
      await page.screenshot({
        path: testInfo.outputPath(`dcfc-304-admin-${viewport.name}.png`),
        fullPage: true,
      });
    }
  });
});
