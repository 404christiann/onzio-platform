# Lions FC: Local UI Done → Live in Production

Working branch: `codex/lions-editorial-diversecity-v2` (currently checked out, only `HANDOFF.md` modified/uncommitted). All Phase 1 work lands here. DCFC (`academy@1`) must be bit-for-bit unaffected.

## Phase 0 — Pre-flight (30 min)

1. Commit or stash the pending `HANDOFF.md` change so Phase 1 diffs are clean.
2. Baseline: `npx tsc --noEmit`, then full local suite (`npm test` with local Supabase up, per repo convention). Record pass state — every later step diffs against this.
3. Confirm the gating source of truth is available where needed: `club.presentationTemplateKey` is already on `ClubContext` (`lib/club-context.ts` line 25) and `AdminShell` already calls `useClubContext()` — no plumbing work required anywhere.

## Phase 1 — Template-scoped admin hides for `editorial@1`

**Mechanism (uniform across all items):** per-page `const isEditorial = club.presentationTemplateKey === "editorial@1";` mirroring the existing `isAcademy` convention, each with a short why-comment in the style of the existing ones (see sponsors page lines 82–86, roster lines 1058–1064). Template-keyed, never tenant-ID-keyed. Where a surface should be hidden for *both* templates, prefer a single named boolean (e.g. `hidesSponsorFields = isAcademy || isEditorial`) over stacked negations.

### 1A. Page-level hides (nav item + route guard — nav hiding alone doesn't block direct URLs)

1. **Programs** — in `components/AdminShell.tsx`, extend the `navItems` filter (~line 329, currently only `ownerOnly`/`isBillingAdmin`) to drop `/admin/programs`, `/admin/about`, and `/admin/analytics` when `club.presentationTemplateKey === "editorial@1"`. The grouped-nav renderer already tolerates missing items (`visibleNavItem()` returns undefined and children are filtered), so groups self-heal.
2. **Programs page guard** — `app/admin/(protected)/programs/page.tsx`: early return/redirect to `/admin` for `editorial@1` (Programs is absent from editorial@1's `supportedModules` in `packages/presentation/index.ts` line 714).
3. **About page guard** — same treatment in `app/admin/(protected)/about/page.tsx` (Lions' `lionsNavLinks` in `components/Nav.tsx` already omits `/club/about`; the admin page is orphaned for Lions).
4. **Analytics page guard** — same treatment in `app/admin/(protected)/analytics/page.tsx`. Per Christian's call: template-gate it for `editorial@1` regardless of the dormant entitlement flag; leave the entitlement machinery untouched.

### 1B. Tab-level hides

5. **Homepage "Behind the Rose" tab** — `app/admin/(protected)/homepage/page.tsx`: filter `"behind"` out of `ADMIN_TAB_ORDER` (line 53) for `editorial@1` and skip its load/save wiring for that template (no `academy.behind-the-rose`-equivalent in editorial@1's `supportedSections`, line 711).
6. **Sponsors "Footer placement" tab** — `app/admin/(protected)/sponsors/page.tsx`: the exact hide already exists for `isAcademy` (line 87 + tab render ~line 346, pinned to carousel). Rename/extend the gate to cover `editorial@1` too. Carousel tab stays — it feeds `components/editorial/EditorialSponsorCarousel.tsx`.
7. **Shop "Photo Row" + "Purchase" tabs** — `app/admin/(protected)/shop/page.tsx`: filter `"photoStrip"` and `"purchase"` from `ADMIN_TAB_ORDER` (line 122) for `editorial@1`; keep `"content"` and `"kit"` (kit-variant photo management, `VARIANT_ORDER` home/away/third, untouched).

### 1C. Field-level hides (extend existing `isAcademy` gates to also cover editorial)

8. **Contact hero image** — `app/admin/(protected)/contact/page.tsx`: hero field renders under `{!isAcademy && (...)}` (line 429). Change to hide for editorial too (hero ends up hidden for both live templates; keep the gate expressed as template checks, not "always hidden," so future templates keep it).
9. **Schedule sponsor fields** — `app/admin/(protected)/schedule/page.tsx`: `isAcademy` at lines 126 and 570 gates `carrySponsorFromLatestMatch` (line 128), sponsor logo display (line 505), and the sponsor form block (line 697). Extend all to editorial.
10. **Tryouts program-association + per-tryout hero fields** — `app/admin/(protected)/tryouts/page.tsx`: fields render under `{!isAcademy && (...)}` at lines 584 and 642 (gate defined line 63; confirmed `components/editorial/EditorialTryouts.tsx` renders neither). Extend the hide to editorial. Everything else on the Tryouts page (dates, registration link, etc.) stays fully functional — this is a partial-field hide.
11. **Roster inline season-stat panel** — `app/admin/(protected)/roster/page.tsx`: `hidesInlineSeasonStats` at line 1064–65. Extend to editorial. No staff work needed — Staff is already a tab (`ROSTER_TAB_ORDER = ["players", "staff"]`, line 106) wired to the `staff` table.

### 1D. Shop-visibility toggle — mostly already built

`clubs.store_enabled` already exists (migration `supabase/migrations/20260812120200_club_store_enabled.sql`): `EditorialHomeStore.tsx` returns null when off, `app/(public)/shop/page.tsx` 404s (line 35), header/footer nav omit the link, and contracts cover it (`tests/contracts/editorial-store.test.ts`, `editorial-home.test.ts`, `tests/database/schema-rls.test.ts`). **Remaining delta only:** the column is deliberately operator-only (set via SQL/script, per its comment). If Christian wants a Lions-facing admin control, add a small toggle to the Shop admin page's `"content"` tab, rendered only for `editorial@1`, writing `clubs.store_enabled` through an owner-authorized route — narrowly scoped, with a code comment flagging that platform-wide generalization is deliberately out of scope. **Checkpoint: confirm with Christian whether operator-only is sufficient for launch (zero code) or the admin control is wanted (small build).** Lions' import row must set the intended initial value either way.

### 1E. Verification

- New contract test, e.g. `tests/contracts/editorial-admin-surface.test.ts`, following the existing per-feature contract pattern: for **every** hide above, assert (a) hidden/guarded under `editorial@1` and (b) **unchanged under `academy@1`** — the DCFC-regression half is mandatory per item, not optional.
- `npx tsc --noEmit` + full local suite (`npm test`, `npm run test:contracts`, `npm run test:db` with local Supabase) green before calling Phase 1 done.
- Sync to Lions staging (`lions-onzio-staging.vercel.app`, existing active staging tenant) via the established staging deploy path; re-run `npm run migration:import:lions-media:staging` only if content changed.
- **Checkpoint: Christian's visual review on staging — admin nav, each hidden tab/field, and the DCFC staging admin spot-checked for no regressions — before any Phase 2 step.**

**What could go wrong (Phase 1):** (a) cross-tenant bleed of the kind behind the "Rose City FC hero flash" bug (HANDOFF.md ~line 1128) — any hide that touches shared components must be verified on a DCFC context, not just Lions; (b) tab-filtering pages (`homepage`, `shop`) index into `ADMIN_TAB_ORDER` for slide direction — filtering the array can desync saved-tab state if a removed tab was persisted/active, so filter at the source array, not at render; (c) the tryouts gate is inverted-sense (`!isAcademy` = show) — a sign flip there silently *exposes* fields on DCFC, which is exactly what the academy-side contract assertions exist to catch.

## Phase 2 — Production go-live (mirror DCFC's launch: bare Vercel alias first, real domain later)

Precedent: HANDOFF.md entries `DCFC-801` (~line 2796/2828), `DCFC-802` (~line 2755), `clubs.kind gap fixed` (~line 2782), "Diverse City FC is publicly live" (~line 1007), and `docs/phase-11/diverse-city/PRODUCTION-CUTOVER-ROLLBACK.md`.

**Hard rule for the whole phase:** no agent performs or simulates production DB writes, Stripe live mutations, Vercel production deploys, or domain operations. Agents may prepare scripts, dry-run plans, and checklists; Christian executes every hosted mutation himself with his operator TOTP (`npm run operator:enroll-totp` tooling already in place), granting explicit real-time approval per step — same discipline the DCFC HANDOFF entries record ("no commit, push, deployment, hosted Supabase write, Stripe mutation... was performed" until authorized).

1. **Provision production tenant** — Christian runs the operator provisioning flow (`lib/operator/provision-club.ts`, precedent `scripts/provision-diverse-city-production.ts` → write a `provision-lions-production.ts` sibling for him to review first). Must pass explicit `kind: "customer"` (provisionClub now requires it — the "clubs.kind gap fixed" lesson), `lifecycle=onboarding`, `public_access=preview`, template `editorial@1`, and the intended `store_enabled` value. **Checkpoint: Christian runs it.**
2. **Migrations + redeploy, back to back** — apply pending production migrations (includes at minimum the three `20260812*` editorial/Lions migrations) then `vercel deploy --prod` in one window by one operator. DCFC's cutover doc documents why: `apply_stripe_projection` signature drift once made migration-without-deploy and deploy-without-migration *both* webhook-fatal. Diff pending migrations for any function-signature or schema/code coupling before scheduling; confirm a fresh physical backup timestamp first (no PITR — same constraint noted at DCFC-802). **Checkpoint: Christian executes the window.**
3. **Content/media import** — write `scripts/import-lions-production.ts` modeled on `scripts/import-diverse-city-production.ts` and the existing `scripts/import-lions-media-staging.ts` (which already reuses `lib/migration/lions-media-local-import.ts` — same safety rails: plan/confirm flags, idempotent re-run). Include the `accent_color: "#F0F0F0"` row already pinned in the importer contract. Dry-run plan output reviewed, then **Checkpoint: Christian executes.**
4. **Attach temporary Vercel alias** — `lib/operator/attach-club-domain.ts` (precedent `scripts/attach-diversecityfc-domain-production.ts`), pointed at a `.vercel.app` alias (name TBD by Christian, e.g. `lions-onzio.vercel.app`). Explicitly flagged: swapping to the real purchased domain later is the same script with a new hostname — a small, well-precedented follow-up, not a launch blocker and not a re-architecture. DCFC launched on `onzio-platform.vercel.app` first, real domain later.
5. **Invite the real Lions owner** — `lib/operator/invite-club-member.ts` as `owner` (precedent `scripts/invite-diverse-city-owner-production.ts`). **Checkpoint: Christian runs it.**
6. **Real Stripe Checkout by the Lions contact** — existing $65/mo price, already configured; no new Stripe product/price work. Checkout completion drives `apply_stripe_projection`, flipping `lifecycle=active` / `public_access=live`. **This step belongs exclusively to the real Lions FC contact — neither Christian nor any agent attempts, simulates, or test-mode-substitutes this checkout.**
7. **Same-day verification sweep** (mirror DCFC's post-launch list):
   - `npm run stripe:verify-portal-config` against Production — the exact env gap (`STRIPE_PORTAL_CONFIGURATION_ID` set in Preview but not Production) that broke DCFC's "Manage billing" live (HANDOFF.md ~line 1160); confirm webhook env vars alongside.
   - Cross-tenant bleed check: load DCFC's production site and Lions' alias in parallel; verify no branding/content leakage either direction (Rose City hero-flash class of bug).
   - Admin at the new hostname: login works; all Phase 1 hides render correctly (no Programs/About/Analytics nav, correct tabs/fields).
   - Public site end to end at the alias, including one image-upload round-trip in admin — the sharp/libvips file-tracing crash (HANDOFF.md ~line 1431) was a deploy-environment failure invisible locally; media routes are the canary.
   - Anonymous visitor loads the public site — DCFC's staging history includes a clean-import-but-anonymous-404 failure mode (HANDOFF.md ~line 853); verify the domain row/public-access path, not just authed views.

**What could go wrong (Phase 2):** migration/deploy coupling gap (webhook downtime window — keep it ~90s like DCFC's, watch Stripe retries); portal-config/webhook env vars scoped to the wrong Vercel environment; anonymous-404 despite clean import; sharp/libvips crash on first production media touch; provisioning without explicit `kind=customer`.

### Critical Files for Implementation
- `components/AdminShell.tsx`
- `lib/club-context.ts`
- `app/admin/(protected)/shop/page.tsx`
- `scripts/import-diverse-city-production.ts` (model for the Lions production import script)
- `docs/phase-11/diverse-city/PRODUCTION-CUTOVER-ROLLBACK.md` (Phase 2 sequencing template)
