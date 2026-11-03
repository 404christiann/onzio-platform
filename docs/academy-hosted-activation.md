# Diverse City Academy rollout

Christian approved preparation on November 3, 2026. A read-only #80 preflight later the same day found that the public Diverse City site already serves the code-authored Academy shell on the current shared Vercel deployment. No agent switched traffic, assigned a release, or changed hosted data during that preflight. The earlier plan to switch Diverse City from a distinct prior design therefore needs a new target and rollback decision before any production action.

[Decision record in #54](https://github.com/404christiann/onzio-platform/issues/54#issuecomment-6612002195) · [#80 preflight](verification/site07-shell/ticket-80/README.md)

| When | Owner | What must happen |
| --- | --- | --- |
| Before scheduling | Christian and the release operator | Decide whether a shared-project traffic switch that also affects Rose City is acceptable. Confirm the current tenant domains, aliases, and traffic inventory. |
| Before scheduling | Implementation owner | Identify a fallback that actually restores the intended Diverse City visual and editor state. Prove the target, both tenants' routes and previews, and an exact way back to the starting deployment. Hosted staging proof remains deferred by Christian. |
| Before any production change | Release operator | Confirm the exact current deployment and source commit, current alias inventory, production migration parity, and backup requirements. Stop on a mismatch. Do not use an older deployment merely because it is `READY`. |
| During an approved window | Release operator | Apply only the separately approved, proven change. Check both Diverse City and Rose City public routes and owner editor previews, alias mapping, cache behavior, and runtime errors. |
| If a check fails | Release operator | Restore the recorded starting deployment by the proven exact method and verify both tenants again. |
| After checks pass | Christian and the release operator | Record the decision, action, checks, and exact restoration target in #54. |

The #80 preflight does not establish a production rollback path. The older inspected deployment already used Academy styling; Vercel's Hobby rollback is limited to the immediately previous production deployment, and named promotion remains unproven. No production window is ready to schedule.
