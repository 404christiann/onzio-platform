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

## Season Stats — three interactive directions

Open `http://127.0.0.1:8768/season-stats-directions.html` on the same preview
server. Christian requested three alternatives to improve Season Stats entry
and presentation, including phone layouts. This standalone HTML changes no
application route, API, database or fixture.

- **A — Player workspace:** select a player and edit all grouped totals. Desktop
  uses a player list beside the editor; phone uses a list/detail flow with Back
  and a persistent Save/Review bar. Recommended for less technical staff.
- **B — Guided update:** one player and a small group of fields per step,
  followed by review. Goalkeepers get their own field groups. The player
  selector remains visible on phone and repeated headings are reduced.
- **C — Team worksheet:** update one category across the team. Desktop uses
  a short table; phone chooses one full-name stat and uses readable player rows.
  Goalkeeping categories include only goalkeepers; outfield categories exclude them.

Choose Desktop, Phone or Both and Light/Dark. Try search, player/metric selection,
whole-number typing, 44px phone increment/decrement controls, review and saving.
The sample Meadow FC roster is fictional. Saves affect only the in-memory demo;
changing a direction/preview recreates its sample data. Season switching protects
unsaved changes inside a demo and uses separate synthetic season totals.

Every original field remains represented: ten outfield totals and seven
keeper totals, including playing time and discipline. Totals remain manual and
separate from Match Stats. No match-derived totals, import, autosave or backend
change is implied by these options. Christian selected A; the actual Season and Match Stats pages are now
implemented. The directions below remain the historical prototype evidence.

Prototype acceptance: 18 desktop/phone/theme cases (3 options × 1440/390/320px ×
light/dark), number entry, review and demo save, field/goalkeeper completeness,
unique input IDs, initially visible Save bar, zero document overflow/page errors
and 44px phone button targets. Local evidence is ignored under
`evidence/season-stats-options/`; report is `report.json`. This is browser layout
and interaction evidence, not native software-keyboard/physical-phone acceptance.


## Implemented Player workspace

Open `http://127.0.0.1:8768/stats-workspace-review.html` for the actual application
captures at source baa66c1: Season/Match, desktop/phone, light/dark, and phone
list/editor. Fictional review players are clearly labeled; this page reviews
screenshots and links to the local portal. It does not edit application data.

Current evidence: complete 1,783 tests, TypeScript/lint/build, workspace 4,
management 2 and loading 5 browser checks; 20 editor captures at 1440/390/320/1024
and 844×390 in both themes, plus 12 mobile roster captures. Native Safari on
Simulator verified numeric keyboard Save/reload for both pages and boolean
starter persistence. All original local fixture snapshots were restored exactly.
Physical phone touch/paste and screen-reader release acceptance remains open.
See `docs/admin-stats-workspace-verification.md` for commands, paths and limits.

The two stats routes in `review.html` were refreshed as eight Before/Guided pairs
against baseline 41bfb00 with the same held synthetic review fixture. Other 17
routes retain their prior 9a001c1 captures. Current stats evidence is under ignored
`evidence/player-workspace/`; native images are in its `native/` directory.


## Combined Stats navigation directions

Open `http://127.0.0.1:8768/stats-combined-directions.html`.

- A Simple switch: compact Match stats / Season stats segmented tabs at the top.
- B Explained tabs: larger two-line tabs explaining one game versus whole season.
- C Player first: the same two views live inside the selected player's workspace.

One Stats navigation item is shown in each sketch. Desktop/Phone/Both and
light/dark controls are available. Search by name or shirt number, choose a
player, edit fields and try the unsaved-edit switch dialog. All existing ten
outfield/seven goalkeeper fields are represented. Season totals remain manual
and separate from match stats; demo saves are in-memory only.

Verification: nine browser cases (each direction at 1440px light, 390px dark,
320px light) cover mode switching, independent values, Cancel/Save & switch,
roster/detail/search, field completeness, no overflow, Save visibility and 16px
inputs. Three final 320px geometry checks verify 44px stepper targets, full Save
labels and Back below the sticky header; C also verifies discard and arrow keys.
Reports are ignored under `evidence/combined-stats-directions/`. Physical/native
keyboard acceptance is not established. Application implementation awaits
Christian's selection; this artifact changes only the preview and documentation.
