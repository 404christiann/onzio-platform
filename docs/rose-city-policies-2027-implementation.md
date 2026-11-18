# RC2027-POLICIES: Stadium Guidelines and Fan Code of Conduct

Status: implemented locally, 2026-11-04. Christian approved the isolated preview
(outer `design-explorations/policies-2027/`, port 3214) and asked for it to be built. Every change
is local on `codex/rose-city-homepage-2027`. Nothing was pushed, merged, deployed or written to a
hosted service.

Sources: Sam's `Rose City FC Club Stadium A-Z website 2027.jpg` and
`Rose City FC Club Code of Conduct website 2027.jpg`, archived in outer
`assets/originals/remaining-pages/` as `stadium-guidelines-reference.jpg` and
`fan-code-reference.jpg`.

## Christian's decisions (2026-11-04)

- **Preview:** approved as shown.
- **Rows without an answer:** shown, opening to "Details coming soon.", because the owner fills them
  in from the admin portal.
- **Seed rows:** "Copy the way it looks on Sam reference. Include all of the sections." Both pages
  start with all six of Sam's rows in his order: Accessibility and Animals answered; Bags &
  Backpacks, Box Office Location & Times, Cameras/Video Equipment and his second "Animals" empty.
  The owner edits or removes them in the admin portal.
- **Styling:** no BoardUI. The pages use the cinematic styles; the editor uses the existing admin
  components.
- **Editor location:** `/admin/policies`, linked from the Homepage editor's shortcut list next to
  Robinson Stadium and Chick-fil-A.

## Public pages (cinematic@2 only)

`/stadium/guidelines` and `/stadium/fan-code` share `CinematicPolicyPage`
(`components/cinematic/CinematicPolicyPage.tsx`, `policies.css`). Each page shows:

- a title band matching the Contact page: right-aligned title, then an optional red line;
- an optional section heading ("Guidelines" / "Code of Conduct");
- red accordion rows in the owner's order. Rows are native `<details>`, so they work by keyboard
  and without scripts. The caret is the icons.download regular caret-down in Sam's sampled red
  (`#f22c22`). Thin weight, matching Sam's chevron.

Each answer is a list of subheadings and paragraphs. Every row with an answer starts open, as in
Sam's files. Subheadings and paragraphs share one grey and one spacing, as in his files. A row
without an answer opens to "Details coming soon." Answer lines left blank are ignored.

Both routes go through `renderCinematicPolicyRoute`
(`components/cinematic/CinematicPolicyRoute.tsx`):

- other site designs get a 404;
- a cinematic club with no saved record keeps the existing "More information will be available
  soon" placeholder.

## Owner editing (`/admin/policies`)

One editor (`components/admin/policies/CinematicPolicyEditor.tsx`) edits both pages, with a switch
between them. One Save writes both pages.

- **Page heading:** title (required), red line and section heading (each optional; blank hides it).
- **Rows:** heading (required), add, move up/down, and remove (with a confirmation).
- **Answer lines:** add a subheading or paragraph, change a line's kind, move it, remove it.
- **Preview:** phone and desktop preview of the page being edited.
- **Save behavior:** the same as Contact. Drafts are kept locally until saved, an unconfirmed save
  can be retried, a stale save is refused, and leaving with unsaved edits asks first.

Editing is pure and tested (`lib/cinematic-policies-draft.ts`). Before saving, blank answer lines
are dropped. A missing title or row heading blocks the save with a message such as "Fan Code of
Conduct, row 6: enter a row heading."

## Data and rules

- `onzio.cinematic_policy_content`: one row per club. `content` holds `{ guidelines, fanCode }`.
  Each page is `{ title, subtitle, heading, rows: [{ id, heading, blocks: [{ kind, text }] }] }`.
- The rules are defined in `lib/cinematic-policies-content.ts` and mirrored by
  `onzio_private.check_cinematic_policy_content`:
  - up to 30 rows per page and 12 lines per answer;
  - titles and headings up to 120 characters, row headings and subheadings up to 160, paragraphs
    up to 2,000;
  - row ids are lowercase letters, digits and dashes, unique per page;
  - a line is `subheading` or `paragraph` and cannot be blank.
- A validation trigger enforces the rules on every write, including direct table writes.
- **Access:**
  - public read through `can_read_feature(club, 'homepage')`;
  - owner and admin writes through `can_mutate_feature(club, 'homepage')`, for cinematic@2 only;
  - the same feature as the Robinson and Chick-fil-A pages.
- **Load and save:** `onzio.load_cinematic_policy_editor` and `onzio.save_cinematic_policy_editor`.
  Saves take one atomic step with a revision check, a design check and per-actor receipts. Advisory
  lock `734901320` is new to this package.
- **Admin route:** `app/api/admin/cinematic-policies/route.ts`, the same checks as Contact
  (same-origin, fresh session, tenant, role).

## Migration (applied to the isolated local rehearsal only)

- `supabase/migrations/20261112160000_cinematic_policy_pages.sql`.
- `scripts/apply-rose-city-policies-migration-local.ts --execute-local` applies it. It accepts only
  loopback 55321/55322 and records the migration in the ledger.
- Before any hosted deploy, the CLAUDE.md migration gate applies.

## Local content

`scripts/seed-rose-city-policies-2027-local.ts --execute-local` writes Sam's six rows to both pages.
It replaces the earlier five-row seed from the same day.

- **Guards:** it runs only on the loopback rehearsal and the Rose City test tenant, and needs the
  migration applied.
- **Owner edits:** it refuses to overwrite a record an owner has changed.
- **Other content:** it checks that Homepage, Robinson, Contact and Tickets content are unchanged.

Running it again on unchanged content is a no-op that confirms the stored content still equals the
seed.

## Shared files touched

- `lib/database.generated.ts`: the `cinematic_policy_content` table only.
- `components/admin/homepage/HomepageEditor.tsx`: one shortcut line.
- `HANDOFF.md`: a top entry.

The Robinson editor package can change `/stadium` and `/admin/stadium` without touching these
files.

## Waiting on Sam / the club

- Answers for Bags & Backpacks, Box Office Location & Times and Cameras/Video Equipment.
- Real Fan Code of Conduct rows; Sam's file repeats the Stadium Guidelines text.

## Verification

See the HANDOFF entry for 2026-11-04 (Policies).
