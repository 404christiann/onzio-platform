# Ubuntu VM development

This checkout is ready at `/home/coder/projects/onzio-platform` in Ubuntu-Coding.
Open **Onzio Coding** from Ubuntu's app menu for a project shell, or **Onzio
Agent** for Codex. The absolute launcher is `/home/coder/.local/bin/onzio`.
It adds the installed tool paths for this project without editing shared shell
profiles or changing the other project's Node runtime.

## Working commands

```bash
onzio status
onzio task short-task-name
onzio agent
onzio dev
onzio test
onzio test:db
onzio typecheck
onzio db-start
onzio db-stop
```

The app runs at `http://alpha.localhost:3110`; the local login page is
`/admin/login`. Supabase Studio is on `http://127.0.0.1:54323`, and local Auth
email is delivered to the local inbox at `http://127.0.0.1:54324`.

The VM uses Node 24.22.0, Codex CLI 0.163.0, Docker Engine 29.9.1, Supabase CLI
2.121.0, and project-scoped Chromium. `npm ci` used the existing lockfile.
Optional analytics/vector/image-proxy services are excluded from the local
Supabase stack. No package manifest or lockfile change is needed.

## Local environment

`.env.local` and `.env.test` are gitignored, mode 600, and contain loopback-only
database credentials. The app's `ONZIO_ENVIRONMENT=production` value matches
the production-labelled synthetic Alpha domain fixtures; it does not select
a hosted database. Stripe, Resend, Vercel and hosted Supabase credentials are
absent. Provider-dependent routes fail closed. Test Stripe values are inert
placeholders only. Never copy production environment files into this VM.

`onzio test` exports `.env.test` before running Vitest. Run shared-fixture
database and browser suites serially. `db-stop` preserves the local data;
avoid global Docker reset/prune commands.

## Agent workflow

Read the checked-in `AGENTS.md`, current handoff and task-specific documents,
plus local `AGENTS.override.md` and
`/home/coder/.codex/HYBRID-WORKFLOW.md`. Historical release approvals do not
authorize new releases or hosted actions. Do not infer an assignment from an
old handoff entry.

Start task branches with `onzio task NAME`, implement only the assigned work,
run relevant checks, use independent review agents for substantive changes,
and submit a PR containing its current SHA, actual test results, review
findings/resolutions, and risks. The VM authenticates as `onzio-coder`; Git
credentials and author identity are configured locally in this checkout.
Only the supervising user account may merge protected branches. VM agents
must never merge, enable auto-merge, enqueue, approve for the user, change
protections, deploy, or mutate hosted systems without a separate explicit
assignment. Reviewer badges never replace the user's explicit desktop merge
approval. The launcher starts workspace-write Codex with approval requests
and a separate session rather than sharing a background daemon.

Do not read, change, reconfigure, or restart `unified-ai-chat` as part of Onzio
work. This setup did not modify that checkout, its dependencies, or services.

## Baseline verification

On 2026-10-16, TypeScript, lint, production build, all 21 architecture tests,
and the complete 192-file/1,813-test suite passed against the synthetic local
database. The browser smoke rendered Alpha FC and the local login page, with
no browser JavaScript errors. Local validation logs are under
`/home/coder/.local/state/onzio`; local runtime instructions are also available
at `/home/coder/.local/share/onzio-tools/README.txt`.

These are environment-readiness checks, not acceptance of a new application
feature or authorization for production work.
