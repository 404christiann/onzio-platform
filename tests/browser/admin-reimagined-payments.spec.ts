import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { CLUB_IDS } from "../fixtures/entities";

// ADMIN-RE-20: "Payments and plan" on local Alpha (switched to 'reimagined' by
// admin-reimagined.global-setup.ts), at phone and laptop width. Each state is
// seeded straight into the local club_subscriptions row and put back in a finally
// block. Stripe is never called: the billing routes are answered by the browser
// test, and the test checks that the page only ever posts to the two existing
// routes. Screenshots land in test-results/admin-reimagined/.

const ALPHA = CLUB_IDS.alpha;
const SHOTS = "test-results/admin-reimagined";
const WORST_CLUB_NAME = "Greater Portland Metropolitan Youth Soccer Association Premier Division";
const config = { host: "127.0.0.1", port: 54322, user: "postgres", password: "postgres", database: "postgres" };
const DAY = 86_400_000;

test.describe.configure({ mode: "serial" });

async function sql<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const db = new Client(config);
  await db.connect();
  try {
    return (await db.query<T>(text, values)).rows;
  } finally {
    await db.end();
  }
}

type Fixture = {
  kind: "customer" | "demo" | "test";
  publicAccess: "preview" | "live" | "grace" | "suspended";
  subscription: null | {
    status: string;
    cancelAtPeriodEnd?: boolean;
    paidThroughDays: number;
    graceEndsInDays?: number | null;
  };
};

/** Puts Alpha's billing into `fixture`, runs `body`, then puts the saved rows back. */
async function withBilling(fixture: Fixture, body: () => Promise<void>) {
  const [club] = await sql<{ kind: string; public_access: string }>(
    "select kind, public_access from onzio.clubs where id=$1",
    [ALPHA],
  );
  const [saved] = await sql<{ row: Record<string, unknown> }>(
    "select to_jsonb(s) as row from onzio.club_subscriptions s where club_id=$1",
    [ALPHA],
  );
  try {
    await sql("delete from onzio.club_subscriptions where club_id=$1", [ALPHA]);
    await sql("update onzio.clubs set kind=$2, public_access=$3 where id=$1", [ALPHA, fixture.kind, fixture.publicAccess]);
    if (fixture.subscription) {
      const sub = fixture.subscription;
      await sql(
        `insert into onzio.club_subscriptions
           (club_id, stripe_customer_id, stripe_subscription_id, price_id, tier, status, cancel_at_period_end, paid_through, grace_ends_at)
         values ($1, 'cus_re20_fixture', 'sub_re20_fixture', 'price_re20_fixture', 'pro', $2, $3, $4, $5)`,
        [
          ALPHA,
          sub.status,
          sub.cancelAtPeriodEnd ?? false,
          new Date(Date.now() + sub.paidThroughDays * DAY).toISOString(),
          sub.graceEndsInDays == null ? null : new Date(Date.now() + sub.graceEndsInDays * DAY).toISOString(),
        ],
      );
    }
    await body();
  } finally {
    await sql("delete from onzio.club_subscriptions where club_id=$1", [ALPHA]);
    if (saved) {
      await sql("insert into onzio.club_subscriptions select * from jsonb_populate_record(null::onzio.club_subscriptions, $1::jsonb)", [
        JSON.stringify(saved.row),
      ]);
    }
    await sql("update onzio.clubs set kind=$2, public_access=$3 where id=$1", [ALPHA, club.kind, club.public_access]);
  }
}

async function setClubName(name: string): Promise<string> {
  const [row] = await sql<{ name: string }>(
    "update onzio.clubs c set name=$2 from onzio.clubs old where c.id=$1 and old.id=c.id returning old.name",
    [ALPHA, name],
  );
  return row.name;
}

async function setPortal(portal: "classic" | "reimagined"): Promise<string> {
  const [row] = await sql<{ admin_portal: string }>(
    "update onzio.clubs c set admin_portal=$2 from onzio.clubs old where c.id=$1 and old.id=c.id returning old.admin_portal",
    [ALPHA, portal],
  );
  return row.admin_portal;
}

/** Next streams the page in behind a hidden copy; wait until it has swapped so every lookup sees one element. */
async function openPayments(page: Page) {
  await page.goto("/admin/payments");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[hidden][id^='S:']")).toHaveCount(0);
}

function main(page: Page) {
  return page.getByRole("main");
}

async function expectNoSideScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

const STATES: ReadonlyArray<{
  id: string;
  fixture: Fixture;
  headline: string | RegExp;
  line: string | RegExp;
  button: string | null;
  invoices: boolean;
  website: string;
}> = [
  {
    id: "not-started",
    fixture: { kind: "customer", publicAccess: "preview", subscription: null },
    headline: "Your plan hasn't started",
    line: "Start your Onzio plan to keep your website live once it launches.",
    button: "Start plan",
    invoices: false,
    website: "Not live yet",
  },
  {
    id: "no-plan-needed",
    fixture: { kind: "test", publicAccess: "live", subscription: null },
    headline: "No plan needed",
    line: "This is a test club, so there's nothing to pay.",
    button: null,
    invoices: false,
    website: "Live",
  },
  {
    id: "active",
    fixture: { kind: "customer", publicAccess: "live", subscription: { status: "active", paidThroughDays: 22 } },
    headline: "You're all set",
    line: /^Your plan renews [A-Z][a-z]{2} \d{1,2}(, \d{4})?\.$/,
    button: null,
    invoices: true,
    website: "Live",
  },
  {
    id: "ending",
    fixture: {
      kind: "customer",
      publicAccess: "live",
      subscription: { status: "active", cancelAtPeriodEnd: true, paidThroughDays: 9 },
    },
    headline: /^Your plan ends [A-Z][a-z]{2} \d{1,2}(, \d{4})?$/,
    line: "Your website stays up until then.",
    button: null,
    invoices: true,
    website: "Live",
  },
  {
    id: "card-failed",
    fixture: { kind: "customer", publicAccess: "live", subscription: { status: "past_due", paidThroughDays: 6 } },
    headline: "Your card didn't work",
    line: "Update your card so your next payment goes through.",
    button: "Update card",
    invoices: true,
    website: "Live",
  },
  {
    id: "overdue",
    fixture: {
      kind: "customer",
      publicAccess: "grace",
      subscription: { status: "past_due", paidThroughDays: -8, graceEndsInDays: 12 },
    },
    headline: "Your payment is overdue",
    line: /^Your website stays up until .+\. You can keep changing it\. Update your card before then\.$/,
    button: "Update card",
    invoices: true,
    website: "Still live",
  },
  {
    id: "ended",
    fixture: { kind: "customer", publicAccess: "suspended", subscription: { status: "canceled", paidThroughDays: -40 } },
    headline: "Your plan has ended",
    line: "Changes to your website are on hold. Open billing to restart your plan.",
    button: "Open billing",
    invoices: true,
    website: "Paused",
  },
];

for (const width of [390, 1440]) {
  test.describe(`${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
    });

    for (const state of STATES) {
      test(`${state.id}: the page says it plainly`, async ({ page }) => {
        await withBilling(state.fixture, async () => {
          await openPayments(page);
          await expect(page.getByTestId("admin-top-bar-title")).toHaveText("Payments and plan");
          await expect(main(page).getByRole("heading", { level: 1, name: "Payments and plan" })).toBeVisible();
          const status = page.getByTestId("payments-status");
          await expect(status.getByRole("heading", { level: 2 })).toHaveText(state.headline);
          // Role queries skip the hidden copy Next streams in before it swaps the page.
          await expect(status.getByRole("paragraph").filter({ hasText: state.line })).toBeVisible();
          const action = page.getByTestId("payments-action");
          if (state.button) await expect(action).toHaveText(state.button);
          else await expect(action).toHaveCount(0);
          await expect(page.getByTestId("payments-invoices")).toHaveCount(state.invoices ? 1 : 0);
          await expect(page.getByTestId("payments-website-card")).toContainText(state.website);
          await expect(page.getByTestId("payments-registration-money")).toHaveAttribute("href", "/admin/registrations");
          // The classic sidebar and card are not on this page.
          await expect(page.getByText("Subscription and billing.")).toHaveCount(0);
          await expectNoSideScroll(page, width);
          await page.screenshot({ path: `${SHOTS}/payments-${state.id}-${width}.png`, fullPage: true });
        });
      });
    }

    test("the billing buttons make the same two calls as before and show friendly failures", async ({ page }) => {
      const calls: string[] = [];
      await page.route("**/api/stripe/**", async (route) => {
        calls.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
        await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "STRIPE_CONFIGURATION_MISSING" }) });
      });
      await withBilling(STATES.find((state) => state.id === "card-failed")!.fixture, async () => {
        await openPayments(page);
        await page.getByTestId("payments-action").click();
        await expect(main(page).getByRole("alert")).toContainText("Billing isn't fully set up on our side right now.");
        await expect(main(page).getByRole("alert")).not.toContainText("STRIPE_CONFIGURATION_MISSING");
        await page.getByTestId("payments-invoices").click();
        await expect(main(page).getByRole("alert")).toHaveCount(2);
        await expectNoSideScroll(page, width);
        await page.screenshot({ path: `${SHOTS}/payments-billing-error-${width}.png`, fullPage: true });
      });
      await withBilling(STATES.find((state) => state.id === "not-started")!.fixture, async () => {
        await openPayments(page);
        await page.getByTestId("payments-action").click();
        await expect(main(page).getByRole("alert")).toContainText("Billing isn't fully set up on our side right now.");
      });
      expect(calls).toEqual(["POST /api/stripe/portal", "POST /api/stripe/portal", "POST /api/stripe/checkout"]);
    });

    test("a good answer from billing sends the owner there, and the button shows it is working", async ({ page }) => {
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => (release = resolve));
      await page.route("**/api/stripe/portal", async (route) => {
        await held;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ url: new URL("/admin/login?re20=portal", page.url()).toString() }),
        });
      });
      await withBilling(STATES.find((state) => state.id === "overdue")!.fixture, async () => {
        await openPayments(page);
        const action = page.getByTestId("payments-action");
        await action.click();
        await expect(action).toHaveText("Opening…");
        await expect(action).toBeDisabled();
        release();
        await page.waitForURL(/re20=portal/);
      });
    });

    test("worst case: a very long club name and the overdue state wrap and never push the page wide", async ({ page }) => {
      const original = await setClubName(WORST_CLUB_NAME);
      try {
        await withBilling(STATES.find((state) => state.id === "overdue")!.fixture, async () => {
          await openPayments(page);
          await expect(main(page).getByText(WORST_CLUB_NAME, { exact: true })).toBeVisible();
          await expectNoSideScroll(page, width);
          await page.screenshot({ path: `${SHOTS}/payments-worst-${width}.png`, fullPage: true });
        });
      } finally {
        await setClubName(original);
      }
    });
  });
}

test("dark theme keeps every state readable", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "onzio-admin-theme", value: "dark", url: new URL("/admin", baseURL).toString() }]);
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const id of ["active", "card-failed", "ended"]) {
    const state = STATES.find((candidate) => candidate.id === id)!;
    await withBilling(state.fixture, async () => {
      await openPayments(page);
      await expect(page.locator('[data-admin-theme="dark"]').first()).toBeVisible();
      await expect(page.getByTestId("payments-status")).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/payments-${id}-dark-1440.png`, fullPage: true });
    });
  }
  await context.clearCookies({ name: "onzio-admin-theme" });
});

test("a club still on the classic admin keeps the classic Payments page", async ({ page }) => {
  const previous = await setPortal("classic");
  try {
    await withBilling(STATES.find((state) => state.id === "card-failed")!.fixture, async () => {
      await openPayments(page);
      await expect(page.getByRole("heading", { level: 1, name: "Payments" })).toBeVisible();
      await expect(page.getByText("Payment failed", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Resolve payment" })).toBeVisible();
      await expect(page.getByTestId("payments-plan")).toHaveCount(0);
    });
  } finally {
    await setPortal(previous as "classic" | "reimagined");
  }
});

test.describe("a helper", () => {
  const adminState = process.env.ADMIN_REIMAGINED_ADMIN_STORAGE_STATE;
  test.skip(!adminState, "Set ADMIN_REIMAGINED_ADMIN_STORAGE_STATE to the local administrator browser state.");
  test.use({ storageState: adminState });

  test("does not see Payments and plan, and cannot open it", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // ADMIN-RE-24: Payments and plan would be on the Club tab's page.
    await page.goto("/admin/club");
    await expect(page.getByRole("heading", { level: 1, name: "Club and account" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Payments and plan" })).toHaveCount(0);
    await openPayments(page);
    await expect(page).toHaveURL(/\/admin\/login\?error=owner_required/);
    await expect(page.getByTestId("payments-plan")).toHaveCount(0);
  });
});
