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
   | `training`        | `/book-training` | routes to the contact form in Phase 1            |
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
   no payment collection behind `numbered-steps`/`price-cards`, no scheduler behind the
   training CTA — both Phase 2+).

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
   - `defaultRoutes` (the nine top-nav items):
     `["home", "academy", "training", "youth-club", "senior-club", "league", "merch", "about", "contact"]`,
   - `supportedRoutes`: defaultRoutes + `["league-payments", "promo", "legal"]`,
   - `supportedModules: ["contact", "sponsors", "store", "affiliations"]`.

The `spec-list` "to be confirmed" state is a component-level contract, not a registry one
(configs are empty in Phase 1): type its rows as
`{ label: string; value: string } | { label: string; state: "tbc" }` in Step 5 so honest
unresolved club facts (e.g. Senior Club specifics) render as a first-class TBC treatment, never
fictional filler.

## Step 3 — Middleware route allowlist (`middleware.ts`)

Add to `PUBLIC_TENANT_PATHS`: `/academy`, `/book-training`, `/youth-club`, `/senior-club`,
`/upsl`, `/upsl-payments`, `/merch`, `/about`, `/winter-5v5`, `/privacy`.
(`/` and `/contact` are already present.) No dynamic patterns needed — all 12 MLA routes are
flat.

## Step 4 — Pathway shell and scoped styles

Following the `EditorialShell` precedent exactly:

- `styles/pathway.css` — all pathway styling scoped under a `[data-site-template="pathway"]`
  wrapper (mirror `styles/editorial.css`'s scoping so nothing leaks into other templates).
- `components/pathway/PathwayShell.tsx` — imports the css, renders
  `PathwayAffiliationBar` → `PathwayNav` → `<main>{children}</main>` → `PathwayFooter` inside
  the scoped wrapper. Geist is already on `<body>` via `app/layout.tsx`, so no font wiring.
- `components/pathway/PathwayAffiliationBar.tsx` — thin utility strip above the nav.
- `components/pathway/PathwayNav.tsx` — centered crest (from `useClubBranding()`, initials
  fallback like `Nav.tsx`) + hardcoded link array (the nine `defaultRoutes` hrefs — same
  hardcoded-array pattern as `lionsNavLinks`/`academyNavLinks()` in `components/Nav.tsx`, but
  living in the pathway shell) + one primary CTA ("Book Training" → `/contact`).
- `components/pathway/PathwayFooter.tsx` — Explore/Connect columns + legal line
  (link to `/privacy`).
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
- `PathwayInvertedFeature.tsx` — same shape, dark background (UPSL page).
- `PathwaySpecList.tsx` — label/value rows in 2 columns; row type
  `{ label; value } | { label; state: "tbc" }` with a distinct visible TBC treatment.
- `PathwayNumberedSteps.tsx` — ordered steps, each with a cost figure; informational only.
- `PathwayPriceCards.tsx` — training packages / merch kits; informational display, no checkout.
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
| `academy/`         | hero (left) + split-feature + spec-list + price-cards (training packages) |
| `book-training/`   | hero (left) + split-feature + CTA into `/contact` form               |
| `youth-club/`      | hero (left) + split-feature + spec-list                              |
| `senior-club/`     | hero (left) + spec-list (with `state: "tbc"` rows — genuinely undecided club facts) |
| `upsl/`            | hero (left) + inverted-feature + numbered-steps (entry/payment explanation, informational) |
| `upsl-payments/`   | numbered-steps + spec-list (informational; no payment collection)    |
| `merch/`           | hero (left) + price-cards (kits)                                     |
| `about/`           | hero (left) + split-feature                                          |
| `winter-5v5/`      | hero (left) + spec-list + CTA to `/contact`                          |
| `privacy/`         | legal-doc                                                            |

Existing shared routes:

- **Home** — `app/%5Fclubs/[slug]/page.tsx` currently always renders `HomePageClient`. Add a
  pathway branch *before* it: `if pathway@1 → <PathwayHome />` (hero centered + pathway-rail +
  partner-strip), leaving the existing return untouched.
- **Contact** — `app/%5Fclubs/[slug]/contact/page.tsx`: add a pathway branch ahead of the
  editorial/academy branches rendering `PathwayContactForm` (plus hero, left variant).
- **Sports-CMS routes** — MLA is not a sports-CMS site; `roster`, `schedule` (+ detail),
  `shop`, `sponsors`, `staff`, `stats`, `tryouts`, `programs` (+ detail), `club/about`,
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
5. "Book Training" CTAs route to `/contact` — no Acuity/scheduler integration (Phase 2).

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
      `http://manu-ledesma-academy.localhost:3000` load **all 12 routes**:
      `/`, `/academy`, `/book-training`, `/youth-club`, `/senior-club`, `/upsl`,
      `/upsl-payments`, `/merch`, `/about`, `/contact`, `/winter-5v5`, `/privacy`.
      Nine appear in the top nav; `/winter-5v5`, `/upsl-payments`, `/privacy` reachable by
      direct URL only.
- [ ] Home shows the centered hero + pathway rail; inner pages use the left hero variant;
      Senior Club renders visible TBC rows; UPSL steps and all price cards are display-only
      (no payment affordances anywhere).
- [ ] Contact form round-trip with `RESEND_API_KEY` set (real send received); with it unset,
      the API returns the explicit configuration error, not a fake success.
- [ ] Sports-CMS routes 404 for the MLA tenant: `/roster`, `/schedule`, `/shop`, `/sponsors`,
      `/staff`, `/stats`, `/tryouts`, `/programs`, `/club/about`.
- [ ] No-bleed regression: run the DCFC and editorial local imports and confirm their tenants
      render exactly as before (nav, fonts, homepage) — any pathway CSS or layout-branch leak
      shows up here (the "Rose City hero flash" class of bug).
- [ ] Naming guard: `grep -ri "metro" <new files>` empty; no new file, slug, or identifier
      uses the superseded working name; template/club naming matches the locked names above.
- [ ] **Checkpoint: Christian's visual review of all 12 routes locally before any Phase 2
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
