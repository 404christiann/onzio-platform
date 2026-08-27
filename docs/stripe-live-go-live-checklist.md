# First-Time-Live Stripe Checklist

This is the permanent, feature-independent checklist for taking any Stripe
surface live in this repository for the first time. Walk it **before writing
a feature-specific go-live plan**, not during execution and never after
deploy. It exists because of a concrete gap: on 2026-08-26 the registration
payments (Stripe Connect) go-live shipped with correct code, migrations, env
vars, and a registered live webhook — and still failed on the club owner's
first "Connect to Stripe" click, because the one-time **platform Connect
profile questionnaire** had never been completed. That prerequisite lives
only in Stripe's own onboarding docs; no code, test, env var, or grep in this
repo could ever have surfaced it.

## The meta-rule (read this even if you skip the rest)

**When taking any Stripe product live for the first time in this account
(Connect, Billing, Tax, Terminal, Issuing, ...), walk Stripe's own "Before
you begin" / essential-tasks checklist for that product first.** First-time
prerequisites are account-level state configured in the Stripe Dashboard;
they are enforced only in live mode (test mode passes everything), and they
are invisible to this repo's code, types, tests, and env-var checks. Example:
Connect's list at <https://docs.stripe.com/connect/saas/essential-tasks>
("Before you begin": register your platform, verify business details,
complete your platform profile, branding).

## Checklist

Work through every item for the target environment (production = live mode):

1. **Platform account activated.** Business details verified,
   `charges_enabled` on the platform account. (Done long ago for Onzio —
   live billing subscriptions already charge — but verify for any new Stripe
   account.)
2. **Connect platform profile complete** (Connect features only —
   **one-time per Stripe account**). Dashboard -> Settings -> Connect ->
   Platform profile (<https://dashboard.stripe.com/connect/settings/profile>).
   Without it, every live `accounts.create()` fails with "You must complete
   your platform profile to use Connect and create live connected accounts."
   Check this **before** writing a Connect go-live plan. There is no
   read-only API for it; once at least one live connected account exists,
   `npm run stripe:verify-connect-config` proves it transitively (a live
   connected account cannot exist otherwise). Do **not** "verify" it with a
   live `accounts.create()` probe — a successful probe strands a live
   Standard connected account that Stripe's API cannot delete.
   - Status for Onzio's platform account (`acct_1TvPQyK6WajTkwHY`): see
     "Platform state record" below.
3. **Live webhook endpoints registered** in the Dashboard for every route the
   feature depends on, with the exact event list and (for Connect) the
   correct "Listen to events on Connected accounts" scoping, and the live
   signing secret captured.
4. **Vercel production env vars set** (Production scope): live secret key,
   the feature's webhook secret(s), any feature-specific IDs. Remember env
   vars only take effect on the next deploy.
5. **Relevant verify script green** against the target environment's
   variables:
   - Billing: `npm run stripe:verify-portal-config`
   - Connect/registrations: `npm run stripe:verify-connect-config`
   Both are read-only. Treat an INDETERMINATE platform-profile result as
   "item 2 is unconfirmed", not as a pass.
6. **Supervised real-money walkthrough** as the acceptance bar: a real
   low-value charge (and refund) through the real UI, webhooks delivering
   200, ledger/state rows correct — executed or directed by Christian in
   real time, never autonomously. Not live until this passes.

Items 1–4 are manual Dashboard/Vercel state; item 5 verifies what is
programmatically checkable; item 6 verifies what is not.

## Platform state record

Durable record of one-time Stripe platform-account state, so future agents
do not rediscover it:

| State | Status | Evidence |
| --- | --- | --- |
| Platform account activated (live charges enabled) | Done | Live billing subscriptions charging since 2026-08 (Diverse City FC) |
| Connect platform profile questionnaire | **PENDING as of 2026-08-26** — discovered incomplete during the registration-payments go-live (live `accounts.create` returned the platform-profile error, req `req_dNolWBKNl4w3my`); awaiting Christian's completion in the Dashboard | Update this row once a retried "Connect to Stripe" succeeds or `stripe:verify-connect-config` reports `platformProfileProven: true` |
| Live Connect webhook endpoint (`/api/stripe/connect-webhook`, connected-accounts scope, 3 events) | Done 2026-08-26 | Go-live deploy record in `HANDOFF.md`; `STRIPE_CONNECT_WEBHOOK_SECRET` set in Vercel production |
| Live Billing webhook endpoint (`/api/stripe/webhook`) | Done (Rose City era) | `docs/rose-city-legacy/stripe-subscription-plan.md` Phase 2 |
