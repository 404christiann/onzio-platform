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

## Accepted packages and exact comparison status

Christian accepted the following local packages on November 3.

- A from `ad441ee54447d813c9453313713d2b142f8668ee`, digest `e6a83f81b1861d848fcb0101b4afb54e7b9578c0ceb324e34bb1fe85659beca2`.
- Changed B from `bae65600a982c5caf261a4890e1cbabf2d265b77`, digest `f6e4a02b656252dffde3c6b9af458f65c5d3bc05c0c0bf7dcf337726d6b5b92f`.

The guarded source and three reconstruction builds passed. Package and build
receipts are in `/private/tmp/onzio56-full-89JbCy/`. The focused browser proof
at `0539b497414db29e09bfee3469f6db7c591a32e5` checked all 16 pairs. All
recorded behavior fields match. Thirteen PNGs match exactly. A targeted capture
that waits for the header and sponsor images to paint matched Program Detail
and phone home. The phone Shop jersey still differs by 28,133 pixels.

- Focused report and PNGs: `test-results/code-site-parity-m1dqB0/`.
- Targeted repaint report and PNGs: `test-results/code-site-parity-yofu6b/`.
- Full rollback captures: `test-results/pilot-site-coordination-fCVPks/`.

The full rollback ran to the phone screenshot comparisons and captured 186
PNGs. The strict comparison failed on phone Logo. Offline inspection of the
52 unchanged document pairs also finds the phone Shop difference. The fixtures
were verified clean. Invalid-assignment captures and the final PASS report
were not reached in this run. Keep the issue in progress until the remaining
exact comparisons and the human-run guarded verifier pass.
