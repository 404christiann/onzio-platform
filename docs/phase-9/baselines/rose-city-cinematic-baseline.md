# Rose City Cinematic Baseline

Captured: 2026-07-29
Source: current `onzio-platform` Rose City public renderer after Phase 8 closeout.
Template target: `cinematic@1`

## Routes

- `/`
- `/roster`
- `/schedule`
- `/shop`
- `/club/about`
- `/club/logo`

## Desktop Baseline

- Header: black fixed chrome, Rose City crest, affiliation marks, uppercase display navigation, red accent.
- Hero: full-bleed media-led opening, dark overlay, shop and roster actions, mobile scroll hint hidden on desktop.
- Homepage rhythm: next match, standings, sponsors, roster/storytelling, shop kit, slideshow, and footer bands.
- Typography: compressed uppercase display face for commands/headings and readable sans body copy.
- Imagery: raw normalized media URLs for published media; no Supabase runtime Image Transformations and no required Next image optimizer dependency.
- Motion: GSAP hero CTA reveal, slideshow mount/reveal, sponsor motion, and resilient media fallbacks.

## Mobile Baseline

- Header collapses to the mobile drawer, with independent drawer scroll and safe-area-aware footer reachability.
- Hero remains full viewport height with the scroll hint visible.
- Public content stacks into single-column scan order without horizontal overflow.
- Roster cards and player modal maintain positive image dimensions or intentional initials fallback.

## Extraction Constraints

- Preserve the current visual output during initial `cinematic@1` extraction.
- Move Rose City presentation behavior behind neutral template registration instead of hard-coded `rose-city` checks.
- Keep the current video compatibility path only as a documented tenant-content/media input until video receives a separate v1 plan.
- Components must consume semantic presentation tokens instead of raw club color fields.
