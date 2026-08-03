# AGENTS.md

## Purpose

This file defines stable repository-wide instructions for agents working on Onzio Platform.

It is not the progress log. Current state, completed work, verification results, and the next milestone belong in `HANDOFF.md`.

## Required Reading Order

Before changing the repository, read:

1. `AGENTS.md`
2. `HANDOFF.md`
3. `docs/onzio-platform-plan.md`
4. `tests/README.md`
5. the tests relevant to the phase being implemented

Treat the architecture plan and contract tests as authoritative. If they conflict, stop and resolve the architectural decision before implementation.

## Current Repository Posture

- The project is contract-first and intentionally red.
- The Rose City application baseline has been copied and verified.
- The copied application is legacy compatibility source, not a completed
  multi-tenant implementation.
- Contract failures are requirements, not defects in the harness.
- Passing legacy or harness-safety tests do not mean the platform is
  implemented.

Never create placeholder application implementations solely to silence failures.

## Architecture Invariants

Preserve these decisions unless Christian explicitly changes them:

- Dedicated Supabase Pro production project
- Separate Supabase Free staging project
- One multi-tenant Next.js/Vercel deployment
- `onzio` exposed schema and unexposed `onzio_private` security helpers
- Explicit RLS for every exposed table
- Composite tenant foreign keys for tenant-owned relationships
- Server-mediated admin mutations with user-scoped RLS enforcement
- Service role limited to privileged server-only boundaries
- Passwordless email-code authentication for club owners and admins, with no
  self-service signup and a 30-day session-age boundary enforced from JWT AMR
- Mandatory TOTP/AAL2 for operators, with a two-hour TOTP-age boundary
- Operator-only club provisioning and owner transfer; club owners may add or
  remove `admin` memberships
- Existing Stripe account with tenant/environment metadata
- Stripe as billing source of truth
- Private preview before active/trialing billing
- Seven-day public-site grace after paid access ends
- Indefinite archival instead of normal hard deletion
- No Supabase runtime Image Transformations
- Versioned normalized media paths served directly without runtime optimization
- Rose City is the first production tenant and its subscription migrates in place

## Test-Driven Implementation Rules

- Implement one coherent contract area at a time.
- Run the narrow suite during development, then the complete suite.
- Turn tests green through production behavior, not test weakening.
- Do not delete, skip, mark todo, loosen, or broadly mock a failing contract without explicit approval.
- If a contract is technically impossible or contradicts verified platform behavior, document the evidence and ask before changing it.
- Add regression tests for newly discovered failure modes.
- Keep local database tests isolated from hosted projects.

Expected commands:

```bash
npx tsc --noEmit
npm run test:contracts
npm run test:architecture
npm run test:db
npm test
```

## Security Rules

- Never use a production Supabase URL or live Stripe key in tests.
- Never expose the service-role key to client code.
- Never trust client-provided `club_id`, host, origin, role, tier, price ID, MIME type, or storage path.
- Resolve tenant identity from a normalized verified domain.
- Re-check tenant, membership, role, session age, lifecycle, and entitlement at
  mutation time; re-check operator TOTP age at privileged boundaries.
- Treat RLS and database constraints as the final authorization boundary.
- Keep security-definer functions in `onzio_private` with an empty search path and narrow execution grants.
- Do not place secrets or full sensitive payloads in audit events or logs.
- Fail closed for unknown tenants, authorization uncertainty, and billing-state mismatch.

## Database and Migration Rules

- Develop against local Supabase first.
- Author checked-in migrations; do not make undocumented dashboard schema changes.
- Never run seeds against production.
- Read-only introspect Rose City production before reproducing legacy tables.
- Add RLS and grants in the same migration that creates an exposed table.
- Use composite `(club_id, id)` relationship constraints.
- Generate and commit typed database definitions once schema implementation begins.
- Take and verify backups before any production push or Rose City migration.

## Media Rules

- Never use `/storage/v1/render/image/`.
- Do not add `supabase-image-loader.js`.
- Upload raw files to private staging before validation.
- Verify actual signatures and dimensions; do not trust extensions or browser MIME.
- Reject SVG and executable formats in v1.
- Normalize photographs and graphics according to the architecture plan.
- Publish with UUID-versioned paths and immutable caching.
- Serve normalized photographs and graphics directly. Runtime image optimizer
  availability or quota must never be required for media to render.

## Rose City Migration Rules

- Do not mutate Rose City production during ordinary platform development.
- Do not begin cutover without Christian’s explicit approval.
- Freeze admin updates before export.
- Preserve a read-only rollback deployment and database.
- Reconcile row counts, relationships, media checksums, visual output, authentication, domains, and Stripe state before acceptance.
- Preserve the existing Stripe subscription ID.

## Documentation Rules

After meaningful work:

- update `HANDOFF.md` with completed work, verification, blockers, and the next step
- when working from a scoped epic or work package, update its status ledger
  before ending the turn; record the package ID, status, completed work, files
  changed, verification, blockers, and exact next step so another agent can
  resume without reconstructing the work
- never mark a work package complete unless its required acceptance evidence
  is recorded; use `blocked` or `in_progress` honestly when work remains
- update the architecture plan only when architecture changes
- update this file only when stable repository-wide agent instructions change
- do not use `AGENTS.md` as a chronological activity log

## Scope

These instructions apply to the entire repository unless a deeper `AGENTS.md` supplies more specific instructions for its directory.
