# Phase 1 Threat Model and Gap Register

## Assets to protect

- tenant isolation and domain-to-club mapping
- admin/owner identities, sessions, memberships, and MFA state
- public content integrity
- private operational, billing, audit, and migration data
- Stripe customer/subscription ownership and event ordering
- raw uploads and normalized published media
- service-role, webhook, database, and Auth secrets
- Rose City source data, media, admins, domain, and existing subscription ID

## Trust boundaries

1. Browser and arbitrary Supabase client → Next.js server boundary
2. Verified hostname → tenant resolver and internal route
3. User session → AAL2 membership/role/lifecycle/entitlement checks
4. Server action/route → user-scoped Supabase and RLS
5. Stripe → raw-body signature verifier and transactional event ledger
6. Browser upload → private staging → Node validation/normalization
7. Operator/migration tooling → narrow service-role modules
8. Onzio deployment → staging and production Supabase projects

## Primary abuse cases

- forge `Host`, `Origin`, return URL, internal path, or `club_id`
- use an Alpha session to read/write/reference Bravo data
- call Supabase directly and bypass application validation
- reuse an AAL1, removed-member, suspended, or archived session
- inject an unapproved Stripe price, customer, subscription, environment, or stale event
- replay webhooks or delete an obsolete subscription after replacement
- upload spoofed, corrupt, executable, SVG, or decompression-bomb media
- overwrite another tenant's path or retain a trusted URL after content replacement
- leak service-role credentials through client imports, logs, or audit payloads
- poison shared HTML/RSC/metadata/image caches across tenant domains
- accidentally run tests, seeds, migrations, or Stripe operations against production

## Legacy gap register

| Finding | Current evidence | Required phase |
| --- | --- | --- |
| No tenant identity | Legacy tables and queries have no `club_id` | Phase 2–3 |
| No composite tenant FKs | Only single-club foreign keys exist | Phase 2 |
| Direct browser mutations | Admin pages call Supabase writes directly | Phase 3 |
| No mandatory MFA | Legacy magic-link/allowlist middleware | Phase 5 |
| Middleware treated as auth gate | Admin authorization is concentrated in `middleware.ts` | Phase 3/5 |
| Service role outside narrow boundary | `middleware.ts` reads billing with service role | Phase 3/6 |
| Request-derived billing origins | Checkout/Portal use `new URL(request.url).origin` | Phase 6 |
| Singleton billing model | One `stripe_subscription` row, no club/environment ledger | Phase 2/6 |
| No webhook event ledger | Projection upsert has no durable event idempotency table | Phase 2/6 |
| Public direct uploads | Admin writes to public buckets | Phase 4 |
| MIME/path trust | Upload code uses browser MIME and caller-built paths | Phase 4 |
| Stable/upsert media paths | Some replacements overwrite paths | Phase 4 |
| No audit events | No append-only audit table/triggers | Phase 2 |
| No lifecycle/entitlement model | Fixed Rose City behavior only | Phase 2–3 |
| Shared local/production backend | Legacy local env targets production Supabase | Phase 1 resolved for Onzio; legacy risk retained |
| Legacy runtime vulnerabilities | Source pinned Next 14.2.3 | Phase 1 patched to Next 15.5.21 |
| Supabase image transformations | Custom loader used render endpoint | Phase 1 loader excluded; Phase 4 completes delivery registry |

## Phase 1 mitigations completed

- Production secrets were not copied.
- Test helpers reject hosted Supabase URLs and live Stripe keys.
- Local Supabase configuration remains isolated and loopback-only.
- The custom Supabase image loader and transformation endpoint were excluded.
- Next.js/React were moved to a currently patched runtime line.
- Production introspection used only guarded `GET`/`HEAD` requests.
- The legacy source and Onzio contract suites are independently runnable.

## Residual risk

The copied app is a compatibility baseline, not a deployable multi-tenant
platform. Until Phases 2–6 are complete, it must not be connected to the new
Onzio production project or used to onboard another club.

