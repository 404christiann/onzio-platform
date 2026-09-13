import { expect, test, type Page } from "@playwright/test";

// Only page-data responses are simulated. The local protected shell and session
// remain real, and every admin mutation is intercepted before reaching a server.
const FORM_ID = "40000000-0000-4000-8000-000000000001";
const PRICE_ID = "50000000-0000-4000-8000-000000000001";
const form = {
  id: FORM_ID,
  slug: "loading-fixture-form",
  title: "Loading fixture registration",
  description: "A browser-only registration fixture.",
  participant_mode: "adult_only",
  waiver_text: "Browser fixture consent text.",
  status: "draft",
  archived_at: null,
  created_at: "2026-09-01T00:00:00Z",
};
const connect = { connected: true, chargesEnabled: true, payoutsEnabled: true };

type AdminRequest = {
  table: string;
  operation: string;
  payload?: { title?: string };
};

function gate() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

async function rejectUnexpectedMutationRoutes(page: Page) {
  await page.route("**/api/admin/registrations", async (route) => {
    await route.abort();
    throw new Error(
      "This browser test must never create or publish real forms.",
    );
  });
}

for (const failure of ["payment account", "form list"] as const) {
  test(`Registrations keeps each section loading after an early ${failure} failure until the other dependency settles`, async ({
    page,
  }) => {
    const pending = gate();
    const failedRequest = gate();
    const pendingRequest = gate();
    await rejectUnexpectedMutationRoutes(page);
    await page.route("**/api/admin/data", async (route) => {
      const request = route.request().postDataJSON() as AdminRequest;
      if (request.operation !== "select") {
        await route.abort();
        throw new Error(
          `Unexpected mutation: ${request.operation} ${request.table}`,
        );
      }
      if (request.table === "registration_forms") {
        if (failure === "form list") {
          await route.fulfill({
            status: 503,
            json: {
              data: null,
              error: { message: "Form list temporarily unavailable." },
            },
          });
          failedRequest.release();
          return;
        }
        pendingRequest.release();
        await pending.wait;
        return route.fulfill({ json: { data: [form], error: null } });
      }
      if (request.table === "registrations")
        return route.fulfill({ json: { data: [], error: null } });
      return route.continue();
    });
    await page.route("**/api/stripe/connect?action=status", async (route) => {
      if (failure === "payment account") {
        await route.fulfill({
          status: 503,
          json: { error: "Simulated unavailable account status" },
        });
        failedRequest.release();
        return;
      }
      pendingRequest.release();
      await pending.wait;
      return route.fulfill({ json: connect });
    });

    try {
      await page.goto("/admin/registrations", {
        waitUntil: "domcontentloaded",
      });
      await Promise.all([failedRequest.wait, pendingRequest.wait]);
      // Covers both the original 400ms escalation and the Promise.all early
      // rejection bug: a failed sibling must never reveal incomplete forms.
      await page.waitForTimeout(550);
      await expect(
        page.getByRole("status", {
          name: "Loading registration forms",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("status", { name: "Loading form basics", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "New form", exact: true }),
      ).toBeDisabled();
      await expect(page.getByLabel("Form name", { exact: true })).toHaveCount(
        0,
      );
      await expect(
        page.getByText("No registration forms yet.", { exact: true }),
      ).toHaveCount(0);

      pending.release();
      await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
      await expect(
        page.getByText(
          failure === "payment account"
            ? "Could not load Stripe Connect status."
            : "Form list temporarily unavailable.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(page.getByLabel("Form name", { exact: true })).toBeVisible();
      if (failure === "payment account") {
        await expect(
          page.getByRole("button", {
            name: `${form.title} 0 paid registrants`,
            exact: true,
          }),
        ).toBeVisible();
      } else {
        await expect(
          page.getByText("Charges enabled", { exact: true }),
        ).toBeVisible();
      }
    } finally {
      pending.release();
    }
  });
}

test("Registrations preserves its existing form list during the refresh after a simulated save", async ({
  page,
}) => {
  const refresh = gate();
  const refreshStarted = gate();
  let formsRead = 0;
  let savedTitle = form.title;
  const simulatedWrites: string[] = [];
  await rejectUnexpectedMutationRoutes(page);
  await page.route("**/api/stripe/connect?action=status", (route) =>
    route.fulfill({ json: connect }),
  );
  await page.route("**/api/admin/data", async (route) => {
    const request = route.request().postDataJSON() as AdminRequest;
    if (request.operation !== "select") {
      // All writes are fulfilled in the browser. No mutation is continued to
      // the local database, hosted data, Stripe, or the actual API handler.
      simulatedWrites.push(`${request.operation}:${request.table}`);
      if (request.table === "registration_forms" && request.payload?.title)
        savedTitle = request.payload.title;
      return route.fulfill({
        json: {
          data: request.table === "registration_forms" ? { id: FORM_ID } : null,
          error: null,
        },
      });
    }
    if (request.table === "registration_forms") {
      formsRead += 1;
      if (formsRead > 1) {
        refreshStarted.release();
        await refresh.wait;
      }
      return route.fulfill({
        json: { data: [{ ...form, title: savedTitle }], error: null },
      });
    }
    if (request.table === "registration_price_options") {
      return route.fulfill({
        json: {
          data: [
            {
              id: PRICE_ID,
              label: "Registration",
              amount_cents: 2500,
              active: true,
              position: 0,
            },
          ],
          error: null,
        },
      });
    }
    if (
      request.table === "registrations" ||
      request.table === "registration_form_fields"
    ) {
      return route.fulfill({ json: { data: [], error: null } });
    }
    return route.continue();
  });

  try {
    await page.goto("/admin/registrations", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", {
        name: `${form.title} 0 paid registrants`,
        exact: true,
      })
      .click();
    const name = page.getByLabel("Form name", { exact: true });
    await expect(name).toHaveValue(form.title);
    await name.fill("Updated browser fixture form");
    await page.getByRole("button", { name: "Save form", exact: true }).click();
    await refreshStarted.wait;
    await expect(
      page.getByRole("button", {
        name: `${form.title} 0 paid registrants`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
    await expect(name).toHaveValue("Updated browser fixture form");
    await expect(name).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Saving…", exact: true }),
    ).toBeDisabled();
    refresh.release();
    await expect(page.getByText("Form saved.", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Updated browser fixture form 0 paid registrants",
        exact: true,
      }),
    ).toBeVisible();
    await expect(name).toBeEnabled();
    expect(simulatedWrites).toContain("update:registration_forms");
    expect(simulatedWrites).toContain("insert:registration_form_fields");
  } finally {
    refresh.release();
  }
});
