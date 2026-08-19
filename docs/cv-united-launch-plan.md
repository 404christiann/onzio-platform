# CV United: New Template + Registration/Payments Build → Preview Tenant

**Current position (HANDOFF style): not started.** No branch, no worktree, no migrations, no tenant row exists for CV United. This document is the approved plan only. Business state: real prospect; owner verbally committed two days ago and is "down to sign," but **no contract is drafted or signed yet**. Christian expects real assets (crest, colors, roster, pricing, schedule, waiver text) after a phone call with the owner within days; he will swap placeholders in himself. Everything below is sequenced so that nothing irreversible or customer-billing-real happens before signature.

**Hard safety posture for the whole build (do not soften, restate at every phase):**

- Tenant row is `kind: "test"`, `lifecycle: "onboarding"`, `public_access: "preview"` — authenticated preview only, not publicly indexable. Same posture as MLA. It lives in the one shared production Supabase project (`ioalthwsdrlzrubomrow`) alongside Diverse City FC (paying) and Rose City (showcase); isolation is RLS + `club_id`, exactly like every tenant — there is no second database.
- **Stripe: test mode only, mechanically enforced (see Phase 4), until Christian explicitly confirms the contract is signed.** No live keys are ever configured for this tenant before that signal, under any circumstance.
- **No CV United owner/admin login until signature.** Christian (operator) views/exports registration data and hands it to the owner directly. The owner-role `club_members` invite (MLA/DCFC precedent, `lib/operator/invite-club-member.ts`) happens only post-signature.
- **Deliberate, Christian-approved risk acceptance:** the free General Interest path goes live collecting real prospective players'/families' data (including minors' DOBs) pre-contract. This decision is made; the plan's job is the mitigations, not re-argument. Mitigations: paid path gated off (Phase 6 mechanism), Stripe test-mode-only, no owner access, RLS-scoped storage in the same hardened platform as paying tenants, operator-only export.

## Target architecture recap

- Built **inside `onzio-platform`** — one shared platform, template per club, same as every tenant. No separate repo, no future migration.
- **New presentation template: `crest@1`** (id `crest`, version 1). Generic, reusable, platform-owned name following the `pathway@1`/`clubhouse@1`/`academy@1` discipline — crest-forward European-prestige matchday template, not CV-United-exclusive; `originNote: "Based on the approved CV United prospect visual system."` Any club may be assigned it. Visually descended from `pathway@1`'s hero/section rhythm and typography polish (MLA staging precedent), but **with roster + schedule as first-class defaults** — the exact capability `pathway@1` deliberately excludes.
- **Branch/worktree (MLA precedent, mirrored exactly):** new branch `claude/cv-united-crest` cut fresh from `origin/staging`; new worktree `~/Downloads/onzio-platform-cv-united`. Do not build in the main checkout; do not touch `~/Downloads/onzio-platform-mla` or any `pathway@1` file.
- **Route reuse, not rebuild.** Home, About (`/club/about`), Roster (`/roster`), Schedule (`/schedule`), Contact (`/contact`) are existing shared routes (`app/(public)/club/about`, `app/(public)/roster`, `app/(public)/schedule`, `app/(public)/contact`) already registered in `routeRegistry` (`home`, `club`, `roster`, `schedule`, `contact` in `packages/presentation/index.ts`). `crest@1` lists them in `defaultRoutes`/`supportedRoutes` and styles them; only the homepage sections, nav, and the new Join surface are new build.
- New registry work in `packages/presentation/index.ts`: template key union + `documentSchema` template-id enum + `templateRegistry["crest@1"]`; new `crest.*` sections (hero, honors/feature bands, partner strip — final list at design time, each mapped to an existing content domain per the `pathway@1` comment discipline); one new route key `join` → `/join` (generic name, reusable by any club that registers players); font pack from the existing registry or one new pack if the type direction below demands it.

## Visual design direction — Real Madrid-inspired theme tokens

Direction from Christian: draw on Real Madrid's actual brand language — crisp white as the dominant surface, deep navy/black and metallic gold as accents, crest-forward hero, European-club prestige typography, not generic-youth-soccer. Concrete token proposal against the real `documentSchema.theme` shape (all values normalized 6-digit hex; must pass the validator's contrast gates: `text.primary` vs `surface.canvas` ≥ 4.5, `action.primaryText` vs `action.primary` ≥ 3 — both proposals pass with wide margin):

| Token | Proposed value | Rationale |
|---|---|---|
| `surface.canvas` | `#FFFFFF` | The white kit. Dominant page ground. |
| `surface.elevated` | `#FBFAF6` | Warm off-white for cards so elevation reads without gray murk. |
| `surface.subtle` | `#F3F1EA` | Ivory band for alternating section rhythm. |
| `surface.inverse` | `#0B1B3A` | Deep navy for inverted bands (hero overlay, footer, "matchday" strip). |
| `text.primary` | `#10182B` | Near-black navy ink — reads black, harmonizes with navy surfaces. |
| `text.secondary` | `#3D4A66` | Muted navy-slate. |
| `text.muted` | `#69718A` | Captions, meta, table secondary cells. |
| `text.inverse` | `#FFFFFF` | On navy bands. |
| `action.primary` | `#0B1B3A` | Deep navy CTAs — the club's serious color, not gold (gold buttons read cheap at scale). |
| `action.primaryHover` | `#16294F` | |
| `action.primaryText` | `#FFFFFF` | |
| `action.secondary` | `#C9A227` | Gold — secondary/outline CTAs, active nav underline. |
| `border.subtle` | `#E7E3D8` | Warm hairline, matches ivory surfaces. |
| `border.strong` | `#0B1B3A` | |
| `status.success` | `#1B7A43` | Standard trio, slightly desaturated to sit in the palette. |
| `status.warning` | `#B45309` | |
| `status.danger` | `#B42318` | |
| `accent.one` | `#C9A227` | Metallic gold — the signature. Dividers, crest ring, price underlines, hero kicker. |
| `accent.two` | `#8C6D14` | Deep antique gold — where gold must carry small text on white (pure `#D4AF37` fails contrast as text; keep bright gold decorative-only). |

How the components express it: hero is white-dominant with the crest large and centered-or-left ("crest-forward"), a thin gold rule under the kicker line, navy display headline, and photography treated like kit-launch imagery (high-key, white/neutral backgrounds where assets allow) rather than dark cinematic overlays — this is the deliberate inversion of `cinematic@1`. Section dividers are 1px gold-on-ivory. Roster/schedule tables: white rows, navy header band with white text, gold accent on the featured/next-match row. Footer and one mid-page feature band go `surface.inverse` navy with gold hairlines, mirroring `pathway@1`'s inverted-feature rhythm. Typography: high-contrast pairing evoking European-club prestige — evaluate existing packs first (`geist` is the `pathway@1` look; `bebas-inter` is too athletic-poster); if neither lands "elegant serif or high-contrast sans," register one new pack (e.g. a Playfair-Display-or-Cormorant headings + Inter body pack, `compatibleTemplates: ["crest@1"]`), following the `montserrat-inter-dmsans`/DCFC-D104 precedent of adding a pack only when no existing one matches the approved type stack. **No Real Madrid marks, crest elements, or trademarked assets anywhere — brand language as inspiration only; the crest rendered is CV United's own (placeholder monogram until the real crest arrives).**

## IA / navigation plan

Six top-level tabs, in order:

1. **Home** (`home`) — `crest.*` sections
2. **About** (`club` → `/club/about`) — shared route, restyled
3. **Roster** (`roster`) — shared route
4. **Schedule** (`schedule`) — shared route
5. **Contact** (`contact`) — shared route
6. **Join** (new route key `join` → `/join`) — label proposeable ("Join," "Join the Club," "Registration"); default **"Join"**

`/join` is a chooser page with two clearly separated paths:

- **General Interest / Sign Up** (`/join/interest`): free, no payment, no waiver. Live from day one, collecting real data.
- **Academy Team Registration** (`/join/academy`): paid, consent/waiver required. Fully built and Stripe-test-wired, but **not live** until real pricing + real club-approved waiver text land (gating mechanism in "Placeholder-vs-real gating" below).

## Data model plan — shared Responses infrastructure

Postgres is the system of record. This is the first real build of the previously-only-planned admin phase 3a/3b (form + payment block) — scoped as **shared platform infrastructure sized to exactly two form types**, in `onzio` schema with the platform's standard composite-tenant-FK + RLS discipline (`unique (club_id, id)` etc., per `docs/onzio-platform-plan.md`). DCFC is the known second consumer later.

**`registration_forms`** — one row per form a club offers:

- `id uuid pk`, `club_id` (composite-unique with id)
- `form_type text check in ('general_interest','academy_registration')` (v1 vocabulary, not a generic builder)
- `title`, `description`
- `status text check in ('draft','live','closed') default 'draft'` — the go-live gate (see below)
- `requires_payment boolean`, `price_cents integer null`, `currency text null` — academy form's real price lands here (placeholder until then)
- `waiver_text text null`, `waiver_version integer null` — versioned so acceptance records pin what was agreed to
- timestamps

**`registration_responses`** — one row per submission:

- `id uuid pk`, `club_id`, `form_id` (composite FK carrying `club_id`)
- Shared fields: `player_first_name`, `player_last_name`, `player_dob date`, `parent_guardian_name`, `parent_guardian_email`, `parent_guardian_phone`, `notes text null`
- General-interest-only: `interest_area text null` (e.g. age group / program interest)
- Academy-only: `waiver_accepted_at timestamptz null`, `waiver_version_accepted integer null` (both required-at-submit for `academy_registration`, enforced by check constraint + server validation)
- Payment linkage (academy only): `payment_status text check in ('not_required','pending','paid','failed') default 'not_required'`, `stripe_checkout_session_id text null`, `stripe_payment_intent_id text null`, `amount_paid_cents integer null`, `paid_at timestamptz null`
- `submitted_at`, standard timestamps

RLS: anonymous **insert-only** into `registration_responses` for forms whose `status='live'` on a club whose runtime access permits it; no anonymous read, ever (this is minors' PII — same never-public class as memberships/subscriptions). Reads: active club members of that club, and operator. Public submission goes through a validated server route (Zod, tenant from verified host, honeypot/rate-limit), with RLS as the backstop per the platform's server-mutation-boundary rules.

Admin surface: a new **Responses** page (`app/admin/(protected)/responses/`), listed per form, gated by a new `registrations` module in `moduleRegistry` that only `crest@1` declares in `supportedModules` initially — same mechanism that keeps Programs off `editorial@1`.

## Stripe Connect plan

**Model (locked): Stripe Connect Standard account, direct charges, 100% of funds to the club.** Onzio takes no fee, never touches money; the club owns its Stripe Dashboard, disputes, refunds, and tax reporting. Concretely:

- **Onboarding:** Stripe-hosted Standard OAuth flow from an operator-initiated link; store the resulting account id in a new `clubs.stripe_connect_account_id text null` (distinct from the existing platform-billing `club_subscriptions` machinery — connected-account payments and Onzio's own subscription billing must never share columns or code paths). Track readiness by reading `charges_enabled`/`details_submitted` from the account object at time of use; connect-account states surfaced in admin: *not connected → onboarding started → charges enabled → disabled/restricted*.
- **Charge flow:** server creates a Checkout Session **directly on the connected account** (`Stripe-Account: acct_...` header), `mode: 'payment'`, price from `registration_forms.price_cents`, `metadata: { onzio_club_id, onzio_environment, form_id, response_id }`. **No `application_fee_amount`, no transfers, no Express/Custom.** Card entry never happens inside Onzio — Stripe Checkout only (existing platform-wide rule). Flow: response row is inserted `payment_status='pending'` → redirect to Checkout → webhook (`checkout.session.completed` on connected account, via a Connect webhook endpoint reusing the platform's signature-verification/idempotency-ledger discipline) marks `paid` → success/cancel pages on the tenant domain.
- **Test-mode-until-signed enforcement (mechanism, not policy):** new operator-only column `clubs.payments_live_enabled boolean not null default false` (set only via operator TOTP tooling, like `store_enabled`'s operator-only precedent). The shared Connect runtime config exposes exactly one secret per mode (`STRIPE_CONNECT_TEST_SECRET_KEY`; the live variable simply **is not configured anywhere** in this phase) and the session-creation code path refuses to construct a live-mode client unless `payments_live_enabled=true` **and** the live key exists — belt (no live key deployed) and suspenders (flag default-false, operator-only). A contract test asserts a `payments_live_enabled=false` club can never produce a live-mode Checkout Session. Flipping the flag + configuring the live key is a named post-signature checkpoint that only Christian executes.

## Google Sheets export plan

One-way export, not a sync, not a source of truth. The admin Responses view gets an **"Export CSV"** button per form (and per-form-filtered): operator/member clicks → server route re-authorizes (membership/operator + tenant), streams a CSV of that form's responses (all fields above incl. payment status; UTF-8, header row, ISO dates) → Christian opens/imports it in Google Sheets ("Export to Sheets" is exactly this file). No Google API credentials, no service accounts, no background jobs, no drift. Export is on-demand only, triggered by a human click, and is how Christian hands data to the owner pre-signature.

## Access control plan

- Pre-signature: **no CV United `club_members` rows at all.** Christian operates via existing operator tooling (TOTP/AAL2) and the authenticated-preview tenant; he alone views/exports responses and relays them to the owner off-platform.
- The gate lifts on exactly one event: **Christian confirms the contract is signed.** Then, mirroring MLA/DCFC: `lib/operator/invite-club-member.ts` invites the owner as `owner` (email-code auth, no password), `kind` flips `test → customer` via operator tooling, and the standard lifecycle/billing path takes over. Until that event, any request to add CV United logins is declined by plan.

## Placeholder-vs-real-content gating plan

Mechanism is the `registration_forms.status` flag plus provenance, not ad-hoc hiding:

- **General Interest form: seeded `status='live'`.** Real submissions accepted from day one of the preview tenant.
- **Academy Team Registration form: seeded `status='draft'`.** Draft behavior: `/join/academy` renders a "registration opening soon" panel for regular viewers and the full form only in an explicit admin/operator preview mode; the submission route hard-rejects (`404`/`409`) any POST to a non-`live` form regardless of what the client renders — the server check is the gate, the UI is courtesy. Stripe test checkouts against the draft form are exercised only via operator preview.
- **Flip-to-live checklist (Christian executes, in order):** real price in `price_cents` (replacing placeholder), real club-approved waiver in `waiver_text` + `waiver_version` bump, placeholder copy/assets on the Join surfaces replaced (platform provenance rule already prohibits `sample`/`unresolved` reaching production surfaces — reuse it), then `status='live'`. Note this flip is independent of the Stripe live-mode flip: academy registration can go `live` while payments are still test-mode **only if** Christian explicitly wants dry-run signups; default assumption is both flips happen together post-signature.
- Site-wide placeholders (crest, colors, roster, schedule, pricing) follow the existing provenance system — entered as `sample` now, swapped by Christian when the owner delivers assets after the phone call.

## Explicit non-goals — do not build yet

- **No live Stripe keys, anywhere, for any reason**, until Christian's explicit contract-signed confirmation.
- **No CV United owner/admin login or invite** pre-signature.
- **No generic multi-block form builder.** Two typed forms only; the phase-3a/3b generalization is a later, DCFC-motivated project that this schema should not preclude but must not attempt.
- **No Google Sheets API integration** — CSV export only.
- **No public launch machinery:** no domain purchase/attachment, no `public_access` change, no search indexing, no production content import beyond seed/placeholder.
- **Do not touch `pathway@1`/MLA code** (`~/Downloads/onzio-platform-mla`, branch `claude/mla-pathway`) — `crest@1` borrows the design language by reimplementation in its own `crest.*` scope, never by editing or coupling to pathway files.
- **No Onzio platform fee/cut in Connect** — do not add `application_fee_amount` "while we're in there."
- No roster/schedule/route rebuilds — reuse shared routes.

## Open items blocking real launch (tracked, not blocking the build)

1. **Signed contract** — Christian still has to draft it; owner is verbally committed. Gates: owner invite, `kind=customer`, live Stripe, public access.
2. **Real assets from the owner** (post phone call, expected imminently): crest, colors (may tune the token table above), roster, schedule, photography, and kit/merch photos for the Shop page (`store_enabled=true`, route is live and gated correctly, but has no seeded kit-photo content yet — renders empty, not fabricated, until real photos exist).
3. **Real academy pricing** → `registration_forms.price_cents`.
4. **Real club-approved waiver/consent text** → `waiver_text`/`waiver_version`; academy form stays `draft` without it.
5. Stripe Standard onboarding requires the **owner** to complete Stripe-hosted KYC on their own account — post-signature step, cannot be done for them.

### Critical files for implementation

- `packages/presentation/index.ts` — `crest@1` registration, `crest.*` sections, `join` route, `registrations` module, font pack
- `app/(public)/club/about`, `app/(public)/roster`, `app/(public)/schedule`, `app/(public)/contact` — reused shared routes
- `app/(public)/join/` — new chooser + two form paths
- `app/admin/(protected)/responses/` — new admin Responses view + CSV export route
- `supabase/migrations/` — `registration_forms`, `registration_responses`, `clubs.stripe_connect_account_id`, `clubs.payments_live_enabled` (RLS in the creating migration, per platform rule)
- `docs/lions-fc-launch-plan.md`, MLA worktree precedent — provisioning/invite/staging sequencing models
