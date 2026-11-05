# RC2027-ROBINSON-EDITOR: owner editing for the Robinson Stadium page

2026-11-04. **Status: complete locally.** Christian approved the plan and the test layers. Editing works
and is tested locally. The public page is unchanged at five widths. Committed with Christian's OK;
nothing is pushed, merged or deployed. The work is on branch `codex/rose-city-robinson-editor-2027`, cut from `ecb47d1`,
in worktree `implementation/onzio-platform-robinson`.

## What changed for the owner

`/admin/stadium` now edits the Robinson Stadium page (`/stadium`, cinematic@2). Before this package
it edited the older Bus Route record, which now renders at `/stadium/foothill-transit`, while the
Robinson page itself was fixed in code.

The Bus Route editor moved to `/admin/foothill-transit`. Its data, API key (`stadium`) and public
page are unchanged. Its visible labels now say "Foothill Transit".

The Homepage editor's cinematic@2 shortcuts are now kept in `lib/cinematic-editor-shortcuts.ts`:
Robinson Stadium, Foothill Transit (new), Chick-fil-A, Policies and Partners. No admin sidebar
entry was added; Stadium never had one. The policy pages and `/admin/policies` are untouched.

Each section of the editor has a "Show on page" switch:

| Section | Editable |
|---|---|
| Page heading | Title, subtitle |
| Seating map | Image and description, caption, the phone-only full-size link label |
| Story | Up to 8 ordered paragraphs, the quote (curly quotes added on the page), the attribution |
| Stadium Info | Heading, note, up to 12 ordered rows (label plus Yes/No) |
| Next home match | Show/hide and the partner logo under the card |
| Lockers image | The image |
| Food & Beverage | Heading, meal pass image, text (line breaks kept on desktop), exactly three steps, each with a label and an icon |
| Road to the Match | Heading, subheading, bus image, route map image |
| Directions | Up to 12 ordered sections, each with a heading, paragraphs, an italic note, bullets and a closing line |

These stay with their existing owners: the match heading, button and announcement (Homepage), the
real next home fixture (Schedule), and the purchase link and its unavailable message (Tickets).

Each Directions section has a fixed ID that the page uses as an anchor, for example
`/stadium#parking-lot-no-5`. Renaming a heading never changes its ID, so the Stadium parking menu
link and the `/stadium/parking` redirect keep working. A new section gets `section-N`.

Saving works like the Stadium editor:
- each save is atomic and gets its own revision;
- every save leaves an actor receipt;
- an unsaved draft is restored after a reload (key `onzio:robinson:v1:<origin>:<user>:<club>`);
- an uncertain save locks the draft and retries the exact same operation;
- the editor includes a Desktop/Phone preview.

Images are PNG or WebP, up to 5 MB and 3000px per side, uploaded through the existing
homepage-artwork pipeline.

## Defaults Christian approved

1. `/admin/stadium` becomes Robinson; Foothill Transit moves to `/admin/foothill-transit`.
2. The 8978px seating diagram is stored at 3000px, the graphic pipeline's limit. Its labels remain
   readable, and the in-page map and the phone full-size link look the same.
3. Info values are Yes/No only, so the green and red colours keep their meaning.
4. A cinematic@2 club that has never saved Robinson sees a neutral "Stadium" heading and nothing
   else. Before, every cinematic@2 club saw Rose City's Robinson content.

## How it is built

- **Content model.** `lib/cinematic-robinson-content.ts` holds the strict Zod schema, the neutral
  default and media hydration. `lib/robinson-reference-content.ts` holds Christian's confirmed copy
  as `robinsonReferenceContent`, which is the starting content. It keeps the story's **2001** and
  the info card's **1999**, as shown.
- **Editor actions.** `lib/cinematic-robinson-editor.ts` holds the pure list functions: add, move
  and remove, Directions sections with stable IDs, image replacement, and unused session uploads.
- **Public page.** `components/cinematic/CinematicRobinson.tsx` renders the same markup and CSS
  classes as before. Sections follow their switches, and an empty image slot renders nothing.
  `lib/cinematic-robinson-query.ts` rebuilds image identities from the tenant FK columns and loads
  only this club's published media. The public route `app/%5Fclubs/[slug]/stadium/page.tsx` now
  reads only the Robinson record and Tickets. It no longer borrows anything from the Bus Route
  record.
- **Transport.** The existing visitor-pages API (`lib/visitor-page-route.ts`,
  `lib/visitor-page-editor.ts`) gained the `robinson` page type, calling `load_robinson_editor` and
  `save_robinson_editor`.
- **Editor screen.** `components/admin/stadium/RobinsonStadiumEditor.tsx`, laid out like the
  Stadium, Policies and Partners editors.
- **Database.** Migration `supabase/migrations/20261105050000_cinematic_robinson_page.sql`:
  - table `onzio.cinematic_robinson_content`, with RLS and column-level grants;
  - nine image FK columns, each tied to `onzio.media_assets(club_id,id)` and protected by a
    `guard_media_reference` trigger;
  - the JSON stores image descriptions only;
  - a strict plpgsql validator (`check_robinson_content`) that checks each value's type before
    reading inside it, plus a row trigger so direct writes obey the same rules;
  - receipts table `onzio_private.robinson_save_receipts`;
  - advisory lock `734901330`, which is new;
  - all images must be the club's own published homepage graphics;
  - reference-safe retirement finds the new FK columns through the catalog.
- **Generated types.** `lib/database.generated.ts` was regenerated while the local ledger matched
  this branch exactly. It only adds the new table and the two RPCs.

## Local data (isolated rehearsal only)

- `scripts/apply-rose-city-robinson-migration-local.ts --execute-local [--dry-run]` applies the
  migration. It is guarded to loopback 55321/55322, and the dry run rolls back.
- `scripts/seed-rose-city-robinson-2027-local.ts --execute-local` stores the confirmed copy. It
  publishes the eight images the static page served (`public/rose-city/robinson/*`) through the
  normal media pipeline, after checking each file's SHA-256. The seating diagram (SHA-256 `809585a4…`,
  the same as the archived original) is first resized to 3000px. The partner logo reuses the
  published logo the page already showed (`af84dce9…`). The seed refuses to overwrite owner edits,
  checks that six other content tables are unchanged, and is a no-op when re-run.
- The published copies of the Foothill Transit and Chick-fil-A artwork are re-encoded, not
  byte-identical to Robinson's files, so Robinson publishes its own copies. The static files in
  `public/rose-city/robinson/` remain as the seed's source; the page no longer reads them.

## Verification

All results below were run locally on 2026-11-04.

- **Robinson tests:**
  - content 8;
  - editor actions 4;
  - public page and query 8, including an exact markup match against
    `tests/fixtures/robinson/reference-2027.html`, which was captured from the static page before
    this change;
  - recovery 2;
  - visitor-pages API 10 (2 new);
  - admin routes 2;
  - database 14.
- **Full suites:**
  - contract, architecture and unit tests: 223 files, 1,827 tests pass;
  - full database suite: 47 files, 423 tests pass;
  - `tsc --noEmit` passes, and ESLint passes on every changed file.
- **Shared test changed:** `tests/contracts/cinematic-partners-editor.test.ts` read the Partners
  shortcut out of `HomepageEditor.tsx`. It now reads it from `lib/cinematic-editor-shortcuts.ts`
  and also checks that the Homepage editor uses that list. The check is the same; only the file it
  reads moved.
- **Real Chrome, layout.** Same-origin iframes at exactly 320, 390, 768, 1280 and 1440px compared
  the old static page (shared server 3198, at the same commit) with the new database-driven page
  (3195). The checks covered:
  - document height and width;
  - the position and size of 15 landmarks (heading, seating map and image, story, cards, info card,
    match card, lockers, food, steps, route, route heading, route map, directions, parking anchor);
  - visible text length;
  - image count.

  All were identical at every width. There was no sideways scroll at 390 and above. At 320px both
  pages have the same 1px document overflow (306/305), and the opponent crest (owned by Schedule)
  was not loaded at measurement time on both. Desktop screenshots match.
- **Gotcha:** `public/fonts/avenir-local/Avenir-Medium.ttf` is gitignored (a licensed local file).
  A new worktree needs it copied in, or Chrome falls back to the system Avenir, whose line metrics
  make the next-match card 9px shorter. This affects every worktree, not just this package.
- **Edit round trip (real Chrome, local test owner).** Three edits were made: the subtitle, the
  Wi-Fi row set to Yes, and the Lockers section hidden. Save worked, all three survived a reload
  (loaded from the server, not a restored draft), and all three appeared on `/stadium`. They were
  then undone through the same editor and saved. The re-run seed confirmed the stored row exactly
  equals the confirmed copy (revision 3).
- **Other browser checks:** no console errors on `/stadium` or `/admin/stadium`. The preview
  renders. `/admin/foothill-transit` loads the Bus Route content. `/stadium/parking` still lands on
  `#parking-lot-no-5`.

## Open items

- Physical-phone, Safari and VoiceOver checks remain open, as for every 2027 page.
- Before any hosted release, migration `20261105050000` must pass the CLAUDE.md production
  migration gate. It must be applied before code that reads `cinematic_robinson_content` is
  deployed.
- Merging this branch will conflict in `HANDOFF.md`, `docs/phase-11/diverse-city/STATUS.md`,
  `lib/database.generated.ts` and `components/admin/homepage/HomepageEditor.tsx`.
