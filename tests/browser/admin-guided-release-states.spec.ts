import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { Client } from "pg";
import { expect, test, type Page, type Locator } from "@playwright/test";

const clubId = "11111111-1111-4111-8111-111111111111";
const base = process.env.ADMIN_GUIDED_BASE_URL ?? "http://alpha.localhost:3110";
if (new URL(base).hostname !== "alpha.localhost") throw new Error("Release states require synthetic local Alpha.");
const artifacts = "/private/tmp/onzio-guided-release-states";
type ReadRequest = { operation: string; table: string };

// These fixtures are UI-only. Session, shell and permissions are real; no
// simulated page-data mutation may reach the application or provider.
async function safety(page: Page) {
  await page.route("**/api/admin/data", async route => {
    const request = route.request().postDataJSON() as ReadRequest;
    if (request.operation === "select") return route.continue();
    await route.abort();
    throw new Error(`Unexpected real mutation ${request.operation}:${request.table}`);
  });
  await page.route("**/api/admin/registrations", route => route.abort());
  await page.route("**/api/stripe/checkout", route => route.abort());
  await page.route("**/api/stripe/portal", route => route.abort());
  await page.route("**/api/stripe/connect", route => route.abort());
  await page.route("https://**/*", route => route.abort());
}
async function noOverflow(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}
async function containedText(locator: Locator, boundary: "self" | "panel" | "parent" = "self") {
  expect(await locator.evaluate((element, kind) => {
    const container = kind === "panel" ? element.closest("section") : kind === "parent" ? element.parentElement : element;
    if (!container) return false;
    const box = container.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    return Array.from(range.getClientRects()).every(rect => rect.left >= box.left - 1 && rect.right <= box.right + 1);
  }, boundary)).toBe(true);
}
async function largeText(page: Page) {
  await page.addStyleTag({ content: "html { font-size: 32px !important; }" });
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("32px");
}
async function connectionState(page: Page) {
  await page.route("**/api/stripe/connect?action=status", route => route.fulfill({ json: { connected: true, chargesEnabled: true, payoutsEnabled: true } }));
}

for (const width of [320, 390]) {
  test(`${width}px Competition empty states and failed reads cannot expose editable defaults`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await safety(page);
    let fail = false;
    await page.route("**/api/admin/data", async route => {
      const input = route.request().postDataJSON() as ReadRequest;
      if (input.operation !== "select") return route.fallback();
      if (input.table === "seasons") return route.fulfill({ status: fail ? 503 : 200, json: { data: fail ? null : [], error: fail ? { code: "QA_UNAVAILABLE", message: "Seasons temporarily unavailable." } : null } });
      return route.fallback();
    });
    await page.goto("/admin/seasons");
    await expect(page.getByText("No seasons have been set up yet. Contact Onzio to create your first season.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Next Season", exact: true })).toBeDisabled();
    await noOverflow(page, width);
    fail = true;
    await page.reload();
    await expect(page.getByText("Error: Seasons temporarily unavailable.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Next Season", exact: true })).toBeDisabled();

    await page.route("**/rest/v1/league_standings*", route => route.fulfill({ status: fail ? 503 : 200, json: fail ? { code: "QA_UNAVAILABLE", message: "Standings temporarily unavailable." } : [] }));
    fail = false;
    await page.goto("/admin/standings");
    await expect(page.getByText("0 teams", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save Standings", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Add Team", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Team name", exact: true })).toHaveCount(1);
    const region = page.getByRole("region", { name: "Teams and standings, scroll for all columns", exact: true });
    await expect(region).toBeVisible();
    expect(await region.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    await noOverflow(page, width);
    fail = true;
    await page.reload();
    await expect(page.getByRole("status", { name: "Loading standings", exact: true })).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Standings temporarily unavailable.");
    await expect(page.getByRole("button", { name: "Add Team", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save Standings", exact: true })).toBeDisabled();

    await page.route("**/rest/v1/players*", route => route.fulfill({ status: fail ? 503 : 200, json: fail ? { code: "QA_UNAVAILABLE", message: "Player analytics unavailable." } : [] }));
    fail = false;
    await page.goto("/admin/analytics");
    await expect(page.getByRole("heading", { name: "No players found", exact: true })).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
    await noOverflow(page, width);
    fail = true;
    await page.reload();
    await expect(page.getByRole("heading", { name: "Analytics unavailable", exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("canvas")).toHaveCount(0);
    fail = false;
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByRole("heading", { name: "No players found", exact: true })).toBeVisible();
  });

  test(`${width}px Registrations empty, account failure and detail failure communicate what happened`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await safety(page);
    let mode: "empty" | "list-error" | "detail-error" = "empty";
    const formId = "40000000-0000-4000-8000-000000000032";
    await connectionState(page);
    await page.route("**/api/admin/data", async route => {
      const input = route.request().postDataJSON() as ReadRequest;
      if (input.operation !== "select") return route.fallback();
      if (input.table === "registration_forms") return route.fulfill({ status: mode === "list-error" ? 503 : 200, json: { data: mode === "list-error" ? null : mode === "empty" ? [] : [{ id: formId, slug: "release-ui-fixture", title: "Release UI fixture", description: "Browser-only fixture", participant_mode: "adult_only", waiver_text: "Synthetic consent", status: "draft", archived_at: null, created_at: "2026-10-01T00:00:00Z" }], error: mode === "list-error" ? { code: "QA_UNAVAILABLE", message: "Forms temporarily unavailable." } : null } });
      if (input.table === "registration_form_fields") return route.fulfill({ status: 503, json: { data: null, error: { code: "QA_UNAVAILABLE", message: "Form detail unavailable." } } });
      if (["registrations", "registration_price_options"].includes(input.table)) return route.fulfill({ json: { data: [], error: null } });
      return route.fallback();
    });
    await page.goto("/admin/registrations");
    await expect(page.getByText("No registration forms yet.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Archived · 0", exact: true }).click();
    await expect(page.getByText("No archived forms.", { exact: true })).toBeVisible();
    await noOverflow(page, width);
    mode = "list-error";
    await page.reload();
    await expect(page.getByRole("status")).toContainText("Forms temporarily unavailable.");
    mode = "detail-error";
    await page.reload();
    await page.getByRole("button", { name: "Release UI fixture 0 paid registrants", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Could not load this form.");
    await expect(page.getByRole("textbox", { name: "Form name", exact: true })).not.toHaveValue("Release UI fixture");
  });

  test(`${width}px main management pages retain headings and actions at 200% text`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 844 });
    await safety(page);
    await connectionState(page);
    for (const route of ["", "seasons", "standings", "registrations", "members", "payments"]) {
      await page.goto(`/admin/${route}`);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.locator('[role="status"][aria-label^="Loading"]')).toHaveCount(0);
      if (route === "members") await expect(page.getByText("Loading…", { exact: true })).toHaveCount(0);
      await largeText(page);
      await noOverflow(page, width);
      if (route === "") {
        await containedText(page.getByRole("main").getByText("Paid Registrations", { exact: true }));
        await containedText(page.getByRole("main").getByRole("link", { name: "View all", exact: true }), "panel");
        await containedText(page.getByRole("main").getByRole("link", { name: "View schedule", exact: true }), "panel");
      }
      if (route === "members") await containedText(page.getByText("Contact Onzio to transfer", { exact: true }), "parent");
      if (route === "payments") await containedText(page.getByRole("main").getByRole("button").first());
      const heading = page.locator("main h1");
      expect(await heading.evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
      await mkdir(artifacts, { recursive: true, mode: 0o700 });
      await page.screenshot({ path: `${artifacts}/large-${width}-${route || "dashboard"}.png`, fullPage: true });
    }
  });
}

test("Team access mapped errors retain input, real role checks reject unauthorized changes", async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await safety(page);
  await page.route("**/api/admin/members", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { admins: [] } });
    return route.fulfill({ status: 429, json: { error: "AUTH_CODE_RATE_LIMITED" } });
  });
  await page.goto("/admin/members");
  await expect(page.getByText("You · owner", { exact: true })).toBeVisible();
  const email = page.getByRole("textbox", { name: "Email", exact: true });
  await email.fill("browser-only@local.test");
  await page.getByRole("button", { name: "Send access code", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("A sign-in code was sent recently. Wait one minute, then try adding this administrator again.");
  await expect(email).toHaveValue("browser-only@local.test");
  await expect(page.getByRole("button", { name: "Send access code", exact: true })).toBeEnabled();

  // Browser UI simulation above is separate from these actual server checks.
  const rejected = await page.request.post("/api/admin/members", { data: { action: "remove", userId: "00000000-0000-4000-8000-000000000000" } });
  expect(rejected.status()).toBe(403);
  expect(await rejected.json()).toEqual({ error: "MEMBERSHIP_REQUIRED" });
  const adminState = process.env.ADMIN_GUIDED_ADMIN_STORAGE_STATE;
  if (!adminState) throw new Error("Set ADMIN_GUIDED_ADMIN_STORAGE_STATE for actual non-owner permission checks.");
  const context = await browser.newContext({ baseURL: base, storageState: adminState });
  try {
    const response = await context.request.get("/api/admin/members");
    expect(response.status()).toBe(403);
    expect(await response.json()).toEqual({ error: "OWNER_REQUIRED" });
    const write = await context.request.post("/api/admin/members", { data: { action: "add", email: "must-not-create@local.test" } });
    expect(write.status()).toBe(403);
    expect(await write.json()).toEqual({ error: "OWNER_REQUIRED" });
    const adminPage = await context.newPage();
    await adminPage.goto("/admin");
    await expect(adminPage.locator("main h1")).toBeVisible();
    await expect(adminPage.locator('a[href="/admin/members"]')).toHaveCount(0);
    await expect(adminPage.locator('a[href="/admin/payments"]')).toHaveCount(0);
  } finally { await context.close(); }
});

async function lifecycleFixture() {
  const dbUrl = process.env.SUPABASE_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!dbUrl || !["127.0.0.1", "localhost"].includes(new URL(dbUrl).hostname)) throw new Error("Lifecycle fixtures require an explicit loopback database URL.");
  const sql = new Client({ connectionString: dbUrl });
  await sql.connect();
  const snapshot = async () => ({
    clubs: (await sql.query("select to_jsonb(c) as row from onzio.clubs c where id=$1", [clubId])).rows.map(r => r.row),
    subscriptions: (await sql.query("select to_jsonb(s) as row from onzio.club_subscriptions s where club_id=$1", [clubId])).rows.map(r => r.row),
  });
  const original = await snapshot();
  if (original.clubs.length !== 1) throw new Error("Synthetic Alpha missing.");
  await mkdir(artifacts, { recursive: true, mode: 0o700 });
  await writeFile(`${artifacts}/lifecycle-original-${randomUUID()}.json`, JSON.stringify(original, null, 2), { mode: 0o600 });
  // Only timestamp triggers on these two fixture tables are disabled, inside a
  // transaction that always re-enables them. RLS and all other guards stay on.
  const restore = async () => {
    await sql.query("begin");
    try {
      for (const [table, key, rows] of [["clubs", "id", original.clubs], ["club_subscriptions", "club_id", original.subscriptions]] as const) {
        const trigger = `set_${table}_updated_at`;
        await sql.query(`alter table onzio.${table} disable trigger ${trigger}`);
        if (rows.length) {
          const columns = Object.keys(rows[0]).filter(c => c !== key);
          await sql.query(`update onzio.${table} as target set ${columns.map(c => `${c}=restored.${c}`).join(",")} from jsonb_populate_record(null::onzio.${table}, $1::jsonb) restored where target.${key}=$2`, [JSON.stringify(rows[0]), clubId]);
        } else await sql.query(`delete from onzio.${table} where ${key}=$1`, [clubId]);
        await sql.query(`alter table onzio.${table} enable trigger ${trigger}`);
      }
      await sql.query("commit");
      expect(await snapshot()).toEqual(original);
    } catch (error) { await sql.query("rollback"); throw error; }
    finally { await sql.end(); }
  };
  const set = async (access: "grace" | "suspended", expired: boolean) => {
    await sql.query("update onzio.clubs set kind='customer', lifecycle='active', public_access=$2, stripe_price_id=null where id=$1", [clubId, access]);
    const paidThrough = new Date(Date.now() - (expired ? 30 : 2) * 86_400_000).toISOString();
    const graceEnd = new Date(Date.now() + (expired ? -10 : 18) * 86_400_000).toISOString();
    await sql.query("insert into onzio.club_subscriptions (club_id,status,cancel_at_period_end,paid_through,grace_ends_at) values ($1,'past_due',false,$2,$3) on conflict (club_id) do update set status='past_due', cancel_at_period_end=false, paid_through=excluded.paid_through, grace_ends_at=excluded.grace_ends_at", [clubId, paidThrough, graceEnd]);
  };
  return { set, restore };
}

test("Actual local grace and suspended Dashboard/Payments states preserve editing versus billing recovery boundaries", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await safety(page);
  const fixture = await lifecycleFixture();
  try {
    await fixture.set("grace", false);
    await page.goto("/admin");
    await expect(page.getByText(/Billing needs attention\. Content editing remains available/)).toBeVisible();
    const quick = page.getByRole("region", { name: "Quick Actions", exact: true });
    await expect(quick.locator('a[href="/admin/roster"]')).toBeVisible();
    await page.goto("/admin/payments");
    await expect(page.getByRole("main").getByText("Payment overdue", { exact: true })).toBeVisible();
    const updatePayment = page.getByRole("button", { name: "Update payment method", exact: true });
    await expect(updatePayment).toBeVisible();
    await page.route("**/api/stripe/portal", route => route.fulfill({ status: 503, json: { error: "STRIPE_CONFIGURATION_MISSING" } }));
    await updatePayment.click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Your subscription is unaffected");
    await expect(updatePayment).toBeEnabled();
    await expect(page).toHaveURL(/\/admin\/payments$/);
    await noOverflow(page, 390);
    await fixture.set("suspended", true);
    // The existing billing-lockdown contract redirects suspended content
    // routes to Payments; it must retain the verified tenant host.
    await page.goto("/admin");
    await expect(page).toHaveURL(new URL("/admin/payments", base).toString());
    await expect(page.getByRole("heading", { name: "Payments", exact: true })).toBeVisible();
    await expect(page.getByText(/Content changes are paused while billing is suspended\./)).toBeVisible();
    await expect(page.getByRole("region", { name: "Quick Actions", exact: true })).toHaveCount(0);
    await page.goto("/admin/roster");
    await expect(page).toHaveURL(new URL("/admin/payments", base).toString());
    await expect(page.getByRole("main").getByText("Subscription ended", { exact: true })).toBeVisible();
    await expect(page.getByRole("main").getByText(/Content administration is on hold\./)).toBeVisible();
    await expect(page.getByRole("button", { name: "Manage billing", exact: true })).toBeVisible();
    await largeText(page);
    await noOverflow(page, 390);
  } finally { await fixture.restore(); }
});
