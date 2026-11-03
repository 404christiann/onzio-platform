# SITE-07 #56 local code-site parity checkpoint

Status: `in_progress`. This record is partial focused evidence, not the full
32-capture pre/post acceptance matrix or the complete #53 A/B/A proof.

The exact #53 source `fee1c5ba10b2935e3a9c7cefb0ede2bb01c77f49` and
#56 integration source `c236ae768f467e3189d26de274539e7ba042ed10` were
checked out in separate clean detached worktrees. Both guarded production builds
exited 0 under the shared local lock with vetted loopback environment files.
`manifest.json` records their build IDs and SHA-256 receipt hashes.

Seven before/after PNG pairs are byte-identical: public home, program detail,
roster, schedule and Shop at 1440 px, plus the About admin preview at 1440 and
390 px. All 14 synthetic-fixture screenshots are in `partial-pairs/` with their
SHA-256 values in `manifest.json`. The isolated About diagnostic had a PASS
report for its two widths with equal visible text, links, headings, controls,
reads, redirects and image hashes. The first five public pairs completed before
the full run stopped; no complete matrix verdict is claimed from them.

The first full attempt stopped on an 8-second local PostgreSQL fingerprint
timeout before browser capture. The second captured the five public desktop pairs
and then timed out waiting for the About iframe. A focused rerun proved that
About loads and matches at both widths; the shared page shell appears before its
iframe. The next full attempt stopped during local sign-in before capturing a
page, with the local host at load average about 21. The owned fixture from every
attempt is `verified-clean`, including the last one recovered with a narrowed
60-second timeout in the recovery-only SQL session. No hosted endpoint was used.

The parity harness now asserts the expected route after navigation and allows
60 seconds for a preview iframe. The unchanged 8-second normal proof timeout
still fails closed when the loaded host cannot provide a reliable result.

The nine unverified pairs are phone public home/program detail/roster/schedule/
Shop and desktop/phone Programs and Shop admin previews. Exact next step: run
`scripts/prove-code-site-parity.ts` with the committed config contract against
fresh genuine #53 and #56 builds on a reliable local machine, inspect its
32-capture report and cleanup journal, and finish independent final-head review.
The complete #53 architecture run and full #56 verifier remain deferred under
Christian's local-development direction. Hosted rollout, PR publication,
deploy and merge remain separate.

## November 3 resumed comparison

The complete focused run against the two exact roots above captured all 32 PNGs.
The report was FAIL. Fifteen pairs were byte-identical. The phone homepage differed
by 2,904 pixels in the sponsor image, and the three request differences were
insertion order only, with all keys and counts equal. The report and images are
in `test-results/code-site-parity-T9fi50/`. The owned recovery journal reports
`verified-clean`.

The next run uses anonymous public captures, owner preview captures, and
order-independent request-map comparisons. Screenshot equality remains exact.
The final #56 candidate still requires its own parity and full retained-release
proof. The existing #53 packages reject reconstruction on #56 because the
attested homepage capability source changed. New A/B package digests require
Christian's acceptance before they can be used for the full proof.
