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
separately, then run the guarded Next production build in the reconstructed
folder.
Reconstruction also writes `.onzio-pilot-reconstruction.json` with the full
accepted v2 manifest. It verifies the actual copied retained inputs, whole binding
and complete lock before writing that marker. A tracked current-root file at that
reserved path rejects reconstruction before output creation. Failure removes the
new target directory.

The marker is an ordinary input to the existing generic build receipt. Guarded
builds validate a present marker before and after Next. Missing markers permit
generic builds; malformed present markers fail. Reconstruct old roots again to
obtain this identity. Do not copy a digest-only label onto unrelated source.

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
keeps their current bytes and requires the complete accepted `package-lock.json`
bytes to match.
The inventory explicitly includes Next, React, React DOM, TypeScript and the CSS
build tools even without source imports. Scanned imports add other package roots.
New packages use `onzio-pilot-source@2` and record a SHA-256 fingerprint of the
complete lockfile, including nested versions, integrity, resolution and metadata.
The package-root map remains a diagnostic check. Reconstruction and setup reject
lock mismatches before creating output. Even whitespace or unrelated dependency
changes require regeneration and review under the new dependency inputs. No old
lockfile or dependency tree replaces current platform inputs.

Historical `onzio-pilot-source@1` packages still support byte verification with
their original accepted digest. That verdict does not authorize reconstruction.
Regenerate the package from a clean checkout and successful build, then review
and accept its new digest. The tool never upgrades or rewrites old artifacts.
Missing or malformed v2 lock metadata fails verification. Packages without the
required framework/build roots also fail verification.

Legacy homepage capabilities are retained as binding metadata. Reconstruction
refuses a changed capability implementation instead of overwriting current save
or editor policy. SQL authorization, receipts and content revisions remain current.
The tenant layout and editor preview mounting remain current shared contracts.

The package retains every public file because computed image paths cannot be
exhaustively inferred from string literals. It also retains all generated CSS and
media, including fonts and flag assets, rather than claiming those files belong
only to the homepage. CSS URL references must resolve inside the package.

## Acceptance limits

Packaging and hash checks establish retained bytes and declared lock-input
equality. They do not attest installed node_modules, runtime ABI, build output or
compatibility with every current platform interface. Actual page acceptance needs
a fresh reconstructed production build and real public/editor browser checks at
desktop and phone widths. The reconstruction proof requires the externally accepted digest to match the
restored build's validated marker identity before browser capture. Baseline A's
retained inputs, whole binding and complete lock must match the same manifest.
Changed B remains a generic negative visual control. Extra current-platform B
files remain observed build inputs; original shared-platform hashes remain
provenance. The separate browser assertions still demonstrate retained visuals
and current authorization behavior.

This is source reconstruction, not original executable-byte rollback. Next and
React remain shared runtime dependencies. Root Google font declarations still
need a build-time font fetch. Retained font bytes allow comparison but do not
establish offline builds. Tailwind scans the reconstructed platform, and the
editor copies its current head styles. Assignment-aware saves and binding-aware
recovery are implemented separately in
SITE-05E and SITE-05F. The later
[coordinated local Academy proof](pilot-site-coordination.md) demonstrates
full-document shell/style isolation, authored assignment authority and a finite
local fleet with these actual retained packages. Hosted deployment/traffic
coordination and production authored dispatch/storage remain unimplemented.
