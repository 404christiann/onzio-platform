# Contact section-guide editor

## Scope

Contact-only follow-up to the approved section-guide concept. This branch starts
from `origin/main` at `a413eb6` and excludes Programs, Tryouts, Shop, About and
Club Logo changes from the earlier editor branch. Hosted Supabase staging is
retired under Christian's current repository instructions; all validation uses
isolated local Supabase and synthetic tenant data.

## Acceptance and status ledger

| Package | Status | Completed work | Files | Verification | Blockers and next step |
| --- | --- | --- | --- | --- | --- |
| PPE-06 | in_progress | Approved section guide, real Academy/Editorial public canvas, contextual desktop/phone editing, shared-data ownership, atomic revisioned Save and actor-scoped receipts. Four reviewed defects fixed: strict revision type, uncertain-save reconciliation, reachable phone footer, modal focus. | Contact page/API, canvas/CSS, public annotations, schema/migration/types, tests/config, local auth helper, docs and branch-only deployment setting. | Exact isolated PR tree: TypeScript, lint, 982 contracts, 21 architecture checks, 259 DB tests including 14 Contact SQL regressions, 1627 full-suite tests, production build, diff check and 5 browser cases pass. Independent complete-diff review: no findings. | Native iOS Safari keyboard/safe-area and assistive-technology walkthrough remain unverified. Next: final helper/docs review, publish draft PR, then native-device acceptance before separately approved release. |

## Save contract

- One explicit Save commits Contact profile and page copy together under the
  authenticated tenant's RLS permissions.
- Revision conflicts require an explicit user decision. Legacy writes advance
  the revision; malformed revisions must fail before content or receipt writes.
- Uncertain outcomes reconcile the original actor-scoped operation receipt.
  Retrying a still-unconfirmed operation keeps its original ID and payload.
- Shared contact details state their ownership. Social links remain in Branding.
- Media retirement runs through the existing reference-safe server boundary
  after a confirmed commit.

## Release boundary

`vercel.json` disables automatic deployments for `codex/contact-editor` only.
The configured hosted Preview database could not be verified (sensitive values
are redacted). Review uses the verified local app. Do not merge or apply this
migration to a hosted database without separate release approval.

## Validation details and limitation

The five browser cases cover real commits hidden behind HTTP 500/network loss,
receipt failure, exact operation retries, modal focus/background isolation and
dismissal/restoration, plus Branding hit testing above Save at 390×844/390×408.
Synthetic changes are restored in `finally`; direct SQL cases roll back. The
existing authentication helper was aligned with the current Email address label
and automatic OTP submission so these checks are repeatable from this branch.

`db:types:check` has a pre-existing difference: the checked-in cleanup RPC accepts
nullable `p_actor_id`, while the generator emits `string`, plus an EOF difference.
Cleanup legitimately sends null. This PR preserves that override; the two new
Contact RPC definitions match local generation. Native iOS acceptance remains
open; Chromium reduced height does not prove software keyboard/safe-area behavior.
