# DCFC-504 Staging Identity, Recovery, and MFA Approval Packet

Epic: `DCFC-EPIC-002`

Status: `in_progress_private_invitation_acceptance`

Last updated: 2026-08-02

This packet defines the exact Class 3 boundary for `DCFC-504`. It prepares a
first-time-owner recovery and MFA acceptance using the existing Diverse City
staging owner identity. It does not authorize a send or any Auth mutation by
itself. At preparation time execution required Christian's fresh approval and
availability for the private password and TOTP steps; the approval and stopped
pre-send attempt are recorded below.

Christian approved this exact packet on 2026-08-02 by replying "I approve
this." The pre-send sequence then stopped before any recovery request because
the live Supabase Auth redirect allowlist does not contain the Diverse City
staging hostname. The approval is not exhausted by a send, but it expressly
excluded Auth configuration changes and cannot repair that prerequisite.

Christian then approved the exact minimal Auth remediation quoted below. Codex
added only the Diverse City callback as the fourth redirect URL and performed a
fresh dashboard reload. The Site URL and original branch, Alpha, and Bravo
entries remained byte-for-byte unchanged; the reloaded allowlist contained
exactly those three entries plus the approved Diverse City callback. No other
Auth setting changed and no email was sent during remediation. The protected
Diverse City recovery form is now handed to Christian for private owner-email
entry and the one approved submission.

Christian submitted that prepared form exactly once. The request reached
Supabase Auth, but no recovery message was generated because the privately
entered address is not an Auth identity in this staging project. The current
Diverse City owner membership is linked to a confirmed `example.com` identity,
not the intended real operator identity. The one-request approval is therefore
exhausted at a safe stop: do not resend or alter identity/membership state
without a fresh exact remediation approval.

## Exact Targets and Identity Decision

- Supabase staging project: `fxefqnoqxbezeccjvrsw`
- Diverse City tenant: `d88bf71b-9820-49ae-9dc0-7556b0813885`
- Verified protected hostname:
  `diverse-city-onzio-staging.vercel.app`
- Auth callback:
  `https://diverse-city-onzio-staging.vercel.app/admin/auth/callback`
- Recovery request entry:
  `https://diverse-city-onzio-staging.vercel.app/admin/login`
- Recovery code entry:
  `https://diverse-city-onzio-staging.vercel.app/admin/recover`
- Intended role: the one existing active `owner` membership
- Intended recipient: Christian's existing staging operator/owner identity,
  resolved privately at execution time and never written to Git, chat, logs,
  screenshots, or command output
- Identity strategy: reuse the existing confirmed Auth identity and existing
  owner membership; create no Auth user and no membership
- Message strategy: exactly one password-recovery request initiated through
  the deployed Onzio staging login, not a dashboard-generated link and not a
  direct Resend/API send
- MFA strategy: exercise the first-time-owner path by enrolling and verifying
  one TOTP factor after password recovery and fresh password sign-in

The reuse decision is deliberate. Read-only staging preflight found exactly
one active Diverse City owner and one linked confirmed email identity. That
identity has a password hash but no prior sign-in, no TOTP factor, and no
active session. Creating or inviting another user would duplicate the approved
owner role without improving acceptance coverage.

## Read-Only Baseline

Safe aggregate preflight on 2026-08-02 found:

- project Auth users: seven
- project MFA factors: five, all verified
- Diverse City memberships: one active owner, zero admins, zero removed
- linked/confirmed owner Auth identities: one
- owner email identities: one
- owner prior sign-ins: zero
- owner TOTP factors: zero
- owner active sessions: zero
- owner currently banned/deleted state: zero

No email address, user UUID, password hash, session identifier, factor
identifier, token, action URL, or SMTP credential was returned or recorded.

## Approved Execution Preflight and Remediation

The approved pre-send run on 2026-08-02 verified:

- custom staging SMTP is enabled; its stored password was not revealed or
  accessed
- TOTP is enabled and AAL1 sessions remain limited to 15 minutes
- all seven automatic security-notification switches, including password
  changed and MFA method added/removed, are off, so the approved recovery and
  enrollment would not silently create extra messages
- the reset template uses `RedirectTo` with a token hash and recovery type,
  which makes the request's clean tenant callback authoritative
- the Auth Site URL remains the protected staging branch hostname
- the redirect allowlist contains exactly the staging branch wildcard, Alpha
  wildcard, and Bravo wildcard; it does not contain the Diverse City hostname
- the safe identity baseline remained unchanged after the stop: seven project
  Auth users, five project MFA factors, one confirmed active Diverse City
  owner, zero owner prior sign-ins, zero owner factors, and zero owner sessions

The deployed recovery request derives
`https://diverse-city-onzio-staging.vercel.app/admin/auth/callback` from
`window.location.origin`. Current Supabase guidance requires `redirectTo` to
match the configured redirect allowlist. Sending without that entry could fall
back to the staging Site URL rather than the verified tenant hostname and would
violate this packet's callback acceptance criterion. Therefore no recovery
request, Auth session, factor, user, membership, or configuration mutation was
performed.

### Required Minimal Remediation

The smallest safe change is to add exactly this fourth redirect URL:

```text
https://diverse-city-onzio-staging.vercel.app/admin/auth/callback
```

Retain the existing Site URL and all three existing redirect entries. Do not
add a wildcard, change a template, change SMTP, or alter another Auth setting.
After save, reload and verify the exact four-entry allowlist before returning
to the already-approved one-recovery sequence.

This remediation is outside the approved packet because Auth configuration
changes were explicitly excluded. It requires this additional approval:

> I approve the DCFC-504 pre-send Auth remediation in Supabase staging project
> `fxefqnoqxbezeccjvrsw`: add exactly
> `https://diverse-city-onzio-staging.vercel.app/admin/auth/callback` as the
> fourth Auth redirect URL, retain the existing Site URL and three redirect
> entries unchanged, and reload-verify the exact result. After that verification,
> continue the already-approved single-recovery DCFC-504 sequence. This does
> not authorize any other Auth/SMTP/template/rate-limit change, extra email,
> Vercel change, Stripe, DNS, production, Bunny.net, Phase 6, commit, or push.

Christian supplied that exact approval on 2026-08-02. The resulting hosted
mutation was exactly one new Auth redirect entry. Reload verification proved:

- Site URL unchanged:
  `https://onzio-platform-staging-git-staging-404christianns-projects.vercel.app`
- original staging branch wildcard unchanged
- original Alpha wildcard unchanged
- original Bravo wildcard unchanged
- fourth entry exactly:
  `https://diverse-city-onzio-staging.vercel.app/admin/auth/callback`
- total redirect URLs: four

No SMTP, template, rate-limit, notification, provider, user, membership,
session, factor, Vercel, Stripe, DNS, production, Bunny.net, Phase 6, Git,
commit, or push change occurred. At this remediation checkpoint no message had
been sent; the later single-request outcome is recorded below.
Post-remediation aggregate SQL reconciliation remained seven Auth users, five
verified project factors, one active Diverse City owner, and zero owner prior
sign-ins, factors, or sessions.

## Single Approved Request Outcome — No Message Generated

Christian privately submitted the deployed recovery form once on 2026-08-02.
Safe evidence shows:

- Supabase Auth recorded one `POST /recover` at `2026-08-02T20:57:58Z` with
  HTTP 200 and no API handoff error
- the one active Diverse City owner's `recovery_sent_at` remained null
- all seven staging Auth identities still have null `recovery_sent_at`
- the current owner identity is confirmed but has the non-deliverable
  `example.com` domain
- the privately entered address is not present in staging Auth
- Resend contains no new email record; its newest visible records predate this
  request by five days
- users, memberships, sessions, factors, SMTP, templates, rate limits, and the
  four-entry Auth URL configuration remained unchanged after the request

Supabase's non-enumerating recovery behavior returns a successful response even
when the supplied address does not identify a user. The HTTP 200 therefore did
not prove that a message was created. The null `recovery_sent_at` and absent
Resend record prove this attempt did not generate or deliver an email.

This invalidates the packet's earlier identity-reuse assumption and exposes an
identity-linkage discrepancy in the `DCFC-502` closeout: the tenant has one
active owner, but that owner is not the intended deliverable staging operator
identity. Do not retry the recovery request. The smallest next package must
privately resolve one existing confirmed real staging identity, atomically
establish it as the sole Diverse City owner through the audited operator
boundary, reconcile the replaced synthetic membership and audit trail, and
separately authorize exactly one new recovery request. If no approved existing
identity is suitable, Auth-user creation/invitation is a different remediation
and requires its own explicit scope.

## Original Authorized Sequence — Exhausted

Only this sequence is authorized after Christian supplies the exact approval:

1. Reconfirm the aggregate baseline, exact tenant/host, protected deployment,
   staging-only Auth URL allowlist, custom SMTP posture, TOTP availability,
   and whether automatic password/factor security notifications are enabled.
   If an unapproved automatic message could be generated, stop before sending.
2. Christian privately enters the existing owner email in the deployed staging
   recovery form. Submit exactly once. Do not use Supabase dashboard link
   generation, `inviteUserByEmail`, `generateLink`, a Resend SDK/API, or a
   second password-reset path.
3. Record only the provider message ID, delivery status, timestamp, and
   recipient domain. Do not open or record the message body, action URL, code,
   token, or mailbox content.
4. Christian uses only the newest message and privately completes the verified
   staging callback/code flow. Codex must not read, receive, type, record, or
   screenshot the recovery code or action URL.
5. Christian privately sets the password. Codex must not read, receive, type,
   record, or screenshot it. Because the owner has no enrolled factor, the
   expected recovery assurance is AAL1/AAL1 before the password update.
6. End the recovery session, sign in with the new password, enroll exactly one
   TOTP factor, and verify it to reach AAL2. Christian handles the QR/secret and
   authenticator code privately; neither may appear in evidence.
7. Prove AAL1 is rejected and AAL2 reaches the Diverse City admin. Verify
   Starter-accessible Contact/admin behavior, Pro-only Programs/Tryouts denial,
   admin-shell tenant identity, owner billing-route reachability, and fail-
   closed replay/forgery handling without changing content or billing state.
8. Sign out/revoke any temporary or unexpected sessions, reconcile exact Auth,
   membership, factor, session, and audit counts, update the rollout ledgers,
   and stop before `DCFC-601`.

## One-Send and Secret-Handling Boundary

The approval authorizes one user-requested staging password-recovery message.
It does not authorize an invitation, magic link, replacement recovery, resend,
production message, or shared SMTP/template/rate-limit change. Any retry needs
a new explicit one-send approval.

Automatic Supabase security notifications for password or MFA changes are not
silently included. Their enabled state must be read-only reverified before the
recovery request. If either would create an additional message, execution must
stop and Christian must approve the exact additional notification boundary.

Supabase Auth remains the sole v1 authentication sender through the existing
staging custom SMTP configuration. Do not install or call the Resend SDK, add a
public send route, create a second reset flow, access SMTP/Resend credentials,
or alter sender/domain/template/rate-limit settings.

## Acceptance Evidence

`DCFC-504` is complete only when all of the following are recorded safely:

- exactly one active Diverse City owner and zero duplicate users/memberships
- exactly one approved recovery request and one safe provider delivery record
- callback resolves only through the verified protected staging hostname
- recovery/password path succeeds without recording a password, code, token,
  action URL, QR code, TOTP secret, or authenticator value
- expired, reused, forged, unsupported, and caller-supplied redirects fail
  closed
- AAL1 cannot load protected admin or perform a mutation
- the owner reaches AAL2 with exactly one verified TOTP factor
- Starter Contact/admin behavior is available; Programs/Tryouts remain denied
  before billing; the owner-only billing boundary is correctly enforced
- no extra identity, membership, session, factor, or audit artifact remains
- tenant lifecycle/tier/public-access and all content/media/presentation/
  subscription state remain unchanged

Provider delivery does not by itself prove inbox placement, callback,
password, MFA, or protected-admin acceptance.

## Rollback and Stop Conditions

Stop immediately on a recipient mismatch, duplicate identity/membership,
unexpected callback host, extra send, rate-limit response, token exposure,
unexpected Auth notification, factor/session mismatch, AAL1 access, tenant
scope failure, or any requested action outside this packet.

If the recovery flow fails, do not send again. Revoke unexpected sessions,
delete only an unintended new factor, expire the current link by waiting or by
an approved replacement later, and retain the pre-existing Auth user and owner
membership. They predate `DCFC-504` and are not rollback-created resources.
If the new factor is verified but later acceptance fails, retain it only if
Christian confirms it is usable; otherwise remove it through the approved Auth
boundary and record the factor-count reconciliation. Never delete the existing
owner identity or membership ad hoc.

## Explicit Exclusions

This packet does not authorize:

- a new Auth user, invitation, second membership, or role change
- more than one recovery request or any replacement/retry message
- Auth/SMTP/template/rate-limit/security-notification configuration changes
- Vercel configuration, deployment, alias, protection, or environment changes
- Stripe, billing projection, lifecycle changes, or `DCFC-601`
- content/media/presentation changes or re-import
- DNS, production, public launch, indexing, or Phase 6 acceptance
- Bunny.net credentials, libraries, uploads, references, video integration, or
  a Diverse City-specific video branch
- commit, push, pull request, or unrelated repository changes

Diverse City keeps the approved crest-led hero and hidden vertical video story.
Bunny remains a separate reusable tenant-safe capability outside Phase 5.

## Original Approval Language — Exhausted

> I approve DCFC-504 for Supabase staging project
> `fxefqnoqxbezeccjvrsw`, Diverse City tenant
> `d88bf71b-9820-49ae-9dc0-7556b0813885`, and protected hostname
> `diverse-city-onzio-staging.vercel.app`. Reuse my existing confirmed staging
> owner identity and its existing owner membership, both resolved privately;
> do not create another Auth user or membership. I authorize exactly one
> password-recovery request initiated through the deployed Onzio staging login,
> private callback/password completion, one TOTP enrollment and verification,
> AAL1/AAL2 protected-admin acceptance, and required reconciliation, session/
> factor cleanup, and fail-closed link checks. Do not record or handle my email
> address, password, recovery code, action URL, session token, QR code, TOTP
> secret, or authenticator code. Stop before sending if automatic password or
> MFA security notifications would create an unapproved additional message.
> This does not authorize any invitation or second email, a new identity or
> role, Auth/SMTP configuration changes, DCFC-601, Stripe, Vercel changes or
> deployment, content/media/presentation changes, DNS, production, Bunny.net or
> video integration, Phase 6, commit, or push.

Approval is exhausted after the single recovery request and the reconciled
`DCFC-504` acceptance attempt. A retry or replacement message requires fresh
approval.

## Approved New-Identity Remediation — In Progress

Christian confirmed in chat that the intended owner is the privately supplied
address that is absent from staging Auth. The exact address must remain out of
Git, command output, screenshots, logs, and rollout evidence; only its provider
domain may appear in safe delivery evidence. Because no existing Auth identity
matches it, the correct platform path is one operator-issued invitation, not a
second recovery request.

Current source has secure tenant callbacks and audited add/remove membership
operations, but it does not have a reusable invitation-plus-membership workflow
for an existing club. The smallest tenant-safe remediation is to add and test a
server-only direct-operator workflow that:

1. accepts the exact club, operator actor, private email, role, environment,
   and verified callback; rejects application-route invocation and unapproved
   hosts
2. refuses an existing Auth identity or existing membership for the supplied
   address, preventing duplicates
3. calls Supabase Auth `inviteUserByEmail` exactly once with
   `https://diverse-city-onzio-staging.vercel.app/admin/auth/callback`
4. adds the returned Auth user as a temporary second active Diverse City owner
   through the audited membership boundary
5. if membership/audit creation fails, removes only the newly created Auth
   identity and any new membership, records the failed attempt safely, and
   never sends again under this approval
6. never returns, writes, or records the invitation action URL, token, email
   body, password, session token, QR code, TOTP secret, or authenticator code

The two-owner window is intentional and temporary. It avoids removing the only
current owner before the new identity proves password and AAL2 access. After
Resend delivery and Christian's private invitation/password/TOTP completion:

1. prove the new owner is confirmed, reaches AAL2, and can load the Diverse
   City admin and owner billing boundary
2. prove AAL1 remains denied and Starter Contact/admin works while Pro-only
   Programs/Tryouts remain denied before `DCFC-601`
3. use the audited operator removal workflow to mark only the synthetic
   Diverse City owner membership removed; retain its Auth user because it
   predates this package and may belong to staging fixtures/operator controls
4. reconcile exactly one active Diverse City owner, one removed synthetic
   membership, one new confirmed Auth user with one verified TOTP factor, no
   unexpected sessions, and the expected invitation/membership audit records
5. stop before `DCFC-601`

Rollback is limited to resources created by this remediation. Before the new
owner is accepted, a failed invitation/membership path may remove the new
membership and new Auth user, leaving the synthetic owner active. After the
new identity is accepted, do not delete it automatically; stop for Christian's
direction if final AAL2 or entitlement acceptance fails. Never delete the
pre-existing synthetic Auth user, alter other tenant memberships, or send a
second invitation/recovery message.

This remediation may add and test the reusable local operator workflow and run
it once against the exact staging target. It does not authorize a commit, push,
deployment, migration, seed, SMTP/template/rate-limit/notification change,
Vercel change, Stripe, DNS, production, Bunny.net, video, `DCFC-601`, or Phase 6.

### Exact Remediation Approval Language

> I approve the DCFC-504 new-owner remediation for Supabase staging project
> `fxefqnoqxbezeccjvrsw`, Diverse City tenant
> `d88bf71b-9820-49ae-9dc0-7556b0813885`, and protected callback
> `https://diverse-city-onzio-staging.vercel.app/admin/auth/callback`, using
> the intended owner email I supplied privately. I authorize Codex to add and
> test one reusable server-only direct-operator invitation-and-membership
> workflow; create exactly one new staging Auth identity; send exactly one
> Supabase Auth invitation to that private address; add the new identity as a
> temporary second Diverse City owner; and perform the private invitation,
> password, TOTP, AAL1/AAL2, Starter-entitlement, owner-billing-boundary, audit,
> session, and provider-delivery acceptance described in
> `DCFC-504-APPROVAL-PACKET.md`. After successful AAL2 acceptance, remove only
> the synthetic Diverse City owner membership through the audited operator
> boundary, retain its pre-existing Auth user, and reconcile exactly one active
> Diverse City owner. I authorize cleanup only of the newly created identity
> and membership if the pre-acceptance invitation/membership operation fails;
> no retry or second message is authorized. Do not record or expose my email,
> password, invitation link/code, action URL, session token, QR code, TOTP
> secret, or authenticator code. This does not authorize migrations, seeds,
> SMTP/template/rate-limit/notification changes, Vercel changes or deployment,
> Stripe, DNS, production, Bunny.net or video integration, DCFC-601, Phase 6,
> commit, or push.

Christian supplied the exact approval above on 2026-08-02. Codex implemented
the reusable workflow, ran all local release gates, re-attested the pre-send
Auth/SMTP/template/notification/TOTP posture, and invoked the guarded workflow
once. It created one new Auth identity, requested one invitation with the exact
verified Diverse City callback, added one temporary active owner membership,
and wrote the `membership_added` and `identity_invited` audits. Provider message
`8ec265e4-e868-440c-8005-7b0893977ea2` is `delivered` to the approved provider
domain with subject `You've been invited`; the body and action URL were not
opened or recorded.

Post-send reconciliation is eight Auth users, two active Diverse City owners,
zero removed owners, 28 tenant audit rows, no verified factor for the new
owner, and one expected invite-created AAL1 session. Earlier guarded
attempts stopped before hosted mutation while the masked-key and private-input
stream boundaries were diagnosed; the seven-user/one-owner/26-audit baseline
was independently rechecked before the successful invocation. They produced no
identity, membership, audit row, or email. No retry is authorized or needed.

Christian privately opened the invitation and submitted a new password. The
client briefly displayed its generic invalid/expired-session error, but the
current app route is `/admin/login?password_updated=true` and independent Auth
reconciliation proves the user is confirmed, password-backed, and has a prior
sign-in timestamp. The invite session was signed out as designed; current state
is zero active sessions and zero verified TOTP factors. No resend is needed or
authorized.

Christian then reported not knowing the accepted password. Auth logs confirm
`PUT /user` returned HTTP 200 with `user_modified` immediately before the
successful logout, proving that some password value was set without exposing
it. The value may have been browser-generated; Codex must not inspect saved
passwords. Christian should check the browser password manager privately. If
no saved value exists, the package requires fresh exact approval for one
recovery message to the now-existing identity. The current one-invitation
approval does not authorize that additional send.

Execution completed on 2026-08-02. Christian recovered the browser-saved
password privately, signed in, enrolled exactly one TOTP factor, and reached
AAL2. The protected shell resolved Diverse City FC; Contact loaded at the
Starter boundary; Programs and Tryouts remained Pro-gated; and the owner-only
Payments route loaded its private-preview state without changing billing.
Codex then marked only the synthetic Diverse City owner membership removed in
a guarded transaction preserving the reviewed two-owner/last-owner and
append-only operator-audit invariants, while retaining the pre-existing Auth
user. Final reconciliation is eight Auth users, one active owner, one removed
synthetic membership, one AAL2 session, zero AAL1 sessions, one verified TOTP
factor, 29 tenant audits, and one operator removal audit. The approval is
exhausted; no second message, Auth configuration, Vercel, Stripe, DNS,
production, Bunny.net/video, `DCFC-601`, Phase 6, commit, or push action was
taken.
