# Onzio Platform

Onzio runs club websites and their admin tools in one Next.js application.
Clubs manage their roster, schedule, programs, registrations, sponsors, and
media through a tenant-scoped admin portal.

The application uses Supabase for authentication, PostgreSQL, and media storage.
Stripe handles club subscriptions and registration payments. Verified domains
resolve each request to a club, with database row-level security enforcing
tenant access.

## Run locally

Install the locked dependencies:

```bash
npm ci
```

Follow the [local development guide](docs/local-development.md) to start local
Supabase, configure `.env.local` and `.env.test`, and use the synthetic
Alpha/Bravo fixtures. Then start the app:

```bash
npm run dev
```

Open [Alpha FC](http://alpha.localhost:3000). Requests to bare `localhost`
require the explicit tenant fallback described in the development guide.
The prepared Ubuntu VM has a separate [launcher and port](docs/vm-development.md).

## Verify changes

Start local Supabase and export the test environment before running the suites:

```bash
set -a
. ./.env.test
set +a
npm test
npm run lint
npm run build
npx tsc --noEmit
```

Run database and browser suites serially because they share local fixtures.
The [test guide](tests/README.md) explains suite coverage, environment checks,
and browser setup. Investigate failures against the current requirements;
the repository's original red-contract phase is historical.

## Project documentation

- [Architecture and platform decisions](docs/onzio-platform-plan.md).
- [Current work and verification history](HANDOFF.md).
- [Repository instructions for coding agents](AGENTS.md).

Historical plans record their original scope and acceptance evidence. Check
the current handoff before treating an old milestone as unfinished work.
