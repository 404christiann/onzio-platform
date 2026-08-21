-- Generalize registration forms from one fixed minor flag to an explicit
-- participant mode, and persist the resolved participant type per submission.

alter table onzio.registration_forms
  add column participant_mode text;

update onzio.registration_forms
set participant_mode = case
  when is_minor then 'minor_only'
  else 'adult_only'
end;

alter table onzio.registration_forms
  alter column participant_mode set default 'adult_only',
  alter column participant_mode set not null,
  add constraint registration_forms_participant_mode_check
    check (participant_mode in ('minor_only', 'adult_only', 'both'));

alter table onzio.registration_form_fields
  add column participant_scope text not null default 'all'
    check (participant_scope in ('all', 'minor', 'adult'));

update onzio.registration_form_fields
set participant_scope = case
  when field_key in (
    'player_name',
    'guardian_name',
    'guardian_email',
    'guardian_phone'
  ) then 'minor'
  when field_key in (
    'registrant_name',
    'registrant_email',
    'registrant_phone'
  ) then 'adult'
  else 'all'
end;

alter table onzio.registration_form_fields
  drop constraint registration_form_fields_field_type_check,
  add constraint registration_form_fields_field_type_check
    check (
      field_type in (
        'name',
        'email',
        'phone',
        'date',
        'number',
        'short_text',
        'long_text',
        'dropdown',
        'checkbox',
        'signature'
      )
    );

alter table onzio.registrations
  add column participant_type text;

update onzio.registrations registration
set participant_type = case
  when form.is_minor then 'minor'
  else 'adult'
end
from onzio.registration_forms form
where form.club_id = registration.club_id
  and form.id = registration.form_id;

alter table onzio.registrations
  alter column participant_type set not null,
  add constraint registrations_participant_type_check
    check (participant_type in ('minor', 'adult'));

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
  form_participant_mode text;
  required_core_keys text[];
  missing_core_keys text[];
begin
  select form.participant_mode
  into form_participant_mode
  from onzio.registration_forms form
  where form.club_id = p_club_id
    and form.id = p_form_id;

  if form_participant_mode is null then
    raise exception using
      errcode = '23503',
      message = 'REGISTRATION_FORM_NOT_FOUND';
  end if;

  required_core_keys := case form_participant_mode
    when 'minor_only' then array[
      'player_name',
      'guardian_name',
      'guardian_email',
      'guardian_phone',
      'emergency_contact_name',
      'emergency_contact_phone'
    ]
    when 'adult_only' then array[
      'registrant_name',
      'registrant_email',
      'registrant_phone',
      'emergency_contact_name',
      'emergency_contact_phone'
    ]
    else array[
      'player_name',
      'guardian_name',
      'guardian_email',
      'guardian_phone',
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
      and field.participant_scope = case
        when required_key in (
          'player_name',
          'guardian_name',
          'guardian_email',
          'guardian_phone'
        ) then 'minor'
        when required_key in (
          'registrant_name',
          'registrant_email',
          'registrant_phone'
        ) then 'adult'
        else 'all'
      end
      and (
        (required_key like '%_email' and field.field_type = 'email')
        or (required_key like '%_phone' and field.field_type = 'phone')
        or (
          required_key in (
            'player_name',
            'guardian_name',
            'registrant_name',
            'emergency_contact_name'
          )
          and field.field_type = 'name'
        )
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

drop function onzio.create_pending_registration(
  uuid, uuid, jsonb, text, uuid, timestamptz, text, text
);
drop function onzio_private.create_pending_registration(
  uuid, uuid, jsonb, text, uuid, timestamptz, text, text
);

create function onzio_private.create_pending_registration(
  p_club_id uuid,
  p_form_id uuid,
  p_answers jsonb,
  p_registrant_email text,
  p_participant_type text,
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
  form_participant_mode text;
  selected_price record;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_answers) <> 'object'
    or char_length(p_registrant_email) not between 3 and 320
    or p_participant_type not in ('minor', 'adult')
    or p_status_token_hash !~ '^[0-9a-f]{64}$'
    or p_environment not in ('test', 'production')
  then
    raise exception using
      errcode = '22023',
      message = 'INVALID_REGISTRATION_INPUT';
  end if;

  select form.status, form.participant_mode
  into form_status, form_participant_mode
  from onzio.registration_forms form
  where form.club_id = p_club_id
    and form.id = p_form_id
  for update;

  if form_status is distinct from 'open' then
    raise exception using
      errcode = '55000',
      message = 'REGISTRATION_FORM_CLOSED';
  end if;

  if (form_participant_mode = 'minor_only' and p_participant_type <> 'minor')
    or (form_participant_mode = 'adult_only' and p_participant_type <> 'adult')
    or form_participant_mode not in ('minor_only', 'adult_only', 'both')
  then
    raise exception using
      errcode = '22023',
      message = 'REGISTRATION_PARTICIPANT_TYPE_INVALID';
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
    participant_type,
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
    p_participant_type,
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

revoke all on function onzio_private.create_pending_registration(
  uuid, uuid, jsonb, text, text, uuid, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function onzio_private.create_pending_registration(
  uuid, uuid, jsonb, text, text, uuid, timestamptz, text, text
) to service_role;

create function onzio.create_pending_registration(
  p_club_id uuid,
  p_form_id uuid,
  p_answers jsonb,
  p_registrant_email text,
  p_participant_type text,
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
    p_participant_type,
    p_price_option_id,
    p_waiver_accepted_at,
    p_status_token_hash,
    p_environment
  );
$$;

revoke all on function onzio.create_pending_registration(
  uuid, uuid, jsonb, text, text, uuid, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function onzio.create_pending_registration(
  uuid, uuid, jsonb, text, text, uuid, timestamptz, text, text
) to service_role;

alter table onzio.registration_forms
  drop column is_minor;
