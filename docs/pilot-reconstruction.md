# Verify the reconstructed pilot

This local rehearsal runs the actual Academy homepage and authorized editor
from a retained source package. It compares unchanged A, deliberately changed B,
and retained A reconstructed over current platform B.

## Prepare the controls

Create an accepted package with the [package tool](pilot-source-package.md).
Commit tracked changes before this setup command. It copies the current commit
into private temporary folders and never changes the working application.
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
Keep the temporary folders private. Build each app, then serve changed B and
restored A on separate loopback ports. Serve the original accepted build on a
third port. On the VM, run these commands through `onzio shell`.

```bash
cd /absolute/path/to/changed
npx tsx scripts/run-pilot-reconstruction.ts build
npx tsc --noEmit
npx tsx scripts/run-pilot-reconstruction.ts start --port 3127
```

Repeat the guarded build and start commands for restored A on port 3126. In
the original accepted A checkout, use the guarded start command on port 3125.
If that checkout predates the launcher, invoke the launcher's absolute path
from the current checkout while keeping the accepted app as your working folder.
Keep the synthetic Alpha fixture on its seeded Academy assignment.

The launcher resolves and checks the environment again immediately before each
Next build or start. It passes that checked environment to the child process
and binds starts to `127.0.0.1`. Use these guarded commands throughout the
rehearsal. Direct `npm run build` or `next start` commands bypass these checks.

## Run the browser checks

Use the existing local login helper against the baseline app. On this Linux VM,
make a temporary helper copy that changes port 3110 to the baseline port and
`/private/tmp/onzio-homepage-tests` to a private folder under `/tmp`. Export
.env.test before running it. Never commit the resulting browser authentication.

From the main checkout, pass that storage-state path to the rehearsal.

```bash
npx tsx scripts/prove-pilot-reconstruction.ts \
  --package /absolute/path/to/release-a --digest ACCEPTED_DIGEST \
  --baseline http://alpha.localhost:3125 \
  --changed http://alpha.localhost:3127 \
  --restored http://alpha.localhost:3126 \
  --auth /absolute/path/to/private-local-auth.json
```

The browser permits only the three explicit local origins and local Supabase.
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

Reports appear under gitignored test-results. PASS is written after browser
cleanup. Open the screenshots before acceptance. Separately run the existing
homepage save, recovery, template-parity and populated-kit browser tests against
restored A. Run shared-fixture writers serially and verify restored Alpha state.
Stop only the servers started for this rehearsal when finished.

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
