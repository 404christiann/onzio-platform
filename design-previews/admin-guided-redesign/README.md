# Guided admin preview

Christian selected **B — Guided** and approved implementation on 2026-10-11.
The implementation lives on `codex/admin-guided-redesign` in its attached isolated
worktree. All 19 protected destinations use the selected direction, including
the approved icon dependency from the separate icon chat.

`review.html` compares captures of the actual baseline and Guided applications.
Choose a page, desktop or phone, light or dark, and Guided / Before / Compare.
These captures use the same local synthetic Alpha owner and restored fixture
state. They are evidence, not interactive replicas of the application.
`directions.html` preserves the original sample-only A/B design comparison.

Serve only this preview directory:

```bash
python3 -m http.server 8768 --bind 127.0.0.1 --directory design-previews/admin-guided-redesign
```

Open `http://127.0.0.1:8768/review.html`. The actual local application is at
`http://alpha.localhost:3110/admin`; authentication uses the isolated local
Supabase and email-code fixtures. No hosted database or billing actions are
needed to view the gallery.

## Reproducing captures

Build and run the reviewed Guided worktree on port 3110 and the immutable
baseline `41bfb009089bb2b67ff048c71d1a3c6fac11578c` on port 3191. Authenticate
an existing synthetic Alpha owner, store browser state privately outside Git,
and set `ADMIN_GUIDED_STORAGE_STATE` to that file. Keep fixture-writing suites
stopped until both versions have been captured.

```bash
node design-previews/admin-guided-redesign/capture.mjs 3191 baseline '' light
node design-previews/admin-guided-redesign/capture.mjs 3191 baseline '' dark
node design-previews/admin-guided-redesign/capture.mjs 3110 guided '' light
node design-previews/admin-guided-redesign/capture.mjs 3110 guided '' dark
```

Each invocation records 19 routes at 1440px and 390px, plus a readiness/error
report, under ignored `evidence/`. Authentication state is never copied into
this directory. Generated evidence is local and can be recreated from the
checked-in script; it is intentionally excluded from commits.

See `docs/admin-guided-redesign-inventory.md` for preserved fields/actions and
`docs/admin-guided-redesign-verification.md` for tests, source identity, native
evidence, known baseline failures and remaining acceptance work. The scoped
plan ledger remains authoritative for incomplete acceptance. This preview does
not authorize publishing or deploying the redesign.
