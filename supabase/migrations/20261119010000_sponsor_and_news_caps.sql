-- RC-ADMIN-10a: the sponsor and news caps the admin already shows, enforced in SQL.
-- Approved by Christian on 2026-11-19 (UTC). Needs the production migration gate before merge.
--
-- Before this, the 30 / 10 / 6 sponsor limits lived only in the admin pages, and News had no
-- article limit at all. A direct table write could go past them. Now two row triggers refuse
-- the write that would go past a cap. They refuse increases only: a write that adds no row and
-- turns no switch on always passes, so a club that is somehow over a cap can still edit, turn
-- switches off and delete.
--
-- Sponsors (onzio.site_sponsor_logos), per club, under a per-club advisory lock so parallel
-- writes cannot pass together:
--   SPONSOR_LIMIT_TOTAL     30 rows
--   SPONSOR_LIMIT_HOMEPAGE  10 rows with show_on_homepage
--   SPONSOR_LIMIT_FOOTER     6 rows with show_in_footer (always, even where the template's footer
--                            shows no sponsors; B1-b showed every club within it)
-- The trigger is named so it fires after site_sponsor_logo_placement_switches, which sets the
-- switches for an insert that only writes the old `placement` column.
--
-- News (onzio.cinematic_news_articles): NEWS_LIMIT_REACHED at 200 live articles per club, where
-- live means removed_at is null. Removed articles do not count, because admins cannot delete
-- one for good. Inserting a live article and restoring a removed one are the increases. The
-- table's statement trigger already takes the News lock (734901401) before any row trigger.
--
-- Both raise errcode 23514 with the code as the message. The admin maps each code to plain copy.
-- The slideshow limit (7 on cinematic@2, 6 elsewhere) is already enforced by save_homepage and
-- is not changed here.
--
-- The migration stops, and changes nothing, if any club is already over a cap.
--
-- Rollback: drop the two triggers and the two functions. No data is changed.

do $$
declare
  over text;
begin
  select string_agg(format('%s (%s total, %s homepage, %s footer)', c.slug, s.total, s.homepage, s.footer), ', ')
    into over
    from (
      select club_id,
        count(*) as total,
        count(*) filter (where show_on_homepage) as homepage,
        count(*) filter (where show_in_footer) as footer
      from onzio.site_sponsor_logos
      group by club_id
    ) s
    join onzio.clubs c on c.id = s.club_id
    where s.total > 30 or s.homepage > 10 or s.footer > 6;
  if over is not null then
    raise exception 'RC-ADMIN-10a: club(s) already over a sponsor cap (30 total, 10 homepage, 6 footer): %', over;
  end if;

  select string_agg(format('%s (%s live)', c.slug, n.live), ', ')
    into over
    from (
      select club_id, count(*) as live
      from onzio.cinematic_news_articles
      where removed_at is null
      group by club_id
    ) n
    join onzio.clubs c on c.id = n.club_id
    where n.live > 200;
  if over is not null then
    raise exception 'RC-ADMIN-10a: club(s) already over the news cap of 200 live articles: %', over;
  end if;
end $$;

create function onzio_private.enforce_sponsor_caps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  others_total integer;
  others_homepage integer;
  others_footer integer;
  homepage_on boolean := new.show_on_homepage and (tg_op = 'INSERT' or not old.show_on_homepage);
  footer_on boolean := new.show_in_footer and (tg_op = 'INSERT' or not old.show_in_footer);
begin
  if tg_op = 'UPDATE' and not homepage_on and not footer_on then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(734901502, pg_catalog.hashtext(new.club_id::text));

  select
    count(*),
    count(*) filter (where s.show_on_homepage),
    count(*) filter (where s.show_in_footer)
    into others_total, others_homepage, others_footer
    from onzio.site_sponsor_logos s
    where s.club_id = new.club_id and s.id <> new.id;

  if tg_op = 'INSERT' and others_total + 1 > 30 then
    raise exception 'SPONSOR_LIMIT_TOTAL' using errcode = '23514';
  end if;
  if homepage_on and others_homepage + 1 > 10 then
    raise exception 'SPONSOR_LIMIT_HOMEPAGE' using errcode = '23514';
  end if;
  if footer_on and others_footer + 1 > 6 then
    raise exception 'SPONSOR_LIMIT_FOOTER' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function onzio_private.enforce_sponsor_caps() from public, anon, authenticated;

-- Fires after site_sponsor_logo_placement_switches ("site_sponsor_logo_" sorts before
-- "site_sponsor_logos_"), so an insert's switches are final when they are counted.
create trigger site_sponsor_logos_caps
before insert or update of show_on_homepage, show_in_footer on onzio.site_sponsor_logos
for each row execute function onzio_private.enforce_sponsor_caps();

create function onzio_private.enforce_cinematic_news_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  live integer;
begin
  if new.removed_at is not null or (tg_op = 'UPDATE' and old.removed_at is null) then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(734901401);

  select count(*) into live
    from onzio.cinematic_news_articles a
    where a.club_id = new.club_id and a.removed_at is null and a.id <> new.id;

  if live + 1 > 200 then
    raise exception 'NEWS_LIMIT_REACHED' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function onzio_private.enforce_cinematic_news_cap() from public, anon, authenticated;

create trigger cinematic_news_live_cap
before insert or update of removed_at on onzio.cinematic_news_articles
for each row execute function onzio_private.enforce_cinematic_news_cap();

notify pgrst, 'reload schema';
