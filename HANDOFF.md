# Onzio Platform Handoff

Last updated: 2026-08-03

## PLAT-102 review — two follow-ups before push

Agent: Claude Code (Opus 5), 2026-08-03. Review only; no code, schema, or test
changed. Hosted-mutation count: zero.

**Do not push. The suite is red.**

**1. Architecture contract failing.** `tests/architecture/platform-architecture.test.ts
> hardens every security-definer function` fails 35 vs 33. **Not a security
hole** — a live-schema query confirms every `security definer` function in
`onzio` and `onzio_private` carries an empty `search_path`. The cause is
`20260803...plat_102_function_search_paths.sql` hardening two functions with
`alter function … set search_path = ''`, which the contract's text-count model
adds to one side only. Note the commit's claim of passing architecture tests
does not reproduce. **Do not fix by loosening `toBe` to
`toBeGreaterThanOrEqual`** — that blinds the contract to a definer function with
no `search_path` at all, which `AGENTS.md` forbids. Fix by parsing per function
and accounting for `ALTER FUNCTION`, or by re-declaring the two functions with
`create or replace`.

**2. `PLAT-D024` accepted — club admins keep editing during grace.** `PLAT-102`
shipped `can_mutate_content` requiring `public_access = 'live'` for `customer`
clubs, so a club in grace kept its public site, login, read access, and billing
route but lost all content editing for up to 20 days. No decision authorised
that. It needs a new migration admitting `public_access in ('live','grace')`,
plus a test pinning the behaviour. The `PLAT-102` migration is already applied
to staging, so this is additive and its staging application needs its own
approval.

The decisive reason, worth carrying forward: **`PLAT-D006`'s kill switch does
not reach grace-keyed behaviour.** `LIFECYCLE_SUSPENSION_ENABLED` gates only the
cron's grace→suspended write, while the edit lock keys off `public_access =
'grace'`, which the webhook sets. A scope note is now attached to the
`PLAT-D006` risk row; any future grace-keyed restriction must either be covered
by the switch or accepted as a separate risk.

**Verified good in the same review**, so nobody re-does it: zero policy churn
(`PLAT-D018` landed exactly as designed, all 115 policies untouched); two
independent fail-closed lifecycle flags (`PLAT-D020`); heartbeat required,
HTTPS-only, and correctly not extended to `media-cleanup` (`PLAT-D022`); every
tier helper deleted; no secret and no live Price in code; and the separately
approved staging application stopped safely when Rose City was absent.

## PLAT-102 local implementation complete — stop at hosted release gate

Agent: Codex, 2026-08-03. Status: `in_progress`.

After the first pre-mutation baseline found Rose City absent, Christian
explicitly approved that absence as a no-op and revised the guard to exactly
Alpha, Bravo, and Diverse City. Migration
`20260804024349_plat_102_billing_entitlement.sql` is now applied only to
Supabase staging project `fxefqnoqxbezeccjvrsw`. One fail-closed transactional
backfill set Alpha/Bravo to `test` with no Price and Diverse City to `customer`
with the approved test Price; Rose City remains absent and uncreated. Exactly
three sanitized backfill audits exist. Remote migration history and independent
read-only reconciliation match.

The post-apply Supabase security advisor found mutable `search_path` warnings
on the two new exposed-schema service-role RPC wrappers. Their bodies use fully
qualified names and anon/authenticated cannot execute them, but the warning is
valid. Christian separately approved follow-up migration
`20260804035147_plat_102_function_search_paths.sql`; it is now applied to exact
staging and reconciled. Both public and private RPCs have empty pinned paths,
and the exposed wrappers remain denied to anon/authenticated and allowed to
service role. The advisor now reports no PLAT-102 function warning. Hosted Auth
advisor warnings for the accepted 24-hour email-code expiry and irrelevant
leaked-password protection remain unchanged; do not mutate Auth under PLAT-102.

Christian approved PLAT-102 locally for exact Supabase staging project
`fxefqnoqxbezeccjvrsw`, protected Vercel Preview project
`prj_I362ysmh9cse5cRxnL7db4dOhsEs`, and the existing Stripe test-mode account.
The local package is implemented and verified. No push, deployment, Stripe
mutation API, Resend configuration, production, live Stripe, Auth, DNS,
Storage, public-access, tenant-content, teams, PLAT-103, DCFC-601, or DCFC-602
work was performed beyond the exact approved staging migration and three-club
backfill recorded above.

Implemented: tier-free authorization with zero policy churn; `clubs.kind` and
per-club `stripe_price_id`; server-owned Checkout Price; arbitrary canonical
webhook Price projection with no tier write; constrained Portal sessions;
20-day grace with day-7/day-17 warning audits; independent suspension and
reconciliation flags; exception-only reconciliation; lifecycle heartbeat;
guarded exact staging backfill; and local signed, sanitized, append-only Resend
delivery monitoring. The hosted Resend webhook remains unconfigured and needs
separate approval.

Local evidence: clean migration reset passed; PLAT-102 database contracts 7/7;
complete database suite 82/82; contracts 325/325; architecture 20/20; complete
loopback suite 658/658 across 75 files; TypeScript and generated database-type
drift checks passed; `onzio` and `onzio_private` schema lint found no errors;
the production build passed; `git diff --check` passed. Lint passed with only
the three pre-existing Analytics hook dependency warnings.

Exact next step: the staging database gate is complete and Christian approved
the local PLAT-102 commit. The commit containing this handoff is the package
boundary; read its exact SHA from Git, then obtain a separate exact-SHA Git
push/protected Preview approval. Do not rerun either migration or the backfill,
deploy manually, configure Resend, change Auth, or call Stripe APIs yet.

## Historical PLAT-102 readiness snapshot — superseded

This section records the pre-approval input state. PLAT-102 was subsequently
approved and its current status is the release-gate block above; do not treat
the historical approval instruction here as the next step.

**Stripe.** Use the **test** Price `price_1U0Y0sK6WajTkwHYnnttR9nN` and **never**
the live `price_1TwbmvK6WajTkwHYueLvjhv5` — `PLAT-102`'s prohibited actions
forbid live-mode Stripe operations. The live Price is the value
`clubs.stripe_price_id` takes later at `DCFC-901`, not now.

**Price is $75/month, not $65.** `PLAT-D008`'s figure is superseded by
`DCFC-D119`; its no-trial and no-`trialing` provisions still stand.

**Decisions this package implements**, all accepted and recorded in
`docs/phase-12/DECISIONS.md`:

- `PLAT-D018` — delete `club_has_feature` by collapsing `can_read_feature` →
  `can_read_club` and `can_mutate_feature` → `can_mutate_content`, keeping the
  unused feature parameter as the re-tiering seam. **Zero policy churn** — all
  115 policies across 29 tables stay as written. Do not rewrite them.
- `PLAT-D004` — `clubs.kind` backfill: Diverse City `customer`, Rose City
  `demo`, Alpha and Bravo `test`. Only `customer` requires a subscription.
- `PLAT-D007` — `grace_ends_at = paid_through + 20 days`; warnings at **day 7
  and day 17** (settled 2026-08-03).
- `PLAT-D019` / `PLAT-D020` — reconciliation folded into the daily lifecycle
  cron, exception-only, with **two independent flags** so the `PLAT-D006` kill
  switch stops the suspension write without stopping reconciliation.
- `PLAT-D022` — heartbeat/dead-man's-switch on the cron. **Do not** extend it
  to `/api/cron/media-cleanup`; that is outside this package's scope and needs
  its own widening.

**Resolved scope:** Christian included local bounce/failure monitoring code and
tests in PLAT-102. Hosted Resend webhook creation or configuration remains a
separate approval and was not performed.

## Latest Work — Five rollout decisions answered; Diverse City price now $75/month

Agent: Claude Code (Opus 5), 2026-08-03. Class 1, documentation only.
Hosted-mutation count: zero. No package started.

Christian answered the five rollout decisions carried since `DCFC-D118`. Full
records and rationale are in `docs/phase-11/diverse-city/DECISIONS.md`; the
`STATUS.md` completion record has the detail. Summary:

- **Onzio buys the club's domain and launches on it** (`DCFC-D112`). Onzio owns
  the registration and controls DNS. `DCFC-902` is therefore **on the launch
  critical path** — purchase, DNS propagation, Vercel verification, the
  production Auth redirect allowlist, and the tenant's verified primary
  `club_domains` row all precede `DCFC-903`. The exact domain and
  apex-versus-`www` are open as `DCFC-D123`, and the purchase is elapsed time
  rather than work, so it should start well ahead of `DCFC-902`.
- **One owner, no pre-provisioned admins** (`DCFC-D113`); the owner adds admins
  through the `PLAT-101` flow. Identity values stay outside Git.
- **7-day observation window**, Christian sole rollback authority (`DCFC-D116`).
- **`noindex` retained through launch** (`DCFC-D117`).
- **Price raised to $75/month** from $65 (`DCFC-D119`), the difference covering
  the domain Onzio will purchase.

**Three things the price change opened — read before `DCFC-901`:**

1. `PLAT-D008` is **superseded on price** and marked so in
   `docs/phase-12/DECISIONS.md`. Its no-trial and no-`trialing` provisions
   still stand.
2. **The live Price now exists** — `DCFC-D120` is resolved. Christian created
   `Diverse City FC Pro Plan`, Product `prod_UwUmEgeunaSPSI`, **$75/month, live
   mode, no trial, zero active subscriptions, MRR $0**. No subscription exists,
   so `DCFC-901` remains the owner-driven Checkout step. Three follow-ups are
   resolved: a matching **test-mode** Product and $75/month Price now exists
   too (`DCFC-D125`), satisfying `PLAT-102`'s required test-Price input. Two
   resolved along with `DCFC-D126` — both Price IDs are recorded: **live
   `price_1TwbmvK6WajTkwHYueLvjhv5`** for `clubs.stripe_price_id` at
   `DCFC-901`, **test `price_1U0Y0sK6WajTkwHYnnttR9nN`** for `PLAT-102`'s
   rehearsal. `PLAT-102` must read the test Price and never the live one.
   One follow-up remains: stripping tier language from **both** Products'
   name and description before the first invoice (`DCFC-D124`). The
   description reads "Everything in Starter, plus…", which describes the tier
   model `PLAT-102` deletes, on an artifact customers see on invoices and in
   the Portal.
3. **The domain ships at launch**, so there is no billing-versus-delivery gap.
   Domain ownership on termination is still unpinned — open as `DCFC-D122`.

Exact next step: approve `PLAT-102` — the last substantial build — and settle
`DCFC-D120`.

## Latest Work — PLAT-101 local implementation and approved staging boundary

Agent: Codex, 2026-08-03. Christian approved `PLAT-101` for exact Supabase
staging project `fxefqnoqxbezeccjvrsw`. The package is **complete** with two
explicitly accepted delivery-evidence waivers: Yahoo delivery passed, while
AOL and ISP-hosted delivery were waived and were not tested or passed. Local
implementation, the approved staging schema/Auth boundary, and hosted
acceptance are complete. Exact commit `457280b` is now pushed to
`origin/staging`; its Git-triggered protected Preview
`dpl_GNkG2FYHNciomriQ3YtGkPyqzT8N` is `READY`, targets Preview, and returns the
expected Vercel SSO redirect with `noindex`. The approved operator identity is
in governed break-glass recovery: its prior sessions and sole inaccessible TOTP
factor are revoked, and
two replacement attempts safely rolled back after exposing a local SVG
data-URL handling gap. The helper now uses Supabase's QR data URL directly in a
private temporary viewer; Christian's third private run enrolled and verified
exactly one replacement factor at AAL2. The guarded operator acceptance verifier
then proved AAL1 refusal, fresh-AAL2 acceptance, and acceptance-session
revocation; exactly one sanitized system recovery audit was appended and read
back. Operator recovery and hosted operator acceptance are complete. Hosted
owner, Yahoo, and operator acceptance pass. The approved unknown-address
negative request also passed: the UI showed the explicit no-account state,
Auth rejected the request with `otp_disabled`, and digest-only reconciliation
proved zero matching Auth users, sessions, or refresh tokens and no delivery.
Read-only reconciliation had found that the
sole active Alpha owner still maps to the synthetic, non-deliverable Phase 7
`example.com` identity, so owner acceptance requires a separately approved
ownership transfer to a real staging mailbox. Christian approved and completed
that exact transfer to the existing configured operator identity after fresh
private AAL2 proof; reconciliation confirms exactly one active target owner,
both Auth identities retained, and exactly one sanitized transfer audit.
The protected Alpha alias was corrected
under separate exact approval and now serves the PLAT-101 passwordless Preview.
Final hosted reconciliation shows exactly one active Alpha owner, two active
admins, one verified operator TOTP factor, one ownership-transfer audit, and
zero remaining acceptance-user sessions or refresh tokens. No `PLAT-101` work
remains. Do not start `PLAT-102`, `DCFC-601`, or `DCFC-602` without fresh exact
approval, and do not extend the media-cleanup heartbeat.

### Next agent — start here

Read `docs/phase-12/DECISIONS.md` before the plan; it governs disagreements.
Do not reintroduce password recovery, owner/admin MFA, per-role Supabase session
configuration, caller-supplied operator actor IDs, or direct
`club_has_feature` policy churn. The implemented model is:

- club owners/admins sign in with a six-digit email code at AAL1; no
  self-service signup and no password path;
- club sessions expire in app authorization and RLS 30 days after the earliest
  valid JWT AMR timestamp;
- operators authenticate interactively, must be allowlisted by verified JWT
  `sub`, must be AAL2, and must present a TOTP AMR entry no older than two hours;
- owners may add/remove `admin` memberships only; ownership transfer remains an
  operator action.

Key implementation: `lib/auth-session.ts`, `lib/operator/shared.ts`,
`scripts/operator-session.ts`, `lib/owner-admin-membership.ts`,
`app/api/admin/members/route.ts`, `app/admin/(protected)/members/page.tsx`,
`supabase/migrations/20260803192838_plat_101_admin_auth_simplification.sql`,
`supabase/migrations/20260803192943_plat_101_club_members_initplan.sql`, and
`docs/phase-12/PLAT-101-ROLLBACK.sql`. Club password recovery/update pages,
their tests, the old operator MFA-recovery module, and the old hosted
password/MFA scripts were deleted.

Local verification is green: clean reset; real OTP delivery/verification and
unknown-user noncreation; rollback then forward restoration; 316/316 contracts,
20/20 architecture, 81/81 database, 672/672 full tests across 71 files, 2/2
desktop/mobile Playwright scenarios, TypeScript, generated types, database lint,
and production build. The three existing analytics exhaustive-deps warnings are
unchanged.

**Manual-acceptance follow-up, 2026-08-03:** Christian confirmed the complete
owner → add admin → admin email-code sign-in flow works. He then found the
add → remove → immediate re-add edge case returned the internal
`AUTH_CODE_DELIVERY_FAILED` as HTTP 403. A disposable local Auth probe proved
the cause: Supabase returns `over_email_send_rate_limit`, HTTP 429, with 59
seconds remaining because `auth.email.max_frequency` is one minute. The owner
membership workflow now maps that provider response to
`AUTH_CODE_RATE_LIMITED`; the route returns 429; and Team access shows a
friendly one-minute retry message instead of an internal code. The membership
continues to roll back to `removed` until delivery succeeds, preventing an old
session from silently regaining access. Regression coverage proves the same
Auth identity can be reactivated and that a cooldown failure leaves it removed.
Final verification after the fix: 314/314 contracts, 669/669 full tests,
TypeScript clean, and production build green with only the three pre-existing
analytics exhaustive-deps warnings. No hosted mutation or push.

**Admin-navigation scroll follow-up, 2026-08-03:** Christian found that the
admin sidebar could not be scrolled reliably. The desktop breakpoint had
removed the sidebar's viewport height constraint, so the navigation region had
no bounded area in which to scroll. The shell now remains viewport-height and
sticky on desktop, clips overflow at the shell boundary, and gives the
navigation region its own keyboard-focusable, touch-pan-enabled scroll area
with stable scrollbar space. Christian's visual follow-up showed the native
bright scrollbar track overwhelmed the dark navigation. It is now a 6px
translucent thumb on a transparent track, with stronger hover/focus feedback
and no white gutter. The original red-first contract failed 2/3 checks before
the scroll fix and passed 3/3 afterward; a second styling contract failed 1/4
before the refinement and passes 4/4 afterward. The real local email-code
owner/admin browser journey passes 2/2 at 1440×900 and 390×844, including
assertions that the nav is taller than its viewport and that its scroll
position advances; the resulting desktop/mobile screenshots were inspected.
Final verification is 670/670 full tests across 71 files, clean TypeScript, and
`git diff --check`. The local application was restarted cleanly at
`http://alpha.localhost:3000/admin` after a stale `.next` development-server
artifact was identified. No hosted mutation, commit, or push.

**New-admin cooldown UX follow-up, 2026-08-03:** Retain Supabase's one-minute
per-address OTP cooldown as the documented abuse control, but do not make a
newly added administrator wait through it. Adding the administrator already
sends a valid code. If that administrator then uses the primary “Send sign-in
code” action inside the cooldown, the login page now recognizes the exact
`over_email_send_rate_limit` response, advances directly to code entry, and
explains that the existing emailed code can be used immediately; Supabase's raw
“For security purposes” message is no longer exposed. This does not alter the
separate remove → immediate re-add rule: membership reactivation still waits
for a successful delivery so an old session cannot regain access silently. A
red-first contract failed 1/11 before the login behavior existed and passes
11/11 afterward. The isolated real local owner/admin browser journey passes
2/2, explicitly observes one `/auth/v1/otp` 429, and completes sign-in with the
original onboarding code. Final verification is 671/671 across 71 files and
clean TypeScript. No Auth configuration, hosted mutation, commit, or push.

**Operator TOTP enrollment-helper follow-up, 2026-08-03:** The previously
documented `npm run operator:enroll-totp` command did not yet exist when
Christian first tried it. The repository now provides the guarded interactive
helper in `scripts/enroll-operator-totp.ts`. Christian's first approved private
run stopped before client creation because `.env.local` correctly targets the
local Supabase stack rather than hosted staging; it sent no email and created
no session or factor. The helper now pins the client URL to exact staging
project `fxefqnoqxbezeccjvrsw`, requires an interactive TTY and typed project
confirmation, then reads `ONZIO_OPERATOR_SUPABASE_PUBLISHABLE_KEY` or privately
prompts for staging's low-privilege Publishable key. It accepts a verified
legacy `anon` key for compatibility and rejects secret/service-role keys. It
also supplies the repository's pinned `ws` package as Supabase Realtime's
transport, which Supabase now requires when constructing a client under Node.js
below 22. Christian's next private attempt had stopped at that Node 20 transport
guard after the publishable-key prompt and before the operator-email prompt;
again, no Auth request or hosted mutation occurred. It then signs in with a
six-digit email code, binds the verified JWT user to
`ONZIO_STAGING_OPERATOR_USER_IDS`, refuses existing verified or unresolved
unverified TOTP state, stores the enrollment QR only in a mode-0600 temporary
file, opens it locally on macOS, verifies exactly one factor and AAL2, signs out,
and removes the temporary file. It never uses the service-role key. Red-first
contract checks failed before both the original helper and the local-environment
correction; the focused file passes 12/12 and TypeScript passes. A real TTY
smoke reached the exact-project prompt and deliberately cancelled there. The
complete loopback-backed suite passes 672/672 across 71 files and
`git diff --check` passes. A second real TTY smoke with a deliberately invalid
dummy publishable-format value reached the operator-email prompt under Node 20
and was aborted before any request. The approved enrollment is still pending
Christian's private rerun: zero staging email, Auth session, factor, or other
hosted mutation occurred in the stopped attempts.

**Operator identity correction, 2026-08-03:** Christian explicitly approved one
existing staging Auth user as the Onzio operator for Supabase/Vercel staging.
The prior `.env.local` allowlist entry belonged to the local-only test operator
and had no matching user in hosted staging, so neither that address nor the
newly selected hosted account could pass the helper's allowlist check. A
targeted read confirmed exactly one active hosted Auth user for the approved
address. The helper now reads a separate, ignored
`ONZIO_STAGING_OPERATOR_USER_IDS` value so the local test operator remains
intact. Vercel's existing sensitive `ONZIO_OPERATOR_USER_IDS` variable was
updated only for Preview branch `staging`; no deploy was triggered. Vercel
intentionally does not return sensitive values (`decrypted: false`, empty via
`env run`), so hosted evidence is the successful single-variable PATCH plus
exact key/Preview/branch/sensitive scope and a fresh update timestamp. No email,
session, or TOTP factor was created during this correction. The private
enrollment rerun then authenticated the approved account and found a verified
TOTP factor already present, so it correctly added nothing. A targeted aggregate
confirmed exactly one verified TOTP factor, zero unresolved TOTP factors, and
zero other factors. The TOTP requirement is satisfied. No email address, UUID,
key, code, token, or factor identifier is recorded here.

**Pre-push reconciliation and hardening, 2026-08-03:** The Phase 11 status
summary, package ledger, and staging-acceptance amendment now agree with this
handoff: operator TOTP enrollment is complete, while hosted application,
fresh-AAL2 operator, and Yahoo/AOL/ISP delivery acceptance remain open.
`docs/phase-12/OPERATOR-TOTP-RECOVERY.md` governs approval-gated break-glass
recovery for the sole operator without restoring the deleted club-member MFA
workflow. The phase plan now states the implemented boundary accurately:
`is_aal2()` has zero live exposed-policy callers and is retained only for the
reviewed rollback; service-role operator functions enforce AAL2 in
`assertOperator()`.

`verifyAccessTokenClaims()` now accepts only claims returned by Supabase
`getClaims()`. The custom fallback that retried every returned error through
`getUser()` and then locally decoded the JWT was removed; the pinned Supabase
client already performs Auth-server verification when a project uses symmetric
signing. A red-first focused regression failed on the old fallback and passes
after the change. Final local evidence is 14/14 focused platform-auth tests,
319/319 contracts, 20/20 architecture tests, 81/81 real loopback database
tests, 674/674 complete tests across 71 files, clean TypeScript, matching
generated database types, a green production build, and clean diff checks. The
three pre-existing Analytics exhaustive-deps warnings remain unchanged.

The seven unpublished PLAT-101 commits now carry rationale, verification, and
hosted-mutation bodies. Rewriting messages changed their hashes without changing
the final tree: `a797c60`, `62118dd`, `af26a8f`, `8bbc204`, `738a991`,
`46a25e6`, and `5f051b3` replace the former subject-only sequence. No remote ref
or hosted service changed.

**Approved push and protected deployment, 2026-08-03:** Christian explicitly
approved pushing exact commit `16b2a21f9d6c879846d184501361da7dccfc9ce0`
to `origin/staging` and the resulting protected Preview deployment, with no
later push and no production mutation. The fast-forward push advanced the remote
from `8e3cde2` to exactly `16b2a21`. Vercel project ID
`prj_I362ysmh9cse5cRxnL7db4dOhsEs` resolves to current project name
`onzio-rcfc`; deployment `dpl_54H3R35nnxpV7ERqw5ZGbvXLxmEF` is `READY`, targets
Preview, and serves exact Git SHA `16b2a21` at the protected deployment URL and
the `staging` branch alias. The remote build cloned that SHA and completed under
Next.js 15.5.22 / Node.js 24 with only the three known Analytics
exhaustive-deps warnings. An unauthenticated `/admin/login` request returned a
302 to Vercel SSO with `x-robots-tag: noindex`, proving deployment protection
remains active. A deployment-scoped error-log scan returned zero entries. This
proves deployment readiness, not hosted PLAT-101 application acceptance.

**Hosted-acceptance preparation, 2026-08-03:** Christian approved a bounded
Alpha staging owner/admin/operator and Yahoo/AOL/ISP delivery pass, with all
addresses, keys, email codes, and TOTP values entered privately. The approval
still contains the literal placeholder `[ISP DOMAIN]`, so it does not yet name
an executable ISP-hosted recipient scope. No hosted request or mutation was
performed under it. A new guarded local command,
`npm run operator:verify-staging-auth`, pins exact project
`fxefqnoqxbezeccjvrsw`, accepts only a publishable/legacy anon key, sends exactly
one operator email code, proves the real `assertOperator()` gate refuses AAL1,
uses the existing sole verified TOTP factor to prove fresh AAL2 succeeds, and
signs out only that acceptance session. It never enrolls a factor, uses a
service-role key, or invokes an operator data mutation. The source-level
contract was red before the command existed and passes 15/15 afterward; final
evidence is clean TypeScript, 320/320 contracts, 675/675 complete tests across
71 files with real loopback database access, and clean diff checks. A non-TTY
smoke stopped at the interactive guard before any network request.

**ISP-hosted delivery waiver, 2026-08-03:** Christian confirmed he has no access
to an ISP-hosted mailbox and explicitly chose to skip that provider check while
disclosing the limitation. Record the ISP criterion as `waived`, not `passed`.
Yahoo remains available and required, as does AOL. This is an acceptance-evidence
change only; it does not prove ISP delivery or alter Auth/email configuration.
The remaining executable gate is protected hosted owner/admin browser acceptance
plus Yahoo and AOL delivery. No hosted request or mutation occurred for the
waiver.

**Protected Alpha alias blocker, 2026-08-03:** Christian authenticated to
Vercel in the isolated Chrome tab group named `PLAT-101 hosted acceptance`.
Read-only Supabase reconciliation confirmed that
`alpha-onzio-staging.vercel.app` maps to the active Alpha staging tenant and
that the privately supplied Yahoo identity has exactly one active Alpha admin
membership. The protected admin initially loaded, but after signing out the
login page exposed the retired password plus club-MFA interface rather than
the deployed PLAT-101 email-code interface. No owner request or provider email
was sent, so this is not valid Yahoo acceptance and AOL was not attempted. The
single observed browser session was revoked through the ordinary sign-out.

Read-only Vercel inspection identified the deployment mismatch. The Alpha alias
currently resolves to older Preview deployment
`dpl_GJbEfRwSagF6gNt2ESqwPSxZuzua`, while the approved exact-`16b2a21`
PLAT-101 Preview is `dpl_54H3R35nnxpV7ERqw5ZGbvXLxmEF`. The latter is `READY`
and attached to the `staging` branch alias, but not to the protected Alpha
alias. Repointing that one alias is a Vercel configuration mutation and was
explicitly excluded by the existing hosted-acceptance approval, so no alias,
deployment, project configuration, or other hosted state was changed. Obtain a
fresh exact approval to repoint only `alpha-onzio-staging.vercel.app` to the
already-built `dpl_54H3R35nnxpV7ERqw5ZGbvXLxmEF`; do not deploy or push. Then
verify the passwordless UI and resume the private owner, Yahoo, and AOL matrix.

**Protected Alpha alias corrected, 2026-08-03:** Christian separately approved
repointing only `alpha-onzio-staging.vercel.app` from stale Preview
`dpl_GJbEfRwSagF6gNt2ESqwPSxZuzua` to the already-built approved PLAT-101
Preview `dpl_54H3R35nnxpV7ERqw5ZGbvXLxmEF`. The single `vercel alias set`
operation succeeded. Fresh read-only inspection resolves the Alpha alias to
`dpl_54H3R35nnxpV7ERqw5ZGbvXLxmEF`, project `onzio-rcfc`, target Preview,
status `READY`. Reloading the protected Chrome acceptance tab now renders the
passwordless Admin Portal with an email field, “Send sign-in code,” and “I
already have a code”; the retired password and club-MFA controls are absent.
No deployment was created and no source was pushed. Exact next step: Christian
privately submits the configured Alpha owner address and code in the preserved
browser tab, then the bounded Yahoo and AOL membership/delivery checks resume.

**Yahoo hosted acceptance passed, 2026-08-03:** Christian privately requested
and received the single approved Yahoo email code, verified it, and reached the
protected Alpha admin portal. Browser inspection confirms the session renders
Alpha FC with the `Admin` role and that the owner-only `Team access` navigation
is absent. This is the required least-privilege result, not a defect. Read-only
Supabase reconciliation returned exactly one active Alpha owner, two active
Alpha admins, and one recently signed-in active admin. The Yahoo Auth identity
and Alpha admin membership both pre-existed this acceptance, so no identity or
membership was created. The Yahoo acceptance session remains active pending the
ordinary sign-out required before the owner/AOL continuation. No mailbox
address, code, token, session identifier, or Auth user identifier is recorded.

**Alpha owner mailbox blocker, 2026-08-03:** A read-only Supabase query returned
exactly one active Alpha owner and mapped it to the synthetic Phase 7 address
`onzio.phase7.alpha.owner@example.com`. That reserved `example.com` identity is
not a deliverable mailbox, so it cannot receive the approved owner OTP and
hosted owner acceptance cannot truthfully pass. No membership, Auth identity,
session, email, audit, or configuration changed. Ownership transfer remains an
operator action under PLAT-101 and needs separate exact hosted-mutation approval;
do not convert the configured operator into the Alpha owner implicitly.

**Alpha ownership transfer approved and preflighted, 2026-08-03:** Christian
explicitly approved transferring Alpha staging ownership from the synthetic
Phase 7 owner to the existing configured operator Auth identity, preserving
both identities, exactly one active owner, the operator allowlist, all unrelated
memberships, and only one sanitized ownership audit. Read-only staging baseline
returned one Alpha tenant, both approved identities active, exactly one active
owner matching the approved source, no target Alpha membership, and zero prior
`ownership_transferred` audits. No hosted mutation has occurred. The local env
correctly contains loopback-only service credentials, so do not request or paste
a hosted service-role key. Christian must privately run the existing guarded
`npm run operator:verify-staging-auth` command to provide fresh AAL2 proof; after
its sanitized success event, execute one atomic exact-guard transaction through
the connected Supabase staging control plane and reconcile before acceptance.

**Alpha ownership transfer complete, 2026-08-03:** Christian privately ran the
guarded staging operator verifier. Its sanitized result proved AAL1 refusal,
fresh TOTP-backed AAL2 acceptance, exactly one verified factor, zero operator
data mutations, and acceptance-session revocation. The approved transfer then
ran as one exact-guard atomic transaction. The first attempt stopped before its
first mutation because PostgreSQL does not implement `min(uuid)`; replacing only
that selector with `min(id::text)::uuid` let the same guards pass. The successful
transaction inserted the approved target owner membership, marked only the
synthetic source owner membership removed, rechecked exactly one active owner,
and wrote exactly one `ownership_transferred` operator audit with no email or
secret value.

Independent reconciliation confirms one active Alpha owner and that it is the
approved target; one removed synthetic source owner; both approved Auth
identities retained; both pre-existing active admins unchanged; exactly one
transfer audit with the expected actor, club resource, source/target identifiers,
counts, retention flag, and outcome; and zero active operator sessions or
unrevoked refresh tokens. The first reconciliation query had a read-only
text/UUID comparison mismatch and changed nothing; its corrected rerun passed.
No allowlist, configuration, alias, deployment, push, production, Stripe, DNS,
Storage, or tenant content changed.

**Hosted Alpha owner acceptance passed, 2026-08-03:** Christian signed out the
accepted Yahoo admin session, requested and verified the single approved owner
email code, entered the protected Alpha portal as the newly transferred owner,
and confirmed `Team access` is visible. Browser inspection independently shows
the Alpha FC protected shell, `Team access` and `Payments` navigation, the owner
membership-management copy, the add-administrator form, and the two expected
active admin entries. Read-only Supabase reconciliation confirms exactly one
active Alpha owner at the approved target, one recent target sign-in, one active
target session, two unchanged active admins, and zero Yahoo sessions or
unrevoked refresh tokens. Owner acceptance passes. AOL remains the only
executable provider gate; the ISP-hosted criterion is explicitly waived, not
passed. No private address, code, token, or identifier is recorded.

**AOL delivery waiver, 2026-08-03:** Christian explicitly chose to skip the AOL
mailbox delivery/admin check. Record AOL as `waived`, never `passed`; no AOL
address was read or recorded, no request was submitted, and no Auth identity,
membership, email, session, or other hosted mutation occurred. Together with
the earlier ISP-hosted waiver, the only provider result actually passed is
Yahoo. This leaves a disclosed deliverability-evidence gap, not an application
defect. PLAT-101 remains `in_progress` until the already approved hosted
unknown-address request proves the explicit message while creating no Auth user
and sending no email.

**Operator TOTP break-glass recovery, 2026-08-03 — complete:** Christian
approved the governed recovery for exactly the configured operator in Supabase
staging project `fxefqnoqxbezeccjvrsw`. A read-only aggregate confirmed one
active configured user, one active session, one unrevoked refresh token, exactly
one verified TOTP factor, and zero unresolved or other factors. The approval and
out-of-band identity-verification reference is retained only as SHA-256
`2b71d470293d9feed3a89dfbfd96dd6b8e3569e169cd9cd4d41e21037a0b69cb`.
The sole session and refresh token were revoked first and read back at zero;
only then was the sole verified factor removed. The current aggregate is one
active configured user and zero sessions, unrevoked refresh tokens, verified
TOTP factors, unresolved TOTP factors, or other factors. One initial read-only
hash lookup included a newline and matched no user; the corrected lookup matched
exactly one. The first revocation transaction failed on an unsupported
`min(uuid)` aggregate before any delete; the corrected guarded transaction then
succeeded. At that checkpoint no email had been sent, no replacement factor had
been enrolled, and no audit event had been written. The subsequent private
enrollment, boundary verification, and audited closeout are recorded below.

**Operator TOTP QR viewer correction, 2026-08-03:** Christian's first private
replacement attempt authenticated by email and reached `auth.mfa.enroll()`, but
the helper rejected Supabase Auth's current
`data:image/svg+xml;utf-8,...` QR representation. The installed pinned
`@supabase/auth-js` client explicitly adds that prefix; the old decoder accepted
only raw SVG, `charset=...`, or base64 data URLs. The helper's `finally` path
removed the newly created unresolved factor and signed out its session. A
read-only hosted aggregate then confirmed one active configured operator and
zero sessions, unrevoked refresh tokens, verified TOTP factors, unresolved TOTP
factors, or other factors.

The first decoder correction still rejected the actual SVG body on Christian's
second private attempt. Its automatic cleanup again removed the new unresolved
factor and session, and a second read-only aggregate again returned zero for all
sessions, tokens, and factor categories. Rather than parse a provider-controlled
SVG representation, `lib/operator/totp-qr.ts` now follows Supabase's documented
usage directly: it HTML-escapes the populated SVG data URL into an `<img>` in a
mode-0600 temporary local page with a restrictive Content Security Policy. The
page is opened locally and removed during cleanup; no QR, secret, or URI is
logged or persisted.

Red-first evidence failed 6/21 before the viewer existed; afterward the focused
platform-auth file passes 21/21, contracts pass 326/326, TypeScript is clean,
and the complete real-loopback suite passes 681/681 across 71 files. Recovery
remains fail-closed: privately retry `npm run operator:enroll-totp`, then run
the AAL1/AAL2 verifier, reconcile exactly one verified factor, and only then
write the one approved sanitized audit event. No secret or private identity
value was recorded.

**Operator TOTP replacement enrolled, 2026-08-03:** Christian privately reran
`npm run operator:enroll-totp` with the temporary viewer correction and reported
the exact safe success status, `Operator TOTP enrollment verified at AAL2.` A
read-only hosted aggregate independently confirmed one active configured
operator, exactly one verified TOTP factor, zero unresolved or other factors,
and zero sessions or unrevoked refresh tokens after the helper's local sign-out.
The replacement enrollment portion of break-glass recovery is complete. Do not
write the recovery audit yet: first run
`npm run operator:verify-staging-auth` to prove the real operator boundary
rejects AAL1, accepts fresh AAL2 after TOTP step-up, and revokes only that
acceptance session. No private identity, factor, session, key, QR, secret, or
code is recorded.

**Operator TOTP recovery closeout, 2026-08-03:** Christian privately ran
`npm run operator:verify-staging-auth` and returned the command's sanitized
success event: the real operator gate refused AAL1, accepted the same allowlisted
subject only after fresh TOTP step-up to AAL2, observed exactly one verified
factor, performed zero operator data mutations, and revoked the acceptance
session. Independent hosted reconciliation then confirmed one active configured
operator, exactly one verified TOTP factor, zero unresolved/other factors, and
zero sessions or unrevoked refresh tokens.

After confirming no matching recovery audit existed, one guarded append-only
`system` event was inserted with no club, actor, resource, request, identity,
session, or factor identifier. Its payload contains only the approved reference
digest, aggregate before/after counts, complete pre-recovery session-revocation
result, the AAL1/AAL2 boundary booleans, and `recovered` outcome. Independent
readback returned exactly one matching row and exact sanitized shape. Break-glass
recovery and hosted operator acceptance are complete. `PLAT-101` remains
`in_progress` for hosted owner/admin and Yahoo/AOL delivery acceptance; the
separate ISP-hosted criterion is explicitly waived, not passed. No push,
deploy, production, Vercel, Stripe, DNS, Storage, tenant
content, allowlist, membership, or unrelated identity changed.

Approved hosted mutations completed only on `fxefqnoqxbezeccjvrsw`:

- migration `20260803192838` installed the AMR session helpers and replaced the
  six governed club read policies;
- migration `20260803192943` changed `club_members_self_read` to the Supabase
  init-plan form; the advisor warning introduced by the first migration is gone;
- email OTP expiry changed `3600` → `86400`, length `8` → `6`, and the stock
  link-based Magic Link/OTP subject/body changed to the code-only checked-in
  Onzio template;
- self-signup was already disabled, email auth already enabled, and session
  timebox/inactivity already `0` (`never`); those values were not changed.
- Vercel Preview branch `staging`'s sensitive operator allowlist was updated to
  the approved existing staging Auth user and is present in the environment
  used by the approved `16b2a21` Preview deployment.

Readback confirms both migration versions, all four intended security-definer
functions with empty search paths, all six policies using the fresh-session
boundary, and zero remaining `is_aal2()` calls in exposed `onzio` policies.
The security advisor still reports the intentional 24-hour OTP warning and the
now-inapplicable leaked-password warning, plus four pre-existing policyless
privileged tables. No package data was mutated.

Exact next step: no PLAT-101 work remains. Yahoo passed; AOL and ISP-hosted
delivery were explicitly waived and were not passed. The exact `457280b` push
approval is exhausted; this deployment-evidence update and all later local
commits must remain unpushed unless separately approved. Do not start `PLAT-102`,
`DCFC-601`, or `DCFC-602`; do not extend the heartbeat to media cleanup. DMARC
`p=none` is a separate DNS approval.

## Latest Work — PLAT-EPIC-001 prerequisites P1 and P2

Agent: Claude Code (Opus 5), 2026-08-03. Assignment: prerequisites `P1` and
`P2` of `docs/phase-12/PLATFORM-AUTH-BILLING-PLAN.md` only. Both are complete.
`PLAT-101` was not started. Hosted-mutation count: **zero** — no Supabase,
Vercel, Stripe, Auth, email, Storage, DNS, or Bunny.net action of any kind.

`P1` — the outstanding `DCFC-502`/`503`/`504` worktree is committed locally on
`staging` in four package-grouped commits, plus the `P2` commit:

- `65e54fe` Close DCFC-502 staging release and tenant provisioning
- `6d08634` Add the DCFC-503 staging content and media importer
- `c92a038` Add the operator-issued club invitation workflow for DCFC-504
- `02beb1b` Record Phase 5 acceptance for DCFC-502 through DCFC-504
- `427e19d` Promote PLAT-D001 through PLAT-D014 into a governed decision log

`HANDOFF.md`, `STAGING-ACCEPTANCE.md`, and `STATUS.md` are shared Phase 5
ledgers spanning all three packages; splitting them per package would have
required inventing intermediate document states, so they land together in
`02beb1b`.

**No push was created, and this is the one thing to know before resuming.** The
`staging` branch triggers a protected Vercel deployment, which is Class 3 and
not approved by this assignment. Local `staging` is now six commits ahead of
release commit `8e3cde2` — the five listed above plus the commit carrying this
handoff record — and `8e3cde2` is what the running protected staging deployment
serves. The repository and the deployment have diverged until a
separately approved push. Nothing in those commits changes application
behaviour — they are documentation plus a staging-only importer, an
operator-only invitation module reachable from no route, and its tests — so the
divergence is a bookkeeping risk, not a runtime one.

`P2` — `docs/phase-12/DECISIONS.md` is a new platform-wide decision log,
separate from the Diverse City tenant log because these decisions change every
tenant. It records `PLAT-D001`–`PLAT-D014` with rationale preserved, `PLAT-D006`
(automated suspension can take a paying customer's site offline) and
`PLAT-D012` (inbox access equals club content access) as explicit accepted
risks in an Accepted Risk Register with the other four, the deferred and
rejected options (passkeys, SMS, magic links, OAuth, admin-locked-but-site-up)
each with a reopen condition, and the five package-level open items.

**Accepted 2026-08-03.** Christian accepted all fourteen decisions unamended
and signed off the `PLAT-101` privilege classification table unamended, in the
same session. Accepting `PLAT-D006` and `PLAT-D012` accepted their stated
risks. The classification table's "Add or remove `admin` members — Club owner —
aal1" row was flagged before sign-off, because under `PLAT-D012` an owner's
inbox is then sufficient to mint another `admin` and that row is what gives an
application route a path into the operator module; Christian reaffirmed the
table as written, so the row stands at `aal1` deliberately. Of the five open
items only the grace-warning schedule was settled — day 7 and day 17. The other
four had no concrete value on offer and remain open against their owning
package.

**Acceptance is not package authorization.** Per the plan's Authorization
Notice, `PLAT-101`, `PLAT-102`, and `PLAT-103` each still need their own
approval naming the package ID and exact target environment. `PLAT-101`'s
decision and sign-off gates are closed; it still needs that approval plus three
inputs — the operator user-ID list, the exact unknown-address message, and the
transactional sending domain.

### The five open items are closed — and three were mis-framed

A design review on 2026-08-03 worked through all five, probing the loopback
stack and the live local schema rather than reasoning from the plan.
`PLAT-D015`–`PLAT-D020` record the outcomes. Read
`docs/phase-12/DECISIONS.md` — its Empirical Findings section is the evidence,
and three findings contradict the plan text:

- **AAL2 survives session refresh** (proven). Operator re-auth is per-session,
  so session lifetime was the only bound on privileged access.
- **Session duration is not controllable the way the plan assumed — twice
  over.** `timebox` and `inactivity_timeout` are project-wide GoTrue settings
  with no per-role dimension, so `PLAT-101`'s "weeks for club, hours for
  operator" was unbuildable. They are also Pro-and-above, and `AGENTS.md` locks
  staging as Free, so the replacement (`PLAT-D016`) was unconfigurable and
  unrehearsable on staging — and orphaned, since no package's hosted boundary
  could have applied a production-only Auth setting. Settled by `PLAT-D021`:
  session age is enforced **by the platform from the `amr` claim**, 30 days for
  club sessions in RLS and 2 hours for operator `aal2` in `assertOperator()`
  (`PLAT-D015`). Plan-independent and fully rehearsable on Free staging. It must
  live in RLS, not application code alone, or a still-valid old JWT reaches
  PostgREST directly where no policy checks session age.
- **No policy calls `club_has_feature` directly** — 115 policies across 29
  tables call the two wrappers instead — so `PLAT-102`'s fork was a false
  choice. `PLAT-D018` deletes the function by collapsing the wrappers, with
  zero policy churn.

**`PLAT-D017` changes the standing of the flagged operator gap.** The 2-hour
rule reads the caller's `amr` claim, which cannot be obtained from
`assertOperator(actorId: string)`. So `PLAT-101` cannot ship the session rule
without binding the caller to a verified session — the gap is now a
requirement, not a recommendation. Operator scripts will sign in with TOTP
rather than relying on the service-role key plus a known operator UUID.

**Cron alerting was a pull, and the fix had to cover silence.** Vercel records
cron invocations but sends no native notification for an individual cron failure
or non-200, so `PLAT-D019`'s escalation reached nobody. Neither an in-handler
webhook nor a log-drain 5xx rule fixes the worse case: a cron that stops firing
emits no signal at all, which would silently disable `PLAT-D006`'s suspension
warnings as well as reconciliation. `PLAT-D022` accepts a heartbeat /
dead-man's-switch — ping on a clean run, signal failure explicitly, alert on
both a reported failure and a missing ping. Proposed but **not authorized**:
`/api/cron/media-cleanup` has the same blind spot from Phase 8, but it is
outside `PLAT-102`'s named scope and needs its own widening or package.

**No open decision, verification, or input remains against `PLAT-EPIC-001`.**
One `PLAT-101` implementation obligation stands, found by probe rather than by
reading: the stock Magic Link template emits a link with no six-digit code, so
altering it to `{{ .Token }}` is a hard prerequisite, not a nicety.

## Next agent — start here

`PLAT-101` has **every gate satisfied except its own package approval.** Do not
start it without one. Per the plan's Authorization Notice each package requires
an explicit approval naming the package ID and the exact target environment; no
approval rolls forward.

**Inputs, all supplied as of 2026-08-03:**

| Input | Status |
| --- | --- |
| Signed privilege classification table | Signed unamended 2026-08-03 |
| Operator user-ID list | Already set as `ONZIO_OPERATOR_USER_IDS` in `.env.local` and Vercel staging; used in `DCFC-502`/`504`. Stays outside Git per `DCFC-D113`. **That account must have TOTP enrolled** — `PLAT-D017` makes it load-bearing |
| Unknown-address message | Pinned verbatim in `PLAT-D023`, routing to `onziofutbol@gmail.com`. Implement exactly; wording changes need a new decision |
| Session durations | No longer a config input — `PLAT-D015` / `PLAT-D021` moved enforcement into the platform |
| Transactional sending domain | `auth.onziofutbol.com`, reused from Phase 8. DKIM, SPF, and bounce MX verified live 2026-08-03 |

**Read before touching anything:** `docs/phase-12/DECISIONS.md`. Its Empirical
Findings section is the evidence base, and several entries contradict
`PLATFORM-AUTH-BILLING-PLAN.md`'s own text — the plan has been annotated where
superseded, but the decision log governs. In particular do not re-derive session
handling from the plan's "asymmetric sessions" bullet; it is superseded twice
over.

**Standing prohibitions, none lifted:**

- **Do not push.** Local `staging` is 11 commits ahead of release commit
  `8e3cde2`, which is what the protected staging deployment serves. Pushing
  triggers a protected Vercel deployment — Class 3, unapproved.
- **Do not start `DCFC-601` or `DCFC-602`.** They are `PLAT-103`'s scope to
  respecify and cannot be executed as written.
- **Do not extend the `PLAT-D022` heartbeat to `/api/cron/media-cleanup`**
  without a scope widening; it is proposed, not authorized.
- No hosted mutation of any kind without an approval naming it.

**Open, separate from `PLAT-101`:** DMARC on `onziofutbol.com` is `p=none`,
monitor-only. Worth tightening to `p=quarantine` now that email is the sole
authentication path, but it is a DNS change needing its own approval.

Flagged and deliberately not fixed, because it is `PLAT-101`'s deliverable:
`assertOperator()` in `lib/operator/shared.ts` checks only that a
caller-supplied `actorId` appears in `ONZIO_OPERATOR_USER_IDS` — no AAL check,
no session lookup, and no binding between that argument and the authenticated
caller — while every operator function reaches the database through
`createServiceRoleClient()` and so bypasses RLS entirely. What keeps this safe
today is that no `app/` route imports `lib/operator/*`; the only callers are
scripts and tests. `PLAT-101` proposes letting a club owner add an `admin`,
which gives an application route a path into this module and makes the gap
reachable. Full detail, including the `isContractSimulation()` fabricated-success
path in contract tests, is in
`docs/phase-11/diverse-city/STATUS.md`.

Verification: `git status --short` clean after the final commit;
`git diff --check` clean; `npx tsc --noEmit` exit 0; `git log --oneline`
confirms the five commits above. Tests were not run — this assignment changed
no application code, schema, or test.

Exact next step: `PLAT-101` may be assigned once Christian issues its package
approval and supplies the four required inputs above. `DCFC-601` remains
unstarted and must not be started; it is `PLAT-103`'s scope to respecify. The
push remains withheld pending its own approval.

## Open Platform Findings

`docs/platform-findings.md` is the durable register of platform-wide issues
that have been verified but not fixed. Read it before working in the areas it
names. As of 2026-08-01 it holds two open findings and five resolved. No
open finding affects a live site.

- **PF-005 and PF-006** — **resolved 2026-08-01, together.** Rose City's
  homepage hero video pointed at the legacy Supabase project
  `nsgtkwqkbyxkiwrhzsje`, permanently deleted during the Phase 8 closeout,
  so the hero had silently been showing only its static poster. Christian
  chose to remove the dead video and keep the poster as the intended hero;
  the source file remains recoverable from the frozen export if video is
  ever wanted back. PF-006 — that nothing checked whether code still
  referenced deleted infrastructure — is closed by a new architecture
  contract, `references no permanently deleted Supabase project`, which on
  its first run immediately caught eleven further dead `remotePatterns`
  entries in `next.config.mjs`. Full detail, including a behavior bug caught
  mid-change, is in the register.
- **PF-001** — **resolved 2026-08-01.** Phase 9's gate claimed Rose City
  rendered without tenant-specific presentation special cases; it did not.
  Investigation found the original entry undercounted (seven occurrences,
  not six — it missed `lib/flags.ts:51`) and wrongly described the branches
  as working, since `Hero.tsx`'s gated content is dead (PF-005). Per
  Christian's decision the gate was amended to state its true achieved
  scope, and the one dead branch — `ShopHero` in
  `app/(public)/shop/page.tsx`, unreachable because `SHOW_SHOP_HERO` is the
  constant `false` — was deleted. Six documented legacy branches remain, now
  recorded as debt in the plan rather than contradicted by it. Extraction
  was deliberately not undertaken: it is not one refactor but a deletion, a
  blocked branch, one clean template extraction, and three new content
  domains.
- **PF-007** — **resolved 2026-08-01.** Hardened all 21 false-green-prone
  database security scenarios: exact Postgres/PostgREST/Storage signatures
  replace generic non-null errors, private reads no longer swallow query
  failures, and rejected audit writes must prove their own denial. Shared
  assertions fail explicitly on `PGRST204`/`PGRST205`, focused contracts pin
  that behavior, and an architecture guard prevents the weak patterns from
  returning. A deliberate misspelled-column mutation turned the real denial
  test red with `[TEST AUTHORING ERROR] ... PGRST204`, proving the original
  false-green route is closed. Current full suite: 588/588 across 59 files.
- **PF-002** — five parallel entitlement sources of truth
  (`club_has_feature`, `ADMIN_TABLE_FEATURES`, `moduleRegistry`, and
  `STARTER_FEATURES`, plus Storage surface-policy mapping), with confirmed
  unresolved `shop` and `seasons` contradictions. `DCFC-204` fixed the Contact
  application disagreement; `DCFC-301` fixed a reachable Programs Storage
  fallback bypass; `DCFC-302` now explicitly maps Contact Storage to the
  Contact entitlement instead of depending on the Branding fallback. PF-002
  remains open.
- **PF-003** — **resolved 2026-08-01 in DCFC-202.** The platform plan now
  documents the tier/feature entitlement mechanism and its public-read effect.
- **PF-004** — the Bunny.net video reference deliberately deviates from the
  "content records reference media assets" principle. Bunny is outside the
  current Phase 5 goal and must return only as a separately scoped reusable,
  tenant-safe platform capability; no Diverse City-specific branch is
  permitted.

The remaining open findings are not authorized to be fixed without their own
scoped approval.

## Current State

The unbudgeted Phase 5 goal for `DCFC-EPIC-002` is complete as of 2026-08-02.
`DCFC-502` is complete after its exact Class 3 approval. The Supabase staging project is
healthy on the Free plan. A restricted, out-of-Git role/schema/data backup was
captured; its permissions, sizes, and SHA-256 evidence are in
`docs/phase-11/diverse-city/DCFC-501-REMEDIATION-PLAN.md`.

The approved history-only repair replaced hosted Phase 7 execution timestamps
`20260727171934`, `20260727174125`, and `20260727174503` with canonical
versions `20260727171658`, `20260727174006`, and `20260727175200`. It did not
execute or reverse schema SQL. `DCFC-502` then applied exactly the ten reviewed
Phase 9/11 migrations without seed. The linked ledger now aligns all 20
canonical versions and linked schema lint is clean. All 40 hosted `onzio`
tables have RLS; `onzio` is exposed through the Data API while
`onzio_private` is not, and the private schema has no browser table grants or
`PUBLIC` routine grants.

TOTP, the 15-minute AAL1 enforcement policy, custom staging SMTP, staging-only
Auth URLs, and rate limits are attested. Christian accepted the Free-plan
staging exceptions for leaked-password screening and downloadable daily
backups with the documented protected/noindex, staging-identity, mandatory-
admin-TOTP, and restricted-manual-backup controls. Alpha/Bravo remain unchanged:
two clubs, two domains, five memberships, four orphaned media rows, 45 audit
events, zero cleanup rows, two empty Storage buckets, and no Storage objects.

Vercel project `prj_I362ysmh9cse5cRxnL7db4dOhsEs` remains the shared
`onzio-rcfc` project. All non-custom-domain deployments are protected,
Git-fork protection is enabled, and exactly one replacement automation bypass
remains with `isEnvVar=true`. The enabled test webhook
`we_1TxrnaK6WajTkwHYtFEvCEo8` now targets the existing protected staging alias,
is still test mode, and retains its exact seven-event allowlist. The initial
replacement attempt used the approved rollback path after Vercel required the
environment-variable designation; the old Stripe URL was restored and the
unused replacement revoked before the corrected atomic rotation. No secret
was recorded. Git `staging` now points to release commit
`8e3cde2da52ec35a9e5fd7935197953c899a6cc5`; protected Preview deployment
`dpl_8W3YtWSw6Bu2qAaUndeofiiWd2KM` is READY and owns the approved Diverse City
staging alias.

Bunny.net is explicitly outside Phase 5 and unauthorized by this goal. Diverse
City stays on the approved crest-led hero with the vertical video story hidden.
Do not access Bunny credentials, create a library, upload video, add provider
references, or implement a Diverse City-specific video branch. Bunny must be
a separate reusable tenant-safe capability. If launch requires video, scope
that capability after Phase 5 and before Phase 6 acceptance; otherwise finish
and stabilize the production rollout before integrating Bunny.

`docs/phase-11/diverse-city/DCFC-502-APPROVAL-PACKET.md` records the exact
approval and closeout. Audited operator provisioning created exactly one club
`d88bf71b-9820-49ae-9dc0-7556b0813885` as `starter` / `onboarding` / `preview`,
one active verified primary staging domain, one minimum active owner membership
using the existing operator identity, and one operator audit.

`DCFC-503` is complete as of 2026-08-02 after Christian's exact approval for
that tenant and immutable plan digest
`63d1867685c59c7dee3ce2cedda9e8400dae73d930d2488a601bdec5fae9fa36`.
The byte-identical plan SHA-256 is
`87efae9701f6e1fa4653a55f2687206f3370306bd900d83ee30352849b78702b`.
Staging now contains ten approved normalized `image/webp` assets/objects
totaling 2,864,062 bytes, four Programs, approved About/Contact/Shop/Elsa's
Bakery content, 15 tenant-composite media relationships, and one immutable
published `academy@1` document with configuration digest
`1d2c6ce9eb91be5cc18a6017ffc783bdaedd231b40ea2bf5f3830b9b3549a008`.
It contains zero Tryouts, players, staff, matches, standings, participant data,
temporary Google references, transform/optimizer URLs, video, Bunny reference,
subscription, or Stripe row. Private staging and cleanup queue counts are zero.
All ten raw public object URLs return HTTP 200 and carry one-year cache metadata.

The identical replay reused all ten public objects and kept tenant state
fingerprint `babdad9053e708e696f88a6af59e8231`, every row/object count, the
published pointer, and the single import audit unchanged. The tenant remains
`starter` / `onboarding` / `preview`; Auth remains seven users/five MFA factors.
Storage/API/Postgres log review found no error signal. Local verification is
green: TypeScript, 310/310 contracts, 20/20 architecture tests, 662/662 full
loopback suite, generated database types, schema lint, production build, lint
with only the three pre-existing Analytics warnings, and diff checks. The new
staging-only importer and all `DCFC-502`/`503` ledger edits remain uncommitted
because commit and push were expressly excluded. `DCFC-504` is now complete
under its separate exact approval; commit and push remain excluded.

`DCFC-504` is complete under Christian's exact new-identity remediation
approval recorded in
`docs/phase-11/diverse-city/DCFC-504-APPROVAL-PACKET.md`. The earlier single
recovery request returned HTTP 200 without generating a message because the
private address was absent from staging Auth. Christian then approved one new
identity and invitation rather than a retry.

Codex added and tested a reusable server-only direct-operator
invitation-and-membership workflow with duplicate refusal, verified tenant
callback derivation, audited membership creation, and cleanup limited to newly
created resources. Local verification passed TypeScript, 312/312 contracts,
20/20 architecture tests, the real local invitation database test, 665/665
complete tests, lint, build, and database-type checks. The exact pre-send Auth
redirects, notification switches, invite template, SMTP posture, TOTP, and
AAL1 limit were reload-verified without changing them.

The workflow then ran once against staging project
`fxefqnoqxbezeccjvrsw` and tenant
`d88bf71b-9820-49ae-9dc0-7556b0813885`. It created one new Auth identity,
sent one invitation using
`https://diverse-city-onzio-staging.vercel.app/admin/auth/callback`, added the
new identity as a temporary second active owner, and wrote one
`membership_added` plus one `identity_invited` audit. Resend message
`8ec265e4-e868-440c-8005-7b0893977ea2` is delivered to the approved provider
domain. The message body/action URL and private address were not opened or
recorded.

Christian privately opened the invitation, set the new password, recovered the
browser-saved value, signed in, enrolled exactly one TOTP factor, and reached
AAL2. Protected browser acceptance resolved the admin shell to Diverse City FC,
loaded Contact at the Starter boundary, kept Programs and Tryouts Pro-gated,
and reached the owner-only Payments route in private-preview state without any
billing mutation. The temporary synthetic owner membership was then marked
removed in a guarded audited transaction with the reviewed two-owner/last-owner
invariants; its pre-existing Auth user was retained. The accepted owner session
still reached Payments after that cutover.

Final `DCFC-504` reconciliation is eight Auth users, exactly one active Diverse
City owner, one removed synthetic owner membership, 29 tenant audit rows, one
active AAL2 session, zero AAL1 sessions, exactly one verified TOTP factor, and
one operator `membership_removed` audit. The approval is exhausted and Phase 5
is closed. `DCFC-601` was not started and requires a fresh exact approval. All
other Auth settings, SMTP/templates/rate limits, Vercel, Stripe, DNS,
production, Bunny.net, Phase 6, commit, and push state remain unchanged. The
temporary secret-transfer FIFO directory was deleted; no credential or private
address was retained.

DCFC-501 hosted mutations: six Supabase migration-history status changes;
five successful Vercel mutations across the rolled-back and final rotations,
with one rejected revoke producing no state change; and three Stripe test
webhook URL mutations including rollback and final update. Hosted schema/data,
tenant, deployment, environment variables, Storage, Auth/email, DNS,
production, live Stripe, Bunny.net, commit, and push mutations were zero.

The earlier unbudgeted Phase 4-only goal for `DCFC-EPIC-002` completed as of
2026-08-01. `DCFC-401` through `DCFC-404` locked the approved production
content/provenance dispositions, all 42 source-media dispositions and ten
retained rights-confirmed assets, the non-video crest-led hero/hidden-story
treatment, deterministic loopback import/reset/replay, and the final local
rollout-input manifest. The goal stopped before `DCFC-501`; no staging system
or hosted credential was inspected, no Class 3 action occurred, and no commit
or push was created.

The checked-in local plan is pinned to snapshot commit
`5bbdfa33d59163b218bbd33745f9cfd4a66d379f`. Independent planner runs produce
semantic digest `63d1867685c59c7dee3ce2cedda9e8400dae73d930d2488a601bdec5fae9fa36`
and identical JSON file SHA-256
`87efae9701f6e1fa4653a55f2687206f3370306bd900d83ee30352849b78702b`.
The clean-stack loopback rehearsal imported ten normalized media assets, four
Programs, approved About/Contact/Shop/Elsa's Bakery content, and one published
`academy@1` document while importing zero Tryouts, players, staff, matches, or
standings. Idempotent import and tenant-scoped reset/replay reproduced state
digest `b595fc81773ed47bd4d4976d45f533e1e1494ad4089514ac6c5567e27fc4376d`;
the reset removed ten objects and only the Diverse City local tenant, and
Alpha/Bravo isolation remained intact.

Reusable tenant-safe fixes prevent explicit tenants from inheriting Rose City
About/Shop/Sponsor defaults, add deliberate Roster/Schedule empty states, and
render Academy sponsor rows without a club-slug branch. Middleware preserves
the verified tenant hostname through rewrites and permits only a matching
internal slug, while the client navigation normalizes rewritten paths to avoid
hydration drift. Final local acceptance is green: a from-scratch database
reset; TypeScript; 662/662 tests across 68 files; matching generated DB types;
clean local `onzio`/`onzio_private` schema lint; production build and lint with
only the three pre-existing Analytics hook warnings; and 2/2 Playwright
scenarios covering desktop/mobile public routes plus protected AAL2 admin.

`docs/phase-11/diverse-city/ROLLOUT-INPUT-APPROVAL-MANIFEST.md` was the final
Phase 4 boundary. `DCFC-D118` explicitly deferred unsupplied hosted inputs
rather than inventing them: exact staging/production hostnames and DNS
ownership, safe owner/admin identity references, live Pro billing identifiers,
launch window/rollback authority/observation duration, and indexing approval.
That historical block was later superseded only for the separately authorized
read-only `DCFC-501` preflight described above; identity, production, billing,
DNS, launch, and indexing deferrals remain in force.

`DCFC-304` (local admin-to-public acceptance) is `complete` as of 2026-08-01,
closing Phase 3 and the local Phase 0-3 Diverse City epic scope. Reusable
Academy Programs overview/detail, Contact, and structured Tryouts routes now
resolve the verified server-side tenant and existing normalized public queries;
middleware covers the exact paths and validated Program slugs; editable
Program labels populate Academy navigation; and the approved Academy footer
paths are present. Empty or unpublished content fails closed, logistics render
honestly as TBA, external registration stays a disclosed no-data-collection
anchor, and no club-slug conditional was added.

The package also closes the last Academy persistence gap: migration
`20260802023000_dcfc_304_academy_presentation_template.sql` allows the already
registered `academy@1` template in `presentation_documents`, and the local-only
seed publishes a valid Academy document with visibly distinct synthetic Alpha
and Bravo content. A real AAL2 database test updates all three Alpha domains,
reads those changes through the anonymous public query layer, and proves Bravo
rows remain present but inaccessible. Presentation tests restore the published
seed pointer after mutation so the full suite no longer changes later browser
acceptance state.

Final acceptance is green: fresh local reset; TypeScript; 304/304 contracts;
20/20 architecture; 78/78 real local database tests; 656/656 complete tests
across 66 files; generated database type check; clean local
`onzio`/`onzio_private` schema lint; production build with all
canonical and tenant-runtime routes; lint with only the three pre-existing
Analytics hook warnings; and clean diff checks. Repeatable Playwright evidence
passed 2/2 across 1440×900 and 390×844 for all public paths and MFA-protected
Programs/Contact/Tryouts admin pages, including tenant isolation, TBA/external
CTA behavior, no runtime image transforms, no broken images or framework
overlay, and no horizontal overflow. That check also fixed the shared admin
shell's hardcoded Rose City label and empty initial logo source; admin chrome
now uses the resolved club name with an initials fallback. Hosted mutation
count is zero; every Database/Auth/Storage interaction was loopback-only.

The Diverse City FC Phase 0-3 planning packet is complete and ready for
Christian's review under `docs/phase-11/diverse-city/`. It defines the
agent-neutral epic, accepted and open decisions, initial route/content matrix,
visual acceptance contract, 14 dependency-scoped work packages, and a shared
status ledger. `AGENTS.md` and the new root `CLAUDE.md` now require every agent
to record package status, completed work, files changed, verification,
blockers, and the exact next step before ending. This checkpoint changed no
product code and mutated no hosted Supabase, Storage, Vercel, Stripe, DNS,
Auth, Resend, email, or club resource.

The packet does not start a production Phase 11 rollout or authorize work
beyond local Phase 0-3 preparation.

`DCFC-001` (Contact visual specification) is `complete`. Claude Code added
`/contact` to the isolated Diverse City snapshot
(`/Users/christianalcala/Downloads/onzioProspects/diverse-city-fc/site`) using
the club's real, already-verified email/phone/social destinations from
`lib/site-data.ts` plus original headline/intro copy. `npm run typecheck` and
`npm run build` passed in the snapshot, and local desktop/mobile browser
checks found no console errors, broken images, or horizontal overflow.
Christian reviewed the page, asked for the location line to drop its
"— Chicago Area" suffix (now just "Schaumburg, Illinois"), and then approved
it in full. Decision `DCFC-D101` is now accepted and recorded in
`DECISIONS.md`.

`DCFC-002` (Tryouts) is `complete`, approved by Christian on 2026-07-31.
Claude Code added `/tryouts` with a status-aware hero
(`upcoming`/`open`/`closed`; shipped as `upcoming`, the honest current
state), an external registration CTA that reuses the same already-approved
temporary destination as the existing Special Olympics program page, and
honest "TBA" placeholders for location and cost — no registration fact was
invented. The CTA fails closed to a `mailto:` contact link when closed or
when no URL is set (both verified by temporarily toggling). Per Christian's
explicit direction, the primary nav was restructured: "Schedule" is now a
dropdown (Fixtures + Tryouts, mirroring the existing Programs dropdown
pattern via a shared generic open/close state), and "Contact" was added to
the primary nav after Store (previously footer-only), in addition to new
footer links. Christian's first review pass asked for the eyebrow/status
badge/"Take the field." headline line to be removed (headline is now the
single line "Join Diverse City FC," no trailing period), the Age Groups card
removed (row is now Location and Cost only), the Schedule/Programs dropdown
panels tightened (a fixed `min-w-64` was leaving large empty space for short
labels), the hero-to-cards vertical gap tightened (two paddings were
stacking), and the Location/Cost block realigned so it shrinks to its own
content on desktop instead of stretching across the full section width.
`npm run typecheck` passed throughout; `npm run build` passed after clearing
a stale `.next` cache caused by running build concurrently with the dev
server (a tooling artifact, not an application defect). Local desktop/mobile
browser checks confirmed every revision, no overflow, no console errors, no
broken images. Decision `DCFC-D102` is partially resolved: the CTA label,
temporary registration URL, navigation placement, and visual layout are
approved; the underlying age group/eligibility/date/location/cost facts
remain open, and `DCFC-D103` (single vs. multiple tryout events) remains
explicitly deferred to Phase 1. Full history is in
`docs/phase-11/diverse-city/STATUS.md`.

`DCFC-003` (visual freeze and approval) is `complete`. Claude Code gathered
every item on `VISUAL-ACCEPTANCE.md`'s evidence checklist for both routes
(HTTP 200, no console errors, no overflow at 1440x900/390px, positive image
dimensions, real-keyboard focus reaching a visible native outline, every
nav/footer link verified, external links confirmed as no-data-submission
anchors, and `noindex, nofollow` verified via both the response header and
page meta) and, with Christian's explicit approval, created one local git
commit in the snapshot repository —
`a0f9f0c201e7d0e54b821c22f8c60159798f7477`. Two honest gaps were recorded
rather than silently resolved: no FAQ content exists for Tryouts (none was
supplied), and there was no dedicated Dates detail card (dates were
acknowledged only in the intro paragraph's prose). Christian then asked for
the Dates gap to be closed: Claude Code added a dedicated Date detail card
(`TBA`, honest placeholder) alongside Location and Cost, and, with Christian's
explicit approval, created a second local commit —
`5bbdfa33d59163b218bbd33745f9cfd4a66d379f`, now the approved commit of
record. The snapshot repo has no configured remote; neither commit was or
could be pushed. Full evidence is in
`docs/phase-11/diverse-city/VISUAL-ACCEPTANCE.md`.

`DCFC-101` (field-level content and asset inventory) is `complete`. Claude
Code expanded `CONTENT-MATRIX.md` to field-level coverage for every route in
the pinned commit, reading the actual rendered source of each route rather
than assuming, and computing real `sha256` checksums for every referenced
media asset instead of leaving them as placeholders. The pass also documented
which Rose-City-inherited files/components are dead code not wired to any
current Diverse City route, so they aren't mistaken for the live content
source later. Two findings were flagged as needing Christian's explicit
confirmation — neither was invented or changed by this pass, both already
existed in the approved snapshot: (1) `DiverseLeagueStandings.tsx` hardcodes
a specific 10-row UPSL standings table with real-named opponent clubs and no
documented provenance, and (2) a "conference championships and national-stage
appearances" claim is repeated verbatim on both the About page and the Men's
Teams program page with no documented provenance. Both are now resolved:
Christian confirmed on 2026-07-31 that standings will be an admin-editable
domain (not a one-time import — the current table is placeholder/seed data
pending that admin capability), and that the championships claim needs no
further resolution right now. Full detail is in
`docs/phase-11/diverse-city/CONTENT-MATRIX.md`.

`DCFC-102` (reusable platform gap analysis) is `complete`. Claude Code
compared the approved specification against the actual current state of
`onzio-platform` — real schema, registries, and admin routes, not the
architecture plan's prose — and wrote the comparison to a new
`PLATFORM-GAP-ANALYSIS.md`. Notable findings: standings/homepage/About/Shop/
Sponsors/Roster/Branding all have existing tables and admin editors already
(directly matching Christian's standings confirmation above); dropdown
navigation and generic URL-protocol validation already exist platform-wide
with no new code needed; `tryouts` already has a registered route and
Pro-tier module entry but no schema, section type, or admin editor yet;
Programs and Contact are true gaps needing everything built from scratch;
and video capability is a genuine open question — the existing
YouTube-embed pattern doesn't cover Diverse City's self-hosted MP4 videos,
which is exactly what decision `DCFC-D105` needs to resolve. No club-specific
conditionals were proposed as a substitute for real reusable capability.
`DCFC-103` (lock content and presentation architecture) is now eligible, but
needs Christian's input on `DCFC-D104` (template mapping) and `DCFC-D105`
(video direction) before it can close. No hosted Supabase, Storage, Vercel,
Stripe, DNS, email, or production resource was mutated.

`DCFC-103` (lock content and presentation architecture) is `complete`,
approved by Christian on 2026-07-31 as decision `DCFC-D109`. **This closes
Phase 1 of the epic.** Its two deliverables are the normalized domain design
in `docs/phase-11/diverse-city/DOMAIN-DESIGN.md` (`onzio.programs`,
`onzio.contact_profile`, `onzio.contact_page_content`, `onzio.tryouts`) and
the new "Video Pipeline" section in `docs/onzio-platform-plan.md` recording
the Bunny.net Stream decision. Before approval, each of the design's
load-bearing claims was re-verified against real migration source rather
than the draft's own assertions — the `club_has_feature` Starter allowlist,
the pre-existing `onzio.site_social_links` table, `media_assets.surface`
being regex-constrained free-form rather than an enum, the absence of any
existing email/phone column, and the `homepage_hero_content` singleton
shape all confirmed. Two fixes were applied at Christian's direction:
`EPIC.md`'s pinned snapshot commit was corrected from the pre-`DCFC-003`
`08f7b53c…` to the approved `5bbdfa33…`, and an explicit column-constraint
policy was added to the design so `DCFC-202` is not left deciding lengths
and URL shapes ad-hoc while writing SQL. Writing that policy caught a real
latent bug: `homepage_hero_content` constrains CTA hrefs to internal paths
only (`^/[-A-Za-z0-9_/?#=&%.]*$`), and copying that pattern onto
`programs.external_cta_href` or `tryouts.registration_href` would have
rejected every external registration URL those columns exist to hold —
failing only when a club first saved a real partner link. Those columns now
mirror the `''`/local-path/`http:`/`https:`/`mailto:` allowlist already
enforced in `lib/admin-data-contract.ts`. No migration was written or
applied, no application code or test changed, and the isolated snapshot
repository was read but not modified (still clean at `5bbdfa3`).
`DCFC-201` (red contracts) is now `ready` but deliberately unassigned and
unstarted — eligibility is not authorization. No hosted Supabase, Storage,
Vercel, Stripe, DNS, email, or production resource was mutated.

`DCFC-201` (red contracts) is `complete` as of 2026-08-01, opening Phase 2.
It added 32 focused contracts across `tests/contracts/diverse-city-domains.test.ts`
and `tests/database/diverse-city-domains.test.ts` — 27 intentionally red, 5
green where they lock existing correct behavior. **The suite is now
deliberately red: `npm test` reports 27 failures, all in those two files.**
They describe the schema, RLS, tier gating, and presentation registrations
that `DCFC-202` and `DCFC-203` must build; per `AGENTS.md` they must not be
skipped, weakened, mocked, or satisfied with placeholder tables. All 549
previously-passing tests still pass (554 now, including the 5 new green
ones), so nothing regressed.

The package also seeded club `charlie` — Starter, active, and publicly live.
That combination existed nowhere before: Alpha and Lions are Pro, and Bravo
is Starter but onboarding/preview, so `can_read_club` rejects it before tier
is ever consulted. Without it the `DCFC-D108` tier coverage could not be
written, and it is the same gap that kept PF-002 invisible to the suite.
Eight database contracts were also caught passing as false greens — they
asserted only that an operation was rejected, and a missing table is itself a
rejection — so every negative assertion now names the specific PostgREST or
Postgres error code it expects (`42501` for a denial, `23514` for a check
violation, never `PGRST205`).

`DCFC-202` (schema, RLS, types, audit) is `complete` as of 2026-08-01.
`supabase/migrations/20260801120000_phase11_diverse_city_domains.sql` creates
`onzio.programs`, `onzio.contact_profile`, `onzio.contact_page_content`, and
`onzio.tryouts` exactly as `DOMAIN-DESIGN.md` specifies — composite
`(club_id, id)` uniqueness and tenant-safe composite foreign keys (including
`tryouts (club_id, program_id)` → `programs`, so a tryout cannot reference
another club's program), the approved column-length and href constraints, RLS
with four policies per table, audit and updated-at triggers, and
`(club_id, sort_order, …)` indexes. `club_has_feature` was additively extended
with `'contact'` per `DCFC-D108` while reproducing every security attribute of
the original definition. All four tables are registered in
`ADMIN_TABLE_FEATURES`, both contact tables in `SINGLETON_TABLES`, and
`lib/database.generated.ts` is regenerated.

All 17 database contracts pass, including the `DCFC-D108` tier behavior: an
anonymous reader of the Starter club `charlie` can read `contact_*` but gets
nothing from `programs`/`tryouts`, while the same reads succeed for a Pro
club.

`DCFC-203` (presentation routes, modules, and sections) is `complete` as of
2026-08-01. The previously unrecorded registry implementation remains intact:
neutral reusable `academy@1`, its `montserrat-inter-dmsans` primary font pack,
five `academy.*` sections plus the two shared homepage sections, the
`programs`/`contact` routes, and the `DCFC-D108` module entitlements. The audit's
two uncovered gaps are now closed:

- `tests/contracts/presentation-system.test.ts` pins a complete `academy@1`
  document through production-surface parsing, matching the existing
  `cinematic@1` and `clubhouse@1` precedent.
- Per approved decision `DCFC-D110`, `bebas-inter` now lists `academy@1` as a
  compatible template, preserving it as the universal fallback pack. A new
  generic contract asserts every template/font-pack compatibility edge in
  both directions so the two registries cannot drift silently again.

The new agreement contract was first run against the audited implementation
and failed on exactly the `academy@1`/`bebas-inter` mismatch before the fix.
Final verification is green: focused presentation contracts 9/9, TypeScript
clean, contracts 240/240, architecture 19/19, local database 70/70, and the
complete loopback-mapped suite 583/583 across 57 files. Lint passed with only
the three pre-existing analytics hook warnings, and `git diff --check` passed.
`DCFC-204` was subsequently completed as the final Phase 2 package; its current
evidence is recorded below. No hosted resource was mutated.

`PF-007` (database security-test hardening) is `complete` as of 2026-08-01.
The original register estimate of roughly twelve weak assertions was expanded
to the full reachable surface: 19 denial scenarios accepting any error, one
private-ledger read swallowing query errors, and one ignored rejected-write
result. `tests/helpers/database-security.ts` now enforces exact database and
Storage signatures and treats `PGRST204`/`PGRST205` as test-authoring errors.
All affected database tests use the helper or explicit success-plus-empty-row
assertions, focused helper contracts pin the failure semantics, and a new
architecture test scans the database suite for reintroduced generic denial
patterns. A temporary misspelled-column mutation failed on the exact
`PGRST204` route that used to pass, then was restored. Final verification:
TypeScript clean; contracts 244/244; architecture 20/20; local database 70/70;
full loopback-mapped suite 588/588 across 59 files; lint passed with only the
three pre-existing analytics warnings; `git diff --check` clean. No hosted
resource was mutated. `DCFC-204` was then assigned separately and completed as
recorded below.

`DCFC-204` (typed domain queries and protected mutations) is `complete` as of
2026-08-01, closing the Phase 2 gate. Generated database row aliases now feed
typed Programs, Contact, and Tryouts public mappings with explicit verified
tenant filters, active/visible behavior, media resolution, and fail-closed
errors. External actions share a strict URL/href normalizer; unsafe Program
CTAs disappear, while unsafe or closed Tryouts registration falls back only to
the tenant's validated public email. Strict table-specific Zod schemas now
protect all four Phase 2 tables behind the existing admin route's server-side
user, AAL2, tenant, membership, lifecycle, entitlement, payload, and `club_id`
checks. Phase 3 UI remains unstarted.

The red-first run failed 12 of 18 new contracts and exposed two meaningful
false-green routes. First, application authorization had a fourth entitlement
source, `STARTER_FEATURES`, that omitted Contact and denied a legitimate
Starter Contact mutation even though the database and presentation registries
allowed it; Contact is aligned there and PF-002 records that then-known fourth
source.
Second, the old Starter Contact RLS test asserted only that no query error
occurred, so an empty result passed. Seeded Charlie had no active subscription
and therefore was not actually publicly readable. The test now inserts and
requires exact tenant rows, and the local seed supplies the active Starter
subscription that the platform contract requires.

Final verification: focused query/mutation coverage 81/81; focused Diverse
City database coverage 20/20; local reset, generated-type check, and schema
lint passed;
TypeScript clean; contracts 267/267; architecture 20/20; local database 73/73;
full loopback-mapped suite 614/614 across 61 files; production build passed;
lint has only the three pre-existing analytics hook warnings; diff check clean.
No hosted resource was mutated. At that checkpoint `DCFC-301`, `DCFC-302`, and
`DCFC-303` were eligible but unstarted; `DCFC-301` was subsequently assigned
and completed as recorded below.

`DCFC-301` (Programs admin) is `complete` as of 2026-08-01. The new protected
`/admin/programs` surface provides the approved list/create/edit/reorder/media
workflow: every Programs text field, ordered highlights, layout variant,
active/hidden state, hero/detail media reference, and external CTA is editable.
It includes responsive list/editor composition, unsaved-change protection,
strict validation, and complete loading, empty, upload, success, and error
states. Programs appears in admin navigation only for Pro tenants, and a
manually reached Starter route fails closed before loading content. All reads
and writes use the server-mediated admin client; browser payloads never carry
authoritative tenant identity.

The secure media workflow uncovered and closed a real fifth entitlement-source
bug. Once `programs` became an accepted media surface, a direct AAL2 Storage
upload for a Starter club succeeded because the Phase 2 staging policy mapped
every surface except Shop and Standings to Starter-accessible Branding. The
application authorize route already denied the request, but Storage RLS—the
final boundary—did not. Migration
`20260802013518_dcfc_301_programs_media_entitlement.sql` explicitly maps the
Programs path segment to the Pro-only Programs feature for staging
insert/select/delete. A real local contract is pinned to Pro success and exact
Starter 403 denial, and PF-002 now records all five entitlement sources.

Final verification: focused Programs/query/media/admin coverage 78/78;
authenticated RLS/Storage coverage 6/6; from-scratch local database reset;
generated types and schema lint clean; TypeScript clean; contracts 276/276;
architecture 20/20; database 74/74; full loopback suite 624/624 across 62
files; production build includes `/admin/programs`; lint has only the three
pre-existing analytics hook warnings; diff check clean. No hosted resource was
mutated. `DCFC-302` and `DCFC-303` remain ready and unstarted; assign exactly
one next.

`DCFC-302` (Contact admin) is `complete` as of 2026-08-01. The protected
`/admin/contact` surface makes the approved ownership boundary visible and
enforceable: email, phone, service area, and optional hours are edited as
canonical shared club data, while eyebrow, headline, introduction, and hero
media are edited as Contact-page-only presentation. Social destinations stay
in the existing Branding editor and are linked from Contact rather than
duplicated. Shared client/server validation accepts empty states and valid
email/international telephone destinations while rejecting unsafe protocol
text. The page persists through the server-mediated admin client without a
client-supplied `club_id`, and no public form, message persistence, or
participant-data collection was added.

Contact hero uploads now use the secure authorize/stage/finalize pipeline.
Migration `20260802020000_dcfc_302_contact_media_entitlement.sql` explicitly
maps the Contact staging path to the Starter-accessible Contact feature at
Storage RLS instead of inheriting the generic Branding fallback. Local AAL2
evidence proves a Starter admin can write both Contact singletons and upload
Contact media.

Final verification: focused Contact/query contracts 32/32; from-scratch local
database reset; generated types and schema lint clean; TypeScript clean;
contracts 286/286; architecture 20/20; database 75/75; full loopback suite
635/635 across 63 files; production build includes `/admin/contact`; lint has
only the three pre-existing analytics hook warnings; diff check clean. No
hosted resource was mutated. `DCFC-303` remains ready and unstarted;
`DCFC-304` remains blocked on it.

`DCFC-303` (Tryouts admin) is `complete` as of 2026-08-01. The protected
`/admin/tryouts` surface provides a reusable multi-event list/create/edit/
reorder workflow with optional Program association, upcoming/open/closed
status, the complete approved content model, honest date/location/cost TBA
states, hero media, closed-state messaging, and externally hosted registration
CTA content. Missing registration destinations remain valid fail-closed
content; unsafe destinations and malformed dates are rejected before mutation.
The approved `DCFC-D102` no-FAQ decision is preserved, and strict regression
coverage rejects participant, payment, waiver, medical, registration-record,
and FAQ payload fields. All persistence remains server-mediated without a
browser-supplied tenant identity.

Tryouts hero uploads now use the secure authorize/stage/finalize pipeline.
Migration `20260802021531_dcfc_303_tryouts_media_entitlement.sql` explicitly
maps the Tryouts Storage path to the Pro-only Tryouts feature at the final RLS
boundary. Local AAL2 evidence proves Pro event CRUD/reorder and Tryouts media
success, exact Starter content and Storage denial, cross-tenant denial, and
database URL-constraint enforcement.

Final verification: focused Tryouts/query contracts 35/35; from-scratch local
database reset; focused real database coverage 29/29; generated types and
schema lint clean; TypeScript clean; contracts 297/297; architecture 20/20;
database 77/77; full loopback suite 648/648 across 64 files; production build
includes `/admin/tryouts`; lint has only the three pre-existing Analytics hook
warnings; migration history and diff checks are clean. No hosted resource was
mutated. `DCFC-304` is now eligible but remains unstarted.

`DCFC-202` also closed **PF-003** — `docs/onzio-platform-plan.md` now
documents the tier-entitlement mechanism under Row-Level Security: the
hardcoded Starter allowlist, Pro-by-default for unlisted feature names, and
the fact that `can_read_feature` gates anonymous public reads so the failure
mode is a blank page rather than an error. **PF-004** remains open and was
not actionable in this package — it concerns the Bunny.net video reference
column, which this migration does not add.

The Lions mockup conversion `/goal` is complete locally. The current Lions
public site uses the reusable published `clubhouse@1` presentation-template
boundary, editable Onzio content rows, Onzio media paths, the imported
homepage slideshow, inverse crest, and the three-jersey shop collection from
the mockup. No hosted project was mutated.

Final Lions roster QA and commit-packaging checkpoint:

- Updated the reusable Clubhouse roster cards so every Lions player and staff
  card renders its editable `nationality` value as an inline flag. Lions uses
  the already-installed bundled flag-icon set, avoiding the legacy shared
  `flags` bucket; Rose City continues using its migrated tenant-scoped
  `onzio-media` flag paths.
- Lions player cards are now presentational `<article>` elements with no link,
  button, profile hint, click navigation, or modal behavior. Staff cards are
  likewise non-interactive. The existing player-detail route remains available
  as a reusable registered route but is no longer exposed from Lions roster
  cards.
- Added focused contracts for player/staff flag rendering, deterministic Lions
  nationality rows, non-interactive Clubhouse cards, and the prohibition on
  legacy flag-bucket URLs.
- Added a reusable Lions Playwright roster acceptance check. Desktop 1440 x
  900 and mobile 390 x 844 both passed with 32/32 player flags and 6/6 staff
  flags visible, zero player/staff card links or buttons, no click-triggered
  route or dialog change, no broken images, no old source/transform/Next image
  URLs, no horizontal overflow, no framework overlay, and no browser console
  or page errors.
- Final screenshots are outside the repository under
  `/Users/christianalcala/.codex/visualizations/2026/07/31/019fb9b8-8288-79a2-8ac9-f3572133c148/`
  as `lions-roster-final-desktop.png` and
  `lions-roster-final-mobile.png`.
- Final verification passed `npx tsc --noEmit`, 223/223 contracts, 18/18
  architecture tests, 53/53 local database tests, 548/548 complete tests,
  `npm run db:types:check`, local `onzio`/`onzio_private` schema lint,
  `npm run lint`, `git diff --check`, the two-view Playwright roster gate, and
  the production build with 25 generated pages. Lint/build retain only the
  same three pre-existing analytics `react-hooks/exhaustive-deps` warnings.
- No Diverse FC file or asset was changed or copied. No hosted Supabase,
  Storage, Vercel, Stripe, DNS/domain, Auth/SMTP, email, credential, source
  Lions object, or Rose City production resource was mutated.
- No final local Lions implementation blocker is known. Hosted publication and
  infrastructure remain outside scope and continue to require explicit
  approval.

Latest `/goal` progress:

- Verified the mockup red jersey source object read-only at
  `https://ydvggllbrswfchgjhjhr.supabase.co/storage/v1/object/public/assets/onzioMockupsAssets/red-jersey-transparent.png`
  and copied it into the organized local asset folder as
  `/Users/christianalcala/Downloads/lionsFCAssets/Jersey/red-jersey-transparent.png`.
  The local file is PNG RGBA, 1402 x 1122, SHA256
  `4583de144d47b3a328eaebad5f69ad0d5ed4be7d59affed8f64eebdb2d2ad81c`.
- Added migration
  `supabase/migrations/20260730020818_phase9_shop_third_kit_variant.sql`,
  expanding `shop_kit_section`, `shop_kit_photos`, and
  `shop_carousel_photos` `kit_variant` constraints to
  `home|third|away`.
- Updated the Lions media planner/importer and checked-in
  `docs/phase-9/lions-media-import-plan.json` for all 10 organized assets:
  two crests, five slideshow photos, and three jerseys.
- Local Lions import now creates 10 `media_assets`, 5 homepage slideshow
  photos, 3 shop kit photos, 3 shop carousel photos, 13 ready content links,
  0 blocked content links, 10 source checksums, 10 normalized checksums, and
  14 tenant-scoped media relationships.
- Restored the homepage kit copy to the three-color mockup direction and
  renders Blue, Red, and White jerseys on the homepage and shop page.
- Updated the admin shop editor to expose Home, Third, and Away kit tabs while
  preserving the tenant request boundary and avoiding direct `club_id` payload
  acceptance in admin schemas.
- Removed the last direct `next/image` usage from the Clubhouse public routes
  so public images flow through the resilient image component contract.
- Updated the Clubhouse homepage display headings and roster page after
  re-checking the live `soccer-platform-mockups.vercel.app` reference. The
  reference uses Geist with tight negative display tracking
  (`letter-spacing` around `-0.055em`) and the roster surface uses the mockup's
  `roster-page`, `roster-filter-bar`, `player-card`, and `staff-card` layout
  rather than the earlier Onzio hero/overview roster layout.
- Added migration
  `supabase/migrations/20260730015524_phase9_site_branding_inverse_logo.sql`
  with `site_branding.inverse_logo_path` and `inverse_logo_asset_id`, including
  a composite `(club_id, inverse_logo_asset_id)` FK to `media_assets`.
- Regenerated `lib/database.generated.ts` from the local schema and updated
  `DBSiteBranding`, `fetchClubBranding`, and `ClubBrandingProvider` to expose
  both the primary crest and inverse crest.
- Updated the Lions media dry-run planner and checked-in
  `docs/phase-9/lions-media-import-plan.json` so `crest-white.png` is a ready
  `site_branding` content link instead of a blocked secondary-branding gap.
  The plan now reports 11 ready links, 0 blocked links, and hosted mutations 0.
- Updated `npm run migration:import:lions-media:local` to upsert the Lions
  white crest into `site_branding.inverse_logo_*` and reconcile it as a
  tenant-scoped media relationship. Reconciliation now proves 12 linked media
  relationships.
- Updated the Clubhouse footer and admin branding preview to prefer the
  inverse crest on dark backgrounds, falling back to the primary crest when a
  tenant has no inverse crest.
- No hosted Supabase project, Storage bucket/object, Vercel deployment,
  Stripe object, DNS/domain, Auth/SMTP setting, credential, email, or source
  Lions object was changed. The only source-project access was read-only
  public object verification/download of the red jersey.

Verification for the completed Lions mockup conversion:

- `npm run db:reset` passed locally and applied
  `20260730015524_phase9_site_branding_inverse_logo.sql` and
  `20260730020818_phase9_shop_third_kit_variant.sql`.
- `npm run db:types` regenerated `lib/database.generated.ts` from the local
  schema.
- `npm run migration:plan:lions-media -- ... --dry-run` regenerated the local
  plan with 10 assets, 13 ready content links, 0 blocked content links, and
  `hostedMutations: 0`.
- `npm run migration:import:lions-media:local` passed twice after reset. The
  final two idempotency runs both reused all 10 uploaded objects and reconciled
  10 media assets, 5 slideshow photos, 3 shop kit photos, 3 shop carousel
  photos, 13 ready links, 0 blocked links, 14 relationships, zero forbidden URL
  references, and `hostedMutations: 0`.
- Direct local Postgres verification confirmed the Lions `site_branding` row
  has both primary and inverse Onzio media paths and both media asset IDs.
- Playwright verification at `http://lions.localhost:3002/` and
  `http://lions.localhost:3002/shop` confirmed the footer uses the inverse
  crest asset `2eea11ef-0658-5633-9a59-74d570f300d6`, the homepage renders
  three kit products and "Three colors" / "Red Jersey" copy, the shop renders
  three product cards for Blue, Red, and White jerseys, no
  preview/sample/admin-preview copy, no old source URLs, no Supabase transform
  or `/_next/image` URLs, no broken visible images, and no horizontal overflow
  on desktop and mobile.
- Screenshots were saved outside the repo as
  `lions-clubhouse-third-kit-home-desktop.png`,
  `lions-clubhouse-third-kit-home-mobile.png`,
  `lions-clubhouse-third-kit-shop-desktop.png`, and
  `lions-clubhouse-third-kit-shop-mobile.png`.
- Playwright comparison against
  `https://soccer-platform-mockups.vercel.app/roster` and local
  `http://lions.localhost:3004/roster` confirmed the local roster now uses the
  mockup roster classes, Geist typography, 4 roster groups, player/staff card
  layout, no old source URLs, no image transforms, no broken visible images,
  and no horizontal overflow on desktop and mobile. Screenshots were saved as
  `live-mockup-roster-desktop.png`, `local-onzio-roster-desktop.png`, and
  `local-onzio-roster-mobile.png`.
- `npx tsc --noEmit` passed.
- `npx vitest run tests/contracts/lions-media-import-plan.test.ts tests/contracts/lions-media-local-import.test.ts`
  passed 7/7.
- `npm run lint` passed with the same three pre-existing analytics
  `react-hooks/exhaustive-deps` warnings.
- `npm run test:contracts` passed 220/220.
- `npm run test:architecture` passed 18/18.
- `npm run test:db` passed 53/53.
- `SUPABASE_TEST_*` loopback env `npm test` passed 544/544.
- Production build with loopback Supabase env passed.

Updated remaining `/goal` work:

- No remaining `/goal` implementation work is known for the local Lions mockup
  conversion. Production/hosted import, publication, DNS, Stripe, SMTP, and
  Rose City migration work remain outside this goal and still require explicit
  approval.

Previous `/goal` progress:

- Added the two remaining `soccerPlatformMockups` detail surfaces as reusable
  Onzio-backed Clubhouse routes:
  `/roster/[playerId]` and `/schedule/[fixtureId]`, with tenant re-exports at
  `/_clubs/[slug]/roster/[playerId]` and
  `/_clubs/[slug]/schedule/[fixtureId]`.
- Updated tenant middleware to rewrite public dynamic UUID paths for roster
  profiles and schedule match areas while preserving the tenant request
  boundary.
- Added `components/ClubhousePlayerProfilePage.tsx`, backed by editable
  Onzio `players`, active-season player stats, and player match-trend rows.
  Roster cards now link to stable player UUID detail paths.
- Added `components/ClubhouseMatchAreaPage.tsx`, backed by editable Onzio
  `matches` rows and media-resolved opponent/sponsor references. Schedule
  cards now link to stable match UUID detail paths while keeping directions as
  a secondary action.
- Carried `matches.id` through the public `Fixture` query mapping and added
  focused `fetchPlayerProfile` / `fetchFixtureById` helpers.
- Added a contract assertion that local Lions import rows expose UUID-safe
  player and match route params.
- Route inventory against `soccerPlatformMockups` is now covered by Onzio Pro
  equivalents: home, roster, roster detail, schedule, schedule detail, shop
  for mockup store, club/about for mockup club, sponsors, staff redirect, and
  stats.
- No hosted Supabase project, Storage bucket/object, Vercel deployment,
  Stripe object, DNS/domain, Auth/SMTP setting, credential, email, or source
  Lions object was changed.

Verification for the detail-route checkpoint:

- `npx tsc --noEmit` passed.
- `npx vitest run tests/contracts/lions-media-local-import.test.ts` passed
  4/4.
- `npm run migration:import:lions-media:local` passed locally with
  uploaded 0/reused 9 assets, 32 players, 4 matches, 1 published
  `clubhouse@1` presentation document/state/publication, zero forbidden URL
  references, and `hostedMutations: 0`.
- Playwright verification discovered real detail links from `/roster` and
  `/schedule`, then confirmed `/roster/{player_uuid}` and
  `/schedule/{match_uuid}` on desktop and mobile with no preview/sample/admin
  copy, no old `ydvggllbrswfchgjhjhr` URLs, no Supabase transform or
  `/_next/image` URLs, no broken visible images, no horizontal overflow, and
  visible profile/stats/match-info/back-link content.
- Screenshots were saved outside the repo under
  `/Users/christianalcala/.codex/visualizations/2026/07/29/019fafbe-a623-7d60-b690-b173ec29304c/`
  as `lions-clubhouse-player-detail-desktop.png`,
  `lions-clubhouse-player-detail-mobile.png`,
  `lions-clubhouse-match-detail-desktop.png`, and
  `lions-clubhouse-match-detail-mobile.png`.
- `npm run lint` passed with the same three pre-existing analytics
  `react-hooks/exhaustive-deps` warnings.
- `npm run test:contracts` passed 220/220.
- `npm run test:db` passed 53/53.
- Production build with loopback Supabase env passed and now includes
  `/_clubs/[slug]/roster/[playerId]`, `/_clubs/[slug]/schedule/[fixtureId]`,
  `/roster/[playerId]`, and `/schedule/[fixtureId]`.

Previous `/goal` progress:

- Added standalone Lions Pro public routes from the mockup:
  `/sponsors`, `/stats`, and `/staff`. Middleware now exposes these tenant
  paths and the `/_clubs/[slug]/*` re-export files are in place.
- Added `components/ClubhouseSponsorsPage.tsx`, backed by editable
  `site_sponsor_logos` rows. It renders the mockup-style "Backing the badge /
  Building the city" hero plus Title/Premier/Club partner tiers. The current
  Lions local rows map 1 title partner, 2 premier partners, and 3 club
  partners from the existing carousel/footer placements.
- Added `components/ClubhouseStatsPage.tsx`, backed by existing Onzio
  `fetchRoster` season-stat rows and `fetchSchedule` match rows. It renders the
  mockup-style "Form / Measured" hero, record/goals/clean-sheet overview, and a
  sortable player-leaders table. The mobile table was tightened after screenshot
  review so all columns fit in the viewport without horizontal scrolling.
- Added `/staff` as a redirect to `/roster#staff`, matching the mockup product
  behavior while preserving the roster page as the editable staff presentation
  surface.
- Playwright verification at `http://lions.localhost:3002/sponsors` confirmed
  6 sponsor cards across Title/Premier/Club tiers on desktop and mobile, no
  preview/sample/admin-preview copy, no old `ydvggllbrswfchgjhjhr` source URLs,
  no Supabase transform or `/_next/image` URLs, no broken visible images, and
  no horizontal overflow.
- Playwright verification at `http://lions.localhost:3002/stats` confirmed the
  Form/Measured hero, 4 overview tiles, 18 player-leader rows on desktop and
  mobile, no preview/sample/admin-preview copy, no old source/transform URLs,
  no broken visible images, and no horizontal overflow.
- Playwright verification at `http://lions.localhost:3002/staff` confirmed a
  redirect to `http://lions.localhost:3002/roster#staff`.
- Screenshots were saved outside the repo under
  `/Users/christianalcala/.codex/visualizations/2026/07/29/019fafbe-a623-7d60-b690-b173ec29304c/`
  as `lions-clubhouse-sponsors-desktop.png`,
  `lions-clubhouse-sponsors-mobile.png`,
  `lions-clubhouse-stats-desktop.png`, and
  `lions-clubhouse-stats-mobile.png`.
- No hosted Supabase project, Storage bucket/object, Vercel deployment,
  Stripe object, DNS/domain, Auth/SMTP setting, credential, email, or source
  Lions object was changed.

Verification for the standalone Pro route checkpoint:

- `npx tsc --noEmit` passed.
- `npm run test:contracts` passed 220/220.
- `npm run lint` passed with the same three pre-existing analytics
  `react-hooks/exhaustive-deps` warnings.
- Production build with loopback Supabase env passed and now includes
  `/_clubs/[slug]/sponsors`, `/_clubs/[slug]/staff`,
  `/_clubs/[slug]/stats`, `/sponsors`, `/staff`, and `/stats`.

Updated remaining `/goal` work:

- Replace remaining `club.slug === "lions"` rendering gates with true
  presentation-template resolution at the tenant request boundary so
  `clubhouse@1` becomes a reusable selected presentation template instead of a
  tenant-name branch.
- Decide whether to add a schema field for a secondary/dark crest and whether
  Christian wants to supply the missing red jersey asset for exact three-kit
  parity.

- Added `components/ClubhouseAboutPage.tsx` and routed only the Lions tenant
  through it from `/_clubs/[slug]/club/about` (and therefore
  `http://lions.localhost:3002/club/about` through tenant routing). The route
  uses existing editable Onzio `about_page_content` and `site_sponsor_logos`
  rows, rendering the mockup-style interior hero, manifesto/founding mark,
  mission quote, values/proof section, partner strip, and CTA. Rose City
  continues to use the legacy `AboutClubPageClient`.
- The mockup's disabled concept contact form and "messages are not sent" copy
  were intentionally not carried over.
- Playwright verification at `http://lions.localhost:3002/club/about`
  confirmed the route renders the Columbus hero, Lions story, 3 editable value
  rows, 3 carousel partner rows, no preview/sample/admin-preview/contact-demo
  copy, no old `ydvggllbrswfchgjhjhr` source URLs, no Supabase transform or
  `/_next/image` URLs, no broken visible images, and no horizontal overflow on
  desktop or mobile. The mobile hero type was tightened after screenshot review
  so the headline no longer clips.
- Screenshots were saved outside the repo under
  `/Users/christianalcala/.codex/visualizations/2026/07/29/019fafbe-a623-7d60-b690-b173ec29304c/`
  as `lions-clubhouse-about-desktop.png` and
  `lions-clubhouse-about-mobile.png`.
- No hosted Supabase project, Storage bucket/object, Vercel deployment,
  Stripe object, DNS/domain, Auth/SMTP setting, credential, email, or source
  Lions object was changed.

Verification for the about checkpoint:

- `npx tsc --noEmit` passed.
- `npm run test:contracts` passed 220/220.
- `npm run lint` passed with the same three pre-existing analytics
  `react-hooks/exhaustive-deps` warnings.
- Production build with loopback Supabase env passed and generated 25 pages,
  with the same analytics hook warnings.

Updated remaining `/goal` work:

- Add standalone sponsors/staff/stats public routes after confirming the
  platform route/entitlement/data contracts. Roster now includes technical
  staff and about/home/footer include sponsors, but standalone mockup routes are
  not yet added.
- Replace remaining `club.slug === "lions"` rendering gates with true
  presentation-template resolution at the tenant request boundary.
- Decide whether to add a schema field for a secondary/dark crest and whether
  Christian wants to supply the missing red jersey asset for exact three-kit
  parity.

- Added deterministic Lions roster/staff rows to the local-only Lions importer.
  `npm run migration:import:lions-media:local` now upserts 32 editable
  `players`, 28 `player_season_stats`, 4 `goalkeeper_season_stats`, and 6
  `staff` rows derived from the Lions mockup config, without adding schema and
  without hosted mutations.
- Added `components/ClubhouseRosterPage.tsx` and routed only the Lions tenant
  through it from `/roster`. The route uses existing Onzio `fetchRoster` and
  `fetchStaff` data, rendering a mockup-style dark hero, roster overview,
  grouped navy/red player cards, and technical staff cards. Rose City continues
  to use the legacy roster page.
- Updated the Lions local import contract so roster/staff counts are part of
  deterministic row generation and reconciliation.
- Local import reconciliation passed with `uploaded: 0`, `reused: 9`,
  9 media assets, 5 slideshow rows, 2 kit rows, 4 matches, 32 players,
  28 field stat rows, 4 goalkeeper stat rows, 6 staff rows, 6 sponsor rows,
  zero forbidden URL references, and `hostedMutations: 0`.
- Playwright verification at `http://lions.localhost:3002/roster` confirmed
  the route renders 32 player cards and 6 staff cards on desktop and mobile,
  with Goalkeepers/Defenders/Midfielders/Forwards/Technical Staff groups, no
  preview/sample/admin-preview copy, no old `ydvggllbrswfchgjhjhr` source URLs,
  no Supabase transform or `/_next/image` URLs, no broken visible images, and
  no horizontal overflow.
- Screenshots were saved outside the repo under
  `/Users/christianalcala/.codex/visualizations/2026/07/29/019fafbe-a623-7d60-b690-b173ec29304c/`
  as `lions-clubhouse-roster-desktop.png` and
  `lions-clubhouse-roster-mobile.png`.
- No hosted Supabase project, Storage bucket/object, Vercel deployment,
  Stripe object, DNS/domain, Auth/SMTP setting, credential, email, or source
  Lions object was changed.

Verification for the roster checkpoint:

- `npx vitest run tests/contracts/lions-media-local-import.test.ts` passed 4/4.
- `npx tsc --noEmit` passed.
- `npm run test:contracts` passed 220/220.
- `npm run lint` passed with the same three pre-existing analytics
  `react-hooks/exhaustive-deps` warnings.
- Production build with loopback Supabase env passed and generated 25 pages,
  with the same analytics hook warnings.

Updated remaining `/goal` work:

- Convert club/about to the mockup `ClubScreen` composition using existing
  editable about/story rows.
- Add sponsors/staff/stats public routes only after confirming the platform
  route/entitlement/data contracts for those surfaces; roster now includes
  technical staff, but `/staff` as a standalone mockup route is not yet added.
- Replace remaining `club.slug === "lions"` rendering gates with true
  presentation-template resolution at the tenant request boundary.
- Decide whether to add a schema field for a secondary/dark crest and whether
  Christian wants to supply the missing red jersey asset for exact three-kit
  parity.

- Added `components/ClubhouseSchedulePage.tsx` and routed only the Lions tenant
  through it from `/schedule`. It uses existing Onzio `seasons` and `matches`
  rows, with the mockup-style schedule hero, status filters, month rail, and
  match cards. Rose City continues to use the legacy schedule page.
- Added `components/ClubhouseShopPage.tsx` and routed only the Lions tenant
  through it from `/shop`. It uses existing editable Onzio shop kit rows/media,
  with the mockup-style store campaign, featured kit, catalog cards, service
  strip, and product modal. The public mockup's "Concept preview" purchase
  copy was intentionally not carried over.
- Cleared the generated `.next` cache during verification after the dev server
  hit stale missing vendor chunks. No source files were removed by that cleanup.
- Playwright verification at `http://lions.localhost:3002/schedule` confirmed
  the route renders the `clubhouse` schedule surface, 2 match cards, 8 visible
  positive-dimension images on desktop, no broken visible images, no old source
  URLs, no Supabase transform or `/_next/image` URLs, no preview/sample/admin
  preview copy, and no horizontal overflow.
- Playwright verification at `http://lions.localhost:3002/shop` confirmed the
  route renders the `clubhouse` store surface, 2 kit cards, 8 visible
  positive-dimension images on desktop, no broken visible images, no old source
  URLs, no Supabase transform or `/_next/image` URLs, no preview/sample/admin
  preview copy, and no horizontal overflow.
- Screenshots were saved outside the repo under
  `/Users/christianalcala/.codex/visualizations/2026/07/29/019fafbe-a623-7d60-b690-b173ec29304c/`
  as `lions-clubhouse-schedule-desktop-final.png` and
  `lions-clubhouse-shop-desktop-final.png`.
- No hosted Supabase project, Storage bucket/object, Vercel deployment,
  Stripe object, DNS/domain, Auth/SMTP setting, credential, email, or source
  Lions object was changed.

Verification for the latest route checkpoint:

- `npx tsc --noEmit` passed.
- `npm run test:contracts` passed 220/220.
- `npm run lint` passed with the same three pre-existing analytics
  `react-hooks/exhaustive-deps` warnings.
- Production build with loopback Supabase env passed and generated 25 pages,
  with the existing Supabase Edge-runtime warning and the same analytics hook
  warnings.

Updated remaining `/goal` work:

- Convert Lions roster/profile next. The current local Lions importer does not
  seed a full roster/staff dataset yet, so route parity will need either a
  Lions roster/staff content import from the mockup config into editable Onzio
  rows or a polished empty-state route until real club data is supplied.
- Convert club/about to the mockup `ClubScreen` composition using existing
  editable about/story rows.
- Add sponsors/staff/stats public routes only after confirming the platform
  route/entitlement/data contracts for those surfaces; avoid publishing
  sample-only analytics or staff content as production club content.
- Replace remaining `club.slug === "lions"` rendering gates with true
  presentation-template resolution at the tenant request boundary.
- Decide whether to add a schema field for a secondary/dark crest and whether
  Christian wants to supply the missing red jersey asset for exact three-kit
  parity.

- Added `clubhouse@1` to `packages/presentation/index.ts`, including the
  Geist font pack, Lions mockup-derived homepage sections
  (`clubhouse.hero`, `clubhouse.slideshow`, `clubhouse.kits`,
  `clubhouse.partners`), Pro route/module support for staff/stats/profiles,
  and readiness logic that recommends `clubhouse@1` for clubs with a modest
  approved photo set.
- Added a pinned `clubhouse@1` contract document in
  `tests/contracts/presentation-system.test.ts` so the Lions mockup-derived
  template cannot regress into an unregistered tenant branch.
- Renamed the public Lions homepage extraction to
  `components/ClubhouseHomePage.tsx` and renamed the scoped CSS/classes from
  `lfc-*` to reusable `clubhouse-*` names while keeping Lions routed through
  this renderer locally.
- Converted the non-Rose-City homepage slideshow to the mockup's class-based
  matchday slideshow structure and styling, using the 5 imported Onzio
  slideshow assets and removing the extra season label that made it drift from
  the reference mockup.
- Kept the public site free of `Interactive concept preview`, `sample content
  only`, and public `Admin preview` copy. The local dev-only Next indicator is
  disabled through `devIndicators: false` in `next.config.mjs`; the Vercel
  analytics script is now production-only to avoid a local false 404.
- Final Playwright desktop/mobile verification at
  `http://lions.localhost:3002/` confirmed the hero starts at `top: 0`, fills
  the full viewport on desktop and mobile, the matchday slideshow renders
  full-width, there is no horizontal overflow, all visible images have positive
  natural dimensions, no old `ydvggllbrswfchgjhjhr`, Supabase transform, or
  `/_next/image` URLs render, and no preview/sample/admin-preview text appears.
- Screenshots were saved outside the repo under
  `/Users/christianalcala/.codex/visualizations/2026/07/29/019fafbe-a623-7d60-b690-b173ec29304c/`
  as `lions-clubhouse-desktop-final-2.png` and
  `lions-clubhouse-mobile-final-2.png`.
- No hosted Supabase project, Storage bucket/object, Vercel deployment,
  Stripe object, DNS/domain, Auth/SMTP setting, credential, email, or source
  Lions object was changed.

Verification for this `/goal` checkpoint:

- `npm run migration:import:lions-media:local` passed idempotently with
  `uploaded: 0`, `reused: 9`, 9 media assets, 5 slideshow rows, 2 kit rows,
  11 relationships, zero forbidden URL references, and `hostedMutations: 0`.
- `npx tsc --noEmit` passed.
- `npx vitest run tests/contracts/presentation-system.test.ts tests/contracts/homepage-slideshow.test.ts tests/contracts/lions-media-local-import.test.ts`
  passed 13/13.
- `npm run test:contracts` passed 220/220.
- `npm run test:architecture` passed 18/18.
- `npm run lint` passed with the same three pre-existing analytics
  `react-hooks/exhaustive-deps` warnings.
- Production build with loopback Supabase env passed and generated 25 pages,
  with the existing Supabase Edge-runtime warning and the same analytics hook
  warnings.

Remaining `/goal` work:

- Convert the rest of the Lions public experience route-by-route from the
  mockup into editable Onzio-backed surfaces: roster/profile, schedule,
  store, club/about, sponsors, staff, and stats where data support exists.
- Replace the remaining `club.slug === "lions"` routing gates with an actual
  published presentation/template selection once the renderer integration
  resolves presentation documents at the tenant boundary.
- Decide whether to add a schema field for a secondary/dark crest and whether
  Christian wants to supply the missing red jersey asset for exact three-kit
  parity.
- Run local DB/full-suite/build verification after the remaining routes are
  ported.

The local Lions homepage now uses `soccerPlatformMockups`
(`/Users/christianalcala/Downloads/onzioMockups`) as the visual source of
truth, with the extraction kept tenant-gated and editable through existing
Onzio data surfaces.

- Added `components/LionsProspectHomePage.tsx` and routed only `club.slug ===
  "lions"` through the mockup homepage order: hero, next match, matchday
  slideshow, kit collection, club story, and partners. Rose City keeps the
  existing homepage composition.
- Added Lions-only header/footer branches in `components/Nav.tsx` and
  `components/Footer.tsx` matching the mockup's crest-first, compact
  Home/Roster/Schedule/Shop navigation and typography-based partner/footer
  treatment.
- Added scoped `lfc-*` visual styles in `styles/globals.css` for the
  mockup-style next-match stage, kit runway, story section, partners, header,
  footer, and responsive mobile behavior.
- Updated the local-only Lions importer so the same idempotent command now
  seeds editable presentation rows for the mockup extraction: 2 seasons,
  4 matches, homepage hero copy, 5 slideshow photos, 2 jersey media rows,
  about/story content, 6 partner names, and social links.
- Updated `components/PhotoSlideshow.tsx` so the Lions/prospect slideshow is
  visible by default instead of relying on the legacy Rose City scroll reveal;
  Rose City still keeps the legacy reveal behavior.
- The local importer reconciliation now proves 9 media assets, 1 homepage hero
  row, 5 slideshow rows, 2 shop kit photos, 2 shop carousel photos, 4 matches,
  6 sponsor rows, 11 media relationships, zero old source/transform/Next image
  URLs, and `hostedMutations: 0`.
- Final desktop/mobile Playwright verification at
  `http://lions.localhost:3002/` confirmed hero, next match, slideshow, kit,
  story, and partners all render; no League Standings/Behind the Rose leakage;
  and zero `ydvggllbrswfchgjhjhr`, Supabase transform, or `/_next/image` URLs.
- Screenshots were saved outside the repo under
  `/Users/christianalcala/.codex/visualizations/2026/07/29/019fafbe-a623-7d60-b690-b173ec29304c/`
  as `lions-mockup-extraction-desktop-final.png` and
  `lions-mockup-extraction-mobile-final.png`.
- No hosted Supabase project, Storage bucket/object, Vercel deployment,
  Stripe object, DNS/domain, Auth/SMTP setting, credential, email, or source
  Lions object was changed.

Verification for this soccerPlatformMockups extraction:

- `npm run migration:import:lions-media:local` passed idempotently with
  `uploaded: 0`, `reused: 9`, and `hostedMutations: 0`.
- `npx tsc --noEmit` passed.
- `npx vitest run tests/contracts/homepage-slideshow.test.ts tests/contracts/lions-media-local-import.test.ts`
  passed 6/6.
- `npm run test:contracts` passed 219/219.
- `npm test` passed 542/542 when run with loopback Supabase test env.
- `npm run lint` passed with the same three pre-existing analytics
  `react-hooks/exhaustive-deps` warnings.
- Production build with loopback Supabase env passed and generated 25 pages,
  with only the same analytics hook warnings.

Remaining visible/content gap:

- The liked mockup has a third red jersey card, but Christian's organized
  `lionsFCAssets` folder currently contains only blue and white jerseys. Add
  `red-jersey-transparent.png` to the organized source folder and extend the
  import plan/kit rendering when true three-kit parity is required.

The LionsFC homepage first section now matches the prospect-template direction
locally while keeping content editable and preserving the legacy Rose City
video hero.

- Added the tenant-scoped `onzio.homepage_hero_content` table in
  `supabase/migrations/20260729223334_phase9_homepage_hero_content.sql`,
  with explicit grants, RLS policies, audit trigger, and updated-at trigger.
  The table stores first-section headline, intro, and CTA copy. It is a
  homepage feature surface: anonymous users can read it only for publicly
  accessible clubs, and authenticated mutations remain behind the existing
  tenant/MFA/admin authorization path.
- Registered `homepage_hero_content` in the admin data contract and singleton
  handling, added a Hero tab to `/admin/homepage`, and updated
  `fetchHomepageContent` so public/admin homepage queries return hero,
  slideshow, and Behind the Rose content together.
- Updated `components/Hero.tsx` so Rose City keeps the existing video hero,
  while non-Rose-City tenants render a crest-led prospect-style first section
  using tenant colors, imported crest media, editable hero copy, and editable
  CTA labels/links.
- Seeded Lions locally with the prospect-template copy:
  `Capital City.` / `Roar as One.`, intro copy for Columbus, and CTAs to
  `/schedule` and `/roster`.
- Re-ran the local-only Lions importer after a loopback Supabase reset. The
  second idempotency run reported `uploaded: 0`, `reused: 9`, 9 media assets,
  1 homepage hero row, 5 slideshow rows, 2 shop kit photo rows, 2 shop carousel
  rows, zero forbidden old source/transform URLs, and `hostedMutations: 0`.
- Local visual verification used a dev server on port 3002 with
  `ONZIO_LOCAL_TENANT_SLUG=lions`. Desktop verification of
  `http://lions.localhost:3002/` found the Lions first-section copy, 9 visible
  local `onzio-media` images, and zero `ydvggllbrswfchgjhjhr`, Supabase
  transform, or `/_next/image` URLs.
- Mobile verification at 390×844 confirmed the headline and CTAs fit inside
  the viewport with no horizontal overflow, the Lions crest hero renders, and
  old/transform/Next image URL counts remain zero.
- Updated screenshots were saved outside the repo under
  `/Users/christianalcala/.codex/visualizations/2026/07/29/019fafbe-a623-7d60-b690-b173ec29304c/`
  as `lions-homepage-hero-updated.png` and
  `lions-homepage-hero-updated-mobile.png`.
- No hosted Supabase project, Storage bucket/object, Vercel deployment,
  Stripe object, DNS/domain, Auth/SMTP setting, credential, email, or source
  Lions object was changed.

Verification for this Lions editable hero pass:

- `npm run db:reset` passed against local loopback Supabase.
- `npm run db:types` passed and regenerated `lib/database.generated.ts`.
- `npm run migration:import:lions-media:local` passed twice; the second run
  proved idempotency with all 9 objects reused.
- `npx vitest run tests/contracts/lions-media-local-import.test.ts lib/__tests__/admin-data-contract.test.ts`
  passed 9/9.
- `npx tsc --noEmit` passed.
- `npm run test:contracts` passed 219/219.
- `npm run test:architecture` passed 18/18.
- Focused `tests/database/schema-rls.test.ts` passed 27/27.
- `npm run test:db` passed 52/52.
- `npm test` passed 542/542.
- `npm run db:types:check` passed.
- `npm run lint` passed with the same three pre-existing analytics
  `react-hooks/exhaustive-deps` warnings.
- Production build with loopback Supabase env passed and generated 25 pages,
  with only the same analytics hook warnings.

Safest next step:

- Review the local Lions homepage at `http://lions.localhost:3002/`; if the
  first-section direction is approved, continue by adding the remaining
  Lions editable content rows for schedule, roster, about/story, sponsors, and
  standings using the same local-only import/reconciliation pattern.

The local-only LionsFC tenant/media import is implemented and verified against
loopback Supabase with no hosted mutation.

- Added local import/reconciliation logic in
  `lib/migration/lions-media-local-import.ts` and CLI
  `scripts/import-lions-media-local.ts`, exposed as
  `npm run migration:import:lions-media:local`.
- The importer consumes the checked-in Lions dry-run manifest and Christian's
  organized local source folder at `/Users/christianalcala/Downloads/lionsFCAssets`.
  It requires `--execute-local --confirm-local` internally through the npm
  script, maps Supabase CLI loopback env values, refuses non-loopback Supabase
  URLs, and performs no hosted actions.
- Local Lions tenant identity:
  `9d292f0a-6f93-54b1-b21c-ce2d0af3afa7`, slug `lions`, hostname
  `lions.localhost`, `active`/`live`, Pro tier, with a local-only active
  subscription projection so anonymous public rendering is allowed by existing
  runtime-access/RLS contracts.
- Local import behavior:
  re-reads all 9 organized source assets, verifies source checksums, re-runs
  validation/normalization, verifies normalized checksums, uploads or reuses
  immutable objects in local `onzio-media`, upserts `media_assets`, and links
  `site_branding`, 5 `homepage_slideshow_photos`, 2 `shop_kit_photos`, and
  2 `shop_carousel_photos`.
- `crest-white.png` remains imported as a published branding media asset but
  intentionally unlinked because no supported secondary/dark crest schema field
  exists yet.
- `npm run migration:import:lions-media:local` was run twice successfully. The
  second run reported `uploaded: 0`, `reused: 9`, 9 media assets, 5 slideshow
  rows, 2 shop kit photo rows, 2 shop carousel rows, 10 linked relationships,
  zero forbidden old source/transform URLs, and `hostedMutations: 0`.
- Local visual verification used a dev server on port 3001 with
  `ONZIO_LOCAL_TENANT_SLUG=lions`. Curl with `Host: lions.localhost:3001`
  returned HTTP 200 and `x-onzio-cache-tenant:
  9d292f0a-6f93-54b1-b21c-ce2d0af3afa7`.
- Playwright verified `http://lions.localhost:3001/` rendered 8 visible
  local `onzio-media` images, including the crest and 5 slideshow photos, with
  zero old `ydvggllbrswfchgjhjhr`, Supabase transform, or `/_next/image` URLs.
- Playwright verified `http://lions.localhost:3001/shop` rendered 6 visible
  local `onzio-media` images for the default home kit. Clicking the Away tab
  rendered 4 visible instances of the white jersey object
  `7ea389f3-97d6-57da-8a53-5256c043168e.webp`, with zero forbidden URLs.
- Screenshots were saved outside the repo under
  `/Users/christianalcala/.codex/visualizations/2026/07/29/019fafbe-a623-7d60-b690-b173ec29304c/`
  as `lions-homepage.png`, `lions-shop.png`, and `lions-shop-away.png`.
- No hosted Supabase project, Storage bucket/object, Vercel deployment,
  Stripe object, DNS/domain, Auth/SMTP setting, credential, email, or source
  Lions object was changed.

Verification for this local Lions import pass:

- `npx tsc --noEmit` passed.
- `npx vitest run tests/contracts/lions-media-import-plan.test.ts tests/contracts/lions-media-local-import.test.ts`
  passed 7/7.
- `npm run test:contracts` passed 219/219.
- `npm run test:architecture` passed 18/18.
- First local DB/full-suite runs hit transient local Supabase Auth MFA
  challenge failures in `tests/database/authenticated-rls.test.ts`; rerunning
  the focused file passed 5/5, `npm run test:db` passed 51/51, and `npm test`
  passed 540/540.
- `npm run lint` passed with the same three pre-existing analytics
  `react-hooks/exhaustive-deps` warnings.
- Production build with loopback Supabase env passed and generated 25 pages,
  with only the same analytics hook warnings.

Safest next step:

- Add explicit schema/support for a secondary or dark crest field if
  `crest-white.png` should be used by templates/navigation/footer, then build
  a staging importer using the same manifest/reconciliation pattern behind
  fresh explicit approval for any hosted tenant provisioning, Storage uploads,
  database writes, deployment, Stripe, DNS, Auth/SMTP, credential, or email
  action.

The first LionsFC Phase 9 media-import planning pass is complete locally with
no hosted mutation.

- Added a dry-run-only Lions media planner at
  `lib/migration/lions-media-plan.ts` plus CLI wrapper
  `scripts/plan-lions-media-import.ts`, exposed as
  `npm run migration:plan:lions-media`.
- Generated the checked-in planning artifact
  `docs/phase-9/lions-media-import-plan.json` from Christian's organized local
  asset folder under `/Users/christianalcala/Downloads/lionsFCAssets`
  (`Logos`, `Jersey`, and `Slideshow`).
- The artifact inventories the supplied `ydvggllbrswfchgjhjhr` source project,
  `assets` bucket, and `onzioMockupsAssets` prefix in read-only form; records
  byte size, detected MIME, dimensions, alpha, source checksum, normalized
  output metadata, destination UUID paths, and content-link intent.
- The dry run planned 9 media assets, 10 ready content links, 1 blocked content
  link, 4,195,648 source bytes, 853,838 normalized bytes, zero checksum
  mismatches, zero hosted mutations, and plan digest
  `09a050d11f6df4383c7a9358da53b95099292426be5388c31467db9c5d69524b`.
- The planning-only Lions tenant UUID used in the artifact is
  `9d292f0a-6f93-54b1-b21c-ce2d0af3afa7`. This is not a provisioned hosted
  tenant and must be replaced or explicitly accepted during a future approved
  non-production provisioning step.
- Reusable existing media capabilities: `buildStoragePath`, `parseStoragePath`,
  `validateMediaUpload`, `normalizePhoto`, `normalizeGraphic`,
  signed upload authorization, private staging/public media buckets,
  immutable `media_assets`, cleanup queue, and raw public object URL delivery.
- Current schema/API gaps for Lions import: `site_branding` supports only
  `club_logo_asset_id`, so `crest-white.png` has no supported secondary/dark
  logo field; and `publishAuthorizedMedia` publishes `media_assets` but does
  not transactionally link assets into branding, slideshow, or shop content
  tables. The organized `Jersey` folder contains two jerseys, so the dry-run
  plan maps blue as `home` and white as `away`.
- No hosted Supabase project, Storage bucket/object, Vercel deployment,
  Stripe object, DNS/domain, Auth/SMTP setting, credential, or email was
  changed. The source Lions objects were not deleted.

Verification for this Lions planning pass:

- `npx vitest run tests/contracts/lions-media-import-plan.test.ts` passed 3/3.
- `npx tsc --noEmit` passed.
- `npm run test:contracts` passed 215/215.
- `npm run test:architecture` passed 18/18.
- `npm run lint` passed with the three pre-existing analytics
  `react-hooks/exhaustive-deps` warnings.
- Initial plain `npm test` / `npm run test:db` failed because local Supabase
  test credentials were not mapped and the sandbox blocked Supabase CLI
  telemetry/env writes. After `npm run db:reset` and rerunning with loopback
  `supabase status -o env` values mapped into `SUPABASE_TEST_*`, the local DB
  suite passed 51/51 and the full suite passed 536/536.
- Production build with loopback Supabase env passed and generated 25 pages,
  with only the same three analytics hook warnings.

Safest next step:

- Decide whether to add explicit schema support for a secondary/dark crest
  before implementing the actual importer. After that, provision or identify a
  Lions tenant in an approved non-production environment, then build the
  importer against the existing private
  staging/validation/normalization/publication boundary. Any hosted source
  read with credentials, destination tenant provisioning, Storage upload,
  database write, deployment, Stripe, DNS, Auth/SMTP, credential, or email
  action still requires fresh explicit approval.

Phase 9.1 through 9.3 have started locally with no hosted or production
mutation.

- Added checked-in baseline inventories for Rose City `cinematic@1` and the
  read-only local Deportivo Olimpico snapshot `heritage@1` under
  `docs/phase-9/baselines/`.
- Added the internal `packages/presentation` boundary with schema parsing,
  neutral template registrations, section/route/module/font registries,
  semantic theme validation, production provenance rejection, template
  compatibility switching, readiness recommendations, and operator override
  records.
- Added the local Phase 9 migration
  `supabase/migrations/20260729040045_phase9_presentation_system.sql` for
  immutable `presentation_documents`, `presentation_state`, and append-only
  `presentation_publications`, including composite tenant pointers, public
  published-only document reads, member protected reads, service-role write
  boundary, immutable triggers, and generated database types.
- Local Supabase was reset only against the loopback development instance.
  No hosted Supabase, Vercel, Stripe, DNS/domain, Auth, email, credential, or
  production setting was changed.

Phase 8 operational closeout was executed under Christian's explicit approval
on 2026-07-28 and verified at `2026-07-29T01:37:37Z`.

- The immutable final frozen export at
  `/Users/christianalcala/Downloads/onzio-migration-private/rose-city-final-freeze-2026-07-27T2234Z-v2`
  remains the off-repository recovery record. All 586 ledger checksums pass.
  Its complete manifest records 24 tables, 209 rows, 14 Storage buckets, 557
  objects, 1,728,725,700 Storage bytes, three minimized Auth users, zero
  production mutations, and a passed secret scan.
- Legacy Vercel project `rose-city-website`
  (`prj_lMYzzUcUxR1iFwYTQZW71OYsgbv5`) was permanently deleted. Its immutable
  deployment now returns HTTP 410 and its final
  `rcfc-soccer-website.vercel.app` alias returns HTTP 404.
- Legacy Supabase project `Rose City Website`
  (`nsgtkwqkbyxkiwrhzsje`, East US) was permanently deleted. Its Supabase
  hostname no longer resolves.
- Current Onzio production was excluded from both deletions.
  `https://onzio-rcfc.vercel.app` still returns HTTP 200 and current production
  Supabase ref `ioalthwsdrlzrubomrow` remains reachable.
- The Rose City no-edit content freeze that began at
  `2026-07-27T22:34:39Z` is formally released as of
  `2026-07-29T01:37:37Z`. Christian Javier Alcala is the recorded
  administrator and this closeout record is the release notice; no email was
  sent.
- A daily abandoned-staging-media cleanup is defined for `10:00 UTC` in
  `vercel.json` at `/api/cron/media-cleanup`. The route requires Vercel's
  `CRON_SECRET`, reports incomplete cleanup as HTTP 500, and exposes no provider
  error details. A fresh sensitive `CRON_SECRET` is configured for Production
  only. Vercel Cron Jobs is enabled and shows the installed path with schedule
  `0 10 * * *` (`10:00 UTC`; Hobby execution has a one-hour window).
- The approved production activation first deployed commit `5bd6baa`. Live
  verification caught a pre-handler HTTP 500 because its cron bundle loaded
  `sharp` and the deployment lacked a loadable Linux libvips binary. Commit
  `a5ad8a0` moved cleanup into a sharp-free privileged module and added a
  regression contract. Ready production deployment
  `dpl_CVAdyYykHK47z6LdsYxmf9znWUqf` now serves
  `https://onzio-rcfc.vercel.app`: the site returns HTTP 200 and an
  unauthenticated cron request returns JSON HTTP 401.
- Activation verification on the corrected tree passed: 7/7 focused cron
  contracts, standalone TypeScript, 189/189 contracts, 18/18 architecture,
  48/48 isolated local database tests, 498/498 complete tests, lint, and the
  production build with 25 generated pages. Lint/build reported only the three
  pre-existing analytics hook warnings. After reconciling the production
  evidence back onto `staging`, the final branch-wide gate passed standalone
  TypeScript, 206/206 contracts, 18/18 architecture, 48/48 isolated local
  database tests, 524/524 complete tests, lint, and the same 25-page production
  build.

Under Christian's explicit approval,
`info@rosecityfutbolclub.com` was permanently removed from Onzio production
authentication. Before deletion it had one active Rose City owner membership,
one live session, one password identity, and one verified TOTP factor; it owned
no Storage objects, exports, or media records. Its membership was removed
before the Auth Admin deletion. Post-change verification found zero matching
Auth users, memberships, sessions, identities, and MFA factors.
`christianjavieralcala@gmail.com` remains the active Rose City owner. No email
was sent.

Under Christian's explicit domain-change approval,
`rosecityfutbolclub.com` and `www.rosecityfutbolclub.com` were removed from
Vercel and now return HTTP 404. The existing Vercel project retained project ID
`prj_I362ysmh9cse5cRxnL7db4dOhsEs`, was renamed to `onzio-rcfc`, and now has
one verified project-domain record: `onzio-rcfc.vercel.app`. Production
deployment `dpl_6QBiJ2CAN6opoNQJqVuxU3Q1YbrG` is `READY` and owns that
hostname. The Rose City production tenant's former apex row is inactive and
its primary row is now the verified `onzio-rcfc.vercel.app` hostname.
Production Supabase Auth uses the new Site URL and only the new recovery
callback entries. Existing live Stripe endpoint
`we_1TwEpdK6WajTkwHYD5SEYzXX` remains active with the same signing secret and
seven enabled events; only its URL changed to
`https://onzio-rcfc.vercel.app/api/stripe/webhook`. Focused monitor commits
`7c85567` (`staging`) and `10559e5` (`main`) use the new hostname. All eight
public/auth routes returned HTTP 200 and the final production media gate passed
4/4 on desktop and iPhone, including forced image-origin failure. GitHub
Actions run
[`30409932333`](https://github.com/404christiann/onzio-platform/actions/runs/30409932333)
then passed the same 4/4 checks from a clean runner against the new hostname.

The Phase 8 repository closeout is reconciled on `staging`. Frozen cutover
domains and the former owner remain only in an immutable historical manifest;
the current-state manifest records `onzio-rcfc.vercel.app`,
`christianjavieralcala@gmail.com` as the sole active owner, and the retired
domains/removed identity separately. The historical production import command
is a fail-closed tombstone with no credential, Supabase client, SQL, Storage,
or subprocess mutation path. Its invocation exits at the retirement guard
before reading inputs. Local replay remains loopback-only.

Closeout verification passed: 155/155 focused Phase 8 tests; 15/15 focused
local Auth/Stripe/Storage database tests; standalone TypeScript; 199/199
contracts; 18/18 architecture tests; 48/48 database tests; 517/517 complete
tests; lint; and the production build with 25 generated pages. Lint/build
reported only three pre-existing analytics hook warnings. No hosted database,
Storage, Vercel, Stripe, DNS/domain, Auth/SMTP, credential, or email mutation
was performed during repository closeout.

The approved site-wide image reliability change is implemented on `staging`.
Commits `6ca7a4a` and `6669b98` globally bypass runtime Next/Vercel image
optimization, route public and admin image consumers through raw resilient
delivery, add context-specific photo/person/shop/trophy/logo fallbacks, preserve
the existing normalized immutable upload boundary, and add architecture,
contract, and browser coverage. The production-shaped Rose City rehearsal was
replayed only into loopback Supabase: all 209 source rows and 515 normalized
media objects reconciled. Its six public routes plus the roster player modal
passed direct-image checks with positive visible `naturalWidth`, no
`/_next/image`, and no Supabase Image Transformation URLs on desktop and
iPhone viewports. Forced image-origin failure passed on both viewports with
deliberate fallbacks and no completed broken-image nodes. That gate caught one
additional real mobile defect: an animated sponsor logo could move into view
before native lazy loading began. Focused commit `bde1c5d` makes the small
normalized marquee logos eager and narrows modal checks to the modal boundary;
it is pushed to `staging`, and GitHub reports its Vercel build successful.
Final local verification: TypeScript passed; 196/196 contracts, 18/18 architecture tests,
48/48 database tests, and 514/514 complete tests passed; lint and the production
build passed with only three pre-existing analytics hook warnings. No hosted
database, Storage object, email, credential, or setting changed. Under
Christian's separate production approval, verified staging commit `bde1c5d`
was merged into default branch `main` as release commit `13f7d9f`; the release
tree is byte-for-byte identical to `staging`. Vercel rebuilt it with the
Production environment and made deployment
`dpl_GnHynFbtFXqbGhmKvgXJa8SLXoDJ` `READY` for the Rose City apex and `www`
domains. The site-media monitor is active on `main`, runs daily at `15:17 UTC`,
and supports manual execution. Its immediate production run passed 4/4 locally,
then GitHub Actions run
[`30408562137`](https://github.com/404christiann/onzio-platform/actions/runs/30408562137)
passed the same four checks from a clean runner in 1m57s: normal direct-image
health and simulated image-origin failure on desktop and iPhone. All six public
routes plus `/admin/login` and
`/admin/update-password` returned HTTP 200, and the new deployment had zero
error-level runtime logs in the post-deploy scan.

The roster-photo outage was traced to Vercel image optimization returning HTTP
402 while the underlying raw Supabase objects remained available. Roster player
and staff cards now try the Vercel-optimized image first, retry the same object
URL unoptimized, and show an accessible initials fallback only if the origin
also fails. Player cards now advertise the correct two-column mobile width
instead of `100vw`. Regression coverage includes the delivery state machine,
all roster card/modal consumers, responsive sizing, stable browser hooks, and a
scheduled/manual Playwright check that forces optimizer HTTP 402 and requires
positive image `naturalWidth` on desktop and iPhone viewports. Focused commit
`8dcd6ef` is pushed to `staging`, and GitHub reports its Vercel deployment
successful. Under Christian's explicit production approval, Vercel rebuilt the
same source commit against the Production environment and assigned the Rose
City domains to deployment `dpl_DgAjgXv6kdxoPQdoNNPiE5przVfi`, which is
`READY`. Verification: TypeScript passed; 192/192 contracts, 16/16 architecture
tests, 48/48 local database tests, and 508/508 complete tests passed; lint and
production build passed with only the seven pre-existing warnings; production
dependency audit reported zero vulnerabilities. The production forced-402
Playwright gate passed 2/2: desktop Chromium and the iPhone viewport scrolled
through every roster card, required a positive image `naturalWidth`, confirmed
raw `onzio-media` fallback, and opened a working player modal. A separate normal
Chrome check found 33 roster image nodes, zero completed broken images, no
framework error overlay, and no console errors. No production setting, database
record, email, or media object changed. GitHub's repository default branch
remains `main`; the original roster-only workflow has since been superseded by
the site-wide scheduled monitor in `7d68659`.

### Historical Phase 8 cutover and incident chronology

The remaining entries in this Current State section preserve the chronological
cutover, Auth-email, media, and recovery evidence. References to the former
custom domains, the deleted `info@rosecityfutbolclub.com` identity, the
built-in mailer, or an active rollback observation window describe the state at
that recorded checkpoint; they are not current configuration or instructions
to restore retired state.

Phase 8 production cutover is complete and accepted. The freeze began at
`2026-07-27T22:34:39Z`; all ten reviewed migrations, the authoritative
209-row/24-table source plan, 515 normalized immutable media assets, two
approved Auth/member identities, and both Rose City domains are present in
Onzio production. The apex and `www` domains now serve Onzio deployment
`dpl_75xrhi27MCgA5UDsQ6RhT6Ak4xrN`, which is `READY`. Public acceptance returns
HTTP 200 for `/`, `/roster`, `/schedule`, `/shop`, `/club/about`, `/club/logo`,
`/admin/login`, and `/admin/update-password`. The six-photo homepage slideshow
renders and advances, using raw production Supabase object URLs with Vercel
optimization and no Supabase runtime Image Transformations.

The approved live Stripe reconciliation is complete. The frozen
customer/subscription IDs match the canonical live objects. The subscription is
active, billed automatically at $75 USD/month through the Rose City-specific
Pro Price, is not scheduled to cancel, and its current paid period ends
2026-08-23 23:41:35 PDT. The customer and subscription now contain only the
approved `onzio_club_id` and `onzio_environment=production` metadata; the Price
was not changed. Canonical event `evt_1Txzz4K6WajTkwHYBzaweVRI` is recorded as
applied in the production ledger. The existing live webhook destination was
preserved in place, upgraded from six to the exact seven required events, and
uses the production signing secret. A canonical event resend returned HTTP 200;
the database retained exactly one applied ledger row and the same active Pro
projection.

Production password recovery now returns to the verified Rose City host instead
of the former `localhost:3000` default. The admin reset their password, signed
in, completed mandatory MFA, and reached the protected admin portal on
2026-07-27. Supabase independently records the new sign-in. The no-edit freeze
remains active while the unchanged legacy deployment/database are retained
read-only for the 7–14 day rollback window.

The subsequent Rose City owner recovery attempt exposed the remaining
production Auth-email gap: the built-in Supabase mailer reached its
project-wide two-email-per-hour limit. Resend SMTP through the shared
`auth.onziofutbol.com` sending subdomain is now the locked architecture and a
Phase 8 closeout prerequisite. The rollout is planned in
`docs/phase-8/resend-smtp-rollout.md`. The existing Resend Free account was
inspected read-only: the sole visible team is administered by
`christianjavieralcala@gmail.com`. Christian completed Resend MFA enrollment,
and its enabled state was verified read-only without inspecting authenticator
or recovery material. An erroneous `auth.onzio.com` entry was added under
separate approval based on stale architecture documentation. Christian then
confirmed that he does not own `onzio.com`; he owns `onziofutbol.com`, whose
authoritative nameservers are Vercel's. Under explicit correction approval,
erroneous Resend domain `9b89e2f5-c372-4785-9091-cb852e3a3d44` was deleted
and `auth.onziofutbol.com` was added as domain
`7514696d-f0be-453c-bf79-ff68d8dbdeb1` in North Virginia with sending enabled
and receiving disabled. Under separate DNS approval, Vercel published the
generated DKIM, return-path MX, SPF, and monitoring-only DMARC records.
Authoritative lookup returned all four exact values, and Resend now reports the
domain `verified` and ready to send. Under separate approval, one sending-only
credential restricted to `auth.onziofutbol.com` was created and installed only
in `Onzio Platform Staging`. Staging custom SMTP is enabled with sender
`Onzio Staging <staging@auth.onziofutbol.com>`, a 60-second per-user interval,
and the planned 30-email/hour rate limit. Under separate test approval,
staging sent invitations to `christianalcala3@yahoo.com` and
`calcala1@berkeley.edu`, then sent Berkeley recovery after the 60-second
cooldown. Resend reports all three messages `delivered`; no body, link, token,
or mailbox content was opened during provider inspection. Christian confirmed
both providers received their messages. The dashboard-generated Berkeley
recovery then failed with Vercel staging protection plus Supabase
`access_denied` / `otp_expired`; no password changed. This is a staging
callback/link-consumption failure, not an SMTP-delivery failure. Christian then
opened the Berkeley invitation, which confirmed the temporary identity but
landed on Vercel's protected login/SSO path and ultimately a Not Found page
instead of an Onzio acceptance route. The invitation URL used Supabase's
implicit-flow fragment and was accidentally exposed during troubleshooting.
The exact staging session was immediately deleted from `auth.sessions`; an
independent follow-up query returned zero matching sessions and zero matching
refresh tokens. The already-issued signed access JWT retains only its original
one-hour validity window; it cannot refresh, and the temporary user has no club
membership or tenant role. The user must authenticate again before any future
test. No production SMTP, Auth identity, session, template, credential, email,
or production-secret mutation occurred.

The staging callback defect is now corrected in commit `92038d4`. Invite and
recovery templates use one-time token hashes instead of implicit-flow bearer
fragments, the server callback allowlists supported OTP types and exchanges the
token hash before routing invite/recovery users to the password-update page,
and invalid, expired, forged, or unsupported links fail closed. Deployment
`dpl_GJbEfRwSagF6gNt2ESqwPSxZuzua` is `READY`; both
`alpha-onzio-staging.vercel.app` and `bravo-onzio-staging.vercel.app` point to
it. Both tenant login pages expose the recovery control, and a live forged
Alpha recovery callback returned to
`/admin/login?error=invalid_auth_link` with the safe invalid/expired message.
The hosted invite and recovery templates were saved and reload-verified. Under
fresh explicit approval, Alpha then sent exactly one replacement recovery to
`christianalcala3@yahoo.com`; the application confirmed the request and Resend
reported the message `delivered`. Its provider detail, body, and reset URL were
not opened. Christian opened the newest message, completed recovery and
password sign-in, and reached the expected membership gate. A read-only check
confirmed the Yahoo Auth identity was verified and had signed in but had no
club membership. Under explicit approval, the direct operator workflow added
it as an active Alpha staging admin and wrote the matching `membership_added`
audit event. The membership and audit rows were read back successfully; no
production data changed. Christian must now refresh or sign in again, complete
mandatory MFA, and confirm protected-admin access. Christian then confirmed the
protected admin loaded. A final read-only query verified the Yahoo identity is
still an active Alpha admin, has one verified TOTP factor, and has
TOTP-authenticated session claims. The complete staging
delivery/callback/password/MFA/admin acceptance gate is green.

Under fresh explicit approval, a distinct production Resend credential was
created and installed only in `Onzio Platform Production`. Credential
`2966af9b-4c39-426d-9ef9-bae68f6b7af6` is labeled
`onzio-production-supabase-auth-2026-07-27`, has sending-only permission, is
restricted to `auth.onziofutbol.com`, and showed zero uses after configuration.
Production custom SMTP is enabled with sender
`Onzio Accounts <no-reply@auth.onziofutbol.com>`, host `smtp.resend.com`, port
465, username `resend`, a 60-second per-user interval, and the planned
30-email/hour Auth limit. Reloaded non-secret settings matched. The one-time
credential value was transferred directly into encrypted Supabase settings,
was not recorded, and was released from the browser session. No production
email was sent during configuration, and the existing Resend Free plan was
unchanged. Under a later fresh approval, the Rose City production login sent
exactly one recovery to `christianjavieralcala@gmail.com`. The application
confirmed the request and Resend reported message
`c1eefc25-9813-45c4-8618-b695a06279a7` as `delivered`. Its provider detail,
body, and reset URL were not opened. Christian must open only the newest
message and complete password update, password sign-in, existing MFA, and
protected-admin acceptance. Christian opened the message, but Supabase sent
the one-time PKCE code to the Rose City Site URL root instead of the application
callback. The resulting URL was exposed during troubleshooting and will not be
reused; no password changed. Read-only inspection found the exact mismatch:
production allows only
`https://www.rosecityfutbolclub.com/admin/auth/callback?next=/admin/update-password`,
while the expected secure build `92038d4` requests a clean callback. Under
fresh approvals, the clean `www` and apex callbacks were added without removing
the legacy `www` entry; reload verification showed all three exact URLs. Two
separately approved replacement recoveries were delivered as messages
`b5a963f7-1a9d-4798-8cdb-7259ba86eea0` and
`0150522c-c688-4ae7-a132-314768c2878f`, but each again landed at the Site URL
root. Their exposed codes will not be reused and no password changed.

Deeper read-only inspection found the actual production deployment is still
commit `21de7e7` (`Record Phase 8 production preflight`), not secure callback
commit `92038d4`. Its public login bundle requests the query-bearing callback
from `window.location.origin`; because production login remains on the apex,
the actual request is
`https://rosecityfutbolclub.com/admin/auth/callback?next=/admin/update-password`,
which is not one of the three allowlisted URLs. Vercel independently shows
`21de7e7` as the current Production deployment and `92038d4` as a Ready Preview
deployment. No further email was sent during diagnosis. Under fresh explicit
approval, Vercel rebuilt `92038d4` against the current Production environment
and made deployment `dpl_HY46CQoAJ7yJsXP8xkUmSp8pY9kC` the Ready Production
deployment for the Rose City domains. The live public bundle
`page-b4ac05e6e0af23ec.js` now requests the clean callback derived from
`window.location.origin` and contains the production Supabase project
`ioalthwsdrlzrubomrow`. A live forged recovery callback failed closed at
`/admin/login?error=invalid_auth_link` with the safe invalid/expired message.
No recovery email was sent during deployment or verification. Any additional
recovery requires separate approval. Under a later fresh approval, the corrected
Production login sent exactly one new recovery to
`christianjavieralcala@gmail.com`. The application confirmed the request and
Resend reported message `039ab441-55ca-4627-b5d4-2519eaeb966e` as `delivered`;
its provider detail, body, and action URL were not opened. Christian used only
that newest message and confirmed he reached the protected admin portal. A
final read-only Supabase check matched production operator UUID
`199d8437-1237-4098-99dd-8b089411255e`, showed the user updated at 00:26 PDT
and last signed in at 00:25 PDT on 2026-07-28, and retained the MFA-factor
management boundary. The corrected Production
delivery/callback/password/sign-in/MFA/admin acceptance gate is green.

Under fresh explicit approval, the corrected Production login then sent
exactly one Rose City owner recovery to `info@rosecityfutbolclub.com`. The
application confirmed the request and Resend reported message
`d2784583-1e6e-46a5-8fe7-502b168a88b8` as `delivered`; its provider detail,
body, and action URL were not opened. Christian must use only that newest Rose
City message and complete callback/password/sign-in/MFA/admin acceptance
without sharing its URL.

Post-cutover public-media inspection found two live rendering regressions.
Production still serves pre-migration `logos_v2` affiliation URLs even though
all eight correct color/white assets exist under Rose City's versioned
`onzio-media/.../branding` paths. The homepage slideshow also remained at
opacity zero because its reveal effect initialized before asynchronous slides
mounted, and its Vercel image-optimizer request returned HTTP 402
`OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED`. The focused local correction uses
the already-migrated logo URLs, initializes the reveal after slides mount, and
serves slideshow images raw with `unoptimized` to restore them without a plan
purchase. All eight logo assets return HTTP 200, the focused regression passes,
`npx tsc --noEmit` passes, and contract tests pass 171/171. At that checkpoint,
Production was unchanged and the focused deployment required explicit
approval. Christian subsequently approved that exact scope. Focused commit `a1f1675`
(`Fix Rose City migrated media rendering`) contains only `components/Nav.tsx`,
`components/PhotoSlideshow.tsx`, and
`tests/contracts/homepage-slideshow.test.ts`; it was pushed to `staging`.
Preview deployment `dpl_4Aq1XgYWiM9bpsUNrKWBqQChv3np` became Ready, then
Vercel rebuilt the same commit with Production settings as current Ready
deployment `dpl_ArBmGncAdEm6VFhWgzNxfhPnHgub`. Live verification confirmed
all four affiliation logos render, slideshow URLs bypass `/_next/image`, and a
scrolled viewport displays the migrated match photography. No paid plan,
billing configuration, or optimizer purchase changed.

Live follow-up inspection of D'Morea Alewine's player modal found the same
optimizer outage on its carousel image: the migrated raw Supabase WebP returns
HTTP 200, while the corresponding `/_next/image` request returns HTTP 402
`OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED`. The approved resilience pass marks
the modal carousel image `unoptimized`, preserving the roster-card delivery
contract while bypassing the unavailable optimizer for modal profile and
action photos. It also falls through failed modal assets before showing a clean
initials placeholder, removes a failed slideshow asset instead of leaving the
section blank, and swaps an affiliation logo to its alternate color variant if
the requested variant fails. Regression coverage locks the eight migrated
versioned logo paths, raw slideshow/modal delivery, asynchronous slideshow
reveal, and all three failure paths. The focused suite passes 6/6, contract
tests pass 176/176, architecture tests pass 16/16, standalone TypeScript passes,
and the production build passes with seven pre-existing warnings.

Focused commit `183fc22` (`Harden public media fallbacks`) contains only the
three media components and three regression files. It was pushed to `staging`;
Preview deployment `dpl_2gBGX5ycZkuBMsj93gaYxHDXeoYR` became Ready, then
Vercel rebuilt that commit with Production settings as Ready deployment
`dpl_HEsKkJjUAiARWc8JWKMJMPEHt5q1`. Live acceptance confirmed all four
affiliation logos load from raw migrated assets, all six slideshow images load
raw at 1200–1500px and the carousel advances, D'Morea's profile and action
photos load raw at 2046×2400, and the roster contains zero broken images.
The homepage and roster browser consoles contained no errors.
Deployment-scoped runtime logs contained no 5xx, fatal, uncaught, or exception
events; the immutable deployment URL's expected unknown-tenant 404s remained
fail-closed. No paid plan, billing configuration, DNS, database, or email
setting changed.

During configuration, the browser auto-filled an unrelated stored credential
into the newly enabled SMTP form before Onzio values were entered. It was
immediately overwritten and was never saved to Supabase, but it appeared in
automation evidence and must be treated as exposed. It was subsequently
identified without revealing the value as Christian's Supabase dashboard
email/password identity `christianjavieralcala@gmail.com`. Under explicit
rotation approval, the secure Supabase password-change form was opened.
Christian completed the password change privately and exposed neither the
current nor new value in chat or repository files. The credential-rotation
incident is closed.

The isolated `Onzio Platform Staging` Supabase project now contains only
synthetic Alpha and Bravo tenants. Ten checked-in migrations are applied
without the local seed, modern publishable/secret keys replace disabled legacy
keys, leaked-password protection and TOTP MFA are enabled, and the exposed
`onzio` schema remains separated from private security helpers. Supabase's
security advisor has no warnings; its four remaining informational notices
describe intentionally policy-free internal/write-only tables. Christian
reported that the temporary staging organization upgrade was downgraded after
the Phase 7/Phase 8 rehearsal.

The protected `onzio-platform-staging` Vercel project serves the `staging`
branch behind Vercel Authentication. Preview-scoped variables contain only
staging Supabase and Stripe test-mode values. Alpha and Bravo have separate
verified staging domains, and unknown or cross-tenant hosts fail closed.
The same project now also has an isolated Production scope containing the ten
reviewed production variables and serves the Rose City apex and `www` domains.

The real Stripe test path is exercised end to end: owner Checkout created an
active Starter subscription, the staging webhook projected it, Customer Portal
opened for the owner, and Starter→Pro→Starter changes projected correctly.
Duplicate, stale, foreign-environment, customer-metadata, and unknown-price
events failed closed.

Hosted verification covers AAL1/AAL2, roles, membership revocation, tenant RLS,
HTML/RSC cache isolation, Starter/Pro entitlements, media normalization and
rejection, retry and cleanup, paid/grace/suspended lifecycle states, archive,
reactivation, and atomic rollback. Alpha is restored active/live/Starter with
its test subscription; Bravo is restored onboarding/private-preview with no
subscription.

The production Auth posture now has leaked-password protection, TOTP MFA, and a
15-minute AAL1 session limit enabled. The Data API explicitly exposes `onzio`
while keeping `onzio_private` unexposed, exposes all 32 `onzio` tables behind
their checked-in grants/RLS, and does not automatically expose future tables.
The one-time `phase8_migration` secret key was revoked after a successful live
Data API reconciliation; a follow-up request returned HTTP 401 and the local
key material was deleted. The eight Phase 8 Rose City
transformation/migration contracts are green, as are the complete local
contract, architecture, database, legacy, and combined suites.

## Completed Work

### Phase 1 — Bootstrap and threat model

- Copied and verified the Rose City compatibility baseline without secrets,
  dependencies, build output, nested Git state, or the legacy Supabase image
  loader.
- Completed the source/schema/route/read/write/media inventory, access matrix,
  threat model, gap register, and guarded read-only production introspection.
- Preserved the contract-first harness and legacy regression suite.

### Phase 2 — Database security foundation

- Added the `onzio` exposed schema and private `onzio_private` security
  boundary.
- Added tenant-owned content, billing, audit, and media tables with composite
  tenant foreign keys, grants, RLS, storage policies, and deterministic
  Alpha/Bravo fixtures.
- Added generated database types and authenticated local RLS/storage tests.

### Phase 3 — Atomic tenant conversion

- Added strict hostname normalization, verified domain resolution,
  tenant-specific rewrites, tenant-aware cache keys, and `ClubContext`.
- Converted public reads and protected admin mutations to explicit tenant
  scope.
- Added password authentication, TOTP/AAL2 enforcement, role/lifecycle/tier
  authorization, and server-side protected-page gates.
- Removed Rose City content fallbacks from tenant requests.
- Added published `media_assets` resolution and selective image-delivery
  behavior.
- Verified Alpha/Bravo isolation and retained the local database/RLS gate.

### Phase 4 — Secure media pipeline

#### Paths and validation

- Added strict tenant/surface/UUID path construction and parsing in
  `lib/storage-path.ts`.
- Added magic-byte detection, MIME/extension agreement, byte limits,
  decoded-dimension limits, corruption handling, decompression-bomb rejection,
  and photo/graphic allowlists in `lib/media-validation.ts`.
- Rejects SVG, GIF, executable/spoofed, malformed, and unsupported input before
  any public write.

#### Normalization and delivery

- Added Sharp photo processing with orientation correction, metadata
  stripping, no upscaling, a 2400px long edge, and WebP quality 82.
- Added graphic processing with transparency preservation and optimized PNG
  retention when WebP would be larger.
- Kept large photographic surfaces on Vercel optimization and small graphics
  unoptimized.
- Retained the static prohibition on Supabase runtime Image Transformation
  URLs and the exact `onzio-media` remote pattern.

#### Authorization and finalization

- Added `/api/admin/media/authorize` for AAL2, membership, lifecycle, tier,
  surface, MIME, and claimed-size checks.
- Browser uploads go directly to the private `onzio-upload-staging` bucket
  through a short-lived signed upload authorization.
- Added a server-only, HMAC-bound upload authorization tying the upload ID,
  actor, club, surface, kind, staging path, and expiry together.
- Added `/api/admin/media/finalize`, which re-checks tenant/user authorization,
  downloads staging through the narrow service-role boundary, validates and
  normalizes the real bytes, publishes an immutable UUID path, records
  `media_assets` and a narrow audit event, and removes staging.
- Finalization is idempotent. Database/audit failures trigger compensating
  public-object rollback.

#### Replacement, cleanup, and monitoring

- Replaced the Phase 3 fail-closed storage adapter with the secure media
  adapter used by existing admin pages.
- Automatically adds media asset IDs to supported admin content payloads.
- Added versioned Onzio URL parsing for homepage, sponsor, about, and shared
  storage cleanup flows.
- Added `/api/admin/media/cleanup` and retirement behavior that preserves the
  new reference before old-object deletion.
- Added `onzio.media_cleanup_queue` for failed staging/public cleanup retries.
- Added `npm run media:cleanup` for abandoned staging objects older than 24
  hours and `getMediaUsageByClub` for asset/byte monitoring.
- Added `npm run media:smoke` for local end-to-end verification.
- Added an explicit Node 20 WebSocket transport to the shared service-role
  Supabase client.

### Phase 5 — Authentication and operator workflows

#### Operator boundary and provisioning

- Added a server-only operator allowlist through `ONZIO_OPERATOR_USER_IDS`.
- Added validated direct-invocation guards so operator functions cannot be
  exposed through ordinary application routes.
- Added compensated club provisioning for club, verified primary domain,
  owner Auth user/invite, owner membership, and audit creation.
- Reuses an explicitly verified existing Auth user without duplicating the
  account.
- Maps slug/domain conflicts and rolls back database/Auth artifacts when a
  later provisioning step fails.

#### Membership and MFA recovery

- Added operator-only membership activation/reactivation and removal.
- Re-checks the Auth identity, current club lifecycle, and membership state at
  mutation time.
- Prevents removal of the last active owner and restores the previous
  membership if audit recording fails.
- Added manual-identity-verification-gated MFA recovery using Supabase Auth
  admin factor removal and a generated password recovery link.
- Stores only a SHA-256 digest of the operator verification reference in the
  start/completion audit records.

#### Archive, reactivate, export, and purge

- Added archive behavior that suspends the club, detaches domains, blocks
  existing sessions/writes through the existing lifecycle gates, preserves all
  content/media, and records an operator audit.
- Added reactivation into onboarding/private-preview state with the verified
  primary domain restored; billing is still required before public launch.
- Added the privileged `club_exports` verification ledger with no browser
  grants and regenerated database types.
- Added exact-confirmation hard purge with local storage removal and
  dependency-ordered tenant-row deletion.
- Changed immutable audit/Stripe club foreign keys to `on delete set null` so
  their ledgers survive a hard purge without granting service-role
  update/delete access.
- Added a final hard-purge audit outside the deleted tenant.
- Added `npm run operator:smoke` and local-development operator documentation.

### Phase 6 — Stripe billing

#### Checkout, Portal, and authorization

- Added strict, distinct `STRIPE_PRICE_ID_STARTER` and
  `STRIPE_PRICE_ID_PRO` mapping with staging/test and production/live mode
  enforcement.
- Added the optional `STRIPE_PRICE_IDS_PRO_GRANDFATHERED` allowlist for
  existing Pro subscriptions. Grandfathered Prices are accepted only during
  canonical projection; Checkout remains pinned to the standard Pro Price.
  Malformed, duplicate, overlapping, and unknown Price IDs fail closed.
- Replaced the legacy email allowlist with verified-tenant, AAL2,
  active-owner billing authorization.
- Added first-subscription Checkout with idempotent Customer and Session
  creation plus club/environment metadata on the Customer, Checkout Session,
  and Subscription.
- Routes every existing subscription row to Customer Portal and derives all
  success, cancel, and return URLs from the verified primary domain.
- Updated the Payments page for tenant-specific Starter/Pro selection and
  existing-subscriber management.

#### Webhook and transactional projection

- Added raw-body Stripe signature verification and a narrow required-event
  allowlist.
- Retrieves canonical Stripe state for subscription, Checkout, and invoice
  events and verifies canonical Customer metadata.
- Added pure event routing for duplicate, stale, environment, customer,
  subscription, price, obsolete-deletion, and reconciliation decisions.
- Added private security-definer functions plus service-role-only exposed
  wrappers that atomically write `stripe_events`, `club_subscriptions`,
  `clubs.tier`, lifecycle, and runtime access.
- Rejected events receive digest-only ledger records; failed projection writes
  roll back the event insert and every runtime change.
- Revoked direct service-role update/delete access to the immutable Stripe
  ledger while preserving private transactional state transitions and
  hard-purge `club_id` detachment.

#### Runtime access and regression coverage

- Added dynamic database projection for preview, live, grace, and suspended
  access so grace expires without requiring a precisely timed webhook.
- Preserved private-preview content preparation before the first subscription.
- Restricted content mutations and non-billing admin routes after paid access
  ends while keeping Customer Portal available to owners.
- Added deterministic active-subscription seed state for Alpha.
- Added database regressions for atomic application, duplicate/stale
  rejection, rollback, grace expiry, RPC privilege boundaries, and ledger
  immutability.
- Corrected two approved contradictory Stripe fixtures: the duplicate now
  identifies the already-applied event, and Rose City reconciliation carries
  Rose City tenant metadata while preserving the existing subscription ID.

### Phase 7 — protected staging gate

- Added `docs/phase-7/staging-gate.md` and completed every hosted-resource and
  acceptance row with staging-only evidence.
- Created the separate `Onzio Staging` organization
  (`udlsrxgfpkqjaridfxnz`) and `Onzio Platform Staging` project
  (`fxefqnoqxbezeccjvrsw`) in `us-west-2`.
- Linked the checkout using a Keychain-held database password and applied ten
  checked-in Phase 2–7 migrations without `supabase/seed.sql`.
- Added a minimal private-preview resolver, exact webhook routing bypass, and
  empty-search-path/revoked-execution hardening for hosted runtime functions.
- Disabled legacy `anon`/`service_role` API keys, retained modern
  publishable/secret keys outside the repository, enabled leaked-password
  protection, and kept TOTP enrollment/verification enabled.
- Added a guarded `npm run staging:provision` workflow and provisioned the
  operator plus synthetic Alpha/Bravo owner/admin identities with verified
  domains, memberships, audit records, and TOTP AAL2 factors.
- Linked the Vercel project `onzio-platform-staging`
  (`prj_I362ysmh9cse5cRxnL7db4dOhsEs`) to GitHub, scoped all staging values to
  the `staging` Preview branch, and enabled Vercel Authentication.
- Deployed the protected staging application and mapped the Alpha/Bravo aliases
  to the verified `staging` branch deployment.
- Rotated the Stripe test secret, retained it outside the repository, and
  configured test Starter/Pro Prices, Customer Portal, and webhook
  `we_1TxrnaK6WajTkwHYtFEvCEo8` with the exact seven-event allowlist.
- Created and paid a real test Checkout, projected subscription
  `sub_1TxsLTK6WajTkwHYEUjdWeNR`, verified Portal and Starter/Pro switching,
  then restored Alpha to active/live/Starter.
- Added reusable hosted auth, Stripe, media, and lifecycle verifier scripts.
  The media cleanup verifier now scopes destructive cleanup to its unique
  synthetic club prefix.

### Phase 8 — local Rose City migration gate

- Added `lib/migration/rose-city-transform.ts` as a pure, deterministic
  preflight and transformation boundary with no hosted or filesystem writes.
- Added tenant-key injection, snake-case relationship mapping, real duplicate
  detection, tenant relationship validation, declared row-count reconciliation,
  media availability/corruption/checksum checks, and traversal-safe media paths.
- Added deterministic UUID-versioned `onzio-media` plans that never use
  Supabase runtime Image Transformations and preserve transparent-graphic
  extension behavior when declared.
- Preserved the existing Rose City Stripe subscription ID in the transformed
  result and added a stable source digest for idempotent replay verification.
- Added five regressions that prove real malformed manifests fail without
  relying only on the original contract simulation flags.
- Added `docs/phase-8/rose-city-migration-runbook.md` with the target evidence,
  credentials, approval boundaries, backup/export gate, rehearsal sequence,
  production/cutover sequence, rollback window, and acceptance evidence.
- Verified `Onzio Platform Production` as project ref
  `ioalthwsdrlzrubomrow`, region `ca-central-1`, Micro compute, status
  `ACTIVE_HEALTHY`, in the Pro `404DB` organization.
- Completed the read-only production preflight through the authenticated
  Supabase Dashboard: the `public` schema has no tables, migration history is
  empty, Auth has no users, Storage has no buckets, scheduled daily backups are
  available, and the project usage view shows no disk overage.
- Recorded a credential-safety incident: the Supabase CLI returned complete
  legacy JWT keys without `--reveal`, exposing the legacy production
  service-role credential in the tool transcript.
- Contained the incident under Christian's explicit approval: disabled the
  legacy `anon` and `service_role` API keys, retained the modern
  publishable/secret posture, and revoked the previous legacy HS256 signing key
  so the exposed service-role JWT is no longer trusted. The current signer is
  ECC P-256.
- Added guarded `migration:export:rose-city` and
  `migration:reconcile:rose-city` workflows. They pin the exact Rose City host,
  reject mutation methods and unexpected endpoints, minimize Auth output, copy
  every Storage object, hash every artifact, and verify database relationships
  plus database-to-Storage references.
- Completed the authorized non-frozen rehearsal snapshot at
  `/Users/christianalcala/Downloads/onzio-migration-private/rose-city-rehearsal-2026-07-27T2057Z`:
  24 tables/209 rows, 3 minimized Auth identities, 14 buckets/557 objects,
  1,728,725,700 Storage bytes, 132/132 resolved media references, 10/10
  relationship checks, 0 duplicate key groups, and a passed credential scan.
- Independently verified all 586 package checksums. Private package permissions
  are `0700` for directories and `0600` for files.
- Added the complete 24-table deterministic mapping planner with explicit
  field dispositions, stable tenant/row/media identifiers, relationship
  remapping, Stripe subscription preservation, credential-shaped-content
  rejection, and private-path/network guards.
- Classified all 557 source Storage objects and processed 499 compliant
  photographs/graphics offline into deterministic versioned paths.
- Wrote the restricted inventory and blocker evidence outside Git at
  `/Users/christianalcala/Downloads/onzio-migration-private/rose-city-plan-2026-07-27-blocked-evidence-v2`.
  Its 501/501 derived files pass SHA-256 verification; directories are `0700`
  and files are `0600`.
- Confirmed the unreferenced MP4 and empty placeholder require no schema change
  and are explicitly excluded without transcoding.
- Added complete-plan regressions for all-table coverage, deterministic output,
  Stripe preservation, legacy-only field disposition, missing tables, broken
  relationships, referenced unsupported media, and import-time URL
  materialization.
- Christian approved the narrow migration-only pre-normalization exception for
  the 16 already-public referenced PNG inputs on 2026-07-27. The Phase 4
  browser-upload limits remain unchanged.
- Added bounded offline pre-normalization for only those approved inputs:
  photographs decode below 36 MP, rotate, resize to a 2400 px long edge, and
  emit WebP quality 82; transparent graphics decode below 36 MP, resize within
  3000 px, and retain the smaller safe PNG/WebP output.
- Generated two byte-identical complete plans outside Git. The final source
  digest is
  `e7763db3b37022a74b479ef5d421058bc31f2eaeaafe36bdcc8e1dafb6938226`
  and the final plan digest is
  `e826f49771773ad2415ec6b52fe47c6d311750f10e5be31e6fdace4a8d349c13`.
- Added `migration:import:rose-city` and `migration:reset:rose-city`. The
  importer permits only loopback Supabase/Postgres endpoints, verifies the
  complete private checksum ledger, creates new local-only owner/admin
  identities with mandatory MFA enrollment, uploads versioned media,
  transactionally imports tenant content, compensates Auth/Storage on failure,
  and reconciles counts plus composite relationships.
- Imported 209 source rows into all 24 destination content/billing tables and
  515 published media assets. Forty-two unsupported, corrupt, video, or
  placeholder objects remain explicitly excluded; no referenced object is
  excluded.
- Corrected two render-discovered legacy dependencies: the path-only club crest
  is now planned as referenced media, and Rose City affiliation/flag assets use
  deterministic `onzio-media` paths instead of legacy buckets.
- Verified `/`, `/roster`, `/schedule`, `/shop`, `/club/about`, and
  `/club/logo` in a local browser with no broken images, legacy flag/logo
  bucket URLs, or `/storage/v1/render/image/` URLs.
- Created a fresh local owner, completed mandatory TOTP MFA, loaded the
  protected dashboard, performed a real About-page mutation, and restored the
  original content. Fixed the admin client to remove tenant identity copied
  from select responses before server-mediated mutations.
- Proved rollback by removing exactly 515 Rose City media objects, two local
  Auth users, and the Rose City tenant rows. Rose City returned 404 while Alpha
  remained 200. The same immutable plan then replayed twice with identical
  digest and row/media counts.
- Fixed the homepage slideshow's asynchronous reveal lifecycle. The GSAP
  effect now waits for migrated slide rows to mount the section before
  initializing, preventing the six valid images from remaining behind a
  permanent `opacity: 0`. Added a contract regression and verified the visible
  `01 / 06` slideshow advances with loaded migrated images.
- Recorded Christian's final-freeze authorization and relayed administrator
  no-edit acknowledgement at `2026-07-27T22:34:39Z`.
- Extended the guarded exporter with paired final-freeze authorization and
  ISO timestamp requirements. Final manifests now fail closed unless they
  attest `frozenSource`, `finalCutoverArtifact`, and freeze evidence; the
  reconciler and planner accept only complete attested final packages.
- Captured the authoritative final frozen package outside Git at
  `/Users/christianalcala/Downloads/onzio-migration-private/rose-city-final-freeze-2026-07-27T2234Z-v2`:
  24/24 tables and 209 rows, 3 minimized Auth identities, 14 buckets and
  557 objects, 1,728,725,700 Storage bytes, stable before/after counts and Auth
  digest, no credential findings, and zero production mutations.
- Reconciled 585/585 package checksums, 10/10 relationships, and 132/132
  database-to-Storage references. The Rose City source project reports a
  completed physical backup from `2026-07-27T11:06:22.739Z`; the frozen
  package separately preserves the current logical application rows and
  Storage objects because Supabase database backups exclude Storage bytes.
- Generated byte-identical cutover plans outside Git at
  `rose-city-cutover-plan-2026-07-27-a` and
  `rose-city-cutover-plan-2026-07-27-b`. Both checksum ledgers pass and retain
  source digest
  `e7763db3b37022a74b479ef5d421058bc31f2eaeaafe36bdcc8e1dafb6938226`
  plus plan digest
  `e826f49771773ad2415ec6b52fe47c6d311750f10e5be31e6fdace4a8d349c13`,
  exactly matching the approved rehearsal.
- The earlier private directory
  `rose-city-final-freeze-2026-07-27T2234Z` and plans derived from it are
  superseded because the original exporter labeled all output as non-frozen.
  They remain outside Git but must not be used for cutover.
- Added the guarded production importer
  `scripts/import-rose-city-production.ts` and its production-specific
  transformation boundary. It pins the exact production ref plus source/plan
  digests, permits only the approved identities, rejects
  `calcala1@berkeley.edu`, verifies media checksums before upload, applies SQL
  transactionally, compensates newly uploaded objects on failure, and performs
  exact destination reconciliation.
- Applied all ten checked-in migrations to production through
  `/private/tmp/onzio-prod-link.5jD9AU`; `supabase migration list --linked`
  matches locally and remotely, and production schema lint reports no errors.
- Provisioned only the approved production identities:
  `christianjavieralcala@gmail.com` as owner/operator and
  `info@rosecityfutbolclub.com` as Rose City owner. The Berkeley address was
  canceled before submission and is absent from production.
- Imported the authoritative frozen cutover plan into production:
  209 source rows, 515 immutable `onzio-media` objects, two memberships, and
  two domains. Every mapped destination count matches the plan, including six
  homepage slideshow photos. `club_subscriptions` remains empty by design
  until the existing live Stripe subscription is separately reconciled.
- Kept the imported tenant fail-closed as `onboarding` plus `preview`. A live
  production Data API check returned that exact state.
- Enabled leaked-password protection, TOTP MFA, and the 15-minute AAL1 limit.
  Explicitly exposed the `onzio` Data API schema/tables, kept
  `onzio_private` unexposed, and disabled automatic exposure of new tables.
- Created a one-time modern secret key only for the import, then deleted it
  after reconciliation. The revoked key returns HTTP 401, and its local secret
  and API-key inventory files were removed.
- Completed the approved read-only live Stripe inventory:
  - customer `cus_UwVpy1YlirV3li`, billing email
    `info@rosecityfutbolclub.com`
  - active subscription `sub_1TwcndK6WajTkwHYH1VuFgrG`, one item, automatic
    collection, no cancellation scheduled, current period
    2026-07-23 23:41:35 PDT through 2026-08-23 23:41:35 PDT
  - grandfathered Rose City Pro Price
    `price_1TwbmvK6WajTkwHYueLvjhv5` at $75 USD/month
  - standard Starter Price `price_1Tw8RjK6WajTkwHYcTsgHNGc` at $65 USD/month
    and standard Pro Price `price_1Tw8S7K6WajTkwHYcyQ3zjgK` at $99 USD/month
  - active legacy webhook destination `we_1TwEpdK6WajTkwHYD5SEYzXX` at
    `https://www.rosecityfutbolclub.com/api/stripe/webhook`, API version
    `2026-06-24.dahlia`, listening to the six required Checkout,
    subscription, and invoice events
- Confirmed the customer, subscription, and grandfathered Price have no Onzio
  metadata. The legacy webhook's weekly view records six deliveries: three
  HTTP 308 failures and three later manual HTTP 200 recoveries for the same
  Checkout event. This redirect behavior must not be carried into the Onzio
  webhook cutover.
- Implemented the approved grandfathered Pro compatibility locally. The
  standard Starter and Pro Checkout Prices remain unchanged, while the exact
  configured Rose City Price can map to Pro during in-place reconciliation.
  Added contracts proving the alias projects the same subscription, is never
  offered to new Checkout, and cannot overlap either standard tier Price.
- Completed the approved production billing projection on 2026-07-27:
  - added only `onzio_club_id=32ceba0b-4e25-52c2-bb6b-d82fb87637a7` and
    `onzio_environment=production` to the preserved customer and subscription
  - preserved customer `cus_UwVpy1YlirV3li`, subscription
    `sub_1TwcndK6WajTkwHYH1VuFgrG`, and grandfathered Price
    `price_1TwbmvK6WajTkwHYueLvjhv5`
  - applied canonical `customer.subscription.updated` event
    `evt_1Txzz4K6WajTkwHYBzaweVRI` through the service-only projection RPC
  - reconciled one active Pro subscription, paid through
    `2026-08-24T06:41:35Z`, with no scheduled cancellation
  - verified the immutable event outcome is `applied`, runtime access is
    `live`, and both Rose City production domains still resolve to this club
  - changed no Price, amount, payment method, billing cadence, webhook
    destination, deployment, or DNS record
- Completed the approved controlled cutover on 2026-07-27:
  - moved `rosecityfutbolclub.com` and `www.rosecityfutbolclub.com` to the
    Onzio production target
  - corrected the Production Supabase publishable key and
    `ONZIO_ENVIRONMENT=production` in place
  - found production drift in the checked-in runtime-access execution grant,
    reapplied the exact migration grant to `anon`, `authenticated`, and
    `service_role`, reloaded PostgREST, and verified anonymous tenant/runtime
    resolution
  - preserved live Stripe webhook `we_1TwEpdK6WajTkwHYD5SEYzXX`, installed its
    signing secret, and expanded its allowlist from six to seven events by
    adding `invoice.paid`
  - resent `evt_1Txzz4K6WajTkwHYBzaweVRI`; Stripe received HTTP 200 and the
    production ledger remained idempotent with one applied row
  - verified all public routes, six slideshow images plus controls, invalid
    webhook rejection, and the owner/operator password plus MFA admin flow
- Added production-safe self-service password recovery. Supabase Auth now uses
  the verified Rose City Site URL and an exact callback allowlist; recovery
  exchanges the code server-side, permits only the update-password destination,
  updates the password through the authenticated recovery session, signs the
  session out, and returns the user to password plus MFA login.
- Added the documentation-only Resend SMTP closeout plan. It uses one
  Onzio-owned `auth.onziofutbol.com` sending identity for every club while
  keeping
  tenant-specific website and callback domains, separate staging/production
  credentials, security-only templates, conservative rate limits, staged
  verification, and a fail-closed rollback procedure. No hosted email or DNS
  change was made.
- Completed the approval-safe read-only Resend/Supabase email baseline. The
  existing Resend Free team belongs to the Onzio operator and had no API keys
  at baseline.
  Christian completed operator MFA enrollment, and the enabled state was
  verified read-only without opening authenticator or recovery material. Under
  separate approval, `auth.onzio.com` was added in North Virginia with sending
  enabled and receiving disabled. Christian then clarified that `onzio.com` is
  not owned; the owned domain is `onziofutbol.com` and its DNS is on Vercel.
  Under explicit correction approval, the erroneous entry was deleted and
  `auth.onziofutbol.com` was added as the sole Resend domain. Under separate
  DNS approval, Vercel published the exact generated records and Resend
  verified the domain. Under a later separate approval, a sending-only,
  domain-restricted staging credential was created and installed only in
  staging Supabase. Staging custom SMTP is enabled at 30 emails/hour;
  production remained disabled at that checkpoint. Under
  separate approval, two staging invitations and one staging recovery message
  were delivered across Yahoo and Berkeley. No secret value was recorded, and
  no message body or action link was opened.
- Recorded the staging acceptance incident after Christian opened the Berkeley
  invitation: Vercel Authentication intercepted the root redirect, the flow
  ended on Not Found, and the implicit-flow action URL was exposed during
  troubleshooting. Revoked the exact staging session and independently
  verified zero matching session and refresh-token rows. The temporary user
  remains without membership or a tenant role. The signed access JWT retains
  only its original one-hour lifetime and cannot refresh; production was
  untouched.
- Replaced staging invite/recovery implicit-flow links with one-time token-hash
  callbacks and added a server callback that allowlists supported OTP types,
  rejects open redirects, routes invite/recovery sessions to password update,
  and fails closed for invalid links. Added 14 callback contracts; TypeScript,
  lint, build, architecture, and the complete 485-test local suite pass.
  Deployed commit `92038d4` to protected staging, repointed both existing tenant
  aliases, verified both login pages, and proved a forged live callback fails
  safely. Updated both hosted staging templates, then sent one separately
  approved Yahoo recovery through Alpha. The application accepted it and
  Resend reported `delivered`; the message body and link were not inspected.
- Diagnosed the subsequent `not_authorized` response read-only: Yahoo recovery
  and password sign-in had succeeded, but the intentionally unaffiliated test
  identity had no Alpha membership. Under explicit approval, ran the direct,
  staging-pinned operator workflow to add Yahoo as an active Alpha admin. The
  workflow and follow-up reads verified the membership and its
  `membership_added` audit event. Temporary credential files were deleted
  immediately, and production was untouched. Christian completed MFA and
  confirmed protected-admin access; the final read-only acceptance query
  verified one TOTP factor and TOTP-authenticated session claims.
- Under fresh approval, created production Resend credential
  `2966af9b-4c39-426d-9ef9-bae68f6b7af6` with sending-only access restricted
  to `auth.onziofutbol.com` and installed it directly into encrypted production
  Supabase Auth SMTP settings. Reload verification matched the production
  sender, Resend host/port/username, 60-second interval, and 30-email/hour
  limit. The credential showed zero uses, no production email was sent, and no
  Resend plan upgrade occurred. An unrelated browser-autofilled credential was
  overwritten before save but appeared in automation evidence; its owning
  account requires separate rotation.
- Under fresh separate approval, initiated exactly one production recovery
  through the Rose City login for `christianjavieralcala@gmail.com`. The
  application confirmed the request and Resend recorded provider message
  `c1eefc25-9813-45c4-8618-b695a06279a7` as `delivered`. No message body,
  action URL, or provider detail was opened. Christian opened the message, but
  the code landed at the Site URL root because the production redirect
  allowlist still contains only the legacy callback with
  `?next=/admin/update-password`, while the deployed client requests the clean
  callback. The one-time code was exposed during troubleshooting and will not
  be reused; no password changed.

### Phase 9 — versioned presentation system

- Added Phase 9.1 baseline evidence for the current Rose City cinematic public
  renderer and the approved local Deportivo heritage snapshot.
- Added Phase 9.2 presentation package contracts and implementation for
  document schema parsing, registered templates, registered sections, routes,
  modules, curated font packs, semantic theme contrast checks, production
  provenance gating, deterministic validation, compatibility switching, photo
  readiness recommendations, and operator override records.
- Added Phase 9.3 local database contracts and migration for immutable
  presentation documents, draft/published state pointers, append-only
  publication history, composite tenant foreign keys, public published-only
  reads, protected member reads, service-role writes, and immutable triggers.
- Regenerated `lib/database.generated.ts` from the local schema after the
  migration was applied through `npm run db:reset`.

## Verification

### Phase 9 local checkpoint — 2026-07-29

```text
npx vitest run tests/contracts/presentation-system.test.ts
  6/6 passed

/bin/zsh -lc 'eval "$(supabase status -o env 2>/dev/null)"; \
  SUPABASE_TEST_URL="$API_URL" \
  SUPABASE_TEST_ANON_KEY="$ANON_KEY" \
  SUPABASE_TEST_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  npx vitest run tests/database/presentation-system.test.ts'
  3/3 passed

npm run test:contracts
  212/212 passed

npm run test:architecture
  18/18 passed

/bin/zsh -lc 'eval "$(supabase status -o env 2>/dev/null)"; \
  SUPABASE_TEST_URL="$API_URL" \
  SUPABASE_TEST_ANON_KEY="$ANON_KEY" \
  SUPABASE_TEST_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  npm run test:db'
  51/51 passed

npm run db:types:check
  generated definitions match the local schema

npx tsc --noEmit --pretty false --incremental false
  passed

supabase db lint --local --schema onzio,onzio_private
  no schema errors
```

Notes:

- `npm run db:reset` applied all checked-in migrations including
  `20260729040045_phase9_presentation_system.sql` against local Supabase only.
- Supabase CLI reported installed version `2.109.1`; its changelog currently
  advertises `2.110.0` as available, but no upgrade was performed.
- The CLI continues to print the existing Bun AVX warning during local
  Supabase commands.

### Phase 6 green gates

```text
npx vitest run tests/contracts/stripe-subscription.test.ts
  24/24 Phase 6 Stripe contracts passed

npm run test:db
  45/45 passed across 5 files

npm run test:legacy
  243/243 passed across 20 files

npx tsc --noEmit --pretty false --incremental false
  passed

npm run lint
  passed with seven pre-existing legacy warnings

npm run build
  passed with loopback-only local Supabase values; 23 static pages generated

npm run db:types:check
  generated definitions match the local schema

supabase db lint --local --schema onzio,onzio_private
  no schema errors
```

### Intentional-red later-phase gates

```text
npm run test:contracts
  129 passed, 8 intentional failures, 137 total

npm run test:architecture
  16/16 passed

npm test (with local Supabase test values)
  434 passed, 8 intentional failures, 442 total
```

The remaining failures are assigned to later phases:

- eight Rose City transformation/migration contracts (Phase 8)

### Phase 7 final gate — 2026-07-27

```text
npx tsc --noEmit --pretty false --incremental false
  passed

npm run test:architecture
  16/16 passed

npm run test:db
  46/46 passed across 5 files

npm run test:legacy
  243/243 passed across 20 files

npm run test:contracts
  129 passed, 8 intentional Phase 8 failures, 137 total

npm test (with loopback-only local Supabase values)
  434 passed, 8 intentional Phase 8 failures, 442 total

npm run db:types:check
  generated definitions match the local schema

npm run lint
  passed with seven pre-existing legacy warnings

npm run build
  passed with loopback-only Supabase and inert test-shaped Stripe values;
  23 static pages generated

supabase db lint --linked --schema onzio,onzio_private
  no schema errors
```

Hosted staging verification:

- `phase7.hosted_auth_verified`: AAL1/AAL2, four tenant sessions, RLS/cache
  isolation, roles, Starter entitlement, Portal, and immediate revocation pass
- `phase7.hosted_media_verified`: normalization, rejection, idempotency,
  retirement, and scoped abandoned-staging cleanup pass
- `phase7.hosted_stripe_verified`: duplicate, stale, environment, customer, and
  Price boundaries pass
- `phase7.hosted_lifecycle_verified`: retry, grace, suspension, archive,
  reactivation, and rollback pass
- real Stripe test Checkout, webhook projection, Customer Portal, and
  Starter→Pro→Starter projection pass
- Supabase security advisor reports no warnings; four intentional
  `rls_enabled_no_policy` informational notices remain

### Phase 8 local gate — 2026-07-27

```text
npx vitest run tests/contracts/provisioning-migration.test.ts \
  tests/contracts/rose-city-transform-regressions.test.ts
  23/23 passed

npx tsc --noEmit --pretty false --incremental false
  passed

npm run test:contracts
  142/142 passed

npm run test:architecture
  16/16 passed

npm run test:db
  46/46 passed across 5 files

npm test (with loopback-only local Supabase values)
  447/447 passed across 35 files

npm run db:types:check
  generated definitions match the local schema

supabase db lint --local --schema onzio,onzio_private
  no schema errors

npm run lint
  passed with seven pre-existing legacy warnings

npm run build
  passed with loopback-only Supabase values; 23 static pages generated
```

### Phase 8 read-only Rose City rehearsal export — 2026-07-27

```text
npm run migration:export:rose-city
  complete
  24/24 database tables; 209 rows
  3 minimized Auth identities
  14 buckets; 557 objects; 1,728,725,700 bytes
  credential scan passed

npm run migration:reconcile:rose-city
  passed
  10/10 relationship checks
  132/132 database-to-Storage references resolved
  0 duplicate key groups

shasum -a 256 -c checksums.sha256
  586/586 files passed

npx tsc --noEmit --pretty false --incremental false
  passed

npx vitest run tests/contracts/provisioning-migration.test.ts \
  tests/contracts/rose-city-transform-regressions.test.ts
  23/23 passed

npm run test:contracts
  142/142 passed

npm run lint
  passed with seven pre-existing legacy warnings
```

### Phase 8 complete-plan/media checkpoint — 2026-07-27

```text
npm run migration:plan:rose-city -- <private-export> <private-output>
  stopped safely before import-plan creation
  24/24 source tables mapped
  557/557 objects classified
  499 compliant photographs/graphics processed
  58 objects explicitly excluded
  16 referenced PNGs rejected by locked Phase 4 input limits

shasum -a 256 -c checksums.sha256
  501/501 derived evidence/output files passed

npx vitest run tests/contracts/rose-city-import-plan.test.ts \
  tests/contracts/provisioning-migration.test.ts \
  tests/contracts/rose-city-transform-regressions.test.ts
  27/27 passed

npx tsc --noEmit --pretty false --incremental false
  passed

npm run test:contracts
  146/146 passed

npm run test:architecture
  16/16 passed

npm test (with loopback-only local Supabase test values)
  451/451 passed across 36 files

npm run db:types:check
  generated definitions match the local schema

npm run lint
  passed with seven pre-existing legacy warnings
```

### Phase 8 full local import/replay gate — 2026-07-27

```text
npm run migration:plan:rose-city -- <private-export> <private-output> \
  --allow-approved-rehearsal-input-limit-pre-normalization
  two independent plans matched
  source digest e7763db3b37022a74b479ef5d421058bc31f2eaeaafe36bdcc8e1dafb6938226
  plan digest e826f49771773ad2415ec6b52fe47c6d311750f10e5be31e6fdace4a8d349c13
  557 objects classified; 515 imported; 42 explicitly excluded
  122 unique referenced objects; 0 referenced exclusions
  16 approved migration-only pre-normalizations

npm run migration:import:rose-city -- <private-plan> --mode=apply
  209 source rows imported
  all 24 destination table counts reconciled
  515 media assets reconciled
  composite player/match relationships reconciled
  mandatory fresh local MFA enrollment verified
  immediate identical replay preserved every count and digest

npm run migration:reset:rose-city -- <private-plan> --mode=reset
  515 Rose City objects removed
  2 local-only Auth users removed
  Rose City host returned 404; Alpha host remained 200
  identical plan replay restored the complete site

browser acceptance
  six representative public routes rendered
  no broken images, legacy flag/logo bucket URLs, or Image Transformation URLs
  owner password + TOTP MFA + protected dashboard passed
  About-page update and exact restoration passed
  homepage slideshow reveal and auto-advance passed

npx tsc --noEmit --pretty false --incremental false
  passed

npm run test:contracts
  157/157 passed

npm run test:architecture
  16/16 passed

npm run test:db
  46/46 passed across 5 files

npm test (with loopback-only local Supabase test values)
  467/467 passed across 41 files

npm run db:types:check
  generated definitions match the local schema

supabase db lint --local --schema onzio,onzio_private
  no schema errors

npm run lint
  passed with seven pre-existing legacy warnings

npm run build
  passed with loopback-only Supabase values; 23 static pages generated

npm audit --omit=dev
  0 production vulnerabilities
```

### Phase 8 production billing projection — 2026-07-27

```text
Stripe canonical reconciliation
  preserved customer cus_UwVpy1YlirV3li
  preserved subscription sub_1TwcndK6WajTkwHYH1VuFgrG
  preserved grandfathered Pro Price price_1TwbmvK6WajTkwHYueLvjhv5
  customer and subscription metadata match Rose City plus production
  amount, payment method, cadence, and cancellation state unchanged

Onzio production projection
  event evt_1Txzz4K6WajTkwHYBzaweVRI applied
  exactly one active Pro subscription row
  paid through 2026-08-24T06:41:35Z
  runtime access live; lifecycle active; no grace period
  apex and www domain mappings unchanged

Cutover isolation
  no Vercel deployment at the billing-projection checkpoint
  no DNS/domain movement
  no webhook destination change
  legacy production traffic and rollback target unchanged
```

### Phase 8 private production validation target — 2026-07-27

```text
Vercel project
  onzio-platform-staging
  project prj_I362ysmh9cse5cRxnL7db4dOhsEs
  production deployment dpl_21X9WZEh2WdERBoQTCKtEGYrngQF
  immutable URL onzio-platform-staging-6hi76yew8-404christianns-projects.vercel.app
  READY; production build and type validation passed

Production environment
  ten reviewed variables present only in Production
  modern Supabase publishable and backend secret keys
  exact production operator UUID
  Starter, standard Pro, and Rose City grandfathered Pro Price IDs
  dedicated least-privilege restricted live Stripe runtime credential
  validation-only webhook secret; replace during webhook destination cutover

Remote safety checks
  unknown Vercel host -> HTTP 404, Cache-Control no-store, X-Robots-Tag noindex
  invalid webhook signature -> HTTP 400 INVALID_SIGNATURE
  no runtime error logs found
  Rose City Host-header spoof -> HTTP 403 at Vercel edge
  no Rose City domain, DNS record, or Stripe webhook destination changed
```

The Stripe runtime contract now accepts restricted `rk_test_`/`rk_live_` keys
in addition to standard keys while still rejecting test/live mismatches. The
focused configuration suite passes 10/10. Page-by-page Rose City production
validation remains gated on an actual or temporary Vercel domain mapping:
Vercel rejects a spoofed Rose City `Host` header before middleware runs.

### Phase 8 production cutover acceptance — 2026-07-27

```text
Live deployment
  dpl_75xrhi27MCgA5UDsQ6RhT6Ak4xrN
  target production; status READY
  apex and www assigned to onzio-platform-staging

Public/auth routes
  /, /roster, /schedule, /shop -> HTTP 200
  /club/about, /club/logo -> HTTP 200
  /admin/login, /admin/update-password -> HTTP 200
  homepage slideshow -> six images visible; controls advance
  no /storage/v1/render/image/ requests

Auth
  production Site URL and recovery callback corrected
  christianjavieralcala@gmail.com password recovery completed
  password sign-in plus mandatory MFA completed
  protected admin portal reached; Supabase last sign-in updated

Stripe
  existing destination we_1TwEpdK6WajTkwHYD5SEYzXX preserved
  exact seven-event allowlist, including invoice.paid
  invalid signature -> HTTP 400
  canonical resend -> HTTP 200
  one idempotent applied ledger row; active Pro/runtime live unchanged

Observability
  final deployment error-log query returned no errors
  legacy deployment/database preserved read-only for 7–14 days
```

No test was deleted, skipped, marked todo, loosened, or broadly mocked.

Known non-blocking warnings:

- four raw `<img>` warnings
- three unnecessary analytics `useMemo` dependency warnings
- the existing Supabase SSR Edge-runtime compile warning

## Known Constraints and Blockers

- `Onzio Platform Production` is healthy and serves the reconciled Rose City
  import, billing projection, and verified production domains.
- The exposed legacy production service-role key must never be reused. Its API
  keys are disabled and its legacy HS256 signing key is revoked; production
  configuration must use only the modern key posture.
- The rollback observation period is complete and is not a Phase 8 blocker.
  The content freeze was formally released at `2026-07-29T01:37:37Z`.
  Christian Javier Alcala is the recorded administrator, and
  `christianjavieralcala@gmail.com` is the sole active production
  owner/operator. `info@rosecityfutbolclub.com` was permanently removed; do
  not restore it or add `calcala1@berkeley.edu`.
- The authoritative final frozen export and two cutover plans are immutable
  historical evidence. The production import command is permanently retired
  and must not replay those inputs.
- The billing projection is complete. Before a production application
  deployment, configure only `price_1TwbmvK6WajTkwHYueLvjhv5` in
  `STRIPE_PRICE_IDS_PRO_GRANDFATHERED`; the hosted application must fail closed
  if that exact alias is absent or overlaps a standard Price.
- The preserved live webhook now returns a direct HTTP 200 from Onzio and
  listens to the exact seven-event allowlist.
- The approved migration-only pre-normalization exception is encoded behind an
  explicit planner flag and exact 16-file guard. It does not relax Phase 4
  browser-upload limits or allow corrupt, executable, video, GIF, or
  unreferenced exceptions.
- Christian reported that the staging organization was downgraded after the
  rehearsal, restoring the intended Free staging steady state. The installed
  CLI organization listing does not expose plan tier, so this is a
  user-confirmed billing-state record.
- The Vercel project's Production scope serves only
  `onzio-rcfc.vercel.app` for Rose City. The former apex and `www` domains are
  retired. Preview remains the protected `staging` branch and contains only
  staging values.
- The dedicated production Stripe runtime key is restricted to Customers
  Write, Customer Portal Write, Checkout Sessions Write, Prices Read, and
  Subscriptions Read. An earlier copy that surfaced during dashboard
  verification was expired immediately and was never installed.
- `STRIPE_WEBHOOK_SECRET` contains the preserved live destination's signing
  secret in Vercel Production; it remains outside Git and transcripts.
- Production Auth uses Resend custom SMTP through verified
  `auth.onziofutbol.com`; the delivery, recovery, password, MFA, and protected
  admin gate is complete. The built-in Supabase mailer is not the active
  production sender.
- Hosted operator execution must configure the exact actor UUID allowlist in
  `ONZIO_OPERATOR_USER_IDS`; no operator application UI or route exists.
- `npm run test:db` and full database-inclusive tests need JWT-shaped local
  `ANON_KEY` and `SERVICE_ROLE_KEY` values mapped into the
  `SUPABASE_TEST_*` variables.
- The abandoned-media cron is active in Vercel with the checked-in daily
  cadence, authenticated failure behavior, Production-only `CRON_SECRET`, and
  a sharp-free runtime boundary. Its first automatic execution remains normal
  ongoing operations evidence, not a Phase 8 blocker.
- The final legacy inventory is recorded and both legacy Rose City Vercel and
  Supabase projects are permanently deleted. Recovery now depends on the
  restricted off-repository frozen export; there is no hosted rollback target.
- The development-only ESLint 8 dependency-chain findings remain until the
  planned framework/lint-tooling migration.

## Next Milestone

`DCFC-401` through `DCFC-504` are complete and the Phase 5 gate is closed. The
new owner has one verified TOTP factor and one AAL2 session; protected Diverse
City admin, Starter/Pro entitlements, and the owner-only private-preview billing
route passed. The synthetic owner membership is removed and audited, leaving
exactly one active owner while retaining the pre-existing Auth user.
`DCFC-601` is the next defined package, but it was not started and requires a
fresh exact approval before any Stripe-test or lifecycle mutation. No retry
message, additional Auth configuration, Stripe, Vercel configuration or
deployment, DNS, production, Bunny.net, Phase 6, commit, or push is authorized.

This is preparatory work for a future first-new-club rollout. It does not
bypass the platform's presentation, prospect-automation, staging, billing,
domain, or production acceptance gates. Continue to require fresh approval for
every hosted mutation, publication, and production action.

## Historical Phase 8 closeout chronology

The site cutover, primary acceptance gates, Resend operator MFA prerequisite,
correction to the owned `auth.onziofutbol.com` Resend domain, approved Vercel
DNS publication, Resend verification, staging-only credential creation, and
staging SMTP configuration are complete. The staging invitation and recovery
messages reached Resend's `delivered` state across Yahoo and Berkeley. The
tenant callback implementation, token-hash templates, protected deployment,
Alpha/Bravo aliases, tenant login pages, and invalid-link failure path are now
verified. Under fresh approval, one new Yahoo recovery was initiated from the
Alpha staging `/admin/login` form and Resend reports it `delivered`. Christian
opened the newest link and completed password update plus password sign-in. The
Yahoo identity is now an audited active Alpha staging admin. Christian
completed mandatory MFA and confirmed protected-admin access; Supabase
independently records one verified TOTP factor and TOTP-authenticated session
claims. The staging gate is complete. The production-only Resend credential and
production custom SMTP configuration are also complete and reload-verified.
The first separately approved operator recovery exposed a missing clean `www`
callback; its code will not be reused and no password changed. Under fresh
approval, the clean `www` callback was added alongside the legacy entry,
reload-verified, and exactly one replacement recovery was delivered. That
replacement also fell back to the Site URL and its exposed code will not be
reused. Read-only diagnosis found the live login remains on the apex origin,
so the client requests
`https://rosecityfutbolclub.com/admin/auth/callback`, not the allowlisted
`www` callback. No further email was sent during diagnosis. Under fresh
approval, the exact clean apex callback was added alongside both existing
`www` entries; a full reload confirmed all three and `Total URLs: 3`. No email
was sent during configuration. Under a later fresh approval, exactly one new
operator recovery was initiated and Resend reports it `delivered`, but it also
fell back to the Site URL; its exposed code will not be reused. Deeper
inspection proved production still ran commit `21de7e7`, whose public bundle
requested the legacy query-bearing callback from the apex origin. Under fresh
approval, secure commit `92038d4` was rebuilt with Production settings and
became Ready Production deployment
`dpl_HY46CQoAJ7yJsXP8xkUmSp8pY9kC`. The live bundle now requests the clean
callback and uses production Supabase, and a forged recovery callback failed
closed with the expected safe error. No email was sent during deployment or
verification. Under a later fresh approval, exactly one corrected-production
operator recovery was initiated and Resend reports it `delivered`. Christian
used only the newest message and confirmed protected-admin access. Supabase
independently records the matching operator's fresh 00:25 PDT sign-in and 00:26
PDT update. The production operator SMTP and recovery acceptance gate is green.
Under fresh approval, exactly one Rose City owner recovery was also initiated
and Resend reports it `delivered`. Christian must use only that newest Rose
City message and complete callback/password/sign-in/MFA/admin acceptance
without sharing its URL. Christian does not control that mailbox; the actual
Rose City administrator will not be available until 2026-07-29, after the
current one-time recovery link's expected validity window. Treat tonight's
message as delivery-only evidence and do not use it tomorrow. When the
administrator is present, obtain fresh approval and initiate exactly one new
recovery for code/password/sign-in/MFA/admin acceptance.
The urgent mobile-admin navigation fix is now live. Commit `5342974` constrains
the drawer to the dynamic viewport, makes the navigation region independently
touch-scrollable, locks background scrolling while the drawer is open, accounts
for the device safe area, and adds the relevant ARIA relationship. Preview
deployment `dpl_GsHP4pf3GvkLEeAXd2fnT8iWm2GB` passed before the same commit was
rebuilt with Production settings as Ready deployment
`dpl_8jS4kN51y3fbKxGRM8xZuGyDzvqx`. Live verification at 390x667 confirmed an
actual touch-style scroll from the upper menu through Standings, Branding,
Analytics, and Payments, with the footer still reachable. The deployment-scoped
Vercel log view reported zero warning, error, or fatal entries. Local
verification passed `npx tsc --noEmit`, 179 contract tests, 16 architecture
tests, the production build, and the focused three-test mobile-navigation
regression suite.
The Rose City administrator's mobile retries exposed email-link prefetching in
the production recovery path. Read-only evidence showed the owner identity
received a fresh 08:51:59 PDT recovery sign-in while the administrator never
reached password creation, and the production template still used the direct
one-time `{{ .ConfirmationURL }}`. Under explicit approval, commit `2a45db0`
adds a public `/admin/recover` form that accepts the administrator email and
six-digit recovery code, calls Supabase recovery OTP verification only after
form submission, and then routes the verified session to the existing
password-creation page. It also keeps recovery available during billing
restrictions and updates the post-request login copy. Preview deployment
`dpl_BFvL9Lca32TGDijoRYW9URqNxEou` passed before the same commit was rebuilt
with Production settings as current Ready deployment
`dpl_9o1AxqVAYYLJ6LGc8FYFf3e1JkWR`.
The production Reset password template was then changed to display
`{{ .Token }}` and link only to
`{{ .SiteURL }}/admin/recover`; its body no longer contains
`{{ .ConfirmationURL }}` or a token-bearing GET link. Reload verification
confirmed the saved template. Live mobile verification confirmed the recovery
page renders with labeled email and six-digit code fields, and its browser
console and deployment-scoped warning/error/fatal counts are clean. Local
verification passed 19 focused authentication tests, 184 contract tests, 16
architecture tests, 498 complete tests against local Supabase, standalone
TypeScript, the production build, and the mobile interaction/error-state
check. No recovery or test email was sent; the real Rose City acceptance
attempt still requires separate email-send approval. Christian subsequently
approved exactly one recovery request for `info@rosecityfutbolclub.com`. The
live application accepted it, and Resend reports message
`247e7e72-64dd-4e54-8514-0bf95c868ec7` as `delivered`. At the initial delivery
check, its detail, body, and code had not been opened.
The administrator's screenshot then proved that production Supabase emitted an
eight-digit recovery OTP while the form truncated input to six digits. Treat
that screenshot code as exposed and unusable. Commit `c2ff06d` removes
digit-count-specific copy and accepts Supabase's supported 6–10 digit email OTP
range without truncation. Preview deployment
`dpl_29CwkZs4VRDAgcScfTAgJWNf8iWU` passed before the same commit was rebuilt
with Production settings as current Ready deployment
`dpl_25ryLCW9t66MUscKxki5DcBLs5p1`. Live verification on
`www.rosecityfutbolclub.com/admin/recover` retained all eight digits in a dummy
entry with `minLength=6`, `maxLength=10`, and `[0-9]{6,10}` validation; browser
logs were clean. The production Reset password template now says “recovery
code” rather than “six-digit code,” retains `{{ .Token }}`, and was
reload-verified. Local verification passed the 19 focused authentication tests,
184 contract tests, 16 architecture tests, 498 complete tests against local
Supabase, standalone TypeScript, and the production build. No replacement
recovery email was sent. Obtain fresh explicit approval before sending exactly
one new Rose City owner recovery for final password/sign-in/MFA acceptance.
Christian's operator recovery then exposed a second hosted Auth constraint:
Supabase correctly rejected `updateUser({ password })` from the recovery
session because the operator already has a verified MFA factor and the session
was still AAL1. Commit `c4673e8` adds the missing recovery MFA challenge:
verified-factor accounts must enter their current authenticator code and reach
AAL2 before the password form appears, while invitees without an enrolled
factor may still create their first password. Password submission independently
re-checks AAL and fails closed. A new loopback Supabase integration test
reproduces the hosted rejection, verifies AAL1-to-AAL2 elevation, and proves the
password mutation succeeds only afterward. Local verification passed 21
focused authentication tests, 186 contract tests, 16 architecture tests, 501
complete tests, standalone TypeScript, and the production build. Preview
deployment `dpl_8QJ9MAgWcB76M5aAmTf9D3qJVsAN` became Ready. Under explicit
approval, the same commit was rebuilt with Production settings as Ready
deployment `dpl_CDQ9wS6duGp4DScwyCLUxgijQkiP`. Live mobile verification reused
Christian's still-valid recovery session and showed the required authenticator
step before password creation. That check also exposed repeated browser Auth
client construction across navigation. Commit `f44d528` now reuses one
module-scoped browser Supabase client across login, recovery, MFA, admin, and
sign-out calls. Preview deployment `dpl_BZw8Zifia569oafz5aPGHnSaYFSs` passed
before the hardened commit was rebuilt with Production settings as current
Ready deployment `dpl_BYy5tXM99mCgFE7rZvfU5szkszi1`. The live Rose City page
still shows `Verify your identity`, the authenticator field retains numeric
one-time-code semantics and exact six-digit validation, and the browser
reported no errors. Final local verification passed 22 focused authentication
tests, 187 contract tests, 16 architecture tests, 502 complete tests,
standalone TypeScript, and the production build. No recovery or test email was
sent.
The remaining no-existing-factor recovery path is now covered by a second
isolated local Supabase integration case. A confirmed first-time administrator
without MFA verifies a recovery OTP at AAL1/AAL1, updates the password before
factor enrollment, signs in with the new password, enrolls TOTP, verifies the
authenticator code, and reaches AAL2. Both focused recovery/MFA integration
cases pass. The complete verification remains green at 187 contract tests, 16
architecture tests, 48 database tests, 503 combined tests, and standalone
TypeScript. No runtime change was required because the deployed recovery page
already allows AAL1/AAL1 password creation and the login page already starts
TOTP enrollment when no verified factor exists. No recovery or test email was
sent, and no hosted Auth, Supabase, Resend, or production setting changed.
Keep the no-edit
freeze and the legacy deployment/database read-only for 7–14 days while
monitoring public traffic, admin writes, media, Stripe deliveries, Auth email,
and runtime errors.
Releasing the freeze or decommissioning/downgrading the legacy production
resources requires a separate explicit decision after both the SMTP gate and
observation window pass.
The legacy rollback target is Vercel project
`prj_lMYzzUcUxR1iFwYTQZW71OYsgbv5`, deployment
`dpl_EQ9y1gBxQeZB3U8RrcpYpTsFW3g1`, with the apex, `www`, and legacy Vercel
aliases attached.

Do not change Stripe objects, Rose City domains/DNS, webhook destinations,
downgrade/delete legacy production resources, or release the Rose City no-edit
freeze without the applicable explicit approval.

## Working Commands

```bash
npm run db:start
npm run db:reset
npm run db:types
npm run db:types:check
npm run test:db
npm run test:legacy
npx tsc --noEmit
npm run test:contracts
npm run test:architecture
npm test
npm run media:smoke
npm run media:cleanup
npm run migration:export:rose-city
npm run migration:plan:rose-city
npm run migration:reconcile:rose-city
npm run operator:smoke
npm run lint
npm run build
```

For Apple Silicon systems where analytics/vector services conflict with the
local container runtime:

```bash
supabase start -x vector,logflare
```

After each meaningful milestone, update this file with shipped work,
verification, blockers, and the next step.
