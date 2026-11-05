# RC2027-PARTNERS: Club Partners and Partnership Opportunities

Status: implemented locally, 2026-11-04. Christian approved both isolated previews on 2026-11-03
(outer `design-explorations/partners-2027/`). This package moves them into the real routes with
owner editing. The work is on branch `codex/rose-city-partners-2027` in the worktree
`implementation/onzio-platform-partners`, branched from `e8cdf22`. Nothing was pushed, merged,
deployed or written to a hosted service.

Sources: Sam's `Rose City FC Club Partners website 2027.jpg` and
`Rose City FC Club Partnership Opportunities website 2027.jpg`, archived in outer
`assets/originals/remaining-pages/`.

## Christian's decisions (2026-11-04)

- **Styling:** no BoardUI. The pages reuse the approved preview CSS, and the editor uses the
  existing admin components.
- **Partner list:** one shared, ordered list for both pages. Each page keeps its own heading,
  subtitle, intro and bottom bar.
- **Partnership Opportunities button:** the owner sets the link (HTTPS, `mailto:` or a site page).
  The bottom bar stays hidden until a link is saved.
- **Modern Woodmen:** use the colour logo that the Home carousel already uses. It came from the live
  Rose City site and matches Sam's reference. The approved preview had shown the inverted white file
  instead.

## Public pages (cinematic@2 only)

- **`/sponsors` (Club Partners)** and **`/community/partnership` (Partnership Opportunities)**
  both render `components/cinematic/CinematicPartners.tsx` with `partners.css`, ported from the
  preview. Top to bottom:
  - the heading and red subtitle;
  - the intro;
  - the partner grid: logo, rule, role. Three columns on desktop, one on phones;
  - the bottom bar.
- **Logo colour:** each partner has a logo colour for the white page: Original, Grey or Black.
  Grey and Black are for white artwork. TPA uses Grey, as in the preview.
- **Missing logo:** a partner without a logo shows its name with "Original logo pending", the
  accepted placeholder. MVMNT CULTR uses it.
- **Bottom bar:** on Club Partners the button always goes to `/community/partnership`. A blank
  button text hides the bar on either page.
- **Empty sections:** an empty intro or an empty partner list is hidden.
- **Other designs:** they keep their existing `/sponsors` page (Clubhouse, Academy and the "not
  published" message). `/community/partnership` returns 404 for them.
- **Unsaved cinematic@2 clubs:** a club that has never saved Partners keeps the old `/sponsors`
  message and the existing Partnership placeholder.

## Owner editing

- **Where:** a new Partners editor at `/admin/partners`
  (`components/admin/partners/CinematicPartnersEditor.tsx`). Owners reach it from Homepage →
  "Edit in Partners" and from a link at the top of the Sponsors editor. Both appear for cinematic@2
  only.
- **What the owner edits:**
  - each page's heading, subtitle, intro, bottom-bar text and button text, plus the Partnership
    Opportunities button link;
  - the partner list, up to 24: name, role, logo and logo colour. Partners can be added, moved and
    removed.
- **Logos are shared, not copied:** the logo picker lists the logos already used by the Sponsors
  editor (carousel and footer) plus those in use on the Partners pages. "Upload new logo" goes
  through the normal secure media pipeline (branding surface).
- **Unsaved uploads:** an upload that ends up unused is cleaned up after the save, or when the owner
  reloads and discards it.
- **Saving:** all changes save together in one atomic save, with a revision check, receipts for a
  lost response, local draft recovery and an unsaved-changes warning, as in the Contact editor.
- **Preview:** a preview shows either page at desktop or phone width.

## Data and rules

- **Tables:**
  - `onzio.cinematic_partners_content`: one row per club; `content.pages` holds both pages' copy,
    plus a revision.
  - `onzio.cinematic_partners`: one row per partner (`sort_order`, `name`, `role`,
    `logo_media_asset_id`, `logo_tone`). It has a composite tenant FK to `media_assets` and the
    standard media guard.
- **Where the rules live:** `lib/cinematic-partners-content.ts` defines them, and
  `onzio_private.check_cinematic_partners_*` mirrors them in the database:
  - at most 24 partners, each with a name and a unique id;
  - headings are required;
  - text limits;
  - the button link must be HTTPS, `mailto:` or a site path (the same rule as the Contact
    Information link).
- **Logos:** each logo must be a published graphic of this club. The save rejects another club's
  logo, an unpublished logo or a photograph.
- **Retiring logos:** `save_cinematic_partners_editor` returns the logos no partner uses any more.
  The route then retires them through the reference-safe retirement, so a logo still used by
  Sponsors, Schedule or Homepage is kept. The retirement finds the new FK through the catalog.
- **Access:** reads are public through `can_read_feature(club, 'branding')`. Writes need
  `can_mutate_feature(club, 'branding')` and a published cinematic@2 design. Mutations are
  serialized with advisory lock 734901315 plus the shared media lock 734901281.

## Migration (applied to the isolated local rehearsal only)

- `supabase/migrations/20261105030000_cinematic_partners.sql`. It only adds new objects.
- `scripts/apply-rose-city-partners-migration-local.ts --execute-local` applied it. The script
  accepts only loopback 55321/55322 and records the migration in the ledger.
- `lib/database.generated.ts` gains only the two new tables.
- Before any hosted deploy, the CLAUDE.md migration gate applies.

## Local content

`scripts/seed-rose-city-partners-2027-local.ts --execute-local`:

- **Guards:** runs only on the loopback rehearsal and the Rose City test tenant, and refuses if
  Partners content already exists.
- **Content:** writes the approved copy and seven partners in Sam's order:
  1. Foothill Transit
  2. Niky's Sports
  3. Tepito Coffee
  4. Chick-fil-A Pasadena
  5. The Packshot Agency (Grey)
  6. Modern Woodmen (colour)
  7. MVMNT CULTR (no logo yet)
- **Logos:** reuses six existing published logos (Sponsors carousel, branding and Schedule). It
  uploads nothing.
- **Protection:** checks that Homepage, Sponsors logos, media, Contact and Shop are unchanged.

## Waiting on Sam

- **MVMNT CULTR:** still missing. Dropbox (`/Rose City FC x Onzio 2027`, its Sponsors folder and
  "RCFC Website icon's 2027") was rechecked on 2026-11-04. It shows "Original logo pending" until
  Sam supplies it; then the owner uploads it in the editor.
- **Stacked logos:** Sam's stacked versions of Foothill, Niky's and Tepito are still missing.
  The pages use the available horizontal files.
- **Opportunities button link:** stays hidden until the club gives a destination.

## Verification

See the HANDOFF entry for 2026-11-04 (RC2027-PARTNERS).
