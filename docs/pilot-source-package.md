# Reconstruct the pilot from retained source

This local tool packages the actual Academy homepage implementation. It retains
its visual source graph, public assets, compiled CSS and font/media files. It
never activates a club assignment or starts a deployment.

## Create and verify a package

Use a clean committed checkout and a successful local production build from the
same visual and platform inputs. The VM launcher supplies Node and dependencies.
Run from the repository root. Keep outputs in a new temporary or gitignored
folder whose parent exists.

```bash
mkdir -p test-results/pilot
npx tsx scripts/package-pilot-local.ts pack \
  --build /absolute/path/to/local-build \
  --output test-results/pilot/release-a
```

Keep the returned digest with the accepted package. Verify against that digest
before reconstruction. A digest identifies trusted local bytes, not a signature
or permission to execute an untrusted package.

```bash
npx tsx scripts/package-pilot-local.ts verify \
  --package test-results/pilot/release-a --digest ACCEPTED_DIGEST
npx tsx scripts/package-pilot-local.ts reconstruct \
  --package test-results/pilot/release-a --digest ACCEPTED_DIGEST \
  --output test-results/pilot/reconstructed-a
```

Reconstruction copies the current tracked platform files, then replaces only the
retained visual sources and public assets. Environment files, Git metadata and
node_modules do not transfer. Supply local environment and dependencies
separately, then run the real Next production build in the reconstructed folder.
The retained emitted files are evidence to compare against that new build. They
are not substituted into the new build automatically.

## Package boundary

Explicit roots cover the real page, Nav, Footer, font scope, loading shell,
injected champions badge, root font declarations and stylesheet compiler inputs.
The tool derives the source inventory from literal imports, including dynamic
imports. Shared visual modules remain whole during this proof.

Current platform dependencies include tenant and branding contexts, query reads,
preview context identity, editor state types, database types, presentation
validation, errors and media policy. These files never transfer from the retained
package. The manifest records their original hashes for provenance. Reconstruction
keeps their current bytes and requires the locked build/runtime versions to match.
Future version compatibility needs a separate verification pass.

Legacy homepage capabilities are retained as binding metadata. Reconstruction
refuses a changed capability implementation instead of overwriting current save
or editor policy. SQL authorization, receipts and content revisions remain current.
The tenant layout and editor preview mounting remain current shared contracts.

The package retains every public file because computed image paths cannot be
exhaustively inferred from string literals. It also retains all generated CSS and
media, including fonts and flag assets, rather than claiming those files belong
only to the homepage. CSS URL references must resolve inside the package.

## Acceptance limits

Packaging and hash checks establish retained bytes. Actual page acceptance needs
a fresh reconstructed production build and real public/editor browser checks at
desktop and phone widths. The separate reconstruction proof must demonstrate
that changed live visual sources do not replace retained A, while current
platform checks still apply.

This is source reconstruction, not original executable-byte rollback. Next and
React remain shared runtime dependencies. Root Google font declarations still
need a build-time font fetch. Retained font bytes allow comparison but do not
establish offline builds. Tailwind scans the reconstructed platform, and the
editor copies its current head styles. Complete isolated shell/style ownership,
binding-aware saves, release coordination and production dispatch remain open.
