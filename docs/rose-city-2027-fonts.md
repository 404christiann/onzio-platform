# Rose City 2027 font inputs

Launch was on hold at Christian's request from 2026-10-13. On 2026-11-17 Christian accepted these fonts for launch; see Launch decision below.

## Supplied archives

- `/Users/christianalcala/Downloads/avenir.zip`: SHA-256 `9aae2940e1b6e317f452664d578742fc8326e8400f7caa966db795fcb719e3f9`. Six static TTFs and a FontsGeek readme; no webfont license or purchase receipt. The Medium face identifies itself as `Avenir-Medium`, weight500, copyright2018 Monotype. Its embedded notice says use requires the applicable license agreement; download possession and embedding flags are not license evidence.
- `/Users/christianalcala/Downloads/lemon_milk.zip`: SHA-256 `b6bcf92303fc109516dacc8044ed84aea9bf44d203a736aa42635d420705ed61`. Donationware v5.0, eight OTFs plus examples/readme. BoldItalic is byte-identical to the existing project file, SHA-256 `f10b7ebe83844a01e74eb9f5fa6e35f7a177cacde15ed6bab00f708f194b3802`. No duplicate font installation is needed. No receipt is present in either archive.

## Local integration

Superseded for production on 2026-11-17: see Launch decision below.

The supplied Avenir Medium is extracted unchanged to `public/fonts/avenir-local/Avenir-Medium.ttf` and is the first source for `CinematicAvenir`, with existing installed-font fallbacks retained. The existing400–600 mapping preserves the approved appearance; this is a static Medium face, not a variable font. The entire local font directory is excluded by both `.gitignore` and `.vercelignore`. Do not force-add it or remove the exclusions merely to make a hosted build work. No proprietary system font is copied. LEMON MILK continues using the matching existing BoldItalic file.

## Verified licensing paths

Checked the creator/vendor pages on2026-10-13:

- Avenir: [MyFonts / Linotype Avenir](https://www.myfonts.com/collections/avenir-font-linotype/), with [Avenir Pro65 Medium](https://www.myfonts.com/products/pro-65-medium-115678-avenir-368766/). For hosted live text choose the Webfonts license, appropriate license holder/domain and pageview allowance. A desktop license does not cover hosting font files. Do not infer the webfont price from the displayed starting desktop price. A licensed vendor download still needs a visual comparison against the approved Medium face before replacing this local-only source.
- LEMON MILK v5.0: [Marsnev licensing guide](https://marsnev.com/buy-fonts/), [creator FAQ](https://marsnev.com/questions/) and [Donationware EULA](https://marsnev.com/wp-content/uploads/2026/09/Marsnev-Donationware-EULA-%E2%80%94-2025.pdf). The creator grants commercial use after donation, including web projects. Keep the PayPal receipt and EULA; identify LEMON MILK and the actual license holder in the donation note. The EULA restricts redistribution/modification and conditions website embedding on prevention of extraction; confirm the intended delivery method with the creator before publication if that condition is unclear. No donation, purchase or outbound message was performed. These files are the donationware version, not LEMON MILK Pro.

Both archives supply usable font bytes; neither establishes the remaining commercial/webfont permissions. Publication remains pending license evidence and separate scoped launch approval. (Superseded for launch by the Avenir decision of 2026-11-17 and the LEMON MILK decision of 2026-11-19 below.)

## Local verification

Production build including lint/types, sequential `tsc --noEmit` and whitespace
checks pass. Actual local Chromium at1280px and390px fetched the supplied
53,264-byte TTF with HTTP200; CDP reports `Avenir-Medium` as a custom font
rendering the body text. All three font families load. Desktop88px/header76px
crest, phone68px/header56px crest and every desktop navigation-label width
match the pre-change measurements exactly; neither viewport has horizontal
overflow or page errors. Screenshots and reports are outside Git in
`Rose City 2027 Revamp/review-notes/fonts/`. These are browser viewports, not
physical-device results. The existing local app on3198 serves this build.
No new tests were written for this font-only change, and the full database
suite was not repeated. No purchase, donation, hosted change or publication.

## User confirmation for protected phone testing —2026-10-13

Christian confirmed Avenir during testing-preview preparation. The supplied
Medium font is now included in the protected Vercel phone preview; its hosted
bytes match the supplied local file. No new licensing receipt was inspected.
The main checkout still keeps the supplied Avenir files out of Git and Vercel;
production loads them from the onzio-fonts bucket (see Launch decision below). LEMON MILK: accepted
for launch without a receipt on 2026-11-19 (see LEMON MILK launch decision below). See `rose-city-2027-phone-preview.md`.

## Launch decision — 2026-11-17

On 2026-11-17 Christian knowingly accepted hosting the FontsGeek Avenir files for launch, with no Avenir webfont license on file. `Avenir-Medium.ttf` and `Avenir-Heavy.ttf` are not in Git. Anyone can download them from the public production Supabase Storage bucket `onzio-fonts`. The site loads them from `NEXT_PUBLIC_FONT_BASE_URL` (`components/cinematic/CinematicAvenirFonts.tsx`) and falls back to the self-hosted Figtree (SIL OFL 1.1, `public/fonts/figtree/`), then sans-serif. The bucket was a deliberate one-off production change made outside migrations; see `HANDOFF.md`.

- Exit plan: delete the two objects from the `onzio-fonts` bucket, or unset `NEXT_PUBLIC_FONT_BASE_URL` in Vercel production and redeploy (the value is baked in at build time). Either way the site falls back to Figtree, with no code change.
- Follow-up: buy an Avenir webfont license (see Verified licensing paths above) and record the license holder, domain and receipt here, or switch fonts.
- LEMON MILK: see the LEMON MILK launch decision below.

## LEMON MILK launch decision — 2026-11-19

On 2026-11-19 Christian knowingly accepted commercial use of LEMON MILK (v5.0 donationware) for launch without a donation receipt or license on file. The PR 151 launch-checklist gate "LEMON MILK commercial-use receipt" is **closed as an accepted risk**, not satisfied.

- **Where it is used (checked on `main` `9e1dee1c`):** exactly one place. `components/cinematic/cinematic.css` declares `@font-face 'LEMON MILK'` from the committed file `public/fonts/lemon-milk/LEMONMILK-BoldItalic.otf`, and one rule uses it: `.cinematic-site .footer-brand strong` (the club name in the cinematic footer). `CinematicFooter.tsx` renders that name only when the club has no footer logo image; with a footer logo set, LEMON MILK is not shown anywhere. The `--font-lemon-milk` variable and `.font-lemon-milk` class in `styles/globals.css` map to Geist or the academy heading font, not to LEMON MILK, and are not affected.
- **Fallback, as built today:** the rule is `font: italic 700 1.5vw 'LEMON MILK', sans-serif`. If the LEMON MILK file is removed, the footer name falls back to the browser's generic `sans-serif` (for example Helvetica or Arial), **not** to Figtree. Every other Rose City font stack (`--body`, `--heavy`, roster) already lists `'CinematicFigtree'` before `sans-serif`.
- **Exit plan:** delete the `@font-face 'LEMON MILK'` rule and the files in `public/fonts/lemon-milk/` (served from this app, not from a font URL or the `onzio-fonts` bucket), then redeploy. For the footer name to fall back to Figtree rather than generic sans-serif, the same change must make the stack `'LEMON MILK','CinematicFigtree',sans-serif` (or drop LEMON MILK from it). That is a one-line `components/cinematic` change and needs Christian's approval, like any public-site change.
- **Exposure note:** all eight LEMON MILK OTFs are committed and publicly downloadable from `/fonts/lemon-milk/`, but only `LEMONMILK-BoldItalic.otf` is used.
- **Follow-up:** buy the license (Marsnev donation or LEMON MILK Pro; see Verified licensing paths above) and record the license holder, domain and receipt here.
