# Guided admin route, field, and action inventory

Source snapshot: baseline `41bfb009089bb2b67ff048c71d1a3c6fac11578c` versus the uncommitted `codex/admin-guided-redesign` worktree on 2026-10-11. This records preservation evidence; completion and acceptance status remain in `admin-guided-redesign-plan.md` and `HANDOFF.md`.

## Scope and source parity

The authoritative `lib/admin-route-manifest.ts` contains **19 protected routes**, all included below. The manifest itself is unchanged. Its labels, route paths, role/template visibility, quick actions, and existing mutation/billing availability remain authoritative; a page's content gate is distinct from navigation visibility.

A TypeScript AST audit compares every route plus the ten active/shared components listed below against baseline HEAD. It normalizes and sorts JSX event handlers, form action/method attributes, control tags, and field value/type/checked/required/bounds/disabled/hidden/name/id props. All event-handler expressions and control-tag inventories match. Field props match except **12 added Roster control/label IDs**; none were removed. These additions associate Staff and inline-stat labels with existing controls. The checked IDs are `staff-initials`, `staff-name`, `staff-role`, `staff-hometown`, `staff-nationality`, `staff-bio`, and dynamic `roster-stat-${field}`; label wrappers and native controls account for the twelve additions.

**Source parity is true for the audited handlers and field semantics, with those accessibility additions.** This is source evidence, not runtime save proof. Counts below count JSX definitions, not rendered field instances: mapped fields, template gates, imported components, and alternate states can render many instances or none. Sorting establishes retained expression multiplicity, not DOM order, focus order, visibility, responsive geometry, backend side effects, or exact public rendering. Root-owned browser, public-preview, keyboard, device, and persistence gates must provide those acceptance results. No source assertion is weakened by this inventory.

| Manifest label | Path | Source handlers | Control definitions | Field props |
| --- | --- | ---: | ---: | ---: |
| Dashboard | `/admin` | 0 | 0 | 0 |
| Homepage | `/admin/homepage` | 0 | 0 | 0 |
| Programs | `/admin/programs` | 79 | 65 | 70 |
| Tryouts | `/admin/tryouts` | 25 | 32 | 30 |
| Shop | `/admin/shop` | 0 | 0 | 0 |
| About | `/admin/about` | 43 | 36 | 32 |
| Sponsors | `/admin/sponsors` | 10 | 3 | 6 |
| Contact | `/admin/contact` | 21 | 7 | 21 |
| Seasons | `/admin/seasons` | 7 | 0 | 0 |
| Roster | `/admin/roster` | 77 | 45 | 96 |
| Schedule | `/admin/schedule` | 36 | 41 | 89 |
| Match Stats | `/admin/stats` | 19 | 19 | 22 |
| Season Stats | `/admin/season-stats` | 21 | 2 | 3 |
| Standings | `/admin/standings` | 19 | 8 | 12 |
| Registrations | `/admin/registrations` | 38 | 14 | 24 |
| Analytics | `/admin/analytics` | 3 | 0 | 0 |
| Branding | `/admin/branding` | 6 | 3 | 8 |
| Team Access | `/admin/members` | 3 | 1 | 4 |
| Payments | `/admin/payments` | 0 | 0 | 0 |

Every row maps to `app/admin/(protected)/<path-segment>/page.tsx`, except Dashboard is that directory's `page.tsx`. Homepage, Shop, and Payments delegate their active composition. Tryouts exports the active `TryoutsPageEditor`; its legacy route body is preserved rollback source, and the table's route count deliberately includes that inactive source rather than claiming it is the active editor.

| Additional audited owner | Handlers | Control definitions | Field props |
| --- | ---: | ---: | ---: |
| `components/admin/homepage/HomepageEditor.tsx` | 30 | 3 | 10 |
| `components/admin/homepage/HomepageFields.tsx` | 21 | 25 | 85 |
| `components/admin/shop/ShopPageEditor.tsx` | 47 | 14 | 17 |
| `components/admin/tryouts/TryoutsPageEditor.tsx` | 33 | 32 | 30 |
| `components/admin/payments/PaymentStatusCard.tsx` | 1 | 0 | 0 |
| `components/admin/AdminSidePanel.tsx` | 2 | 0 | 0 |
| `components/admin/FileUpload.tsx` | 9 | 1 | 4 |
| `components/admin/SeasonSelect.tsx` | 1 | 3 | 4 |
| `components/admin/StatInput.tsx` | 1 | 1 | 3 |
| `components/admin/PageEditorInspector.tsx` | 2 | 0 | 0 |

## Website routes

- **Homepage:** `HomepageEditor` and `HomepageFields` retain both heading lines; hero button labels/destinations; story heading and paragraphs; slideshow photos, descriptions/alt data, order, removal and upload/retry; video copy/caption/name and capability-dependent visibility; section visibility; shared content links. Selection in the stable public iframe, Desktop/Phone preview, playback, Top/More tools, Done, keyboard/drawer dismissal, Save homepage, receipt confirmation, uncertain-save retry, latest-version conflict review, recovered-draft review/keep/discard, and leave protection remain. Template capabilities decide which fields are available. Save remains explicit. The Guided CSS restores the original 28px desktop heading geometry after a reported seven-pixel focus scroll; the iframe viewport calculations are unchanged.
- **Programs:** actual program names and direct directory navigation/search remain, including desktop rail and phone navigation; there are no invented program categories. Retained fields are slug (hidden/fixed for Academy), navigation label, display title, kicker, summary, body; highlights add/edit/reorder/remove; layout variant; hero/detail images; registration enabled state, native registration-form association or external button label/link; registration eyebrow, headline, body for published link, body without link, placeholder button; gallery images with descriptions, order and removal. Directory order and published/hidden state are a separate explicit save. Per-page save, upload failures, pending receipt confirmation, recovery/conflict review, and existing source-controlled page-copy fields (pathway, hero, closing text/buttons) remain. Academy's creation/page-copy/slug restrictions remain. Manifest and route gate expose this editor only for `academy@1`.
- **Tryouts:** active owner is `TryoutsPageEditor`. Fields retain intro with/without published events; event name/status, program association where supported, date, location, cost, registration form, external CTA label/link, closed message, and event image where supported. Ordering, add/edit, staged delete, Undo, explicit deletion confirmation, Save/confirm receipt, error recovery and conflict review remain. Deleting an event does not delete registrations. Academy and Editorial are supported; Editorial lacks the program-association and image controls. The old Tryouts route body is unchanged.
- **Shop:** active owner is `ShopPageEditor`. Fields retain small heading, kit title, description, bullet points, store note, CTA label/link where capability permits; kit photos and extra photo-row upload/order/remove; purchase heading and up to four detail cards (label/title/body), add/remove card, footer label/text/button/link. Home versus Shop surfaces, kit variant selection, Desktop/Phone viewport, selected-section tools, Done, explicit Save/receipt confirmation, recovered draft, uncertain save and conflict choices remain. Clubhouse/Editorial share homepage kit data; Academy exposes the Home surface. Editorial shop-disabled state remains truthful. Template-owned copy stays fixed; homepage CTA goes to the club Shop. Extra photo row and purchase controls appear only in the supported generic Shop surface.
- **About:** About and Club Logo surfaces retain independent saves and recovery. About fields: page heading where supported; story paragraphs; feature image; values heading and each value title/description; closing text and button text/destination. Academy's closing destination remains fixed to Schedule; unavailable destinations stay guarded. Club Logo retains annotated crest/map images, feature selection/title/description/patch/icon and icon size/scale, color labels and images. Academy/Editorial omit the separate Club Logo page. Public canvas selection, Desktop/Phone sizes, section rail, mobile inspector, Done, all error/receipt/recovery/conflict states remain. `about-editor.css` selectors after the authoring-target marker are byte-for-byte baseline; they belong to the public iframe.
- **Sponsors:** carousel/footer placement selection; logo names, uploads, replacement, left/right order, removal, limit/missing-name feedback, explicit placement save and unsaved/error states remain. Footer tab is absent for Academy/Editorial. These previews render public components in the same document: the new `data-admin-public-preview` wrapper excludes their typography from admin styling; preview child styling is unchanged.
- **Contact:** seven source controls retain hero eyebrow/headline/intro and shared contact profile fields for email, phone, service area and hours. Page-only versus shared-data scope, section rail, stable public iframe, Desktop/Phone preview, phone sheet/desktop inspector, Done, explicit atomic Save, receipt confirmation, uncertain-save retries, recovery/conflict review and focus recovery remain. Academy/Editorial support the editor. Other templates show the existing explanation that the website does not publish Contact; Contact is not template-hidden by the manifest. No hero-image upload is introduced.

## Competition routes

- **Seasons:** current season and item counts, create next season, existing carry-forward explanation/behavior, set active season, eligible delete and count-based eligibility reasons/confirmation remain. Missing/loading/error states remain. No archive/delete rule changes.
- **Roster — Players:** Players/Staff tabs; season selector, counts, name/number search, position and active-status filters; new/add/edit, profile photo upload/remove, ordered action-photo add/remove, previous/next record navigation, explicit activation/deactivation and confirmation remain. Player fields retain name, jersey number, position, nationality, pronunciation, height, weight, age, hometown, preferred foot, captain toggle (the persisted `caption`), school, previous club and bio. Required constraints are unchanged. Player editor remains wider (`max-w-2xl`) with fixed Cancel/Save footer; deactivation remains in its existing body location. Inline season stats retain all fields below when capability permits; they remain absent for Academy/Editorial.
- **Roster — Staff:** initials, name, role, hometown, nationality, optional bio and photo upload/remove remain, with search/status filters, add/edit, activation/deactivation and previous/next navigation. **Staff deliberately retains the default shared panel width (`max-w-md`): no width override and no fixed footer prop.** Its Cancel/Save and status actions remain in the panel body. Do not apply Player footer/width assumptions to Staff.
- **Schedule:** season selector, all/upcoming/results filters, opponent/venue search, cards and new/edit remain. Required fields: season, Home/Away, date, time, opponent and venue. Optional fields: competition, opponent short name/logo, venue address/city/state, home/away score, sponsor name/logo/link and existing sponsorship fields. Copy-forward and sponsor capability restrictions remain; Academy/Editorial omit sponsor editing. Match panel stays wide with fixed Save/Cancel footer and **the existing Delete match action/confirmation in that footer**. Neither relocation nor automatic deletion is introduced.
- **Match Stats:** season/match selectors, position groups, expand/collapse, per-player started checkbox and minutes remain. Outfield fields: goals, assists, tackles, offsides, fouls, fouls suffered, yellow cards, red cards. Goalkeeper fields: goals against, saves, clean sheets, yellow cards, red cards. Group save and Save All, selected-match context, errors and visible cross-column horizontal scrolling remain. Editorial redirects from this route and the manifest hides it.
- **Season Stats:** season selector, grouped manual totals, group collapse and Save All remain. Outfield totals: goals, assists, tackles, offsides, fouls, fouls suffered, starts, yellow/red cards, minutes. Goalkeeper totals: goals against, saves, clean sheets, starts, yellow/red cards, minutes. Existing numeric constraints and visible contained table overflow remain. Editorial redirects and the manifest hides it.
- **Standings:** season, club/non-club team entries, logo/name/abbreviation, played/won/drawn/lost/goal difference/points retain their values and signed goal-difference semantics. Add/edit/remove, own-club locked logo, calculated ranking by points then goal difference then wins, explicit save and public table preview remain. Table scroll stays contained and accessible; public preview styling stays excluded from admin typography.
- **Registrations:** form active/archive views; title, generated slug/public link, description, participant mode/core branches; custom fields (key, label, type, options, required, branch scope, order), price options (label, amount, active, order), waiver/consent text and requirement retain constraints. Create/edit/save, publish, stop accepting, copy link, archive and eligible unpublished/no-entry deletion remain, with structural edits restricted after entries. Selected form roster retains name/email search, paid/refunded/review filters, participant answers, consent/signatures, CSV export, payment-recovery and email-delivery statuses. Stripe account/connection eligibility and reconciliation warnings remain. No registration price, payment, participant, consent, or delete policy is altered.
- **Analytics:** position filter, selected player, metric cards, position-average radar, comparison/bar and recent-match line charts, disciplinary stats, loading/error/retry and empty states remain. Charts keep their existing Chart.js/SVG data behavior; no export action is invented. Editorial redirects and the manifest hides it.

## Club settings and shell

- **Branding:** existing club crest upload, inverse-brand/contrast previews, footer tagline and social link fields, Save and footer preview remain. Only admin chrome is restyled; same-document public preview is excluded.
- **Team Access:** owner-only route, current owner/member list, administrator email addition, removal and confirmation remain. No self-service invitation/signup or membership policy change. This route stays hidden for non-owner admin membership.
- **Payments:** owner-only and billing-authorization visibility. Existing `PaymentStatusCard` states remain: `no_subscription`, `active`, `active_canceling`, `grace`, `terminal`. Current plan/price, paid-through/renewal/cancellation/grace context, configured checkout/portal action, disabled/unavailable development states and failure feedback remain. Existing server-owned Stripe/lifecycle boundaries are unchanged; no new live payment behavior is added.
- **Dashboard:** existing club data/stat tiles, greeting and role/capability-filtered quick actions remain. The manifest still defines Registrations, Manage Roster, Manage Schedule and Payments actions; content actions require content mutation capability, Payments requires billing authorization.
- **Protected shell/shared controls:** navigation groups Website, Competition and Club Settings, active-group expansion, all eligible links, route search, theme/account controls, mobile navigation, dismissal/escape, direct routes and clear unavailable states remain. Safe-area padding, touch size and reduced-motion changes are admin presentation. Root's shared panel keyboard/focus changes require runtime acceptance beyond this AST audit.

## Public and hidden scope safeguards

Website iframes continue to use original public components, authoring attributes, snapshot/content adapters, viewport widths and stable instances. Same-document Sponsors, Branding and Standings public previews are explicitly excluded from admin typography. No public template/component CSS, database schema, API, tenant/role resolution, price/media validation, save endpoint, receipt/revision protocol, or content model change is part of this work.

The all-route screenshot matrix covers the synthetic Alpha owner's eligible state; it does not prove every template, role, alternate billing state or dirty/conflict state. Template and role gates above need their existing contracts plus targeted browser evidence. Native-device/keyboard acceptance must be reported separately from emulation.

## Reproduction and acceptance references

- Source parity audit used TypeScript's parser/printer on all table entries, comparing baseline `git show HEAD:<file>` with worktree text. Evidence: `/private/tmp/guided-route-parity.cjs`, `/private/tmp/guided-route-parity.json`; these temporary paths are local evidence, not a committed test or runtime gate.
- Existing contract areas: admin shell/manifest/loading, roster/schedule models and panels, statistics/standings/seasons/registrations/payment contracts, Homepage/public-page preview/save/capability/phone contracts. Keep their exact source assertions intact.
- New pilot persistence acceptance: `tests/browser/admin-guided-persistence.spec.ts` runs ten checks at 390px/1440px: real Player hometown and Match venue edit/save/reload, real Player/Staff/Match Add/Save/Reload, and Staff edit/save/reload within each Staff creation check. It asserts real admin-data responses and database values, reloads/reopens records, restores edited originals via UI plus exact local-row cleanup, and deletes only captured new IDs and their child rows. Each creation check verifies all eight original Player/Staff/Match/photo/stat table snapshots are unchanged after cleanup. Only guarded `alpha.localhost` and loopback PostgreSQL54322 are allowed; run serially after other Alpha-writing suites. This document does not claim that unexecuted tests have passed.
- Package acceptance/result locations: `docs/admin-guided-redesign-plan.md`, `HANDOFF.md`, and root-owned review artifacts. Source inventory completion alone does not mark GUIDED03–07 complete.
