-- RC2027-NEWS: Sam's News articles for cinematic@2 (approved preview: outer design-explorations/news-2027).
-- One row per article. Removing an article hides it (removed_at) and keeps it restorable.
create table onzio.cinematic_news_articles (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete cascade,
  slug text not null check (char_length(slug) <= 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and slug <> 'injury-report'),
  content jsonb not null,
  cover_media_asset_id uuid,
  published_at timestamptz not null,
  removed_at timestamptz,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, id),
  unique (club_id, slug),
  foreign key (club_id, cover_media_asset_id) references onzio.media_assets(club_id, id)
);
create index cinematic_news_articles_list_idx on onzio.cinematic_news_articles (club_id, published_at desc) where removed_at is null;
create index cinematic_news_articles_cover_idx on onzio.cinematic_news_articles (club_id, cover_media_asset_id) where cover_media_asset_id is not null;

alter table onzio.cinematic_news_articles enable row level security;
revoke all on onzio.cinematic_news_articles from anon, authenticated;
grant select on onzio.cinematic_news_articles to anon, authenticated;
grant insert(club_id, slug, content, cover_media_asset_id, published_at),
  update(content, cover_media_asset_id, published_at, removed_at) on onzio.cinematic_news_articles to authenticated;
grant all on onzio.cinematic_news_articles to service_role;
create policy cinematic_news_public_read on onzio.cinematic_news_articles for select to anon, authenticated
  using (removed_at is null and onzio_private.can_read_feature(club_id, 'news'));
create policy cinematic_news_editor_read on onzio.cinematic_news_articles for select to authenticated
  using (onzio_private.can_mutate_feature(club_id, 'news'));
create policy cinematic_news_insert on onzio.cinematic_news_articles for insert to authenticated
  with check (onzio_private.can_mutate_feature(club_id, 'news') and onzio_private.homepage_design(club_id)->>'templateKey' = 'cinematic@2');
create policy cinematic_news_update on onzio.cinematic_news_articles for update to authenticated
  using (onzio_private.can_mutate_feature(club_id, 'news') and onzio_private.homepage_design(club_id)->>'templateKey' = 'cinematic@2')
  with check (onzio_private.can_mutate_feature(club_id, 'news') and onzio_private.homepage_design(club_id)->>'templateKey' = 'cinematic@2');

create function onzio_private.serialize_cinematic_news_write() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(734901401);
  return null;
end $$;
create function onzio_private.advance_cinematic_news_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.revision := case when tg_op = 'INSERT' then 1 else old.revision + 1 end;
  new.updated_at := now();
  return new;
end $$;
revoke all on function onzio_private.serialize_cinematic_news_write(), onzio_private.advance_cinematic_news_revision() from public, anon;
grant execute on function onzio_private.serialize_cinematic_news_write(), onzio_private.advance_cinematic_news_revision() to authenticated, service_role;
create trigger serialize_cinematic_news before insert or update or delete on onzio.cinematic_news_articles
  for each statement execute function onzio_private.serialize_cinematic_news_write();
create trigger advance_cinematic_news before insert or update on onzio.cinematic_news_articles
  for each row execute function onzio_private.advance_cinematic_news_revision();
create trigger audit_cinematic_news after insert or update or delete on onzio.cinematic_news_articles
  for each row execute function onzio_private.audit_content_mutation();
create trigger guard_cover_media_asset_id before insert or update of cover_media_asset_id on onzio.cinematic_news_articles
  for each row execute function onzio_private.guard_media_reference('cover_media_asset_id', 'asset');

-- Mirrors newsArticleContentSchema in lib/cinematic-news.ts.
create function onzio_private.check_cinematic_news_content(c jsonb) returns void
language plpgsql immutable security invoker set search_path = '' as $$
declare
  keys text[] := array['category','cardHeading','title','subtitle','coverAlt','paragraphs','actionLabel','actionHref'];
  paragraph jsonb;
  href text;
begin
  perform onzio_private.check_homepage_object(c, keys, keys);
  if jsonb_typeof(c->'category') is distinct from 'string'
    or c->>'category' not in ('sponsor-partner','partner','community','new-player','news') then
    raise exception 'INVALID_CINEMATIC_NEWS_PAYLOAD' using errcode = '22023';
  end if;
  perform onzio_private.check_cinematic_text(c->'cardHeading', 40);
  perform onzio_private.check_cinematic_text(c->'title', 140);
  perform onzio_private.check_cinematic_text(c->'subtitle', 200);
  perform onzio_private.check_cinematic_text(c->'coverAlt', 200);
  perform onzio_private.check_cinematic_text(c->'actionLabel', 40);
  perform onzio_private.check_cinematic_text(c->'actionHref', 2000);
  if btrim(c->>'cardHeading') = '' or btrim(c->>'title') = '' then
    raise exception 'INVALID_CINEMATIC_NEWS_PAYLOAD' using errcode = '22023';
  end if;
  if jsonb_typeof(c->'paragraphs') is distinct from 'array' then
    raise exception 'INVALID_CINEMATIC_NEWS_PAYLOAD' using errcode = '22023';
  end if;
  if jsonb_array_length(c->'paragraphs') not between 1 and 40 then
    raise exception 'INVALID_CINEMATIC_NEWS_PAYLOAD' using errcode = '22023';
  end if;
  for paragraph in select value from jsonb_array_elements(c->'paragraphs') loop
    perform onzio_private.check_cinematic_text(paragraph, 4000);
    if btrim(paragraph #>> '{}') = '' then raise exception 'INVALID_CINEMATIC_NEWS_PAYLOAD' using errcode = '22023'; end if;
  end loop;
  href := c->>'actionHref';
  if (btrim(c->>'actionLabel') = '') <> (href = '') then
    raise exception 'INVALID_CINEMATIC_NEWS_PAYLOAD' using errcode = '22023';
  end if;
  if href <> '' and href !~ '^/([-A-Za-z0-9_?#=&%.][-A-Za-z0-9_/?#=&%.]*)?$'
    and (href !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z0-9-]+(:[0-9]+)?([/?#][^[:space:]\\]*)?$'
      or href ~* '^https://(localhost|127[.]|0[.]|[^/]*[.]localhost([:/]|$))') then
    raise exception 'INVALID_CINEMATIC_NEWS_PAYLOAD' using errcode = '22023';
  end if;
exception when others then
  raise exception 'INVALID_CINEMATIC_NEWS_PAYLOAD' using errcode = '22023';
end $$;
create function onzio_private.validate_cinematic_news_row() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform onzio_private.check_cinematic_news_content(new.content);
  return new;
end $$;
revoke all on function onzio_private.check_cinematic_news_content(jsonb), onzio_private.validate_cinematic_news_row() from public, anon;
grant execute on function onzio_private.check_cinematic_news_content(jsonb), onzio_private.validate_cinematic_news_row() to authenticated, service_role;
create trigger validate_cinematic_news before insert or update on onzio.cinematic_news_articles
  for each row execute function onzio_private.validate_cinematic_news_row();

create table onzio_private.cinematic_news_save_receipts (
  club_id uuid not null references onzio.clubs(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  operation_id uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (club_id, actor_id, operation_id)
);
alter table onzio_private.cinematic_news_save_receipts enable row level security;
grant select, insert on onzio_private.cinematic_news_save_receipts to authenticated;
create policy cinematic_news_receipt_read on onzio_private.cinematic_news_save_receipts for select to authenticated
  using (actor_id = auth.uid() and onzio_private.can_mutate_feature(club_id, 'news'));
create policy cinematic_news_receipt_insert on onzio_private.cinematic_news_save_receipts for insert to authenticated
  with check (actor_id = auth.uid() and onzio_private.can_mutate_feature(club_id, 'news'));

create function onzio_private.cinematic_news_instant(t timestamptz) returns text
language sql immutable security invoker set search_path = '' as $$
  select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;
create function onzio_private.cinematic_news_article_json(a onzio.cinematic_news_articles) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', a.id, 'slug', a.slug, 'revision', a.revision::text,
    'publishedAt', onzio_private.cinematic_news_instant(a.published_at),
    'removedAt', onzio_private.cinematic_news_instant(a.removed_at),
    'content', a.content,
    'cover', (select jsonb_build_object('assetId', m.id, 'storage_bucket', m.storage_bucket, 'storage_path', m.storage_path, 'width', m.width, 'height', m.height)
      from onzio.media_assets m where m.club_id = a.club_id and m.id = a.cover_media_asset_id));
$$;
revoke all on function onzio_private.cinematic_news_instant(timestamptz), onzio_private.cinematic_news_article_json(onzio.cinematic_news_articles) from public, anon;
grant execute on function onzio_private.cinematic_news_instant(timestamptz), onzio_private.cinematic_news_article_json(onzio.cinematic_news_articles) to authenticated, service_role;

create function onzio.load_cinematic_news_editor(p_club_id uuid, p_operation_id uuid default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare result jsonb; receipt jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901401);
  if not onzio_private.can_mutate_feature(p_club_id, 'news') then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  if p_operation_id is not null then
    select response into receipt from onzio_private.cinematic_news_save_receipts
      where club_id = p_club_id and actor_id = auth.uid() and operation_id = p_operation_id;
  end if;
  if receipt is null and onzio_private.homepage_design(p_club_id)->>'templateKey' is distinct from 'cinematic@2'
    then raise exception 'PAGE_UNAVAILABLE' using errcode = '22023'; end if;
  result := jsonb_build_object('articles', coalesce((select jsonb_agg(onzio_private.cinematic_news_article_json(a) order by a.published_at desc, a.id)
    from onzio.cinematic_news_articles a where a.club_id = p_club_id), '[]'::jsonb));
  if p_operation_id is not null then
    result := result || jsonb_build_object('operation', case when receipt is null
      then jsonb_build_object('status', 'not-committed')
      else jsonb_build_object('status', 'committed', 'receipt', receipt) end);
  end if;
  return result;
end $$;

-- action "save" creates (articleId null, expectedRevision "0") or edits an article;
-- "remove" hides it and "restore" shows it again. The web address is set once, on create.
create function onzio.save_cinematic_news_article(p_club_id uuid, p_request jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  op uuid; action text; article_id uuid; cover uuid; old_cover uuid; published timestamptz;
  a onzio.cinematic_news_articles; request_hash text; previous_hash text; receipt jsonb; result jsonb;
  base text; candidate text; suffix integer := 1; retired jsonb := '[]'::jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(734901401);
  if not onzio_private.can_mutate_feature(p_club_id, 'news') then raise exception 'NOT_AUTHORIZED' using errcode = '42501'; end if;
  action := case when jsonb_typeof(p_request) = 'object' and jsonb_typeof(p_request->'action') = 'string' then p_request->>'action' end;
  if action = 'save' then
    perform onzio_private.check_homepage_object(p_request, array['operationId','action','articleId','expectedRevision','slug','publishedAt','coverAssetId','content'], array['operationId','action','articleId','expectedRevision','slug','publishedAt','coverAssetId','content']);
  elsif action in ('remove', 'restore') then
    perform onzio_private.check_homepage_object(p_request, array['operationId','action','articleId','expectedRevision'], array['operationId','action','articleId','expectedRevision']);
  else
    raise exception 'INVALID_CINEMATIC_NEWS_PAYLOAD' using errcode = '22023';
  end if;
  if jsonb_typeof(p_request->'operationId') is distinct from 'string'
    or jsonb_typeof(p_request->'expectedRevision') is distinct from 'string'
    or p_request->>'expectedRevision' !~ '^[0-9]{1,20}$'
    or jsonb_typeof(p_request->'articleId') not in ('string', 'null')
    or (action <> 'save' and jsonb_typeof(p_request->'articleId') = 'null') then
    raise exception 'INVALID_CINEMATIC_NEWS_PAYLOAD' using errcode = '22023';
  end if;
  begin
    op := (p_request->>'operationId')::uuid;
    article_id := (p_request->>'articleId')::uuid;
  exception when invalid_text_representation then raise exception 'INVALID_CINEMATIC_NEWS_PAYLOAD' using errcode = '22023'; end;
  if op is null then raise exception 'INVALID_CINEMATIC_NEWS_PAYLOAD' using errcode = '22023'; end if;
  if action = 'save' then
    perform onzio_private.check_cinematic_news_content(p_request->'content');
    if jsonb_typeof(p_request->'slug') is distinct from 'string'
      or jsonb_typeof(p_request->'coverAssetId') not in ('string', 'null')
      or jsonb_typeof(p_request->'publishedAt') is distinct from 'string'
      or p_request->>'publishedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]{1,6})?)?(Z|[+-][0-9]{2}:[0-9]{2})$' then
      raise exception 'INVALID_CINEMATIC_NEWS_PAYLOAD' using errcode = '22023';
    end if;
    begin
      published := (p_request->>'publishedAt')::timestamptz;
      cover := (p_request->>'coverAssetId')::uuid;
    exception when others then raise exception 'INVALID_CINEMATIC_NEWS_PAYLOAD' using errcode = '22023'; end;
    if published not between '2000-01-01T00:00:00Z'::timestamptz and '2100-01-01T00:00:00Z'::timestamptz then
      raise exception 'INVALID_CINEMATIC_NEWS_PAYLOAD' using errcode = '22023';
    end if;
  end if;

  request_hash := encode(sha256(convert_to(p_request::text, 'UTF8')), 'hex');
  select r.request_hash, r.response into previous_hash, receipt from onzio_private.cinematic_news_save_receipts r
    where r.club_id = p_club_id and r.actor_id = auth.uid() and r.operation_id = op;
  if found then
    if request_hash <> previous_hash then raise exception 'OPERATION_REUSED' using errcode = '22023'; end if;
    return receipt;
  end if;
  if onzio_private.homepage_design(p_club_id)->>'templateKey' is distinct from 'cinematic@2'
    then raise exception 'PAGE_UNAVAILABLE' using errcode = '22023'; end if;
  if cover is not null and not exists (select 1 from onzio.media_assets m where m.club_id = p_club_id and m.id = cover
    and m.status = 'published' and m.deleted_at is null and m.storage_bucket = 'onzio-media' and m.surface = 'news') then
    raise exception 'NEWS_COVER_INVALID' using errcode = '22023';
  end if;

  if article_id is null then
    base := p_request->>'slug';
    if p_request->>'expectedRevision' <> '0' or char_length(base) > 80 or base !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or base = 'injury-report' then
      raise exception 'INVALID_CINEMATIC_NEWS_PAYLOAD' using errcode = '22023';
    end if;
    candidate := base;
    while exists (select 1 from onzio.cinematic_news_articles x where x.club_id = p_club_id and x.slug = candidate) loop
      suffix := suffix + 1;
      candidate := rtrim(left(base, 80 - char_length(suffix::text) - 1), '-') || '-' || suffix;
    end loop;
    insert into onzio.cinematic_news_articles(club_id, slug, content, cover_media_asset_id, published_at)
      values (p_club_id, candidate, p_request->'content', cover, published) returning * into a;
  else
    select * into a from onzio.cinematic_news_articles x where x.club_id = p_club_id and x.id = article_id for update;
    if not found then raise exception 'NEWS_ARTICLE_NOT_FOUND' using errcode = '22023'; end if;
    if a.revision::text is distinct from p_request->>'expectedRevision' then
      raise exception 'CINEMATIC_NEWS_CHANGED' using errcode = 'PT409';
    end if;
    if action = 'save' then
      old_cover := a.cover_media_asset_id;
      update onzio.cinematic_news_articles x set content = p_request->'content', published_at = published, cover_media_asset_id = cover
        where x.club_id = p_club_id and x.id = article_id returning * into a;
      if old_cover is not null and old_cover is distinct from cover then retired := jsonb_build_array(old_cover); end if;
    elsif action = 'remove' then
      update onzio.cinematic_news_articles x set removed_at = coalesce(x.removed_at, now())
        where x.club_id = p_club_id and x.id = article_id returning * into a;
    else
      update onzio.cinematic_news_articles x set removed_at = null
        where x.club_id = p_club_id and x.id = article_id returning * into a;
    end if;
  end if;

  result := jsonb_build_object('operationId', op, 'article', onzio_private.cinematic_news_article_json(a), 'retiredMediaAssetIds', retired);
  insert into onzio_private.cinematic_news_save_receipts(club_id, actor_id, operation_id, request_hash, response)
    values (p_club_id, auth.uid(), op, request_hash, result);
  return result;
end $$;
revoke all on function onzio.load_cinematic_news_editor(uuid, uuid), onzio.save_cinematic_news_article(uuid, jsonb) from public, anon;
grant execute on function onzio.load_cinematic_news_editor(uuid, uuid), onzio.save_cinematic_news_article(uuid, jsonb) to authenticated;
notify pgrst, 'reload schema';
