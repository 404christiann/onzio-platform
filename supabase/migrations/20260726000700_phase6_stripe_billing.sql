-- Onzio Platform Phase 6: tenant-aware Stripe projection and runtime access.
-- Stripe remains the source of truth. These functions apply a verified,
-- canonical subscription snapshot and its immutable event record atomically.

revoke update, delete on onzio.stripe_events from service_role;

create or replace function onzio_private.subscription_public_access(
  p_club_id uuid,
  p_now timestamptz default now()
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when club.lifecycle = 'archived' then 'suspended'
    when club.lifecycle = 'onboarding' then 'preview'
    when subscription.club_id is null then 'preview'
    when subscription.status in ('active', 'trialing', 'past_due') then 'live'
    when subscription.paid_through is not null
      and subscription.paid_through >= p_now then 'live'
    when subscription.grace_ends_at is not null
      and subscription.grace_ends_at >= p_now then 'grace'
    else 'suspended'
  end
  from onzio.clubs club
  left join onzio.club_subscriptions subscription
    on subscription.club_id = club.id
  where club.id = p_club_id;
$$;

revoke execute on function
  onzio_private.subscription_public_access(uuid, timestamptz)
from public;
grant execute on function
  onzio_private.subscription_public_access(uuid, timestamptz)
to anon, authenticated, service_role;

create or replace function onzio_private.is_publicly_accessible(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    onzio_private.subscription_public_access(p_club_id, now())
      in ('live', 'grace'),
    false
  );
$$;

create or replace function onzio_private.can_read_club(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    onzio_private.is_publicly_accessible(p_club_id)
    or (
      onzio_private.is_aal2()
      and onzio_private.is_club_member(p_club_id)
      and exists (
        select 1
        from onzio.clubs club
        where club.id = p_club_id
          and club.lifecycle <> 'archived'
      )
    );
$$;

create or replace function onzio_private.can_mutate_content(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    onzio_private.is_aal2()
    and onzio_private.is_club_member(p_club_id)
    and exists (
      select 1
      from onzio.clubs club
      where club.id = p_club_id
        and (
          club.lifecycle = 'onboarding'
          or (
            club.lifecycle = 'active'
            and (
              not exists (
                select 1
                from onzio.club_subscriptions subscription
                where subscription.club_id = club.id
              )
              or onzio_private.subscription_public_access(club.id, now()) = 'live'
            )
          )
        )
    );
$$;

create or replace function onzio_private.record_stripe_rejection(
  p_event_id text,
  p_event_type text,
  p_stripe_created_at timestamptz,
  p_environment text,
  p_club_id uuid,
  p_payload_digest text,
  p_rejection_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  insert into onzio.stripe_events (
    id,
    club_id,
    environment,
    event_type,
    stripe_created_at,
    outcome,
    rejection_code,
    payload_digest
  )
  values (
    p_event_id,
    case
      when exists (select 1 from onzio.clubs where id = p_club_id)
        then p_club_id
      else null
    end,
    p_environment,
    p_event_type,
    p_stripe_created_at,
    'rejected',
    p_rejection_code,
    p_payload_digest
  )
  on conflict (id) do nothing;
end;
$$;

create or replace function onzio_private.apply_stripe_projection(
  p_event_id text,
  p_event_type text,
  p_stripe_created_at timestamptz,
  p_environment text,
  p_club_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_price_id text,
  p_tier text,
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
  club_lifecycle text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_environment not in ('test', 'production')
    or p_tier not in ('starter', 'pro')
    or p_public_access not in ('preview', 'live', 'grace', 'suspended')
    or p_event_id = ''
    or p_customer_id = ''
    or p_subscription_id = ''
    or p_price_id = ''
  then
    raise exception 'invalid Stripe projection input' using errcode = '22023';
  end if;

  if exists (select 1 from onzio.stripe_events where id = p_event_id) then
    return jsonb_build_object('action', 'rejected', 'code', 'DUPLICATE_EVENT');
  end if;

  select lifecycle
  into club_lifecycle
  from onzio.clubs
  where id = p_club_id
  for update;

  if club_lifecycle is null then
    perform onzio_private.record_stripe_rejection(
      p_event_id,
      p_event_type,
      p_stripe_created_at,
      p_environment,
      p_club_id,
      p_payload_digest,
      'UNKNOWN_CLUB'
    );
    return jsonb_build_object('action', 'rejected', 'code', 'UNKNOWN_CLUB');
  end if;

  select *
  into current_subscription
  from onzio.club_subscriptions
  where club_id = p_club_id
  for update;

  if current_subscription.last_applied_stripe_event_created_at is not null
    and p_stripe_created_at
      <= current_subscription.last_applied_stripe_event_created_at
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
    return jsonb_build_object(
      'action', 'rejected', 'code', 'CUSTOMER_MISMATCH'
    );
  end if;

  if current_subscription.stripe_subscription_id is not null
    and current_subscription.stripe_subscription_id <> p_subscription_id
  then
    perform onzio_private.record_stripe_rejection(
      p_event_id, p_event_type, p_stripe_created_at, p_environment, p_club_id,
      p_payload_digest, 'SUBSCRIPTION_MISMATCH'
    );
    return jsonb_build_object(
      'action', 'rejected', 'code', 'SUBSCRIPTION_MISMATCH'
    );
  end if;

  insert into onzio.stripe_events (
    id,
    club_id,
    environment,
    event_type,
    stripe_created_at,
    outcome,
    payload_digest
  )
  values (
    p_event_id,
    p_club_id,
    p_environment,
    p_event_type,
    p_stripe_created_at,
    'received',
    p_payload_digest
  );

  insert into onzio.club_subscriptions (
    club_id,
    stripe_customer_id,
    stripe_subscription_id,
    price_id,
    tier,
    status,
    cancel_at_period_end,
    paid_through,
    grace_ends_at,
    last_applied_stripe_event_id,
    last_applied_stripe_event_created_at,
    updated_at
  )
  values (
    p_club_id,
    p_customer_id,
    p_subscription_id,
    p_price_id,
    p_tier,
    p_status,
    p_cancel_at_period_end,
    p_paid_through,
    p_grace_ends_at,
    p_event_id,
    p_stripe_created_at,
    now()
  )
  on conflict (club_id) do update
  set
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    price_id = excluded.price_id,
    tier = excluded.tier,
    status = excluded.status,
    cancel_at_period_end = excluded.cancel_at_period_end,
    paid_through = excluded.paid_through,
    grace_ends_at = excluded.grace_ends_at,
    last_applied_stripe_event_id = excluded.last_applied_stripe_event_id,
    last_applied_stripe_event_created_at =
      excluded.last_applied_stripe_event_created_at,
    updated_at = now();

  update onzio.clubs
  set
    tier = p_tier,
    lifecycle = case
      when lifecycle = 'onboarding'
        and p_status in ('active', 'trialing') then 'active'
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

revoke all on function onzio_private.record_stripe_rejection(
  text, text, timestamptz, text, uuid, text, text
) from public, anon, authenticated;
revoke all on function onzio_private.apply_stripe_projection(
  text, text, timestamptz, text, uuid, text, text, text, text, text,
  boolean, timestamptz, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function onzio_private.record_stripe_rejection(
  text, text, timestamptz, text, uuid, text, text
) to service_role;
grant execute on function onzio_private.apply_stripe_projection(
  text, text, timestamptz, text, uuid, text, text, text, text, text,
  boolean, timestamptz, timestamptz, text, text
) to service_role;

-- PostgREST exposes only the onzio schema. These security-invoker wrappers are
-- callable by service_role alone and delegate to the unexposed private helpers.
create or replace function onzio.record_stripe_rejection(
  p_event_id text,
  p_event_type text,
  p_stripe_created_at timestamptz,
  p_environment text,
  p_club_id uuid,
  p_payload_digest text,
  p_rejection_code text
)
returns void
language sql
security invoker
as $$
  select onzio_private.record_stripe_rejection(
    p_event_id,
    p_event_type,
    p_stripe_created_at,
    p_environment,
    p_club_id,
    p_payload_digest,
    p_rejection_code
  );
$$;

create or replace function onzio.apply_stripe_projection(
  p_event_id text,
  p_event_type text,
  p_stripe_created_at timestamptz,
  p_environment text,
  p_club_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_price_id text,
  p_tier text,
  p_status text,
  p_cancel_at_period_end boolean,
  p_paid_through timestamptz,
  p_grace_ends_at timestamptz,
  p_public_access text,
  p_payload_digest text
)
returns jsonb
language sql
security invoker
as $$
  select onzio_private.apply_stripe_projection(
    p_event_id,
    p_event_type,
    p_stripe_created_at,
    p_environment,
    p_club_id,
    p_customer_id,
    p_subscription_id,
    p_price_id,
    p_tier,
    p_status,
    p_cancel_at_period_end,
    p_paid_through,
    p_grace_ends_at,
    p_public_access,
    p_payload_digest
  );
$$;

revoke all on function onzio.record_stripe_rejection(
  text, text, timestamptz, text, uuid, text, text
) from public, anon, authenticated;
revoke all on function onzio.apply_stripe_projection(
  text, text, timestamptz, text, uuid, text, text, text, text, text,
  boolean, timestamptz, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function onzio.record_stripe_rejection(
  text, text, timestamptz, text, uuid, text, text
) to service_role;
grant execute on function onzio.apply_stripe_projection(
  text, text, timestamptz, text, uuid, text, text, text, text, text,
  boolean, timestamptz, timestamptz, text, text
) to service_role;

-- Safe runtime projection used by routing. It reveals only the same coarse
-- access state the public site already exposes through availability.
create or replace function onzio.get_club_runtime_access(p_club_id uuid)
returns text
language sql
stable
security invoker
as $$
  select onzio_private.subscription_public_access(p_club_id, now());
$$;

revoke all on function onzio.get_club_runtime_access(uuid) from public;
grant execute on function onzio.get_club_runtime_access(uuid)
  to anon, authenticated, service_role;
