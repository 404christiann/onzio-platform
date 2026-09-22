# Homepage editor — Claude stabilization handoff

Prepared 2026-09-20 for Christian to pass to his Claude agent. Continue the
existing implementation; do not restart the redesign. Christian reports that it
is still buggy, but has not yet described the remaining interactions precisely.
Ask for those repro steps while independently investigating the known failures.

## Checkout and authority

Work directly in `/Users/christianalcala/Downloads/onzio-platform`, existing
branch `codex/homepage-editor-redesign` (verified 2026-09-20). Important source,
tests, migration and docs are uncommitted/untracked. Preserve the entire working
tree. No reset, clean, branch switch, broad staging, commit, push, deployment,
hosted migration or hosted writes are authorized by this handoff.

Read AGENTS.md, latest HANDOFF.md, docs/onzio-platform-plan.md, tests/README.md,
then docs/homepage-editor-redesign-plan.md, the superseding follow-up at the top
of docs/homepage-editor-feedback-luna-plan.md, and relevant tests. This document
supersedes the old docs/homepage-editor-claude-handoff.md continuation: its HP-04/05
unfinished claims are historical, not current instructions.

Preserve unrelated .gitignore, .claude/, docs/cv-united-launch-plan.md and
lions-font-comparison.html. Do not redesign AdminShell, sidebar/top bar, protected
layout, middleware or route manifest. Changes should fix concrete defects while
preserving the approved UI. Ask before a broader product/design change.

## Implemented scope

- Real club public components in a same-origin iframe with working draft
  overrides, per-piece selection, contextual desktop panel/mobile sheet.
- One atomic Save homepage transaction; failure retains edits, explicit retry,
  up to six ordered photos/descriptions, shared-content navigation guards, and
  browser recovery with response-loss and cross-tab handling.
- Website navbar/footer hidden only during editing, restored in Playback.
  Public site output remains separate and unannotated.
- Quiet boxes around editable content, no floating discovery badges. Exactly
  four white-filled purple circles on the selected target only; circles are
  decorative, not resize handles. Accessible names/contextual labels remain.
- Panel heading Save homepage replaces Close options. Done closes without
  saving. Preserve Escape/focus return and one visible Save per active layout.
- Colored saving/success/error notifications, rendered in editor/panel/mobile
  toolbar/leave-dialog areas. Christian specifically requested feedback near
  whichever Save he used.
- Latest Luna fix captures/restores window scroll around native options dialog
  open/close and uses preventScroll focus to address vertical jumping.

## Evidence, not a fresh green baseline

On 2026-09-20 Astra read the Luna task and current docs/source and checked branch/
dirty state. No app/browser/DB tests were rerun and no runtime code was changed.

Luna's reported runs, on different revisions (do not combine as one passing run):

- Before HP-08: full suite 1,535/1,535; Homepage browser 24/24; media 4/4;
  admin-loading 12/12. This predates the latest UI changes.
- Initial HP-08: Homepage matrix 23/25, not green.
- Boxes/panel-Save revision: focused 15/15; broader follow-up 5/10, not green.
- Save-location follow-up: focused placement case 1/1.
- Scroll-jump follow-up: reported accessibility/focus 12/12, including new
  scroll regression; TypeScript/lint/build/diff checks reported passing.
- Latest full repository/media/admin-loading acceptance is not established.
- Real iOS Safari/Android Chrome keyboard and VoiceOver/TalkBack acceptance
  remains pending. Reduced-height Chromium proves only layout, not devices.

Known broader failure: mixed-photo test cannot observe the successful preview
image; later recovery/cleanup cases also failed. Luna attributed subsequent
failures to local fixture state, but that is not a proven root cause. Investigate
actual production behavior and test isolation before labeling this environmental.
Some retained screenshots were reportedly inspected in a later run; verify
artifact existence and obtain fresh screenshots for the final revised build.

## Source findings to investigate

These are observations from a selective source read, not reproduced bug reports:

1. `HomepageNotifications.tsx` only chooses error/saving/success. It has no warning
   variant or shared queue. Its five-second timeout does not pause on focus,
   hover, or document visibility. The optional onDismiss callback is not supplied
   by the current HomepageEditor callers. Compare implementation to approved
   HP-08C requirements; do not assume complete locally means full acceptance.
2. Notification ownership follows disclosure/destination conditions rather than
   an explicit initiating save location. Mobile no-panel JSX mounts both a
   general presenter and a mobile-slot presenter. Check actual CSS visibility,
   duplicate announcements, and behavior when opening/closing panels during a
   save. Each presenter has local success timeout state, so remounts may replay
   feedback. Reproduce before choosing the smallest corrective implementation.
3. Scroll correction uses requestAnimationFrame/window.scrollTo after dialog
   transitions. Verify nested admin/iframe scroll, repeated target selection,
   switching fields, keyboard open/close, and rotation. Do not force viewport
   restoration in ways that fight legitimate mobile input visibility.
4. Confirm single Save control and notifications remain reachable on narrow/
   short screens, and selected outlines/circles do not clip or move content.

Primary runtime files: components/admin/homepage/{HomepageEditor,
HomepagePreviewFrame,HomepageNotifications,HomepageFields,HomepageRecoveryReview}.tsx,
components/admin/homepage/homepage-editor.css, lib/homepage-editor/*,
components/editorial/EditorialShell.tsx. Use actual files to verify current state.

## Recommended execution order

1. Check working tree and owned local server; request Christian's remaining bug
   repros. Review the current UI rather than treating narrow tests as usability
   approval. Preserve adjacent approved behavior.
2. Reproduce selection/open/save/Done and feedback transitions at desktop and
   320/390px widths. Capture console/network errors and element/scroll positions.
   Address notification gaps and actual reproduced interaction defects.
3. Isolate the mixed-photo test and then recovery cleanup; inspect actual upload
   response, draft asset reference, preview rendering and fixture restoration.
   Fix root causes without weakening contracts or hiding image failures.
4. Add focused meaningful regressions. Keep exact full Playback parity across
   five templates plus synthetic legacy Rose City. Editing-mode chrome omissions
   are intentional; keep public content/fonts/media unchanged.
5. Run Homepage browser, media, admin-loading and required tsc/lint/build,
   contracts/architecture/local DB/full tests. Run Alpha-mutating suites serially
   and restore fixtures. Do not skip/weaken tests or add pixel tolerances.
6. Inspect retained desktop/mobile light/dark screenshots; record real device
   checks separately. Update HANDOFF and both scoped ledgers with actual evidence,
   files, remaining blockers and next step. Present the local result for review;
   Christian's prior approval does not mean this still-buggy version is accepted.

Last reported local URLs (not checked for availability on 2026-09-20):
http://alpha.localhost:3110/admin/homepage and http://alpha.localhost:3110/.
The server has used a production build: stale bundles previously confused
verification. Inspect ownership before rebuilding/restarting only that server.
Use tests/README.md for .env.test and auth setup. Keep auth state at
/private/tmp/onzio-homepage-tests/local-auth.json private and outside Git. Never
print secrets or use hosted projects in tests. No database reset is authorized
merely to make failures disappear; diagnose and restore narrow local fixtures.

## Current handoff status

HP-08A implemented; HP-08B visual stabilization in progress; HP-08C acceptance
reopened for observed requirement gaps and remaining user bugs; HP-08D incomplete.
This handoff is ready for Claude. No Claude task was created or dispatched here.
