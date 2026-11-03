# Diverse City Academy rollout

Christian gave the go-ahead on November 3, 2026 to prepare the rollout. The switch will move Diverse City FC to an approved Academy release. Its current site remains the fallback until the switch passes the checks below.

[Decision record in #54](https://github.com/404christiann/onzio-platform/issues/54#issuecomment-6612002195) · [Implementation in #80](https://github.com/404christiann/onzio-platform/issues/80)

| When | Owner | What must happen |
| --- | --- | --- |
| Before scheduling | Christian and the release operator | Confirm the domains and traffic that belong to Diverse City FC. Admit only this club. |
| Before scheduling | Implementation owner | Finish #80. Prove that staging can serve an approved, retained release, switch to it, and restore the previous release across public pages and editor previews. |
| Before the production deploy | Release operator | Compare all checked-in migrations, including SITE-06A through 06F, with the live ledger. Stop on a mismatch and resolve it through the production migration procedure. Verify the approved release and rollback target are available to the deployment. |
| During the agreed window | Release operator | Check that the deployment can serve the new release, record the current assignment, and switch only Diverse City FC through the operator endpoint. Verify the cache serves the selected release and check public routes and editor previews. |
| If a check fails | Release operator | Restore the recorded assignment and binding. Verify the old site is serving again, including after cache refresh. |
| After the checks pass | Christian and the release operator | Record the release, the checks, and the rollback target in #54. |

The local acceptance and rollback evidence is in [PR #77](https://github.com/404christiann/onzio-platform/pull/77). The production window is set after #80 passes staging.
