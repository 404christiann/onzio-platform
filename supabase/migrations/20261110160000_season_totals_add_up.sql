-- ADMIN-RE-11c (decision 0001): season totals add up from player numbers.
--
-- A player's season totals become the sum of their saved player numbers (one
-- row per game) plus a hand-entered adjustment per player and season, for games
-- that were never entered game by game.
--
-- 1. New tables onzio.player_season_adjustments and onzio.goalkeeper_season_adjustments,
--    one row per player and season, keyed to that season's totals row.
-- 2. New views onzio.player_season_totals and onzio.goalkeeper_season_totals: the
--    totals row's player and season, the sum of the games, plus the adjustment.
--    Same column names as the totals tables, so a reader swaps the name only.
-- 3. onzio.player_match_stats.played / onzio.goalkeeper_match_stats.played: whether
--    the player took part. Any number above 0 marks the player as played (group 1
--    decision 7); Played can also be set on its own.
-- 4. Backfill. Christian's decision (2026-11-10, "Keep today's numbers"): every
--    adjustment is typed total - games, so every total visitors see stays exactly
--    as it is. An adjustment may therefore be negative.
--
-- The typed numbers in onzio.player_season_stats / onzio.goalkeeper_season_stats are
-- left exactly as they are. Their rows still say who is in a season; their numbers
-- are no longer read by the app after this change and are kept until the change
-- is accepted on both clubs (plan risk 5), so code that is still the old code
-- between this migration and the deploy keeps showing the right totals.
--
-- Bounds (production check, 2026-11-10: largest typed season minutes 990,
-- largest other typed number 31): every number of an adjustment stays within
-- +-9,999. Saving an adjustment that would take a total
-- below 0 is refused, and the views never show a total below 0 (a later change to
-- the games could otherwise do it).
--
-- Rollback: drop the two views, the two adjustment tables, the two triggers on
-- the match tables and their functions, then the two played columns. The typed
-- totals were never changed, so the old code reads the same numbers as before.

-- 1. Adjustments --------------------------------------------------------------

create table onzio.player_season_adjustments (
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  player_id uuid not null,
  season_id uuid not null,
  goals integer not null default 0 check (goals between -9999 and 9999),
  assists integer not null default 0 check (assists between -9999 and 9999),
  tackles integer not null default 0 check (tackles between -9999 and 9999),
  starts integer not null default 0 check (starts between -9999 and 9999),
  yellow integer not null default 0 check (yellow between -9999 and 9999),
  red integer not null default 0 check (red between -9999 and 9999),
  mins integer not null default 0 check (mins between -9999 and 9999),
  offsides integer not null default 0 check (offsides between -9999 and 9999),
  fouls integer not null default 0 check (fouls between -9999 and 9999),
  fouls_suffered integer not null default 0 check (fouls_suffered between -9999 and 9999),
  updated_at timestamptz not null default now(),
  primary key (club_id, player_id, season_id),
  foreign key (club_id, player_id, season_id)
    references onzio.player_season_stats(club_id, player_id, season_id) on delete cascade
);

create table onzio.goalkeeper_season_adjustments (
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  player_id uuid not null,
  season_id uuid not null,
  goals_against integer not null default 0 check (goals_against between -9999 and 9999),
  saves integer not null default 0 check (saves between -9999 and 9999),
  clean_sheets integer not null default 0 check (clean_sheets between -9999 and 9999),
  starts integer not null default 0 check (starts between -9999 and 9999),
  yellow integer not null default 0 check (yellow between -9999 and 9999),
  red integer not null default 0 check (red between -9999 and 9999),
  mins integer not null default 0 check (mins between -9999 and 9999),
  updated_at timestamptz not null default now(),
  primary key (club_id, player_id, season_id),
  foreign key (club_id, player_id, season_id)
    references onzio.goalkeeper_season_stats(club_id, player_id, season_id) on delete cascade
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['player_season_adjustments', 'goalkeeper_season_adjustments'] loop
    execute format('alter table onzio.%I enable row level security', table_name);
    execute format('grant select on onzio.%I to anon, authenticated', table_name);
    execute format('grant insert, update, delete on onzio.%I to authenticated', table_name);
    execute format('grant all on onzio.%I to service_role', table_name);
    execute format(
      'create policy %I on onzio.%I for select to anon, authenticated using (onzio_private.can_read_feature(club_id, %L))',
      table_name || '_tenant_read', table_name, 'roster'
    );
    execute format(
      'create policy %I on onzio.%I for insert to authenticated with check (onzio_private.can_mutate_feature(club_id, %L))',
      table_name || '_tenant_insert', table_name, 'roster'
    );
    execute format(
      'create policy %I on onzio.%I for update to authenticated using (onzio_private.can_mutate_feature(club_id, %L)) with check (onzio_private.can_mutate_feature(club_id, %L))',
      table_name || '_tenant_update', table_name, 'roster', 'roster'
    );
    execute format(
      'create policy %I on onzio.%I for delete to authenticated using (onzio_private.can_mutate_feature(club_id, %L))',
      table_name || '_tenant_delete', table_name, 'roster'
    );
    execute format(
      'create trigger %I after insert or update or delete on onzio.%I for each row execute function onzio_private.audit_content_mutation()',
      'audit_' || table_name, table_name
    );
    execute format(
      'create trigger %I before update on onzio.%I for each row execute function onzio_private.set_updated_at()',
      'set_' || table_name || '_updated_at', table_name
    );
  end loop;
end
$$;

-- 2. Played -------------------------------------------------------------------

alter table onzio.player_match_stats add column played boolean not null default false;
alter table onzio.goalkeeper_match_stats add column played boolean not null default false;

-- Production check (2026-11-10): 83 of 92 saved rows are all zero ("Save all" on
-- the old Match stats page writes a row for every listed player), and every row
-- with any number also has minutes. So: played where anything was entered.
update onzio.player_match_stats
set played = true
where starts or mins > 0 or goals > 0 or assists > 0 or tackles > 0 or offsides > 0
   or fouls > 0 or fouls_suffered > 0 or yellow > 0 or red > 0;

update onzio.goalkeeper_match_stats
set played = true
where starts or mins > 0 or goals_against > 0 or saves > 0 or clean_sheets > 0
   or yellow > 0 or red > 0;

create or replace function onzio_private.mark_field_player_played()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.starts or new.mins > 0 or new.goals > 0 or new.assists > 0 or new.tackles > 0
     or new.offsides > 0 or new.fouls > 0 or new.fouls_suffered > 0 or new.yellow > 0 or new.red > 0 then
    new.played := true;
  end if;
  return new;
end;
$$;

create or replace function onzio_private.mark_goalkeeper_played()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.starts or new.mins > 0 or new.goals_against > 0 or new.saves > 0 or new.clean_sheets > 0
     or new.yellow > 0 or new.red > 0 then
    new.played := true;
  end if;
  return new;
end;
$$;

create trigger mark_field_player_played
before insert or update on onzio.player_match_stats
for each row execute function onzio_private.mark_field_player_played();

create trigger mark_goalkeeper_played
before insert or update on onzio.goalkeeper_match_stats
for each row execute function onzio_private.mark_goalkeeper_played();

-- 3. Totals -------------------------------------------------------------------

-- security_invoker: a reader sees totals only where the tables underneath let them
-- read (every one of them reads by onzio_private.can_read_feature).
create view onzio.player_season_totals
with (security_invoker = true) as
select
  s.club_id,
  s.player_id,
  s.season_id,
  g.games_played,
  greatest(0, g.goals + coalesce(a.goals, 0))::integer as goals,
  greatest(0, g.assists + coalesce(a.assists, 0))::integer as assists,
  greatest(0, g.tackles + coalesce(a.tackles, 0))::integer as tackles,
  greatest(0, g.starts + coalesce(a.starts, 0))::integer as starts,
  greatest(0, g.yellow + coalesce(a.yellow, 0))::integer as yellow,
  greatest(0, g.red + coalesce(a.red, 0))::integer as red,
  greatest(0, g.mins + coalesce(a.mins, 0))::integer as mins,
  greatest(0, g.offsides + coalesce(a.offsides, 0))::integer as offsides,
  greatest(0, g.fouls + coalesce(a.fouls, 0))::integer as fouls,
  greatest(0, g.fouls_suffered + coalesce(a.fouls_suffered, 0))::integer as fouls_suffered
from onzio.player_season_stats s
left join onzio.player_season_adjustments a
  on a.club_id = s.club_id and a.player_id = s.player_id and a.season_id = s.season_id
cross join lateral (
  select
    (count(*) filter (where ms.played))::integer as games_played,
    coalesce(sum(ms.goals), 0)::integer as goals,
    coalesce(sum(ms.assists), 0)::integer as assists,
    coalesce(sum(ms.tackles), 0)::integer as tackles,
    (count(*) filter (where ms.starts))::integer as starts,
    coalesce(sum(ms.yellow), 0)::integer as yellow,
    coalesce(sum(ms.red), 0)::integer as red,
    coalesce(sum(ms.mins), 0)::integer as mins,
    coalesce(sum(ms.offsides), 0)::integer as offsides,
    coalesce(sum(ms.fouls), 0)::integer as fouls,
    coalesce(sum(ms.fouls_suffered), 0)::integer as fouls_suffered
  from onzio.player_match_stats ms
  join onzio.matches m on m.club_id = ms.club_id and m.id = ms.match_id
  where ms.club_id = s.club_id
    and ms.player_id = s.player_id
    and m.season_id = s.season_id
) g;

create view onzio.goalkeeper_season_totals
with (security_invoker = true) as
select
  s.club_id,
  s.player_id,
  s.season_id,
  g.games_played,
  greatest(0, g.goals_against + coalesce(a.goals_against, 0))::integer as goals_against,
  greatest(0, g.saves + coalesce(a.saves, 0))::integer as saves,
  greatest(0, g.clean_sheets + coalesce(a.clean_sheets, 0))::integer as clean_sheets,
  greatest(0, g.starts + coalesce(a.starts, 0))::integer as starts,
  greatest(0, g.yellow + coalesce(a.yellow, 0))::integer as yellow,
  greatest(0, g.red + coalesce(a.red, 0))::integer as red,
  greatest(0, g.mins + coalesce(a.mins, 0))::integer as mins
from onzio.goalkeeper_season_stats s
left join onzio.goalkeeper_season_adjustments a
  on a.club_id = s.club_id and a.player_id = s.player_id and a.season_id = s.season_id
cross join lateral (
  select
    (count(*) filter (where ms.played))::integer as games_played,
    coalesce(sum(ms.goals_against), 0)::integer as goals_against,
    coalesce(sum(ms.saves), 0)::integer as saves,
    coalesce(sum(ms.clean_sheets), 0)::integer as clean_sheets,
    (count(*) filter (where ms.starts))::integer as starts,
    coalesce(sum(ms.yellow), 0)::integer as yellow,
    coalesce(sum(ms.red), 0)::integer as red,
    coalesce(sum(ms.mins), 0)::integer as mins
  from onzio.goalkeeper_match_stats ms
  join onzio.matches m on m.club_id = ms.club_id and m.id = ms.match_id
  where ms.club_id = s.club_id
    and ms.player_id = s.player_id
    and m.season_id = s.season_id
) g;

revoke all on onzio.player_season_totals from public, anon, authenticated;
revoke all on onzio.goalkeeper_season_totals from public, anon, authenticated;
grant select on onzio.player_season_totals to anon, authenticated, service_role;
grant select on onzio.goalkeeper_season_totals to anon, authenticated, service_role;

-- 4. An adjustment never takes a total below 0 ---------------------------------

create or replace function onzio_private.check_field_adjustment_keeps_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  g record;
begin
  select
    coalesce(sum(ms.goals), 0) as goals,
    coalesce(sum(ms.assists), 0) as assists,
    coalesce(sum(ms.tackles), 0) as tackles,
    count(*) filter (where ms.starts) as starts,
    coalesce(sum(ms.yellow), 0) as yellow,
    coalesce(sum(ms.red), 0) as red,
    coalesce(sum(ms.mins), 0) as mins,
    coalesce(sum(ms.offsides), 0) as offsides,
    coalesce(sum(ms.fouls), 0) as fouls,
    coalesce(sum(ms.fouls_suffered), 0) as fouls_suffered
  into g
  from onzio.player_match_stats ms
  join onzio.matches m on m.club_id = ms.club_id and m.id = ms.match_id
  where ms.club_id = new.club_id
    and ms.player_id = new.player_id
    and m.season_id = new.season_id;

  if g.goals + new.goals < 0 or g.assists + new.assists < 0 or g.tackles + new.tackles < 0
     or g.starts + new.starts < 0 or g.yellow + new.yellow < 0 or g.red + new.red < 0
     or g.mins + new.mins < 0 or g.offsides + new.offsides < 0 or g.fouls + new.fouls < 0
     or g.fouls_suffered + new.fouls_suffered < 0 then
    raise exception 'SEASON_TOTAL_BELOW_ZERO'
      using errcode = '23514',
            detail = 'An adjustment cannot take a season total below 0.';
  end if;
  return new;
end;
$$;

create or replace function onzio_private.check_goalkeeper_adjustment_keeps_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  g record;
begin
  select
    coalesce(sum(ms.goals_against), 0) as goals_against,
    coalesce(sum(ms.saves), 0) as saves,
    coalesce(sum(ms.clean_sheets), 0) as clean_sheets,
    count(*) filter (where ms.starts) as starts,
    coalesce(sum(ms.yellow), 0) as yellow,
    coalesce(sum(ms.red), 0) as red,
    coalesce(sum(ms.mins), 0) as mins
  into g
  from onzio.goalkeeper_match_stats ms
  join onzio.matches m on m.club_id = ms.club_id and m.id = ms.match_id
  where ms.club_id = new.club_id
    and ms.player_id = new.player_id
    and m.season_id = new.season_id;

  if g.goals_against + new.goals_against < 0 or g.saves + new.saves < 0
     or g.clean_sheets + new.clean_sheets < 0 or g.starts + new.starts < 0
     or g.yellow + new.yellow < 0 or g.red + new.red < 0 or g.mins + new.mins < 0 then
    raise exception 'SEASON_TOTAL_BELOW_ZERO'
      using errcode = '23514',
            detail = 'An adjustment cannot take a season total below 0.';
  end if;
  return new;
end;
$$;

create trigger check_field_adjustment_keeps_totals
before insert or update on onzio.player_season_adjustments
for each row execute function onzio_private.check_field_adjustment_keeps_totals();

create trigger check_goalkeeper_adjustment_keeps_totals
before insert or update on onzio.goalkeeper_season_adjustments
for each row execute function onzio_private.check_goalkeeper_adjustment_keeps_totals();

revoke all on function onzio_private.mark_field_player_played() from public;
revoke all on function onzio_private.mark_goalkeeper_played() from public;
revoke all on function onzio_private.check_field_adjustment_keeps_totals() from public;
revoke all on function onzio_private.check_goalkeeper_adjustment_keeps_totals() from public;

-- 5. Backfill: typed total - games, so every total stays as it is ---------------

insert into onzio.player_season_adjustments (
  club_id, player_id, season_id,
  goals, assists, tackles, starts, yellow, red, mins, offsides, fouls, fouls_suffered
)
select
  s.club_id, s.player_id, s.season_id,
  s.goals - g.goals, s.assists - g.assists, s.tackles - g.tackles, s.starts - g.starts,
  s.yellow - g.yellow, s.red - g.red, s.mins - g.mins, s.offsides - g.offsides,
  s.fouls - g.fouls, s.fouls_suffered - g.fouls_suffered
from onzio.player_season_stats s
cross join lateral (
  select
    coalesce(sum(ms.goals), 0)::integer as goals,
    coalesce(sum(ms.assists), 0)::integer as assists,
    coalesce(sum(ms.tackles), 0)::integer as tackles,
    (count(*) filter (where ms.starts))::integer as starts,
    coalesce(sum(ms.yellow), 0)::integer as yellow,
    coalesce(sum(ms.red), 0)::integer as red,
    coalesce(sum(ms.mins), 0)::integer as mins,
    coalesce(sum(ms.offsides), 0)::integer as offsides,
    coalesce(sum(ms.fouls), 0)::integer as fouls,
    coalesce(sum(ms.fouls_suffered), 0)::integer as fouls_suffered
  from onzio.player_match_stats ms
  join onzio.matches m on m.club_id = ms.club_id and m.id = ms.match_id
  where ms.club_id = s.club_id
    and ms.player_id = s.player_id
    and m.season_id = s.season_id
) g
where (s.goals, s.assists, s.tackles, s.starts, s.yellow, s.red, s.mins, s.offsides, s.fouls, s.fouls_suffered)
  is distinct from (g.goals, g.assists, g.tackles, g.starts, g.yellow, g.red, g.mins, g.offsides, g.fouls, g.fouls_suffered);

insert into onzio.goalkeeper_season_adjustments (
  club_id, player_id, season_id,
  goals_against, saves, clean_sheets, starts, yellow, red, mins
)
select
  s.club_id, s.player_id, s.season_id,
  s.goals_against - g.goals_against, s.saves - g.saves, s.clean_sheets - g.clean_sheets,
  s.starts - g.starts, s.yellow - g.yellow, s.red - g.red, s.mins - g.mins
from onzio.goalkeeper_season_stats s
cross join lateral (
  select
    coalesce(sum(ms.goals_against), 0)::integer as goals_against,
    coalesce(sum(ms.saves), 0)::integer as saves,
    coalesce(sum(ms.clean_sheets), 0)::integer as clean_sheets,
    (count(*) filter (where ms.starts))::integer as starts,
    coalesce(sum(ms.yellow), 0)::integer as yellow,
    coalesce(sum(ms.red), 0)::integer as red,
    coalesce(sum(ms.mins), 0)::integer as mins
  from onzio.goalkeeper_match_stats ms
  join onzio.matches m on m.club_id = ms.club_id and m.id = ms.match_id
  where ms.club_id = s.club_id
    and ms.player_id = s.player_id
    and m.season_id = s.season_id
) g
where (s.goals_against, s.saves, s.clean_sheets, s.starts, s.yellow, s.red, s.mins)
  is distinct from (g.goals_against, g.saves, g.clean_sheets, g.starts, g.yellow, g.red, g.mins);

comment on table onzio.player_season_adjustments is
  'Numbers added to an outfield player''s season totals by hand, for games never entered game by game. May be negative (2026-11-10, keep today''s numbers). Season totals = sum of player numbers + this row; read them from onzio.player_season_totals.';
comment on table onzio.goalkeeper_season_adjustments is
  'Numbers added to a keeper''s season totals by hand, for games never entered game by game. May be negative (2026-11-10, keep today''s numbers). Season totals = sum of player numbers + this row; read them from onzio.goalkeeper_season_totals.';
comment on view onzio.player_season_totals is
  'An outfield player''s season totals: the sum of their saved player numbers plus their adjustment, never below 0. What visitors see on the roster.';
comment on view onzio.goalkeeper_season_totals is
  'A keeper''s season totals: the sum of their saved player numbers plus their adjustment, never below 0. What visitors see on the roster.';
comment on column onzio.player_match_stats.played is
  'Whether the player took part in the game. Any number above 0 sets it; it can also be set on its own.';
comment on column onzio.goalkeeper_match_stats.played is
  'Whether the keeper took part in the game. Any number above 0 sets it; it can also be set on its own.';
comment on table onzio.player_season_stats is
  'Who is in a season (one row per outfield player and season). Since ADMIN-RE-11c the numbers here are the typed totals as they were on 2026-11-10 and are no longer read; season totals live in onzio.player_season_totals.';
comment on table onzio.goalkeeper_season_stats is
  'Who is in a season (one row per keeper and season). Since ADMIN-RE-11c the numbers here are the typed totals as they were on 2026-11-10 and are no longer read; season totals live in onzio.goalkeeper_season_totals.';

notify pgrst, 'reload schema';
