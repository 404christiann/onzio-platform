# Diverse City FC Phase 4 Rollout Input and Approval Manifest

Epic: `DCFC-EPIC-002`

Package: `DCFC-404`

Status: `locked_with_hosted_inputs_deferred`

Last updated: 2026-08-01

## Scope and Authorization

This manifest closes the local Phase 4 input lock. It is not a staging or
production runbook, does not make `DCFC-501` eligible, and authorizes no hosted
read, credential access, resource creation, mutation, commit, push, or deploy.

Christian approved the Phase 4-only goal and the corrected production
content/media baseline, and confirmed the retained facts and publication
rights on 2026-08-01. The goal's explicit stop before the first rollout
package is recorded here as a deliberate deferral of every hosted-environment
input that was not supplied. No hostname, recipient, billing identifier, DNS
owner, launch date, or observation duration is invented.

## Locked Local Artifact

| Input | Locked value/evidence |
| --- | --- |
| Approved snapshot commit | `5bbdfa33d59163b218bbd33745f9cfd4a66d379f` |
| Local tenant ID | `5f5e7793-53bc-592f-907a-615bf8b47b54` |
| Local tenant slug/host | `diverse-city` / `diverse-city.localhost` |
| Plan artifact | `diverse-city-local-import-plan.json` |
| Semantic plan digest | `63d1867685c59c7dee3ce2cedda9e8400dae73d930d2488a601bdec5fae9fa36` |
| Byte-level plan file SHA-256 | `87efae9701f6e1fa4653a55f2687206f3370306bd900d83ee30352849b78702b` |
| Replayed tenant-state digest | `b595fc81773ed47bd4d4976d45f533e1e1494ad4089514ac6c5567e27fc4376d` |
| Content approval | Christian Alcala, 2026-08-01 |
| Media-rights/current-facts approval | Christian Alcala, 2026-08-01 |
| Video disposition | Exclude both MP4s/posters; crest-led hero; vertical story hidden (`DCFC-D114`) |
| Hosted mutations | `0` |

The planner produces the same semantic digest and byte-level file checksum on
independent runs. The plan retains 10 approved assets, excludes 32 sources,
and contains no hosted destination or secret.

## Reconciliation Lock

| Evidence | Accepted local result |
| --- | --- |
| Media assets / source checksums | 10 / 10 |
| Programs | 4 |
| Tryouts / players / staff / matches / standings | 0 / 0 / 0 / 0 / 0 |
| Sponsor placements | 2 references to one approved Elsa's Bakery asset |
| Shop kit / carousel references | 4 / 2 references to two approved jersey assets |
| Presentation documents | 1 published `academy@1` document |
| Composite relationships | 15 |
| Forbidden references | 0 |
| Initial import / identical replay | same state digest; idempotent |
| Tenant-scoped reset / replay | 10 objects and only the Diverse City tenant removed; same digest restored |
| Existing tenant isolation | Alpha and Bravo baseline unchanged |
| Browser acceptance | 2/2 desktop/mobile public and AAL2 admin scenarios |

## Production Content Lock

- Keep the approved About, four Programs, Contact, Elsa's Bakery, crest, and
  contact-to-order Shop content.
- Publish no Tryouts, roster, staff, fixture, standings, sponsor-opportunity,
  temporary Google destination, price, stock, sizing, checkout, or
  availability facts.
- Retain Roster, Schedule, Tryouts, and empty tenant content only through the
  verified reusable tenant-safe empty states.
- Deliver normalized media through tenant-scoped UUID paths without Supabase
  Image Transformations or `/_next/image`.
- Keep registration, payments, waivers, medical/signature records, and
  participant data outside Onzio.

## Explicitly Deferred Hosted Inputs

| Decision/input | Phase 4 disposition | Eligibility consequence |
| --- | --- | --- |
| `DCFC-D112`: staging/production hostname set, canonical behavior, DNS owner/provider | Not supplied; explicitly deferred outside this goal | `DCFC-501` remains blocked |
| `DCFC-D113`: owner/admin recipients and roles | Not supplied; identity details must remain outside Git | `DCFC-501` remains blocked; reapprove before invitation work |
| `DCFC-D115`: exact existing live Pro Price, terms, and billing owner | Deferred to production go/no-go; no Stripe read occurred | Billing packages remain blocked |
| `DCFC-D116`: launch window, rollback authority, observation duration | Deferred; no date or duration selected | Launch packages remain blocked |
| `DCFC-D117`: indexing approval | Deferred; `noindex, nofollow` remains mandatory | Indexing remains blocked |

These deferrals are fail-closed decisions, not missing Phase 4 implementation
details. Before `DCFC-501` can be assigned, Christian must approve a revised
manifest containing the exact safe staging inputs and separately authorize the
read-only hosted preflight. Later production, billing, DNS, launch, rollback,
and indexing packages retain their own fresh approvals.

## Final Boundary

`DCFC-401` through `DCFC-404` are complete. Stop here. Do not inspect staging,
open hosted credentials, or begin `DCFC-501` from this manifest.
