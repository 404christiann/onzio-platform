# MLA `pathway@1` — Phase 1: Public Site on the Real Registry

Working branch: `claude/mla-pathway` (worktree `onzio-platform-mla`, cut from `origin/staging`).

Goal: register a 6th platform presentation template, `pathway@1`, originating from the approved
Manu Ledesma Academy (MLA) prospect mockups, and stand up MLA as a real tenant row rendering
12 static public routes through the production presentation pipeline. Phase 1 is public site +
hardcoded content only. Explicitly out of scope: admin CMS surfaces, a pathway contract-test
suite (both deferred to Phase 2, following the `editorial@1` staging in
`docs/lions-fc-launch-plan.md` Phase 1), Stripe/booking/payment backends of any kind, and any
hosted Supabase or Vercel mutation. Existing tenants (`academy@1` = Diverse City FC, paying;
`clubhouse@1` = Rose City, live) must be bit-for-bit unaffected.

Naming is locked: club **"Manu Ledesma Academy"**, slug **`manu-ledesma-academy`**, template
**`pathway@1`**. The strings `lions` and `metro` must not appear in any new code, file name,
slug, or doc created for this effort.

## Ground-truth corrections found during repo verification

These override the briefing where they differ; every step below is written against the live code.

1. **There is no outbound Resend client to reuse.** Resend appears in this codebase only as an
   *inbound* delivery-event webhook (`lib/resend-webhook.ts`,
   `app/api/webhooks/resend/route.ts`, env `RESEND_WEBHOOK_SECRET`). Auth emails are sent by
   Supabase Auth (`signInWithOtp` in `lib/operator/provision-club.ts`), with Resend configured
   at the Supabase project level — outside this repo. The `resend` npm package is not in
   `package.json` and no `RESEND_API_KEY` exists anywhere. The contact-form send path is a
   **new build** (Step 7), not a reuse.
2. **The real precedent for custom template chrome is the `editorial@1` shell, not more
   branches in `components/Nav.tsx`.** `app/%5Fclubs/[slug]/layout.tsx` returns
   `<EditorialShell>` (own header/main/footer, own scoped CSS via `styles/editorial.css`)
   for `editorial@1` and the shared `Nav`/`Footer`/`TemplateFontScope` stack for everything
   else. Pathway has its own affiliation bar, nav, and footer, so it gets a `PathwayShell`
   following that exact branch — `Nav.tsx` is left untouched.
3. **Section `type` strings must be lowercase kebab-case** — the zod `sectionSchema` regex is
   `^[a-z]+\.[a-z0-9-]+$`. The briefing's camelCase names become `pathway.affiliation-bar`,
   `pathway.pathway-rail`, `pathway.split-feature`, etc.
4. **Section `config` cannot carry copy with URLs, hrefs, or path-ish keys.**
   `hasUnsafeConfiguration()` in `packages/presentation/index.ts` rejects any config key
   matching `/html|css|class|style|script|url|href|src|path/i` and any string value containing
   `https?://`. All Phase 1 copy is therefore hardcoded in the pathway components; every
   section in the published document keeps `config: {}`.
5. **The published document is validated at `surface: "production"` even for a preview
   tenant** — `resolvePublishedPresentationTemplateKey` (`lib/club-context.ts`) parses with
   that surface, and a parse failure silently yields `presentationTemplateKey: null` (the
   tenant renders the legacy default chrome). So: no `sample`/`unresolved` provenance entries
   in the published doc (omit `provenance` entirely), and the theme must pass the contrast
   gates (text.primary vs surface.canvas ≥ 4.5, action.primaryText vs action.primary ≥ 3).
6. **New flat routes 404 at the middleware unless added to `PUBLIC_TENANT_PATHS`**
   (`middleware.ts`). Tenant traffic is rewritten to `app/%5Fclubs/[slug]/...`; the
   `app/(public)/...` tree is a legacy unscoped fallback that tenant traffic never reaches.
   Phase 1 creates pages only under `app/%5Fclubs/[slug]/` (no `(public)` twins).
7. **Provisioning facts confirmed**: `provisionClub` (`lib/operator/provision-club.ts`)
   accepts `kind: "customer" | "demo" | "test"` and hardcodes `lifecycle: "onboarding"`,
   `public_access: "preview"`, `tier: "starter"` — matching the briefing. But it *requires* a
   `primaryDomain` (inserts a verified `club_domains` row) and a live operator TOTP session.
   For local preview neither is needed: middleware resolves `*.localhost` hosts by slug
   directly. So Phase 1 uses a **local seed script** (Step 8); the operator provisioning
   script is written but only *run* if/when a staging review alias is actually wanted.
8. **`geist` font pack confirmed** (`clubhouse@1` + `editorial@1` today), loaded globally via
   `next/font` in `app/layout.tsx` (`--font-geist-sans`). Pathway inherits it for free, but
   `fontPacks.geist.compatibleTemplates` must gain `"pathway@1"` — the bidirectional
   consistency test in `tests/contracts/presentation-system.test.ts` (~line 500) enforces
   both directions.
9. **`presentation_documents.created_by` is `not null references auth.users(id)`**
   (migration `20260729040045_phase9_presentation_system.sql`), and the document/state/
   publication triple is how a club gets a template at all — the lions-media local import
   (`lib/migration/lions-media-local-import.ts`, ~line 910) is the exact row-shape precedent
   for Step 8.

## Step order and dependencies

```
1. migration          (independent; required before Step 8 can publish a pathway doc locally)
2. registry           (required by everything that mentions the "pathway@1" TemplateKey: 4,5,6,8)
3. middleware routes  (required before manual route checks; independent of 2)
4. shell + css        (requires 2; required by 5,6)
5. section components (requires 4)
6. route pages        (requires 2,4,5)
7. contact API        (independent of 2-6; required before the form in 5/6 actually sends)
8. tenant seed        (requires 1,2; required before anything renders in a browser)
9. verification       (requires all)
```

## Step 1 — DB migration (schema-only)

Create `supabase/migrations/<timestamp>_pathway_presentation_template.sql`, modeled exactly on
`supabase/migrations/20260812120000_editorial_presentation_template.sql` (same style, same
tail):

```sql
-- MLA P1: register the pathway@1 presentation template as a valid
-- template_id for onzio.presentation_documents. Schema-only; the TS registry
-- and the pathway pages land in sibling Phase 1 steps.

alter table onzio.presentation_documents
  drop constraint presentation_documents_template_id_check;

alter table onzio.presentation_documents
  add constraint presentation_documents_template_id_check
  check (template_id in ('cinematic', 'heritage', 'clubhouse', 'academy', 'editorial', 'pathway'));

notify pgrst, 'reload schema';
```

Apply **locally only** (`supabase db reset` or local `db push`). No hosted push in Phase 1;
when staging/production eventually applies it, the mandatory `supabase migration list --linked`
gate in `CLAUDE.md` governs.

## Step 2 — Registry changes (`packages/presentation/index.ts`)

All in one file, one commit. Additions only — no existing entry changes except the two
compatibility arrays noted.

1. **Type unions**: add `"pathway@1"` to `TemplateKey`, `"pathway"` to `TemplateId`, `"pathway"`
   to `SectionRegistration["scope"]`, and `"pathway"` to the `documentSchema` `template.id`
   z.enum.
2. **Font pack**: add `"pathway@1"` to `fontPacks["geist"].compatibleTemplates`. Keep pathway's
   `compatibleFontPacks: ["geist"]` only (no `bebas-inter` fallback — adding it would require
   touching that pack's array too, for no Phase 1 benefit).
3. **`routeRegistry`** — new generic semantic keys (named for reuse by future non-sports
   academy-style templates, per the `academy@1`/`editorial@1` precedent; paths are the real
   URLs the app serves):

   | key               | path             | note                                            |
   |-------------------|------------------|-------------------------------------------------|
   | `academy`         | `/academy`       | flagship program page                            |
   | `training`        | `/book-training` | shareable training selector and hosted handoff    |
   | `youth-club`      | `/youth-club`    |                                                  |
   | `senior-club`     | `/senior-club`   |                                                  |
   | `league`          | `/upsl`          | adult amateur league affiliation page            |
   | `league-payments` | `/upsl-payments` | informational only in Phase 1                    |
   | `merch`           | `/merch`         | distinct from existing `store` → `/shop`         |
   | `about`           | `/about`         | flat; existing `club` key maps to `/club/about`  |
   | `promo`           | `/winter-5v5`    | seasonal promo page                              |
   | `legal`           | `/privacy`       |                                                  |

   `home` and `contact` already exist and are reused.
4. **`sectionRegistry`** — 13 entries, all `scope: "pathway"`, `version: 1`,
   `compatibleTemplates: ["pathway@1"]`, `cardinality: "single"`,
   `productionProvenance: ["verified_public_source", "club_supplied", "operator_approved"]`.
   Registry comment follows the `academy@1` block's tone (state what's deliberately excluded:
   no payment collection behind `numbered-steps`/`price-cards`, and no embedded scheduler or
   checkout; the training gateway only selects an offer before a hosted Acuity handoff).

   | type                        | contentDomain        | requiredModule / entitlement | emptyBehavior |
   |-----------------------------|----------------------|------------------------------|---------------|
   | `pathway.affiliation-bar`   | `site_branding`      | null                         | hide          |
   | `pathway.nav`               | `site_branding`      | null                         | error         |
   | `pathway.hero`              | `homepage`           | null                         | error         |
   | `pathway.pathway-rail`      | `programs`           | null                         | error         |
   | `pathway.split-feature`     | `programs`           | null                         | hide          |
   | `pathway.inverted-feature`  | `programs`           | null                         | hide          |
   | `pathway.spec-list`         | `programs`           | null                         | hide          |
   | `pathway.numbered-steps`    | `programs`           | null                         | hide          |
   | `pathway.price-cards`       | `shop_kit_section`   | `store` / starter            | hide          |
   | `pathway.partner-strip`     | `site_sponsor_logos` | `sponsors` / starter         | hide          |
   | `pathway.contact-form`      | `contact`            | `contact` / starter          | error         |
   | `pathway.legal-doc`         | `about`              | null                         | hide          |
   | `pathway.footer`            | `site_branding`      | null                         | error         |

   `pathway.pathway-rail` is the signature Home-only module; its registry comment should say so.
5. **`templateRegistry["pathway@1"]`**:
   - `displayName: "Pathway"`,
   - `originNote`: match the `academy@1`/`editorial@1` comment + note tone — e.g. a code
     comment stating this is a platform template any club may be assigned, extracted from the
     approved Manu Ledesma Academy prospect visual system (programs-and-pathway IA, not a
     sports-CMS shape), and `originNote: "Based on the approved Manu Ledesma Academy prospect
     visual system."`
   - `defaultFontPack: "geist"`, `compatibleFontPacks: ["geist"]`,
   - `defaultSections: ["pathway.hero", "pathway.pathway-rail", "pathway.partner-strip"]`
     (the homepage document's sections — shell chrome sections are registered but not
     homepage entries),
   - `supportedSections`: all 13 `pathway.*` types,
   - `defaultRoutes` (the ten registered destinations; Roster is nested under
     UPSL rather than becoming an eighth top-level tab):
     `["home", "academy", "training", "youth-club", "senior-club", "league", "roster", "merch", "about", "contact"]`,
   - `supportedRoutes`: defaultRoutes + `["league-payments", "promo", "legal"]`,
   - `supportedModules: ["contact", "sponsors", "store", "affiliations", "roster", "staff"]`.

The `spec-list` "to be confirmed" state is a component-level contract, not a registry one
(configs are empty in Phase 1): type its rows as
`{ label: string; value: string } | { label: string; state: "tbc" }` in Step 5 so honest
unresolved club facts (e.g. Senior Club specifics) render as a first-class TBC treatment, never
fictional filler.

## Step 3 — Middleware route allowlist (`middleware.ts`)

Add to `PUBLIC_TENANT_PATHS`: `/academy`, `/book-training`, `/youth-club`, `/senior-club`,
`/upsl`, `/upsl-payments`, `/merch`, `/about`, `/winter-5v5`, `/privacy`.
(`/`, `/contact`, and the canonical `/roster` route are already present.) No
new dynamic pattern is needed for the Pathway roster because player detail
routes remain unavailable.

## Step 4 — Pathway shell and scoped styles

Following the `EditorialShell` precedent exactly:

- `styles/pathway.css` — all pathway styling scoped under a `[data-site-template="pathway"]`
  wrapper (mirror `styles/editorial.css`'s scoping so nothing leaks into other templates).
- `components/pathway/PathwayShell.tsx` — imports the css, renders
  `PathwayAffiliationBar` → `PathwayNav` → `<main>{children}</main>` → `PathwayFooter` inside
  the scoped wrapper. Geist is already on `<body>` via `app/layout.tsx`, so no font wiring.
- `components/pathway/PathwayAffiliationBar.tsx` — thin utility strip above the nav.
- `components/pathway/PathwayNav.tsx` — tenant crest (from `useClubBranding()`, initials
  fallback like `Nav.tsx`) + a centered seven-route array beginning with Home and ending with
  About (same hardcoded-array pattern as `academyNavLinks()` in `components/Nav.tsx`, but
  living in the pathway shell). UPSL is a split-link disclosure: its label
  continues to navigate to `/upsl`, while its nested Roster item navigates to
  canonical `/roster` without becoming an eighth top-level tab. Add one primary
  CTA that opens the shared training gateway and retains `/book-training` as
  its progressive fallback. Contact remains in the footer.
- `components/pathway/PathwayFooter.tsx` — tenant crest/name lockup,
  Explore/Connect columns, the shared tenant-relative `Powered by Onzio` attribution, and the
  `/privacy` legal link.
- `app/%5Fclubs/[slug]/layout.tsx` — add a branch structured identically to the existing
  `editorial@1` one, with the same style of why-comment:
  `if (club.presentationTemplateKey === "pathway@1") return <ClubContextProvider…><ClubBrandingProvider><PathwayShell>{children}</PathwayShell>…`.
  The shared-template return stays byte-identical.

## Step 5 — Section components (`components/pathway/`)

One file per registered section type, presentational, hardcoded-content-friendly props:

- `PathwayHero.tsx` — eyebrow, 2-line headline, sub, CTA pair; `variant: "centered" | "left"`
  (centered on Home, left on inner pages).
- `PathwayRail.tsx` — the 4-stage spine (Academy → Youth Club → Senior Club → UPSL) with the
  connecting rail; Home only.
- `PathwaySplitFeature.tsx` — text column + media placeholder, grid `1fr / minmax(460px, 480px)`
  desktop, bottom-aligned; media placeholder is a neutral grey block component
  (`PathwayMediaPlaceholder.tsx`) reused everywhere an asset is not yet supplied.
- `PathwayInvertedFeature.tsx` — same shape, dark background; retained as a
  reusable pathway primitive even though the current UPSL route no longer
  composes it.
- `PathwaySpecList.tsx` — label/value rows in 2 columns; row type
  `{ label; value } | { label; state: "tbc" }` with a distinct visible TBC treatment.
- `PathwayNumberedSteps.tsx` — ordered steps, each with a cost figure; informational only.
- `PathwayPriceCards.tsx` — informational package figures; no checkout.
- `PathwayMerchStore.tsx` — the approved single-product store composition,
  repeated for match and training collections. Each collection has independent
  Orange/Black tabs, one large front/back jersey image in a rounded white
  product frame, resilient direct media, and a contact handoff. A final
  content-driven `#DIAZAMENTALITY` brand statement pairs the supplied logo with
  the academy's definition; no price, cart or checkout is invented.
- `PathwayAboutEditorial.tsx` — the About-only leader-letter sequence. It
  preserves the supplied portrait at its native aspect ratio, keeps the exact
  seven-part 2026 message in readable source order, and uses resilient direct
  media without changing the shared split-feature contract.
- `PathwayUpslStandingsTable.tsx` — the accepted Lions table structure and
  geometry restyled with pathway tenant tokens, backed only by MLA-owned
  `league_standings` rows and resilient direct crests.
- `PathwayUpslRoster.tsx` — the accepted Lions roster hierarchy restyled with
  pathway tokens: compact filter, Goalkeepers/Defenders/Midfielders/Forwards/
  Technical Staff groups, tenant-crest cards, and responsive four/three/two
  columns. Phase 1 content is exactly Player 1–22 plus four neutral default
  staff entries; cards carry no separate jersey-number treatment, statistics,
  links, profiles, or invented biographical data.
- `PathwayEditorialCarousel.tsx` — About-only, full-bleed 4:5 editorial poster
  rail immediately after the leader letter, with one dominant centered frame,
  visible neighboring frames, 4.5-second automatic rotation, touch scrolling,
  keyboard navigation, resilient direct media, and reduced-motion handling.
  It has no visible caption, counter, progress rail, arrows, or other control
  chrome, and ordinary pointer/focus state does not stop its timer.
- `PathwayPartnerStrip.tsx` — logo carousel; Phase 1 renders neutral unbranded placeholder
  tiles (no invented partner names/logos).
- `PathwayContactForm.tsx` — client component; first/last/email/message; POSTs to
  `/api/contact` (Step 7); success/error states inline.
- `PathwayLegalDoc.tsx` — label + body rows (Privacy).

Copy lives in a single `components/pathway/content.ts` module (typed constants per page) so
Phase 2 can swap it for DB-backed content domains without touching the components. Use real
MLA identity (name, crest) where supplied; TBC rows and grey placeholders elsewhere — never
fictional facts.

## Step 6 — Route pages (`app/%5Fclubs/[slug]/…`)

New folders, each a server component: resolve `getClubContextBySlug`, then
`if (club.presentationTemplateKey !== "pathway@1") notFound();` (the exact inverse-gate pattern
of `app/%5Fclubs/[slug]/contact/page.tsx`), then compose Step 5 components with `content.ts`
copy:

| route              | composition (main modules)                                          |
|--------------------|---------------------------------------------------------------------|
| `academy/`         | academy editorial + technical-work hero                                  |
| `book-training/`   | full-page mode of the shared age-first training selector             |
| `youth-club/`      | Join Us invitation + team-transition hero                          |
| `senior-club/`     | centered coming-soon statement + secure interest form               |
| `upsl/`            | tryout spotlight + official match channel + tenant-owned standings  |
| `roster/`          | filterable default UPSL squad + technical staff crest cards          |
| `upsl-payments/`   | numbered-steps + spec-list (informational; no payment collection)    |
| `merch/`           | editorial store + match/training selectors + closing DIAZA statement |
| `about/`           | leader portrait/letter editorial + auto-rotating poster carousel       |
| `winter-5v5/`      | hero (left) + spec-list + CTA to `/contact`                          |
| `privacy/`         | legal-doc                                                            |

Existing shared routes:

- **Home** — `app/%5Fclubs/[slug]/page.tsx` currently always renders `HomePageClient`. Add a
  pathway branch *before* it: `if pathway@1 → <PathwayHome />` (hero, leader
  story, expectation grid, pathway rail, partner strip, and mission), leaving
  the existing return untouched.
- **Contact** — `app/%5Fclubs/[slug]/contact/page.tsx`: add a pathway branch ahead of the
  editorial/academy branches rendering `PathwayContactForm` (plus hero, left variant).
- **Sports-CMS routes** — Pathway now deliberately supports the canonical
  roster index while keeping player profiles unavailable. `roster/[playerId]`,
  `schedule` (+ detail), `shop`, `sponsors`, `staff`, `stats`, `tryouts`, `programs` (+ detail), `club/about`,
  `club-logo` under `app/%5Fclubs/[slug]/` each get a one-line
  `if (club.presentationTemplateKey === "pathway@1") notFound();` guard so the preview
  behaves like production (nothing links there, but direct URLs must not render empty
  roster/schedule shells for this tenant). Where a page doesn't already load club context,
  follow the contact page's pattern to obtain it.

No `app/(public)/` twins (see ground-truth note 6).

## Step 7 — Contact form send via Resend (new build)

1. Add the `resend` npm dependency (official SDK; the alternative — raw `fetch` to
   `api.resend.com` — saves a dep but the SDK matches how the rest of the platform prefers
   typed clients).
2. `lib/contact-inbound.ts` — pure/testable core: zod schema
   `{ firstName, lastName, email, message }` (trimmed, bounded lengths, email format), plus a
   honeypot field that silently accepts-and-drops; builds the outbound message (subject
   `"New inquiry — <club name>"`, `reply_to` = submitter).
3. `app/api/contact/route.ts` — POST handler. Tenant identity comes from the
   `x-onzio-club-id` / `x-onzio-club-slug` headers middleware already sets on every tenant
   request (never from the body). Recipient resolution: the club's `contact_profile` email via
   the existing `fetchContactContent` query, falling back to a new
   `ONZIO_CONTACT_FALLBACK_TO` env var; sender from `ONZIO_CONTACT_FROM` (must be a
   Resend-verified sender). Missing `RESEND_API_KEY`/sender config returns a clear 503-style
   contract error rather than pretending to send. Keep the route template-agnostic — it is a
   platform capability, gated by nothing pathway-specific.
4. New env vars documented in `docs/local-development.md` alongside `RESEND_WEBHOOK_SECRET`:
   `RESEND_API_KEY`, `ONZIO_CONTACT_FROM`, `ONZIO_CONTACT_FALLBACK_TO`.
5. "Book Training" CTAs open an age-first selector and retain `/book-training` as a fallback.
   Final actions navigate to verified Acuity appointment or package pages in the same tab.
   The Onzio site embeds no scheduler, checkout, SDK, iframe, or payment collection.

**Checkpoint (Christian):** verified Resend sender/domain for the from-address, and the real
API key placed in `.env.local` — agents do not create or handle these credentials.

## Step 8 — Tenant row + published presentation document

Two scripts, one run in Phase 1:

1. **`scripts/seed-mla-local.ts`** (run for Phase 1) — service-role insert against the *local*
   Supabase stack only (assert `NEXT_PUBLIC_SUPABASE_URL` is localhost, same defensive style as
   the `import-*-local` scripts):
   - `onzio.clubs` row: deterministic uuid, slug `manu-ledesma-academy`, name
     `Manu Ledesma Academy`, `kind: "test"`, `lifecycle: "onboarding"`,
     `public_access: "preview"`, `tier: "starter"`.
   - The presentation triple, modeled row-for-row on
     `lib/migration/lions-media-local-import.ts` (~line 910): one
     `presentation_documents` row (`template_id: "pathway"`, `template_version: 1`,
     `configuration` = the document below, `configuration_digest` computed with the same
     digest helper that file uses, `created_by` = a seeded local auth user id), one
     `presentation_state` row publishing it, one `presentation_publications` audit row.
   - The configuration document: `schemaVersion: 1`, `template: { id: "pathway", version: 1 }`,
     `fontPack: "geist"`, a theme whose tokens pass the contrast gates (validate by round-
     tripping through `parsePresentationDocument({ surface: "production" })` inside the script
     before inserting — fail loudly, since a bad doc otherwise degrades silently to
     `presentationTemplateKey: null`), `modules: { contact: true, sponsors: true, store: true }`,
     `homepage.sections` = the three `defaultSections` with `config: {}` and no `provenance`,
     `navigation.groups` = `[{ id: "main", label: null, routes: defaultRoutes }]`.
   - No `club_domains` row needed: preview at `http://manu-ledesma-academy.localhost:3000`
     (middleware's `*.localhost` slug resolution).
   - Crest: if the real MLA crest file is on hand, seed `site_branding` through the existing
     media pattern; otherwise ship with the initials fallback `PathwayNav` already handles.
     **Checkpoint (Christian): supply crest asset or approve initials for Phase 1.**
2. **`scripts/provision-mla-staging.ts`** (written, not run) — sibling of
   `scripts/provision-diverse-city-production.ts`: confirmation-string argument, env
   assertions, `acquireOperatorAccessToken()`, then `provisionClub({ kind: "test", slug:
   "manu-ledesma-academy", name: "Manu Ledesma Academy", primaryDomain: <throwaway
   .vercel.app alias>, … })` plus the presentation-triple publish. Only executed by Christian,
   only if/when a staging review link is actually wanted — not required for Phase 1
   completion, and no hosted write happens without his explicit run.

## Step 9 — Verification checklist

Baseline first (before Step 1): `npx tsc --noEmit` and `npm test` green with local Supabase up;
every later result diffs against this.

- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run lint` clean.
- [ ] `npm run test:contracts` green — the generic registry-consistency loops in
      `tests/contracts/presentation-system.test.ts` (font-pack bidirectionality, per-template
      section/route/module integrity) now exercise `pathway@1`; no new pathway contract suite
      is added (deferred to Phase 2 by design).
- [ ] `npm test` (full suite) green.
- [ ] `npm run test:db` green after `supabase db reset` (new constraint migration applies; the
      check now admits `'pathway'`).
- [ ] Seed + render: `npx tsx scripts/seed-mla-local.ts`, `npm run dev`, then at
      `http://manu-ledesma-academy.localhost:3000` load **all 13 routes**:
      `/`, `/academy`, `/book-training`, `/youth-club`, `/senior-club`, `/upsl`,
      `/roster`, `/upsl-payments`, `/merch`, `/about`, `/contact`, `/winter-5v5`, `/privacy`.
      Seven appear as top-level tabs; Roster appears in the UPSL disclosure;
      `/winter-5v5`, `/upsl-payments`, and `/privacy` are reachable outside
      that primary row.
- [ ] Home shows the centered hero + pathway rail. About, Senior Club, and
      UPSL intentionally begin with their own semantic `h1` sections instead
      of the shared inner hero; Senior's coming-soon message is centered and
      UPSL ends with the tenant-owned Ohio Valley table. Remaining price cards
      are display-only (no payment affordances anywhere).
- [ ] Contact form round-trip with `RESEND_API_KEY` set (real send received); with it unset,
      the API returns the explicit configuration error, not a fake success.
- [ ] Unsupported sports-CMS routes 404 for the MLA tenant:
      `/roster/<player-id>`, `/schedule`, `/shop`, `/sponsors`, `/staff`,
      `/stats`, `/tryouts`, `/programs`, `/club/about`; `/roster` renders the
      Pathway UPSL roster.
- [ ] No-bleed regression: run the DCFC and editorial local imports and confirm their tenants
      render exactly as before (nav, fonts, homepage) — any pathway CSS or layout-branch leak
      shows up here (the "Rose City hero flash" class of bug).
- [ ] Naming guard: `grep -ri "metro" <new files>` empty; no new file, slug, or identifier
      uses the superseded working name; template/club naming matches the locked names above.
- [ ] **Checkpoint: Christian's visual review of all 13 routes locally before any Phase 2
      planning or any staging provisioning run.**

**What could go wrong:** (a) an invalid published document doesn't error — it silently falls
back to `presentationTemplateKey: null` and the tenant renders the legacy Rose-City-shaped
chrome, which is why Step 8 round-trips the doc through the production-surface parser before
inserting; (b) forgetting a `PUBLIC_TENANT_PATHS` entry 404s that route only on tenant hosts,
which local `next dev` on plain `localhost` can mask — verify on the `*.localhost` tenant host;
(c) the config-safety regex rejects innocent-looking keys (`iconUrl`, `imagePath`) if Phase 2
ever moves copy into `config` — keep configs empty now and note it for the Phase 2 content-
domain design; (d) pathway CSS leaking outside its `[data-site-template="pathway"]` scope
regresses paying tenants — the no-bleed check above is mandatory, not optional.

## 2026-08-17 UPSL roster and final CTA acceptance record

- **Package/status:** pathway Phase 1 roster/navigation/CTA refinement —
  implementation complete and locally verified; rendered browser review
  pending; uncommitted on `claude/mla-pathway`.
- **Completed work:** connected Youth Club's team-transition hero to the
  existing Book Training gateway; replaced the UPSL tryout action with the
  supplied external Register Here destination; added the canonical `/roster`
  Pathway dispatch with exactly Player 1–22 and four neutral staff entries;
  and added an accessible split-link UPSL/Roster disclosure on desktop and
  mobile without expanding the seven-tab top-level row.
- **Roster boundaries:** cards use the tenant crest, Pathway tokens, resilient
  direct delivery, the accepted Lions filter/group hierarchy, and responsive
  four/three/two-column geometry. They contain no separate jersey number,
  player statistics, profile links, dialogs, or invented biographies.
  `/roster/[playerId]` remains blocked for Pathway.
- **Registry/publication:** `roster` is now a Pathway default/supported route;
  `roster` and `staff` are supported published modules; the MLA presentation
  document remains byte-order aligned with the registry default routes.
- **Files:** Pathway nav/roster/content, shared roster dispatch, scoped CSS,
  presentation registry/publication, focused contracts, test documentation,
  this plan, and the repository handoff.
- **Acceptance evidence:** focused checks pass 33/33; architecture 20/20;
  legacy 280/280; TypeScript, lint, production build, and `git diff --check`
  pass. Full contracts are 776/777 only because the existing date-sensitive
  Editorial fixture expects `Capital City Athletic` while the resolver returns
  `Dayton Rovers SC`. The local server starts, but rendered browser review is
  pending because the in-app browser blocked the tenant-localhost URL before
  navigation.
- **Hosted state:** no hosted mutation, deploy, push, commit, form submission,
  booking action, or external registration navigation was authorized or run.
- **Exact next step:** Christian reviews `/roster`, both UPSL disclosure modes,
  and the two changed CTAs locally; no hosted action is authorized.

## 2026-08-17 Academy and Youth Club simplification acceptance record

- **Package/status:** pathway Phase 1 Academy/Youth Club composition cleanup —
  complete and verified locally; uncommitted on `claude/mla-pathway`.
- **Completed work:** moved `Our Academy` and `Join us!` to the top of their
  routes; placed the existing technical-work and team-transition hero bands
  directly below them; removed the Academy technique narrative, both
  at-a-glance sections, and their content objects; and changed
  `Year-round training` from a contact link to visible plain list text.
- **Semantics:** the neutral shared sections accept a route-selected `h1` or
  `h2` while retaining the same visual class. Each page has exactly one `h1`
  in the opening editorial and uses `h2` for the moved hero.
- **Files:** both route pages, `PathwayHero`, `PathwayAcademyEditorial`,
  `PathwayYouthJoin`, their content blocks, focused contracts/docs, and this
  plan.
- **Acceptance evidence:** focused Academy/Home/stage contracts pass 10/10;
  TypeScript, architecture 20/20, legacy 280/280, lint, build, and
  `git diff --check` pass. Full contracts remain 763/764 only because the
  existing date-sensitive Editorial fixture expects `Capital City Athletic`
  while the resolver returns `Dayton Rovers SC`. Browser inspection at
  1440x900 and 390x844 confirms exact section order/removal, correct heading
  hierarchy, zero `Year-round training` anchors, healthy direct media, no
  overflow, no framework overlay, and a clean console.
- **Hosted state:** no deploy, push, commit, hosted database mutation, contact
  submission, booking action, or purchase action is authorized or has run.
- **Exact next step:** Christian reviews local `/academy` and `/youth-club`;
  no hosted action is authorized.

## 2026-08-17 page simplification and MLA standings acceptance record

- **Package/status:** pathway Phase 1 About/Senior/UPSL refinement —
  complete and verified locally; uncommitted on `claude/mla-pathway`.
- **Completed work:** removed the requested About one-pathway hero/story,
  Senior hero/eyebrow, and UPSL hero/explainer/entry sections; preserved one
  semantic `h1` per route; centered the Senior coming-soon copy; and added the
  accepted Lions standings structure using independent MLA-owned rows and
  pathway colors.
- **Files:** the three route pages, their focused pathway components/content,
  `PathwayUpslStandingsTable.tsx`, `lib/queries.ts`, the MLA local seed, scoped
  pathway CSS, focused contracts/docs, and this plan.
- **Acceptance evidence:** the local seed reconciles one MLA settings row and
  nine MLA standings rows with zero hosted mutations. Focused contracts pass
  27/27; TypeScript, architecture 20/20, legacy 280/280, lint, build, and
  `git diff --check` pass. Full contracts are 763/764 and the complete local
  suite is 1244/1245 only because the existing date-sensitive Editorial
  fixture expects `Capital City Athletic` while the resolver now returns
  `Dayton Rovers SC`. Browser inspection at 1440x900 and 390x844 confirms the
  exact removals, one `h1` per route, the centered Senior heading, all nine
  table rows and MLA highlight, healthy direct media, no overflow, and a clean
  fresh console pass.
- **Review correction:** the final table audit found and fixed an intermediate
  breakpoint clipping risk by changing the 800px-and-below team track from a
  fixed 280px minimum to `minmax(0, 1fr)`. The contract now pins the exact
  order and statistics of all nine copied league rows and the flexible tablet
  grid before the 560px compact layout takes over.
- **Hosted state:** no deploy, push, commit, hosted database mutation, contact
  submission, or purchase action is authorized or has run.
- **Exact next step:** Christian reviews local `/about`, `/upsl`, and
  `/senior-club`; no hosted action is authorized.

## 2026-08-17 About editorial refresh acceptance record

- **Package/status:** pathway Phase 1 About visual refresh — complete and
  verified locally; uncommitted on `claude/mla-pathway`.
- **Completed work:** kept the shared inner hero, replaced the About route's
  generic split with a dedicated white one-club story and navy leader-letter
  sequence, preserved Christian's exact ordered seven-paragraph message, and
  normalized the supplied portrait to a versioned direct-delivery WebP.
- **Files:** `app/%5Fclubs/[slug]/about/page.tsx`,
  `components/pathway/PathwayAboutEditorial.tsx`, the About content block,
  scoped pathway CSS, About and media contracts/docs, and
  `public/images/pathway/about-leader-108a1c42.webp`.
- **Acceptance evidence:** focused About 5/5; combined About/Home/stage 12/12;
  TypeScript; architecture 20/20; legacy 280/280; lint; production build; and
  `git diff --check` pass. Browser inspection at 1440x900 and 390x844 confirms
  the direct 1149x1368 portrait, seven paragraphs, responsive stacking, zero
  fallbacks, and zero horizontal overflow. Independent final review found no
  blocking or functional issue.
- **Known blocker outside this package:** full contracts remain 759/760 and
  the complete local suite 1240/1241 only because the existing date-sensitive
  Editorial next-fixture expectation still names `Capital City Athletic`
  while the live resolver returns `Dayton Rovers SC`.
- **Exact next step:** Christian reviews local `/about`; no hosted action is
  authorized.

**Christian follow-up:** removed the decorative `2026` year treatment and its
empty supporting area. Desktop now uses equal portrait/letter columns whose
measured 857.23px bottoms align at 1440px; the complete letter fits within that
height. The supplied 2026 wording remains verbatim, and the responsive feature
stacks at 1180px before its long-form copy can exceed the portrait geometry.

## 2026-08-17 navigation, footer, merch, and Home polish acceptance record

- **Package/status:** pathway Phase 1 public-site polish — implementation
  complete and locally verified; rendered browser review pending; uncommitted
  on `claude/mla-pathway`.
- **Completed work:** added Home as the first of seven centered route links;
  raised the mobile transition to 940px; added the tenant crest and shared
  Powered by Onzio attribution to the footer; removed the requested Academy,
  Youth Club, and previous-schedule micro-headings; removed the Home secondary
  CTA; moved the expectation grid before the four-stage rail; removed the DIAZA
  orange top rule; and connected all four selected merch variants to their
  exact external DIAZA Buy Now destinations.
- **Desktop correction:** moved the Home story height contract onto the media
  column and made the portrait/fallback absolute-fill it, preventing expanded
  disclosures from exposing navy below the image.
- **Files:** Pathway nav/footer/merch components, content, Home route, scoped
  CSS, focused contracts/docs, and this plan.
- **Acceptance evidence:** focused contracts pass 28/28; legacy regressions
  pass 280/280; TypeScript; architecture 20/20; lint; production build; and
  `git diff --check` pass.
  Full contracts are 764/765 only because the existing date-sensitive
  Editorial fixture expects `Capital City Athletic` while the resolver returns
  `Dayton Rovers SC`. `npm test` was not an acceptance run because this sandbox
  blocks loopback Supabase (`EPERM 127.0.0.1:54321`).
- **Browser evidence:** pending. A fresh port bind and the existing tenant
  localhost were both denied by the app's automatic permission review; no
  alternate browser or network workaround ran.
- **Hosted state:** no deploy, push, commit, hosted mutation, external product
  navigation, form submission, booking action, or purchase action ran.
- **Exact next step:** Christian performs the local responsive visual pass;
  no hosted action is authorized.

## 2026-08-17 Home editorial carousel and Academy media acceptance record

- **Package/status:** pathway Phase 1 Home/Academy media refinement —
  implementation complete and locally verified; rendered browser review
  pending; uncommitted on `claude/mla-pathway`.
- **Completed work:** normalized all eight supplied 1080x1350 poster images and
  the supplied 1254x1254 Academy field photograph to versioned direct-delivery
  WebPs; placed the full-bleed carousel on About immediately after the leader
  letter; removed it from Home; and replaced the `Our Academy` media assignment
  with the new photograph.
- **Interaction/accessibility:** automatic rotation advances every 4.5 seconds
  with no visible caption or control chrome. Ordinary hover, focus, and pointer
  position do not pause it; reduced motion disables automatic and smooth
  movement. Touch scrolling plus ArrowLeft/ArrowRight/Home/End remain available, poster
  alt text summarizes embedded copy, and failures preserve the 4:5 frame.
- **Files:** `PathwayEditorialCarousel.tsx`, About/Home route composition and
  About content, Academy media
  content, scoped CSS, nine WebP assets, focused contracts/docs, and this plan.
- **Acceptance evidence:** focused contracts 24/24; TypeScript; architecture
  20/20; legacy 280/280; lint; production build; and `git diff --check` pass.
  Full contracts are 770/771 only because the pre-existing date-sensitive
  Editorial next-fixture expectation still names `Capital City Athletic`
  while the resolver returns `Dayton Rovers SC`.
- **Browser evidence:** pending because the app's automatic permission review
  blocked localhost browser access in the immediately preceding Pathway pass;
  no alternate browser/network workaround ran.
- **Hosted state:** no deploy, push, commit, hosted mutation, external
  navigation, form submission, booking action, or purchase action ran.
- **Exact next step:** Christian performs the local desktop/mobile review of
  `/about` and `/academy`; no hosted action is authorized.

## 2026-08-17 Diverse City-reference roster-card acceptance record

- **Package/status:** pathway Phase 1 UPSL roster visual refinement — complete
  and locally verified; uncommitted on `claude/mla-pathway`.
- **Completed work:** replaced the initial split crest/copy card with the
  supplied Diverse City hierarchy: flat white 3:4 field, full-card tenant
  crest, bottom white fade, large italic orange squad number, nationality
  flag, italic navy name, and compact uppercase position. The latest screenshot
  explicitly supersedes the earlier no-number direction, so default players
  display 1–22. Default players and staff use American placeholder
  nationalities; cards remain noninteractive and omit profiles, dialogs,
  statistics, biographies, and player photography.
- **Reference and responsive evidence:** inspected the current local Diverse
  City route plus its classic player/staff card source. An isolated render
  using MLA's real normalized crest and production card CSS was checked at
  1440x900 and 390x844; four-column desktop and two-column mobile cards retain
  the reference overlap without clipping. The local MLA tenant remains a
  private preview and anonymous traffic continues to fail closed.
- **Files:** Pathway roster component/content/CSS, focused roster contract,
  test documentation, this plan, and the repository handoff.
- **Acceptance evidence:** focused roster 5/5; combined Pathway
  roster/nav/stage/UPSL 28/28; architecture 20/20; legacy 280/280; TypeScript,
  lint, production build, and `git diff --check` pass. Full contracts are
  776/777 only because the unchanged date-sensitive Editorial fixture expects
  `Capital City Athletic` while the resolver returns `Dayton Rovers SC`. The
  local-only MLA seed reconciled with `hostedMutations: 0`.
- **Hosted state:** no hosted mutation, deploy, push, commit, form submission,
  booking action, external registration navigation, or purchase action ran.
- **Exact next step:** Christian reviews `/roster` through the private preview;
  no hosted action is authorized.
