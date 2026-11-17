# Codex verification pilot (#59)

The pilot is complete. This workspace-write sandbox cannot run the full verification set successfully. Types, lint, contracts, Git reads, and the shared lock work. Architecture and build checks fail in both the ticket worktree and the baseline. Database and whole-suite commands stop at a local connection preflight.

Run date: 2026-10-31 America/Los_Angeles (2026-11-01 UTC). Branch: `agent/site59-pilot-prove-the-codex-loop-can-run-the-v`. Source revision: `bc4abfe204d5dffa8df62f64b3a7b85198766cda`, identical to `origin/main`. The initial working tree was clean. Node v22.23.4; npm 10.9.9; Vitest v4.1.10; Next.js 15.5.22.

This ticket evaluates the loop itself and is outside spec #41. Only this report and one new top entry in `HANDOFF.md` change. No product, test, migration, configuration, dependency, or SITE ledger change was made. No commit, publication, merge, deployment, hosted-data mutation, Supabase CLI, Stripe, DNS administration, or email operation was performed. The authorized local API probes were read-only.

## Verification set

| Check | Command | Ran? | Result and counts |
| --- | --- | --- | --- |
| Types | `npx tsc --noEmit` | Yes | Passed, exit 0; no diagnostics. |
| Lint | `npm run lint` | Yes | Passed, exit 0; no ESLint warnings or errors. Next also prints its `next lint` deprecation notice. |
| Contracts | `npm run test:contracts` | Yes | Passed, exit 0; 1,483 tests across 117 files. |
| Architecture | `npm run test:architecture` | Yes | Failed, exit 1; 89 passed, 112 failed, 56 skipped out of 257 tests; 3 passed and 7 failed files out of 10; 1 unhandled error. Baseline has identical counts and failure identities. See comparison below. |
| Database | `scripts/with-local-db-lock.sh npm run test:db` | Not run | Not run: sandbox blocked it. The lock-wrapped preflight returned local API TCP `EPERM`; it did not launch npm. No database assertions ran. |
| Whole suite | `scripts/with-local-db-lock.sh npm test` | Not run | Not run: sandbox blocked it. Its separate lock-wrapped preflight returned local API TCP `EPERM`; it did not launch npm. The whole suite includes database tests. |
| Build | `scripts/with-local-db-lock.sh npm run build` | Yes | Failed, exit 1; `getaddrinfo ENOTFOUND fonts.googleapis.com`. Five `next/font` failures: DM Sans, Geist, Geist Mono, Inter, and Montserrat. Baseline has the same five failures. No successful build or page-generation count. |

The database and whole-suite rows name the required commands, not commands that completed. These are the exact guarded attempts; each exited 1 before spawning npm. The wrappers serialize their preflights with both build attempts and release the lock on exit.

```sh
scripts/with-local-db-lock.sh node -e 'const net=require("net"),cp=require("child_process");const s=net.connect({host:"127.0.0.1",port:54321});s.on("connect",()=>{s.end();const r=cp.spawnSync("npm",["run","test:db"],{stdio:"inherit"});process.exitCode=r.status??1});s.on("error",e=>{console.log("npm run test:db not run: sandbox blocked local API ("+e.code+")");process.exitCode=1});s.setTimeout(3000,()=>{s.destroy();console.log("npm run test:db not run: local API timeout");process.exitCode=1})'
scripts/with-local-db-lock.sh node -e 'const net=require("net"),cp=require("child_process");const s=net.connect({host:"127.0.0.1",port:54321});s.on("connect",()=>{s.end();const r=cp.spawnSync("npm",["test"],{stdio:"inherit"});process.exitCode=r.status??1});s.on("error",e=>{console.log("npm test not run: sandbox blocked local API ("+e.code+")");process.exitCode=1});s.setTimeout(3000,()=>{s.destroy();console.log("npm test not run: local API timeout");process.exitCode=1})'
```

## Sandbox probes

Each command below was run. Permission checks were read-only; no Git write was attempted.

| Probe | Exact one-line command | Result |
| --- | --- | --- |
| Git status | `git status --short --branch` | Exit 0; requested branch tracking `origin/main`, initially clean. |
| Git diff | `git diff --exit-code` | Exit 0; initially no differences. |
| Git metadata permissions | `python3 -c 'import os,subprocess; from pathlib import Path; p=Path(subprocess.check_output(["git","rev-parse","--absolute-git-dir"],text=True).strip()); c=Path(subprocess.check_output(["git","rev-parse","--git-common-dir"],text=True).strip()).resolve(); print(".git marker writable:",os.access(".git",os.W_OK)); print("worktree git directory writable:",os.access(p,os.W_OK)); print("common git directory writable:",os.access(c,os.W_OK)); print("writable metadata entries:",sum(os.access(Path(root)/name,os.W_OK) for base in {p,c} for root,dirs,files in os.walk(base) for name in dirs+files))'` | Exit 0; `.git` marker, actual worktree Git directory, and common Git directory all report `False`; 0 writable metadata entries. This is an access probe, not an attempted write. |
| Lock acquire and release | `scripts/with-local-db-lock.sh true && ONZIO_DB_LOCK_WAIT=0 scripts/with-local-db-lock.sh true` | Exit 0; both acquisitions succeed. The second immediate acquisition proves the first caller released the default lock. |
| Local Supabase HTTP | `curl --noproxy '*' --connect-timeout 3 --max-time 5 -sS -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:54321` | Exit 7; `HTTP 000`; `Failed to connect to 127.0.0.1 port 54321 after 0 ms: Couldn't connect to server`. No HTTP response or body. The separate Node preflights above identify `EPERM`. |
| Installed dependencies | `node -e 'const fs=require("fs"); console.log("node_modules="+fs.existsSync("node_modules")+"; installed_lock="+fs.existsSync("node_modules/.package-lock.json")+"; tsc="+fs.existsSync("node_modules/.bin/tsc")+"; vitest="+fs.existsSync("node_modules/.bin/vitest")+"; next="+fs.existsSync("node_modules/.bin/next"))'` | Exit 0; all five values `true`. The runner-provided installation is present; `npm ci` was not rerun. Presence does not independently prove the historical install command. |
| Process inspection needed by architecture tests | `ps -Ao pgid=,pid=,stat=` | Exit 127; `zsh:1: operation not permitted: ps`. |

Environment presence checks reported `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, and `SUPABASE_TEST_SERVICE_ROLE_KEY` present. A hostname-only boolean check confirmed the test URL is loopback. `SUPABASE_TEST_JWT_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` were absent. No credential values were printed, and no `.env*` or authentication-state file was opened directly. The build failed during font fetching, so its later environment requirements remain unverified.

The connection denial does not establish whether the local Supabase service is running outside the sandbox. No service was started, stopped, reset, or reconfigured.

## Baseline comparison

Both failing checks were rerun with their exact commands in a temporary source snapshot of `origin/main` under `/tmp/onzio-ticket-59-baseline-g905o__u`. Installed dependencies were reused through a `node_modules` symlink. All 1,109 copied tracked files were checked against their Git blob IDs. The only omitted tracked file was `.env.test.example`, excluded to honor the environment-file prohibition. No test or configuration was edited. This is a source snapshot, not another checkout or a write to the main repository.

| Command | Ticket worktree | Baseline |
| --- | --- | --- |
| `npm run test:architecture` | Exit 1; 89 passed, 112 failed, 56 skipped; 3 passed files, 7 failed files; 1 error | Exit 1; 89 passed, 112 failed, 56 skipped; 3 passed files, 7 failed files; 1 error |
| `scripts/with-local-db-lock.sh npm run build` | Exit 1; five Google Fonts download errors | Exit 1; same five font names and `ENOTFOUND fonts.googleapis.com` |

The architecture comparison matched all 112 failed test names and both failed suite hooks. Error summaries, cleanup-error markers, timeout markers, and reported stack locations had zero differences for those 114 identities. File-level counts also matched. Durations and absolute checkout paths were not compared. These failures pre-exist the documentation change in this sandbox; the comparison does not establish that the application is green elsewhere.

| Architecture file | Ticket result | Baseline result |
| --- | --- | --- |
| `pilot-proof-servers.test.ts` | 47 total; 46 failed, 1 passed | Same |
| `pilot-reconstruction-build.test.ts` | 61 total; 55 failed, 5 passed, 1 skipped | Same |
| `pilot-accepted-build-identity.test.ts` | 35 total; 35 skipped after suite-hook failure | Same |
| `pilot-source-package.test.ts` | 30 total; 1 failed, 29 passed | Same |
| `pilot-reconstruction-environment.test.ts` | 31 total; 2 failed, 29 passed | Same |
| `pilot-site-coordination.test.ts` | 20 total; 20 skipped after suite-hook failure | Same |
| `pilot-owned-scope.test.ts` | 12 total; 8 failed, 4 passed | Same |
| Remaining three architecture files combined | 21 passed | Same |

The observed skipped counts are Vitest output, not passing assertions. No skip, test, assertion, or timeout setting was changed.

Of the 114 failed test/hook identities, 109 include `UnsafeReconstructionCleanupError: Could not inspect configuration process group; local lock retained`. `scripts/pilot-reconstruction-next.ts:11` invokes the denied `ps` command. Cleanup is not proven under this restriction. The owned-listener case times out at 15,000 ms and produces the unhandled `listen EPERM: operation not permitted 127.0.0.1` error. The timed-out configuration-child case reports a `spawnSync` timeout. The other three failures report child exit 1 where exit 0 was required; their matching assertions alone do not identify a separate cause.

Run logs were captured in `/tmp/onzio-ticket-59-contracts.log`, `/tmp/onzio-ticket-59-architecture.log`, `/tmp/onzio-ticket-59-build.log`, `/tmp/onzio-ticket-59-baseline-architecture.log`, and `/tmp/onzio-ticket-59-baseline-build.log`. These are temporary local evidence; the durable results and comparison are recorded here.

## Recommendation

Have the runner perform architecture, database, whole-suite, and build verification in an environment that permits process inspection and local socket listening/connections, with a running local Supabase and the required local test/build environment supplied securely. The build also needs access to its Google Fonts downloads. Alternatively, provide those capabilities to the sandbox, then rerun the checks on the exact runner-created revision. Keep database and whole-suite runs serialized with the existing lock. The current sandbox is sufficient for types, lint, contracts, and documentation work, but not full ticket verification.
