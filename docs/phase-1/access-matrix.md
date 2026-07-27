# Phase 1 Target Access Matrix

This matrix turns the architecture plan into an implementation checklist.
Database policies, constraints, and server checks must agree with it.

| Actor | Anonymous | Admin (AAL2) | Owner (AAL2) | Operator | Stripe webhook | Media processor | Migration tooling |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Resolve verified active domain | Read | Read | Read | Read | No | No | Read |
| Read live/grace tier-enabled content | Yes | Yes | Yes | Yes | No | Read as needed | Read |
| Read preview tenant content | No | Own club | Own club | Yes | No | Read as needed | Read |
| Read suspended/archived content | No | No | No | Operator procedure | No | No | Read-only export |
| Mutate entitled content | No | Own active club | Own active club | Operator boundary only | No | Finalize media only | Import only |
| Read memberships | No | Own membership only | Own membership only | Yes | No | No | Mapping only |
| Create/remove memberships | No | No | No | Yes | No | No | Auth mapping only |
| Read billing status | No | No | Own club | Yes | Canonical input | No | Reconciliation only |
| Create Checkout/Portal | No | No | Own club | Support only | No | No | No |
| Apply Stripe events | No | No | No | Replay tooling | Yes | No | Reconciliation only |
| Upload raw media | No | Own entitled club | Own entitled club | Support only | No | No | Offline import |
| Publish normalized media | No | No direct access | No direct access | Support only | No | Yes | Offline import |
| Provision/archive/reactivate | No | No | No | Yes | No | No | No |
| Hard purge | No | No | No | Explicit typed procedure | No | No | Export prerequisite |
| Read audit events | No | No | No | Narrow operator access | No | No | Verification only |
| Write audit events | No | Triggered by DB | Triggered by DB | Triggered by procedure | Triggered by webhook | Triggered by finalization | Triggered by import |
| Use service role | No | No | No | Narrow server module | Narrow server module | Narrow server module | Narrow server module |

## Required checks at mutation time

Every content mutation must independently verify:

1. normalized verified host and derived club
2. authenticated user
3. AAL2
4. active membership for the derived club
5. required role
6. active lifecycle
7. feature/tier entitlement
8. validated payload and media references
9. user-scoped database execution
10. tenant-aware database constraints and RLS

Client-provided club IDs, roles, tiers, hosts, origins, Stripe prices, MIME
types, and storage paths are never authoritative.

