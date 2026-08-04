-- PLAT-102: per-club billing intent, kind-derived billing requirements,
-- tier-free authorization, lifecycle automation, and sanitized delivery
-- monitoring. Stripe remains the billing fact; clubs.stripe_price_id is the
-- operator-approved Checkout intent.

alter table onzio.clubs
  add column kind text not null default 'test'
    check (kind in ('customer', 'demo', 'test')),
  add column stripe_price_id text
    check (stripe_price_id is null or stripe_price_id ~ '^price_[A-Za-z0-9_]+$');

comment on column onzio.clubs.kind is
  'Only customer clubs require Stripe-backed paid access.';
comment on column onzio.clubs.stripe_price_id is
  'Operator-approved Checkout Price intent. Webhooks never overwrite it.';
comment on column onzio.clubs.tier is
  'Dormant rollback metadata retained during PLAT-102; never an authorization input.';
comment on column onzio.club_subscriptions.tier is
  'Dormant rollback metadata retained during PLAT-102; webhook projection no longer writes it.';

update onzio.clubs
set
  kind = case
    when slug = 'diverse-city' then 'customer'
    when slug = 'rose-city' then 'demo'
    else 'test'
  end,
  updated_at = now()
where slug in ('diverse-city', 'rose-city', 'alpha', 'bravo');

-- The policy graph stays unchanged. Existing feature wrappers remain the
-- policy seam but ignore their feature argument and delegate to club/content
-- authorization. The direct tier helper is deleted.
create or replace function onzio_private.can_read_feature(
  p_club_id uuid,
  p_feature text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select onzio_private.can_read_club(p_club_id);
$$;

create or replace function onzio_private.can_mutate_feature(
  p_club_id uuid,
  p_feature text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select onzio_private.can_mutate_content(p_club_id);
$$;

revoke all on function onzio_private.club_has_feature(uuid, text)
  from public, anon, authenticated, service_role;
drop function onzio_private.club_has_feature(uuid, text);

-- Runtime access is an explicit projection. The lifecycle cron owns the only
-- time-driven transition from grace to suspended.
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
    else club.public_access
  end
  from onzio.clubs club
  where club.id = p_club_id;
$$;

create or replace function onzio_private.can_mutate_content(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    onzio_private.is_club_session_fresh()
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
              club.kind in ('demo', 'test')
              or club.public_access = 'live'
            )
          )
        )
    );
$$;

-- Remove the tier-bearing projection API before creating its PLAT-102 shape.
drop function onzio.apply_stripe_projection(
  text, text, timestamptz, text, uuid, text, text, text, text, text,
  boolean, timestamptz, timestamptz, text, text
);
drop function onzio_private.apply_stripe_projection(
  text, text, timestamptz, text, uuid, text, text, text, text, text,
  boolean, timestamptz, timestamptz, text, text
);

create function onzio_private.apply_stripe_projection(
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
    grace_ends_at = case
      when excluded.status = 'past_due'
        then coalesce(onzio.club_subscriptions.grace_ends_at, excluded.grace_ends_at)
      else excluded.grace_ends_at
    end,
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

create function onzio.apply_stripe_projection(
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
language sql
security invoker
as $$
  select onzio_private.apply_stripe_projection(
    p_event_id, p_event_type, p_stripe_created_at, p_environment, p_club_id,
    p_customer_id, p_subscription_id, p_price_id, p_status,
    p_cancel_at_period_end, p_paid_through, p_grace_ends_at,
    p_public_access, p_payload_digest
  );
$$;

revoke all on function onzio.apply_stripe_projection(
  text, text, timestamptz, text, uuid, text, text, text, text,
  boolean, timestamptz, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function onzio.apply_stripe_projection(
  text, text, timestamptz, text, uuid, text, text, text, text,
  boolean, timestamptz, timestamptz, text, text
) to service_role;

-- Immutable, sanitized provider-delivery evidence. Recipient addresses,
-- subjects, bodies, and raw webhook payloads are deliberately absent.
create table onzio.email_delivery_events (
  id text primary key,
  event_type text not null
    check (event_type in (
      'email.bounced', 'email.complained', 'email.failed', 'email.delivery_delayed'
    )),
  provider_email_id text not null,
  occurred_at timestamptz not null,
  payload_digest text not null check (payload_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);

alter table onzio.email_delivery_events enable row level security;
revoke all on onzio.email_delivery_events from public, anon, authenticated;
grant select, insert on onzio.email_delivery_events to service_role;
revoke update, delete on onzio.email_delivery_events from service_role;

comment on table onzio.email_delivery_events is
  'Append-only sanitized Resend delivery outcomes; never stores recipient or message content.';

-- Lifecycle work is transactional and service-role-only. Warning and drift
-- audit rows are idempotent per billing episode or observed Price pair.
create function onzio_private.run_billing_lifecycle(
  p_now timestamptz,
  p_suspension_enabled boolean,
  p_reconciliation_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  warning_count integer := 0;
  suspension_count integer := 0;
  divergence_count integer := 0;
  divergence_reason text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  for candidate in
    select
      club.id as club_id,
      club.lifecycle,
      club.public_access,
      club.stripe_price_id,
      subscription.price_id,
      subscription.status,
      subscription.paid_through,
      subscription.grace_ends_at
    from onzio.clubs club
    left join onzio.club_subscriptions subscription
      on subscription.club_id = club.id
    where club.kind = 'customer'
      and club.lifecycle <> 'archived'
    for update of club
  loop
    if candidate.status = 'past_due' and candidate.paid_through is not null then
      if p_now >= candidate.paid_through + interval '7 days'
        and not exists (
          select 1 from onzio.audit_events audit
          where audit.club_id = candidate.club_id
            and audit.operation = 'billing_grace_warning_day_7'
            and audit.payload ->> 'paid_through'
              = (to_jsonb(candidate.paid_through) #>> '{}')
        )
      then
        insert into onzio.audit_events (
          club_id, actor_type, operation, resource_type, resource_id, payload
        ) values (
          candidate.club_id, 'system', 'billing_grace_warning_day_7',
          'club_subscription', candidate.club_id::text,
          jsonb_build_object('day', 7, 'paid_through', candidate.paid_through)
        );
        warning_count := warning_count + 1;
      end if;

      if p_now >= candidate.paid_through + interval '17 days'
        and not exists (
          select 1 from onzio.audit_events audit
          where audit.club_id = candidate.club_id
            and audit.operation = 'billing_grace_warning_day_17'
            and audit.payload ->> 'paid_through'
              = (to_jsonb(candidate.paid_through) #>> '{}')
        )
      then
        insert into onzio.audit_events (
          club_id, actor_type, operation, resource_type, resource_id, payload
        ) values (
          candidate.club_id, 'system', 'billing_grace_warning_day_17',
          'club_subscription', candidate.club_id::text,
          jsonb_build_object('day', 17, 'paid_through', candidate.paid_through)
        );
        warning_count := warning_count + 1;
      end if;
    end if;

    if p_suspension_enabled
      and candidate.grace_ends_at is not null
      and p_now > candidate.grace_ends_at
      and candidate.public_access <> 'suspended'
    then
      update onzio.clubs
      set public_access = 'suspended', updated_at = now()
      where id = candidate.club_id;
      insert into onzio.audit_events (
        club_id, actor_type, operation, resource_type, resource_id, payload
      ) values (
        candidate.club_id, 'system', 'billing_suspended',
        'club', candidate.club_id::text,
        jsonb_build_object('grace_ends_at', candidate.grace_ends_at)
      );
      suspension_count := suspension_count + 1;
    end if;

    if p_reconciliation_enabled and candidate.lifecycle = 'active' then
      divergence_reason := case
        when candidate.stripe_price_id is null then 'BILLING_INTENT_MISSING'
        when candidate.price_id is null then 'SUBSCRIPTION_MISSING'
        when candidate.stripe_price_id <> candidate.price_id then 'PRICE_MISMATCH'
        else null
      end;
      if divergence_reason is not null then
        divergence_count := divergence_count + 1;
        if not exists (
          select 1 from onzio.audit_events audit
          where audit.club_id = candidate.club_id
            and audit.operation = 'billing_reconciliation_divergence'
            and audit.payload ->> 'reason' = divergence_reason
            and audit.payload ->> 'intended_price_id'
              is not distinct from candidate.stripe_price_id
            and audit.payload ->> 'actual_price_id'
              is not distinct from candidate.price_id
        )
        then
          insert into onzio.audit_events (
            club_id, actor_type, operation, resource_type, resource_id, payload
          ) values (
            candidate.club_id, 'system', 'billing_reconciliation_divergence',
            'club_subscription', candidate.club_id::text,
            jsonb_build_object(
              'reason', divergence_reason,
              'intended_price_id', candidate.stripe_price_id,
              'actual_price_id', candidate.price_id
            )
          );
        end if;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'warnings', warning_count,
    'suspensions', suspension_count,
    'divergences', divergence_count
  );
end;
$$;

revoke all on function onzio_private.run_billing_lifecycle(
  timestamptz, boolean, boolean
) from public, anon, authenticated;
grant execute on function onzio_private.run_billing_lifecycle(
  timestamptz, boolean, boolean
) to service_role;

create function onzio.run_billing_lifecycle(
  p_now timestamptz,
  p_suspension_enabled boolean,
  p_reconciliation_enabled boolean
)
returns jsonb
language sql
security invoker
as $$
  select onzio_private.run_billing_lifecycle(
    p_now, p_suspension_enabled, p_reconciliation_enabled
  );
$$;

revoke all on function onzio.run_billing_lifecycle(
  timestamptz, boolean, boolean
) from public, anon, authenticated;
grant execute on function onzio.run_billing_lifecycle(
  timestamptz, boolean, boolean
) to service_role;
