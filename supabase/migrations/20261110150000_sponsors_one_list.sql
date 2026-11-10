-- ADMIN-RE-15: Sponsors, one list (docs/admin-portal-redesign-plan.md; design
-- decision 0007). Needs GATE-MIGRATE, and it merges rows on a live table, which
-- review-bot-supabase.md hands to a person.
--
-- Each sponsor is one row with two switches, Homepage and Footer, and an
-- optional link to their website. Before this, a logo shown in both places was
-- two rows, one per `placement`.
--
--   1. onzio.site_sponsor_logos.show_on_homepage, show_in_footer
--      boolean not null default false, filled from `placement`.
--   2. onzio.site_sponsor_logos.website_url text, null or an http(s) address
--      of at most 2,048 characters. Nobody has one at merge.
--   3. Rows for the same logo file (same club and media_asset_id) become one:
--      the homepage row stays, with both switches; the others are deleted.
--      Its name is the homepage row's name. Rows without a media_asset_id
--      are left as they are, even when two share a logo link: a shared link
--      without a file record does not show it is the same sponsor (Lions'
--      import wrote one placeholder link for several sponsors). Christian's
--      read-only check (2026-11-10): Rose City 5 pairs (12 rows to 7),
--      Diverse City 1 pair (4 to 3), Lions none (one link pair left alone).
--   4. One order per club that keeps both places' orders: the homepage strip's
--      order, with each footer-only logo slotted in right after the logo it
--      followed in the footer (first, when it followed none). Where the two
--      places list their shared logos in opposite order, the homepage wins and
--      only those logos move in the footer. Worked out before the merge, while
--      each place's positions still exist.
--   5. name: at most 60 characters and not blank (break-ui gap; decision 7).
--      A longer or blank name stops the migration with a plain message; it
--      rolls back whole and nothing is cut short.
--   6. placement stays, nullable and unread by the new code, until both clubs
--      have accepted the new page (plan, risk 5). A row inserted with a
--      placement and neither switch on gets the switch for that placement, so
--      code deployed before this migration keeps adding visible logos.
--
-- What visitors see: the homepage strip and the footer show the same logos in
-- the same order, except where the homepage and footer listed two shared
-- logos in opposite order (one order can't hold both): there the footer
-- follows the homepage. Christian's read-only order check in the RE-15 notes
-- counts those, per club. The template decides whether the footer shows
-- sponsors at all: at the time of writing, Diverse City's academy footer shows
-- none and Rose City's public site is held.
--
-- Rollback (before any sponsor is saved with both switches from the new
-- page): drop the trigger and its function, the two name checks and the
-- website check, then the three columns, and `alter column placement set not
-- null`. Merged rows do not split back; restore them from the backup taken
-- before GATE-MIGRATE.

-- 1, 2. The switches and the link.
alter table onzio.site_sponsor_logos
  add column show_on_homepage boolean not null default false,
  add column show_in_footer boolean not null default false,
  add column website_url text;

update onzio.site_sponsor_logos
set show_on_homepage = (placement = 'carousel'),
    show_in_footer = (placement = 'footer');

do $$
begin
  if exists (select 1 from onzio.site_sponsor_logos where char_length(name) > 60) then
    raise exception 'ADMIN-RE-15: a sponsor name is over 60 characters; shorten it first'
      using errcode = '23514';
  end if;
  if exists (select 1 from onzio.site_sponsor_logos where btrim(name) = '') then
    raise exception 'ADMIN-RE-15: a sponsor has no name; name it first'
      using errcode = '23514';
  end if;
end;
$$;

-- 4a. The order, worked out from today's rows (one per place). A logo's group
-- is its file (media_asset_id), or the row itself when it has no file record.
-- Homepage logos sort by their homepage position; a footer-only logo sorts
-- just after the highest-placed homepage logo that came before it in the
-- footer (before every homepage logo when none did), then by footer position.
create temporary table re15_sponsor_order as
with s as (
  select l.id, l.club_id, l.placement, l.sort_order, l.created_at,
         coalesce(l.media_asset_id::text, l.id::text) as grp
  from onzio.site_sponsor_logos l
),
kept as (
  select distinct on (s.club_id, s.grp) s.club_id, s.grp, s.id
  from s
  order by s.club_id, s.grp, (s.placement = 'carousel') desc, s.sort_order, s.created_at, s.id
),
homepage as (
  select club_id, grp, min(pos) as pos
  from (
    select s.club_id, s.grp,
           row_number() over (partition by s.club_id order by s.sort_order, s.created_at, s.id) as pos
    from s
    where s.placement = 'carousel'
  ) h
  group by club_id, grp
),
footer as (
  select club_id, grp, min(pos) as pos
  from (
    select s.club_id, s.grp,
           row_number() over (partition by s.club_id order by s.sort_order, s.created_at, s.id) as pos
    from s
    where s.placement = 'footer'
  ) f
  group by club_id, grp
),
keys as (
  select
    k.club_id,
    k.id,
    case
      when h.pos is not null then h.pos::numeric
      else coalesce((
        select max(h2.pos)
        from footer f2
        join homepage h2 on h2.club_id = f2.club_id and h2.grp = f2.grp
        where f2.club_id = k.club_id and f2.pos < f.pos
      ), 0) + 0.5
    end as major,
    coalesce(f.pos, 0) as minor
  from kept k
  left join homepage h on h.club_id = k.club_id and h.grp = k.grp
  left join footer f on f.club_id = k.club_id and f.grp = k.grp
)
select
  id,
  (row_number() over (partition by club_id order by major, minor, id) - 1)::int as new_order
from keys;

-- 3. One row per logo file. The homepage row is kept (else the first footer
-- row) and takes the switches of every row for that file.
with ranked as (
  select
    l.id,
    l.club_id,
    l.media_asset_id,
    row_number() over (
      partition by l.club_id, l.media_asset_id
      order by l.show_on_homepage desc, l.sort_order, l.created_at, l.id
    ) as rank,
    bool_or(l.show_on_homepage) over (partition by l.club_id, l.media_asset_id) as any_homepage,
    bool_or(l.show_in_footer) over (partition by l.club_id, l.media_asset_id) as any_footer
  from onzio.site_sponsor_logos l
  where l.media_asset_id is not null
),
kept as (
  update onzio.site_sponsor_logos l
  set show_on_homepage = ranked.any_homepage,
      show_in_footer = ranked.any_footer
  from ranked
  where l.id = ranked.id
    and ranked.rank = 1
    and (l.show_on_homepage, l.show_in_footer) is distinct from (ranked.any_homepage, ranked.any_footer)
  returning l.id
)
delete from onzio.site_sponsor_logos l
using ranked
where l.id = ranked.id
  and ranked.rank > 1;

-- 4b. One order per club, 0..n-1, from 4a. Every row left after the merge is
-- a kept row, so each has its place.
update onzio.site_sponsor_logos l
set sort_order = o.new_order
from re15_sponsor_order o
where l.id = o.id
  and l.sort_order <> o.new_order;

do $$
begin
  if exists (
    select 1 from onzio.site_sponsor_logos l
    where not exists (select 1 from re15_sponsor_order o where o.id = l.id)
  ) then
    raise exception 'ADMIN-RE-15: a sponsor row has no place in the new order';
  end if;
end;
$$;

drop table re15_sponsor_order;

-- 5. Names and links.
alter table onzio.site_sponsor_logos
  add constraint site_sponsor_logos_name_length
    check (char_length(name) <= 60),
  add constraint site_sponsor_logos_name_filled
    check (btrim(name) <> ''),
  add constraint site_sponsor_logos_website_url_shape
    check (
      website_url is null
      or (char_length(website_url) <= 2048 and website_url ~* '^https?://[^[:space:]]+$')
    );

-- 6. placement is kept for code deployed before this migration.
alter table onzio.site_sponsor_logos
  alter column placement drop not null;

comment on column onzio.site_sponsor_logos.placement is
  'Deprecated by ADMIN-RE-15 (show_on_homepage, show_in_footer). Kept for code deployed before it; dropped once both clubs accept the one-list page.';
comment on column onzio.site_sponsor_logos.show_on_homepage is
  'ADMIN-RE-15: the logo is in the homepage strip (at most 10, checked by the admin).';
comment on column onzio.site_sponsor_logos.show_in_footer is
  'ADMIN-RE-15: the logo is in the footer, on templates whose footer shows sponsors (at most 6, checked by the admin).';
comment on column onzio.site_sponsor_logos.website_url is
  'ADMIN-RE-15: optional link to the sponsor''s website; a logo without one is not a link.';

-- An insert from code that still writes `placement` and not the switches.
-- Touches only the new row, so it runs with the inserting user's rights.
create or replace function onzio_private.site_sponsor_logo_placement_switches()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.placement is not null and not new.show_on_homepage and not new.show_in_footer then
    new.show_on_homepage := new.placement = 'carousel';
    new.show_in_footer := new.placement = 'footer';
  end if;
  return new;
end;
$$;

revoke execute on function onzio_private.site_sponsor_logo_placement_switches() from public;

create trigger site_sponsor_logo_placement_switches
before insert on onzio.site_sponsor_logos
for each row execute function onzio_private.site_sponsor_logo_placement_switches();

notify pgrst, 'reload schema';
