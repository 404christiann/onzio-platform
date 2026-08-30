# Phase 9 — Versioned Presentation System

## Purpose

Phase 9 converts the approved Rose City and Deportivo Olimpico mockup visuals
into reusable, tenant-aware presentation templates inside `onzio-platform`.

The target flow is:

```text
Club intake and verified assets
        ↓
Readiness recommendation with reasons
        ↓
Operator-approved Pro-first mockup
        ↓
Reusable platform template + semantic club theme
        ↓
Real tenant data, media, authentication, admin, and Stripe entitlements
        ↓
Operator-published presentation version
        ↓
Club domain served by the shared Onzio deployment
```

The approved mockup remains a sales artifact. It is not copied into production
as a second application. Its approved visual decisions become a versioned
presentation configuration rendered by the same presentation package used by
the platform.

## Locked Product Decisions

### Ownership

- Onzio operators control the presentation configuration.
- Club owners and admins control real club content and media after payment.
- Club owners and admins do not select templates, fonts, semantic theme tokens,
  route structure, section composition, or placeholders in v1.
- Christian has final approval over the template recommendation, mockup, and
  published presentation. The readiness evaluator is advisory.

### Templates

- `cinematic@1` is the neutral product key for the Rose City-derived template.
- `heritage@1` is the neutral product key for the Deportivo
  Olimpico-derived template.
- Operator-facing help text may say which approved visual source a template is
  based on, but code and stored configuration use neutral names.
- Each template is a genuinely distinct renderer over the same semantic tenant
  data. It is not a color variant of one universal component tree.
- Each template owns its header, hero, footer, default route presentation,
  default section order, default theme, and default font pack.
- Template-specific sections are allowed. Shared sections use a common semantic
  catalog where practical.
- `cinematic@1` must preserve the current Rose City public visual output during
  initial extraction. Redesign is outside the extraction task.
- `heritage@1` must preserve the approved Deportivo visual language while
  replacing its hard-coded prospect data and mock-only internals.

### Operator customization

- Operators may add, remove, hide, reorder, and group registered homepage
  sections.
- Operators may reorder, hide, and group registered routes starting from the
  selected template's defaults.
- Operators may select another curated font pack compatible with the template.
- Components consume semantic theme tokens and never raw club colors.
- Contrast and accessibility checks are mandatory before publication.

### Publishing

- Ordinary club content continues to publish immediately.
- Presentation configuration has separate draft and published versions.
- Preview reads a selected draft. Public rendering reads only the published
  version.
- Publishing is an explicit operator action and atomically advances the
  published pointer to one immutable version.
- Rollback atomically moves the published pointer to an earlier compatible
  version. Version documents are not edited in place.

### Billing and modules

- Stripe entitlement, operator-enabled module, homepage placement, and content
  readiness are separate concepts.
- Presentation configuration uses `modules`, not `features`, for
  operator-enabled product capabilities.
- Operators may prepare Pro presentation drafts and Pro mockups before payment.
- Owners and admins may edit a Pro module only after Stripe activates the Pro
  entitlement.
- A downgrade preserves Pro content, removes it from public rendering, and
  blocks customer edits until the entitlement returns.
- Mockups simulate Starter and Pro through the artifact's tier selector.
  Production derives the tier from Stripe and never trusts a query parameter.

### Placeholders and provenance

- Placeholder images are allowed only in sales mockups and protected operator
  previews.
- Placeholders are visibly identified as sample content, do not count toward
  readiness, and can be assigned only after operator review.
- Placeholder and sample content are prohibited from production publication.
- If production lacks real content, an optional section uses its registered
  `emptyBehavior`, normally `hide`, or a deliberate non-photographic fallback.
- Every importable content area and media assignment carries explicit
  provenance.
- Sample content is never imported into normalized production content tables.

## System Boundaries

The system keeps three forms of state separate:

| State | Purpose | Source of truth | Publication behavior |
| --- | --- | --- | --- |
| Club content | Roster, fixtures, history, sponsors, store, media, and other operational data | Existing normalized tenant tables and versioned media assets | Owner/admin changes remain immediate |
| Presentation | Template, template version, semantic theme, font pack, sections, routes, and modules | Immutable versioned presentation document | Operator draft, preview, publish, and rollback |
| Mockup artifact | Sample-backed sales preview with Starter/Pro simulation | Generated self-contained snapshot pinned to a presentation package/version | Separate review deployment; never production authority |

The presentation document references content domains and registered section
types. It does not duplicate roster, match, sponsor, shop, or media records.

## Proposed Repository Shape

`onzio-platform` is the source of truth:

```text
packages/
  presentation/
    registry/
      templates.ts
      sections.ts
      routes.ts
      modules.ts
    templates/
      cinematic/v1/
      heritage/v1/
    sections/
      shared/
      cinematic/
      heritage/
    fonts/
    schema/
    readiness/
    validation/
    preview/
    provenance/
scripts/
  generate-prospect/
docs/
  phase-9/
```

The package boundary may be implemented as a workspace package or an internal
package compiled by the existing Next.js application. The implementation must
not require a private package registry.

The future prospect generator exports a self-contained snapshot pinned to an
exact presentation package and template version. Changes in
`onzio-platform` affect future generated artifacts unless an older snapshot is
deliberately regenerated.

## Presentation Document

The exact Zod and database schemas will be contract-first implementation work.
The conceptual document is:

```yaml
schemaVersion: 1
template:
  id: cinematic
  version: 1
fontPack: bebas-inter
theme:
  surface:
    canvas: "#07120D"
    elevated: "#102219"
    inverse: "#F7F3E8"
  text:
    primary: "#F7F3E8"
    muted: "#B8C3BB"
    inverse: "#07120D"
  action:
    primary: "#12A140"
    primaryText: "#FFFFFF"
  border:
    subtle: "#2A3B31"
  status:
    success: "#12A140"
    warning: "#D69E2E"
    danger: "#D14343"
modules:
  standings: false
  tryouts: true
  affiliations: true
  store: true
homepage:
  sections:
    - id: hero-main
      type: cinematic.hero
      enabled: true
      emptyBehavior: error
    - id: next-match
      type: shared.next-match
      enabled: true
      emptyBehavior: hide
    - id: club-history
      type: shared.history
      enabled: true
      emptyBehavior: hide
    - id: gallery-main
      type: cinematic.gallery
      enabled: true
      emptyBehavior: hide
navigation:
  groups:
    - id: main
      label: null
      routes:
        - home
        - roster
        - schedule
        - club
    - id: support
      label: Support
      routes:
        - store
        - sponsors
metadata:
  recommendationId: null
  createdBy: operator-user-id
  createdAt: 2026-07-28T00:00:00Z
  sourceArtifact: null
```

Rules:

- `schemaVersion` versions the document contract.
- Template ID and version are pinned independently of the document schema.
- Section instances have stable unique IDs so reordering does not change their
  identity.
- Section types, route keys, module keys, theme tokens, and font packs must
  exist in registries.
- Template renderers translate semantic tokens into their own visual treatment.
- Raw arbitrary React component names, class names, CSS, JavaScript, HTML,
  routes, URLs, and storage paths are not accepted from the document.
- Unknown schema versions, template versions, tokens, sections, routes, or
  modules fail closed.

## Semantic Theme Contract

The first schema should define a small stable token catalog rather than expose
every CSS decision:

- surfaces: canvas, elevated, subtle, inverse
- text: primary, secondary, muted, inverse
- actions: primary, primary hover, primary text, secondary
- borders: subtle, strong
- status: success, warning, danger
- optional template accents: accent one and accent two

Template code may derive additional CSS variables from these tokens, but public
components must not read `club.primary_color` or `club.secondary_color`
directly.

Validation must check at least:

- valid normalized color values
- required tokens
- WCAG contrast for registered foreground/background pairs
- focus visibility
- supported font/template combinations
- no unsafe CSS or arbitrary token injection

## Template and Section Registries

Each template registration declares:

- neutral ID and immutable version
- display name and operator-facing origin note
- renderer
- default font pack
- compatible font packs
- semantic token requirements and defaults
- required chrome
- default homepage sections
- supported shared and template-specific sections
- default navigation and supported routes
- supported module keys
- compatibility and migration functions

Each section registration declares:

- stable type key and version
- owning scope: shared, cinematic, or heritage
- required content domain
- compatible templates
- required module and entitlement, if any
- allowed cardinality
- configuration schema
- minimum content requirements
- allowed provenance in mockup, preview, and production
- `emptyBehavior`
- accessibility obligations

Headers, heroes, and footers are template-owned chrome. The operator composes
the registered middle sections and registered navigation.

## Readiness Evaluator

The evaluator recommends a starting template and explains its evidence. It
never selects or publishes a template without operator confirmation.

Initial visual-photo bands:

| Real approved club photos | Recommendation | Reason |
| --- | --- | --- |
| 0–1 | `heritage@1` with mockup placeholders | The design can establish identity through crest, typography, history, affiliations, and structured content without depending on a deep photo library |
| 2–5 | `heritage@1` | The club has enough imagery for accents but not enough for the image-led cinematic rhythm |
| 6+ | `cinematic@1` | The club can support the large hero, gallery, and image-led storytelling expected by the cinematic template |

Only real, club-specific, operator-approved photos count. Logos, sponsor marks,
duplicates, low-quality images, inaccessible URLs, sample content, and
placeholders do not count.

The recommendation result should include:

```ts
type ReadinessRecommendation = {
  recommendedTemplate: "cinematic@1" | "heritage@1";
  scoreBand: "limited" | "developing" | "strong";
  realApprovedPhotoCount: number;
  reasons: string[];
  warnings: string[];
  suggestedPlaceholderAssignments: PlaceholderSuggestion[];
  evaluatedAt: string;
};
```

The operator may override the recommendation. The selected template,
recommendation, override, operator, timestamp, and override reason are audited.

## Provenance Contract

Every intake value that could become production content uses a provenance
envelope:

```ts
type ProvenanceStatus =
  | "verified_public_source"
  | "club_supplied"
  | "operator_approved"
  | "sample"
  | "unresolved";

type ProvenancedValue<T> = {
  value: T;
  status: ProvenanceStatus;
  sourceRef?: string;
  suppliedBy?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  notes?: string;
};
```

Production import accepts only allowlisted production statuses and must record
the source. `sample` and `unresolved` fail the import gate. A public source
reference is evidence, not automatic permission; operator review remains
required for factual correctness, image quality, and usage rights.

## Draft, Publish, and Rollback Storage

Store each complete presentation configuration as an immutable versioned
document while retaining club content in normalized tables.

Conceptual tables:

### `presentation_documents`

- `id uuid primary key`
- `club_id uuid not null`
- `version integer not null`
- `schema_version integer not null`
- `template_id text not null`
- `template_version integer not null`
- `configuration jsonb not null`
- `configuration_digest text not null`
- `created_by uuid not null`
- `created_at timestamptz not null`
- unique `(club_id, version)`
- unique `(club_id, id)` for composite tenant references

### `presentation_state`

- `club_id uuid primary key`
- `draft_document_id uuid`
- `published_document_id uuid`
- `updated_by uuid not null`
- `updated_at timestamptz not null`
- composite tenant foreign keys to both document pointers

### `presentation_publications`

- immutable audit record of publish and rollback transitions
- club, actor, previous document, next document, digest, validation result,
  override reasons, and timestamp

Database implementation must:

- live in the `onzio` schema with RLS enabled in the creating migration
- enforce composite tenant foreign keys
- permit public rendering of only the current published document for a live
  tenant
- permit draft access and writes only through the protected operator boundary
- use user-scoped enforcement where possible and narrowly scoped privileged
  code where an atomic operator-only transition requires it
- avoid trusting document `club_id`, template entitlement, or publication
  status from the client
- preserve append-only publication and audit history

Exact policies and functions require local Supabase contracts before migration
implementation.

## Template Switching

Switching a draft from one template to another:

1. Maps registered shared sections and routes automatically.
2. Preserves all normalized content and media.
3. Preserves unsupported presentation settings in the source version.
4. Disables unsupported sections in the new draft instead of deleting them.
5. Produces a compatibility report with mapped, changed, disabled, missing,
   and entitlement-blocked items.
6. Requires operator preview and explicit publication.

Template changes never mutate the current published document until the new
draft passes all gates.

Compatible accessibility, security, and defect fixes may ship within an
existing template version without changing its visual contract. Structural
redesigns require a new immutable template version. Tenants remain pinned until
an operator previews and publishes an upgrade.

## Operator Presentation Builder

The protected v1 builder includes:

- readiness recommendation with reasons and override
- template and pinned version selection
- semantic theme editor with contrast feedback
- curated font-pack selection
- homepage section add, hide, remove, reorder, and configuration
- navigation route hide, reorder, and grouping
- module and entitlement visibility
- placeholder suggestions for mockup/preview only
- desktop and mobile preview
- draft validation report
- draft-versus-published diff
- explicit publish and rollback actions

The customer-facing mockup does not expose these controls.

The builder produces the same schema that can be imported or exported as YAML
or JSON. The visual builder is the operator workflow; the manifest is the
automation and interoperability contract.

## Publication Gates

### Non-overridable failures

- invalid or unknown schema/template version
- invalid, unsupported, duplicate, or disallowed sections and routes
- broken composite tenant references
- entitlement bypass
- unsafe URL, media reference, color, CSS, HTML, or configuration
- sample or placeholder content on a production surface
- cross-tenant content or media
- missing required accessible name, focus behavior, landmark, or contrast
- broken image, visible overflow, framework error, or console error

### Operator-overridable completeness warnings

- optional section lacks enough real content
- recommended photo quantity is not met
- optional route or module has no current content

An override requires an operator reason. The affected optional section must
honor `emptyBehavior: hide` until real content becomes available.

### Required review evidence

- schema and registry validation
- template-section-route compatibility
- semantic contrast/accessibility validation
- Stripe entitlement behavior
- provenance report
- media and internal-route validation
- desktop and mobile screenshots
- no broken images, overflow, console errors, or framework overlays
- Starter-to-Pro and Pro-to-Starter behavior
- draft-versus-published diff
- Christian's final visual approval

## Phase 9 Delivery Sequence

### 9.1 — Visual contracts and baselines

- Capture approved desktop and mobile reference routes for current Rose City.
- Capture the approved Deportivo artifact in Starter and Pro.
- Inventory template chrome, typography, spacing, motion, sections, routes,
  required content, and responsive behavior.
- Add visual parity and no-Rose-City-special-case contracts before extraction.

Gate: the two source designs have explicit, reviewable parity baselines.

### 9.2 — Schema and registries

- Add the workspace package.
- Define Zod schemas for the presentation document and provenance.
- Register templates, sections, routes, modules, fonts, and theme tokens.
- Implement deterministic validation and compatibility reports.
- Add readiness evaluation with the advisory photo bands.

Gate: unit and contract tests cover valid documents, malformed input, unknown
keys, template switching, readiness explanations, and operator overrides.

### 9.3 — Local persistence and authorization

- Write failing database/RLS contracts first.
- Add local Supabase migrations for documents, pointers, publications, and
  audit behavior.
- Add generated database types.
- Implement atomic draft creation, publication, and rollback.
- Enforce operator-only draft/publish access and published-only public reads.

Gate: local database tests prove tenant isolation, immutable history, atomic
pointers, and fail-closed public/draft access.

### 9.4 — `cinematic@1` extraction

- Move Rose City visual composition into the presentation package.
- Replace raw color and font references with semantic theme/font contracts.
- Replace Rose City route/section special cases with registered template
  behavior.
- Bind the renderer to existing normalized Rose City content and media.
- Preserve the current Rose City output exactly during extraction.

Gate: Rose City desktop/mobile visual parity, route behavior, admin behavior,
media resilience, accessibility, and all existing tests remain green.

### 9.5 — `heritage@1` extraction

- Port the approved Deportivo visual system into the presentation package.
- Replace hard-coded prospect state with semantic content-domain inputs.
- Register its template-specific chrome and sections.
- Bind the renderer to normalized tenant content and production entitlements.

Gate: approved Deportivo desktop/mobile parity and shared platform contracts
pass without importing mock-only state into production.

### 9.6 — Operator builder

- Build protected draft editing and responsive preview.
- Add theme/font, section, route, module, and template-switching workflows.
- Add validation, compatibility, diff, publication, and rollback surfaces.
- Record override reasons and publication audits.

Gate: an allowlisted MFA-authenticated operator can safely prepare, preview,
publish, and roll back a synthetic tenant without accessing another tenant.

### 9.7 — Platform integration and final gate

- Resolve the published presentation in the verified tenant request boundary.
- Derive production modules from Stripe entitlement.
- Retain immediate normalized-content publication.
- Run the full publication evidence set for Rose City and a synthetic Heritage
  tenant.
- Update launch and operator documentation.

Gate: Phase 9 contracts, architecture tests, local database tests, complete
suite, TypeScript, lint, build, and browser verification pass.

## Phase 10 Preview — Prospect Automation

Phase 10 uses the Phase 9 package to automate:

1. intake normalization and provenance capture
2. readiness evaluation and explanation
3. operator template selection or override
4. Pro-first artifact generation
5. expanded Starter/Pro tier selector with shareable `?tier=pro` and
   `?tier=starter`
6. placeholder suggestions from an operator-approved local library
7. desktop/mobile validation and review package
8. explicit operator approval before any publication
9. production import that rejects sample and unresolved values

Generated artifacts remain independent sample-only snapshots. They have no
production authentication, Supabase writes, Stripe authority, or customer
admin controls.

## Phase 11 Preview — New Club Rollout

Only after Phases 9 and 10 pass:

- provision the first approved club through audited operator tooling
- create its verified production content and media
- generate and approve its presentation
- keep it in authenticated private preview
- verify owner invitation, recovery, password, MFA, tenant isolation, and
  customer editing after payment
- verify Stripe projection and Starter/Pro behavior
- attach its domain and launch only after the existing production gates pass

## Out of Scope

- club owner/admin access to presentation controls
- arbitrary CSS, JavaScript, HTML, fonts, routes, or React components
- automatic public deployment from intake
- automatic template selection without operator approval
- production placeholders or sample content
- deleting downgraded or template-incompatible content
- redesigning Rose City during the first extraction
- making mockup applications production tenants
- video as a general v1 presentation capability; the current Rose City video
  may remain a tenant-specific compatibility path until separately planned

## Inputs Required Before Their Delivery Step

These are not blockers for documenting or starting schema work:

- Christian's local placeholder-image library path, before Phase 10 placeholder
  assignment
- final curated font-pack catalog, before builder completion
- approved Deportivo reference routes/screenshots, before `heritage@1` parity
  acceptance
- first new club identity and verified source material, before Phase 11
