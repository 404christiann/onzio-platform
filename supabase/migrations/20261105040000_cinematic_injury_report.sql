-- RC2027-INJURY-REPORT: the Injury Report page (/news/injury-report) for cinematic@2.
-- One row of page copy (partner name, Rehab heading, quote, attribution, YouTube link, band photo
-- description) with the partner logo and photo band, plus an ordered list of injury entries.
-- Each entry points at a Roster player: the player's name, number, position and photo always come
-- from onzio.players, so only injury, timeline and note are stored here. Permissions follow the
-- Roster ('roster' feature). Lock 734901330 is this page's; 734901281 is the shared media lock.

create table onzio.cinematic_injury_report_content (
  club_id uuid primary key references onzio.clubs(id) on delete cascade,
  content jsonb not null,
  presenter_logo_media_asset_id uuid,
  band_media_asset_id uuid,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  foreign key (club_id, presenter_logo_media_asset_id) references onzio.media_assets(club_id, id) on delete restrict,
  foreign key (club_id, band_media_asset_id) references onzio.media_assets(club_id, id) on delete restrict
);

create table onzio.cinematic_injury_entries (
  club_id uuid not null references onzio.cinematic_injury_report_content(club_id) on delete cascade,
  id uuid not null,
  sort_order integer not null check (sort_order between 0 and 23),
  player_id uuid not null,
  injury text not null check (btrim(injury) <> '' and char_length(injury) <= 80),
  timeline text not null check (btrim(timeline) <> '' and char_length(timeline) <= 40),
  note text not null default '' check (char_length(note) <= 200),
  primary key (club_id, id),
  unique (club_id, sort_order),
  unique (club_id, player_id),
  foreign key (club_id, player_id) references onzio.players(club_id, id) on delete cascade
);

create function onzio_private.can_edit_cinematic_injury_report(p_club_id uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select case when onzio_private.can_mutate_feature(p_club_id, 'roster')
    then onzio_private.homepage_design(p_club_id)->>'templateKey' = 'cinematic@2' else false end;
$$;
revoke all on function onzio_private.can_edit_cinematic_injury_report(uuid) from public, anon;
grant execute on function onzio_private.can_edit_cinematic_injury_report(uuid) to authenticated, service_role;

alter table onzio.cinematic_injury_report_content enable row level security;
alter table onzio.cinematic_injury_entries enable row level security;
revoke all on onzio.cinematic_injury_report_content, onzio.cinematic_injury_entries from anon, authenticated;
grant select on onzio.cinematic_injury_report_content, onzio.cinematic_injury_entries to anon, authenticated;
grant insert(club_id, content, presenter_logo_media_asset_id, band_media_asset_id),
  update(content, presenter_logo_media_asset_id, band_media_asset_id) on onzio.cinematic_injury_report_content to authenticated;
grant insert, delete on onzio.cinematic_injury_entries to authenticated;
grant all on onzio.cinematic_injury_report_content, onzio.cinematic_injury_entries to service_role;

create policy cinematic_injury_report_content_read on onzio.cinematic_injury_report_content for select to anon, authenticated
  using (onzio_private.can_read_feature(club_id, 'roster'));
create policy cinematic_injury_report_content_insert on onzio.cinematic_injury_report_content for insert to authenticated
  with check (onzio_private.can_edit_cinematic_injury_report(club_id));
create policy cinematic_injury_report_content_update on onzio.cinematic_injury_report_content for update to authenticated
  using (onzio_private.can_edit_cinematic_injury_report(club_id)) with check (onzio_private.can_edit_cinematic_injury_report(club_id));
create policy cinematic_injury_entries_read on onzio.cinematic_injury_entries for select to anon, authenticated
  using (onzio_private.can_read_feature(club_id, 'roster'));
create policy cinematic_injury_entries_insert on onzio.cinematic_injury_entries for insert to authenticated
  with check (onzio_private.can_edit_cinematic_injury_report(club_id));
create policy cinematic_injury_entries_delete on onzio.cinematic_injury_entries for delete to authenticated
  using (onzio_private.can_edit_cinematic_injury_report(club_id));

create function onzio_private.serialize_cinematic_injury_report_write() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  perform pg_catalog.pg_advisory_xact_lock(734901330);
  return null;
end $$;
create function onzio_private.advance_cinematic_injury_report_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.revision := case when tg_op = 'INSERT' then 1 else old.revision + 1 end;
  new.updated_at := now();
  return new;
end $$;
revoke all on function onzio_private.serialize_cinematic_injury_report_write(), onzio_private.advance_cinematic_injury_report_revision() from public, anon;
grant execute on function onzio_private.serialize_cinematic_injury_report_write(), onzio_private.advance_cinematic_injury_report_revision() to authenticated, service_role;
create trigger serialize_cinematic_injury_report_content before insert or update or delete on onzio.cinematic_injury_report_content
  for each statement execute function onzio_private.serialize_cinematic_injury_report_write();
create trigger serialize_cinematic_injury_entries before insert or update or delete on onzio.cinematic_injury_entries
  for each statement execute function onzio_private.serialize_cinematic_injury_report_write();
create trigger advance_cinematic_injury_report before insert or update on onzio.cinematic_injury_report_content
  for each row execute function onzio_private.advance_cinematic_injury_report_revision();
create trigger audit_cinematic_injury_report_content after insert or update or delete on onzio.cinematic_injury_report_content
  for each row execute function onzio_private.audit_content_mutation();
create trigger audit_cinematic_injury_entries after insert or update or delete on onzio.cinematic_injury_entries
  for each row execute function onzio_private.audit_content_mutation();

-- Page copy. Mirrors the "page" object in lib/cinematic-injury-report-content.ts.
create function onzio_private.check_cinematic_injury_report_page(p jsonb) returns void
language plpgsql immutable security invoker set search_path = '' as $$
declare fields constant text[] := array['presenterName','rehabHeading','quote','quoteAttribution','videoUrl','bandAlt'];
begin
  perform onzio_private.check_homepage_object(p, fields, fields);
  perform onzio_private.check_cinematic_text(p->'presenterName', 60);
  perform onzio_private.check_cinematic_text(p->'rehabHeading', 80);
  perform onzio_private.check_cinematic_text(p->'quote', 600);
  perform onzio_private.check_cinematic_text(p->'quoteAttribution', 120);
  perform onzio_private.check_cinematic_text(p->'videoUrl', 200);
  perform onzio_private.check_cinematic_text(p->'bandAlt', 200);
  if btrim(p->>'presenterName') = '' or btrim(p->>'rehabHeading') = ''
    -- The canonical embed link from lib/youtube-embed.ts (MATCH_REPLAY_EMBED_PATTERN), or nothing.
    or (p->>'videoUrl' <> '' and p->>'videoUrl' !~ '^https://www[.]youtube[.]com/embed/[A-Za-z0-9_-]{11}[?]rel=0$') then
    raise exception 'INVALID_CINEMATIC_INJURY_REPORT_PAYLOAD' using errcode='22023';
  end if;
exception when others then
  raise exception 'INVALID_CINEMATIC_INJURY_REPORT_PAYLOAD' using errcode='22023';
end $$;

-- The whole editor payload. Every value's type is checked before reading inside it.
create function onzio_private.check_cinematic_injury_report_content(c jsonb) returns void
language plpgsql immutable security invoker set search_path = '' as $$
declare
  item jsonb; ids text[] := '{}'; players text[] := '{}';
  fields constant text[] := array['page','presenterLogoAssetId','bandAssetId','entries'];
  entry_fields constant text[] := array['id','playerId','injury','timeline','note'];
begin
  perform onzio_private.check_homepage_object(c, fields, fields);
  perform onzio_private.check_cinematic_injury_report_page(c->'page');
  if jsonb_typeof(c->'presenterLogoAssetId') not in ('null','string') or jsonb_typeof(c->'bandAssetId') not in ('null','string')
    or jsonb_typeof(c->'entries') is distinct from 'array' then
    raise exception 'INVALID_CINEMATIC_INJURY_REPORT_PAYLOAD' using errcode='22023';
  end if;
  if (jsonb_typeof(c->'presenterLogoAssetId') = 'string' and (c->>'presenterLogoAssetId')::uuid is null)
    or (jsonb_typeof(c->'bandAssetId') = 'string' and (c->>'bandAssetId')::uuid is null)
    or jsonb_array_length(c->'entries') > 24 then
    raise exception 'INVALID_CINEMATIC_INJURY_REPORT_PAYLOAD' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(c->'entries') loop
    perform onzio_private.check_homepage_object(item, entry_fields, entry_fields);
    perform onzio_private.check_cinematic_text(item->'id', 36);
    perform onzio_private.check_cinematic_text(item->'playerId', 36);
    perform onzio_private.check_cinematic_text(item->'injury', 80);
    perform onzio_private.check_cinematic_text(item->'timeline', 40);
    perform onzio_private.check_cinematic_text(item->'note', 200);
    if (item->>'id')::uuid is null or (item->>'playerId')::uuid is null
      or btrim(item->>'injury') = '' or btrim(item->>'timeline') = ''
      or (item->>'id') = any(ids) or (item->>'playerId') = any(players) then
      raise exception 'INVALID_CINEMATIC_INJURY_REPORT_PAYLOAD' using errcode='22023';
    end if;
    ids := ids || (item->>'id');
    players := players || (item->>'playerId');
  end loop;
exception when others then
  raise exception 'INVALID_CINEMATIC_INJURY_REPORT_PAYLOAD' using errcode='22023';
end $$;

create function onzio_private.validate_cinematic_injury_report_content_row() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform onzio_private.check_cinematic_injury_report_page(new.content);
  if new.presenter_logo_media_asset_id is not null and not exists (
    select 1 from onzio.media_assets m where m.club_id = new.club_id and m.id = new.presenter_logo_media_asset_id and m.media_kind = 'graphic'
  ) then raise exception 'INVALID_CINEMATIC_INJURY_REPORT_PAYLOAD' using errcode='22023'; end if;
  if new.band_media_asset_id is not null and not exists (
    select 1 from onzio.media_assets m where m.club_id = new.club_id and m.id = new.band_media_asset_id and m.media_kind = 'photograph'
  ) then raise exception 'INVALID_CINEMATIC_INJURY_REPORT_PAYLOAD' using errcode='22023'; end if;
  return new;
end $$;
revoke all on function onzio_private.check_cinematic_injury_report_page(jsonb), onzio_private.check_cinematic_injury_report_content(jsonb),
  onzio_private.validate_cinematic_injury_report_content_row() from public, anon;
grant execute on function onzio_private.check_cinematic_injury_report_page(jsonb), onzio_private.check_cinematic_injury_report_content(jsonb)
  to authenticated, service_role;
create trigger validate_cinematic_injury_report_content before insert or update on onzio.cinematic_injury_report_content
  for each row execute function onzio_private.validate_cinematic_injury_report_content_row();
create trigger guard_presenter_logo_media_asset_id_media_reference before insert or update of presenter_logo_media_asset_id on onzio.cinematic_injury_report_content
  for each row execute function onzio_private.guard_media_reference('presenter_logo_media_asset_id', 'asset');
create trigger guard_band_media_asset_id_media_reference before insert or update of band_media_asset_id on onzio.cinematic_injury_report_content
  for each row execute function onzio_private.guard_media_reference('band_media_asset_id', 'asset');

create table onzio_private.cinematic_injury_report_save_receipts (
  club_id uuid not null references onzio.clubs(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  operation_id uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (club_id, actor_id, operation_id)
);
alter table onzio_private.cinematic_injury_report_save_receipts enable row level security;
grant select, insert on onzio_private.cinematic_injury_report_save_receipts to authenticated;
create policy cinematic_injury_report_receipt_read on onzio_private.cinematic_injury_report_save_receipts for select to authenticated
  using (actor_id = auth.uid() and onzio_private.can_mutate_feature(club_id, 'roster'));
create policy cinematic_injury_report_receipt_insert on onzio_private.cinematic_injury_report_save_receipts for insert to authenticated
  with check (actor_id = auth.uid() and onzio_private.can_mutate_feature(club_id, 'roster'));

-- What the editor needs: the saved content, the active Roster players for the picker, and the
-- logo and band media so the preview can show them.
create function onzio_private.cinematic_injury_report_snapshot(p_club_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'revision', coalesce((select revision::text from onzio.cinematic_injury_report_content where club_id = p_club_id), '0'),
    'designRevision', onzio_private.homepage_design(p_club_id)->>'designRevision',
    'content', (select jsonb_build_object(
        'page', r.content,
        'presenterLogoAssetId', r.presenter_logo_media_asset_id,
        'bandAssetId', r.band_media_asset_id,
        'entries', coalesce((
          select jsonb_agg(jsonb_build_object('id', e.id, 'playerId', e.player_id, 'injury', e.injury, 'timeline', e.timeline, 'note', e.note) order by e.sort_order)
          from onzio.cinematic_injury_entries e where e.club_id = p_club_id), '[]'::jsonb))
      from onzio.cinematic_injury_report_content r where r.club_id = p_club_id),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'number', p.number, 'position', p.position) order by p.number, p.name)
      from onzio.players p where p.club_id = p_club_id and p.active), '[]'::jsonb),
    'media', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'storage_path', m.storage_path, 'width', m.width, 'height', m.height, 'kind', m.media_kind) order by m.id)
      from onzio.cinematic_injury_report_content r
      join onzio.media_assets m on m.club_id = r.club_id and m.id in (r.presenter_logo_media_asset_id, r.band_media_asset_id)
      where r.club_id = p_club_id and m.status = 'published' and m.deleted_at is null), '[]'::jsonb)
  );
$$;
revoke all on function onzio_private.cinematic_injury_report_snapshot(uuid) from public, anon;
grant execute on function onzio_private.cinematic_injury_report_snapshot(uuid) to authenticated, service_role;

create function onzio.load_cinematic_injury_report_editor(p_club_id uuid, p_operation_id uuid default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare result jsonb; receipt jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  perform pg_catalog.pg_advisory_xact_lock(734901330);
  if not onzio_private.can_mutate_feature(p_club_id, 'roster') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
  if p_operation_id is not null then
    select response into receipt from onzio_private.cinematic_injury_report_save_receipts
      where club_id = p_club_id and actor_id = auth.uid() and operation_id = p_operation_id;
  end if;
  if receipt is null and onzio_private.homepage_design(p_club_id)->>'templateKey' is distinct from 'cinematic@2'
    then raise exception 'PAGE_UNAVAILABLE' using errcode='22023'; end if;
  result := onzio_private.cinematic_injury_report_snapshot(p_club_id);
  if p_operation_id is not null then
    result := result || jsonb_build_object('operation', case when receipt is null
      then jsonb_build_object('status', 'not-committed')
      else jsonb_build_object('status', 'committed', 'receipt', receipt) end);
  end if;
  return result;
end $$;

create function onzio.save_cinematic_injury_report_editor(p_club_id uuid, p_request jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  c jsonb; current_snapshot jsonb; result jsonb; op uuid; request_hash text; previous_hash text; receipt jsonb;
  next_logo uuid; next_band uuid; previous_logo uuid; previous_band uuid; retired jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  perform pg_catalog.pg_advisory_xact_lock(734901330);
  if not onzio_private.can_mutate_feature(p_club_id, 'roster') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
  perform onzio_private.check_homepage_object(p_request, array['operationId','expectedRevision','designRevision','content'], array['operationId','expectedRevision','designRevision','content']);
  if jsonb_typeof(p_request->'operationId') is distinct from 'string'
    or jsonb_typeof(p_request->'expectedRevision') is distinct from 'string'
    or p_request->>'expectedRevision' !~ '^[0-9]+$'
    or length(p_request->>'expectedRevision') > 20 then
    raise exception 'INVALID_CINEMATIC_INJURY_REPORT_PAYLOAD' using errcode='22023';
  end if;
  perform onzio_private.check_cinematic_text(p_request->'designRevision', 100);
  begin op := (p_request->>'operationId')::uuid;
  exception when invalid_text_representation then raise exception 'INVALID_CINEMATIC_INJURY_REPORT_PAYLOAD' using errcode='22023'; end;
  if op is null then raise exception 'INVALID_CINEMATIC_INJURY_REPORT_PAYLOAD' using errcode='22023'; end if;
  c := p_request->'content';
  perform onzio_private.check_cinematic_injury_report_content(c);
  request_hash := encode(sha256(convert_to(p_request::text, 'UTF8')), 'hex');
  select r.request_hash, r.response into previous_hash, receipt from onzio_private.cinematic_injury_report_save_receipts r
    where r.club_id = p_club_id and r.actor_id = auth.uid() and r.operation_id = op;
  if found then
    if request_hash <> previous_hash then raise exception 'OPERATION_REUSED' using errcode='22023'; end if;
    return receipt;
  end if;
  if onzio_private.homepage_design(p_club_id)->>'templateKey' is distinct from 'cinematic@2'
    then raise exception 'PAGE_UNAVAILABLE' using errcode='22023'; end if;
  current_snapshot := onzio_private.cinematic_injury_report_snapshot(p_club_id);
  if current_snapshot->>'designRevision' is distinct from p_request->>'designRevision'
    then raise exception 'DESIGN_CHANGED' using errcode='22023'; end if;
  if current_snapshot->>'revision' is distinct from p_request->>'expectedRevision'
    then raise exception 'CINEMATIC_INJURY_REPORT_CHANGED' using errcode='PT409'; end if;

  -- Every entry needs one of this club's active Roster players.
  if exists (select 1 from jsonb_array_elements(c->'entries') item where not exists (
    select 1 from onzio.players p where p.club_id = p_club_id and p.id = (item->>'playerId')::uuid and p.active))
    then raise exception 'INVALID_CINEMATIC_INJURY_REPORT_PAYLOAD' using errcode='22023'; end if;
  next_logo := nullif(c->>'presenterLogoAssetId', '')::uuid;
  next_band := nullif(c->>'bandAssetId', '')::uuid;
  if (next_logo is not null and not exists (select 1 from onzio.media_assets m where m.club_id = p_club_id and m.id = next_logo
        and m.status = 'published' and m.deleted_at is null and m.media_kind = 'graphic'))
    or (next_band is not null and not exists (select 1 from onzio.media_assets m where m.club_id = p_club_id and m.id = next_band
        and m.status = 'published' and m.deleted_at is null and m.media_kind = 'photograph'))
    then raise exception 'INVALID_CINEMATIC_INJURY_REPORT_PAYLOAD' using errcode='22023'; end if;
  select presenter_logo_media_asset_id, band_media_asset_id into previous_logo, previous_band
    from onzio.cinematic_injury_report_content where club_id = p_club_id;

  insert into onzio.cinematic_injury_report_content(club_id, content, presenter_logo_media_asset_id, band_media_asset_id)
    values (p_club_id, c->'page', next_logo, next_band)
    on conflict (club_id) do update set content = excluded.content,
      presenter_logo_media_asset_id = excluded.presenter_logo_media_asset_id, band_media_asset_id = excluded.band_media_asset_id;
  delete from onzio.cinematic_injury_entries where club_id = p_club_id;
  insert into onzio.cinematic_injury_entries(club_id, id, sort_order, player_id, injury, timeline, note)
    select p_club_id, (item->>'id')::uuid, (ordinality - 1)::integer, (item->>'playerId')::uuid, item->>'injury', item->>'timeline', item->>'note'
    from jsonb_array_elements(c->'entries') with ordinality as rows(item, ordinality);

  select coalesce(jsonb_agg(gone.id order by gone.id), '[]'::jsonb) into retired
    from (select distinct id from unnest(array[previous_logo, previous_band]) as old(id)
      where id is not null and id is distinct from next_logo and id is distinct from next_band) gone;
  result := onzio_private.cinematic_injury_report_snapshot(p_club_id) || jsonb_build_object('operationId', op, 'retiredMediaAssetIds', retired);
  insert into onzio_private.cinematic_injury_report_save_receipts(club_id, actor_id, operation_id, request_hash, response)
    values (p_club_id, auth.uid(), op, request_hash, result);
  return result;
end $$;
revoke all on function onzio.load_cinematic_injury_report_editor(uuid, uuid), onzio.save_cinematic_injury_report_editor(uuid, jsonb) from public, anon;
grant execute on function onzio.load_cinematic_injury_report_editor(uuid, uuid), onzio.save_cinematic_injury_report_editor(uuid, jsonb) to authenticated;
notify pgrst, 'reload schema';
