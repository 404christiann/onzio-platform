-- Native club registrations and direct Stripe Connect payment projection.
--
-- Public callers may read only open form definitions. Submitted answers and
-- payment references are never exposed anonymously and may only be written by
-- the service-role server boundaries.

create table onzio.club_stripe_connect (
  club_id uuid primary key references onzio.clubs(id) on delete restrict,
  stripe_account_id text not null unique
    check (stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
  environment text not null check (environment in ('test', 'production')),
  charges_enabled boolean not null default false,
  details_submitted boolean not null default false,
  payouts_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table onzio.registration_forms (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  slug text not null
    check (
      char_length(slug) between 1 and 80
      and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    ),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '' check (char_length(description) <= 5000),
  is_minor boolean not null default false,
  waiver_text text not null default
    $registration_waiver$LIABILITY WAIVER AND CONSENT

By submitting this registration, I acknowledge and agree to the following on behalf of the registrant named above:

1. Assumption of Risk. Participation in soccer training, tryouts, and related club activities carries an inherent risk of injury, including but not limited to sprains, fractures, concussions, and other physical harm. I voluntarily assume all such risks on behalf of the registrant.

2. Release of Liability. To the fullest extent permitted by law, I release [Club Name], its coaches, staff, volunteers, and affiliated organizations from any and all claims, liabilities, or damages arising from the registrant's participation, except in cases of gross negligence or willful misconduct.

3. Medical Authorization. I authorize club staff to seek and consent to emergency medical treatment for the registrant if I cannot be immediately reached, and I agree to be financially responsible for any costs not covered by insurance.

4. Photo/Media Release. I grant [Club Name] permission to photograph or video the registrant during club activities and to use those images for the club's promotional materials, website, and social media, unless I have separately notified the club in writing that I do not consent.

5. Code of Conduct. I agree that the registrant (and I, as a parent/guardian, where applicable) will follow the club's rules of conduct and respect coaches, staff, officials, and fellow participants.

I have read and understood this waiver and agree to its terms.$registration_waiver$
    check (char_length(waiver_text) between 1 and 50000),
  status text not null default 'draft'
    check (status in ('draft', 'open', 'closed')),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, id),
  unique (club_id, slug),
  check (
    (status = 'closed' and closed_at is not null)
    or (status <> 'closed' and closed_at is null)
  )
);

create table onzio.registration_form_fields (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  form_id uuid not null,
  field_key text not null
    check (
      char_length(field_key) between 1 and 80
      and field_key ~ '^[a-z][a-z0-9_]*$'
    ),
  label text not null check (char_length(label) between 1 and 160),
  field_type text not null
    check (
      field_type in (
        'name',
        'email',
        'phone',
        'date',
        'number',
        'short_text',
        'dropdown',
        'checkbox'
      )
    ),
  options jsonb not null default '[]'::jsonb
    check (jsonb_typeof(options) = 'array'),
  required boolean not null default false,
  is_core boolean not null default false,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, id),
  unique (club_id, form_id, field_key),
  unique (club_id, form_id, position),
  foreign key (club_id, form_id)
    references onzio.registration_forms(club_id, id)
    on delete cascade,
  check (
    (field_type = 'dropdown' and jsonb_array_length(options) > 0)
    or (field_type <> 'dropdown' and options = '[]'::jsonb)
  )
);

create table onzio.registration_price_options (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  form_id uuid not null,
  label text not null check (char_length(label) between 1 and 160),
  amount_cents integer not null check (amount_cents between 0 and 100000000),
  position integer not null default 0 check (position >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, id),
  unique (club_id, form_id, id),
  unique (club_id, form_id, position),
  foreign key (club_id, form_id)
    references onzio.registration_forms(club_id, id)
    on delete cascade
);

create table onzio.registrations (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  form_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'refunded', 'expired')),
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  registrant_email text not null
    check (char_length(registrant_email) between 3 and 320),
  price_option_id uuid not null,
  price_label text not null check (char_length(price_label) between 1 and 160),
  amount_cents integer not null check (amount_cents between 0 and 100000000),
  amount_refunded_cents integer not null default 0
    check (
      amount_refunded_cents >= 0
      and amount_refunded_cents <= amount_cents
    ),
  waiver_accepted_at timestamptz not null,
  status_token_hash text not null unique
    check (status_token_hash ~ '^[0-9a-f]{64}$'),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  paid_at timestamptz,
  refunded_at timestamptz,
  submitted_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  payment_recovery_required boolean not null default false,
  payment_recovery_reason text,
  payment_recovery_detected_at timestamptz,
  registrant_email_status text not null default 'pending'
    check (registrant_email_status in ('pending', 'sent', 'failed', 'skipped')),
  admin_email_status text not null default 'pending'
    check (admin_email_status in ('pending', 'sent', 'failed', 'skipped')),
  email_error text check (email_error is null or char_length(email_error) <= 500),
  unique (club_id, id),
  foreign key (club_id, form_id)
    references onzio.registration_forms(club_id, id)
    on delete restrict,
  foreign key (club_id, form_id, price_option_id)
    references onzio.registration_price_options(club_id, form_id, id)
    on delete restrict,
  check (expires_at > submitted_at),
  check (
    (
      not payment_recovery_required
      and payment_recovery_reason is null
      and payment_recovery_detected_at is null
    )
    or (
      payment_recovery_required
      and payment_recovery_reason = 'checkout_completed_after_expiry'
      and payment_recovery_detected_at is not null
    )
  ),
  check (
    (status = 'pending' and paid_at is null and refunded_at is null)
    or (status = 'paid' and paid_at is not null and refunded_at is null)
    or (
      status = 'refunded'
      and paid_at is not null
      and refunded_at is not null
      and amount_refunded_cents > 0
    )
    or (status = 'expired' and paid_at is null and refunded_at is null)
  )
);

create unique index registrations_payment_intent_unique_idx
  on onzio.registrations (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index registration_forms_public_idx
  on onzio.registration_forms (club_id, slug)
  where status = 'open';

create index registration_fields_form_position_idx
  on onzio.registration_form_fields (club_id, form_id, position);

create index registration_prices_form_position_idx
  on onzio.registration_price_options (club_id, form_id, position)
  where active;

create index registrations_roster_idx
  on onzio.registrations (club_id, form_id, status, submitted_at desc);

create index registrations_expiry_idx
  on onzio.registrations (expires_at)
  where status = 'pending';

create or replace function onzio_private.can_read_registration_form(
  p_club_id uuid,
  p_form_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from onzio.registration_forms form
    where form.club_id = p_club_id
      and form.id = p_form_id
      and (
        (
          form.status = 'open'
          and onzio_private.can_read_feature(
            form.club_id,
            'registrations'
          )
        )
        or onzio_private.can_mutate_feature(
          form.club_id,
          'registrations'
        )
      )
  );
$$;

revoke execute on function
  onzio_private.can_read_registration_form(uuid, uuid)
from public;
grant execute on function
  onzio_private.can_read_registration_form(uuid, uuid)
to anon, authenticated, service_role;

create or replace function onzio_private.assert_registration_form_publishable(
  p_club_id uuid,
  p_form_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_price_count integer;
  paid_price_count integer;
  form_is_minor boolean;
  required_core_keys text[];
  missing_core_keys text[];
begin
  select form.is_minor
  into form_is_minor
  from onzio.registration_forms form
  where form.club_id = p_club_id
    and form.id = p_form_id;

  if form_is_minor is null then
    raise exception using
      errcode = '23503',
      message = 'REGISTRATION_FORM_NOT_FOUND';
  end if;

  required_core_keys := case
    when form_is_minor then array[
      'player_name',
      'guardian_name',
      'guardian_email',
      'guardian_phone',
      'emergency_contact_name',
      'emergency_contact_phone'
    ]
    else array[
      'registrant_name',
      'registrant_email',
      'registrant_phone',
      'emergency_contact_name',
      'emergency_contact_phone'
    ]
  end;

  select coalesce(array_agg(required_key order by required_key), array[]::text[])
  into missing_core_keys
  from unnest(required_core_keys) as required_key
  where not exists (
    select 1
    from onzio.registration_form_fields field
    where field.club_id = p_club_id
      and field.form_id = p_form_id
      and field.field_key = required_key
      and field.required
      and field.is_core
      and (
        (required_key like '%_email' and field.field_type = 'email')
        or (required_key like '%_phone' and field.field_type = 'phone')
        or (required_key in (
          'player_name',
          'guardian_name',
          'registrant_name',
          'emergency_contact_name'
        )
          and field.field_type = 'name')
      )
  );

  if cardinality(missing_core_keys) > 0 then
    raise exception using
      errcode = '23514',
      message = 'REGISTRATION_CORE_FIELDS_REQUIRED';
  end if;

  if exists (
    select 1
    from onzio.registration_form_fields field
    where field.club_id = p_club_id
      and field.form_id = p_form_id
      and field.is_core
      and field.field_key <> all(required_core_keys)
  ) then
    raise exception using
      errcode = '23514',
      message = 'REGISTRATION_CORE_FIELD_INVALID';
  end if;

  select
    count(*) filter (where price.active),
    count(*) filter (where price.active and price.amount_cents > 0)
  into active_price_count, paid_price_count
  from onzio.registration_price_options price
  where price.club_id = p_club_id
    and price.form_id = p_form_id;

  if active_price_count < 1 then
    raise exception using
      errcode = '23514',
      message = 'REGISTRATION_PRICE_OPTION_REQUIRED';
  end if;

  if paid_price_count > 0 and not exists (
    select 1
    from onzio.club_stripe_connect connect
    where connect.club_id = p_club_id
      and connect.charges_enabled
  ) then
    raise exception using
      errcode = '23514',
      message = 'STRIPE_CONNECT_REQUIRED';
  end if;
end;
$$;

revoke execute on function
  onzio_private.assert_registration_form_publishable(uuid, uuid)
from public;

create or replace function onzio_private.prepare_registration_form_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'closed' then
    new.closed_at := coalesce(new.closed_at, now());
  else
    new.closed_at := null;
  end if;

  if new.status = 'open' then
    perform onzio_private.assert_registration_form_publishable(
      new.club_id,
      new.id
    );
  end if;

  return new;
end;
$$;

revoke execute on function
  onzio_private.prepare_registration_form_status()
from public;

create or replace function onzio_private.recheck_open_registration_form()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tenant_id uuid := coalesce(new.club_id, old.club_id);
  registration_form_id uuid := coalesce(new.form_id, old.form_id);
begin
  if exists (
    select 1
    from onzio.registration_forms form
    where form.club_id = tenant_id
      and form.id = registration_form_id
      and form.status = 'open'
  ) then
    perform onzio_private.assert_registration_form_publishable(
      tenant_id,
      registration_form_id
    );
  end if;

  return coalesce(new, old);
end;
$$;

revoke execute on function
  onzio_private.recheck_open_registration_form()
from public;

create trigger prepare_registration_form_status
before insert or update on onzio.registration_forms
for each row execute function
  onzio_private.prepare_registration_form_status();

create constraint trigger recheck_open_registration_form_prices
after insert or update or delete on onzio.registration_price_options
deferrable initially deferred
for each row execute function
  onzio_private.recheck_open_registration_form();

create constraint trigger recheck_open_registration_form_fields
after insert or update or delete on onzio.registration_form_fields
deferrable initially deferred
for each row execute function
  onzio_private.recheck_open_registration_form();

create trigger set_club_stripe_connect_updated_at
before update on onzio.club_stripe_connect
for each row execute function onzio_private.set_updated_at();

create trigger set_registration_forms_updated_at
before update on onzio.registration_forms
for each row execute function onzio_private.set_updated_at();

create trigger set_registration_form_fields_updated_at
before update on onzio.registration_form_fields
for each row execute function onzio_private.set_updated_at();

create trigger set_registration_price_options_updated_at
before update on onzio.registration_price_options
for each row execute function onzio_private.set_updated_at();

create trigger audit_registration_forms
after insert or update or delete on onzio.registration_forms
for each row execute function onzio_private.audit_content_mutation();

create trigger audit_registration_form_fields
after insert or update or delete on onzio.registration_form_fields
for each row execute function onzio_private.audit_content_mutation();

create trigger audit_registration_price_options
after insert or update or delete on onzio.registration_price_options
for each row execute function onzio_private.audit_content_mutation();

grant all on onzio.club_stripe_connect to service_role;
grant all on onzio.registration_forms to service_role;
grant all on onzio.registration_form_fields to service_role;
grant all on onzio.registration_price_options to service_role;
grant all on onzio.registrations to service_role;

grant select on onzio.club_stripe_connect to authenticated;
grant select, insert, update, delete on onzio.registration_forms
  to authenticated;
grant select, insert, update, delete on onzio.registration_form_fields
  to authenticated;
grant select, insert, update, delete on onzio.registration_price_options
  to authenticated;
grant select on onzio.registrations to authenticated;

grant select on onzio.registration_forms to anon;
grant select on onzio.registration_form_fields to anon;
grant select on onzio.registration_price_options to anon;

revoke all on onzio.club_stripe_connect from anon;
revoke all on onzio.registrations from anon;
revoke insert, update, delete on onzio.club_stripe_connect
  from authenticated;
revoke insert, update, delete on onzio.registrations
  from authenticated;

alter table onzio.club_stripe_connect enable row level security;
alter table onzio.registration_forms enable row level security;
alter table onzio.registration_form_fields enable row level security;
alter table onzio.registration_price_options enable row level security;
alter table onzio.registrations enable row level security;

create policy club_stripe_connect_member_read
on onzio.club_stripe_connect
for select
to authenticated
using (
  onzio_private.can_mutate_feature(club_id, 'registrations')
);

create policy registration_forms_tenant_read
on onzio.registration_forms
for select
to anon, authenticated
using (onzio_private.can_read_registration_form(club_id, id));

create policy registration_forms_tenant_insert
on onzio.registration_forms
for insert
to authenticated
with check (
  onzio_private.can_mutate_feature(club_id, 'registrations')
);

create policy registration_forms_tenant_update
on onzio.registration_forms
for update
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'registrations'))
with check (onzio_private.can_mutate_feature(club_id, 'registrations'));

create policy registration_forms_tenant_delete
on onzio.registration_forms
for delete
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'registrations'));

create policy registration_form_fields_tenant_read
on onzio.registration_form_fields
for select
to anon, authenticated
using (onzio_private.can_read_registration_form(club_id, form_id));

create policy registration_form_fields_tenant_insert
on onzio.registration_form_fields
for insert
to authenticated
with check (
  onzio_private.can_mutate_feature(club_id, 'registrations')
);

create policy registration_form_fields_tenant_update
on onzio.registration_form_fields
for update
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'registrations'))
with check (onzio_private.can_mutate_feature(club_id, 'registrations'));

create policy registration_form_fields_tenant_delete
on onzio.registration_form_fields
for delete
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'registrations'));

create policy registration_price_options_tenant_read
on onzio.registration_price_options
for select
to anon, authenticated
using (onzio_private.can_read_registration_form(club_id, form_id));

create policy registration_price_options_tenant_insert
on onzio.registration_price_options
for insert
to authenticated
with check (
  onzio_private.can_mutate_feature(club_id, 'registrations')
);

create policy registration_price_options_tenant_update
on onzio.registration_price_options
for update
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'registrations'))
with check (onzio_private.can_mutate_feature(club_id, 'registrations'));

create policy registration_price_options_tenant_delete
on onzio.registration_price_options
for delete
to authenticated
using (onzio_private.can_mutate_feature(club_id, 'registrations'));

create policy registrations_member_read
on onzio.registrations
for select
to authenticated
using (
  onzio_private.can_mutate_feature(club_id, 'registrations')
);

create or replace function onzio_private.create_pending_registration(
  p_club_id uuid,
  p_form_id uuid,
  p_answers jsonb,
  p_registrant_email text,
  p_price_option_id uuid,
  p_waiver_accepted_at timestamptz,
  p_status_token_hash text,
  p_environment text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  registration_id uuid;
  form_status text;
  selected_price record;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_answers) <> 'object'
    or char_length(p_registrant_email) not between 3 and 320
    or p_status_token_hash !~ '^[0-9a-f]{64}$'
    or p_environment not in ('test', 'production')
  then
    raise exception using
      errcode = '22023',
      message = 'INVALID_REGISTRATION_INPUT';
  end if;

  select form.status
  into form_status
  from onzio.registration_forms form
  where form.club_id = p_club_id
    and form.id = p_form_id
  for update;

  if form_status is distinct from 'open' then
    raise exception using
      errcode = '55000',
      message = 'REGISTRATION_FORM_CLOSED';
  end if;

  select price.id, price.label, price.amount_cents
  into selected_price
  from onzio.registration_price_options price
  where price.club_id = p_club_id
    and price.form_id = p_form_id
    and price.id = p_price_option_id
    and price.active;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'REGISTRATION_PRICE_INVALID';
  end if;

  if selected_price.amount_cents > 0 and not exists (
    select 1
    from onzio.club_stripe_connect connect
    where connect.club_id = p_club_id
      and connect.environment = p_environment
      and connect.charges_enabled
  ) then
    raise exception using
      errcode = '55000',
      message = 'STRIPE_CONNECT_REQUIRED';
  end if;

  insert into onzio.registrations (
    club_id,
    form_id,
    answers,
    registrant_email,
    price_option_id,
    price_label,
    amount_cents,
    waiver_accepted_at,
    status_token_hash
  )
  values (
    p_club_id,
    p_form_id,
    p_answers,
    lower(trim(p_registrant_email)),
    selected_price.id,
    selected_price.label,
    selected_price.amount_cents,
    p_waiver_accepted_at,
    p_status_token_hash
  )
  returning id into registration_id;

  return registration_id;
end;
$$;

create or replace function onzio_private.attach_registration_checkout(
  p_club_id uuid,
  p_registration_id uuid,
  p_checkout_session_id text,
  p_checkout_created_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_session_id text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_checkout_session_id !~ '^cs_(test|live)_[A-Za-z0-9]+$' then
    raise exception using
      errcode = '22023',
      message = 'INVALID_CHECKOUT_SESSION';
  end if;

  select registration.stripe_checkout_session_id
  into current_session_id
  from onzio.registrations registration
  join onzio.registration_forms form
    on form.club_id = registration.club_id
   and form.id = registration.form_id
  where registration.club_id = p_club_id
    and registration.id = p_registration_id
    and registration.status = 'pending'
    and registration.expires_at > now()
    and (
      form.closed_at is null
      or p_checkout_created_at <= form.closed_at
    )
  for update of registration;

  if not found then
    raise exception using
      errcode = '55000',
      message = 'REGISTRATION_CHECKOUT_CUTOFF';
  end if;
  if current_session_id is not null
    and current_session_id <> p_checkout_session_id
  then
    raise exception using
      errcode = '23505',
      message = 'REGISTRATION_CHECKOUT_ALREADY_ATTACHED';
  end if;

  update onzio.registrations
  set stripe_checkout_session_id = p_checkout_session_id
  where club_id = p_club_id
    and id = p_registration_id;
end;
$$;

create or replace function onzio_private.mark_free_registration_paid(
  p_club_id uuid,
  p_registration_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  update onzio.registrations
  set
    status = 'paid',
    paid_at = now()
  where club_id = p_club_id
    and id = p_registration_id
    and status = 'pending'
    and amount_cents = 0
    and expires_at > now();

  if not found then
    raise exception using
      errcode = '55000',
      message = 'FREE_REGISTRATION_COMPLETION_FAILED';
  end if;
end;
$$;

create or replace function onzio_private.expire_registration(
  p_club_id uuid,
  p_registration_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  update onzio.registrations
  set status = 'expired'
  where club_id = p_club_id
    and id = p_registration_id
    and status = 'pending';
end;
$$;

revoke all on function onzio_private.create_pending_registration(
  uuid, uuid, jsonb, text, uuid, timestamptz, text, text
) from public, anon, authenticated;
revoke all on function onzio_private.attach_registration_checkout(
  uuid, uuid, text, timestamptz
) from public, anon, authenticated;
revoke all on function onzio_private.mark_free_registration_paid(
  uuid, uuid
) from public, anon, authenticated;
revoke all on function onzio_private.expire_registration(
  uuid, uuid
) from public, anon, authenticated;

grant execute on function onzio_private.create_pending_registration(
  uuid, uuid, jsonb, text, uuid, timestamptz, text, text
) to service_role;
grant execute on function onzio_private.attach_registration_checkout(
  uuid, uuid, text, timestamptz
) to service_role;
grant execute on function onzio_private.mark_free_registration_paid(
  uuid, uuid
) to service_role;
grant execute on function onzio_private.expire_registration(
  uuid, uuid
) to service_role;

create or replace function onzio.create_pending_registration(
  p_club_id uuid,
  p_form_id uuid,
  p_answers jsonb,
  p_registrant_email text,
  p_price_option_id uuid,
  p_waiver_accepted_at timestamptz,
  p_status_token_hash text,
  p_environment text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select onzio_private.create_pending_registration(
    p_club_id,
    p_form_id,
    p_answers,
    p_registrant_email,
    p_price_option_id,
    p_waiver_accepted_at,
    p_status_token_hash,
    p_environment
  );
$$;

create or replace function onzio.attach_registration_checkout(
  p_club_id uuid,
  p_registration_id uuid,
  p_checkout_session_id text,
  p_checkout_created_at timestamptz
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select onzio_private.attach_registration_checkout(
    p_club_id,
    p_registration_id,
    p_checkout_session_id,
    p_checkout_created_at
  );
$$;

create or replace function onzio.mark_free_registration_paid(
  p_club_id uuid,
  p_registration_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select onzio_private.mark_free_registration_paid(
    p_club_id,
    p_registration_id
  );
$$;

create or replace function onzio.expire_registration(
  p_club_id uuid,
  p_registration_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select onzio_private.expire_registration(
    p_club_id,
    p_registration_id
  );
$$;

revoke all on function onzio.create_pending_registration(
  uuid, uuid, jsonb, text, uuid, timestamptz, text, text
) from public, anon, authenticated;
revoke all on function onzio.attach_registration_checkout(
  uuid, uuid, text, timestamptz
) from public, anon, authenticated;
revoke all on function onzio.mark_free_registration_paid(
  uuid, uuid
) from public, anon, authenticated;
revoke all on function onzio.expire_registration(
  uuid, uuid
) from public, anon, authenticated;

grant execute on function onzio.create_pending_registration(
  uuid, uuid, jsonb, text, uuid, timestamptz, text, text
) to service_role;
grant execute on function onzio.attach_registration_checkout(
  uuid, uuid, text, timestamptz
) to service_role;
grant execute on function onzio.mark_free_registration_paid(
  uuid, uuid
) to service_role;
grant execute on function onzio.expire_registration(
  uuid, uuid
) to service_role;

-- Stripe Connect webhook projections are atomic with the shared immutable
-- stripe_events ledger. This review build accepts test events only.
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
  if p_environment <> 'test'
    or p_event_type <> 'checkout.session.completed'
    or p_event_id !~ '^evt_[A-Za-z0-9]+$'
    or p_checkout_session_id !~ '^cs_test_[A-Za-z0-9]+$'
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
  if p_environment <> 'test'
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
  if p_environment <> 'test'
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

revoke all on function onzio_private.apply_registration_checkout_event(
  text, text, timestamptz, text, uuid, uuid, text, text, integer, text
) from public, anon, authenticated;
revoke all on function onzio_private.apply_registration_refund_event(
  text, text, timestamptz, text, uuid, uuid, text, integer, text
) from public, anon, authenticated;
revoke all on function onzio_private.apply_registration_connect_event(
  text, text, timestamptz, text, uuid, text, boolean, boolean, boolean, text
) from public, anon, authenticated;
grant execute on function onzio_private.apply_registration_checkout_event(
  text, text, timestamptz, text, uuid, uuid, text, text, integer, text
) to service_role;
grant execute on function onzio_private.apply_registration_refund_event(
  text, text, timestamptz, text, uuid, uuid, text, integer, text
) to service_role;
grant execute on function onzio_private.apply_registration_connect_event(
  text, text, timestamptz, text, uuid, text, boolean, boolean, boolean, text
) to service_role;

create or replace function onzio.apply_registration_checkout_event(
  p_event_id text, p_event_type text, p_stripe_created_at timestamptz,
  p_environment text, p_club_id uuid, p_registration_id uuid,
  p_checkout_session_id text, p_payment_intent_id text,
  p_amount_total integer, p_payload_digest text
)
returns jsonb language sql security invoker
set search_path = ''
as $$
  select onzio_private.apply_registration_checkout_event(
    p_event_id, p_event_type, p_stripe_created_at, p_environment, p_club_id,
    p_registration_id, p_checkout_session_id, p_payment_intent_id,
    p_amount_total, p_payload_digest
  );
$$;

create or replace function onzio.apply_registration_refund_event(
  p_event_id text, p_event_type text, p_stripe_created_at timestamptz,
  p_environment text, p_club_id uuid, p_registration_id uuid,
  p_payment_intent_id text, p_amount_refunded integer, p_payload_digest text
)
returns jsonb language sql security invoker
set search_path = ''
as $$
  select onzio_private.apply_registration_refund_event(
    p_event_id, p_event_type, p_stripe_created_at, p_environment, p_club_id,
    p_registration_id, p_payment_intent_id, p_amount_refunded, p_payload_digest
  );
$$;

create or replace function onzio.apply_registration_connect_event(
  p_event_id text, p_event_type text, p_stripe_created_at timestamptz,
  p_environment text, p_club_id uuid, p_stripe_account_id text,
  p_charges_enabled boolean, p_details_submitted boolean,
  p_payouts_enabled boolean, p_payload_digest text
)
returns jsonb language sql security invoker
set search_path = ''
as $$
  select onzio_private.apply_registration_connect_event(
    p_event_id, p_event_type, p_stripe_created_at, p_environment, p_club_id,
    p_stripe_account_id, p_charges_enabled, p_details_submitted,
    p_payouts_enabled, p_payload_digest
  );
$$;

revoke all on function onzio.apply_registration_checkout_event(
  text, text, timestamptz, text, uuid, uuid, text, text, integer, text
) from public, anon, authenticated;
revoke all on function onzio.apply_registration_refund_event(
  text, text, timestamptz, text, uuid, uuid, text, integer, text
) from public, anon, authenticated;
revoke all on function onzio.apply_registration_connect_event(
  text, text, timestamptz, text, uuid, text, boolean, boolean, boolean, text
) from public, anon, authenticated;
grant execute on function onzio.apply_registration_checkout_event(
  text, text, timestamptz, text, uuid, uuid, text, text, integer, text
) to service_role;
grant execute on function onzio.apply_registration_refund_event(
  text, text, timestamptz, text, uuid, uuid, text, integer, text
) to service_role;
grant execute on function onzio.apply_registration_connect_event(
  text, text, timestamptz, text, uuid, text, boolean, boolean, boolean, text
) to service_role;

notify pgrst, 'reload schema';
