# Deportivo Heritage Baseline

Captured: 2026-07-29
Source: read-only local approved snapshot at `/Users/christianalcala/Downloads/onzioProspects/deportivo-olimpico/site`.
Template target: `heritage@1`

## Routes

- `/`
- `/roster`
- `/schedule`
- `/standings`
- `/stats`
- `/club`
- `/sponsors`
- `/store`
- `/tryouts`

## Starter Behavior

- The artifact supports a `?tier=starter` selector state.
- Starter hides Pro-only modules while preserving the sales snapshot's visual shell.
- Unavailable areas stay represented by the mockup's sample-only tier messaging, not production content writes.

## Pro Behavior

- The artifact supports a `?tier=pro` selector state.
- Pro exposes the richer module set, including the operator-demo areas for tryouts, standings, sponsorship, store, and analytics-style presentation.
- The approved mockup remains a sample-only snapshot and is not production authority.

## Desktop Baseline

- Heritage identity is crest-led, typographic, and structured rather than dependent on a deep real-photo library.
- Header/footer chrome, route grouping, and section rhythm are distinct from the Rose City cinematic renderer.
- Visual language uses the approved Deportivo snapshot assets and mockup content only inside the artifact/protected preview boundary.

## Mobile Baseline

- Routes remain reachable through compact navigation.
- Starter and Pro selector states remain shareable and reversible.
- Cards and public sections stack without horizontal overflow.

## Extraction Constraints

- Port the visual language as neutral `heritage@1`, not as a Deportivo-specific production branch.
- Replace `MockDataProvider` and hard-coded prospect state with semantic content-domain inputs.
- Keep sample placeholders out of normalized production tables and published presentation documents.
