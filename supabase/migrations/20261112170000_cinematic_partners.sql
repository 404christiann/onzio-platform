-- RC2027-PARTNERS: Club Partners (/sponsors) and Partnership Opportunities
-- (/community/partnership) for cinematic@2. One ordered partner list is shared
-- by both pages; each page keeps its own heading, subtitle, intro and bottom bar.
-- Partner logos reference published media assets directly, so a logo already
-- used by the Sponsors editor is shared rather than copied. The existing
-- reference-safe retirement finds the new FK column through the catalog.

create table onzio.cinematic_partners_content (
  club_id uuid primary key references onzio.clubs(id) on delete cascade,
  content jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);

create table onzio.cinematic_partners (
  club_id uuid not null references onzio.cinematic_partners_content(club_id) on delete cascade,
  id uuid not null,
  sort_order integer not null check (sort_order between 0 and 23),
  name text not null check (btrim(name) <> '' and char_length(name) <= 80),
  role text not null default '' check (char_length(role) <= 160),
  logo_media_asset_id uuid,
  logo_tone text not null default 'original' check (logo_tone in ('original', 'grey', 'black')),
  primary key (club_id, id),
  unique (club_id, sort_order),
  foreign key (club_id, logo_media_asset_id) references onzio.media_assets(club_id, id) on delete restrict
);
create index cinematic_partners_logo_idx on onzio.cinematic_partners(club_id, logo_media_asset_id) where logo_media_asset_id is not null;

create function onzio_private.can_edit_cinematic_partners(p_club_id uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select case when onzio_private.can_mutate_feature(p_club_id, 'branding')
    then onzio_private.homepage_design(p_club_id)->>'templateKey' = 'cinematic@2' else false end;
$$;
revoke all on function onzio_private.can_edit_cinematic_partners(uuid) from public, anon;
grant execute on function onzio_private.can_edit_cinematic_partners(uuid) to authenticated, service_role;

alter table onzio.cinematic_partners_content enable row level security;
alter table onzio.cinematic_partners enable row level security;
revoke all on onzio.cinematic_partners_content, onzio.cinematic_partners from anon, authenticated;
grant select on onzio.cinematic_partners_content, onzio.cinematic_partners to anon, authenticated;
grant insert(club_id, content), update(content) on onzio.cinematic_partners_content to authenticated;
grant insert, delete on onzio.cinematic_partners to authenticated;
grant all on onzio.cinematic_partners_content, onzio.cinematic_partners to service_role;

create policy cinematic_partners_content_read on onzio.cinematic_partners_content for select to anon, authenticated
  using (onzio_private.can_read_feature(club_id, 'branding'));
create policy cinematic_partners_content_insert on onzio.cinematic_partners_content for insert to authenticated
  with check (onzio_private.can_edit_cinematic_partners(club_id));
create policy cinematic_partners_content_update on onzio.cinematic_partners_content for update to authenticated
  using (onzio_private.can_edit_cinematic_partners(club_id)) with check (onzio_private.can_edit_cinematic_partners(club_id));
create policy cinematic_partners_read on onzio.cinematic_partners for select to anon, authenticated
  using (onzio_private.can_read_feature(club_id, 'branding'));
create policy cinematic_partners_insert on onzio.cinematic_partners for insert to authenticated
  with check (onzio_private.can_edit_cinematic_partners(club_id));
create policy cinematic_partners_delete on onzio.cinematic_partners for delete to authenticated
  using (onzio_private.can_edit_cinematic_partners(club_id));

create function onzio_private.serialize_cinematic_partners_write() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  perform pg_catalog.pg_advisory_xact_lock(734901315);
  return null;
end $$;
create function onzio_private.advance_cinematic_partners_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.revision := case when tg_op = 'INSERT' then 1 else old.revision + 1 end;
  new.updated_at := now();
  return new;
end $$;
revoke all on function onzio_private.serialize_cinematic_partners_write(), onzio_private.advance_cinematic_partners_revision() from public, anon;
grant execute on function onzio_private.serialize_cinematic_partners_write(), onzio_private.advance_cinematic_partners_revision() to authenticated, service_role;
create trigger serialize_cinematic_partners_content before insert or update or delete on onzio.cinematic_partners_content
  for each statement execute function onzio_private.serialize_cinematic_partners_write();
create trigger serialize_cinematic_partners before insert or update or delete on onzio.cinematic_partners
  for each statement execute function onzio_private.serialize_cinematic_partners_write();
create trigger advance_cinematic_partners before insert or update on onzio.cinematic_partners_content
  for each row execute function onzio_private.advance_cinematic_partners_revision();
create trigger audit_cinematic_partners_content after insert or update or delete on onzio.cinematic_partners_content
  for each row execute function onzio_private.audit_content_mutation();
create trigger audit_cinematic_partners after insert or update or delete on onzio.cinematic_partners
  for each row execute function onzio_private.audit_content_mutation();

-- Page copy. Mirrors lib/cinematic-partners-content.ts.
create function onzio_private.check_cinematic_partners_pages(p jsonb) returns void
language plpgsql immutable security invoker set search_path = '' as $$
declare page text; copy jsonb; href text;
begin
  perform onzio_private.check_homepage_object(p, array['partners','opportunities'], array['partners','opportunities']);
  foreach page in array array['partners','opportunities'] loop
    copy := p->page;
    if page = 'partners' then
      perform onzio_private.check_homepage_object(copy, array['title','subtitle','intro','ctaPrompt','ctaLabel'], array['title','subtitle','intro','ctaPrompt','ctaLabel']);
    else
      perform onzio_private.check_homepage_object(copy, array['title','subtitle','intro','ctaPrompt','ctaLabel','ctaHref'], array['title','subtitle','intro','ctaPrompt','ctaLabel','ctaHref']);
      perform onzio_private.check_cinematic_text(copy->'ctaHref', 2000);
    end if;
    perform onzio_private.check_cinematic_text(copy->'title', 80);
    perform onzio_private.check_cinematic_text(copy->'subtitle', 120);
    perform onzio_private.check_cinematic_text(copy->'intro', 1200);
    perform onzio_private.check_cinematic_text(copy->'ctaPrompt', 160);
    perform onzio_private.check_cinematic_text(copy->'ctaLabel', 40);
    if btrim(copy->>'title') = '' then raise exception 'INVALID_CINEMATIC_PARTNERS_PAYLOAD' using errcode='22023'; end if;
  end loop;
  -- Same destinations as the Contact Information link: HTTPS, mailto or a site path.
  href := p->'opportunities'->>'ctaHref';
  if href <> '' and href !~ '^/[^/][-A-Za-z0-9_/?#=&%.]*$'
    and href !~ '^mailto:[^@[:space:]?]+@[^@[:space:]?]+[.][^@[:space:]?]+$'
    and (href !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z0-9-]+(:[0-9]+)?([/?#][^[:space:]\\]*)?$'
      or href ~* '^https://(localhost|127[.]|0[.]|[^/]*[.]localhost([:/]|$))')
    then raise exception 'INVALID_CINEMATIC_PARTNERS_PAYLOAD' using errcode='22023';
  end if;
exception when others then
  raise exception 'INVALID_CINEMATIC_PARTNERS_PAYLOAD' using errcode='22023';
end $$;

-- The whole editor payload: page copy plus the ordered partner list.
create function onzio_private.check_cinematic_partners_content(c jsonb) returns void
language plpgsql immutable security invoker set search_path = '' as $$
declare item jsonb; ids text[] := '{}';
begin
  perform onzio_private.check_homepage_object(c, array['pages','partners'], array['pages','partners']);
  perform onzio_private.check_cinematic_partners_pages(c->'pages');
  if jsonb_typeof(c->'partners') is distinct from 'array' or jsonb_array_length(c->'partners') > 24 then
    raise exception 'INVALID_CINEMATIC_PARTNERS_PAYLOAD' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(c->'partners') loop
    perform onzio_private.check_homepage_object(item, array['id','name','role','logoAssetId','tone'], array['id','name','role','logoAssetId','tone']);
    perform onzio_private.check_cinematic_text(item->'id', 36);
    perform onzio_private.check_cinematic_text(item->'name', 80);
    perform onzio_private.check_cinematic_text(item->'role', 160);
    if (item->>'id')::uuid is null or btrim(item->>'name') = '' or (item->>'id') = any(ids)
      or jsonb_typeof(item->'tone') is distinct from 'string' or item->>'tone' not in ('original','grey','black')
      or jsonb_typeof(item->'logoAssetId') not in ('null','string') then
      raise exception 'INVALID_CINEMATIC_PARTNERS_PAYLOAD' using errcode='22023';
    end if;
    if jsonb_typeof(item->'logoAssetId') = 'string' and (item->>'logoAssetId')::uuid is null then
      raise exception 'INVALID_CINEMATIC_PARTNERS_PAYLOAD' using errcode='22023';
    end if;
    ids := ids || (item->>'id');
  end loop;
exception when others then
  raise exception 'INVALID_CINEMATIC_PARTNERS_PAYLOAD' using errcode='22023';
end $$;

create function onzio_private.validate_cinematic_partners_content_row() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform onzio_private.check_homepage_object(new.content, array['pages'], array['pages']);
  perform onzio_private.check_cinematic_partners_pages(new.content->'pages');
  return new;
exception when others then
  raise exception 'INVALID_CINEMATIC_PARTNERS_PAYLOAD' using errcode='22023';
end $$;
-- Partner logos must be this club's published graphics (the media guard below
-- checks club and publication; this adds the kind).
create function onzio_private.validate_cinematic_partner_row() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.logo_media_asset_id is not null and not exists (
    select 1 from onzio.media_assets m where m.club_id = new.club_id and m.id = new.logo_media_asset_id and m.media_kind = 'graphic'
  ) then raise exception 'INVALID_CINEMATIC_PARTNERS_PAYLOAD' using errcode='22023'; end if;
  return new;
end $$;
revoke all on function onzio_private.check_cinematic_partners_pages(jsonb), onzio_private.check_cinematic_partners_content(jsonb),
  onzio_private.validate_cinematic_partners_content_row(), onzio_private.validate_cinematic_partner_row() from public, anon;
grant execute on function onzio_private.check_cinematic_partners_pages(jsonb), onzio_private.check_cinematic_partners_content(jsonb),
  onzio_private.validate_cinematic_partners_content_row() to authenticated, service_role;
create trigger validate_cinematic_partners_content before insert or update on onzio.cinematic_partners_content
  for each row execute function onzio_private.validate_cinematic_partners_content_row();
create trigger validate_cinematic_partner before insert or update on onzio.cinematic_partners
  for each row execute function onzio_private.validate_cinematic_partner_row();
create trigger guard_logo_media_asset_id_media_reference before insert or update of logo_media_asset_id on onzio.cinematic_partners
  for each row execute function onzio_private.guard_media_reference('logo_media_asset_id', 'asset');

create table onzio_private.cinematic_partners_save_receipts (
  club_id uuid not null references onzio.clubs(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  operation_id uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (club_id, actor_id, operation_id)
);
alter table onzio_private.cinematic_partners_save_receipts enable row level security;
grant select, insert on onzio_private.cinematic_partners_save_receipts to authenticated;
create policy cinematic_partners_receipt_read on onzio_private.cinematic_partners_save_receipts for select to authenticated
  using (actor_id = auth.uid() and onzio_private.can_mutate_feature(club_id, 'branding'));
create policy cinematic_partners_receipt_insert on onzio_private.cinematic_partners_save_receipts for insert to authenticated
  with check (actor_id = auth.uid() and onzio_private.can_mutate_feature(club_id, 'branding'));

create function onzio_private.cinematic_partners_snapshot(p_club_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with refs as (
    select p.logo_media_asset_id as id, p.name as label, 0 as grp, p.sort_order as ord
      from onzio.cinematic_partners p where p.club_id = p_club_id and p.logo_media_asset_id is not null
    union all
    select s.media_asset_id, s.name, case s.placement when 'carousel' then 1 else 2 end, s.sort_order
      from onzio.site_sponsor_logos s where s.club_id = p_club_id and s.media_asset_id is not null
  ), firsts as (
    select distinct on (id) id, label, grp, ord from refs order by id, grp, ord
  )
  select jsonb_build_object(
    'revision', coalesce((select revision::text from onzio.cinematic_partners_content where club_id = p_club_id), '0'),
    'designRevision', onzio_private.homepage_design(p_club_id)->>'designRevision',
    'content', (select jsonb_build_object('pages', pc.content->'pages', 'partners', coalesce((
        select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'role', p.role, 'logoAssetId', p.logo_media_asset_id, 'tone', p.logo_tone) order by p.sort_order)
        from onzio.cinematic_partners p where p.club_id = p_club_id), '[]'::jsonb))
      from onzio.cinematic_partners_content pc where pc.club_id = p_club_id),
    'logos', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'storage_path', m.storage_path, 'width', m.width, 'height', m.height, 'label', f.label) order by f.grp, f.ord, f.label)
      from firsts f join onzio.media_assets m on m.club_id = p_club_id and m.id = f.id
      where m.status = 'published' and m.deleted_at is null and m.media_kind = 'graphic'), '[]'::jsonb)
  );
$$;
revoke all on function onzio_private.cinematic_partners_snapshot(uuid) from public, anon;
grant execute on function onzio_private.cinematic_partners_snapshot(uuid) to authenticated, service_role;

create function onzio.load_cinematic_partners_editor(p_club_id uuid, p_operation_id uuid default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare result jsonb; receipt jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  perform pg_catalog.pg_advisory_xact_lock(734901315);
  if not onzio_private.can_mutate_feature(p_club_id, 'branding') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
  if p_operation_id is not null then
    select response into receipt from onzio_private.cinematic_partners_save_receipts
      where club_id = p_club_id and actor_id = auth.uid() and operation_id = p_operation_id;
  end if;
  if receipt is null and onzio_private.homepage_design(p_club_id)->>'templateKey' is distinct from 'cinematic@2'
    then raise exception 'PAGE_UNAVAILABLE' using errcode='22023'; end if;
  result := onzio_private.cinematic_partners_snapshot(p_club_id);
  if p_operation_id is not null then
    result := result || jsonb_build_object('operation', case when receipt is null
      then jsonb_build_object('status', 'not-committed')
      else jsonb_build_object('status', 'committed', 'receipt', receipt) end);
  end if;
  return result;
end $$;

create function onzio.save_cinematic_partners_editor(p_club_id uuid, p_request jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  c jsonb; current_snapshot jsonb; result jsonb; op uuid; request_hash text; previous_hash text; receipt jsonb;
  previous_logos uuid[]; next_logos uuid[]; retired jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901281);
  perform pg_catalog.pg_advisory_xact_lock(734901315);
  if not onzio_private.can_mutate_feature(p_club_id, 'branding') then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
  perform onzio_private.check_homepage_object(p_request, array['operationId','expectedRevision','designRevision','content'], array['operationId','expectedRevision','designRevision','content']);
  if jsonb_typeof(p_request->'operationId') is distinct from 'string'
    or jsonb_typeof(p_request->'expectedRevision') is distinct from 'string'
    or p_request->>'expectedRevision' !~ '^[0-9]+$'
    or length(p_request->>'expectedRevision') > 20 then
    raise exception 'INVALID_CINEMATIC_PARTNERS_PAYLOAD' using errcode='22023';
  end if;
  perform onzio_private.check_cinematic_text(p_request->'designRevision', 100);
  begin op := (p_request->>'operationId')::uuid;
  exception when invalid_text_representation then raise exception 'INVALID_CINEMATIC_PARTNERS_PAYLOAD' using errcode='22023'; end;
  if op is null then raise exception 'INVALID_CINEMATIC_PARTNERS_PAYLOAD' using errcode='22023'; end if;
  c := p_request->'content';
  perform onzio_private.check_cinematic_partners_content(c);
  request_hash := encode(sha256(convert_to(p_request::text, 'UTF8')), 'hex');
  select r.request_hash, r.response into previous_hash, receipt from onzio_private.cinematic_partners_save_receipts r
    where r.club_id = p_club_id and r.actor_id = auth.uid() and r.operation_id = op;
  if found then
    if request_hash <> previous_hash then raise exception 'OPERATION_REUSED' using errcode='22023'; end if;
    return receipt;
  end if;
  if onzio_private.homepage_design(p_club_id)->>'templateKey' is distinct from 'cinematic@2'
    then raise exception 'PAGE_UNAVAILABLE' using errcode='22023'; end if;
  current_snapshot := onzio_private.cinematic_partners_snapshot(p_club_id);
  if current_snapshot->>'designRevision' is distinct from p_request->>'designRevision'
    then raise exception 'DESIGN_CHANGED' using errcode='22023'; end if;
  if current_snapshot->>'revision' is distinct from p_request->>'expectedRevision'
    then raise exception 'CINEMATIC_PARTNERS_CHANGED' using errcode='PT409'; end if;

  select coalesce(array_agg(distinct (item->>'logoAssetId')::uuid), '{}') into next_logos
    from jsonb_array_elements(c->'partners') item where jsonb_typeof(item->'logoAssetId') = 'string';
  if exists (select 1 from unnest(next_logos) as wanted(logo_id) where not exists (
    select 1 from onzio.media_assets m where m.club_id = p_club_id and m.id = wanted.logo_id
      and m.status = 'published' and m.deleted_at is null and m.media_kind = 'graphic'))
    then raise exception 'INVALID_CINEMATIC_PARTNERS_PAYLOAD' using errcode='22023'; end if;
  select coalesce(array_agg(distinct logo_media_asset_id), '{}') into previous_logos
    from onzio.cinematic_partners where club_id = p_club_id and logo_media_asset_id is not null;

  insert into onzio.cinematic_partners_content(club_id, content) values (p_club_id, jsonb_build_object('pages', c->'pages'))
    on conflict (club_id) do update set content = excluded.content;
  delete from onzio.cinematic_partners where club_id = p_club_id;
  insert into onzio.cinematic_partners(club_id, id, sort_order, name, role, logo_media_asset_id, logo_tone)
    select p_club_id, (item->>'id')::uuid, (ordinality - 1)::integer, item->>'name', item->>'role',
      nullif(item->>'logoAssetId', '')::uuid, item->>'tone'
    from jsonb_array_elements(c->'partners') with ordinality as rows(item, ordinality);

  select coalesce(jsonb_agg(gone.logo_id order by gone.logo_id), '[]'::jsonb) into retired
    from unnest(previous_logos) as gone(logo_id) where not gone.logo_id = any(next_logos);
  result := onzio_private.cinematic_partners_snapshot(p_club_id) || jsonb_build_object('operationId', op, 'retiredMediaAssetIds', retired);
  insert into onzio_private.cinematic_partners_save_receipts(club_id, actor_id, operation_id, request_hash, response)
    values (p_club_id, auth.uid(), op, request_hash, result);
  return result;
end $$;
revoke all on function onzio.load_cinematic_partners_editor(uuid, uuid), onzio.save_cinematic_partners_editor(uuid, jsonb) from public, anon;
grant execute on function onzio.load_cinematic_partners_editor(uuid, uuid), onzio.save_cinematic_partners_editor(uuid, jsonb) to authenticated;
notify pgrst, 'reload schema';
