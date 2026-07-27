# Onzio red contract suite

This directory remains intentionally ahead of the multi-tenant platform.
Rose City's legacy application has been copied into the repository, but
contract tests still import planned Onzio modules under `lib/`; database tests
still expect future local Supabase migrations; and architecture tests still
expect future tenant/security modules. Until each corresponding delivery phase
is implemented, those contracts must remain red.

Commands:

- `npm test` — legacy regressions plus all platform contracts
- `npm run test:legacy` — copied Rose City regression suite; must stay green
- `npm run test:contracts` — TypeScript behavior contracts
- `npm run test:db` — local Supabase/RLS contracts
- `npm run test:architecture` — static architecture contracts

The database suite accepts only loopback Supabase URLs. Stripe fixtures accept
only test-mode keys and events.

Phase 1 verified 229 passing legacy tests. The current platform failures are
requirements, not harness defects; do not skip, weaken, or broadly mock them.
