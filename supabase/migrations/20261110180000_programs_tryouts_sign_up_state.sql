-- ADMIN-RE-12b: programs and tryouts take their sign-up state from the sign-up
-- way and the date (design decisions 0003 and 0004; group 2 decisions 2, 6, 8,
-- 10, 11, 12). Nothing here rewrites an existing row: every new column starts
-- at the value that keeps today's behavior, and `tryouts.status` stays (its
-- 'closed' is "closed by the owner"; 'upcoming' and 'open' now mean the same
-- thing, and the word the site prints is worked out when it is read).
--
-- What the site works out when it reads (lib/sign-up-state.ts), and what the
-- database enforces here so a direct link or another write path can't get
-- around it:
--   * a tryout closes by itself the day after its date, in the club's time
--     zone, unless the owner reopened it after the date passed;
--   * a hidden program, a hidden tryout, a program or tryout the owner closed,
--     and a tryout past its date take no sign-ups, so a sign-up form that only
--     they use refuses new sign-ups, even at /register/<form>;
--   * a club has at most 500 tryouts, on every write path (decision 7).
--
-- New RPCs for the reimagined "Programs and tryouts" page (RE-12c): one
-- tryout saved by itself, a program's sign-up settings, Make a copy, and
-- deleting one tryout. Each takes an operation id and keeps a receipt, like
-- the page editors' saves, so a retried request never runs twice.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table onzio.tryouts
  add column hidden boolean not null default false,
  add column sign_up_by_contact boolean not null default false,
  add column stays_open_after_date boolean not null default false;

comment on column onzio.tryouts.hidden is
  'Hidden from the website: the Tryouts page leaves it out and its sign-up form takes no sign-ups for it.';
comment on column onzio.tryouts.sign_up_by_contact is
  'The sign-up way is "They contact you" (used when there is no sign-up form or link).';
comment on column onzio.tryouts.stays_open_after_date is
  'The owner reopened sign-ups after the date passed. Cleared whenever the date changes.';

alter table onzio.programs
  add column sign_ups_closed boolean not null default false,
  add column sign_up_by_contact boolean not null default false;

comment on column onzio.programs.sign_ups_closed is
  'The owner closed sign-ups: the page stays up, its form or link does not show and its form takes no sign-ups for it.';
comment on column onzio.programs.sign_up_by_contact is
  'The sign-up way is "They contact you" (used when there is no sign-up form or link).';

-- A new date means a new "closes the day after": a reopen was for the old date.
create function onzio_private.clear_tryout_reopen_on_new_date() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.event_date is distinct from old.event_date
    and new.stays_open_after_date is not distinct from old.stays_open_after_date then
    new.stays_open_after_date := false;
  end if;
  return new;
end $$;
revoke all on function onzio_private.clear_tryout_reopen_on_new_date() from public,anon;
grant execute on function onzio_private.clear_tryout_reopen_on_new_date() to authenticated,service_role;
create trigger clear_tryout_reopen_on_new_date before update on onzio.tryouts
  for each row execute function onzio_private.clear_tryout_reopen_on_new_date();

-- save_tryout and delete_tryout compare a row's updated_at with the one the
-- page last read. The legacy set_updated_at trigger stamps now(), which is the
-- same for every write in one transaction, so give each write a strictly newer
-- stamp, as programs already do (zz_advance_program_updated_at). The zz_ name
-- runs it after set_tryouts_updated_at.
create trigger zz_advance_tryout_updated_at before update on onzio.tryouts
  for each row execute function onzio_private.advance_program_page_updated_at();

-- ---------------------------------------------------------------------------
-- At most 500 tryouts per club, on every write path
-- ---------------------------------------------------------------------------
-- save_tryouts_page already refuses more than 500 events and must list every
-- row, but /api/admin/data and direct supabase-js writes don't go through it.
-- A statement-level check over the inserted rows covers them all; an upsert
-- that only updates existing rows inserts nothing and is never counted.
create function onzio_private.limit_club_tryouts() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(
    select 1 from (select distinct club_id from inserted_tryouts) i
    where (select count(*) from onzio.tryouts t where t.club_id = i.club_id) > 500
  ) then
    raise exception 'TRYOUT_LIMIT' using errcode = '23514';
  end if;
  return null;
end $$;
revoke all on function onzio_private.limit_club_tryouts() from public,anon,authenticated,service_role;
create trigger limit_club_tryouts after insert on onzio.tryouts
  referencing new table as inserted_tryouts
  for each statement execute function onzio_private.limit_club_tryouts();

-- ---------------------------------------------------------------------------
-- The club's date, and whether a sign-up form takes sign-ups
-- ---------------------------------------------------------------------------
-- The same rule as lib/club-time.ts clubToday: an unusable zone falls back to
-- Los Angeles instead of failing.
create function onzio_private.club_today(p_club_id uuid) returns date
language plpgsql stable security definer set search_path='' as $$
declare zone text;
begin
  select time_zone into zone from onzio.clubs where id = p_club_id;
  begin
    return (pg_catalog.now() at time zone coalesce(zone, 'America/Los_Angeles'))::date;
  exception when others then
    return (pg_catalog.now() at time zone 'America/Los_Angeles')::date;
  end;
end $$;
revoke all on function onzio_private.club_today(uuid) from public,anon,authenticated,service_role;

-- A form that no program or tryout uses is unaffected (it may be shared by
-- link from the Sign-up forms page). A form that one or more use takes
-- sign-ups while at least one of them is taking sign-ups.
create function onzio_private.registration_form_accepting(p_club_id uuid, p_form_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select case
    when not exists(select 1 from onzio.programs p where p.club_id = p_club_id and p.registration_form_id = p_form_id)
     and not exists(select 1 from onzio.tryouts t where t.club_id = p_club_id and t.registration_form_id = p_form_id)
      then true
    else exists(
        select 1 from onzio.programs p
        where p.club_id = p_club_id and p.registration_form_id = p_form_id
          and p.status = 'active' and not p.sign_ups_closed)
      or exists(
        select 1 from onzio.tryouts t
        where t.club_id = p_club_id and t.registration_form_id = p_form_id
          and not t.hidden and t.status <> 'closed'
          and (t.event_date is null or t.stays_open_after_date
            or t.event_date >= onzio_private.club_today(p_club_id)))
  end
$$;
revoke all on function onzio_private.registration_form_accepting(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function onzio_private.registration_form_accepting(uuid,uuid) to service_role;

-- For lib/registration-service.ts (service role only), so the public form page
-- shows "Registration closed" before anyone fills it in. Security invoker:
-- definer functions live only in onzio_private (AGENTS.md).
create function onzio.registration_form_accepting(p_club_id uuid, p_form_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select onzio_private.registration_form_accepting(p_club_id, p_form_id)
$$;
revoke all on function onzio.registration_form_accepting(uuid,uuid) from public,anon,authenticated;
grant execute on function onzio.registration_form_accepting(uuid,uuid) to service_role;

-- The final word: a new pending sign-up is refused while the form's programs
-- and tryouts take none. create_pending_registration is the only writer of
-- pending rows and maps this message to the "closed" response it already has.
create function onzio_private.refuse_sign_up_for_closed_form() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status = 'pending'
    and not onzio_private.registration_form_accepting(new.club_id, new.form_id) then
    raise exception using errcode = '55000', message = 'REGISTRATION_FORM_CLOSED';
  end if;
  return new;
end $$;
revoke all on function onzio_private.refuse_sign_up_for_closed_form() from public,anon,authenticated,service_role;
create trigger refuse_sign_up_for_closed_form before insert on onzio.registrations
  for each row execute function onzio_private.refuse_sign_up_for_closed_form();

-- ---------------------------------------------------------------------------
-- Receipts for the new RPCs
-- ---------------------------------------------------------------------------
create table onzio_private.sign_up_settings_receipts (
  club_id uuid not null references onzio.clubs(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (club_id, actor_id, operation_id)
);
alter table onzio_private.sign_up_settings_receipts enable row level security;
grant select, insert on onzio_private.sign_up_settings_receipts to authenticated;
create policy sign_up_settings_receipt_read on onzio_private.sign_up_settings_receipts for select to authenticated
  using (actor_id = auth.uid() and onzio_private.can_mutate_content(club_id));
create policy sign_up_settings_receipt_insert on onzio_private.sign_up_settings_receipts for insert to authenticated
  with check (actor_id = auth.uid() and onzio_private.can_mutate_content(club_id));

-- Shared request checks. Returns the operation id and the stored receipt when
-- this exact request already ran; raises on a reused id with other content.
create function onzio_private.sign_up_settings_begin(
  p_club_id uuid, p_request jsonb, p_keys text[], out op uuid, out request_hash text, out receipt jsonb
) language plpgsql security invoker set search_path='' as $$
begin
  if not onzio_private.can_mutate_content(p_club_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if jsonb_typeof(p_request) is distinct from 'object'
    or not p_request ?& p_keys
    or exists(select 1 from jsonb_object_keys(p_request) k where not k = any(p_keys))
    or jsonb_typeof(p_request->'operationId') is distinct from 'string' then
    raise exception 'INVALID_SIGN_UP_PAYLOAD' using errcode = '22023';
  end if;
  begin op := (p_request->>'operationId')::uuid;
  exception when invalid_text_representation then raise exception 'INVALID_SIGN_UP_PAYLOAD' using errcode = '22023'; end;
  request_hash := encode(sha256(convert_to(p_request::text, 'UTF8')), 'hex');
  select r.response into receipt from onzio_private.sign_up_settings_receipts r
    where r.club_id = p_club_id and r.actor_id = auth.uid() and r.operation_id = op
      and r.request_hash = sign_up_settings_begin.request_hash;
  if receipt is null and exists(select 1 from onzio_private.sign_up_settings_receipts r
    where r.club_id = p_club_id and r.actor_id = auth.uid() and r.operation_id = op) then
    raise exception 'OPERATION_REUSED' using errcode = 'PT409';
  end if;
end $$;
revoke all on function onzio_private.sign_up_settings_begin(uuid,jsonb,text[]) from public,anon;
grant execute on function onzio_private.sign_up_settings_begin(uuid,jsonb,text[]) to authenticated;

create function onzio_private.sign_up_settings_finish(p_club_id uuid, p_op uuid, p_hash text, p_result jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb := p_result || jsonb_build_object('operationId', p_op);
begin
  insert into onzio_private.sign_up_settings_receipts(club_id, actor_id, operation_id, request_hash, response)
    values (p_club_id, auth.uid(), p_op, p_hash, result);
  return result;
end $$;
revoke all on function onzio_private.sign_up_settings_finish(uuid,uuid,text,jsonb) from public,anon;
grant execute on function onzio_private.sign_up_settings_finish(uuid,uuid,text,jsonb) to authenticated;

-- The same link rule as save_tryouts_page: empty, a site path, http(s) or mailto.
create function onzio_private.is_sign_up_link(p_href text) returns boolean
language sql immutable security invoker set search_path='' as $$
  select p_href = '' or (
    p_href = btrim(p_href) and p_href !~ '[[:space:][:cntrl:]]' and (
      (left(p_href, 1) = '/' and left(p_href, 2) <> '//' and left(p_href, 2) <> ('/' || chr(92)))
      or p_href ~ '^https?://[A-Za-z0-9.-]+'
      or p_href ~ '^mailto:[^@]+@[^@]+'))
$$;
revoke all on function onzio_private.is_sign_up_link(text) from public,anon;
grant execute on function onzio_private.is_sign_up_link(text) to authenticated;

-- Decision 12: a sign-up form belongs to one program or tryout. Saving a form
-- onto a second one through these RPCs is refused (older admin pages are not
-- changed; the new page shows those as "Used by ...").
create function onzio_private.assert_form_free(p_club_id uuid, p_form_id uuid, p_program_id uuid, p_tryout_id uuid)
returns void language plpgsql stable security invoker set search_path='' as $$
begin
  if p_form_id is null then return; end if;
  if not exists(select 1 from onzio.registration_forms f where f.club_id = p_club_id and f.id = p_form_id and f.archived_at is null) then
    raise exception 'INVALID_SIGN_UP_FORM' using errcode = '22023';
  end if;
  if exists(select 1 from onzio.programs p where p.club_id = p_club_id and p.registration_form_id = p_form_id
      and p.id is distinct from p_program_id)
    or exists(select 1 from onzio.tryouts t where t.club_id = p_club_id and t.registration_form_id = p_form_id
      and t.id is distinct from p_tryout_id) then
    raise exception 'SIGN_UP_FORM_IN_USE' using errcode = '22023';
  end if;
end $$;
revoke all on function onzio_private.assert_form_free(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function onzio_private.assert_form_free(uuid,uuid,uuid,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- One tryout: add or change it, with its sign-up way, closed and hidden
-- ---------------------------------------------------------------------------
-- p_request: { operationId, id (null adds one), expectedUpdatedAt (null when
-- adding), tryout: { headline, event_date, location, cost_text, cta_label,
-- registration_href, registration_form_id, sign_up_by_contact, closed,
-- hidden, stays_open_after_date } }. Older columns the new page never shows
-- (eyebrow, intro, the long copy blocks, the hero photo, program_id,
-- closed_message) keep what they hold.
create function onzio.save_tryout(p_club_id uuid, p_request jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  b record; v_id uuid; previous onzio.tryouts; saved onzio.tryouts; t jsonb; v_date date; v_form uuid;
  keys text[] := array['headline','event_date','location','cost_text','cta_label','registration_href',
    'registration_form_id','sign_up_by_contact','closed','hidden','stays_open_after_date'];
begin
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  perform pg_catalog.pg_advisory_xact_lock(734901282);
  select * into b from onzio_private.sign_up_settings_begin(p_club_id, p_request, array['operationId','id','expectedUpdatedAt','tryout']);
  if b.receipt is not null then return b.receipt; end if;
  t := p_request->'tryout';
  if jsonb_typeof(t) is distinct from 'object' or not t ?& keys
    or exists(select 1 from jsonb_object_keys(t) k where not k = any(keys))
    or jsonb_typeof(t->'headline') <> 'string' or jsonb_typeof(t->'location') <> 'string'
    or jsonb_typeof(t->'cost_text') <> 'string' or jsonb_typeof(t->'cta_label') <> 'string'
    or jsonb_typeof(t->'registration_href') <> 'string'
    or jsonb_typeof(t->'event_date') not in ('string','null')
    or jsonb_typeof(t->'registration_form_id') not in ('string','null')
    or jsonb_typeof(t->'sign_up_by_contact') <> 'boolean' or jsonb_typeof(t->'closed') <> 'boolean'
    or jsonb_typeof(t->'hidden') <> 'boolean' or jsonb_typeof(t->'stays_open_after_date') <> 'boolean'
    or btrim(t->>'headline') = ''
    or not onzio_private.is_sign_up_link(t->>'registration_href') then
    raise exception 'INVALID_SIGN_UP_PAYLOAD' using errcode = '22023';
  end if;
  begin
    v_id := (p_request->>'id')::uuid;
    v_date := (t->>'event_date')::date;
    v_form := (t->>'registration_form_id')::uuid;
  exception when others then raise exception 'INVALID_SIGN_UP_PAYLOAD' using errcode = '22023'; end;
  if v_id is null then
    if p_request->'expectedUpdatedAt' <> 'null'::jsonb then raise exception 'INVALID_SIGN_UP_PAYLOAD' using errcode = '22023'; end if;
  else
    select * into previous from onzio.tryouts where club_id = p_club_id and id = v_id for update;
    if not found or jsonb_typeof(p_request->'expectedUpdatedAt') <> 'string'
      or previous.updated_at is distinct from (p_request->>'expectedUpdatedAt')::timestamptz then
      raise exception 'CONTENT_CHANGED' using errcode = 'PT409';
    end if;
  end if;
  perform onzio_private.assert_form_free(p_club_id, v_form, null, v_id);
  if v_id is null then
    insert into onzio.tryouts(club_id, status, headline, event_date, location, cost_text, cta_label,
      registration_href, registration_form_id, sign_up_by_contact, hidden, stays_open_after_date, sort_order)
    values (p_club_id, case when (t->>'closed')::boolean then 'closed' else 'open' end, btrim(t->>'headline'), v_date,
      btrim(t->>'location'), btrim(t->>'cost_text'), btrim(t->>'cta_label'), t->>'registration_href', v_form,
      (t->>'sign_up_by_contact')::boolean, (t->>'hidden')::boolean, (t->>'stays_open_after_date')::boolean,
      coalesce((select max(sort_order) + 1 from onzio.tryouts where club_id = p_club_id), 0))
    returning * into saved;
  else
    update onzio.tryouts set
      status = case when (t->>'closed')::boolean then 'closed'
        when previous.status = 'closed' then 'open' else previous.status end,
      headline = btrim(t->>'headline'), event_date = v_date, location = btrim(t->>'location'),
      cost_text = btrim(t->>'cost_text'), cta_label = btrim(t->>'cta_label'),
      registration_href = t->>'registration_href', registration_form_id = v_form,
      sign_up_by_contact = (t->>'sign_up_by_contact')::boolean, hidden = (t->>'hidden')::boolean,
      stays_open_after_date = (t->>'stays_open_after_date')::boolean
    where club_id = p_club_id and id = v_id
    returning * into saved;
  end if;
  return onzio_private.sign_up_settings_finish(p_club_id, b.op, b.request_hash,
    jsonb_build_object('tryout', to_jsonb(saved) - 'club_id'));
end $$;
revoke all on function onzio.save_tryout(uuid,jsonb) from public,anon;
grant execute on function onzio.save_tryout(uuid,jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- A program's sign-up settings: its way, closed, and shown or hidden
-- ---------------------------------------------------------------------------
-- p_request: { operationId, id, expectedUpdatedAt, program: {
-- external_cta_label, external_cta_href, registration_form_id,
-- sign_up_by_contact, sign_ups_closed, hidden } }. The page's words and photos
-- stay with the page editor (save_program_page).
create function onzio.save_program_sign_up(p_club_id uuid, p_request jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  b record; v_id uuid; previous onzio.programs; saved onzio.programs; p jsonb; v_form uuid;
  keys text[] := array['external_cta_label','external_cta_href','registration_form_id',
    'sign_up_by_contact','sign_ups_closed','hidden'];
begin
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  perform pg_catalog.pg_advisory_xact_lock(734901284);
  select * into b from onzio_private.sign_up_settings_begin(p_club_id, p_request, array['operationId','id','expectedUpdatedAt','program']);
  if b.receipt is not null then return b.receipt; end if;
  p := p_request->'program';
  if jsonb_typeof(p) is distinct from 'object' or not p ?& keys
    or exists(select 1 from jsonb_object_keys(p) k where not k = any(keys))
    or jsonb_typeof(p->'external_cta_label') <> 'string' or jsonb_typeof(p->'external_cta_href') <> 'string'
    or char_length(p->>'external_cta_label') > 40
    or jsonb_typeof(p->'registration_form_id') not in ('string','null')
    or jsonb_typeof(p->'sign_up_by_contact') <> 'boolean' or jsonb_typeof(p->'sign_ups_closed') <> 'boolean'
    or jsonb_typeof(p->'hidden') <> 'boolean'
    or not onzio_private.is_sign_up_link(p->>'external_cta_href') then
    raise exception 'INVALID_SIGN_UP_PAYLOAD' using errcode = '22023';
  end if;
  begin
    v_id := (p_request->>'id')::uuid;
    v_form := (p->>'registration_form_id')::uuid;
  exception when others then raise exception 'INVALID_SIGN_UP_PAYLOAD' using errcode = '22023'; end;
  select * into previous from onzio.programs where club_id = p_club_id and id = v_id for update;
  if v_id is null or not found or jsonb_typeof(p_request->'expectedUpdatedAt') <> 'string'
    or previous.updated_at is distinct from (p_request->>'expectedUpdatedAt')::timestamptz then
    raise exception 'CONTENT_CHANGED' using errcode = 'PT409';
  end if;
  perform onzio_private.assert_form_free(p_club_id, v_form, v_id, null);
  update onzio.programs set
    external_cta_label = btrim(p->>'external_cta_label'), external_cta_href = p->>'external_cta_href',
    registration_form_id = v_form, sign_up_by_contact = (p->>'sign_up_by_contact')::boolean,
    sign_ups_closed = (p->>'sign_ups_closed')::boolean,
    status = case when (p->>'hidden')::boolean then 'hidden' else 'active' end
  where club_id = p_club_id and id = v_id
  returning * into saved;
  return onzio_private.sign_up_settings_finish(p_club_id, b.op, b.request_hash,
    jsonb_build_object('program', to_jsonb(saved) - 'club_id'));
end $$;
revoke all on function onzio.save_program_sign_up(uuid,jsonb) from public,anon;
grant execute on function onzio.save_program_sign_up(uuid,jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Make a copy (decision 11)
-- ---------------------------------------------------------------------------
-- The copy carries everything except the date and the sign-up form. It starts
-- with no sign-up way and hidden from the website, right after the original.
-- Photos are shared with the original, never duplicated: retiring a photo
-- checks every reference first (media_reference_safe_retirement), so removing
-- one from either page leaves the other's.
create function onzio.copy_program(p_club_id uuid, p_request jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  b record; v_id uuid; source onzio.programs; saved onzio.programs; base text; candidate text; n integer := 1;
  title text;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  perform pg_catalog.pg_advisory_xact_lock(734901284);
  select * into b from onzio_private.sign_up_settings_begin(p_club_id, p_request, array['operationId','id']);
  if b.receipt is not null then return b.receipt; end if;
  begin v_id := (p_request->>'id')::uuid;
  exception when others then raise exception 'INVALID_SIGN_UP_PAYLOAD' using errcode = '22023'; end;
  select * into source from onzio.programs where club_id = p_club_id and id = v_id for update;
  if v_id is null or not found then raise exception 'CONTENT_CHANGED' using errcode = 'PT409'; end if;
  if (select count(*) from onzio.programs where club_id = p_club_id) >= 200 then
    raise exception 'PROGRAM_LIMIT' using errcode = '23514';
  end if;
  base := left(regexp_replace(source.slug, '-copy(-[0-9]+)?$', ''), 54) || '-copy';
  candidate := base;
  while exists(select 1 from onzio.programs where club_id = p_club_id and slug = candidate) loop
    n := n + 1;
    candidate := base || '-' || n;
  end loop;
  title := case when char_length(source.display_title) <= 113 then source.display_title || ' (copy)' else source.display_title end;
  update onzio.programs set sort_order = sort_order + 1 where club_id = p_club_id and sort_order > source.sort_order;
  insert into onzio.programs(club_id, slug, nav_label, display_title, kicker, summary, body, highlights, layout_variant,
    hero_media_asset_id, detail_media_asset_id, external_cta_label, external_cta_href, registration_form_id,
    registration_enabled, registration_eyebrow, registration_headline, registration_body, registration_pending_body,
    registration_pending_label, status, sort_order, sign_ups_closed, sign_up_by_contact)
  values (p_club_id, candidate, source.nav_label, title, source.kicker, source.summary, source.body, source.highlights,
    source.layout_variant, source.hero_media_asset_id, source.detail_media_asset_id, '', '', null,
    source.registration_enabled, source.registration_eyebrow, source.registration_headline, source.registration_body,
    source.registration_pending_body, source.registration_pending_label, 'hidden', source.sort_order + 1, false, false)
  returning * into saved;
  insert into onzio.program_media(club_id, program_id, url, media_asset_id, alt, sort_order)
    select p_club_id, saved.id, m.url, m.media_asset_id, m.alt, m.sort_order
    from onzio.program_media m where m.club_id = p_club_id and m.program_id = source.id;
  return onzio_private.sign_up_settings_finish(p_club_id, b.op, b.request_hash,
    jsonb_build_object('program', to_jsonb(saved) - 'club_id'));
end $$;
revoke all on function onzio.copy_program(uuid,jsonb) from public,anon;
grant execute on function onzio.copy_program(uuid,jsonb) to authenticated;

create function onzio.copy_tryout(p_club_id uuid, p_request jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare b record; v_id uuid; source onzio.tryouts; saved onzio.tryouts;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  perform pg_catalog.pg_advisory_xact_lock(734901282);
  select * into b from onzio_private.sign_up_settings_begin(p_club_id, p_request, array['operationId','id']);
  if b.receipt is not null then return b.receipt; end if;
  begin v_id := (p_request->>'id')::uuid;
  exception when others then raise exception 'INVALID_SIGN_UP_PAYLOAD' using errcode = '22023'; end;
  select * into source from onzio.tryouts where club_id = p_club_id and id = v_id for update;
  if v_id is null or not found then raise exception 'CONTENT_CHANGED' using errcode = 'PT409'; end if;
  update onzio.tryouts set sort_order = sort_order + 1 where club_id = p_club_id and sort_order > source.sort_order;
  insert into onzio.tryouts(club_id, program_id, status, eyebrow, headline, intro, hero_media_asset_id,
    eligibility_copy, what_to_expect_copy, preparation_copy, event_date, location, cost_text, cta_label,
    registration_href, registration_form_id, closed_message, sort_order, hidden, sign_up_by_contact, stays_open_after_date)
  values (p_club_id, source.program_id, 'open', source.eyebrow,
    case when char_length(source.headline) <= 73 then source.headline || ' (copy)' else source.headline end,
    source.intro, source.hero_media_asset_id, source.eligibility_copy, source.what_to_expect_copy,
    source.preparation_copy, null, source.location, source.cost_text, '', '', null, source.closed_message,
    source.sort_order + 1, true, false, false)
  returning * into saved;
  return onzio_private.sign_up_settings_finish(p_club_id, b.op, b.request_hash,
    jsonb_build_object('tryout', to_jsonb(saved) - 'club_id'));
end $$;
revoke all on function onzio.copy_tryout(uuid,jsonb) from public,anon;
grant execute on function onzio.copy_tryout(uuid,jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Delete one tryout (decision 6: tryouts keep Delete; programs keep Hide)
-- ---------------------------------------------------------------------------
-- The linked form and its sign-ups stay. The caller retires the photo if no
-- other row uses it (retiredMediaAssetIds), as the Tryouts page save does.
create function onzio.delete_tryout(p_club_id uuid, p_request jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare b record; v_id uuid; previous onzio.tryouts; retired uuid[] := '{}';
begin
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  perform pg_catalog.pg_advisory_xact_lock(734901282);
  select * into b from onzio_private.sign_up_settings_begin(p_club_id, p_request, array['operationId','id','expectedUpdatedAt']);
  if b.receipt is not null then return b.receipt; end if;
  begin v_id := (p_request->>'id')::uuid;
  exception when others then raise exception 'INVALID_SIGN_UP_PAYLOAD' using errcode = '22023'; end;
  select * into previous from onzio.tryouts where club_id = p_club_id and id = v_id for update;
  if v_id is null or not found or jsonb_typeof(p_request->'expectedUpdatedAt') <> 'string'
    or previous.updated_at is distinct from (p_request->>'expectedUpdatedAt')::timestamptz then
    raise exception 'CONTENT_CHANGED' using errcode = 'PT409';
  end if;
  delete from onzio.tryouts where club_id = p_club_id and id = v_id;
  if previous.hero_media_asset_id is not null and not exists(
    select 1 from onzio.tryouts where club_id = p_club_id and hero_media_asset_id = previous.hero_media_asset_id) then
    retired := array[previous.hero_media_asset_id];
  end if;
  return onzio_private.sign_up_settings_finish(p_club_id, b.op, b.request_hash,
    jsonb_build_object('deletedId', v_id, 'retiredMediaAssetIds', to_jsonb(retired)));
end $$;
revoke all on function onzio.delete_tryout(uuid,jsonb) from public,anon;
grant execute on function onzio.delete_tryout(uuid,jsonb) to authenticated;

notify pgrst, 'reload schema';
