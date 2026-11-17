# Homepage content maintenance policy

SITE-06A migrates the existing atomic homepage save boundary. Authorized club
owners and admins may maintain valid homepage content even when the current
design does not display it. This is the first local SITE-06 package. Other
content domains retain their existing policy.

## Content and visible controls

The request remains `HomepageSaveRequest`, with the existing operation UUID,
content revision, assignment-aware design revision and strict section map.
`onzio.save_homepage(uuid,jsonb)` remains the single atomic save RPC.

The content boundary accepts valid hero copy, homepage story, slideshow photos
and season label, and video presentation copy independently of renderer
visibility. This includes a compact hero's eyebrow, a fixed legacy hero's copy,
non-Academy homepage story and Academy slideshow/video content.

[Editing bindings](homepage-editing-bindings.md) still describe the current
canvas controls and normal save projection. This package adds no controls or
maintenance UI. About-owned story and Shop-owned kits keep their own existing
editors and policy. Saving homepage story does not edit About story. Content
maintenance neither changes the selected design nor makes hidden content render.

## Authorization and validation

The invoker RPC keeps the existing fresh-session, active-membership, lifecycle
and paid-access checks, with content-table RLS as the database boundary.
Anonymous, nonmember, removed, stale-session, foreign-tenant, archived and
suspended-customer writes remain denied. Existing onboarding and grace access
remain available.

Strict JSON shapes, types, text limits and internal destination syntax remain.
Photos still require ordered unique identities and same-club published,
nondeleted homepage assets in the normalized media bucket. Arbitrary URLs,
foreign media and malformed photo lists remain invalid.

Video edits own presentation copy and visibility only. They cannot replace the
source through the homepage save RPC. `visible:true` still requires an existing
nonempty source even when the current design hides video. Explicit
`visible:false` copy may be maintained without a source. This preserves the
existing RPC contract; it adds no column restrictions to legacy raw-table writers.

## Conflicts and receipts

The shared homepage advisory lock and one transaction still protect all supplied
sections, audit events, revisions and the operation receipt. A later validation
or write failure rolls back the whole save.

Current authorization runs before receipt replay. An exact matching actor-scoped
request returns its original receipt before current content or design conflicts.
The original operation UUID, complete JSONB request hash and response remain
unchanged. A different request using that operation UUID still fails.

Fresh operations retain assignment-aware `designRevision` and content revision
checks. Renderer-independent maintenance does not bypass stale bindings,
assignment A/B/A, content conflicts or explicit browser draft review.

## Local migration and checks

Use the additive `homepage_content_policy` migration with the synthetic loopback
Supabase stack. It replaces only `onzio.save_homepage`; it does not recreate
snapshot helpers, epochs, tables, policies, immutable history or receipts.
Historical migrations remain unchanged. Its signature and security posture remain
the same.

From a task checkout with the local environment exported:

```bash
supabase migration up --local
npx vitest run tests/database/homepage-content-policy.test.ts
npx vitest run tests/database/homepage-atomic-save.test.ts tests/database/homepage-assignment-save.test.ts tests/database/homepage-assignment-concurrent.test.ts tests/database/homepage-assignment-migration.test.ts tests/database/homepage-concurrent-save.test.ts tests/database/site-coordination.test.ts
```

Run fixture writers serially. Never point these checks at a hosted database.
The migration compatibility check must use a real old-function save and its
original receipt, then execute the new migration in a rollback-scoped local
transaction. Generated type signatures should remain unchanged.

## Acceptance and remaining work

SITE-06A is ready_for_review for local acceptance. Forty-six new direct SQL/HTTP
policy cases pass. Together with existing atomic tests the narrow run passes
73 cases; 33 assignment, concurrency, migration and coordination regressions pass.
The full required run passes 2,283 cases, contracts 1,215, architecture 256 and
local database 390. Full and architecture runs retain the existing Windows-only
skip. Nonincremental TypeScript, lint, whitespace and relative file links pass.
No UI change or new browser acceptance is claimed.

The local migration is recorded and its installed function body matches the file.
Privileges, invoker security, search path and checked Alpha/Bravo fixtures match
the pre-apply baseline; disposable clubs and schemas are absent. Local security
advisors report no issues before or after. Raw generated types are identical
before and after, while the existing committed-type mismatch still causes
`npm run db:types:check` to fail. That unrelated file remains unchanged.

Actual commands, logs, final revision, independent advisory review and fixture
restoration are recorded in HANDOFF.md and
`/home/coder/.codex/visualizations/2026/10/22/onzio-site06-homepage-content-policy`.
The complete suites cover the unchanged implementation before the final
evidence-only documentation update. Prior Academy browser acceptance remains
historical evidence for its original revision.

Parent SITE-06 remains incomplete. No other content domain, new editor UI,
hosted schema/data, inventory/admission, dispatch, activation, provider or
deployment work is included. Christian alone reviews, merges and deploys.
