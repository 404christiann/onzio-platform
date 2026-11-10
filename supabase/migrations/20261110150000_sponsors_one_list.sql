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
--      Its name is the homepage row's name.
--   4. One order per club: the homepage strip's order first, then the logos
--      that were only in the footer, in the footer's order.
--   5. name: at most 60 characters and not blank (break-ui gap; decision 7).
--      A longer or blank name stops the migration with a plain message; it
--      rolls back whole and nothing is cut short.
--   6. placement stays, nullable and unread by the new code, until both clubs
--      have accepted the new page (plan, risk 5). A row inserted with a
--      placement and neither switch on gets the switch for that placement, so
--      code deployed before this migration keeps adding visible logos.
--
-- Visitors see no change at merge: the homepage strip and footer show the same
-- logos in the same order (a club whose footer had logos the homepage didn't
-- keeps them in the footer, after the homepage ones, which the footer shows on
-- its own). The template decides whether the footer shows sponsors at all.
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

-- 4. One order per club, 0..n-1.
with ordered as (
  select
    l.id,
    (row_number() over (
      partition by l.club_id
      order by l.show_on_homepage desc, l.sort_order, l.created_at, l.id
    ) - 1)::int as new_order
  from onzio.site_sponsor_logos l
)
update onzio.site_sponsor_logos l
set sort_order = ordered.new_order
from ordered
where l.id = ordered.id
  and l.sort_order <> ordered.new_order;

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
