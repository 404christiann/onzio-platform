# Verify the reconstructed pilot

This local rehearsal runs the actual Academy homepage and authorized editor
from a retained source package. It compares unchanged A, deliberately changed B,
and retained A reconstructed over current platform B.

## Prepare the controls

Create an accepted package with the [package tool](pilot-source-package.md).
Commit tracked changes before this setup command. It copies the current commit
into private temporary folders and never changes the working application.
Before creating those folders, setup requires a v2 package with matching complete
lockfile bytes, root versions and binding bytes. Historical v1 byte verification
does not satisfy this compatibility check. Regenerate and review a new package.
The local environment must use synthetic Supabase on port 54321. Setup checks
`.env.local` and Next's effective production environment, including shell
overrides, dotenv precedence and variable expansion. It rejects live Stripe
secret and restricted keys without printing their values. Every effective
Supabase URL must target loopback HTTP port 54321. Database URL variables must
target loopback PostgreSQL port 54322.

```bash
npx tsx scripts/prepare-pilot-reconstruction.ts \
  --package /absolute/path/to/release-a --digest ACCEPTED_DIGEST
```

The command prints the changed and restored folder paths. It adds a visible
banner, changes Academy heading fonts and styling, and replaces a kit image in B.
It also adds a marker header to the current homepage API's existing error replies.
Reconstructed A must retain that current server marker while restoring A's visuals.
The setup rejects copies missing the actual hero module, a font or a kit image.

Each temporary app has a node_modules link and a private copy of the local
.env.local. Those environment files never enter the source package or reports.
Keep the temporary folders private. Build each app with the guarded launcher.
The proof command starts and stops its own servers. On the VM, run these
commands through `onzio shell`.

```bash
cd /absolute/path/to/changed
npx tsx scripts/run-pilot-reconstruction.ts build
npx tsc --noEmit
```

Repeat the guarded build for restored A and the original accepted A checkout.
If a checkout predates the launcher, invoke its absolute path from the current
checkout while keeping the app as your working folder. Keep the synthetic Alpha
fixture on its seeded Academy assignment. Stop any guarded start using these
roots before running proof. Its existing lock prevents proof from acquiring it.

The launcher records a successful build and verifies its source, output and
selected public environment before start. Old builds without a receipt need a
fresh guarded build. See [local build provenance](pilot-build-provenance.md) for
file coverage, lock recovery and limits.

The launcher resolves and checks the environment again immediately before each
Next build or start. It passes that checked environment to the child process
and binds starts to `127.0.0.1`. Use these guarded commands throughout the
rehearsal. Direct `npm run build` or `next start` commands bypass these checks.

## Run the browser checks

Use the existing local login helper against the baseline app. On this Linux VM,
temporarily start baseline A with the guarded start command on a loopback port.
Make a helper copy that uses that port and a private folder under `/tmp`. Export
.env.test before running it, then stop that temporary baseline server. Never
commit the resulting browser authentication. Proof starts a fresh baseline
process on its own port; cookies for `alpha.localhost` work across ports.

From the main checkout, pass that storage-state path to the rehearsal.

```bash
npx tsx scripts/prove-pilot-reconstruction.ts \
  --package /absolute/path/to/release-a --digest ACCEPTED_DIGEST \
  --baseline-root /absolute/path/to/accepted-a \
  --changed-root /absolute/path/to/changed \
  --restored-root /absolute/path/to/restored-a \
  --auth /absolute/path/to/private-local-auth.json
```

The command runs on POSIX hosts and accepts three distinct application roots. It refuses supplied URLs
and aliases of the same root. Each child repeats the existing environment,
Next output-configuration and successful-build receipt checks. The command holds
each root lock until its owned child stops. Next selects an ephemeral port on
`127.0.0.1`; private IPC reports readiness from that process. The origin uses
the native HTTP server's actual listening address, rather than mutable environment
strings. Postchecks require the same server object and port. The command never
adopts an existing listener. Before readiness and after capture, it inspects
Next's actual resolved router configuration and renderer output directory. Both
must use the normal `.next` build, between receipt checks. Missing, malformed
or divergent runtime state fails proof. These pinned internal Next APIs are
checked directly; validation does not replay configuration under a later environment.

The browser permits only the three owned `alpha.localhost` origins and local Supabase.
It blocks external resources, analytics, WebSockets and mutations. The existing
admin data endpoint may receive read-only select requests. Populated home-kit
GET responses use local photos without changing fixture content.

At 1440px and 390px the checks capture public, kit and editor states. They require
B to differ, then require A's computed public/editor typography, stylesheet,
font and image bytes to match. Kit screenshots must match exactly. The header
gets 400ms to settle after scroll before capture. Keyboard selection, draft
preview, Escape and focus restoration use the real editor. No Save occurs here.
An anonymous request must still be denied by current platform B. A new context
then fetches a retained font that neither A page loaded earlier.

The browser command verifies retained bytes and measures only its owned guarded
servers. It records each canonical root, origin, build ID and receipt fingerprint,
then rechecks identity after capture. Child death or changed source/output fails
proof. PASS is written only after postchecks and successful owned shutdown.

The generic receipts do not bind an accepted retained package to those roots.
The setup compatibility check and retained-byte visual checks still apply.
Accepted-package/build identity remains a separate prerequisite. Historical
package comparisons remain historical visual evidence.

Reports appear under gitignored test-results. PASS is written after browser
cleanup. Open the screenshots before acceptance. Separately run the existing
homepage save, recovery, template-parity and populated-kit browser tests against
restored A. Run shared-fixture writers serially and verify restored Alpha state.
The proof command stops only its owned process groups, including after failures.
It waits for their exit before releasing locks and escalates TERM to KILL if needed.
Abrupt termination can leave locks. Check that the owned process has stopped
before removing a stale lock; see the build-provenance guide.

## What this establishes

The proof demonstrates actual retained-source reconstruction with current
platform endpoints. It records loaded JavaScript hashes, but does not require
original JavaScript bytes. Public content and authorized preview use the same
existing renderer. Current authorization, persistence and receipt rules stay
outside the retained source package.

This does not activate an assignment or prove hot runtime rollback. Root styles,
fonts and tenant/editor mounting are still shared compatibility contracts.
Google fonts still need a build-time fetch. External video is blocked, so the
rehearsal makes no latency, LCP or live video claim. Full shell/style isolation,
binding-aware saves and deployment coordination remain SITE-05 gates.
