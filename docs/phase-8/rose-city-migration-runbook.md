# Phase 8 Rose City Migration Runbook

Last updated: 2026-07-27

## Current safe stopping point

The local Phase 8 transformation gate is complete. No Rose City production,
Onzio production, Stripe live-mode, Vercel production, DNS, or hosted Storage
state has been mutated.

Production target metadata was resolved once through the authenticated
Supabase CLI:

- organization: `404DB` (`zmvjbvoraowhwbkwwtse`)
- project: `Onzio Platform Production`
- project ref: `ioalthwsdrlzrubomrow`
- region: `ca-central-1`
- health: `ACTIVE_HEALTHY`
- compute: Micro, per the project created by Christian

The connected Supabase app is scoped to the staging organization and cannot
inspect `404DB`. The production schema-empty assertion remains unverified
because no production database password was supplied and the project was not
linked or queried.

## Credential safety incident

On 2026-07-27, the installed Supabase CLI returned complete legacy JWT keys
from `supabase projects api-keys` even though `--reveal` was not supplied. The
legacy production service-role credential therefore appeared in the local tool
transcript.

Treat that legacy service-role key as exposed:

1. Do not use it for migration or application configuration.
2. Rotate or disable it before production provisioning.
3. Confirm no application depends on it before disabling legacy keys.
4. Keep the modern replacement secret outside the repository and transcript.
5. Inspect `404DB` Usage and Upcoming Invoice for unexpected activity.

No key rotation or configuration mutation is authorized by this runbook.

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

## Required inputs before hosted migration

Keep all credentials outside Git and chat transcripts.

- Onzio production database password
- guarded read-only access for Rose City database export
- Rose City Auth user inventory and identity-mapping export
- Rose City Storage bucket/object inventory and object download access
- checksums for every exported media object
- exact Rose City production domain and Vercel project/deployment identifiers
- existing Stripe customer, subscription, Price, and webhook identifiers
- authorized live-mode Stripe credential and new webhook secret
- explicit operator UUID allowlist for production
- named Rose City admin contact for the content-freeze acknowledgement

## Approval boundaries

Christian must separately approve the first hosted mutation after the local
gate. That approval does not automatically authorize later cutover steps.

| Action | Local/hosted | Approval |
| --- | --- | --- |
| Transform synthetic/exported JSON manifests | local | already allowed |
| Run local Supabase reset/tests/import rehearsal | local | already allowed |
| Read production metadata once | hosted read | completed |
| Rotate exposed legacy production key | hosted mutation | required |
| Link checkout to production | local config plus production access | required |
| Apply checked-in migrations to production | hosted mutation | required |
| Configure production Auth/MFA/API keys | hosted mutation | required |
| Freeze Rose City admin writes | production operation | required |
| Export Rose City database/Auth/Storage | hosted reads and egress | required |
| Upload/import transformed data and media | hosted writes and usage | required |
| Mutate Stripe metadata/webhooks | live billing mutation | required |
| Deploy production or change domains/DNS | hosted mutation | required |
| Delete or downgrade any project/organization | destructive/billing mutation | final explicit approval |

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

## Rehearsal and import sequence

1. Export Rose City into a versioned, immutable source manifest.
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

1. Rotate/disable the exposed production legacy service-role key.
2. Apply the reviewed checked-in migrations once to the exact production ref.
3. Configure production Auth, API-key posture, and application secrets.
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

Project deletion is outside this runbook. Rose City remains read-only for the
rollback window, and deletion requires separate final approval.
