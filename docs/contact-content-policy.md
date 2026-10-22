# Contact content policy

Owners and admins with current content authority can maintain valid Contact details and page copy independently of the current template, published navigation, or Store display. The existing load/save RPCs and dedicated API retain their request and response contracts.

Normal Contact controls, template dispatch, public rendering, bindings, and social-link ownership are unchanged. This package adds no public route or hidden-content controls.

## Existing content model

One explicit save commits the shared `contact_profile` and page-specific `contact_page_content` together. The request contains `operationId`, `expectedRevision`, `profile`, and `page`. Profile owns public email, public phone, service area, and hours. Page owns eyebrow, headline, introduction, and a nullable Contact hero media UUID. Social links remain in Branding.

A missing row remains null until content is saved. The policy does not seed fallback content. The generic data API already permits Contact maintenance independently of display and retains its existing partial and batch semantics.

## Preserved boundaries

Current session, tenant, membership, lifecycle, runtime access, and RLS remain authoritative before receipt access or mutation. Strict key sets, JSON types, field lengths, UUID conversion, and media reference safeguards remain.

The HTTP schemas validate email and phone syntax. Direct SQL retains its existing bounded phone string and email table CHECK. Invalid direct SQL email can raise the PostgreSQL constraint error instead of the API payload error. This validation difference predates the content-policy change.

Both RPCs and legacy Contact table writers retain advisory transaction lock `734901289`. Both singletons advance one shared content revision. Contact has no design revision token or global presentation lock. A design-only change does not alter Contact's content revision. Stale content still fails with `CONTACT_CHANGED`.

The database hashes the complete original request before trimming persisted strings. After structural validation, an actor's exact committed retry returns its original receipt before fresh revision or media checks. Changed valid input under the same operation UUID remains `OPERATION_REUSED`. Current authorization still applies to retries and receipt lookup.

Fresh media references must identify a tenant-owned, published, nondeleted Contact asset and satisfy existing table reference safeguards. Replacing a hero returns the old asset UUID for the existing reference-safe cleanup boundary. Confirmed POST saves and receipt GETs retain cleanup behavior. Uncommitted or rejected operations do not trigger retirement.

Profile, page, revision, audit effects, and receipt commit atomically. The forward migration changes only the template eligibility blocks in the two existing RPCs. The dedicated API removes its matching early template check. No new helper or compatibility API is required.

## Local acceptance

Acceptance uses real direct SQL, loopback PostgREST, exported GET/POST handlers, and independent-connection contention with legacy Contact writers. Historical compatibility creates a genuine old-function receipt before applying the complete forward file in rollback scope, then checks exact replay after later content and design changes.

Current results, files, exact revision, and independent reviews belong in [HANDOFF.md](../HANDOFF.md) and the [SITE ledger](site-architecture.md). Local application does not authorize a hosted migration or deployment.
