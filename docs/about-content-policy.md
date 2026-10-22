# About and Logo content policy

Authorized owners and admins can maintain valid About and Logo content independently of the current site's display policy. Fresh Logo loading and saving no longer depend on the current template. About closing destinations no longer depend on template support, published navigation, legacy defaults, or Store visibility.

This policy covers local content maintenance. The normal editor still offers its current presentation-aware choices and retains Academy's Schedule adapter. Bindings, public rendering, routes, and hidden-content controls are unchanged.

## Trusted closing destinations

The content boundary accepts exactly these historical canonical paths:

- `/`
- `/roster`
- `/schedule`
- `/club/about`
- `/club/logo`
- `/shop`
- `/sponsors`
- `/staff`
- `/standings`
- `/stats`
- `/tryouts`
- `/programs`
- `/contact`

Every other value is invalid. The boundary does not trim, decode, normalize, or resolve input. Absolute URLs, protocol-relative URLs, query strings, fragments, trailing slashes, encoded aliases, dynamic detail paths, admin paths, and tenant rewrite prefixes remain invalid.

A trusted content destination does not promise that the current site renders that page. `/standings` is a historical registered destination without a current page renderer. This package preserves that value without adding a page or redirect.

`lib/about-editor/content-policy.ts` owns the explicit TypeScript vocabulary and predicate shared by both mutation routes. The forward migration `20261022200815_about_content_policy.sql` replaces both existing invoker RPCs and migrates their sole private destination caller before dropping the obsolete helper signature. The private SQL destination helper enforces the same finite set for direct RPC calls. Future route registration does not automatically expand this policy. The presentation-aware picker remains in `lib/about-editor/destinations.ts`.

## Preserved save contracts

The current session, tenant, membership, lifecycle, runtime content access, and RLS checks remain authoritative. Both RPCs retain the global advisory lock followed by the About lock. About and Logo retain independent content revisions and the existing design revision. A stale design still conflicts even when the changed display policy would permit the submitted content.

Strict envelope and nested validation remain. The database hashes the complete original request before media canonicalization. An actor's exact committed retry returns its original receipt before fresh content, design, media, or destination checks. Reusing an operation UUID with a changed original request remains a conflict. Other actors cannot recover that receipt.

Tenant media ownership, surface, bucket, published status, deletion checks, legacy URL retention, nested URL canonicalization, and retired-media ownership remain. Content, revisions, audit effects, and receipts commit atomically for the selected page.

## Local acceptance

Focused behavior lives in the About content-policy SQL and route suites alongside the existing atomic, concurrent, recovery, picker, and public-query contracts. Historical compatibility creates a real receipt with the old save function, applies the entire forward migration in rollback scope, then checks exact replay after later content and design changes. Loopback PostgREST acceptance commits nonempty maintained content and checks unauthorized callers.

Current acceptance results and exact reviewed revision belong in [HANDOFF.md](../HANDOFF.md) and the [SITE ledger](site-architecture.md). Local SQL application does not authorize a hosted migration or deployment.
