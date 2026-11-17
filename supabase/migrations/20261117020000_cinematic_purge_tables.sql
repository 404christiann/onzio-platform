-- Rose City: the archived-club hard purge also deletes the 15 Rose City (cinematic@2) club tables.
-- Main's onzio_private.purge_archived_club (20261111080000) refuses, and keeps everything, when a club still has rows
-- in a club table it does not list; Rose City's 14 cinematic_* tables and homepage_revamp_content were not listed.
-- This redefines only the private function, copied from 20261111080000 with the 15 tables added at the head of
-- v_order (children before parents). Same signature, security definer, search_path, lock_timeout and grants.
-- The public onzio.purge_archived_club wrapper is unchanged. Additive only: no drops, renames, table changes or data.

create or replace function onzio_private.purge_archived_club(
  p_club_id uuid,
  p_export_id text,
  p_confirmation text,
  p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  -- Children before parents: every foreign key into a table here from
  -- another club table comes from a table listed earlier.
  v_order constant text[] := array[
    -- Rose City (cinematic@2) tables, children before their parents. Nothing else references them.
    'onzio.cinematic_injury_entries',
    'onzio.cinematic_injury_report_content',
    'onzio.cinematic_partners',
    'onzio.cinematic_partners_content',
    'onzio.cinematic_ticket_page_images',
    'onzio.cinematic_ticket_pages',
    'onzio.cinematic_chick_fil_a_content',
    'onzio.cinematic_contact_content',
    'onzio.cinematic_news_articles',
    'onzio.cinematic_policy_content',
    'onzio.cinematic_robinson_content',
    'onzio.cinematic_shop_content',
    'onzio.cinematic_stadium_content',
    'onzio.cinematic_tickets_content',
    'onzio.homepage_revamp_content',
    'onzio.player_match_stats',
    'onzio.goalkeeper_match_stats',
    'onzio.player_season_adjustments',
    'onzio.goalkeeper_season_adjustments',
    'onzio.player_season_stats',
    'onzio.goalkeeper_season_stats',
    'onzio.player_photos',
    'onzio.registrations',
    'onzio.registration_price_options',
    'onzio.registration_form_fields',
    'onzio.tryouts',
    'onzio.program_media',
    'onzio.programs',
    'onzio.registration_forms',
    'onzio.club_stripe_connect',
    'onzio.matches',
    'onzio.league_standings',
    'onzio.league_standings_settings',
    'onzio.players',
    'onzio.staff',
    'onzio.seasons',
    'onzio.homepage_slideshow_photos',
    'onzio.homepage_slideshow_settings',
    'onzio.homepage_hero_content',
    'onzio.homepage_story_section',
    'onzio.behind_the_rose_section',
    'onzio.about_page_content',
    'onzio.club_logo_page_content',
    'onzio.contact_profile',
    'onzio.contact_page_content',
    'onzio.programs_page_content',
    'onzio.tryouts_page_content',
    'onzio.shop_kit_photos',
    'onzio.shop_carousel_photos',
    'onzio.shop_kit_section',
    'onzio.shop_purchase_details',
    'onzio.site_sponsor_logos',
    'onzio.site_social_links',
    'onzio.site_branding',
    'onzio.club_identity',
    'onzio.presentation_state',
    'onzio.presentation_publications',
    'onzio.presentation_documents',
    'onzio.media_cleanup_queue',
    'onzio.media_assets',
    'onzio.club_subscriptions',
    'onzio.club_members',
    'onzio.club_domains'
  ];
  -- Ledgers that outlive the club: the club delete nulls the first two;
  -- club_exports has no foreign key.
  v_ledgers constant text[] := array[
    'onzio.audit_events',
    'onzio.stripe_events',
    'onzio.club_exports'
  ];

  v_club record;
  v_export record;
  v_tables text[];
  v_tbl text;
  v_n bigint;
  v_deleted jsonb := '{}'::jsonb;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_audit_id bigint;
begin
  if p_club_id is null or p_export_id is null or p_confirmation is null
     or p_actor_id is null then
    raise exception 'INVALID_OPERATOR_INPUT';
  end if;

  select c.id, c.slug, c.lifecycle
  into v_club
  from onzio.clubs c
  where c.id = p_club_id
  for update;

  if not found then
    if exists (
      select 1 from onzio.club_exports e
      where e.id = p_export_id
        and e.club_id = p_club_id
        and e.club_slug = p_confirmation
        and e.status = 'purged'
    ) then
      return jsonb_build_object(
        'status', 'already_purged',
        'club_id', p_club_id,
        'club_slug', p_confirmation
      );
    end if;
    raise exception 'CLUB_NOT_FOUND';
  end if;

  if p_confirmation <> v_club.slug then
    raise exception 'CONFIRMATION_MISMATCH';
  end if;
  if v_club.lifecycle <> 'archived' then
    raise exception 'CLUB_NOT_ARCHIVED';
  end if;

  -- Every table that holds club rows, in a fixed order for the locks.
  select array_agg(format('%I.%I', c.table_schema, c.table_name)
                   order by c.table_schema, c.table_name)
  into v_tables
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.column_name = 'club_id'
    and t.table_type = 'BASE TABLE'
    and c.table_schema in ('onzio', 'onzio_private', 'public');

  execute 'lock table onzio.clubs, ' || array_to_string(v_tables, ', ')
    || ' in share row exclusive mode';

  -- Checks on other tables run after the locks, so nothing they read can
  -- change before the deletes.
  if exists (
    select 1 from onzio.club_domains d where d.club_id = p_club_id and d.active
  ) then
    raise exception 'PURGE_BLOCKED' using detail = 'a domain is still active';
  end if;
  if exists (
    select 1 from onzio.club_subscriptions s
    where s.club_id = p_club_id
      and s.stripe_subscription_id is not null
      and coalesce(s.status, '') not in ('canceled', 'incomplete_expired')
  ) then
    raise exception 'PURGE_BLOCKED'
      using detail = 'cancel the Stripe subscription first';
  end if;
  if exists (
    select 1 from onzio.club_stripe_connect sc
    where sc.club_id = p_club_id and sc.charges_enabled
  ) then
    raise exception 'PURGE_BLOCKED'
      using detail = 'the Stripe Connect account can still take payments';
  end if;

  select e.id, e.checksum_sha256
  into v_export
  from onzio.club_exports e
  where e.id = p_export_id
    and e.club_id = p_club_id
    and e.club_slug = v_club.slug
    and e.status = 'verified'
  for update;
  if not found then
    raise exception 'EXPORT_REQUIRED';
  end if;

  select count(*) into v_n from onzio.clubs where id <> p_club_id;
  v_before := jsonb_build_object('onzio.clubs', v_n);
  foreach v_tbl in array v_tables loop
    execute format('select count(*) from %s where club_id <> $1', v_tbl)
      into v_n using p_club_id;
    v_before := v_before || jsonb_build_object(v_tbl, v_n);
  end loop;

  -- Presentation history refuses deletes by design. Lifted for this
  -- transaction only; the lock above keeps other sessions out meanwhile,
  -- and a rollback restores the triggers with everything else.
  alter table onzio.presentation_documents
    disable trigger presentation_documents_immutable;
  alter table onzio.presentation_publications
    disable trigger presentation_publications_immutable;

  foreach v_tbl in array v_order loop
    execute format('delete from %s where club_id = $1', v_tbl::regclass)
      using p_club_id;
    get diagnostics v_n = row_count;
    v_deleted := v_deleted || jsonb_build_object(v_tbl, v_n);
  end loop;

  alter table onzio.presentation_documents
    enable trigger presentation_documents_immutable;
  alter table onzio.presentation_publications
    enable trigger presentation_publications_immutable;

  -- Fail closed on a club table this function does not know about. The
  -- onzio_private tables cascade with the club; count them for the record.
  foreach v_tbl in array v_tables loop
    continue when v_tbl = any (v_order) or v_tbl = any (v_ledgers);
    execute format('select count(*) from %s where club_id = $1', v_tbl)
      into v_n using p_club_id;
    if v_tbl like 'onzio_private.%' then
      v_deleted := v_deleted || jsonb_build_object(v_tbl, v_n);
    elsif v_n > 0 then
      raise exception 'PURGE_UNKNOWN_CLUB_TABLE'
        using detail = format('%s still holds %s rows for the club', v_tbl, v_n);
    end if;
  end loop;

  delete from onzio.clubs where id = p_club_id and lifecycle = 'archived';
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'PURGE_INCOMPLETE' using detail = 'club row not deleted';
  end if;
  v_deleted := v_deleted || jsonb_build_object('onzio.clubs', v_n);

  select count(*) into v_n from onzio.clubs where id <> p_club_id;
  v_after := jsonb_build_object('onzio.clubs', v_n);
  foreach v_tbl in array v_tables loop
    execute format('select count(*) from %s where club_id = $1', v_tbl)
      into v_n using p_club_id;
    if v_n > 0 and v_tbl <> 'onzio.club_exports' then
      raise exception 'PURGE_INCOMPLETE'
        using detail = format('%s still holds %s rows for the club', v_tbl, v_n);
    end if;
    execute format('select count(*) from %s where club_id <> $1', v_tbl)
      into v_n using p_club_id;
    v_after := v_after || jsonb_build_object(v_tbl, v_n);
  end loop;
  if v_after <> v_before then
    raise exception 'PURGE_OTHER_CLUB_CHANGED'
      using detail = format('before %s after %s', v_before, v_after);
  end if;

  update onzio.club_exports
  set status = 'purged', purged_at = now()
  where id = v_export.id;

  insert into onzio.audit_events (
    club_id, actor_user_id, actor_type, operation, resource_type, resource_id,
    payload
  ) values (
    null, p_actor_id, 'operator', 'hard_purge', 'purged_club',
    p_club_id::text,
    jsonb_build_object(
      'club_slug', v_club.slug,
      'export_id', v_export.id,
      'export_checksum', v_export.checksum_sha256,
      'storage', 'pending',
      'rows_deleted', v_deleted
    )
  ) returning id into v_audit_id;

  return jsonb_build_object(
    'status', 'purged',
    'club_id', p_club_id,
    'club_slug', v_club.slug,
    'audit_event_id', v_audit_id,
    'rows_deleted', v_deleted
  );
end;
$$;

revoke all on function onzio_private.purge_archived_club(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function onzio_private.purge_archived_club(uuid, text, text, uuid)
  to service_role;

notify pgrst, 'reload schema';
