# Operator TOTP Break-Glass Recovery

Status: governed manual procedure. This document is not standing authorization
to mutate Supabase, Vercel, Git, or any environment.

## Purpose and boundary

Use this procedure only when an allowlisted Onzio operator cannot satisfy TOTP,
or when the operator's authenticator is suspected to be compromised. Club
owners and administrators are single-factor email-code accounts under
`PLAT-D012`; the deleted club-member MFA-recovery workflow must not be restored
for them.

Operator functions remain unavailable until recovery is complete. Do not weaken
`assertOperator()`, add a temporary AAL1 bypass, share a TOTP secret, or create a
second operator as a shortcut.

## Required approval

Before any write, obtain an approval that names:

- this operator-recovery procedure;
- the exact Supabase project and environment;
- the exact operator identity, handled privately;
- session revocation;
- deletion of the specific lost or compromised TOTP factor;
- enrollment of exactly one replacement TOTP factor; and
- the required append-only audit event.

An identity or Vercel allowlist change, deployment, push, production action, or
organization-membership change is separate scope and requires its own explicit
approval. Never record an email address, UUID, code, QR image, TOTP secret,
access token, refresh token, session identifier, or factor identifier in Git,
the task transcript, or the audit payload.

## Procedure

1. **Fail closed.** Stop operator mutations. If compromise is suspected, also
   stop any work that depends on the operator allowlist until sessions are
   revoked.
2. **Read-only baseline.** Confirm the exact project reference, confirm that the
   private target is an active Auth user and the configured operator, and record
   only aggregate counts of active sessions and verified, unverified, and other
   factors.
3. **Verify identity out of band.** Christian verifies the operator independently
   of the affected authenticator. Create an incident or approval reference and
   retain only its SHA-256 digest in durable technical evidence.
4. **Revoke sessions first.** Revoke every active Auth session for the affected
   operator through the supported Supabase administrative control. Read back
   zero active sessions before removing a factor. Remember that deleting a user
   or factor alone does not invalidate already-issued access tokens.
5. **Remove only the approved factor.** Delete the lost or compromised TOTP
   factor through the supported Supabase administrative control. Stop if the
   project, user, factor type, or factor count differs from the approved
   baseline. Read back zero verified and zero unresolved TOTP factors.
6. **Enroll privately.** Run `npm run operator:enroll-totp` from the repository
   root. Christian enters every email code and authenticator value privately.
   The helper must target the approved project, use a publishable or legacy anon
   key, create exactly one verified TOTP factor, remove its temporary mode-0600
   QR file, and sign out.
7. **Prove the restored boundary.** Sign in again, complete a fresh TOTP
   challenge, and verify that the JWT subject is still allowlisted, `aal` is
   `aal2`, and the `amr` TOTP timestamp is no older than two hours. Confirm an
   AAL1 session is refused before relying on the restored operator account.
8. **Write the audit event.** Through an approved server-only path, append one
   recovery event containing only the approval/identity-verification reference
   digest, aggregate before/after counts, session-revocation result, and outcome.
   Because recovery starts without a valid operator session, identify it
   truthfully as an out-of-band/system recovery rather than claiming an
   authenticated operator action.
9. **Close out.** Confirm exactly one verified TOTP factor, zero unresolved or
   other factors, zero pre-recovery sessions, a new fresh AAL2 session only when
   needed, and the single audit row. Update `STATUS.md` and `HANDOFF.md` without
   sensitive values.

## Failure and rollback

- If identity cannot be verified, stop. Do not remove any factor.
- If sessions cannot be revoked, stop before factor deletion and escalate the
  Auth incident.
- If enrollment creates ambiguous factor state, sign out, revoke the new
  session, remove only the newly approved incomplete factor, and investigate
  before retrying.
- If the audit write fails, operator recovery is not accepted as complete; keep
  the incident open and record the failure without sensitive payloads.
- Do not add an administrator to the Supabase organization or expose a
  service-role key merely to bypass this procedure.
