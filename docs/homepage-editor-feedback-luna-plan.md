# Homepage editor feedback — Luna implementation plan

## Screen-reader acceptance — waived by Christian, 2026-09-23

Christian's decision: do not hold the Homepage editor for VoiceOver/TalkBack
acceptance. "If we get a customer like that I will make sure we are fully
accessible." Recorded as an accepted gap, not as completed work.

Covered by automated tests: accessible names on every editable piece, focus
containment in the mobile sheet, focus restoration on Done, polite/assertive
live regions for save and error, full accessible names on the shortened phone
shortcut buttons, 44pt targets.

Not verified: spoken wording and announcement timing with a real screen reader.
iPhone Mirroring cannot be used for this — iOS disables VoiceOver while a
mirroring session is active (confirmed 2026-09-23). It needs a real device in
hand, or Accessibility Inspector for the structural half.

## Real iOS Safari evidence — 2026-09-22

HP-06/HP-08C keyboard-open acceptance passes in real Mobile Safari (iOS 26.5
Simulator, software keyboard on): Save, focused field, next field and Done stay
visible; save failure/retry/success notifications render inside the modal sheet.
VoiceOver/TalkBack remains open — the Simulator has no screen reader. See
HANDOFF.md 2026-09-22 and `npm run dev:device-proxy`.

## Christian review round 2 — 2026-09-21

- Empty-target placeholder label no longer concatenates with typed text
  (flag cleared on content, corners excluded from the emptiness test,
  `characterData` observed). Regression asserts the drawn `::before`.
- Shared Programs/About/Shop blocks are no longer drawn on the editing canvas.
  This supersedes HP-08B's "shared targets keep a contextual shortcut *on the
  canvas*": the shortcut moved off-canvas into the editor, which keeps the
  unsaved-changes guard reachable (it was the only trigger). Christian approved
  both the removal and the off-canvas shortcut. Playback/public unchanged.
- Homepage browser 33/33; full 1535/1535; admin-loading 12/12; media 4/4.

## Claude stabilization result — 2026-09-21

Christian's reported bug is reproduced and fixed: opening the options panel took
348px from the preview, rewrapping the real public page and pushing the selected
piece 276-312px down and out of view at 1152-1280px widths. The editor now
anchors the selected piece across every preview-resizing transition.

HP-08C's notification gaps are closed: one shared queue, amber warning variant,
dismissible success whose timer pauses on hover/focus/hidden, a single live region
on phones, and no replay when the sheet remounts.

The outstanding photo/recovery failures were **fixture contamination, proven not
environmental**: Alpha was left published on a clubhouse fixture by an interrupted
templates run, and the specs' fixed marker text made them unable to restore
themselves. See HANDOFF.md (2026-09-21) for the full diagnosis.

Verification: Homepage browser 32/32, full suite 1535/1535, contracts 910/910,
architecture 21/21, local DB 239/239, admin-loading 12/12, media 4/4, tsc/lint/
build clean. Real-device keyboard and screen-reader acceptance remains pending.

## Stabilization status — 2026-09-20

Christian reports remaining bugs and is transferring continuation to Claude.
See `docs/homepage-editor-claude-stabilization-handoff.md` for current evidence
and exact next steps. HP-08C is **in_progress** for notification requirement gaps
(warnings, dismissal/timer behavior, notification ownership) pending reproduction
and correction; the older complete-locally row below is superseded. HP-08B/D
remain in_progress. No new runtime changes or tests in this handoff pass.

## Christian's follow-up revision — 2026-09-17

This revision supersedes HP-08B's floating discovery-label requirement and the
panel's Close options placement. Preserve adjacent HP-08A/C implementation.

- Remove floating labels/badges over existing editable text/buttons/media. Show
  a clear, quiet rectangular box around each actual editable target at rest,
  without corner circles. Keep boxes visible on touch screens without hover.
- Selected target: stronger purple box with exactly four white-filled purple
  corner circles. Unselected targets never show circles. Keyboard focus remains
  recognizable. Boxes/decorations must not shift layout or obscure content.
- Preserve accessible target names and selected contextual toolbar labels.
  Shared About/Shop/Programs content must retain an explicit contextual shortcut
  instead of being presented as directly editable Homepage content. Empty-content
  placeholders may retain their necessary actionable text.
- Save/error/warning toast notifications remain; this request removes discovery
  badges, not operation notifications.
- Replace Close options in the panel heading with Save homepage, wired to the
  existing atomic whole-homepage save. Keep the panel open after saving so status
  is visible. Failure retains draft and shows the existing retry feedback.
- Keep Done available on desktop/mobile to close without saving, along with
  Escape and focus restoration. Remove/relocate duplicate Save controls while
  the panel is open: exactly one visible Save homepage action per layout. Verify
  heading Save, Done and focused fields remain reachable with mobile keyboard.
- Add focused regressions for boxes without badges, circles only on selection,
  panel Save persisting all changes, draft retention on failure, Done without
  save, and one visible Save. Adapt only superseded label assertions.
- Continue HP-08D's outstanding browser/media and final gates. Do not treat the
  earlier 23/25 matrix as green or claim direct visual inspection without retained
  screenshots. Record exact remaining failures and real-device limitations.

Revision status: ready for implementation in the existing Luna task. No new
application edits or verification performed by Astra. Reopen HP-08B and the
panel-control portion of HP-08C as in_progress until these checks pass.

Status: Christian follow-up revision implemented; HP-08B and HP-08D remain in_progress pending local media cleanup, visual review, and real-device acceptance, 2026-09-17.
Christian approved the proposed changes and explicitly requested a new Luna task.
Implementation is present in the existing uncommitted checkout. No commit,
push, deployment, hosted migration or hosted data write was performed.

## Goal and references

Make editable content discoverable, simplify the editing canvas, and provide
clear colored feedback that works on phones, including with the keyboard open.

- Selection reference: `/Users/christianalcala/Desktop/Screenshot 2026-09-17 at 4.41.39 PM.png`.
  Thin purple rectangular outline, four white-filled purple corner circles.
- https://github.com/imgly/starterkit-mobile-ui-react-web — contextual mobile
  tools, single selection, slide-up panels. Adapt patterns to the existing
  editor; do not install CE.SDK or replace the rendering/state architecture.
- https://www.framer.com/marketplace/components/toastnotifysystem/ — colored
  notifications, icons, subtle entry/exit, dismiss controls and timed success.
  Implement using existing React/CSS/primitives; no purchased component required.

## Starting point and preservation

Work directly in `/Users/christianalcala/Downloads/onzio-platform`, existing
`codex/homepage-editor-redesign` branch. Preserve all uncommitted/untracked work.
Read AGENTS.md, HANDOFF.md, docs/onzio-platform-plan.md, tests/README.md, then
relevant tests and this plan. Check for deeper AGENTS.md before editing.

The latest HANDOFF checkpoint and Christian's recorded visual approval supersede
older failed-gate text in historical plan entries. Recorded prior results are
1,535 full tests, 24 Homepage browser, 4 media and 12 admin-loading tests passing;
types/lint/build/contracts/architecture/DB/generated types also passed. These
are prior Luna results, not new verification. Real-device keyboard/screen-reader
acceptance remains pending. The old approved baseline does not pre-approve the
new visual implementation.

Preserve actual public components, atomic Save homepage, six ordered photos and
descriptions, explicit move controls, upload/save retry, local recovery, shared
About/Shop/Programs destinations and dirty-leave choices. No autosave, per-section
save, publishing flow, arbitrary resizing, drag/drop, or undo/redo addition.
Do not change AdminShell, sidebar, top bar, protected layout, route manifest or
middleware. Preserve unrelated .gitignore, .claude/, docs/cv-united-launch-plan.md
and lions-font-comparison.html. No reset/clean/branch switch, broad staging,
commit, push, deployment, hosted migration or hosted data mutation.

## HP-08A — editing canvas chrome

In editing mode, omit the club website navbar and footer and any spacing reserved
solely for those elements. Keep Onzio admin navigation. Playback preview restores
the full original website composition and remains labeled as a preview; it still
blocks navigation and never saves. Mode changes retain the draft and selection.

Primary files: HomepageEditor.tsx, HomepagePreviewFrame.tsx and
components/editorial/EditorialShell.tsx. The ordinary composition explicitly
renders Nav/Footer; EditorialShell owns its own header/footer. Add an optional,
default-preserving shell flag if needed, supplied only by the editor. Scope
header-spacing adjustments to editing mode; avoid global header/footer selectors
that could hide content. Preserve the public component DOM/defaults and full
Playback layout. Check all five templates plus synthetic legacy Rose City.

## HP-08B — discoverability and selection

Use existing allowedPieces/capabilities and data-homepage-piece hooks as the
authority. Do not mark read-only content as directly editable.

- All available editable targets: visible subtle dashed outline and compact
  plain-language label. Use contrast that remains visible over photos and both
  light/dark sections; a light label surface with dark text is appropriate.
- Hover/focus: stronger purple outline; keyboard focus remains distinguishable.
- Selected: 2px solid purple (#A855F7 starting token), four 10px white-filled
  circles with 2px purple borders. These are aria-hidden decorative indicators,
  have no resize cursor, and intercept no pointer events.
- Shared targets: label their actual action, e.g. Edit in About, Edit in Shop,
  Edit in Programs; preserve the existing guarded navigation flow.
- Keep labels compact and prevent overlapping adjacent labels/targets. Labels
  and rings must not change text metrics/layout or obscure neighboring controls.
  Account for overflow clipping and targets against viewport edges. Use an
  editor overlay if CSS decorations cannot meet these constraints.
- Keep touch targets at least 44px without masking neighboring pieces. Preserve
  Enter/Space selection, focus restoration, and existing contextual tools.
- No labels, rings, circles or editor attributes in Playback or public output.

Primary files: HomepagePreviewFrame.tsx, homepage-editor.css,
lib/homepage-editor/preview-context.tsx; small editor-only overlay components if
needed. Preserve public typography and the completed GSAP parity repairs.

## HP-08C — notifications, including mobile

Build a Homepage-scoped notification presenter and small state adapter using
existing dependencies. Save/recovery/upload controller remains authoritative;
do not introduce a second save state machine or fake progress percentages.

State | Appearance | Lifetime/action
--- | --- | ---
Saving | Blue accent, spinner, Saving your homepage… | Until confirmed result
Confirmed saved | Green accent/check, Homepage saved. | 5 seconds; dismissible
Warning | Amber accent/warning icon, specific recovery/unsaved message | Actionable warnings remain until resolved or dismissed
Error/uncertain save | Red accent/error icon, accurate server-safe copy | Persistent, existing Try saving again action

Use tinted surfaces, high-contrast text and icon+text as well as color. Keep
existing recovery details and decisions visible; a toast must not replace the
conflict review, persistent unsaved status, field errors or photo retry controls.
No toast on every keystroke. One save operation updates one notification from
loading to result; deduplicate repeated renders. Clear stale save failures on
successful retry. Never report an uncertain response as confirmed failure/success
contrary to the existing receipt-reconciliation state.

Desktop: anchored within editor chrome, top-right, max width approximately 380px,
at most three visible notifications. Do not cover Save or contextual controls.

Phones (below existing 768px breakpoint):

- One visible notification, full available width with at least 12px side inset;
  queue other events, deduplicate them, and prioritize actionable errors over
  informational messages. Persistent errors must not be displaced by success.
- With no modal: use a reserved status area directly above the bottom editing
  toolbar; account for measured toolbar height and safe-area inset. Reserve its
  footprint so it does not cover a selected piece or controls.
- With a native modal sheet/dialog: render the active notification INSIDE the
  topmost modal, below its heading in a bounded status area, with fields remaining
  scrollable and Done/Save reachable. This includes save-and-continue failures in
  the leave dialog. A document-body toast under a native dialog is insufficient.
- Maintain one logical notification queue across host changes; avoid duplicated
  live announcements when opening/closing the sheet. Retry and dismiss controls
  must participate in the active modal's focus containment.
- Support VisualViewport resize/scroll and safe areas, portrait/landscape, and
  long wrapping messages at 320px. Keep focused input, Done, Save and notification
  action accessible with the keyboard open. Very short viewports may scroll the
  status region, but must not allow it to consume the entire sheet.
- Dismiss/retry hit areas at least 44x44px; swipe is not required. Notification
  arrival must not steal focus or dismiss the keyboard.
- Pause timed dismissal on hover/focus and when the page is hidden. Errors and
  actionable warnings have no timeout. Honor reduced motion; no bouncing layout.
- Use polite status announcements for saving/success, assertive announcements
  for errors, without competing duplicate live regions. Test light/dark contrast.

Suggested files: new HomepageNotifications.tsx and a small notification hook or
pure helper, wired into HomepageEditor.tsx and homepage-editor.css. Retain one
active Save homepage control per layout; a retry action is not another save flow.

## HP-08D — verification and acceptance

1. Add focused regressions for editing-only header/footer removal and restored
   Playback/public composition; selection discovery/corners/shared labels;
   mobile notification overflow, active-modal announcements/actions and queue
   transitions; real failed-save draft retention and successful retry.
2. Existing navigation test clicks an editing-mode navbar link: replace that
   now-obsolete interaction with a content link in editing mode and verify navbar
   links in Playback. Keep the navigation protection assertions.
3. Full public geometry/header parity belongs to Playback now. Move only that
   mode-specific setup; keep exact assertion strength and all template coverage.
   Separately assert editing layout, font/content/media preservation, and absent
   chrome. No pixel tolerance, skips, broad mocks or weakened contracts.
4. Run Homepage browser suite, media and admin-loading regressions. Visually
   inspect screenshots at 320/390px, tablet and desktop in light/dark, including
   long errors, sheet open/closed and reduced motion. Restore local fixture
   mutations in finally; never overlap Alpha browser and DB suites.
5. Run required tsc, lint, build, contracts, architecture, local DB and full tests
   after focused checks. Use .env.test and existing isolated local Supabase.
   No need to rerun a passing baseline just for orientation. Inspect ownership
   before stopping any server; only restart/rebuild the owned app when necessary.
6. Preserve the real iOS Safari/Android Chrome keyboard and VoiceOver/TalkBack
   acceptance gate. Reduced-height Chromium is layout evidence only. If equipment
   is unavailable, record blocked device evidence honestly while completing all
   independent implementation and local verification. Request Christian's visual
   review of the new work; do not mark this visual change approved automatically.

Last reported local app: http://alpha.localhost:3110/admin/homepage and
http://alpha.localhost:3110/ . Auth state stays private outside the repository at
/private/tmp/onzio-homepage-tests/local-auth.json; never expose or commit it.
Follow tests/README.md and HANDOFF.md for auth/environment commands.

## Status ledger

Package | Status | Completed/files | Verification | Blockers / exact next step
--- | --- | --- | --- | ---
HP-08A | complete locally | HomepageEditor.tsx, HomepagePreviewFrame.tsx, EditorialShell.tsx | Rebuilt local app; editing omits public nav/footer and Playback restores them across the Homepage matrix | Real-device parity remains pending
HP-08B | complete | HomepagePreviewFrame.tsx, homepage-editor.css, HomepageEditor.tsx (selection anchoring), focused browser regressions | Full Homepage browser suite 32/32, including 4 new anchor regressions at 1152/1280px; reported selection jump reproduced (276-312px, out of view) and measured at 0px after the fix | Christian reviewed and approved the anchored selection on 2026-09-21
HP-08C | complete | HomepageNotifications.tsx (new useHomepageNotification queue), HomepageEditor.tsx, homepage-editor.css | One queue for all hosts; warning variant, dismissible success, timer pauses on hover/focus/hidden, single phone live region, no replay on remount; 2 new regressions pass | Real iOS keyboard verified 2026-09-22; screen-reader acceptance waived 2026-09-23
HP-08D | complete | Homepage browser regressions, tests/browser/homepage-editor-{templates,photos,recovery,accessibility}.spec.ts, scripts/restore-local-homepage-fixture.ts, package.json, docs | Homepage 32/32, full 1535/1535, contracts 910/910, architecture 21/21, DB 239/239, admin-loading 12/12, media 4/4; tsc/lint/build clean; desktop light/dark and phone screenshots reviewed | Christian approved this revision; screen-reader acceptance waived 2026-09-23

2026-09-23 release verification follow-up on `ce5c2b1`: Homepage browser
34/34, admin-loading 12/12, site-media 4/4, contracts 910/910,
architecture 21/21, local DB 241/241, full suite 1537/1537, and
tsc/lint/local build clean. Seeded Alpha presentation confirmed before and
after the browser run; database and browser checks used loopback Supabase.
HP-08 remains complete. The production migration gate and release are pending.

Update this ledger, the main scoped ledger and HANDOFF.md with actual changed
files, checks, evidence, limitations and next step before ending implementation.
Do not mark packages complete without their acceptance evidence.
