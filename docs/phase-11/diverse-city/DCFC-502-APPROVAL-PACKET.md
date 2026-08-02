# DCFC-502 Staging Release and Private Tenant Approval Packet

Epic: `DCFC-EPIC-002`

Status: `prepared_not_authorized`

Last updated: 2026-08-02

This packet prepares the exact Class 3 boundary for `DCFC-502`. It does not
authorize or execute a hosted migration, deployment, tenant/domain
provisioning action, content/media import, identity change, or provider
configuration change.

## Release-Push Prerequisite

The reviewed Phase 5 source will exist as one local commit on `staging`. The
repository record shows that the Vercel project serves the Git `staging`
branch and that Git pushes create deployments. The current authorization both
requests a push and expressly excludes deployment, so the push must remain
withheld until Christian either:

1. authorizes the resulting protected staging deployment as part of
   `DCFC-502`; or
2. supplies an approved way to update the Git ref without creating a Vercel
   deployment.

Do not mutate Vercel Git settings, add an ignored-build rule, or create/cancel
a deployment to work around this boundary. The exact local release commit is
reported outside the commit after it is created; a Git commit cannot safely
contain its own final SHA.

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

## Exact Approval Language

After the release commit is pushed or deployment-on-push is expressly included,
Christian may authorize only this package with:

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
