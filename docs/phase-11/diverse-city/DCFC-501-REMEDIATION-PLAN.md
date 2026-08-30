# DCFC-501 Staging Remediation Approval Plan

Epic: `DCFC-EPIC-002`

Status: `complete`

Last updated: 2026-08-02

This plan is the narrow hosted-remediation gate required to re-run and close
the read-only `DCFC-501` preflight. It is not `DCFC-502` authorization. It does
not authorize a schema release, deployment, tenant provisioning, content or
media import, invitation/email, DNS change, production access, or Bunny.net
work.

## Exact Boundary

- Supabase target: staging project `fxefqnoqxbezeccjvrsw` only.
- Vercel target: existing shared project
  `prj_I362ysmh9cse5cRxnL7db4dOhsEs` (`onzio-rcfc`) only.
- Stripe target: test-mode staging webhook only. No live-mode reads or writes.
- Filesystem target: a new timestamped, mode-restricted directory below
  `/Users/christianalcala/Downloads/onzio-migration-private/` for staging
  backup evidence. It remains outside Git.
- Cleanup/rollback owner: Christian Alcala; the executing agent records the
  evidence and stops on any mismatch.
- Hosted-mutation ceiling: six Supabase migration-history status changes, one
  newly generated Vercel automation-bypass credential, one Stripe test webhook
  URL update, and revocation of the exposed Vercel bypass after replacement is
  proven. No other hosted mutation is allowed.

Secrets must stay in provider-managed storage or process memory. Do not place a
bypass value, Stripe signing secret, Supabase key, database password, Auth
identity, email address, token, session, or action URL in Git, command output,
or documentation.

## Verified Cause

The three hosted-only Phase 7 migration versions are execution timestamps from
the original staging provisioning. Their stored SQL and resulting routines
were compared with the tracked canonical migrations:

| Hosted history version to mark reverted | Canonical local version to mark applied | Semantic evidence |
| --- | --- | --- |
| `20260727171934` | `20260727171658` | Same private-preview resolver behavior. The only normalized text difference is equivalent `SET search_path TO ''` versus `SET search_path = ''` syntax. Current routine security, volatility, search path, and grants match. |
| `20260727174125` | `20260727174006` | Runtime hardening statement matches after removing a trailing newline; current billing-function search paths and grants match. |
| `20260727174503` | `20260727175200` | Public hardening block matches after removing comments/trailing whitespace; current public/private resolver grants match. |

Canonical file SHA-256 values:

- `20260727171658_phase7_private_preview_resolution.sql`:
  `02b9f2e2d7f9abc21a2b2b1cdea1c77e8324c3e321da969704578702756626e2`
- `20260727174006_phase7_runtime_function_hardening.sql`:
  `c61eee161119f90b8767c0d924d1f9873712bc5b1b37b710c242706c9fb62d15`
- `20260727175200_phase7_public_function_hardening.sql`:
  `ef99b27992ef25f1a1bfb998c14bd952d5c9b37f14ea9da43a8c41a46f4a3566`

Git history shows those canonical filenames existed in the original Phase 7
staging commits. Renaming them to match the staging execution timestamps is
prohibited because production migration history is outside this preflight and
must not be inferred or altered. Supabase migration repair changes only the
migration-history table; it does not execute or reverse migration SQL.

After history repair, the expected reviewed release delta is exactly these ten
local migrations, still unapplied until a separately approved `DCFC-502`:

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

## Required Decisions

Approval must explicitly accept all of the following for this remediation:

1. **Free-plan staging password-screening exception.** Supabase leaked-password
   protection is available only on Pro and above, while the locked architecture
   requires a Free staging project. The recommended choice is to accept this
   staging-only limitation with compensating controls: protected/noindex
   deployment, staging-only identities, mandatory TOTP/AAL2 for administrators,
   minimum membership, no production-password reuse, and no public launch. The
   production Pro project remains required to keep leaked-password protection
   enabled. Temporarily upgrading staging is not included.
2. **Free-plan manual backup.** Free projects do not provide downloadable daily
   backups. Approve a fresh out-of-Git role/schema/data dump plus migration,
   tenant, Auth-count, Storage-inventory, and deployment snapshots in the
   restricted directory named above, with SHA-256 evidence. Storage currently
   has zero objects, but its inventory must still be recorded.
3. **History-only migration repair.** Approve replacing the three hosted
   execution-timestamp history entries with the three canonical versions above.
   No migration SQL or seed may run.
4. **Atomic bypass rotation.** Treat the sole existing Vercel automation bypass
   as exposed. Approve generating a replacement, updating only the Stripe test
   webhook URL to the existing protected staging alias, proving the replacement
   reaches the application, then revoking the old bypass. The webhook signing
   secret and seven-event allowlist remain unchanged.
5. **Migration-ledger acceptance clarification.** For `DCFC-501`, "match" means
   that the already-executed baseline maps exactly to canonical repository
   history and the unapplied reviewed release delta is explicitly enumerated.
   Requiring zero pending migrations would contradict `DCFC-502`, whose purpose
   is to apply that exact release delta. This clarification does not authorize
   applying it.

## Approved Execution Sequence

Every step fails closed. A mismatch stops the remediation and triggers ledger
updates before any later step.

1. Reconfirm the exact Supabase ref, Vercel project ID, Stripe test mode,
   current migration rows, protected aliases, one bypass-entry count, webhook
   ID, and seven-event allowlist. Do not return secret values.
2. Create the restricted private backup directory. Export roles, schema, and
   data with the installed Supabase CLI; record SHA-256 values and the safe
   database/tenant/Auth-count/Storage/deployment inventories. Validate that the
   dump files are non-empty and remain outside Git.
3. Generate a second Vercel automation bypass while the old one remains active.
   Probe the protected staging alias with the replacement in memory and require
   an application response rather than a Vercel Authentication redirect.
4. Update only the Stripe test webhook URL to use the same existing protected
   staging alias and the replacement bypass. Read it back in test mode, verify
   the event allowlist is unchanged, and repeat the non-secret endpoint probe.
5. Revoke the exposed old bypass only after steps 3 and 4 pass. Read back that
   exactly one bypass entry remains; never print its value.
6. Run the history-only repair in this order:

   ```text
   supabase migration repair --linked --status reverted 20260727171934 20260727174125 20260727174503
   supabase migration repair --linked --status applied 20260727171658 20260727174006 20260727175200
   ```

7. Require `supabase migration list --linked` to show canonical Phase 1-7
   history plus exactly the ten local-only migrations listed above. Require
   `supabase db push --linked --dry-run` to plan exactly those ten files and no
   seed or unexpected migration. Do not run `supabase db push` without
   `--dry-run`.
8. Re-run the complete read-only `DCFC-501` evidence set, including PostgREST
   schema exposure, active publishable-key type without the key value,
   Auth/TOTP/AAL1/SMTP posture, Vercel protection, Alpha/Bravo isolation,
   capacity, logs, and rollback evidence.
9. If and only if all `STAGING-ACCEPTANCE.md` preflight requirements pass,
   mark `DCFC-501` complete and stop. Request a new, exact `DCFC-502` approval;
   do not deploy or apply the ten release migrations.

## Rollback and Stop Conditions

- If backup capture or validation fails, perform no hosted mutation.
- If new bypass generation or its probe fails, leave the existing webhook and
  old bypass unchanged; revoke only an unused newly generated bypass.
- If the Stripe test webhook update fails, keep the old bypass active, restore
  the prior test URL if it changed, and revoke the unused replacement.
- If old-bypass revocation cannot be proven, stop and treat both bypasses as
  exposed until a separately approved correction.
- If migration repair partially fails, do not apply schema migrations. Restore
  the prior history shape by marking any newly applied canonical versions
  reverted and the three verified execution-timestamp versions applied, then
  compare the saved history snapshot.
- Any production identifier, live Stripe mode, unexpected migration, schema
  SQL execution, seed proposal, unprotected deployment, Alpha/Bravo drift,
  secret in output, or Bunny reference is an immediate stop.

## Execution Record — 2026-08-02

Christian supplied the exact-scope approval below. The remediation completed
against only the named staging resources, and the read-only acceptance re-run
closed `DCFC-501`.

- The restricted backup directory is
  `/Users/christianalcala/Downloads/onzio-migration-private/diverse-city-staging-phase5-2026-08-02T161244Z`.
  The directory is mode `0700`; `roles.sql`, `schema.sql`, and `data.sql` are
  mode `0600`, non-empty, and remain outside Git. Their byte sizes and SHA-256
  values are respectively: 370 /
  `168a95a9c745af5ed4679751f90419ac9dc434240a213b03e32a06d5664c2308`;
  118389 /
  `b85b1d5f8a6b6fdfecf59ebf95b74bfab3e609a4cdc8a932edc8ac925a455715`;
  and 91843 /
  `74417401cf55e77e78501eca7a5c92316f26624ffcf20017b66acf11684d6c41`.
- Pre-change safe state was two clubs, two domains, five memberships, four
  orphaned media rows, 45 audit events, zero cleanup-queue rows, seven Auth
  users, five verified MFA factors, 14 sessions, two Storage buckets, zero
  Storage objects, and ten migration-history rows. No Auth identity, email
  address, token, message, or secret was recorded.
- The first bypass replacement reached the application and the Stripe test
  endpoint was updated, but Vercel rejected revoking the old bypass until the
  replacement was designated as an environment-variable bypass. The approved
  rollback path restored the prior Stripe URL and revoked that unused
  replacement. A corrected second replacement was generated, designated
  `isEnvVar=true`, proved through both header and query probes with application
  HTTP `400 INVALID_SIGNATURE` responses, installed on the same test webhook,
  and followed by revocation of the exposed old bypass. Final state is exactly
  one environment-variable bypass. No bypass value or signing secret was
  printed or recorded.
- The same enabled test webhook
  `we_1TxrnaK6WajTkwHYtFEvCEo8` now targets the existing protected staging
  alias at `/api/stripe/webhook`, remains `livemode=false`, and retains exactly
  the approved seven-event allowlist. The rollback/retry produced three Stripe
  test URL mutations total. Vercel recorded five successful mutations total:
  two replacement generations, two environment/revocation operations for the
  successful rotation, and revocation of the rolled-back replacement. One
  rejected revoke request made no state change.
- The approved history-only repair marked hosted execution timestamps
  `20260727171934`, `20260727174125`, and `20260727174503` reverted and
  canonical versions `20260727171658`, `20260727174006`, and
  `20260727175200` applied. No migration SQL or seed ran. The final linked
  ledger aligns all ten canonical Phase 1-7 versions. A linked dry run lists
  only the ten reviewed Phase 9/11 migrations above for a future `DCFC-502`.
- The final read-only acceptance verified healthy Free-plan capacity; clean
  linked `onzio,onzio_private` lint; RLS on all 32 current `onzio` tables;
  `onzio` exposed and `onzio_private` excluded from the Data API; no private
  browser-table or `PUBLIC` private-function grants; active modern publishable
  keys with legacy JWT keys disabled; TOTP and the 15-minute AAL1 policy;
  custom staging SMTP, safe Auth URLs, and rate limits; unchanged Alpha/Bravo
  isolation; protected Vercel state; test-only Stripe state; logs; and rollback
  evidence. The accepted Free-plan leaked-password and downloadable-backup
  exceptions remain staging-only.
- During dashboard navigation, the Auth Users page and the Project Settings
  membership panel incidentally rendered identity fields. No identity was
  used, copied, or recorded. This was read-only and caused no hosted change.
- No deployment, schema release, tenant provisioning, content/media import,
  Auth/email send, DNS, production, Bunny.net, commit, or push action occurred.
  `DCFC-502` remains separately approval-gated.

## Exact Approval Language

To authorize only this remediation, reply:

> I approve the DCFC-501 staging remediation plan for Supabase project
> fxefqnoqxbezeccjvrsw, Vercel project
> prj_I362ysmh9cse5cRxnL7db4dOhsEs, and the existing Stripe test webhook. I
> accept the Free-plan staging password-screening exception and manual private
> backup plan, the history-only six-version repair, the atomic Vercel bypass
> rotation and Stripe test webhook URL update, and the DCFC-501 migration-ledger
> clarification. This does not authorize DCFC-502, production, email, DNS,
> Bunny.net, commit, or push work.

This exact-scope approval was received on 2026-08-02 and is exhausted. It does
not roll forward to `DCFC-502` or any later package.
