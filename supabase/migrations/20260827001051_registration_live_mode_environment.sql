-- Lift the test-mode-only gate on the registration Stripe event RPCs.
--
-- The pre-launch review build deliberately hardcoded `p_environment <> 'test'`
-- as the first validation check on all three registration event-application
-- RPCs, and additionally regex-validated the Stripe checkout session ID as
-- `cs_test_...` only. Live mode was approved for the Diverse City FC go-live
-- (2026-08-26). This migration replaces the three function bodies only --
-- no schema change, signatures unchanged, matching the pattern
-- `onzio_private.create_pending_registration` already uses
-- (`p_environment not in ('test', 'production')`). Backward-compatible with
-- the currently deployed code, which only ever passes `'test'`.

create or replace function onzio_private.apply_registration_checkout_event(
  p_event_id text,
  p_event_type text,
  p_stripe_created_at timestamptz,
  p_environment text,
  p_club_id uuid,
  p_registration_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_amount_total integer,
  p_payload_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  registration onzio.registrations%rowtype;
  claimed_event_id text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_environment not in ('test', 'production')
    or p_event_type <> 'checkout.session.completed'
    or p_event_id !~ '^evt_[A-Za-z0-9]+$'
    or (
      (p_environment = 'test' and p_checkout_session_id !~ '^cs_test_[A-Za-z0-9]+$')
      or (p_environment = 'production' and p_checkout_session_id !~ '^cs_live_[A-Za-z0-9]+$')
    )
    or p_payment_intent_id !~ '^pi_[A-Za-z0-9]+$'
    or p_amount_total < 1
    or p_payload_digest !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'INVALID_CONNECT_EVENT';
  end if;
  insert into onzio.stripe_events (
    id, club_id, environment, event_type, stripe_created_at,
    outcome, payload_digest
  ) values (
    p_event_id, p_club_id, p_environment, p_event_type, p_stripe_created_at,
    'received', p_payload_digest
  ) on conflict (id) do nothing
  returning id into claimed_event_id;
  if claimed_event_id is null then
    return jsonb_build_object('action', 'rejected', 'code', 'DUPLICATE_EVENT');
  end if;

  select * into registration
  from onzio.registrations
  where club_id = p_club_id
    and id = p_registration_id
  for update;

  if not found
    or registration.stripe_checkout_session_id is distinct from p_checkout_session_id
    or registration.amount_cents <> p_amount_total
    or registration.status not in ('pending', 'expired', 'paid', 'refunded')
  then
    update onzio.stripe_events
    set outcome = 'rejected', rejection_code = 'REGISTRATION_CHECKOUT_MISMATCH'
    where id = p_event_id;
    return jsonb_build_object(
      'action', 'rejected', 'code', 'REGISTRATION_CHECKOUT_MISMATCH'
    );
  end if;

  -- The canonical Stripe event time may land immediately after a session
  -- boundary. Permit a narrow skew window; beyond it preserve the payment for
  -- an administrator to reconcile rather than silently losing a real charge.
  if p_stripe_created_at > registration.expires_at + interval '15 minutes' then
    update onzio.registrations
    set
      payment_recovery_required = true,
      payment_recovery_reason = 'checkout_completed_after_expiry',
      payment_recovery_detected_at = now()
    where club_id = p_club_id
      and id = p_registration_id;
    update onzio.stripe_events
    set outcome = 'rejected', rejection_code = 'REGISTRATION_LATE_PAYMENT_RECOVERY_REQUIRED'
    where id = p_event_id;
    return jsonb_build_object(
      'action', 'recovery_required',
      'code', 'REGISTRATION_LATE_PAYMENT_RECOVERY_REQUIRED',
      'registrationId', p_registration_id
    );
  end if;

  if registration.status in ('paid', 'refunded') then
    if registration.stripe_payment_intent_id is distinct from p_payment_intent_id then
      update onzio.stripe_events
      set outcome = 'rejected', rejection_code = 'PAYMENT_INTENT_MISMATCH'
      where id = p_event_id;
      return jsonb_build_object(
        'action', 'rejected', 'code', 'PAYMENT_INTENT_MISMATCH'
      );
    end if;
    update onzio.stripe_events
    set outcome = 'ignored', applied_at = now()
    where id = p_event_id;
    return jsonb_build_object('action', 'ignored', 'code', 'ALREADY_PAID');
  end if;

  update onzio.registrations
  set
    status = 'paid',
    stripe_payment_intent_id = p_payment_intent_id,
    paid_at = p_stripe_created_at
  where club_id = p_club_id
    and id = p_registration_id;

  update onzio.stripe_events
  set outcome = 'applied', applied_at = now()
  where id = p_event_id;
  return jsonb_build_object(
    'action', 'applied', 'registrationId', p_registration_id
  );
end;
$$;

create or replace function onzio_private.apply_registration_refund_event(
  p_event_id text,
  p_event_type text,
  p_stripe_created_at timestamptz,
  p_environment text,
  p_club_id uuid,
  p_registration_id uuid,
  p_payment_intent_id text,
  p_amount_refunded integer,
  p_payload_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  registration onzio.registrations%rowtype;
  claimed_event_id text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_environment not in ('test', 'production')
    or p_event_type <> 'charge.refunded'
    or p_event_id !~ '^evt_[A-Za-z0-9]+$'
    or p_payment_intent_id !~ '^pi_[A-Za-z0-9]+$'
    or p_amount_refunded < 1
    or p_payload_digest !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'INVALID_CONNECT_EVENT';
  end if;
  insert into onzio.stripe_events (
    id, club_id, environment, event_type, stripe_created_at,
    outcome, payload_digest
  ) values (
    p_event_id, p_club_id, p_environment, p_event_type, p_stripe_created_at,
    'received', p_payload_digest
  ) on conflict (id) do nothing
  returning id into claimed_event_id;
  if claimed_event_id is null then
    return jsonb_build_object('action', 'rejected', 'code', 'DUPLICATE_EVENT');
  end if;

  select * into registration
  from onzio.registrations
  where club_id = p_club_id
    and id = p_registration_id
  for update;

  if not found
    or registration.stripe_payment_intent_id is distinct from p_payment_intent_id
    or registration.status not in ('paid', 'refunded')
    or p_amount_refunded > registration.amount_cents
    or p_amount_refunded < registration.amount_refunded_cents
  then
    update onzio.stripe_events
    set outcome = 'rejected', rejection_code = 'REGISTRATION_REFUND_MISMATCH'
    where id = p_event_id;
    return jsonb_build_object(
      'action', 'rejected', 'code', 'REGISTRATION_REFUND_MISMATCH'
    );
  end if;

  update onzio.registrations
  set
    status = 'refunded',
    amount_refunded_cents = p_amount_refunded,
    refunded_at = p_stripe_created_at
  where club_id = p_club_id
    and id = p_registration_id;
  update onzio.stripe_events
  set outcome = 'applied', applied_at = now()
  where id = p_event_id;
  return jsonb_build_object(
    'action', 'applied', 'registrationId', p_registration_id
  );
end;
$$;

create or replace function onzio_private.apply_registration_connect_event(
  p_event_id text,
  p_event_type text,
  p_stripe_created_at timestamptz,
  p_environment text,
  p_club_id uuid,
  p_stripe_account_id text,
  p_charges_enabled boolean,
  p_details_submitted boolean,
  p_payouts_enabled boolean,
  p_payload_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_event_id text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_environment not in ('test', 'production')
    or p_event_type <> 'account.updated'
    or p_event_id !~ '^evt_[A-Za-z0-9]+$'
    or p_stripe_account_id !~ '^acct_[A-Za-z0-9]+$'
    or p_payload_digest !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'INVALID_CONNECT_EVENT';
  end if;
  insert into onzio.stripe_events (
    id, club_id, environment, event_type, stripe_created_at,
    outcome, payload_digest
  ) values (
    p_event_id, p_club_id, p_environment, p_event_type, p_stripe_created_at,
    'received', p_payload_digest
  ) on conflict (id) do nothing
  returning id into claimed_event_id;
  if claimed_event_id is null then
    return jsonb_build_object('action', 'rejected', 'code', 'DUPLICATE_EVENT');
  end if;

  perform 1
  from onzio.club_stripe_connect
  where club_id = p_club_id
    and stripe_account_id = p_stripe_account_id
    and environment = p_environment
  for update;
  if not found then
    update onzio.stripe_events
    set outcome = 'rejected', rejection_code = 'CONNECT_ACCOUNT_MISMATCH'
    where id = p_event_id;
    return jsonb_build_object(
      'action', 'rejected', 'code', 'CONNECT_ACCOUNT_MISMATCH'
    );
  end if;

  update onzio.club_stripe_connect
  set
    charges_enabled = p_charges_enabled,
    details_submitted = p_details_submitted,
    payouts_enabled = p_payouts_enabled,
    updated_at = now()
  where club_id = p_club_id;
  update onzio.stripe_events
  set outcome = 'applied', applied_at = now()
  where id = p_event_id;
  return jsonb_build_object('action', 'applied', 'clubId', p_club_id);
end;
$$;

notify pgrst, 'reload schema';
