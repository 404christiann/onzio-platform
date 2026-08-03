# DCFC-502 Staging Release and Private Tenant Approval Packet

Epic: `DCFC-EPIC-002`

Status: `complete`

Last updated: 2026-08-02

This packet defined the exact Class 3 boundary for `DCFC-502`. Christian
approved that boundary for release commit
`8e3cde2da52ec35a9e5fd7935197953c899a6cc5` on 2026-08-02. The execution
record below closes this package and exhausts that approval. It does not
authorize `DCFC-503` or any later action.

## Release-Push Prerequisite

The reviewed Phase 5 source existed as one local commit on `staging`. The
repository record showed that the Vercel project serves the Git `staging`
branch and that Git pushes create deployments. Christian's exact `DCFC-502`
approval resolved the earlier boundary by authorizing the protected deployment
of the exact commit. The prerequisite is complete.

Before that approval the push remained withheld until Christian either:

1. authorizes the resulting protected staging deployment as part of
   `DCFC-502`; or
2. supplies an approved way to update the Git ref without creating a Vercel
   deployment.

No Vercel Git setting or ignored-build rule was changed, and no deployment was
created/cancelled as a workaround. The approved Git push directly produced the
recorded protected Preview deployment.

## Exact Targets and Tenant Input

- Supabase staging project: `fxefqnoqxbezeccjvrsw`
- Vercel project: `prj_I362ysmh9cse5cRxnL7db4dOhsEs` (`onzio-rcfc`)
- Git branch: `staging`
- Tenant slug: `diverse-city`
- Tenant name: `Diverse City FC`
- Proposed protected hostname: `diverse-city-onzio-staging.vercel.app`
- Lifecycle: `onboarding`
- Public access: `preview`
- Pre-billing tier: `starter`
- Operator actor: Christian's existing staging operator account, resolved
  privately at execution time and never recorded in Git or command output
- Backup/rollback baseline: the restricted `DCFC-501` backup and prior ready
  deployment `dpl_GJbEfRwSagF6gNt2ESqwPSxZuzua`

The execution agent must replace `<RELEASE_COMMIT_SHA>` in the approval text
with the full local commit SHA reported by this release-preparation step and
must prove that the remote `staging` ref matches it before any hosted action.

## Exact Migration Allowlist

Only these checked-in migrations may be applied, in this order:

1. `20260729040045_phase9_presentation_system.sql`
2. `20260729223334_phase9_homepage_hero_content.sql`
3. `20260729234512_phase9_clubhouse_presentation_template.sql`
4. `20260730015524_phase9_site_branding_inverse_logo.sql`
5. `20260730020818_phase9_shop_third_kit_variant.sql`
6. `20260801120000_phase11_diverse_city_domains.sql`
7. `20260802013518_dcfc_301_programs_media_entitlement.sql`
8. `20260802020000_dcfc_302_contact_media_entitlement.sql`
9. `20260802021531_dcfc_303_tryouts_media_entitlement.sql`
10. `20260802023000_dcfc_304_academy_presentation_template.sql`

`supabase/seed.sql` must not run against hosted staging. Any extra, missing,
reordered, or modified migration is a stop condition.

## Authorized Actions After Fresh Approval

The future `DCFC-502` approval may authorize only this sequence:

1. Reconfirm the exact Git commit, Supabase/Vercel targets, canonical migration
   ledger, prior deployment, tenant/domain absence, operator allowlist, and
   protected/noindex posture without returning credentials or identity data.
2. Push the exact reviewed commit to `staging` if it has not already been
   pushed and record the protected Vercel Preview deployment caused by that
   push.
3. Apply only the ten allowlisted migrations to Supabase staging; do not apply
   a seed.
4. Provision exactly one `diverse-city` / `Diverse City FC` club through the
   audited operator boundary as `starter` / `onboarding` / `preview`.
5. Add and verify only `diverse-city-onzio-staging.vercel.app` as the protected
   tenant hostname/domain mapping.
6. Read back the migration, deployment, club, domain, and audit evidence;
   verify unknown/cross-tenant hosts fail closed and all responses remain
   protected and non-indexed.
7. Stop before `DCFC-503`.

## Explicit Exclusions

This packet does not authorize:

- content, media, or presentation import (`DCFC-503`)
- Auth user creation, membership invitation, email, password, or MFA work
  (`DCFC-504`)
- Stripe or lifecycle rehearsal (`DCFC-601`)
- DNS, a final club domain, production, public launch, or indexing
- Bunny.net credentials, libraries, uploads, references, or a Diverse
  City-specific video branch
- Phase 6 or any later package
- commit amendment, additional release commits, pull requests, or unrelated
  repository changes

Diverse City continues to use the approved crest-led hero with the vertical
video story hidden. Any future video work must be a separate reusable,
tenant-safe platform capability.

## Acceptance and Rollback Evidence

Acceptance requires the exact commit/deployment relationship; the canonical
migration ledger; clean linked schema lint; exactly one new
Starter/onboarding/preview club and domain; audited operator attribution;
protected/noindex HTTP behavior; unknown-host failure; and no content,
membership, Storage object, email, Stripe, DNS, production, or Bunny mutation.

If deployment fails, restore the prior protected release. Keep additive schema
intact unless a separately reviewed down migration exists. If provisioning or
domain verification fails, archive/detach only the newly created Diverse City
tenant through audited operator tooling; do not delete rows ad hoc. A mismatch
at any step stops the package and must be recorded in `STATUS.md`,
`STAGING-ACCEPTANCE.md`, and `HANDOFF.md`.

## Execution Record — 2026-08-02

- Approval: Christian approved this packet for exact release commit
  `8e3cde2da52ec35a9e5fd7935197953c899a6cc5`; the approval is exhausted.
- Git/Vercel: pushed `staging` from `a659764` to the approved commit. Protected
  Preview deployment `dpl_8W3YtWSw6Bu2qAaUndeofiiWd2KM` became `READY` at
  `onzio-rcfc-3zhpir3p1-404christianns-projects.vercel.app`, and the approved
  alias `diverse-city-onzio-staging.vercel.app` points to it. The branch alias
  remains `onzio-rcfc-git-staging-404christianns-projects.vercel.app`.
- Schema: the linked dry run listed exactly the ten allowlisted migrations.
  `supabase db push --linked --yes` applied exactly those ten without seed.
  Local and hosted histories now align on all 20 canonical versions, and
  linked `onzio,onzio_private` lint reports no schema errors.
- Tenant: audited operator provisioning created club
  `d88bf71b-9820-49ae-9dc0-7556b0813885` exactly once as
  `starter` / `onboarding` / `preview`, one active/verified/primary staging
  domain, one active owner membership using the existing staging operator
  identity, and one `operator`/`provision` audit event. No Auth user or email
  action was created.
- Reconciliation: staging now contains three clubs, three domains, six
  memberships, and 46 audit events. Diverse City has zero subscriptions,
  Stripe events, media assets, Programs, Contact rows, Tryouts, presentation
  rows, branding, hero/About/shop rows, players, staff, matches, or seasons.
  Auth remains seven users/five MFA factors; Storage remains two buckets/zero
  objects.
- HTTP/runtime: an unauthenticated request to the tenant alias redirects to
  Vercel SSO with `Cache-Control: no-store`; the authenticated admin entry
  resolves HTTP 200; the public route remains deliberately unavailable at
  HTTP 404 while the tenant is `onboarding`/`preview`, matching Bravo's private
  staging behavior; the unknown staging hostname fails HTTP 404 with
  `Cache-Control: no-store` and `X-Robots-Tag: noindex`. The exact deployment
  produced zero error-log entries and zero 5xx requests during acceptance.
- Advisors: no new schema-lint error exists. Security advisors contain the
  previously accepted Free-plan leaked-password warning and intentional
  privileged-table no-policy informational notices. Performance advisors are
  informational and include existing/unindexed composite media-reference keys;
  changing them requires a separately reviewed migration.
- Credential handling: Vercel correctly withheld sensitive Preview values.
  The installed Supabase CLI unexpectedly rendered disabled legacy JWT values
  during an API-key metadata read even without `--reveal`; neither value was
  copied into Git or documentation, and status-only probes confirmed both are
  rejected with HTTP 401. Modern secret use stayed in process memory.
- Failed attempts: two temporary provisioning runners failed before execution
  (module format, then dependency resolution), and one read-only SQL query had
  a type mismatch. None reached a hosted mutation. The final runner succeeded
  once and was removed; the release worktree returned clean before ledger edits.
- Hosted mutations: Git one push; Vercel one protected Preview deployment and
  one alias assignment; Supabase ten migration applications plus one club, one
  domain, one membership, and one audit row. Auth/email, Storage, content/media,
  presentation, Stripe, DNS, production, Bunny.net, and Phase 6 mutations: zero.
- Rollback: not required. Prior ready deployment and restricted `DCFC-501`
  backup remain the recorded rollback baseline.
- Exact next step: obtain a fresh `DCFC-503` approval naming tenant
  `d88bf71b-9820-49ae-9dc0-7556b0813885` and immutable plan digest
  `63d1867685c59c7dee3ce2cedda9e8400dae73d930d2488a601bdec5fae9fa36`.
  Stop before any content/media/presentation import.

## Exact Approval Language

The exact language below was satisfied with the full release SHA and is now
historical/exhausted:

> I approve DCFC-502 for release commit `<RELEASE_COMMIT_SHA>` on Git branch
> `staging`, Supabase staging project `fxefqnoqxbezeccjvrsw`, Vercel project
> `prj_I362ysmh9cse5cRxnL7db4dOhsEs`, and exactly the ten migrations listed in
> `DCFC-502-APPROVAL-PACKET.md`. I authorize the protected staging deployment
> of that exact commit and audited provisioning of one Starter/onboarding/
> preview tenant with slug `diverse-city`, name `Diverse City FC`, and hostname
> `diverse-city-onzio-staging.vercel.app`, using my existing staging operator
> account resolved privately. This does not authorize DCFC-503, content/media/
> presentation import, Auth invitation or email, Stripe, DNS, production,
> Bunny.net, Phase 6, or any later package.

Approval is valid only when `<RELEASE_COMMIT_SHA>` is replaced by the full
40-character commit SHA. It is exhausted when `DCFC-502` is reconciled and
recorded, and it does not roll forward.
