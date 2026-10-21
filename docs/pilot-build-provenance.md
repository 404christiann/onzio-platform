# Guard local reconstruction builds and starts

The local reconstruction launcher records a successful Next build and checks it
before start. It rejects stale source, changed output and unverified old builds.
This is a prerequisite for installed-pilot acceptance. It does not install or
activate an authored release.

## Build and start

Use the existing synthetic local environment and the normal `.next` output
layout. Run through `onzio shell` on the VM, from the application folder.

```bash
npx tsx /absolute/path/to/current/scripts/run-pilot-reconstruction.ts build
npx tsx /absolute/path/to/current/scripts/run-pilot-reconstruction.ts start --port 3127
```

Before building, the launcher uses the application's actual Next configuration
loader to check both production-build and production-server phases. Both must
select the normal `.next` directory. Start checks the production-server phase
again between receipt validations, with the requested port and the loopback
origin that Next sets before it loads server configuration. Configuration failures
report a generic error;
configuration output and errors are not forwarded. Each isolated configuration
probe has a five-second timeout and is killed if it does not finish. Input checks
include configuration evaluation, and start rechecks output afterward.

A successful guarded build writes `.next/onzio-pilot-build.json` with mode 0600.
Prior builds without this receipt need a fresh guarded build. A failed build
attempt removes the previous receipt before environment or Next preflight.
The command also removes the previous regular `.next/BUILD_ID`. Next must create
that file again before the result can be recorded. Other build output and caches
remain available. Custom output directories do not satisfy this `.next` contract.

The launcher compares file inventories before and after successful Next exit.
It records complete observed inputs, output and a digest of selected public
build environment. Start checks that receipt against the current files and
checked environment before spawning Next on loopback. Missing, malformed,
changed, added or deleted included files require a fresh guarded build. Included
symlinks and special files are refused. Receipt publication uses an exclusive
temporary file and atomic rename after all checks pass.

## Included files

The input inventory includes every regular file under the application root,
independently of Git. This includes source, configuration, public assets,
package.json, package-lock.json, platform code, bindings, scripts, tests and docs.
Even a documentation-only edit can require rebuilding.

Only these root-relative metadata, dependency and generated paths are excluded,
including their descendants where applicable:

- `.git`, `node_modules`, `.next`, `.vercel`, `.codex-work` and `.turbo`.
- `test-results`, `playwright-report`, `coverage`, `output` and `tmp`.
- `tsconfig.tsbuildinfo` and `.onzio-pilot-build.lock`.
- `supabase/.temp` and `supabase/.branches`.

Files named `.env` or starting with `.env.` are excluded at every depth. The
receipt stores no raw environment values. The selected effective environment is
hashed after the existing production environment loader checks it. That digest
covers `NEXT_PUBLIC_*`, `NODE_ENV` and `ONZIO_ENVIRONMENT`, including added and
removed keys. Shell overrides and dotenv precedence use the existing loader.
Private or custom environment equality is outside this identity, even when a
custom Next configuration reads such variables during build.

The output inventory includes every regular `.next` file, including executable
server code, client chunks, manifests, CSS/media and BUILD_ID. It excludes only
`.next/cache`, `.next/diagnostics`, `.next/trace`, the receipt and its reserved
`.next/.onzio-pilot-build.tmp` publication path. Public assets belong to the input
inventory. A nonempty BUILD_ID and nonempty server/static output are required.
Excluded names are reserved outside this guarantee. Importing application source
from an excluded path does not make that path part of the identity.

## Coordinate local commands

One root `.onzio-pilot-build.lock` permits one guarded operation at a time. Start
holds the lock until its Next child exits, so a competing guarded build cannot
replace the output beneath that server. Separate baseline, changed and restored
folders can run independently. A losing command neither removes the owner's
lock nor invalidates its receipt.

Ordinary exits and failures release the lock. Abrupt wrapper termination can
leave a lock and a Next child. Check that the wrapper and its child have stopped
before manually clearing their stale lock. The launcher never clears a lock
based on its age. Direct Next commands bypass this coordination and the receipt
checks.

## Acceptance limits

The receipt records observed stable file snapshots around trusted local
configuration and a successful Next command. It is not a signature or a defense against a local actor who
can rewrite the files. Pre/post scans cannot detect a transient change reverted
before the second scan. They do not enforce ongoing immutability after start.
ISR or other writes to inventoried output can require a new guarded build before
a later start.

The excluded node_modules tree may include external runtime dependencies. Lock
bytes do not attest installed dependency bytes, native modules or runtime ABI.
The receipt also does not bind an accepted source package or authored release
or prove current-platform interface compatibility. Those remain separate
acceptance work.

The [reconstruction rehearsal](pilot-reconstruction.md) consumes these receipts
through its own guarded server processes. It accepts application roots, acquires
ephemeral loopback servers, and retains each root lock until shutdown. Supplied
server URLs cannot satisfy that proof boundary.

The [reconstruction rehearsal](pilot-reconstruction.md) still requires its actual
public/editor and retained-asset checks. A minimal real Next fixture establishes
this command lifecycle, not Academy parity or full installed-pilot acceptance.
