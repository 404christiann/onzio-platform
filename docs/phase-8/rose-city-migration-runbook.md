# Phase 8 Rose City Migration Runbook

Last updated: 2026-07-28

## Current Phase 8 closeout state

Phase 8 is functionally complete. Rose City is live at
`https://onzio-rcfc.vercel.app` on production deployment
`dpl_6QBiJ2CAN6opoNQJqVuxU3Q1YbrG`.
`rosecityfutbolclub.com` and `www.rosecityfutbolclub.com` have been removed
from Vercel and are retired routing inputs. Production tenant routing,
Supabase Auth callbacks, and Stripe webhook
`we_1TwEpdK6WajTkwHYD5SEYzXX` now use `onzio-rcfc.vercel.app`.

`info@rosecityfutbolclub.com` was permanently removed from production Auth and
Rose City membership. `christianjavieralcala@gmail.com` is the sole active
Rose City owner. Production and staging use distinct Resend credentials for
custom Supabase Auth SMTP through verified `auth.onziofutbol.com`; the
production delivery, recovery, password, MFA, and protected-admin gate passed.
The built-in Supabase mailer is not the active production sender.

Production image monitoring passes desktop and iPhone in normal and forced
image-origin-outage modes. The `main` and `staging` deployed file trees are
identical; the focused domain commits are `10559e5` on `main` and `7c85567` on
`staging`.

The 7–14 day rollback observation period is complete. Under Christian's final
explicit approval, the content freeze was released at
`2026-07-29T01:37:37Z`, legacy Vercel project `rose-city-website`
(`prj_lMYzzUcUxR1iFwYTQZW71OYsgbv5`) was permanently deleted, and legacy
Supabase project `Rose City Website` (`nsgtkwqkbyxkiwrhzsje`) was permanently
deleted. There is no hosted rollback target. Recovery depends on the restricted
off-repository final frozen export.

The one-time production import command is permanently retired and fails before
reading credentials, plans, or identity inputs. Historical cutover values
remain in the repository only as immutable audit evidence.

## Operational closeout evidence — 2026-07-28

The final frozen package at
`/Users/christianalcala/Downloads/onzio-migration-private/rose-city-final-freeze-2026-07-27T2234Z-v2`
was validated immediately before deletion:

- all 586 entries in `checksums.sha256` pass
- manifest status: `complete`
- final frozen cutover artifact: true
- source project: `nsgtkwqkbyxkiwrhzsje`
- database: 24/24 tables and 209 rows
- Storage: 14 buckets, 557 objects, and 1,728,725,700 bytes
- Auth: three minimized users
- production mutations during export: zero
- export secret scan: passed with zero hits

Final non-secret hosted inventory:

- Vercel team: `404christiann's projects` (Hobby)
- Vercel project: `rose-city-website`
- Vercel project ID: `prj_lMYzzUcUxR1iFwYTQZW71OYsgbv5`
- final immutable deployment:
  `rose-city-website-lb8jlqe33-404christianns-projects.vercel.app`
- final Vercel alias: `rcfc-soccer-website.vercel.app`
- former Rose City custom domains: already absent
- Supabase organization: `404DB` (Pro)
- Supabase project: `Rose City Website`
- Supabase ref: `nsgtkwqkbyxkiwrhzsje`
- Supabase region: `us-east-1`, East US (North Virginia)

Post-deletion verification:

- immutable legacy Vercel deployment: HTTP 410
- final legacy Vercel alias: HTTP 404
- legacy Supabase hostname: no longer resolves
- current `https://onzio-rcfc.vercel.app`: HTTP 200
- current Supabase ref `ioalthwsdrlzrubomrow`: reachable and excluded from
  deletion

The abandoned-media schedule is prepared in the repository:

- route: `GET /api/cron/media-cleanup`
- cadence: daily at `10:00 UTC`
- authentication: exact `Authorization: Bearer $CRON_SECRET`
- Production-only sensitive `CRON_SECRET`: configured in Vercel without
  recording its value
- cleanup threshold: staging objects older than 24 hours
- failure signal: HTTP 500 for incomplete or failed cleanup
- dry-run evidence: the Phase 7 hosted media verifier previously removed only
  its scoped synthetic abandoned object
- rollback: remove the `vercel.json` cron entry and route in a reviewed
  deployment; existing media data is not recreated automatically
- activation: pending a separately approved production deployment because
  Vercel installs cron schedules only from production deployments
- staging evidence: commit `7910d44` built successfully as ready Preview
  `onzio-rcfc-185ofdb7v-404christianns-projects.vercel.app`
- production isolation: production still runs commit `10559e5` on deployment
  `dpl_6QBiJ2CAN6opoNQJqVuxU3Q1YbrG`
- activation evidence: Vercel's Cron Jobs feature is enabled, but the dashboard
  remains in its initial setup state with no installed jobs

## Historical cutover and incident record

Everything in this section records the state and decisions at the time of the
2026-07-27 cutover and subsequent acceptance work. References to the former
custom domains, the removed `info@rosecityfutbolclub.com` identity, the
built-in mailer, or a pending rollback observation window are historical
evidence—not current configuration or instructions to restore them.

The controlled production cutover is complete and accepted. Christian relayed
the administrator no-edit acknowledgement and the freeze began at
`2026-07-27T22:34:39Z`. The production credential incident is contained.
Rose City apex and `www` now serve Onzio production deployment
`dpl_75xrhi27MCgA5UDsQ6RhT6Ak4xrN`, which is `READY`. The unchanged legacy
deployment and database remain read-only as the rollback target for 7–14 days,
and the no-edit freeze remains active during that observation window.

The Rose City owner recovery attempt exposed the built-in Supabase mailer's
two-email-per-hour project limit. Production Auth email must move to Resend SMTP
before the freeze is released. The documentation-only rollout, security,
verification, cost, and rollback gates are in
`docs/phase-8/resend-smtp-rollout.md`. Read-only inspection confirmed the
existing Resend Free team is administered by
`christianjavieralcala@gmail.com`. Christian completed Resend MFA enrollment,
and its enabled state was verified read-only without inspecting authenticator
or recovery material. Under separate approval and based on stale architecture
documentation, `auth.onzio.com` was added as Resend domain
`9b89e2f5-c372-4785-9091-cb852e3a3d44` in North Virginia. Christian then
clarified that he does not own `onzio.com`; the owned domain is
`onziofutbol.com`, whose authoritative DNS is hosted by Vercel. Under explicit
correction approval, the erroneous entry was deleted and
`auth.onziofutbol.com` was added as Resend domain
`7514696d-f0be-453c-bf79-ff68d8dbdeb1` in North Virginia with sending enabled
and receiving disabled. Under separate DNS approval, Vercel published the
generated DKIM, return-path MX, SPF, and monitoring-only DMARC records.
Authoritative lookup returned all four exact values, and Resend now reports the
domain `verified` and ready to send. Under separate approval, one sending-only
credential restricted to `auth.onziofutbol.com` was created and installed only
in `Onzio Platform Staging`. Staging custom SMTP is enabled with sender
`Onzio Staging <staging@auth.onziofutbol.com>`, a 60-second per-user interval,
and the planned 30-email/hour rate limit. Production custom SMTP remains
disabled at the built-in 2-email/hour limit. Under separate test approval,
staging sent invitations to `christianalcala3@yahoo.com` and
`calcala1@berkeley.edu`, then sent Berkeley recovery after the 60-second
cooldown. Resend reports all three messages `delivered`; no body, link, token,
or mailbox content was opened during provider inspection. Christian confirmed
both mailbox providers received the messages. The dashboard-generated Berkeley
recovery then failed with Vercel staging protection plus Supabase
`access_denied` / `otp_expired`; no password changed. The next acceptance test
must start from the Onzio staging `/admin/login` recovery form after Christian
authenticates to the protected Vercel deployment, using Yahoo first to isolate
Berkeley link scanning. The Berkeley invitation separately confirmed the
temporary identity but was intercepted by Vercel Authentication and ended on a
Not Found page. Its implicit-flow action URL was accidentally exposed during
troubleshooting; the exact staging session was immediately deleted and a
separate query verified zero matching session and refresh-token rows. The
temporary user remains without membership or a tenant role. The already-issued
signed access JWT retains only its original one-hour lifetime and cannot
refresh. A replacement email requires explicit approval and must not be sent
until the application callback avoids bearer credentials in the URL fragment.
No production SMTP, Auth identity, session, template, credential, email, or
production-secret mutation occurred.

Christian granted explicit approval for the Onzio production provisioning and
Rose City import gate at `2026-07-27T23:00:09Z`. An isolated temporary
Supabase workdir was linked to the exact production ref without changing the
repository's staging link. The ten reviewed migrations were applied and now
match local/remote history. The authoritative frozen plan imported 209 source
rows, 515 immutable media assets, two approved Auth/member identities, and two
Rose City domains. Exact destination counts reconcile. The separately approved
Stripe reconciliation now projects Rose City as `active` plus `live` with one
active Pro row in `club_subscriptions`; public traffic now uses Onzio.

Christian Javier Alcala is the recorded administrator. The production identity
mapping is:

- `christianjavieralcala@gmail.com`: owner and Onzio operator
- `info@rosecityfutbolclub.com`: Rose City owner
- `calcala1@berkeley.edu`: explicitly excluded; not added

Production Auth has leaked-password protection, TOTP MFA, and a 15-minute AAL1
session limit enabled. The Data API explicitly exposes the `onzio` schema and
all 32 tables behind their checked-in grants/RLS, keeps `onzio_private`
unexposed, and disables automatic exposure of future tables. The one-time
`phase8_migration` key was revoked after reconciliation; it returns HTTP 401,
and its local key material was deleted.

The approved live Stripe inventory and reconciliation are complete. They
confirmed:

- customer `cus_UwVpy1YlirV3li` with billing email
  `info@rosecityfutbolclub.com`
- active subscription `sub_1TwcndK6WajTkwHYH1VuFgrG`, automatic collection,
  not scheduled to cancel, current period ending 2026-08-23 23:41:35 PDT
- grandfathered Rose City Pro Price `price_1TwbmvK6WajTkwHYueLvjhv5` at
  $75 USD/month
- standard Starter Price `price_1Tw8RjK6WajTkwHYcTsgHNGc` at $65 USD/month
  and standard Pro Price `price_1Tw8S7K6WajTkwHYcyQ3zjgK` at $99 USD/month
- preserved live webhook `we_1TwEpdK6WajTkwHYD5SEYzXX`, API version
  `2026-06-24.dahlia`, listening to the exact seven required events
- only the approved Onzio club/environment metadata on the live customer and
  subscription; no metadata change to the grandfathered Price
- three historical HTTP 308 webhook failures followed by three manual HTTP 200
  recoveries for the same Checkout event

The approved reconciliation added only
`onzio_club_id=32ceba0b-4e25-52c2-bb6b-d82fb87637a7` and
`onzio_environment=production` to the preserved customer and subscription.
Canonical event `evt_1Txzz4K6WajTkwHYBzaweVRI` projects the same customer,
subscription, and grandfathered Price as active Pro, paid through
2026-08-23 23:41:35 PDT. The immutable production ledger records it as
`applied`; runtime access resolves to `live`. After cutover, a canonical resend
returned HTTP 200 and left exactly one applied ledger row. No Price, amount,
payment method, billing cadence, webhook ID, or subscription ID changed.

Production target metadata was resolved once through the authenticated
Supabase CLI:

- organization: `404DB` (`zmvjbvoraowhwbkwwtse`)
- project: `Onzio Platform Production`
- project ref: `ioalthwsdrlzrubomrow`
- region: `ca-central-1`
- health: `ACTIVE_HEALTHY`
- compute: Micro
- organization plan: Pro

The authenticated Supabase Dashboard and CLI were used for read-only preflight
on 2026-07-27. They confirmed:

- the project remains `ACTIVE_HEALTHY`
- the `public` schema contains no tables
- there is no migration history
- there are no Auth users
- there are no Storage buckets
- scheduled daily database backups are available under the Pro plan
- the project usage view shows no disk overage and an 8 GB provisioned disk

The repository remains linked to staging. Only the isolated temporary workdir
was linked to production.

## Read-only rehearsal export

Christian authorized the Rose City production database/Auth/Storage export and
data egress for the local rehearsal on 2026-07-27. The guarded exporter wrote
the restricted package outside Git at:

```text
/Users/christianalcala/Downloads/onzio-migration-private/rose-city-rehearsal-2026-07-27T2057Z
```

This is a live-source rehearsal snapshot, not the final cutover export. No
content freeze was requested or performed. The exporter allowed `GET`, `HEAD`,
and only the Storage API's semantically read-only object-listing `POST`
endpoint; all other methods and every non-Rose-City host were rejected.

Verified package evidence:

- 24/24 discovered application tables exported with stable before/after counts
- 209 total database rows
- 3 Auth identities with minimized identity and MFA-factor state only
- no password hashes, sessions, refresh tokens, or MFA secrets exported
- 14 Storage buckets and 557/557 objects downloaded
- 1,728,725,700 source bytes
- 132 database-to-Storage references, all resolved
- 10/10 source relationship checks passed
- 0 duplicate primary-key groups
- credential scan passed
- 586/586 package checksums passed an independent SHA-256 verification
- every package directory is mode `0700` and every file is mode `0600`

Reusable commands:

```bash
npm run migration:export:rose-city -- \
  /absolute/path/to/rose-city/.env.local \
  /absolute/private/output-directory \
  --authorize-read-only-export=rose-city-production

npm run migration:reconcile:rose-city -- \
  /absolute/private/output-directory
```

## Credential safety incident

On 2026-07-27, the installed Supabase CLI returned complete legacy JWT keys
from `supabase projects api-keys` even though `--reveal` was not supplied. The
legacy production service-role credential therefore appeared in the local tool
transcript.

The incident was contained on 2026-07-27 under Christian's explicit approval:

1. The legacy `anon` and `service_role` API keys were disabled.
2. The project retained its modern publishable/secret API-key pair.
3. The previous legacy HS256 signing key was revoked so the exposed
   service-role JWT is no longer trusted.
4. The current signer is ECC P-256.
5. The project usage view was inspected and showed no disk overage.

Do not reuse the exposed legacy credential. Keep all replacement credentials
outside the repository and transcripts.

## Local implementation

`lib/migration/rose-city-transform.ts` is a pure preflight and transformation
boundary. It performs no network or filesystem writes and:

- attaches the Rose City `club_id` to all transformed records
- converts relationship keys such as `playerId` and `matchId` to database
  snake case
- validates player/match references before import
- rejects duplicate source row identities and duplicate media source paths
- reconciles declared source counts
- rejects missing, corrupt, or checksum-mismatched media
- rejects traversal and ambiguous media paths
- creates deterministic UUID-versioned `onzio-media` paths
- never emits Supabase Image Transformation URLs
- preserves the existing Stripe subscription ID
- returns the same result and source digest for the same source manifest

The transformer produces a reviewed import plan. It does not apply that plan to
any database or Storage project.

## Complete source mapping and offline media checkpoint

The complete 24-table planner is implemented in
`lib/migration/rose-city-plan.ts` and
`scripts/plan-rose-city-import.ts`. It accepts only absolute private paths,
refuses repository-contained source/output paths, performs no network calls,
revalidates the complete source checksum ledger, and writes private artifacts
with `0700` directories and `0600` files.

The planner uses stable UUIDv5-shaped identifiers derived from the Rose City
club, source table, source identity, and media checksum. It maps every source
table as follows:

| Legacy source | Onzio destination | Transformation |
| --- | --- | --- |
| `about_page_content` | `about_page_content` | singleton keyed by `club_id`; feature media becomes an asset reference |
| `behind_the_rose_section` | `behind_the_rose_section` | singleton keyed by `club_id`; external video URL remains content, not a media asset |
| `club_logo_page_content` | `club_logo_page_content` | singleton; top-level and nested Storage URLs become versioned media references |
| `goalkeeper_match_stats` | `goalkeeper_match_stats` | deterministic ID; player/match IDs remapped; legacy stat aliases reconciled |
| `goalkeeper_season_stats` | `goalkeeper_season_stats` | composite club/player/season identity preserved |
| `homepage_slideshow_photos` | `homepage_slideshow_photos` | deterministic IDs and versioned homepage assets |
| `homepage_slideshow_settings` | `homepage_slideshow_settings` | singleton keyed by `club_id` |
| `league_standings` | `league_standings` | deterministic IDs and logo asset references |
| `league_standings_settings` | `league_standings_settings` | singleton keyed by `club_id` |
| `matches` | `matches` | deterministic IDs; season/opponent/sponsor relationships and media preserved |
| `player_match_stats` | `player_match_stats` | deterministic IDs; player/match IDs remapped; legacy aliases reconciled |
| `player_photos` | `player_photos` | deterministic IDs; player and media references remapped |
| `player_season_stats` | `player_season_stats` | composite club/player/season identity preserved |
| `players` | `players` | deterministic IDs and roster asset references |
| `seasons` | `seasons` | deterministic IDs; active season preserved |
| `shop_carousel_photos` | `shop_carousel_photos` | deterministic IDs and shop asset references |
| `shop_kit_photos` | `shop_kit_photos` | deterministic IDs; surface/variant and media preserved |
| `shop_kit_section` | `shop_kit_section` | deterministic IDs; surface/variant content preserved |
| `shop_purchase_details` | `shop_purchase_details` | singleton keyed by `club_id` |
| `site_branding` | `site_branding` | singleton; crest path becomes a versioned asset/path |
| `site_social_links` | `site_social_links` | legacy text IDs and ordering preserved within the tenant |
| `site_sponsor_logos` | `site_sponsor_logos` | deterministic IDs and sponsor asset references |
| `staff` | `staff` | deterministic IDs and roster asset references |
| `stripe_subscription` | `club_subscriptions` | same customer/subscription IDs; local-only Price placeholder; no Stripe call |

The plan also creates the deterministic Rose City club and local
`rose-city.localhost` domain. The three minimized source Auth identities are
used only as a reconciliation count. They are not copied. The future local
import creates separate `owner@rose-city.localhost` and
`admin@rose-city.localhost` identities from an environment-supplied local
password, with no source password/session/factor data and mandatory new MFA
enrollment.

Every source field receives an explicit disposition in the private mapping
ledger. In particular:

- `minutes`, `yellow_cards`, `red_cards`, and `clean_sheet` are legacy aliases
  used only when their canonical Onzio fields are absent.
- `score_ours` and `score_them` are fallbacks for
  `rose_city_score` and `opponent_score`.
- legacy match aggregates without Onzio columns (`passes_ours`,
  `passes_them`, `shots`, `shots_on_goal`, `offsides`, `fouls`, and
  `gk_saves`) remain listed as intentional legacy-only exclusions.
- legacy match-stat fields without Onzio columns (`ck`, `dfk`, `pk`, and
  `shots`) remain listed as intentional legacy-only exclusions.
- singleton legacy `id` values are replaced by `club_id` because the Onzio
  singleton tables use the tenant as their primary key.

### Approved offline media exception and final plan

Christian approved a migration-only offline pre-normalization exception for
the exact 16 referenced PNG inputs that exceeded the Phase 4 raw byte or
dimension limits. This approval does not change browser-upload policy.

The exception is fail-closed behind
`--allow-approved-rehearsal-input-limit-pre-normalization`. It requires exactly
the reviewed 16 referenced files and refuses any corrupt, signature, MIME,
GIF, video, executable, or unreferenced exception. Before ordinary Phase 4
normalization:

- approved photographs are decoded only below 36 MP, orientation-corrected,
  resized to a 2400 px long edge, and emitted as WebP quality 82
- approved transparent graphics are decoded only below 36 MP, resized within
  3000 px, and emitted as the smaller safe optimized PNG/WebP

Two independently generated final plans are outside Git at:

```text
/Users/christianalcala/Downloads/onzio-migration-private/rose-city-plan-2026-07-27-approved-c
/Users/christianalcala/Downloads/onzio-migration-private/rose-city-plan-2026-07-27-approved-d
```

Both plans have:

- source digest
  `e7763db3b37022a74b479ef5d421058bc31f2eaeaafe36bdcc8e1dafb6938226`
- plan digest
  `e826f49771773ad2415ec6b52fe47c6d311750f10e5be31e6fdace4a8d349c13`
- 24/24 mapped source tables and 209 source rows
- 557/557 classified source objects
- 122 unique referenced objects and zero referenced exclusions
- 515 deterministic normalized/importable assets
- 42 explicitly excluded unsupported, corrupt, video, or placeholder objects
- 16 exact approved migration-only input pre-normalizations
- all directories are mode `0700` and all files are mode `0600`

The unreferenced MP4 is inventoried and intentionally not transcoded or
imported. It does not require a video architecture change because no database
row references it.

## Completed local import, render, and rollback rehearsal

`scripts/import-rose-city-local.ts` accepts only an absolute private plan path
outside the repository and loopback Supabase API/Postgres endpoints. It
revalidates the complete private checksum ledger before work. Its apply mode:

1. creates separate local-only owner/admin Auth identities from
   `ROSE_CITY_LOCAL_PASSWORD`
2. copies no source password, session, refresh token, MFA secret, or factor
3. requires both local admins to complete new MFA enrollment
4. uploads/checksums all 515 immutable `onzio-media` objects
5. imports the database plan within a real PostgreSQL transaction
6. compensates newly created Auth/Storage artifacts if the transaction fails
7. reconciles every table count and composite player/match relationship

The imported Rose City club ID is
`32ceba0b-4e25-52c2-bb6b-d82fb87637a7`; the local domain is
`rose-city.localhost`. All 209 source rows projected into the 24 destination
content/billing tables, and all 515 `media_assets` rows reconciled.

Public browser acceptance passed for `/`, `/roster`, `/schedule`, `/shop`,
`/club/about`, and `/club/logo`. There were no broken images, legacy
`logos_v2`/`flags` URLs, or `/storage/v1/render/image/` URLs. The local owner
completed password sign-in and fresh TOTP MFA, loaded the protected dashboard,
updated the About title, and restored the exact original value.

The admin mutation check exposed and fixed one real boundary defect: raw
select responses included `club_id`, which the browser copied back into
upserts and the server correctly rejected. The admin client now removes tenant
identity before mutation; the server continues to inject the verified club and
reject directly supplied tenant identity.

Rollback mode removed exactly 515 Rose City objects, both local-only Auth
users, and Rose City tenant rows. `rose-city.localhost` returned 404 while
Alpha remained 200. Applying the same immutable plan twice restored identical
table/media counts and the same plan digest, proving reset/replay and
idempotency.

Reusable local commands:

```bash
npm run migration:plan:rose-city -- \
  /absolute/private/export \
  /absolute/private/plan \
  --allow-approved-rehearsal-input-limit-pre-normalization

npm run migration:import:rose-city -- \
  /absolute/private/plan \
  --mode=apply

npm run migration:reset:rose-city -- \
  /absolute/private/plan \
  --mode=reset
```

## Final frozen source and cutover-plan evidence

The authoritative final frozen source package is outside Git at:

```text
/Users/christianalcala/Downloads/onzio-migration-private/rose-city-final-freeze-2026-07-27T2234Z-v2
```

Its manifest records:

- kind `rose-city-final-frozen-export`
- `frozenSource: true`
- `finalCutoverArtifact: true`
- freeze start `2026-07-27T22:34:39Z`
- administrator no-edit acknowledgement relayed by Christian Alcala
- exporter start `2026-07-27T22:43:45.188Z`
- exporter completion `2026-07-27T22:46:25.997Z`
- zero production mutations

Final evidence:

- 24/24 tables, 209 logical application rows, and stable before/after counts
- 3 minimized Auth identities with identical before/after digest
- 14 buckets, 557 objects, and 1,728,725,700 Storage bytes
- 585/585 independent package checksums
- 10/10 relationship checks
- 132/132 database-to-Storage references; zero missing
- zero runtime Image Transformation references
- passed credential scan

The Rose City source project reports a completed physical database backup at
`2026-07-27T11:06:22.739Z`. Supabase reports physical backups enabled and PITR
disabled. The frozen package is the separate current logical application and
Storage backup; Storage bytes are not contained in the database backup.

The two authoritative cutover plans are:

```text
/Users/christianalcala/Downloads/onzio-migration-private/rose-city-cutover-plan-2026-07-27-a
/Users/christianalcala/Downloads/onzio-migration-private/rose-city-cutover-plan-2026-07-27-b
```

They are byte-identical, both checksum ledgers pass, and both record:

- source digest
  `e7763db3b37022a74b479ef5d421058bc31f2eaeaafe36bdcc8e1dafb6938226`
- plan digest
  `e826f49771773ad2415ec6b52fe47c6d311750f10e5be31e6fdace4a8d349c13`
- 24 source tables and 209 source rows
- 557 source objects, 122 referenced objects, and zero referenced exclusions
- 515 importable normalized assets and 42 explicit exclusions

These digests exactly match the approved rehearsal, proving no source drift.
The earlier private directory
`rose-city-final-freeze-2026-07-27T2234Z` and plans derived from it are
superseded because the original exporter hardcoded non-frozen metadata. Do not
use those superseded artifacts for cutover.

## Required inputs before hosted migration

Keep all credentials outside Git and chat transcripts.

- Onzio production database access; completed through the isolated workdir
- final frozen Rose City database export; complete
- final frozen Auth identity mapping; complete
- final frozen Storage inventory/object download; complete
- final frozen media checksums; complete
- exact Rose City production domain and Vercel project/deployment identifiers;
  complete
- existing Stripe customer, subscription, Price, and webhook identifiers;
  read-only inventory complete
- dedicated least-privilege restricted live Stripe runtime key installed;
  actual new webhook signing secret remains pending
- explicit operator UUID allowlist for production; completed
- named Rose City admin contact for cutover coordination; Christian Javier
  Alcala recorded

## Approval boundaries

Production provisioning/import, preserved Stripe billing projection,
Production environment configuration, Vercel deployment, Rose City domain
cutover, and webhook cutover were approved and executed on 2026-07-27. The
final legacy inventory, permanent project deletions, content-freeze release,
cron source schedule, and Production-only cron credential were approved and
completed on 2026-07-28. Activating the cron still requires a separately
approved production deployment.

| Action | Local/hosted | Approval |
| --- | --- | --- |
| Transform synthetic/exported JSON manifests | local | already allowed |
| Run local Supabase reset/tests/import rehearsal | local | already allowed |
| Read production metadata once | hosted read | completed |
| Rotate exposed legacy production key | hosted mutation | completed 2026-07-27 |
| Link checkout to production | local config plus production access | completed |
| Apply checked-in migrations to production | hosted mutation | completed 2026-07-27 |
| Configure production Auth/MFA/API keys | hosted mutation | completed 2026-07-27 |
| Freeze Rose City admin writes | production operation | completed 2026-07-27 |
| Export Rose City database/Auth/Storage rehearsal snapshot | hosted reads and egress | completed 2026-07-27 |
| Export final frozen Rose City database/Auth/Storage snapshot | hosted reads and egress | completed 2026-07-27 |
| Upload/import transformed data and media | hosted writes and usage | completed 2026-07-27 |
| Add approved Onzio metadata and project preserved subscription | live billing mutation | completed 2026-07-27 |
| Preserve/configure Stripe webhook destination | live billing mutation | completed 2026-07-27 |
| Deploy no-domain production validation target | hosted mutation | completed 2026-07-27 |
| Attach/change Rose City domains or DNS | hosted mutation | completed 2026-07-27 |
| Validate and record the final legacy Vercel/Supabase export | hosted reads plus local verification | completed 2026-07-28 |
| Release the Rose City content freeze | production operation | completed 2026-07-28 |
| Prepare the abandoned-media cleanup cron and credential | source plus hosted configuration | completed 2026-07-28 |
| Activate the abandoned-media cron | production deployment | fresh explicit approval required |
| Permanently delete the exact legacy Vercel and Supabase projects | destructive hosted mutation | completed 2026-07-28 |

## Backup and export gate

Before the first production schema or data mutation:

1. Record the Rose City content-freeze timestamp and administrator
   acknowledgement.
2. Verify a restorable Rose City database backup and create a logical export.
3. Export source row counts by table and relationship counts.
4. Export Auth user IDs/emails and enrolled MFA-factor state without secrets.
5. Inventory every Storage bucket/object, byte size, MIME type, and checksum.
6. Record current Vercel deployment, domains, environment configuration, and
   rollback deployment.
7. Record Stripe customer/subscription/Price/webhook IDs and subscription
   state; preserve the existing subscription ID.
8. Store all evidence outside the repository in a restricted migration
   workspace.

Supabase database backups do not contain Storage objects, so the Storage
inventory and object backup are separate mandatory artifacts.

The legacy rollback target recorded on 2026-07-27 is:

- Vercel project: `rose-city-website`
- project ID: `prj_lMYzzUcUxR1iFwYTQZW71OYsgbv5`
- ready production deployment:
  `dpl_EQ9y1gBxQeZB3U8RrcpYpTsFW3g1`
- immutable deployment URL:
  `rose-city-website-lb8jlqe33-404christianns-projects.vercel.app`
- pre-cutover aliases included `www.rosecityfutbolclub.com` and
  `rosecityfutbolclub.com`; retained legacy aliases include `rose-city-website.vercel.app`,
  `rose-city-website-404christianns-projects.vercel.app`, and the `main`
  branch alias
- production environment-variable names were inventoried without revealing
  encrypted values

## Rehearsal and import sequence

1. Export Rose City into a versioned source manifest. The non-frozen rehearsal
   snapshot is complete; repeat after the final content freeze for cutover.
2. Run the transformer twice and require identical output and digest.
3. Process media offline with the existing Sharp rules.
4. Recompute output checksums, dimensions, MIME types, and byte sizes.
5. Reconcile source object count, processed object count, and checksums.
6. Reset local Supabase and import the complete transformed plan transactionally.
7. Reconcile all table counts and composite relationships locally.
8. Render representative public/admin pages against local Rose City data.
9. Prove rollback by discarding the local import and replaying it from the same
   immutable artifacts.
10. Review the evidence and obtain explicit production-provisioning approval.

## Production and cutover sequence

After explicit approval and verified backups:

1. Confirm the completed legacy-key disable and signer revocation remain in
   effect.
2. Apply the reviewed checked-in migrations once to the exact production ref.
3. Configure production Auth, application secrets, and the operator allowlist
   using only the modern key posture.
4. Import tenant, membership, Auth mapping, content, and normalized media.
5. Reconcile counts, relationships, media checksums, and private renders.
6. Add Onzio metadata to the existing Stripe objects and reconcile the same
   subscription ID into `club_subscriptions`.
7. Deploy a private production validation target and complete admin/public/media
   and billing smoke tests.
8. Switch the domain and platform webhook only after every prior gate passes.
9. Keep the legacy deployment/database unchanged and read-only for 7–14 days.

If acceptance fails, restore domain routing to the legacy deployment while
admin writes remain frozen.

## No-domain production validation evidence

The shared Vercel project `onzio-platform-staging`
(`prj_I362ysmh9cse5cRxnL7db4dOhsEs`) has ten reviewed variables scoped only to
Production. Preview continues to hold only staging values. The current ready
production validation target is:

- deployment ID: `dpl_21X9WZEh2WdERBoQTCKtEGYrngQF`
- immutable URL:
  `onzio-platform-staging-6hi76yew8-404christianns-projects.vercel.app`
- build: passed, including TypeScript validation and 23 generated pages
- unknown deployment host: HTTP 404, `Cache-Control: no-store`,
  `X-Robots-Tag: noindex`
- invalid webhook signature: HTTP 400 `INVALID_SIGNATURE`
- runtime error log query: no errors found

Vercel rejected a request that spoofed `Host: www.rosecityfutbolclub.com` with
HTTP 403 before Onzio middleware ran. Therefore public/admin/media/billing
render verification is not honestly possible on the deployment URL without
attaching a temporary or final tenant domain. No temporary domain row, Vercel
domain, Rose City DNS record, or webhook destination was added in this step.

The application Stripe configuration was corrected to accept restricted
`rk_test_` and `rk_live_` credentials while preserving strict test/live
matching. The dedicated runtime key is limited to Customers Write, Customer
Portal Write, Checkout Sessions Write, Prices Read, and Subscriptions Read. An
earlier copy that surfaced during dashboard verification was expired
immediately and was never installed. The current webhook secret is
validation-only and must be replaced with the new destination's actual signing
secret during webhook cutover.

## Historical production cutover acceptance — 2026-07-27

Christian explicitly approved the domain, webhook, and production acceptance
steps on 2026-07-27. The cutover required controlled rollback/retry while
diagnosing a production-only runtime-access permission drift. The final state
is:

- `rosecityfutbolclub.com` and `www.rosecityfutbolclub.com` are assigned to
  the Onzio Vercel project
- final live deployment `dpl_75xrhi27MCgA5UDsQ6RhT6Ak4xrN` is `READY`
- `/`, `/roster`, `/schedule`, `/shop`, `/club/about`, `/club/logo`,
  `/admin/login`, and `/admin/update-password` return HTTP 200
- the homepage shows all six migrated slideshow photographs and its controls
  advance; assets use raw production Supabase object URLs with Vercel
  optimization and no `/storage/v1/render/image/` requests
- the checked-in `get_club_runtime_access(uuid)` execution grant was reapplied
  exactly for `anon`, `authenticated`, and `service_role`, PostgREST was
  reloaded, and anonymous domain/runtime resolution was reverified
- Vercel Production contains the corrected production Supabase publishable key,
  `ONZIO_ENVIRONMENT=production`, and the live webhook signing secret
- webhook `we_1TwEpdK6WajTkwHYD5SEYzXX` was preserved in place and expanded
  from six to seven exact events by adding `invoice.paid`
- canonical event `evt_1Txzz4K6WajTkwHYBzaweVRI` was resent; Stripe received
  HTTP 200 and the database retained one idempotent applied row with active Pro
  and `live` runtime access
- invalid webhook signatures still return HTTP 400
- Production Auth Site URL now uses the verified `www` domain and allows only
  the exact password-recovery callback
- `christianjavieralcala@gmail.com` completed password recovery, password
  sign-in, mandatory MFA, and protected admin-portal access; Supabase records
  the new sign-in
- the final deployment error-log scan returned no errors

At this historical checkpoint, the safe stopping point was rollback-window
observation and the no-edit freeze remained active. That observation period is
complete. The later operational closeout above records the formal freeze
release and permanent deletion of both legacy hosted projects.

## Completed operational closeout

Christian supplied final explicit approval, and the actions were completed in
this order:

1. Record a final read-only inventory/export of the legacy Rose City Vercel
   project/deployment and Supabase project, including identifiers, current
   status, retained aliases, backup/export locations, and non-secret
   configuration names.
2. Compare that record with the frozen cutover evidence and confirm the Onzio
   production tenant, Auth callbacks, Stripe webhook, and public monitoring
   still use only `onzio-rcfc.vercel.app`.
3. Decide whether to retain, downgrade, or retire each legacy Vercel and
   Supabase resource. Both were selected for permanent deletion; recovery now
   depends on the restricted frozen export.
4. Formally release the Rose City content freeze and notify the administrator
   at `2026-07-29T01:37:37Z`.
5. Add the authenticated daily media-cleanup cron source and configure its
   Production-only credential. Activation remains pending the next approved
   production deployment.

No application deployment, database or Storage mutation, Stripe change,
DNS/domain change, Auth or SMTP setting change, or email send occurred during
this closeout. The retired production importer was not used.

## Acceptance evidence

- source/destination counts match for every table
- every tenant relationship resolves within Rose City
- source/processed/uploaded media counts and checksums reconcile
- representative desktop/mobile renders match accepted source behavior
- Auth identities map correctly and every admin completes mandatory MFA
- production domains resolve only to the verified Rose City tenant
- Stripe customer/subscription remain the same objects and project correctly
- public, admin, media, billing, cache-isolation, and rollback tests pass
- no `/storage/v1/render/image/` URL or Supabase image loader exists
- `404DB` Usage and Upcoming Invoice show no unexpected growth

The legacy projects are deleted and the content freeze is released. Historical
rollback instructions below are retained as audit evidence only.
