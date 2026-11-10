import { GRACE_MS, type PaymentsUiState } from "@/lib/stripe-subscription-state";

// ADMIN-RE-20: the words for "Payments and plan" (design: cd-payments,
// cd-payments-desktop). Pure: it turns the state the page already resolves
// (resolvePaymentsUiState) into the plain sentences, short dates and one button
// the new page shows. It reads nothing, writes nothing and never talks to Stripe.

export type PaymentsTone = "ok" | "notice" | "warn" | "danger" | "quiet";
export type PaymentsAction = { kind: "portal" | "checkout"; label: string };

export type PaymentsViewInput = {
  uiState: PaymentsUiState;
  /** The price the classic card shows, e.g. "$49.00/mo"; null when Stripe has none to show. */
  priceLabel: string | null;
  clubName: string;
  clubKind: "customer" | "demo" | "test";
  domain: string;
  publicAccess: "preview" | "live" | "grace" | "suspended";
  /** True for a club whose public site is held (lib/public-site-hold.ts). */
  held: boolean;
  /** The club's own time zone, so "Dec 1" is the day the club sees. */
  timeZone: string;
  now?: Date;
};

export type PaymentsView = {
  status: {
    tone: PaymentsTone;
    headline: string;
    line: string;
    /** A second sentence that ends in Onzio's support email, e.g. "Or contact Onzio at"; the page adds the address. */
    support: string | null;
    fact: { label: string; value: string } | null;
    daysLeft: { left: number; total: number; label: string } | null;
    action: PaymentsAction | null;
  };
  plan: { title: string; price: string | null; line: string } | null;
  website: { badge: string; tone: PaymentsTone; line: string };
  /** The "Past invoices" way into the billing page; only once a plan exists. */
  invoices: boolean;
};

const GRACE_DAYS = Math.round(GRACE_MS / 86_400_000);
const PRICE_UNITS: Record<string, string> = { mo: "a month", yr: "a year", week: "a week", day: "a day" };

/** "Nov 12", or "Jan 1, 2027" when it is not this year, in the club's time zone. */
export function paymentsShortDate(iso: string, timeZone: string, now: Date = new Date()): string | null {
  const instant = Date.parse(iso);
  if (!Number.isFinite(instant)) return null;
  try {
    const parts = (options: Intl.DateTimeFormatOptions, at: number) =>
      new Intl.DateTimeFormat("en-US", { timeZone, ...options }).format(at);
    const sameYear = parts({ year: "numeric" }, instant) === parts({ year: "numeric" }, now.getTime());
    return parts(sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" }, instant);
  } catch {
    return null;
  }
}

/** "$85.00/mo" becomes "$85 a month". Anything unusual is shown as Stripe gave it. */
export function planPriceWords(label: string | null | undefined): string | null {
  const text = label?.trim();
  if (!text) return null;
  const match = text.match(/^(.*?)\/(mo|yr|week|day)$/);
  const amount = (match ? match[1] : text).replace(/^(\D*[\d,]+)\.00$/, "$1");
  if (/\bevery\b/.test(text)) return text;
  return match ? `${amount} ${PRICE_UNITS[match[2]]}` : amount;
}

function daysLeft(left: number): PaymentsView["status"]["daysLeft"] {
  const count = Math.max(0, Math.min(GRACE_DAYS, Math.round(left)));
  return {
    left: count,
    total: GRACE_DAYS,
    label: count === 0 ? "Last day" : `${count} of ${GRACE_DAYS} days left`,
  };
}

function websiteCard(input: PaymentsViewInput): PaymentsView["website"] {
  if (input.held) {
    return { badge: "Paused", tone: "quiet", line: "Your website is paused. Visitors can't see it yet." };
  }
  switch (input.publicAccess) {
    case "live":
      return { badge: "Live", tone: "ok", line: `${input.domain} stays up while your plan is paid` };
    case "grace":
      return { badge: "Still live", tone: "warn", line: `${input.domain} stays up until your payment is sorted out` };
    case "suspended":
      return { badge: "Paused", tone: "danger", line: `${input.domain} is down until your plan is paid` };
    case "preview":
      return { badge: "Not live yet", tone: "quiet", line: "Visitors can't see your website yet" };
  }
}

export function buildPaymentsView(input: PaymentsViewInput): PaymentsView {
  const { uiState, clubKind, timeZone } = input;
  const now = input.now ?? new Date();
  const price = planPriceWords(input.priceLabel);
  const when = (iso: string) => paymentsShortDate(iso, timeZone, now);
  const website = websiteCard(input);
  const plan =
    uiState.state === "no_subscription" && clubKind !== "customer"
      ? null
      : { title: "Onzio Club plan", price, line: "Only you, the club owner, can change billing" };

  let status: PaymentsView["status"];
  switch (uiState.state) {
    case "no_subscription":
      status =
        clubKind === "customer"
          ? {
              tone: "quiet",
              headline: "Your plan hasn't started",
              line: "Start your Onzio plan to keep your website live once it launches.",
              support: null,
              fact: null,
              daysLeft: null,
              action: { kind: "checkout", label: "Start plan" },
            }
          : {
              tone: "quiet",
              headline: "No plan needed",
              line: `This is a ${clubKind} club, so there's nothing to pay.`,
              support: null,
              fact: null,
              daysLeft: null,
              action: null,
            };
      break;
    case "active": {
      const date = when(uiState.periodEndsAt);
      status = {
        tone: "ok",
        headline: "You're all set",
        line: date ? `Your plan renews ${date}.` : "Your plan is active.",
        support: null,
        fact: date ? { label: "Next payment", value: price ? `${date} · ${price}` : date } : null,
        daysLeft: null,
        action: null,
      };
      break;
    }
    case "active_canceling": {
      const date = when(uiState.periodEndsAt);
      status = {
        tone: "notice",
        headline: date ? `Your plan ends ${date}` : "Your plan is ending",
        line: "Your website stays up until then.",
        support: "To change this, contact Onzio at",
        fact: date ? { label: "Plan ends", value: date } : null,
        daysLeft: null,
        action: null,
      };
      break;
    }
    case "payment_failed":
      status = {
        tone: "warn",
        headline: "Your card didn't work",
        line: "Update your card so your next payment goes through.",
        support: null,
        fact: null,
        daysLeft: null,
        action: { kind: "portal", label: "Update card" },
      };
      break;
    case "grace": {
      const date = when(uiState.graceEndsAt);
      status = {
        tone: "warn",
        headline: "Your payment is overdue",
        line: date
          ? `Your website stays up until ${date}. You can keep changing it. Update your card before then.`
          : "Your website is still up. You can keep changing it. Update your card soon.",
        support: null,
        fact: null,
        daysLeft: daysLeft(uiState.daysRemaining),
        action: { kind: "portal", label: "Update card" },
      };
      break;
    }
    case "terminal":
      status = {
        tone: "danger",
        headline: "Your plan has ended",
        line: "Changes to your website are on hold. Open billing to restart your plan.",
        support: "Or contact Onzio at",
        fact: null,
        daysLeft: null,
        action: { kind: "portal", label: "Open billing" },
      };
      break;
  }

  return { status, plan, website, invoices: uiState.state !== "no_subscription" };
}
