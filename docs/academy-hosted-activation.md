# Diverse City Academy rollout

Christian approved preparation on November 3, 2026. A read-only #80 preflight later the same day found that the public Diverse City site already serves the code-authored Academy shell on the current shared Vercel deployment. Christian then accepted a shared-project rollout and rollback affecting Rose City for now, stating that Rose City is not yet a paying customer. This does not approve a specific production change. No agent switched traffic, assigned a release, or changed hosted data during the preflight. The earlier plan to switch Diverse City from a distinct prior design still needs a new target and restoration proof before any production action.

[Decision record in #54](https://github.com/404christiann/onzio-platform/issues/54#issuecomment-6612002195) · [#80 preflight](verification/site07-shell/ticket-80/README.md)

| When | Owner | What must happen |
| --- | --- | --- |
| Before scheduling | Christian and the release operator | The shared-project effect is accepted for now. Confirm the current tenant domains, aliases, and traffic inventory for the specific change. |
| Before scheduling | Implementation owner | Identify a fallback that actually restores the intended Diverse City visual and editor state. Prove the target, both tenants' routes and previews, and an exact way back to the starting deployment. Hosted staging proof remains deferred by Christian. |
| Before any production change | Release operator | Confirm the exact current deployment and source commit, current alias inventory, production migration parity, and backup requirements. Stop on a mismatch. Do not use an older deployment merely because it is `READY`. |
| During an approved window | Release operator | Apply only the separately approved, proven change. Check both Diverse City and Rose City public routes and owner editor previews, alias mapping, cache behavior, and runtime errors. |
| If a check fails | Release operator | Restore the recorded starting deployment by the proven exact method and verify both tenants again. |
| After checks pass | Christian and the release operator | Record the decision, action, checks, and exact restoration target in #54. |

The #80 preflight does not establish a proven production rollback for the present Academy release. The older inspected deployment already used Academy styling; Vercel's Hobby rollback is limited to the immediately previous production deployment, and named promotion remains unproven. For a future single production deployment, the recorded starting deployment could be the one-step project-wide rollback target if no other production deployment intervenes. That procedure has not been exercised here. No production window is ready to schedule.

## Rose City public hold and 2027 release

On November 3, Christian chose a temporary public-only Rose City lock while its 2027 revamp is prepared. The proposed middleware rule blocks Rose City public pages, direct internal site paths, and new registration submissions with uncached 404 responses. Owner admin routes and inline editing previews remain available. Existing media URLs remain public. The rule has not been merged or deployed, so it does not yet change the live site.

Treat the lock and the 2027 replacement as separate shared-project releases. For each, record the exact starting deployment and an eligible restoration target, then verify Rose City and Diverse City public pages, admin editing, aliases, and cache behavior. The 2027 implementation is currently in a separate dirty checkout behind main; integrate and review it before treating it as a release candidate. Hosted staging remains deferred, so local checks alone cannot satisfy the hosted #54 gate. Christian must approve each specific production change and release window.
