-- Onzio Platform Phase 2: grants, RLS, audit triggers, and Storage policy.

grant usage on schema onzio_private to anon, authenticated;

grant all on all tables in schema onzio to service_role;
grant usage, select on all sequences in schema onzio to service_role;

alter table onzio.clubs enable row level security;
alter table onzio.club_domains enable row level security;
alter table onzio.club_members enable row level security;
alter table onzio.club_subscriptions enable row level security;
alter table onzio.stripe_events enable row level security;
alter table onzio.media_assets enable row level security;
alter table onzio.audit_events enable row level security;

grant select on onzio.clubs to anon, authenticated;
grant select on onzio.club_domains to anon, authenticated;
grant select on onzio.club_members to anon, authenticated;
grant select on onzio.club_subscriptions to anon, authenticated;
grant select on onzio.stripe_events to anon, authenticated;
grant select on onzio.audit_events to anon, authenticated;
grant select on onzio.media_assets to anon, authenticated;

create policy clubs_public_read
on onzio.clubs
for select
to anon, authenticated
using (
  onzio_private.is_publicly_accessible(id)
  or (
    onzio_private.is_aal2()
    and onzio_private.is_club_member(id)
    and lifecycle <> 'archived'
  )
);

create policy club_domains_public_read
on onzio.club_domains
for select
to anon, authenticated
using (
  active
  and verified_at is not null
  and onzio_private.can_read_club(club_id)
);

create policy club_members_self_read
on onzio.club_members
for select
to authenticated
using (
  user_id = auth.uid()
  and onzio_private.is_aal2()
);

create policy club_subscriptions_owner_read
on onzio.club_subscriptions
for select
to authenticated
using (
  onzio_private.is_aal2()
  and onzio_private.has_club_role(club_id, array['owner']::text[])
);

create policy media_assets_public_read
on onzio.media_assets
for select
to anon, authenticated
using (
  status = 'published'
  and onzio_private.is_publicly_accessible(club_id)
);

create policy media_assets_member_read
on onzio.media_assets
for select
to authenticated
using (
  onzio_private.is_aal2()
  and onzio_private.is_club_member(club_id)
  and exists (
    select 1
    from onzio.clubs club
    where club.id = media_assets.club_id
      and club.lifecycle <> 'archived'
  )
);

-- These records are written only through privileged server boundaries. Anon
-- retains SELECT at the table-grant layer so RLS can return an empty result
-- without leaking whether records exist.
revoke insert, update, delete on onzio.stripe_events from anon, authenticated;
revoke insert, update, delete on onzio.audit_events from anon, authenticated;
revoke insert, update, delete on onzio.clubs from anon, authenticated;
revoke insert, update, delete on onzio.club_domains from anon, authenticated;
revoke insert, update, delete on onzio.club_members from anon, authenticated;
revoke insert, update, delete on onzio.club_subscriptions from anon, authenticated;
revoke insert, update, delete on onzio.media_assets from anon, authenticated;
revoke update, delete on onzio.audit_events from service_role;
revoke delete on onzio.stripe_events from service_role;

do $$
declare
  table_name text;
  table_feature text;
  public_tables constant text[] := array[
    'seasons',
    'players',
    'staff',
    'matches',
    'player_photos',
    'player_match_stats',
    'goalkeeper_match_stats',
    'player_season_stats',
    'goalkeeper_season_stats',
    'site_branding',
    'site_social_links',
    'site_sponsor_logos',
    'about_page_content',
    'club_logo_page_content',
    'behind_the_rose_section',
    'homepage_slideshow_settings',
    'homepage_slideshow_photos',
    'league_standings_settings',
    'league_standings',
    'shop_kit_section',
    'shop_kit_photos',
    'shop_carousel_photos',
    'shop_purchase_details'
  ];
begin
  foreach table_name in array public_tables loop
    table_feature := case
      when table_name in (
        'league_standings_settings',
        'league_standings'
      ) then 'standings'
      when table_name in (
        'shop_kit_section',
        'shop_kit_photos',
        'shop_carousel_photos',
        'shop_purchase_details'
      ) then 'shop'
      when table_name in (
        'players',
        'staff',
        'player_photos',
        'player_match_stats',
        'goalkeeper_match_stats',
        'player_season_stats',
        'goalkeeper_season_stats',
        'seasons'
      ) then 'roster'
      when table_name = 'matches' then 'schedule'
      when table_name in (
        'about_page_content',
        'club_logo_page_content'
      ) then 'about'
      when table_name in (
        'behind_the_rose_section',
        'homepage_slideshow_settings',
        'homepage_slideshow_photos'
      ) then 'homepage'
      else 'branding'
    end;

    execute format('alter table onzio.%I enable row level security', table_name);
    execute format(
      'grant select on onzio.%I to anon, authenticated',
      table_name
    );
    execute format(
      'grant insert, update, delete on onzio.%I to authenticated',
      table_name
    );
    execute format(
      'create policy %I on onzio.%I for select to anon, authenticated using (onzio_private.can_read_feature(club_id, %L))',
      table_name || '_tenant_read',
      table_name,
      table_feature
    );
    execute format(
      'create policy %I on onzio.%I for insert to authenticated with check (onzio_private.can_mutate_feature(club_id, %L))',
      table_name || '_tenant_insert',
      table_name,
      table_feature
    );
    execute format(
      'create policy %I on onzio.%I for update to authenticated using (onzio_private.can_mutate_feature(club_id, %L)) with check (onzio_private.can_mutate_feature(club_id, %L))',
      table_name || '_tenant_update',
      table_name,
      table_feature,
      table_feature
    );
    execute format(
      'create policy %I on onzio.%I for delete to authenticated using (onzio_private.can_mutate_feature(club_id, %L))',
      table_name || '_tenant_delete',
      table_name,
      table_feature
    );
  end loop;
end
$$;

create or replace function onzio_private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function onzio_private.set_updated_at() from public;
grant execute on function onzio_private.set_updated_at() to authenticated, service_role;

create or replace function onzio_private.audit_content_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  tenant_id uuid;
  record_id text;
  field_names jsonb;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  tenant_id := nullif(row_data ->> 'club_id', '')::uuid;
  record_id := coalesce(
    nullif(row_data ->> 'id', ''),
    nullif(row_data ->> 'player_id', ''),
    nullif(row_data ->> 'club_id', '')
  );

  select coalesce(jsonb_agg(field_name order by field_name), '[]'::jsonb)
  into field_names
  from jsonb_object_keys(row_data) as fields(field_name)
  where field_name !~* '(password|secret|token|key|stripe_customer|stripe_subscription)';

  insert into onzio.audit_events (
    club_id,
    actor_user_id,
    actor_type,
    operation,
    resource_type,
    resource_id,
    payload
  )
  values (
    tenant_id,
    auth.uid(),
    case when auth.uid() is null then 'system' else 'user' end,
    lower(tg_op),
    tg_table_name,
    record_id,
    jsonb_build_object('changed_fields', field_names)
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function onzio_private.audit_content_mutation() from public;
grant execute on function onzio_private.audit_content_mutation() to authenticated, service_role;

do $$
declare
  table_name text;
  audit_tables constant text[] := array[
    'seasons',
    'players',
    'staff',
    'matches',
    'player_photos',
    'player_match_stats',
    'goalkeeper_match_stats',
    'player_season_stats',
    'goalkeeper_season_stats',
    'site_branding',
    'site_social_links',
    'site_sponsor_logos',
    'about_page_content',
    'club_logo_page_content',
    'behind_the_rose_section',
    'homepage_slideshow_settings',
    'homepage_slideshow_photos',
    'league_standings_settings',
    'league_standings',
    'shop_kit_section',
    'shop_kit_photos',
    'shop_carousel_photos',
    'shop_purchase_details'
  ];
  updated_tables constant text[] := array[
    'clubs',
    'club_domains',
    'club_members',
    'club_subscriptions',
    'seasons',
    'players',
    'staff',
    'matches',
    'player_match_stats',
    'goalkeeper_match_stats',
    'player_season_stats',
    'goalkeeper_season_stats',
    'site_branding',
    'site_social_links',
    'about_page_content',
    'club_logo_page_content',
    'behind_the_rose_section',
    'homepage_slideshow_settings',
    'league_standings_settings',
    'league_standings',
    'shop_kit_section',
    'shop_purchase_details'
  ];
begin
  foreach table_name in array audit_tables loop
    execute format(
      'create trigger audit_%I after insert or update or delete on onzio.%I for each row execute function onzio_private.audit_content_mutation()',
      table_name,
      table_name
    );
  end loop;

  foreach table_name in array updated_tables loop
    execute format(
      'create trigger set_%I_updated_at before update on onzio.%I for each row execute function onzio_private.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end
$$;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'onzio-upload-staging',
    'onzio-upload-staging',
    false,
    15728640,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'onzio-media',
    'onzio-media',
    true,
    15728640,
    array['image/jpeg', 'image/png', 'image/webp']
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy onzio_staging_member_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'onzio-upload-staging'
  and name ~ '^[0-9a-f-]{36}/[a-z][a-z0-9-]{0,63}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
  and lower(coalesce(metadata ->> 'mimetype', '')) in (
    'image/jpeg',
    'image/png',
    'image/webp'
  )
  and onzio_private.can_mutate_feature(
    split_part(name, '/', 1)::uuid,
    case split_part(name, '/', 2)
      when 'shop' then 'shop'
      when 'standings' then 'standings'
      else 'branding'
    end
  )
);

create policy onzio_staging_member_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'onzio-upload-staging'
  and name ~ '^[0-9a-f-]{36}/[a-z][a-z0-9-]{0,63}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
  and onzio_private.can_mutate_feature(
    split_part(name, '/', 1)::uuid,
    case split_part(name, '/', 2)
      when 'shop' then 'shop'
      when 'standings' then 'standings'
      else 'branding'
    end
  )
);

create policy onzio_staging_member_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'onzio-upload-staging'
  and name ~ '^[0-9a-f-]{36}/[a-z][a-z0-9-]{0,63}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
  and onzio_private.can_mutate_feature(
    split_part(name, '/', 1)::uuid,
    case split_part(name, '/', 2)
      when 'shop' then 'shop'
      when 'standings' then 'standings'
      else 'branding'
    end
  )
);

-- onzio-media is written only by the server-side media finalizer (service
-- role). Public delivery is provided by the bucket's public object endpoint.
create policy onzio_media_metadata_read
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'onzio-media'
  and name ~ '^[0-9a-f-]{36}/[a-z][a-z0-9-]{0,63}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
  and onzio_private.is_publicly_accessible(
    split_part(name, '/', 1)::uuid
  )
);

notify pgrst, 'reload schema';
