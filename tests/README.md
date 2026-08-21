# Onzio red contract suite

This directory remains intentionally ahead of the multi-tenant platform.
Rose City's legacy application has been copied into the repository, but
contract tests still import planned Onzio modules under `lib/`; database tests
still expect future local Supabase migrations; and architecture tests still
expect future tenant/security modules. Until each corresponding delivery phase
is implemented, those contracts must remain red.

## Local database setup — required before `test:db` or `npm test`

The database suite needs a running local Supabase **and** the test environment
exported into the shell. Vitest does **not** auto-load `.env.test`; nothing in
`vitest.config.ts` reads it, so the file alone is not enough.

```bash
supabase start
cp .env.test.example .env.test   # then fill in from `supabase status`
set -a && . ./.env.test && set +a && npm run test:db
```

Skipping the `set -a && . ./.env.test` step produces
`[RED CONTRACT] Local Supabase is unavailable or the planned onzio.clubs
contract is missing: Error: Expected 3 parts in JWT; got 1`, plus
`Invalid supabaseUrl`. Both mean **the environment was not exported**, not that
Supabase is down — check `supabase status` before concluding the database is
unavailable. Roughly 75 database tests fail this way, and the message has
already been misread once as an unrunnable environment (`DCFC-702`, 2026-08-06).

`.env.test` is gitignored. Its values are local fixtures: the Supabase demo JWTs
are identical on every local install, and the Stripe entries are inert
placeholders the suite rejects live values for.

Commands:

- `npm test` — legacy regressions plus all platform contracts
- `npm run test:legacy` — copied Rose City regression suite; must stay green
- `npm run test:contracts` — TypeScript behavior contracts
- `npm run test:db` — local Supabase/RLS contracts
- `npm run test:architecture` — static architecture contracts
- `npx vitest run lib/__tests__/registration-fields.test.ts
  lib/__tests__/registration-export.test.ts
  lib/__tests__/special-kickers-registration.test.ts
  tests/contracts/registration-submit.test.ts
  tests/database/registration-rls.test.ts` — participant-mode branching,
  branch-scoped validation, combined CSV behavior, the local-only Special
  Kickers draft definition, submission routing, and database enforcement
- `ROSTER_MEDIA_BASE_URL=https://onzio-platform.vercel.app npm run test:browser:roster`
  — retained focused roster compatibility check
- `SITE_MEDIA_BASE_URL=http://127.0.0.1:3000 npx playwright test
  --config=playwright.site-media.config.ts` — desktop and iPhone checks for
  every public image surface. Normal mode requires direct raw URLs, positive
  `naturalWidth`, and no unexpected fallback. Simulated source failure requires
  deliberate fallbacks and no broken-image chrome.

The database suite accepts only loopback Supabase URLs. Stripe fixtures accept
only test-mode keys and events.

Phase 1 verified 229 passing legacy tests. The current platform failures are
requirements, not harness defects; do not skip, weaken, or broadly mock them.
