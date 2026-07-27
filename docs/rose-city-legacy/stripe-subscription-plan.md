# Rose City FC — Stripe Subscription Billing Implementation Plan

**Scope:** Rose City FC pays Christian $99.99/mo (Pro tier) for this platform. This plan wires that single B2B subscription into the existing admin portal: a new billing-admin-only "Payments" tab, a Stripe-mirror table read by `middleware.ts`, and three server routes (Checkout, Billing Portal, webhook) — no custom payment UI anywhere. Every decision below reflects prior agreement with Christian and is treated as final.

---

# Part A — Implementation Plan

## A.1 Dependency change

**`package.json`**
- Add `"stripe": "^17.x"` (server-side SDK only) to `dependencies`. Do **not** add `@stripe/stripe-js` — both Checkout and the Billing Portal are server-created Sessions the browser is redirected to; there is no embedded card form anywhere in this app.

## A.2 New environment variables

| Var | Used by | Test value | Live value |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | checkout/portal/webhook routes | `sk_test_...` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | webhook route (signature verification) | test endpoint's `whsec_...` | live endpoint's `whsec_...` |
| `STRIPE_PRICE_ID` | checkout route (line item) | test Price id | live Price id |
| `BILLING_ADMIN_EMAILS` | nav, payments page, checkout/portal routes | `christianjavieralcala@gmail.com,info@rosecityfutbolclub.com` | same |

Recommendation: keep one variable name (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`) and let its *value* differ between Vercel's Preview/Development environment (test mode) and Production environment (live mode) — this mirrors how the app already treats environment-scoped secrets. If Christian wants both live and test Price IDs available simultaneously during the go-live cutover window, add `STRIPE_TEST_PRICE_ID` / `STRIPE_LIVE_PRICE_ID` instead and pick per `NODE_ENV`/`VERCEL_ENV` in code — only do this if the single-swapped-var approach proves inconvenient in practice.

No new `NEXT_PUBLIC_*` variable is needed for building success/cancel/return URLs — the checkout and portal route handlers derive the origin from the incoming request (`new URL(request.url).origin`), which is simpler than adding a hardcoded site-URL env var and is already how a Next.js Route Handler naturally has this information.

`SUPABASE_SERVICE_ROLE_KEY` already exists (used today only in `scripts/seed.ts`) and will be reused by the webhook route — this is the **first** time it's used inside `app/`, so treat it with the same care as any other server-only secret (never expose it to a client component or `NEXT_PUBLIC_*` var).

## A.3 New Supabase table — `db/migrations/2026-07-stripe-subscription.sql`

Follows the `site_branding` singleton-row convention (`db/migrations/2026-07-site-branding.sql`), with one deliberate divergence explained below.

```sql
-- Rose City FC platform subscription mirror (Christian ↔ Rose City FC, Pro tier)
-- Date: 2026-07
--
-- Singleton row (id = 1) kept in sync by the Stripe webhook handler.
-- middleware.ts reads this row on every /admin/* request instead of calling
-- the Stripe API directly (too slow/fragile from the Edge runtime).

CREATE TABLE IF NOT EXISTS public.stripe_subscription (
  id                     integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  stripe_customer_id     text,
  stripe_subscription_id text,
  status                 text,
  cancel_at_period_end   boolean NOT NULL DEFAULT false,
  current_period_end     timestamptz,
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Deliberately NOT seeding an id=1 row here (unlike site_branding, which
-- seeds a default row). Decision: before the first Checkout ever completes,
-- no row should exist at all, and middleware must treat "no row" as fully
-- unlocked/normal. The webhook's checkout.session.completed handler performs
-- the first-ever INSERT via upsert(id=1).

ALTER TABLE public.stripe_subscription ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.stripe_subscription TO authenticated;
-- No GRANT to anon — the public site must never read billing state.
-- No INSERT/UPDATE/DELETE grant to authenticated or anon at all. The only
-- writer is the webhook route handler using the Supabase service_role key,
-- which bypasses RLS/grants entirely — this is intentional: subscription
-- state must only ever change in response to a verified Stripe event, never
-- from a browser client.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stripe_subscription'
      AND policyname = 'Authenticated can read subscription state'
  ) THEN
    CREATE POLICY "Authenticated can read subscription state"
    ON public.stripe_subscription FOR SELECT TO authenticated USING (true);
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';

SELECT id, stripe_customer_id, stripe_subscription_id, status,
       cancel_at_period_end, current_period_end, updated_at
FROM public.stripe_subscription;
```

Run this manually in the Supabase SQL editor before deploying the feature, same as every other file in `db/migrations/` — nothing auto-migrates in this repo.

**`lib/db-types.ts` addition** (alongside `DBSiteBranding`, same style):

```ts
export type DBStripeSubscription = {
  id: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string | null;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  updated_at: string;
};
```

## A.4 Pure decision logic — `lib/stripe-subscription-state.ts` (new)

This is the function the requirements call out for unit testing: given the mirrored row, decide which of the 4 Payments-tab states applies, and whether `/admin/*` should be soft-locked. Keep it dependency-free (no Supabase, no Stripe SDK import) so it runs identically in the Edge middleware and in Node route handlers/tests.

```ts
export type SubscriptionMirrorRow = {
  status: string | null;
  cancel_at_period_end: boolean;
  current_period_end: string | null; // ISO timestamp
} | null;

export type PaymentsUiState =
  | { state: "no_subscription" }
  | { state: "active" }
  | { state: "active_canceling"; periodEndsAt: string }
  | { state: "terminal" };

// Statuses Stripe uses that mean the subscription is fully, finally over.
// "past_due" is intentionally excluded — soft enforcement lets dunning run
// its course without locking anything until the paid-for period truly ends.
const TERMINAL_STATUSES = new Set(["canceled", "unpaid", "incomplete_expired"]);

export function resolvePaymentsUiState(
  row: SubscriptionMirrorRow,
  now: Date = new Date(),
): PaymentsUiState {
  if (!row || !row.status) {
    return { state: "no_subscription" };
  }

  const periodEnd = row.current_period_end ? new Date(row.current_period_end) : null;
  const pastPeriodEnd = periodEnd !== null && now.getTime() >= periodEnd.getTime();
  const isTerminalStatus = TERMINAL_STATUSES.has(row.status);

  if (isTerminalStatus && pastPeriodEnd) {
    return { state: "terminal" };
  }

  if (row.cancel_at_period_end && periodEnd && !pastPeriodEnd) {
    return { state: "active_canceling", periodEndsAt: row.current_period_end as string };
  }

  return { state: "active" };
}

export function isAdminLocked(row: SubscriptionMirrorRow, now: Date = new Date()): boolean {
  return resolvePaymentsUiState(row, now).state === "terminal";
}
```

Design notes to carry into the PR description:
- A row with `current_period_end = null` never counts as "past" — fail open, never lock on incomplete/malformed data (this is a soft-enforcement feature, not a hard security gate).
- A row with `status = "canceled"` but a still-future `current_period_end` (e.g. Stripe Dashboard manual immediate-cancel, or webhook-ordering race) resolves to `"active"`, not `"terminal"` — deliberately fails open rather than locking early; matches the grace-period decision.
- **Stripe API-version caution:** confirm against the installed `stripe` npm package's TypeScript types whether `current_period_end` is still on `Stripe.Subscription` directly or has moved to `subscription.items.data[0].current_period_end` in the pinned API version. Whichever field the installed SDK exposes, the webhook handler (A.6) must read that one when writing the mirror row — the state-resolution function above is agnostic to where the value came from.

### Suggested unit tests — `lib/__tests__/stripe-subscription-state.test.ts`

Follow the existing `describe`/`it` + `it.each` style from `lib/__tests__/shop-kit.test.ts`.

1. `row = null` → `"no_subscription"`, `isAdminLocked` → `false` (covers first-deploy / pre-checkout, decision 14).
2. `row` present but `status: null` → `"no_subscription"` (defensive).
3. `status: "active"`, `cancel_at_period_end: false` → `"active"`.
4. `status: "active"`, `cancel_at_period_end: true`, `current_period_end` in the future → `"active_canceling"` with the correct `periodEndsAt`.
5. `status: "canceled"`, `current_period_end` in the past → `"terminal"`, `isAdminLocked` → `true`.
6. `status: "canceled"`, `current_period_end` in the future → `"active"` (fail-open edge case, not `"terminal"`).
7. `status: "past_due"`, `current_period_end` in the future → `"active"` (mid-dunning, never locks by itself).
8. `status: "unpaid"`, `current_period_end` in the past → `"terminal"` (dunning-exhaustion path locks the same as voluntary cancellation).
9. Boundary: `now` exactly equal to `current_period_end` with a terminal status → `"terminal"` (uses `>=`).
10. `current_period_end: null` with `status: "canceled"` → `"active"` (never lock on missing period-end data).
11. `isAdminLocked` returns `true` only for the terminal case across all the fixtures above — one parametrized `it.each` sweeping every other case to `false`.

## A.5 Data-access helpers

**`lib/subscription-mirror.ts` (new)** — read-only helper, takes an already-constructed Supabase client so it works from both the Edge middleware client and the Node server-component client without re-instantiating anything:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SubscriptionMirrorRow } from "@/lib/stripe-subscription-state";

export async function getSubscriptionMirrorRow(
  supabase: SupabaseClient,
): Promise<SubscriptionMirrorRow> {
  const { data } = await supabase
    .from("stripe_subscription")
    .select("stripe_customer_id, stripe_subscription_id, status, cancel_at_period_end, current_period_end")
    .eq("id", 1)
    .maybeSingle(); // never .single() — "no row" must resolve to null, not an error
  return data;
}
```

Add unit tests in the same file's `__tests__` sibling using the chainable Supabase mock already established in `lib/__tests__/queries.test.ts` (the `vi.hoisted` `mockFrom` pattern) — cover: row found, no row found (`maybeSingle` → `null`), and that `.eq("id", 1)` is what gets called.

**`lib/supabase-service-role.ts` (new)** — first-ever use of the service-role key from inside `app/` (previously only `scripts/seed.ts` used it standalone):

```ts
import { createClient } from "@supabase/supabase-js";

export function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
```

Used only by the webhook route (A.6) to upsert the mirror row, bypassing RLS entirely by design (see A.3's grant note).

**`lib/stripe-client.ts` (new)** — single Stripe SDK construction point:

```ts
import Stripe from "stripe";

export function getStripeClient() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
  // Do not pin apiVersion manually — let the installed SDK's bundled default
  // apply, and confirm current_period_end's actual location (A.4's caution).
}
```

## A.6 Route handlers (new — `app/api/stripe/...`, not under `/admin`)

These live **outside** `app/admin/(protected)` and outside the middleware's `["/admin/:path*"]` matcher entirely — the webhook has no user session at all (Stripe calls it directly), and Checkout/Portal creation should not interact with the lockout-redirect logic in A.7. Each of the two action routes independently re-checks the caller is the billing admin — never trust that middleware already gated the request, since these paths aren't covered by it.

**`app/api/stripe/checkout/route.ts`** — POST, triggered by the Payments page's "Subscribe" form:
- Get the current user via `lib/supabase-server.ts`'s `createClient()`; if no user or `isBillingAdminEmail(user.email)` is false, return `403`.
- Read the mirror row (A.5) using this same authenticated client; if a `stripe_customer_id` already exists (State 4 resubscribe case), pass it as `customer` on the Checkout Session so the club's history stays on one Stripe Customer object. If none exists yet (State 1, true first-ever subscribe), pass `customer_email: "info@rosecityfutbolclub.com"` so Stripe creates the Customer with the club's real billing contact from decision 12 (hardcode this constant in code — it never varies by environment or needs to be configurable, consistent with the "Pro tier is hardcoded" spirit of decision 8).
- `mode: "subscription"`, one line item at `price: process.env.STRIPE_PRICE_ID`, quantity 1. No `trial_period_days` (decision 13).
- `success_url` / `cancel_url` built from `new URL(request.url).origin` + `/admin/payments?checkout=success` / `?checkout=cancelled`.
- Respond `NextResponse.redirect(session.url!, 303)`.

**`app/api/stripe/portal/route.ts`** — POST, triggered by "Manage Billing":
- Same billing-admin auth check as above.
- Read the mirror row; if no `stripe_customer_id`, return `400` (shouldn't be reachable from the UI since this button only renders in States 2/3).
- `stripe.billingPortal.sessions.create({ customer, return_url: origin + "/admin/payments" })`, redirect `303` to `session.url`.

**`app/api/stripe/webhook/route.ts`** — POST, called by Stripe's servers only:
- Leave this route on the default Node.js runtime (do **not** mark it `edge`) — it needs the service-role client and the Stripe SDK's signature verification.
- Read the **raw** body with `await request.text()` (never `request.json()` — signature verification requires the exact bytes Stripe sent). App Router Route Handlers give raw body access natively; there's no Pages-Router-style `bodyParser: false` config needed.
- Verify with `stripe.webhooks.constructEvent(rawBody, request.headers.get("stripe-signature")!, process.env.STRIPE_WEBHOOK_SECRET!)`; on failure return `400` and do not process anything.
- Handle these event types, each resolving to one Stripe Subscription object and upserting it into `stripe_subscription` via the service-role client:
  - `checkout.session.completed` — only when `session.mode === "subscription"`; retrieve the full subscription via `session.subscription`.
  - `customer.subscription.created` — backup path for first-time Checkout completion; the event payload's object *is* the subscription.
  - `customer.subscription.updated` — covers cancel-scheduled, undo-cancel, renewal, and other status transitions; the event payload's object *is* the subscription.
  - `customer.subscription.deleted` — subscription fully terminated; write its final `status`/`current_period_end` so the terminal check in A.4 has accurate data immediately.
  - `invoice.payment_succeeded` — backup path after successful renewal/first payment; retrieve the subscription from the invoice relationship.
  - `invoice.payment_failed` — retrieve the subscription via `invoice.subscription` so `past_due` surfaces promptly (decision 7), even though `past_due` alone never locks anything (A.4).
- A single shared `upsertMirrorRow(serviceClient, subscription)` helper writes `{ id: 1, stripe_customer_id, stripe_subscription_id: subscription.id, status: subscription.status, cancel_at_period_end: subscription.cancel_at_period_end, current_period_end: <ISO from Stripe's unix seconds>, updated_at: new Date().toISOString() }` via `.upsert(row, { onConflict: "id" })` — this single upsert is what enforces the singleton row.
- Return `NextResponse.json({ received: true })` for handled and unhandled event types alike (Stripe only needs a 2xx to stop retrying).

## A.7 Middleware changes — `middleware.ts`

Insert a new gate **after** the existing "logged in but not allowlisted → sign out" block and **before** the final "already logged in on login page" block, so it only ever runs for a user who is both authenticated and on `ADMIN_ALLOWED_EMAILS`:

```ts
import { isAdminLocked } from "@/lib/stripe-subscription-state";
import { getSubscriptionMirrorRow } from "@/lib/subscription-mirror";

// ...inside middleware(), after the existing isAllowed checks...

const isPaymentsRoute = request.nextUrl.pathname.startsWith("/admin/payments");

if (isAdminRoute && !isLoginPage && !isCallbackRoute && isAllowed && !isPaymentsRoute) {
  const subscriptionRow = await getSubscriptionMirrorRow(supabase);
  if (isAdminLocked(subscriptionRow)) {
    const paymentsUrl = request.nextUrl.clone();
    paymentsUrl.pathname = "/admin/payments";
    return NextResponse.redirect(paymentsUrl);
  }
}
```

- Reuses the *same* `supabase` client middleware already built for `auth.getUser()` — no second Supabase client is constructed, just one extra `.select()` scoped by the existing session's RLS grant (A.3's `authenticated`-only `SELECT` policy).
- `/admin/login` and `/admin/auth/callback` stay excluded exactly as they are today; `/admin/payments` is now also excluded so a locked admin can actually reach the page that lets them fix it.
- When no row exists yet (`getSubscriptionMirrorRow` → `null`), `isAdminLocked` returns `false` — identical to today's behavior, nothing redirects (decision 14).
- The public-facing (non-`/admin`) site is untouched — the `matcher` stays `["/admin/:path*"]`.

**Reconciling decisions 2 and 5 (billing-admin-only vs. lock-everyone-out):** decision 2 restricts *seeing and acting on* billing to `BILLING_ADMIN_EMAILS`, but decision 5 requires the lockout to redirect *every* allowed admin to `/admin/payments` once terminal. If Rose City ever has other `ADMIN_ALLOWED_EMAILS` besides the billing admins, they would otherwise be redirected to a page they can't act on. Resolve this in the Payments page itself (A.8), not in middleware: the redirect target is the same for everyone, but the page renders differently depending on whether the viewer is a billing admin.

## A.8 Payments page — `app/admin/(protected)/payments/page.tsx` (new)

Server Component, following the existing pattern of pages under `app/admin/(protected)/*`:

1. Get the current user via `lib/supabase-server.ts`'s `createClient()`.
2. Read the mirror row via `getSubscriptionMirrorRow(supabase)` (A.5) using the same authenticated client (RLS-scoped `SELECT`, no service role needed here).
3. Resolve UI state via `resolvePaymentsUiState(row)` (A.4).
4. If `isBillingAdminEmail(user.email)` is true, render the full state machine:
   - **State 1 (`no_subscription`) or State 4 (`terminal`):** `<form action="/api/stripe/checkout" method="POST"><button>Subscribe — $99.99/mo</button></form>`. State 4 additionally renders the support line: `Questions about your billing? Contact <a href="mailto:onziofutbol@gmail.com">onziofutbol@gmail.com</a>` (decision 11) — this is the *only* place that address appears; do not reuse it as the Stripe Customer email (that's `info@rosecityfutbolclub.com`, decision 12, kept strictly separate).
   - **State 2 (`active`):** `<form action="/api/stripe/portal" method="POST"><button>Manage Billing</button></form>`.
   - **State 3 (`active_canceling`):** a banner "Your subscription ends on `{periodEndsAt formatted}`" plus the same Manage Billing form — the Portal's own hosted screen offers the renew/undo-cancellation action (Dashboard setting, Part B Phase 1), no separate in-app "reactivate" button ever exists.
5. If the viewer is on `ADMIN_ALLOWED_EMAILS` but is **not** a billing admin, render a minimal read-only notice — current status line only, no Subscribe/Manage buttons, and (only in the terminal case) the same support-contact mailto line, since they have no path to act on it themselves.

Since forms plain-POST to the route handlers and those handlers respond with a redirect, no client component or JS is required anywhere on this page — consistent with "no custom payment UI."

## A.9 Nav registration — `app/admin/(protected)/layout.tsx`

Add one entry to the existing `NAV_ITEMS` array, in the same shape as every other entry (label/href/icon), but only surfaced to the billing admin — pull the signed-in user's email (already fetched into `userEmail` state in this file) and filter the rendered list:

```ts
{
  label: "Payments",
  href: "/admin/payments",
  icon: ( /* new svg, same 22x22 stroke style as the others */ ),
},
```

At render time, keep the billing-admin list server-only and ask `/api/stripe/billing-admin` whether the current viewer is allowed to manage billing. This avoids introducing a `NEXT_PUBLIC_` mirror of the billing-admin emails and keeps the client-side sidebar from leaking the list.

## A.10 Testing / verification

- `npx tsc --noEmit --pretty false` — must pass with the new files (webhook/checkout/portal routes, new `lib/` modules, new page, updated `middleware.ts` and `layout.tsx`).
- `npm test` — the suite grows from 153 tests / 8 files with the new `lib/__tests__/stripe-subscription-state.test.ts` (A.4's ~11 cases) and `lib/__tests__/subscription-mirror.test.ts` (mocked-Supabase read helper, same chainable-mock style as `queries.test.ts`). Route handlers (webhook/checkout/portal) are **not** unit-tested in this repo's existing style — no route handler in the codebase has automated tests today; they get verified end-to-end against Stripe test mode instead (Part B, Phase 1).
- `npm run build` — confirms the new `app/api/stripe/*` routes and `app/admin/(protected)/payments` page compile cleanly in the full Next.js build.
- **Never `git push` to `main` (or any Vercel-deploying branch) without Christian's explicit permission for that specific push** — this applies in full once this feature is otherwise ready to ship, exactly as stated in this repo's `CLAUDE.md`. A prior approved push does not carry forward to this one.

---

# Part B — Stripe Dashboard Step-by-Step Guide

## Phase 1: Test Mode Setup

Complete every step below, then run the full flow (subscribe → active → cancel → grace-period banner/undo → lockout after period end → resubscribe) end-to-end with test card `4242 4242 4242 4242` (any future expiry, any CVC, any ZIP) before touching anything live.

1. **Switch the Dashboard to test mode** — top-left mode toggle must read "Test mode."
2. **Create the Product:** Dashboard → Product catalog → **+ Add product**. Name it `Onzio Pro — Rose City FC` (or similar internal name; the customer never sees the Product name unless it's shown on the Checkout page/receipt, so make it identifiable to Christian).
3. **Add the recurring Price on that Product:** in the same product screen, add a Price of **$99.99**, billing period **Monthly**, type **Recurring**. Save, then copy the resulting test Price ID (`price_...`) — this becomes `STRIPE_PRICE_ID` for test/preview environments.
4. **Copy the test API keys:** Dashboard → Developers → API keys. Copy the **Secret key** (`sk_test_...`) — this becomes `STRIPE_SECRET_KEY`. The publishable key is not needed anywhere in this codebase (no client-side Stripe.js), so it does not need to be stored.
5. **Configure the Customer Portal:** Dashboard → Settings → Billing → **Customer portal**.
   - Under **Subscriptions**, enable **"Customers can cancel subscriptions."** Set cancellation behavior to **cancel at end of billing period** (not immediately) — this is what makes `cancel_at_period_end` the mechanism the webhook and the state logic rely on.
   - In the same cancellation settings, enable the option that lets a customer **undo a scheduled cancellation** (Stripe surfaces this as a "renew subscription" action once cancellation is scheduled) — this is what powers State 3's Manage Billing button with no separate app-side "reactivate" code.
   - Enable **"Customers can update payment methods."**
   - Enable **"Customers can view billing history / invoices."**
   - Save the configuration. (Portal configuration is per-mode — this test-mode configuration does not carry over to live mode; Phase 2 repeats this step.)
6. **Create the test-mode webhook endpoint:** Dashboard → Developers → Webhooks → **+ Add destination** (or "Add endpoint," depending on Dashboard version).
   - Endpoint URL: `https://<your-preview-or-staging-domain>/api/stripe/webhook`.
   - Select exactly these events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
   - Save, then open the endpoint's details and copy its **Signing secret** (`whsec_...`) — this becomes `STRIPE_WEBHOOK_SECRET` for test/preview environments.
   - If testing locally before a public preview URL exists, use the Stripe CLI (`stripe listen --forward-to localhost:3000/api/stripe/webhook`) to get a local-only test signing secret instead; swap in the Dashboard-registered one once testing moves to a deployed preview URL.
7. **Turn on customer emails:** Dashboard → Settings → Billing → **Customer emails**. Enable:
   - Successful payment receipts.
   - Upcoming renewal reminders.
   - Failed payment / Smart Retries dunning emails (Dashboard → Settings → Billing → **Revenue recovery** / Smart Retries — enable retry schedule and failed-payment emails there).
   - All zero-custom-code, Dashboard-only settings.
8. **Set the test Customer's email:** test mode can use any placeholder address when driving the Checkout flow manually (no real email is meaningfully delivered in test mode) — do not worry about matching `info@rosecityfutbolclub.com` until Phase 2's live pass. The app code itself always requests `info@rosecityfutbolclub.com` as the Customer email on first Checkout (A.6) regardless of mode; this only actually matters for live-mode delivered receipts.
9. **Store the test values:**
   - Local: `.env.local` gets `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` (test values) and `BILLING_ADMIN_EMAILS=christianjavieralcala@gmail.com,info@rosecityfutbolclub.com`.
   - Vercel: Project → Settings → Environment Variables — add the same four keys scoped to **Preview** and **Development** environments with these test values. Leave **Production** unset until Phase 2.
10. **Run the full test-mode pass** against a deployed preview (or local dev with `stripe listen`):
    - Subscribe with `4242 4242 4242 4242` → confirm the mirror row is created (State 1 → 2) and `/admin` is fully reachable.
    - From the Payments tab's Manage Billing → Portal → cancel (scheduled) → confirm State 3's banner and date appear, and `/admin/*` stays unlocked.
    - From the Portal, undo the cancellation → confirm it reverts to State 2 with no separate app code involved.
    - Use a Stripe test clock (Dashboard → Developers → Test clocks) to fast-forward past `current_period_end` without the undo, and confirm `customer.subscription.deleted` fires, the mirror row flips terminal, and every `/admin/*` route except `/admin/payments` redirects there (State 4, lockout, support-contact line visible).
    - Resubscribe via the same "Subscribe" button from the locked screen → confirm a fresh Checkout Session succeeds and unlocks everything again, reusing the same Stripe test Customer id.
    - Separately, use Stripe's test card that simulates a decline (`4000 0000 0000 0341` or similar) to confirm `invoice.payment_failed` updates `status` to `past_due` without locking anything (soft enforcement, decision 3/4).

## Phase 2: Go-Live Checklist

Only start this once every Phase 1 scenario above has passed.

1. **Switch the Dashboard to live mode** (top-left toggle).
2. **Recreate the Product and Price in live mode** — test-mode objects do not carry over. Dashboard → Product catalog → **+ Add product**, same name, same $99.99/mo recurring Price. Copy the new live Price ID (`price_...`) — this becomes `STRIPE_PRICE_ID`'s Production value.
3. **Generate live API keys:** Dashboard → Developers → API keys (now showing live-mode keys). Copy the live **Secret key** (`sk_live_...`).
4. **Re-confirm the Customer Portal configuration exists in live mode too** — Dashboard → Settings → Billing → Customer portal, in live mode. Re-enable the same settings from Phase 1 step 5 (cancel-at-period-end, undo-scheduled-cancellation, update payment method, view invoices/history) — this configuration is per-mode and does **not** inherit from test mode.
5. **Register the live webhook endpoint:** Dashboard → Developers → Webhooks (live mode) → **+ Add destination**, canonical production URL (`https://www.rosecityfutbolclub.com/api/stripe/webhook`), events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, and `invoice.payment_failed`. Do not use the apex URL, because `https://rosecityfutbolclub.com/api/stripe/webhook` redirects to `www` with `308` and Stripe records that as a failed delivery. Copy this endpoint's live signing secret — this becomes `STRIPE_WEBHOOK_SECRET`'s Production value.
6. **Turn on live-mode customer emails and Smart Retries** the same way as Phase 1 step 7 — these settings are also per-mode.
7. **Store the live values in Vercel:** Project → Settings → Environment Variables — set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` scoped to **Production** with the live values from steps 2/3/5. `BILLING_ADMIN_EMAILS` stays the same value in every environment.
8. **Confirm the live Customer email is set correctly:** when Christian clicks "Subscribe" for real, the checkout route (A.6) requests Stripe Customer email `info@rosecityfutbolclub.com` — verify after the real Checkout completes (Dashboard → Customers, live mode) that the Customer object's email is exactly `info@rosecityfutbolclub.com`, since this is what live receipts/renewal reminders/dunning emails will actually be delivered to. This is intentionally a different address from the `onziofutbol@gmail.com` support line shown on the app's own locked screen (decisions 11 vs. 12) — do not conflate the two when verifying.
9. **Make one real $99.99 charge to confirm before calling it done:** complete an actual live Checkout with a real card, confirm the charge appears in Dashboard → Payments (live mode), confirm the mirror row updates via the live webhook, confirm `/admin` is fully unlocked, and confirm the receipt email lands at `info@rosecityfutbolclub.com`. Only after this real charge is confirmed is live billing considered live.

---

### Critical Files for Implementation

- `middleware.ts`
- `lib/stripe-subscription-state.ts`
- `db/migrations/2026-07-stripe-subscription.sql`
- `app/api/stripe/webhook/route.ts`
- `app/admin/(protected)/payments/page.tsx`
- `app/admin/(protected)/layout.tsx`

---

# Part C — Public Site Lockout (Grace-Extended)

**Scope:** Everything in Part A locks `/admin/*` the instant the subscription goes terminal. This section adds a second, later trigger: once a terminal subscription stays unresolved for a full **7 days past `current_period_end`**, the public-facing site (`/`, `/roster`, `/schedule`, `/shop`) also goes down, replaced by a neutral "temporarily unavailable" placeholder — no billing language, no admin contact, nothing that reveals why. This is a materially higher-stakes consequence than the admin lockout, so it gets its own resolver, its own env-var override, and its own middleware block, layered onto the same `middleware.ts` file rather than folded into the existing admin logic.

## C.1 New resolver — `lib/stripe-subscription-state.ts` (addition)

Add alongside `isAdminLocked`, not inside it — `isAdminLocked` keeps its exact current zero-buffer behavior, untouched:

```ts
const PUBLIC_SITE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export function isPublicSiteLocked(row: SubscriptionMirrorRow, now: Date = new Date()): boolean {
  if (!row || !row.status || !TERMINAL_STATUSES.has(row.status)) {
    return false;
  }

  if (!row.current_period_end) {
    return false;
  }

  const publicLockThreshold = new Date(row.current_period_end).getTime() + PUBLIC_SITE_GRACE_MS;
  return now.getTime() >= publicLockThreshold;
}
```

Design notes to carry into the PR description:
- Reuses the exact same `TERMINAL_STATUSES` set as `isAdminLocked` — no new status list, no drift between the two gates over time.
- Same fail-open semantics as `isAdminLocked` at every step: no row, null `status`, non-terminal `status`, or null `current_period_end` all resolve to `false`. The 7-day clock only ever starts once a row has genuinely gone terminal with a real `current_period_end` — never on a fresh, never-subscribed deployment (decision 8).
- Deliberately does **not** call `resolvePaymentsUiState` internally — that function's `"terminal"` state already fires at zero buffer, and threading a second time-offset through it would make the existing, already-tested Part A function harder to reason about for no benefit. `isPublicSiteLocked` re-derives the terminal check directly from the row, keeping both functions small and independently correct.
- `PUBLIC_SITE_GRACE_MS` is a `const`, not an env var — the 7-day buffer is a fixed product decision, not something to make configurable.

### Suggested unit tests — `lib/__tests__/stripe-subscription-state.test.ts` (additions)

New `describe("isPublicSiteLocked")` block, same `row()` fixture helper and `NOW`/`PAST`/`FUTURE` constants already in the file:

1. `row = null` → `false` (fail-open on no row, decision 8/first-deploy).
2. `row` present, `status: null` → `false`.
3. `status: "active"`, `current_period_end` in the past → `false` (non-terminal status never locks, regardless of dates).
4. `status: "canceled"`, `current_period_end: null` → `false` (fail-open on missing period-end).
5. `status: "canceled"`, `current_period_end` = `NOW` exactly (i.e. `now === current_period_end`, zero buffer elapsed) → `false` — this is the point where `isAdminLocked` would already be `true`; confirms the two gates are genuinely decoupled.
6. `status: "canceled"`, `current_period_end` = `NOW - 6 days` → `false` — **the key new boundary test**: still inside the 7-day grace window, admin is locked but public site is not.
7. `status: "canceled"`, `current_period_end` = `NOW - 7 days` exactly → `true` (uses `>=`, matches the existing boundary convention from `isAdminLocked`'s own period-end test).
8. `status: "canceled"`, `current_period_end` = `NOW - 8 days` → `true` (comfortably past the buffer).
9. `status: "unpaid"`, `current_period_end` = `NOW - 7 days` → `true` (dunning-exhaustion path locks the public site too, same as it locks admin).
10. `status: "past_due"`, `current_period_end` = `NOW - 30 days` → `false` (never a terminal status, never locks either gate no matter how stale).
11. One `it.each` sweeping every non-locking fixture above (plus the `isAdminLocked`-locked-but-still-within-grace case from #6) confirming `isPublicSiteLocked` is `false` for all of them, mirroring the existing `isAdminLocked` parametrized sweep's style.

`FORCE_PUBLIC_SITE_ONLINE` is not something `isPublicSiteLocked` itself checks — keep the pure function env-agnostic and dependency-free like the rest of this file (it needs to run identically in tests and in Edge middleware). The override is applied one layer up, in `middleware.ts` (C.2), so a "override env var respected" test belongs in a middleware-level test/manual check, not in this file's unit suite.

## C.2 Middleware changes — `middleware.ts`

New imports, added alongside the existing ones:

```ts
import { isAdminLocked, isPublicSiteLocked } from "@/lib/stripe-subscription-state";
import { createServiceRoleClient } from "@/lib/supabase-service-role";
```

New public-route gate — insert this as its own top-level block in `middleware()`, independent of (and not interleaved with) the existing admin-route logic, since it runs on a disjoint set of paths and uses a different Supabase client. To avoid an unnecessary Supabase Auth round-trip on every public page view, check this block **before** constructing the cookie-bound `supabase` client used for the admin auth/session logic — public visitors never have an admin session, so there's no reason to pay for `auth.getUser()` on every public request:

```ts
const PUBLIC_LOCKABLE_PATHS = ["/", "/roster", "/schedule", "/shop"];
const isPublicLockablePath = PUBLIC_LOCKABLE_PATHS.includes(request.nextUrl.pathname);

if (isPublicLockablePath && process.env.FORCE_PUBLIC_SITE_ONLINE !== "true") {
  const serviceClient = createServiceRoleClient();
  const subscriptionRow = await getSubscriptionMirrorRow(serviceClient);

  if (isPublicSiteLocked(subscriptionRow)) {
    return new NextResponse(PUBLIC_LOCKED_HTML, {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Retry-After": "86400",
        "X-Robots-Tag": "noindex",
      },
    });
  }
}
```

`PUBLIC_LOCKED_HTML`, defined once at module scope in `middleware.ts` (not inside the function, so it isn't rebuilt per-request):

```ts
const PUBLIC_LOCKED_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Rose City FC</title></head>
<body>
<h1>Rose City FC</h1>
<p>Site temporarily unavailable — check back soon.</p>
</body>
</html>`;
```

**Why a hardcoded inline `NextResponse` and not a rewrite to a dedicated page route:** a rewrite target would itself have to live outside `app/(public)` (since every route inside that group is exactly what's being locked), meaning a whole extra page file, its own layout concerns, and a `rewrite()` call that still has to run this same subscription check first to decide *whether* to rewrite — no simplification, just indirection. Middleware already runs on the Edge before any page renders, has the lock decision in hand, and Next.js lets a middleware return a fully-formed `Response`/`NextResponse` directly with arbitrary status/headers/body. A static inline string is also trivially guaranteed to carry zero billing/account language, since there's no template file a future edit could accidentally enrich with dynamic data. Keep the HTML deliberately minimal — this is a placeholder, not a designed page.

**Why `createServiceRoleClient()` instead of the existing cookie-bound `supabase` client for this read:** decision 7 requires the raw `status` field to stay unqueryable via Supabase's REST API by an anonymous visitor. The existing `supabase` client in `middleware.ts` only carries whatever session cookie the request has (none, for a public visitor) — reading `stripe_subscription` through it would return `null` today only because there's no `anon` grant, but the actual security property Christian wants is "no client, admin or otherwise, that a public visitor could ever construct can read this row." `createServiceRoleClient()` bypasses RLS/grants entirely and is already Edge-safe (built on plain `@supabase/supabase-js` `createClient`, no `@supabase/ssr` cookie plumbing), so it's a straight drop-in for this one read — no new client construction pattern to invent.

**`config.matcher` — updated to cover both admin and the explicit public paths in one file:**

```ts
export const config = {
  matcher: ["/admin/:path*", "/", "/roster", "/schedule", "/shop"],
};
```

An explicit list, not a broad matcher with `/api/*`/`/_next/*` excluded afterward — this keeps `/api/stripe/webhook`, `/api/stripe/checkout`, `/api/stripe/portal`, and `/api/stripe/billing-admin` structurally unreachable by this new logic rather than relying on remembering to exclude them, matching how the *old* matcher (`["/admin/:path*"]`) already never touched `/api/*` at all. `/club-logo` is deliberately **not** added to the matcher: it's a single-image redirect endpoint, not a page a visitor reads, so serving it an HTML 503 body wouldn't meaningfully communicate anything and would just break whatever `<img>`/`next/image` reference is pointing at it during a lockout. Leaving it unmatched means the logo keeps resolving even while the rest of the site is down — a minor, deliberately-accepted inconsistency, not a gap worth extra logic for.

Nothing about the existing `/admin/:path*` matcher entry, the `isAdminLocked` block, or the cookie-bound `supabase` client changes for admin routes — the two gates run side by side in the same function, on disjoint path sets, using two different Supabase client instances for two different reasons (decision 9).

## C.3 Critical Files (this section only)

- `middleware.ts` (already listed in Part A — now also carries the public-lock block and the expanded matcher)
- `lib/stripe-subscription-state.ts` (already listed in Part A — now also exports `isPublicSiteLocked`)
- `lib/__tests__/stripe-subscription-state.test.ts` (new `describe("isPublicSiteLocked")` block)
- `.env`/Vercel Environment Variables config — new `FORCE_PUBLIC_SITE_ONLINE` var (no code file, but required for the override to exist at all)

## C.4 Testing / verification

- Extend `lib/__tests__/stripe-subscription-state.test.ts` with C.1's cases and re-run `npm test` — total count grows again from Part A's addition.
- `npx tsc --noEmit --pretty false` and `npm run build` must both still pass with the updated `middleware.ts` and expanded `config.matcher`.
- **Live boundary verification reuses the same backdating technique already used earlier in this session** (directly updating the `stripe_subscription` mirror row's `current_period_end` via the Supabase SQL editor/service-role client) rather than a fresh Stripe test-mode pass — this section changes only a comparison threshold in already-verified plumbing, not the webhook or Checkout/Portal flow. Verify at three specific backdated values against a row with a terminal `status`:
  - `current_period_end = now` (admin already locked at this point; confirm `/`, `/roster`, `/schedule`, `/shop` still return normal `200` responses — public site not yet locked).
  - `current_period_end = now - 6 days` (still inside grace; confirm public routes remain fully reachable).
  - `current_period_end = now - 7 days` (confirm all four public routes now return `503` with the neutral HTML body, `Retry-After: 86400`, and `X-Robots-Tag: noindex`, while `/admin/payments` remains reachable and functional throughout every step above).
- Separately confirm `FORCE_PUBLIC_SITE_ONLINE=true` with a row backdated past 7 days still serves the real public pages (`200`), and that toggling it off immediately restores the `503` — this override only needs to be verified locally/in Preview, not against live Stripe data, since it never touches Stripe at all.
- Confirm `/api/stripe/webhook`, `/api/stripe/checkout`, `/api/stripe/portal`, and `/api/stripe/billing-admin` all remain reachable (not intercepted by middleware at all) throughout every state above — a quick `curl -I` against each during the locked-public-site state is sufficient, since the matcher change is what guarantees this, not any runtime branching.
