# Resend SMTP Rollout for Supabase Auth

Last updated: 2026-07-28

## Status

The Phase 8 SMTP rollout is complete and accepted. The existing Resend Free
team remains administered by `christianjavieralcala@gmail.com`, account MFA is
enabled, and `auth.onziofutbol.com` is the sole verified sending domain.
Staging and production use distinct domain-restricted, sending-only
credentials stored only in their respective Supabase Auth SMTP settings.

Custom SMTP is enabled in both Supabase projects with a 60-second per-user
interval and a 30-email/hour project limit. Production sends as
`Onzio Accounts <no-reply@auth.onziofutbol.com>`. Delivery, recovery,
password, mandatory MFA, and protected-admin acceptance passed in production.
The built-in Supabase mailer is not the active production sender.

Production recovery now uses the verified current tenant host
`onzio-rcfc.vercel.app`. `info@rosecityfutbolclub.com` was subsequently
removed from production Auth and Rose City membership; it is not a pending
recipient or owner. `christianjavieralcala@gmail.com` is the sole active Rose
City owner. Earlier custom-domain and former-owner recovery evidence below is
retained only as historical incident chronology.

The SMTP observation period is no longer a Phase 8 blocker. The Resend plan
was not upgraded. Any future email send, credential rotation, DNS change,
Supabase Auth/SMTP setting change, template change, or rate-limit change still
requires fresh explicit approval.

## Locked architecture

- Provider: Resend SMTP through Supabase Auth.
- Sending domain: `auth.onziofutbol.com`.
- Production sender:
  `Onzio Accounts <no-reply@auth.onziofutbol.com>`.
- Staging sender:
  `Onzio Staging <staging@auth.onziofutbol.com>`.
- Website and callback domains remain club-specific.
- One shared Onzio sending identity serves every club.
- Staging and production use separate scoped Resend credentials.
- Supabase Auth remains the only v1 sender for invitations and recovery.
- Do not add the Resend SDK, React Email, a public send route, or a second
  application-owned password-reset mail path in this rollout.
- Do not mix authentication email with marketing, fan, match, or billing email.
- Do not create or verify one sending domain per club.

The shared sender and per-club link destination are separate concerns:

```text
From: Onzio Accounts <no-reply@auth.onziofutbol.com>
Subject: Reset your Onzio admin password
Invitation: https://{verified-club-domain}/admin/auth/callback
Recovery entry: https://{verified-club-domain}/admin/recover
Final page: https://{verified-club-domain}/admin/update-password
```

The server continues to derive the callback from the verified tenant domain.
Client-provided hosts, origins, club IDs, and arbitrary `next` paths are never
accepted as redirect authority.

## Capacity and cost posture

Resend Free currently provides 3,000 transactional emails per month, one custom
domain, and a 100-email daily limit. It is sufficient for the pilot and early
club rollout if onboarding is paced.

Upgrade to Resend Pro before any of these occurs:

- a planned onboarding batch could exceed 100 emails in one day
- sustained volume approaches 3,000 emails per month
- Onzio reaches roughly 20–50 active clubs and wants operational headroom
- the daily cap becomes an administrator-recovery risk

The current Pro baseline is $20 per month for 50,000 emails and no daily limit.
At 50 clubs that is $0.40 per club per month; at 100 clubs it is $0.20.
Recheck provider pricing immediately before purchase because pricing is not an
architecture invariant.

## Secrets and access

- Reuse the existing Resend account/team administered by the Onzio operator;
  do not create a second account or team.
- Require MFA on `christianjavieralcala@gmail.com` before adding the sending
  domain or creating any credential.
- Verify the Onzio-controlled sending subdomain before creating production
  credentials.
- Create separate credentials for staging and production; never reuse one key
  across environments.
- Limit each credential to sending from the verified Auth domain when Resend's
  current key controls allow it.
- Store the SMTP password only in the matching Supabase Auth SMTP settings.
- Do not place the SMTP password in Vercel, `.env*`, the repository, shell
  history, screenshots, documentation, or transcripts.
- Never expose SMTP credentials through a `NEXT_PUBLIC_` variable.
- Record credential owner, creation date, environment, and rotation date
  without recording the value.

## DNS design

Use the dedicated `auth.onziofutbol.com` subdomain so authentication
reputation is isolated from Onzio marketing and every club's mail
configuration.

1. Add the domain in Resend.
2. Copy the exact Resend-provided SPF, DKIM, and return-path records.
3. Add only those scoped records at the current Onzio DNS provider.
4. Add a DMARC policy for the Auth subdomain with aggregate reporting.
5. Confirm verification from Resend and independent DNS lookup.
6. Confirm the change did not alter the root Onzio MX records or any club DNS.

Do not invent DNS values in advance; use the exact values Resend generates.

## Template contract

Initial Supabase Auth templates are shared, neutral, and security-focused.

- Sender name: `Onzio Accounts`.
- Subjects are short and contain no promotional language.
- The message explains whether it is an invitation, password reset, or secure
  account change.
- Use one primary action link and a short expiration warning.
- Include a plain-text fallback.
- Do not embed secrets, access tokens, full URLs in logs, user-controlled HTML,
  marketing copy, tracking pixels, or club-supplied images.
- Do not infer authorization or tenant identity from `user_metadata`.
- Do not promise a specific club in a shared template when the same person can
  belong to multiple clubs.

Per-club template branding is deferred. If required later, use a Supabase Send
Email Auth Hook with server-resolved tenant data and a separately reviewed
contract.

## Rate limits and abuse controls

- Keep Supabase's initial custom-SMTP project limit at 30 Auth emails per hour.
- Preserve the per-user password-reset cooldown.
- Map rate-limit responses to neutral copy such as:
  `Too many recovery emails were requested. Wait a few minutes and try once.`
- Do not reveal whether the submitted email address exists.
- Monitor Resend delivery, bounce, complaint, and suppression results.
- Add CAPTCHA before raising the public recovery allowance materially.
- Pace operator invitation batches rather than producing sudden spikes.
- Review limits at 20, 50, and 100 active clubs.

## Historical rollout sequence — completed

All four rollout gates below are complete. They remain as the acceptance
record, not as outstanding Phase 8 work.

### Gate 1 — account and DNS

1. Protect the existing Resend operator account with MFA and confirm the sole
   team remains controlled by `christianjavieralcala@gmail.com`.
2. Under explicit approval, delete the erroneous unverified `auth.onzio.com`
   entry and add `auth.onziofutbol.com`.
3. Add and verify SPF, DKIM, return-path, and DMARC records only after separate
   explicit DNS approval.
4. Confirm the root domain and club DNS remain unchanged.
5. Create separate staging and production SMTP credentials only after separate
   explicit approval.

### Gate 2 — staging

1. Capture the current staging Auth email and rate-limit configuration without
   revealing credentials.
2. Enable custom SMTP only in the staging Supabase project.
3. Use `staging@auth.onziofutbol.com` and the staging-only credential.
4. Keep the initial 30-email-per-hour limit.
5. Send invitation and recovery messages to approved synthetic test accounts
   on at least two mailbox providers.
6. Verify delivery, spam placement, callback host, password update, MFA, replay
   rejection, expiry, and neutral rate-limit messaging.
7. Verify no production user or domain was contacted.

### Gate 3 — production

Requires a fresh explicit approval because it changes production Auth and DNS.

1. Capture the current production Auth email/rate-limit configuration.
2. Confirm the production credential is distinct from staging.
3. Enable Resend SMTP in Onzio Production.
4. Set the production sender to
   `Onzio Accounts <no-reply@auth.onziofutbol.com>`.
5. Keep the initial 30-email-per-hour limit.
6. Send one approved recovery message to the Onzio operator.
7. Send one approved recovery message to
   `info@rosecityfutbolclub.com`.
8. Confirm both messages are delivered and the Rose City link returns only to
   the verified Rose City callback/update-password flow.
9. Confirm password sign-in plus mandatory MFA still gates the admin portal.
10. Review Supabase Auth logs and Resend delivery results for unexpected errors.

### Gate 4 — observation (complete)

1. Observe delivery, bounces, complaints, suppressions, and Auth errors for at
   least 48 hours.
2. Confirm no recurring project-wide rate-limit failures.
3. Record only counts, timestamps, recipient domain, and provider message ID;
   do not record recovery links or message bodies.
4. Decide whether the Free plan remains adequate or Pro is justified before
   bulk onboarding.
5. Only then consider releasing the Rose City admin freeze.

## Acceptance matrix

| Scenario | Expected result |
| --- | --- |
| Approved non-team recipient | Message delivered through Resend |
| Unknown email submission | Neutral success/retry response; no enumeration |
| Verified tenant recovery | Returns to `/admin/recover`, then the password-update route |
| Caller-provided external redirect | Rejected or ignored |
| Expired or reused link | Fails closed and requests a new recovery |
| Successful password update | Session signs out; password login required |
| AAL1 after recovery | Protected admin remains blocked |
| Password plus TOTP MFA | Protected admin succeeds |
| Rapid repeat request | Friendly cooldown response; no duplicate flood |
| Staging credential in production | Rejected by environment separation |
| Resend secret in client/build output | Static check fails |
| Auth email contains marketing content | Review gate fails |

## Historical verification and incident evidence

This section is chronological evidence. Former domains, deleted identities,
earlier disabled-SMTP baselines, and corrective next steps describe their
state at the recorded checkpoint; they are not current configuration.

Record:

- Resend domain verification state
- independent SPF, DKIM, DMARC, and return-path DNS results
- staging and production credential IDs or labels, never values
- Supabase SMTP enabled state and numeric rate limits
- delivery/bounce/complaint outcome for each approved test
- callback host and final route without query strings or tokens
- password reset, sign-out, password login, and MFA result
- Auth and Resend error-log scan

Read-only baseline captured on 2026-07-27:

- Resend account/team: existing Free account; team
  `christianjavieralcala`; sole visible member
  `christianjavieralcala@gmail.com` with admin role
- Resend account MFA: enabled; verified read-only after Christian completed
  enrollment without exposing authenticator or recovery material
- Resend usage: 0/3,000 transactional emails this month and 0/100 today
- Resend domains before the approved addition: 0/1 configured
- Resend API keys: none
- staging Supabase custom SMTP: disabled; built-in limit 2 emails/hour
- production Supabase custom SMTP: disabled; built-in limit 2 emails/hour
- no secrets, recovery links, message bodies, or full sensitive configuration
  values were captured

Erroneous Resend domain addition on 2026-07-27:

- domain: `auth.onzio.com`
- Resend domain ID: `9b89e2f5-c372-4785-9091-cb852e3a3d44`
- region: North Virginia (`us-east-1`)
- sending: enabled
- receiving: disabled
- verification status: `not started`
- credentials: none
- emails sent: zero
- disposition: deleted under explicit correction approval

The generated DNS records for `auth.onzio.com` are superseded and must never
be published.

Correct Resend domain addition on 2026-07-27:

- domain: `auth.onziofutbol.com`
- Resend domain ID: `7514696d-f0be-453c-bf79-ff68d8dbdeb1`
- region: North Virginia (`us-east-1`)
- sending: enabled
- receiving: disabled
- verification status: `verified`
- credentials: distinct staging and production sending-only credentials
- emails sent at that checkpoint: four approved staging messages; zero
  production messages

The approved DNS rollout published these exact records:

| Purpose | Type | Name | Content | TTL | Priority |
| --- | --- | --- | --- | --- | --- |
| DKIM | TXT | `resend._domainkey.auth` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCdbdDzaVA8tnq9XufF8FxMjHl3/nwLwUXxjZ/jEIGQd2WqKfaRSLvbWZbFUGdAikuqsr4X4klnr5SbASkFZ3i46Gcpk3uwRxpYL7TzcZeoBAeu7IjRLuOgySREOGa4mIev7sxK7N0e4RO5kF9pjWbbAWZFdBtMtWT0bvnanBlF6wIDAQAB` | 3600 | — |
| Return-path | MX | `send.auth` | `feedback-smtp.us-east-1.amazonses.com` | 3600 | 10 |
| SPF | TXT | `send.auth` | `v=spf1 include:amazonses.com ~all` | 3600 | — |
| DMARC | TXT | `_dmarc` | `v=DMARC1; p=none;` | 60 | — |

Independent pre-change DNS baseline for the owned domain:

- authoritative nameservers: `ns1.vercel-dns.com`, `ns2.vercel-dns.com`
- root `onziofutbol.com` A: `216.198.79.1`, `216.198.79.65`
- `auth.onziofutbol.com` currently resolves through Vercel DNS
- no existing `send.auth` MX/TXT or Resend DKIM TXT records
- no existing `_dmarc.onziofutbol.com` TXT record
- do not reuse the superseded `auth.onzio.com` values

Post-change verification:

- Vercel Domain Connect created the DKIM, return-path MX, and SPF records.
- The optional root `_dmarc` monitoring record was added manually because
  Domain Connect did not include it.
- Vercel's authoritative `ns1.vercel-dns.com` returned all four exact values.
- Resend recorded `DNS verified` and `Domain verified`, then changed the
  overall status to `verified`.
- No root A, website routing, nameserver, club-domain, MX outside
  `send.auth`, or email change occurred.

Approved staging SMTP configuration on 2026-07-27:

- Resend credential label:
  `onzio-staging-supabase-auth-2026-07-27`
- Resend credential ID: `eb34ec9f-b529-4697-8713-dcf51b4a1164`
- permission: sending access only
- domain restriction: `auth.onziofutbol.com`
- owner/creator: `christianjavieralcala@gmail.com`
- environment: staging only
- rotation review: 2026-10-27, or immediately after any suspected exposure
- total credential uses at post-save inspection: zero
- Supabase project: `Onzio Platform Staging`
  (`fxefqnoqxbezeccjvrsw`)
- custom SMTP: enabled
- sender: `Onzio Staging <staging@auth.onziofutbol.com>`
- provider connection: standard Resend SMTP configuration; the connection
  tuple is intentionally omitted from source control
- minimum interval per user: 60 seconds
- aggregate Auth email rate limit: 30 emails/hour
- password: stored only in encrypted Supabase Auth SMTP configuration; value
  not recorded
- production custom SMTP: enabled later under fresh approval
- emails sent after separate test approval: four

The saved staging settings were reloaded and the non-secret values matched.
Supabase intentionally does not reveal the stored SMTP password after save.
The Resend credential initially showed `No activity` before the separately
approved test messages.

Approved production SMTP configuration on 2026-07-27:

- Resend credential label:
  `onzio-production-supabase-auth-2026-07-27`
- Resend credential ID: `2966af9b-4c39-426d-9ef9-bae68f6b7af6`
- permission: sending access only
- domain restriction: `auth.onziofutbol.com`
- owner/creator: `christianjavieralcala@gmail.com`
- environment: production only
- rotation review: 2026-10-27, or immediately after any suspected exposure
- total credential uses at post-save inspection: zero
- Supabase project: `Onzio Platform Production`
  (`ioalthwsdrlzrubomrow`)
- custom SMTP: enabled
- sender: `Onzio Accounts <no-reply@auth.onziofutbol.com>`
- provider connection: standard Resend SMTP configuration; the connection
  tuple is intentionally omitted from source control
- minimum interval per user: 60 seconds
- aggregate Auth email rate limit: 30 emails/hour
- password: transferred directly into encrypted Supabase Auth SMTP
  configuration; value not recorded
- saved settings: reloaded and all non-secret values matched
- production emails sent: four separately approved Onzio-operator recoveries;
  the later messages replaced earlier attempts after successive callback and
  deployment diagnoses
- Resend plan: existing Free plan unchanged

During the production configuration, the browser auto-filled an unrelated
stored credential into the newly enabled SMTP form before the Onzio values were
entered. It was immediately overwritten and was never saved to Supabase, but it
appeared in automation evidence. Treat the unrelated credential as exposed and
rotate its owning account separately without recording the value here. Later
read-only identification matched it to Christian's Supabase dashboard
email/password identity `christianjavieralcala@gmail.com`. Under explicit
rotation approval, the secure Supabase password-change form was opened.
Christian completed the password change privately; neither the current nor new
value was recorded. The credential-rotation incident is closed.

Approved production operator recovery on 2026-07-28:

- initiation: Rose City production `/admin/login` recovery form
- recipient: `christianjavieralcala@gmail.com`
- subject: `Reset your password`
- Resend message ID: `c1eefc25-9813-45c4-8618-b695a06279a7`
- provider status: `delivered`
- message body, provider detail, and action URL: not opened
- callback result: Christian opened the message, but the PKCE code landed at
  `https://www.rosecityfutbolclub.com/` instead of the application callback
- cause: production allows only the legacy
  `https://www.rosecityfutbolclub.com/admin/auth/callback?next=/admin/update-password`
  URL, while deployed commit `92038d4` requests the clean
  `https://www.rosecityfutbolclub.com/admin/auth/callback`
- security disposition: the one-time code was exposed during troubleshooting,
  will not be reused, and did not change the password
- required correction: under fresh approval, add the exact clean callback to
  the production allowlist, reload-verify it, and send one replacement operator
  recovery
- correction and replacement result:
  - clean `www` callback added while the legacy query-bearing callback was
    retained
  - reload verification confirmed both entries and `Total URLs: 2`
  - exactly one replacement recovery was sent
  - replacement Resend message ID:
    `b5a963f7-1a9d-4798-8cdb-7259ba86eea0`
  - replacement provider status: `delivered`
  - replacement message body and provider detail: not opened
  - Christian again reached the Site URL root; the replacement code was
    exposed, will not be reused, and did not change the password
- refined read-only cause: the production login remains on the apex
  `https://rosecityfutbolclub.com/admin/login`, and the deployed client derives
  the callback from `window.location.origin`, so it requests
  `https://rosecityfutbolclub.com/admin/auth/callback`; only the clean `www`
  callback and legacy query-bearing `www` callback are currently allowlisted
- apex correction completed under fresh approval:
  - exact `https://rosecityfutbolclub.com/admin/auth/callback` entry added
  - both existing `www` entries retained
  - full reload confirmed all three exact entries and `Total URLs: 3`
  - no email sent during this configuration step
- final separately approved operator recovery:
  - initiated exactly once from the apex production login
  - recipient: `christianjavieralcala@gmail.com`
  - Resend message ID: `0150522c-c688-4ae7-a132-314768c2878f`
  - provider status: `delivered`
  - provider detail, message body, and action URL: not opened
  - callback result: Site URL fallback again; exposed one-time code will not be
    reused and did not change the password
- definitive read-only deployment diagnosis:
  - Vercel Production is commit `21de7e7`
    (`Record Phase 8 production preflight`)
  - the public production login bundle requests
    `https://rosecityfutbolclub.com/admin/auth/callback?next=/admin/update-password`
    because it derives the legacy query-bearing callback from the apex
    `window.location.origin`
  - secure callback commit `92038d4` is Ready but remains a Preview deployment
  - no further email was sent
- production deployment correction completed under fresh approval:
  - commit `92038d4` rebuilt with current Production environment settings
  - Vercel deployment ID: `dpl_HY46CQoAJ7yJsXP8xkUmSp8pY9kC`
  - Vercel project overview reports it as the Ready Production deployment
  - live bundle: `page-b4ac05e6e0af23ec.js`
  - live bundle requests the clean callback from `window.location.origin`
  - live bundle uses production Supabase project `ioalthwsdrlzrubomrow`
  - forged recovery callback returned to
    `/admin/login?error=invalid_auth_link` with the safe invalid/expired message
  - no recovery email sent during deployment or verification
- corrected-production operator recovery:
  - initiated exactly once after live deployment verification
  - recipient: `christianjavieralcala@gmail.com`
  - Resend message ID: `039ab441-55ca-4627-b5d4-2519eaeb966e`
  - provider status: `delivered`
  - provider detail, message body, and action URL: not opened
  - Christian used only the newest message and confirmed protected-admin access
  - read-only Supabase verification matched operator UUID
    `199d8437-1237-4098-99dd-8b089411255e`, last sign-in 00:25 PDT, and user
    update 00:26 PDT on 2026-07-28
  - production delivery/callback/password/sign-in/MFA/admin acceptance: green
- Rose City owner recovery sent later under fresh explicit approval:
  - initiated exactly once from the corrected Production login
  - recipient: `info@rosecityfutbolclub.com`
  - Resend message ID: `d2784583-1e6e-46a5-8fe7-502b168a88b8`
  - provider status: `delivered`
  - provider detail, message body, and action URL: not opened
  - Christian does not control the mailbox; the actual Rose City administrator
    will not be available until 2026-07-29, after the current link's expected
    validity window
  - treat this message as delivery-only evidence and do not use it tomorrow
  - when the administrator is present, obtain fresh approval and send exactly
    one new recovery for callback/password/sign-in/MFA/admin acceptance

Approved staging delivery test on 2026-07-27:

- `christianalcala3@yahoo.com`: invitation, subject
  `You've been invited`, Resend status `delivered`
- `calcala1@berkeley.edu`: invitation, subject
  `You've been invited`, Resend status `delivered`
- `calcala1@berkeley.edu`: password recovery, subject
  `Reset your password`, Resend status `delivered`
- `christianalcala3@yahoo.com`: replacement password recovery, subject
  `Reset your password`, Resend status `delivered`
- the 60-second per-user cooldown was respected before Berkeley recovery
- the Yahoo staging identity completed password recovery, active Alpha admin
  membership, mandatory MFA, and protected-admin access
- opening the Berkeley invitation confirmed that temporary identity, but did
  not complete an Onzio acceptance/password flow
- the later Alpha membership was added separately through the audited operator
  workflow after explicit approval
- no message body, action link, token, or mailbox content was opened
- provider `delivered` does not yet prove inbox placement or callback success
- production SMTP and production Auth users were untouched

Christian subsequently confirmed that both providers received their messages.
The Berkeley dashboard-generated recovery link failed acceptance: it redirected
to Vercel login for the protected staging deployment and carried Supabase
`access_denied` / `otp_expired` state. No password was changed. This does not
invalidate SMTP delivery. It exposes two test-path constraints:

- Supabase dashboard recovery used the staging Site URL root instead of the
  application's required
  `/admin/auth/callback?next=/admin/update-password` redirect.
- Berkeley link scanning may have consumed the single-use recovery token before
  Christian opened it.

Do not reuse that link. The next recovery must be initiated from the Onzio
staging `/admin/login` recovery form after Christian has authenticated to the
protected Vercel staging deployment. Use the Yahoo test identity first to
separate the application callback test from Berkeley link-scanner behavior.
Sending that replacement recovery retains its own explicit approval gate.

The Berkeley invitation also failed acceptance. It confirmed the temporary
staging identity, then Vercel Authentication intercepted the root redirect and
the flow ended on a Not Found page rather than an Onzio password-setup route.
The invitation used Supabase's implicit flow and placed bearer credentials in
the URL fragment. That full action URL was accidentally exposed during
troubleshooting. The exact staging session was revoked immediately by deleting
its `auth.sessions` row; an independent follow-up query returned zero matching
session rows and zero matching refresh-token rows. The temporary Berkeley user
was retained, no membership or tenant role was added, and production was
untouched. The already-issued signed access JWT retains only its original
one-hour validity window; it cannot refresh and has no tenant membership behind
it.

Never paste, log, screenshot, or retain a full Supabase action URL. Before the
next acceptance email, verify a token-hash/PKCE-style application callback that
does not expose bearer credentials in the URL fragment and confirm the
protected Vercel deployment permits that callback.

Repository credential review on 2026-07-28:

- GitGuardian classified the public SMTP host, port, and provider username
  recorded together in an earlier revision as SMTP credentials.
- A complete reachable-history scan found no Resend key-shaped token and no
  SMTP password value.
- The credential-shaped public connection tuple was removed from the affected
  commit. Provider connection details remain available in the Resend and
  Supabase dashboards, while secret values remain only in encrypted provider
  configuration.

Required local checks for any accompanying application/UI change:

```bash
npx tsc --noEmit
npm run test:contracts
npm run test:architecture
npm test
npm run lint
npm run build
git diff --check
```

## Rollback

If staging fails, disable staging custom SMTP and rotate/delete the staging
credential. Production remains untouched.

If production fails:

1. Stop new recovery/invitation testing.
2. Capture Supabase and Resend error evidence without tokens or message bodies.
3. Restore the captured previous Auth email/rate-limit configuration.
4. Rotate or revoke the failed production credential.
5. If the Rose City content freeze has not yet been formally released, keep it
   active; do not reimpose a released freeze without a new explicit decision.
6. Use the audited operator recovery procedure only after manual identity
   verification if an administrator is locked out.
7. Do not add administrators to the Supabase organization merely to bypass the
   built-in mailer's recipient restrictions.

The built-in Supabase mailer is a temporary emergency fallback for authorized
organization members only, not the permanent rollback destination. Before
large-scale onboarding, evaluate a standby SMTP provider and document the
credential-switch procedure.

## Approval boundaries

The completed actions above were individually approved and are historical.
Obtain fresh explicit approval before any new instance of:

- enabling or resetting Resend MFA
- creating another Resend account/team or purchasing a paid subscription
- adding or changing Onzio DNS records
- creating SMTP credentials
- changing staging or production Supabase SMTP settings
- changing Auth templates or rate limits
- sending staging or production test email
- enabling CAPTCHA
- adding a standby provider

Do not change club DNS, Stripe, billing tiers, membership, MFA factors, or the
Rose City rollback deployment as part of this SMTP rollout.

## Official references

- Supabase custom SMTP:
  <https://supabase.com/docs/guides/auth/auth-smtp>
- Supabase Auth rate limits:
  <https://supabase.com/docs/guides/auth/rate-limits>
- Resend with Supabase SMTP:
  <https://resend.com/docs/send-with-supabase-smtp>
- Resend pricing:
  <https://resend.com/pricing>
