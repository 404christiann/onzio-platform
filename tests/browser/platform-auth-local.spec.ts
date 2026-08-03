import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { assertSafeTestEnvironment } from "../helpers/environment";

const ALPHA_CLUB_ID = "11111111-1111-4111-8111-111111111111";

type MailpitMessage = {
  ID: string;
  Subject: string;
  Created: string;
  To: Array<{ Address: string }>;
};

async function latestCode(email: string, after: number) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch("http://127.0.0.1:54324/api/v1/messages");
    const body = (await response.json()) as { messages: MailpitMessage[] };
    const message = body.messages.find(
      (candidate) =>
        new Date(candidate.Created).getTime() >= after - 1_000 &&
        candidate.To.some(
          (recipient) => recipient.Address.toLowerCase() === email,
        ),
    );
    const code = message?.Subject.match(/^(\d{6})\b/)?.[1];
    if (code) return code;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No local sign-in code arrived for ${email}`);
}

async function requestAndVerify(page: Page, email: string) {
  await page.goto("/admin/login", { waitUntil: "networkidle" });
  const requestedAt = Date.now();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible();
  const recentlySent = await page
    .getByRole("alert")
    .filter({ hasText: "A sign-in code was sent recently" })
    .isVisible();
  const code = await latestCode(email, recentlySent ? 0 : requestedAt);
  await page.getByLabel("Sign-in code").fill(code);
  await page.waitForURL(/\/admin$/);
}

async function expectAdminNavigationScrollable(page: Page) {
  const navigation = page.getByRole("navigation", { name: "Admin navigation" });
  await expect(navigation).toBeVisible();
  const before = await navigation.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }));
  expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);
  await navigation.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(async () => navigation.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
}

test("passwordless owner adds an admin who signs in from desktop and mobile", async ({ page }, testInfo) => {
  const { supabaseUrl } = assertSafeTestEnvironment();
  const service = createClient(
    supabaseUrl,
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "onzio" },
      realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
    },
  );
  const ownerEmail = `plat101-owner-${randomUUID()}@onzio.local`;
  const adminEmail = `plat101-browser-${randomUUID()}@onzio.local`;
  let ownerId: string | null = null;
  const consoleErrors: string[] = [];
  const cooldownResponses: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() === 429 && response.url().includes("/auth/v1/otp")) {
      cooldownResponses.push(response.url());
    }
  });

  try {
    const ownerIdentity = await service.auth.admin.createUser({
      email: ownerEmail,
      email_confirm: true,
    });
    expect(ownerIdentity.error).toBeNull();
    ownerId = ownerIdentity.data.user?.id ?? null;
    expect(ownerId).not.toBeNull();
    const ownerMembership = await service.from("club_members").insert({
      club_id: ALPHA_CLUB_ID,
      user_id: ownerId!,
      role: "owner",
      status: "active",
    });
    expect(ownerMembership.error).toBeNull();

    await page.setViewportSize({ width: 1440, height: 900 });
    await requestAndVerify(page, ownerEmail);
    await expect(page.getByText("Team access")).toBeVisible();
    await page.getByText("Team access").click();
    await expect(page.getByRole("heading", { name: "Team access" })).toBeVisible();

    const addedAt = Date.now();
    await page.getByPlaceholder("administrator@example.com").fill(adminEmail);
    await page.getByRole("button", { name: "Send access code" }).click();
    await expect(page.getByRole("status")).toContainText("Administrator added");
    const adminCode = await latestCode(adminEmail, addedAt);

    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(/\/admin\/login$/);
    await page.getByLabel("Email").fill(adminEmail);
    await page.getByRole("button", { name: "Send sign-in code" }).click();
    await expect(page.getByRole("heading", { name: "Enter your code" })).toBeVisible();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "A sign-in code was sent recently" }),
    ).toBeVisible();
    await page.getByLabel("Sign-in code").fill(adminCode);
    await page.waitForURL(/\/admin$/);
    await expect(page.getByText("Team access")).toHaveCount(0);
    await expectAdminNavigationScrollable(page);
    expect(
      await page.locator("[data-nextjs-dialog], .vite-error-overlay").count(),
    ).toBe(0);
    expect((await page.locator("body").innerText()).trim().length).toBeGreaterThan(0);
    await page.screenshot({
      path: testInfo.outputPath("plat-101-admin-desktop.png"),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: "Open admin navigation" })).toBeVisible();
    await page.getByRole("button", { name: "Open admin navigation" }).click();
    await expectAdminNavigationScrollable(page);
    await page.screenshot({
      path: testInfo.outputPath("plat-101-admin-mobile.png"),
      fullPage: true,
    });
    expect(cooldownResponses).toHaveLength(1);
    expect(
      consoleErrors.filter(
        (message) =>
          !message.includes(
            "Failed to load resource: the server responded with a status of 429",
          ),
      ),
    ).toEqual([]);
  } finally {
    const identities = await service.auth.admin.listUsers({ page: 1, perPage: 1_000 });
    const admin = identities.data.users.find(
      (user) => user.email?.toLowerCase() === adminEmail,
    );
    if (admin) {
      await service.from("audit_events").delete().eq("club_id", ALPHA_CLUB_ID).eq("resource_id", admin.id);
      await service.from("club_members").delete().eq("club_id", ALPHA_CLUB_ID).eq("user_id", admin.id);
      await service.auth.admin.deleteUser(admin.id, false);
    }
    if (ownerId) {
      await service
        .from("club_members")
        .delete()
        .eq("club_id", ALPHA_CLUB_ID)
        .eq("user_id", ownerId);
      await service.auth.admin.deleteUser(ownerId, false);
    }
  }
});

test("mobile unknown-address flow is explicit and has no error overlay", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(`unknown-${randomUUID()}@onzio.local`);
  await page.getByRole("button", { name: "Send sign-in code" }).click();
  await expect(
    page.getByRole("heading", { name: "No account for that address" }),
  ).toBeVisible();
  await expect(page.getByText("Onzio accounts are set up by us")).toBeVisible();
  await expect(page.getByText("onziofutbol@gmail.com")).toBeVisible();
  expect(await page.locator("[data-nextjs-dialog], .vite-error-overlay").count()).toBe(0);
});
