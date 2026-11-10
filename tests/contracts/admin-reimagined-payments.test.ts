import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaymentsPlan } from "@/components/admin/reimagined/PaymentsPlan";
import {
  buildPaymentsView,
  paymentsShortDate,
  planPriceWords,
  type PaymentsViewInput,
} from "@/lib/admin-payments-view";
import { GRACE_MS, resolvePaymentsUiState } from "@/lib/stripe-subscription-state";

// ADMIN-RE-20: "Payments and plan" (/admin/payments) for clubs on the reimagined
// admin. New chrome and words over the same data and the same Stripe portal and
// checkout calls. Nothing about Stripe changes: no new env var, no Stripe client
// in the new files, the portal flow is the existing BillingActionForm.

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const PAGE = "app/admin/(protected)/payments/page.tsx";
const VIEW_LIB = "lib/admin-payments-view.ts";
const VIEW = "components/admin/reimagined/PaymentsPlan.tsx";
const CARD = "components/admin/payments/PaymentStatusCard.tsx";

const NOW = new Date("2026-11-09T18:00:00Z");
const ZONE = "America/Los_Angeles";

function input(overrides: Partial<PaymentsViewInput> & Pick<PaymentsViewInput, "uiState">): PaymentsViewInput {
  return {
    priceLabel: "$49.00/mo",
    clubName: "Eastside United",
    clubKind: "customer",
    domain: "eastsideunited.com",
    publicAccess: "live",
    held: false,
    timeZone: ZONE,
    now: NOW,
    ...overrides,
  };
}

const row = (overrides: Record<string, unknown>) => ({
  stripe_customer_id: "cus_x",
  stripe_subscription_id: "sub_x",
  status: "active",
  cancel_at_period_end: false,
  current_period_end: "2026-12-01T08:00:00Z",
  grace_ends_at: null,
  ...overrides,
});
const state = (overrides: Record<string, unknown> | null) =>
  resolvePaymentsUiState(overrides === null ? null : (row(overrides) as never), NOW);

describe("ADMIN-RE-20 words for every payment state", () => {
  it("not started, on a customer club: says so and offers to start", () => {
    const view = buildPaymentsView(input({ uiState: state(null), publicAccess: "preview" }));
    expect(view.status.tone).toBe("quiet");
    expect(view.status.headline).toBe("Your plan hasn't started");
    expect(view.status.action).toEqual({ kind: "checkout", label: "Start plan" });
    expect(view.website.badge).toBe("Not live yet");
    expect(view.invoices).toBe(false);
    expect(view.plan?.price).toBe("$49 a month");
  });

  it("not started, on a demo or test club: nothing to pay, no button, no plan card", () => {
    for (const kind of ["demo", "test"] as const) {
      const view = buildPaymentsView(input({ uiState: state(null), clubKind: kind }));
      expect(view.status.headline).toBe("No plan needed");
      expect(view.status.line).toBe(`This is a ${kind} club, so there's nothing to pay.`);
      expect(view.status.action).toBeNull();
      expect(view.plan).toBeNull();
      expect(view.invoices).toBe(false);
    }
  });

  it("active: all set, next payment with the price, no warning button", () => {
    const view = buildPaymentsView(input({ uiState: state({}) }));
    expect(view.status.tone).toBe("ok");
    expect(view.status.headline).toBe("You're all set");
    expect(view.status.line).toBe("Your plan renews Dec 1.");
    expect(view.status.fact).toEqual({ label: "Next payment", value: "Dec 1 · $49 a month" });
    expect(view.status.action).toBeNull();
    expect(view.invoices).toBe(true);
    expect(view.website).toMatchObject({ badge: "Live", tone: "ok" });
  });

  it("active but ending: says when, without promising a renewal", () => {
    const view = buildPaymentsView(input({ uiState: state({ cancel_at_period_end: true }) }));
    expect(view.status.tone).toBe("notice");
    expect(view.status.headline).toBe("Your plan ends Dec 1");
    expect(view.status.line).toBe("Your website stays up until then.");
    expect(view.status.support).toBe("To change this, contact Onzio at");
    expect(view.status.line).not.toMatch(/renews/i);
    expect(view.status.fact).toEqual({ label: "Plan ends", value: "Dec 1" });
    expect(view.status.action).toBeNull();
  });

  it("card failed before the period ends: one button, no invented date", () => {
    const view = buildPaymentsView(
      input({ uiState: state({ status: "past_due", current_period_end: "2026-11-30T08:00:00Z" }) }),
    );
    expect(view.status.tone).toBe("warn");
    expect(view.status.headline).toBe("Your card didn't work");
    expect(view.status.action).toEqual({ kind: "portal", label: "Update card" });
    expect(view.status.fact).toBeNull();
    expect(view.status.line).not.toMatch(/renews/i);
    expect(view.status.line).not.toMatch(/\b(Nov|Dec) \d/);
  });

  it("overdue, in the grace period: days left, the last day, the same one button", () => {
    const view = buildPaymentsView(
      input({
        uiState: state({ status: "past_due", current_period_end: "2026-11-01T08:00:00Z", grace_ends_at: "2026-11-21T08:00:00Z" }),
        publicAccess: "grace",
      }),
    );
    expect(view.status.tone).toBe("warn");
    expect(view.status.headline).toBe("Your payment is overdue");
    expect(view.status.line).toBe(
      "Your website stays up until Nov 21. You can keep changing it. Update your card before then.",
    );
    expect(view.status.daysLeft).toEqual({ left: 12, total: 20, label: "12 of 20 days left" });
    expect(view.status.action).toEqual({ kind: "portal", label: "Update card" });
    expect(view.website).toMatchObject({ badge: "Still live", tone: "warn" });
  });

  it("one day left is singular and never negative", () => {
    const one = buildPaymentsView(
      input({ uiState: state({ status: "unpaid", current_period_end: "2026-10-20T08:00:00Z", grace_ends_at: "2026-11-10T08:00:00Z" }), publicAccess: "grace" }),
    );
    expect(one.status.daysLeft?.label).toBe("1 of 20 days left");
    const zero = buildPaymentsView(
      input({
        uiState: { state: "grace", graceEndsAt: "2026-11-09T17:00:00Z", daysRemaining: 0 },
        publicAccess: "grace",
      }),
    );
    expect(zero.status.daysLeft?.label).toBe("Last day");
  });

  it("ended: danger, the website is paused, one way back through billing", () => {
    const view = buildPaymentsView(
      input({ uiState: state({ status: "canceled", current_period_end: "2026-09-01T08:00:00Z" }), publicAccess: "suspended" }),
    );
    expect(view.status.tone).toBe("danger");
    expect(view.status.headline).toBe("Your plan has ended");
    expect(view.status.action).toEqual({ kind: "portal", label: "Open billing" });
    expect(view.status.support).toBe("Or contact Onzio at");
    expect(view.website).toMatchObject({ badge: "Paused", tone: "danger" });
    expect(view.invoices).toBe(true);
  });

  it("a held website says paused whatever the plan says (Rose City)", () => {
    const view = buildPaymentsView(input({ uiState: state({}), held: true }));
    expect(view.website.badge).toBe("Paused");
    expect(view.website.line).toBe("Your website is paused. Visitors can't see it yet.");
  });

  it("break-ui: no price, a year boundary, a very long name and address", () => {
    const noPrice = buildPaymentsView(input({ uiState: state({}), priceLabel: null }));
    expect(noPrice.plan?.price).toBeNull();
    expect(noPrice.status.fact).toEqual({ label: "Next payment", value: "Dec 1" });

    const nextYear = buildPaymentsView(
      input({ uiState: state({ current_period_end: "2027-01-01T08:00:00Z" }) }),
    );
    expect(nextYear.status.line).toBe("Your plan renews Jan 1, 2027.");

    const unreadable = buildPaymentsView(input({ uiState: { state: "active", periodEndsAt: "not a date" } }));
    expect(unreadable.status.line).toBe("Your plan is active.");
    expect(unreadable.status.fact).toBeNull();

    const domain = "eastside-united-youth-soccer-association.example.org";
    expect(buildPaymentsView(input({ uiState: state({}), domain })).website.line).toBe(
      `${domain} stays up while your plan is paid`,
    );
  });

  it("prices read as plain words, dates are short in the club's time zone", () => {
    expect(planPriceWords("$85.00/mo")).toBe("$85 a month");
    expect(planPriceWords("$1,249.99/mo")).toBe("$1,249.99 a month");
    expect(planPriceWords("$600.00/yr")).toBe("$600 a year");
    expect(planPriceWords("$20.00/week")).toBe("$20 a week");
    expect(planPriceWords("$60.00")).toBe("$60");
    expect(planPriceWords("$30.00 every 3 months")).toBe("$30.00 every 3 months");
    expect(planPriceWords(null)).toBeNull();
    expect(planPriceWords("")).toBeNull();

    // The same instant can be two different days; the club's own zone decides.
    expect(paymentsShortDate("2026-12-01T03:00:00Z", "America/Los_Angeles", NOW)).toBe("Nov 30");
    expect(paymentsShortDate("2026-12-01T06:30:00Z", "America/Chicago", NOW)).toBe("Dec 1");
    expect(paymentsShortDate("2026-12-31T20:00:00Z", "America/Chicago", NOW)).toBe("Dec 31");
    expect(paymentsShortDate("garbage", ZONE, NOW)).toBeNull();
  });

  it("the grace length shown is the real one", () => {
    const view = buildPaymentsView(
      input({
        uiState: { state: "grace", graceEndsAt: new Date(NOW.getTime() + GRACE_MS).toISOString(), daysRemaining: 20 },
        publicAccess: "grace",
      }),
    );
    expect(view.status.daysLeft).toMatchObject({ left: 20, total: 20, label: "20 of 20 days left" });
  });
});

describe("ADMIN-RE-20 the page as people see it", () => {
  const html = (uiState: ReturnType<typeof state>, extra: Partial<PaymentsViewInput> = {}) =>
    renderToStaticMarkup(
      createElement(PaymentsPlan, { view: buildPaymentsView(input({ uiState, ...extra })), clubName: "Eastside United" }),
    );

  it("renders each state with its headline and only its own button", () => {
    const active = html(state({}));
    expect(active).toContain("Payments and plan");
    expect(active).toContain("You&#x27;re all set");
    expect(active).toContain("Past invoices");
    expect(active).not.toContain("Update card");

    const failed = html(state({ status: "past_due", current_period_end: "2026-11-30T08:00:00Z" }));
    expect(failed).toContain("Your card didn&#x27;t work");
    expect(failed).toContain("Update card");

    const notStarted = html(state(null), { publicAccess: "preview" });
    expect(notStarted).toContain("Start plan");
    expect(notStarted).not.toContain("Past invoices");

    const demo = html(state(null), { clubKind: "demo" });
    expect(demo).toContain("No plan needed");
    expect(demo).not.toContain("<button");
  });

  it("never prints a raw code, an unset value, or a missing date", () => {
    for (const uiState of [
      state(null),
      state({}),
      state({ cancel_at_period_end: true }),
      state({ status: "past_due", current_period_end: "2026-11-30T08:00:00Z" }),
      state({ status: "past_due", current_period_end: "2026-11-01T08:00:00Z", grace_ends_at: "2026-11-21T08:00:00Z" }),
      state({ status: "canceled", current_period_end: "2026-09-01T08:00:00Z" }),
    ]) {
      const markup = html(uiState);
      expect(markup).not.toMatch(/undefined|null|NaN|Invalid Date|_REQUIRED/);
    }
  });
});

describe("ADMIN-RE-20 the page and what it must not change", () => {
  const page = source(PAGE);

  it("still owners only, and archived clubs still bounce", () => {
    expect(page).toContain('club.role !== "owner" || club.lifecycle === "archived"');
    expect(page).toContain("/admin/login?error=owner_required");
  });

  it("picks the new page from the club's admin_portal, classic on any doubt", () => {
    expect(page).toContain("readAdminPortal(supabase, club.id)");
    expect(page).toContain('portal.portal === "reimagined"');
    // The classic card is still rendered, unchanged, for classic clubs.
    expect(page).toContain("<PaymentStatusCard");
  });

  it("reads the same subscription row, tenant-scoped, through the user's own client", () => {
    expect(page).toContain('.from("club_subscriptions")');
    expect(page).toContain('.eq("club_id", club.id)');
    expect(page).toContain("createClient");
    expect(page).not.toContain("service");
  });

  it("adds nothing to Stripe: no Stripe client, no env var, no write, no new route", () => {
    for (const path of [VIEW_LIB, VIEW]) {
      const text = source(path);
      expect(text).not.toMatch(/stripe-client|getStripeClient|new Stripe|from "stripe"/);
      expect(text).not.toContain("process.env");
      expect(text).not.toMatch(/\.(create|update|del|retrieve)\(/);
    }
    const view = source(VIEW);
    // Only the two existing, unchanged billing calls.
    expect(view).toContain("BillingActionForm");
    expect(view).not.toMatch(/fetch\(/);
    const endpoints = [...view.matchAll(/\/api\/stripe\/[a-z-]+/g)].map((match) => match[0]);
    expect(new Set(endpoints)).toEqual(new Set(["/api/stripe/portal", "/api/stripe/checkout"]));
  });

  it("the portal flow stays the one in the classic card, error messages included", () => {
    const card = source(CARD);
    expect(card).toContain("export function BillingActionForm");
    expect(card).toContain('endpoint: "/api/stripe/portal" | "/api/stripe/checkout"');
    expect(card).toContain("window.location.assign(record.url)");
    expect(card).toContain("billingErrorMessage(record.error, fallbackMessage)");
    expect(source(VIEW)).toContain('from "@/components/admin/payments/PaymentStatusCard"');
  });

  it("never reaches tenant resolution: the club-context select is untouched", () => {
    const context = source("lib/club-context.ts");
    expect(context).not.toMatch(/admin_portal|admin_flags|time_zone/);
  });

  it("is reachable only from the owner's More row, with no new route", () => {
    const manifest = source("lib/admin-route-manifest.ts");
    expect(manifest).toContain('{ id: "payments-and-plan", label: "Payments and plan", routeId: "payments" }');
    expect(manifest).toMatch(/id: "payments",[\s\S]{0,160}ownerOnly: true/);
  });
});
