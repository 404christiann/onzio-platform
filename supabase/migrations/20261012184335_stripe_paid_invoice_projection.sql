-- Paid-through is rebuilt from canonical paid recurring invoices by the webhook.
-- Allow that evidence to repair a previously inflated grace deadline, atomically
-- with the subscription, access projection and immutable event ledger. Repeated
-- failures produce the same paid-through + 20 days; they never extend grace.
-- No existing tenant rows are rewritten by this migration.

create or replace function onzio_private.apply_stripe_projection(
  p_event_id text,
  p_event_type text,
  p_stripe_created_at timestamptz,
  p_environment text,
  p_club_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_price_id text,
  p_status text,
  p_cancel_at_period_end boolean,
  p_paid_through timestamptz,
  p_grace_ends_at timestamptz,
  p_public_access text,
  p_payload_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_subscription onzio.club_subscriptions%rowtype;
  club_record onzio.clubs%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_environment not in ('test', 'production')
    or p_public_access not in ('preview', 'live', 'grace', 'suspended')
    or p_status = 'trialing'
    or p_event_id = ''
    or p_customer_id = ''
    or p_subscription_id = ''
    or p_price_id !~ '^price_[A-Za-z0-9_]+$'
  then
    raise exception 'invalid Stripe projection input' using errcode = '22023';
  end if;

  if exists (select 1 from onzio.stripe_events where id = p_event_id) then
    return jsonb_build_object('action', 'rejected', 'code', 'DUPLICATE_EVENT');
  end if;

  select * into club_record
  from onzio.clubs
  where id = p_club_id
  for update;

  if club_record.id is null then
    perform onzio_private.record_stripe_rejection(
      p_event_id, p_event_type, p_stripe_created_at, p_environment, p_club_id,
      p_payload_digest, 'UNKNOWN_CLUB'
    );
    return jsonb_build_object('action', 'rejected', 'code', 'UNKNOWN_CLUB');
  end if;
  if club_record.kind <> 'customer' then
    perform onzio_private.record_stripe_rejection(
      p_event_id, p_event_type, p_stripe_created_at, p_environment, p_club_id,
      p_payload_digest, 'BILLING_NOT_REQUIRED'
    );
    return jsonb_build_object('action', 'rejected', 'code', 'BILLING_NOT_REQUIRED');
  end if;

  select * into current_subscription
  from onzio.club_subscriptions
  where club_id = p_club_id
  for update;

  if current_subscription.last_applied_stripe_event_created_at is not null
    and p_stripe_created_at <= current_subscription.last_applied_stripe_event_created_at
  then
    perform onzio_private.record_stripe_rejection(
      p_event_id, p_event_type, p_stripe_created_at, p_environment, p_club_id,
      p_payload_digest, 'STALE_EVENT'
    );
    return jsonb_build_object('action', 'rejected', 'code', 'STALE_EVENT');
  end if;
  if current_subscription.stripe_customer_id is not null
    and current_subscription.stripe_customer_id <> p_customer_id
  then
    perform onzio_private.record_stripe_rejection(
      p_event_id, p_event_type, p_stripe_created_at, p_environment, p_club_id,
      p_payload_digest, 'CUSTOMER_MISMATCH'
    );
    return jsonb_build_object('action', 'rejected', 'code', 'CUSTOMER_MISMATCH');
  end if;
  if current_subscription.stripe_subscription_id is not null
    and current_subscription.stripe_subscription_id <> p_subscription_id
  then
    perform onzio_private.record_stripe_rejection(
      p_event_id, p_event_type, p_stripe_created_at, p_environment, p_club_id,
      p_payload_digest, 'SUBSCRIPTION_MISMATCH'
    );
    return jsonb_build_object('action', 'rejected', 'code', 'SUBSCRIPTION_MISMATCH');
  end if;

  insert into onzio.stripe_events (
    id, club_id, environment, event_type, stripe_created_at, outcome, payload_digest
  ) values (
    p_event_id, p_club_id, p_environment, p_event_type,
    p_stripe_created_at, 'received', p_payload_digest
  );

  insert into onzio.club_subscriptions (
    club_id, stripe_customer_id, stripe_subscription_id, price_id, status,
    cancel_at_period_end, paid_through, grace_ends_at,
    last_applied_stripe_event_id, last_applied_stripe_event_created_at, updated_at
  ) values (
    p_club_id, p_customer_id, p_subscription_id, p_price_id, p_status,
    p_cancel_at_period_end, p_paid_through, p_grace_ends_at,
    p_event_id, p_stripe_created_at, now()
  )
  on conflict (club_id) do update set
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    price_id = excluded.price_id,
    status = excluded.status,
    cancel_at_period_end = excluded.cancel_at_period_end,
    paid_through = excluded.paid_through,
    grace_ends_at = excluded.grace_ends_at,
    last_applied_stripe_event_id = excluded.last_applied_stripe_event_id,
    last_applied_stripe_event_created_at = excluded.last_applied_stripe_event_created_at,
    updated_at = now();

  update onzio.clubs
  set
    lifecycle = case
      when lifecycle = 'onboarding' and p_status = 'active' then 'active'
      else lifecycle
    end,
    public_access = case
      when lifecycle = 'archived' then 'suspended'
      else p_public_access
    end,
    updated_at = now()
  where id = p_club_id;

  update onzio.stripe_events
  set outcome = 'applied', applied_at = now()
  where id = p_event_id;

  return jsonb_build_object('action', 'applied', 'eventId', p_event_id);
end;
$$;

revoke all on function onzio_private.apply_stripe_projection(
  text, text, timestamptz, text, uuid, text, text, text, text,
  boolean, timestamptz, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function onzio_private.apply_stripe_projection(
  text, text, timestamptz, text, uuid, text, text, text, text,
  boolean, timestamptz, timestamptz, text, text
) to service_role;
