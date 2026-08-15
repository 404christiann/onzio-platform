# Claude Code Instructions

This repository uses the same contract-first workflow for every coding agent.

Before changing the repository, read in this order:

1. `AGENTS.md`
2. `HANDOFF.md`
3. `docs/onzio-platform-plan.md`
4. `tests/README.md`
5. the documentation and tests for the assigned milestone

For Diverse City FC Phase 0-3 work, also read:

1. `docs/phase-11/diverse-city/EPIC.md`
2. `docs/phase-11/diverse-city/DECISIONS.md`
3. `docs/phase-11/diverse-city/WORK-PACKAGES.md`
4. `docs/phase-11/diverse-city/STATUS.md`
5. the content or visual matrix relevant to the assigned package

Work on only the assigned work-package ID. Do not infer permission for later
packages, production provisioning, hosted Supabase changes, Stripe changes,
Vercel deployment, DNS, email, or publication.

## Mandatory gate before any production Vercel deploy

On 2026-08-14, code was deployed to production (`vercel --prod`) while
production's Supabase database was missing 3 migrations the deployed code
depended on (`club_store_enabled` and two others). One of the missing
columns (`clubs.store_enabled`) is selected by the tenant-resolution query
that runs on *every* request for *every* club — so the mismatch didn't just
break the new feature, it broke Diverse City FC's live production site
entirely (`UNKNOWN_TENANT` on every domain lookup) until a rollback
restored service. `npm run build` cannot catch this class of bug: it
type-checks against `lib/db-types.ts`, not against the live database schema.

**Before running `vercel --prod` (or any production deploy) from any
branch, this check is mandatory and must pass first — no exceptions, no
"the build succeeded so it's probably fine":**

```bash
supabase link --project-ref ioalthwsdrlzrubomrow
supabase migration list --linked
```

Confirm every migration file under `supabase/migrations/` in the branch
being deployed shows as applied on the **Remote** side. Any migration
present **Local**-only (i.e. checked into the branch but not yet applied to
production) means: **do not deploy the code yet.** Apply the migrations
first:

```bash
supabase db push --linked --dry-run   # preview exactly what would apply — read it
supabase db push --linked             # apply, only after the dry-run looks right
```

Then re-run `supabase migration list --linked` to confirm the remote ledger
now matches the branch exactly, and only then deploy the code.

This is the same discipline already used for every prior Diverse City FC
production migration (see `docs/phase-11/diverse-city/PRODUCTION-CUTOVER-ROLLBACK.md`
and `docs/phase-11/diverse-city/STATUS.md` for the established pattern) — the
gap on 2026-08-14 was that this step was skipped for a deploy that carried
schema changes bundled in with unrelated feature work, not that the pattern
was unknown.

## After any production deploy: confirm the alias actually moved

`vercel --prod` reporting `● Ready` and `target: production` does **not**
mean the deployment is serving traffic. If the project was ever rolled back
with `vercel rollback`, the production alias stays **pinned** to the
rolled-back deployment, and subsequent `vercel --prod` runs build
successfully while changing nothing that users see. On 2026-08-14 this
silently swallowed two redeploy attempts before it was noticed.

After every production deploy, verify the alias:

```bash
vercel inspect onzio-platform.vercel.app
```

If the reported deployment id is not the one just built, promote it
explicitly:

```bash
vercel promote <new-deployment-url> --yes
```

**Validate before promoting.** DCFC's private hostname
`diverse-city-fc-private.vercel.app` (`is_primary=false`) exists for this:
point it at the new deployment with `vercel alias set`, confirm the real
tenant resolves and renders against real production data, and only then move
the public alias. This catches schema/code mismatches and tenant-resolution
failures — the 2026-08-14 incident's exact signature — before any customer
sees them, which local and staging verification structurally cannot.

Before ending any implementation turn, update
`docs/phase-11/diverse-city/STATUS.md` with:

- agent and work-package ID
- current status
- completed work
- files changed
- verification run and results
- blockers or unresolved decisions
- exact next step

After meaningful integrated repository work, update `HANDOFF.md` as required by
`AGENTS.md`. Never report a package complete without recording its acceptance
evidence.
