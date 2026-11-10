-- ADMIN-RE-11b: one league table per season, and our row updates itself
-- (docs/admin-portal-redesign-plan.md; design decision 0002; matches.league_game
-- is decision 4). Needs GATE-MIGRATE: it rewrites rows (the backfill) on a live
-- table, which review-bot-supabase.md hands to a person.
--
--   1. onzio.matches.league_game       boolean not null default true
--   2. onzio.league_standings.season_id  backfilled, then not null, with a
--      composite foreign key to seasons, and unique (club_id, season_id, sort_order)
--   3. league_standings.team_name <= 60 characters (decision 7)
--   4. Inserting a standings row without a season puts it in the club's shown
--      season, so classic-admin code deployed before this change keeps saving.
--   5. Inserting a season copies the club's newest table into it at zero
--      ("Start next season").
--   6. onzio.seasons.standings_from_scores: false for every season that exists
--      now, true for every season created after this migration.
--   7. In a season with standings_from_scores = true, saving, editing, clearing
--      or deleting a game recomputes the club's own (is_club) row for that
--      game's season from the club's saved games. In any other season nothing
--      is recomputed and the hand-typed row stays as it is.
--   8. In a season with standings_from_scores = true, a write to the club's own
--      row cannot change its played / won / drawn / lost / goal difference /
--      points: only the recompute can. A Standings page left open from before a
--      score was saved therefore cannot put the old numbers back.
--
-- Backfill: every row goes to its club's shown (active) season, else the club's
-- newest season. A club with table rows and no season at all stops the
-- migration with a plain message (it rolls back whole); nothing guesses a season.
-- Where a club's rows share a sort_order, that club's table is renumbered 0..n-1
-- in its current order before the unique rule is added. The backfill does not
-- touch the numbers: our row keeps what was typed until the first score is saved.
--
-- Typed numbers stay (Christian, 2026-11-09, "Keep typed, new seasons auto"):
-- no live league table changes when this migration applies or when the code
-- deploys. Every existing season gets standings_from_scores = false, so a score
-- saved in it, from the new or the classic admin, leaves its typed our row alone.
-- A season created afterwards, from the Seasons hub or the classic page, or the
-- club's first season, defaults to true and works out our row from its games.
-- The flag is one column on seasons; refresh_club_league_row is the only reader.
--
-- Our row from games: played, won, drawn, lost, goal difference (our goals
-- minus theirs) and points (3 per win, 1 per draw), counting only games with
-- both scores in and league_game = true. It is recomputed from the games, never
-- added to, so an edit or a cleared score cannot drift. Other teams' rows are
-- never touched.
--
-- Rollback (before any club starts a second season; nothing else reads the new
-- pieces): drop the five triggers and their functions below, then the unique and foreign
-- key constraints, team_name check and season_id column on league_standings, then
-- matches.league_game and seasons.standings_from_scores. Old code ignores them.

-- 1. Games: league game or not (friendlies, cups).
alter table onzio.matches
  add column league_game boolean not null default true;

-- 6a. Which seasons work out our row from saved scores. Every season that
-- exists now keeps its typed row (false); the default flips to true after, so
-- seasons created from here on work it out. A constant default: no table rewrite.
alter table onzio.seasons
  add column standings_from_scores boolean not null default false;
alter table onzio.seasons
  alter column standings_from_scores set default true;

-- 2. League table per season.
alter table onzio.league_standings
  add column season_id uuid;

update onzio.league_standings l
set season_id = pick.id
from (
  select distinct on (s.club_id) s.club_id, s.id
  from onzio.seasons s
  order by s.club_id, s.active desc, s.start_year desc, s.end_year desc, s.created_at desc, s.id
) pick
where l.club_id = pick.club_id
  and l.season_id is null;

do $$
begin
  if exists (select 1 from onzio.league_standings where season_id is null) then
    raise exception 'ADMIN-RE-11b: a club has league table rows but no season; add that club''s season first'
      using errcode = '23502';
  end if;
  if exists (select 1 from onzio.league_standings where char_length(team_name) > 60) then
    raise exception 'ADMIN-RE-11b: a league table team name is over 60 characters; shorten it first'
      using errcode = '23514';
  end if;
end;
$$;

with duplicated as (
  select club_id, season_id
  from onzio.league_standings
  group by club_id, season_id
  having count(*) <> count(distinct sort_order)
),
ranked as (
  select l.id,
    (row_number() over (
      partition by l.club_id, l.season_id
      order by l.sort_order, l.created_at, l.id
    ) - 1)::int as new_order
  from onzio.league_standings l
  join duplicated d on d.club_id = l.club_id and d.season_id = l.season_id
)
update onzio.league_standings l
set sort_order = ranked.new_order
from ranked
where l.id = ranked.id;

alter table onzio.league_standings
  alter column season_id set not null,
  add constraint league_standings_season_fk
    foreign key (club_id, season_id)
    references onzio.seasons (club_id, id) on delete cascade,
  -- Deferred so one save can swap or shift several rows' order.
  add constraint league_standings_club_season_sort_order_key
    unique (club_id, season_id, sort_order) deferrable initially deferred,
  add constraint league_standings_team_name_length
    check (char_length(team_name) <= 60);

-- 4. A row saved without a season goes to the club's shown season, else its
-- newest. Code deployed before this migration, and the import scripts, insert
-- without season_id.
create or replace function onzio_private.default_league_standings_season()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.season_id is null then
    select s.id
    into new.season_id
    from onzio.seasons s
    where s.club_id = new.club_id
    order by s.active desc, s.start_year desc, s.end_year desc, s.created_at desc, s.id
    limit 1;
    if new.season_id is null then
      raise exception 'Add a season before adding a league table.'
        using errcode = '23502', column = 'season_id', table = 'league_standings';
    end if;
  end if;
  return new;
end;
$$;

create trigger default_league_standings_season
before insert on onzio.league_standings
for each row execute function onzio_private.default_league_standings_season();

-- 5. Start next season: a new season starts with the club's newest table at zero.
create or replace function onzio_private.copy_league_standings_into_new_season()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_season uuid;
begin
  select s.id
  into source_season
  from onzio.seasons s
  where s.club_id = new.club_id
    and s.id <> new.id
    and exists (
      select 1
      from onzio.league_standings l
      where l.club_id = s.club_id and l.season_id = s.id
    )
  order by s.start_year desc, s.end_year desc, s.created_at desc, s.id
  limit 1;

  if source_season is not null then
    insert into onzio.league_standings (
      club_id, season_id, team_name, team_abbreviation, logo_url, logo_asset_id,
      is_club, sort_order
    )
    select
      l.club_id, new.id, l.team_name, l.team_abbreviation, l.logo_url, l.logo_asset_id,
      l.is_club, l.sort_order
    from onzio.league_standings l
    where l.club_id = new.club_id and l.season_id = source_season;
  end if;
  return null;
end;
$$;

create trigger copy_league_standings_into_new_season
after insert on onzio.seasons
for each row execute function onzio_private.copy_league_standings_into_new_season();

-- 6. Our row from the club's games for one season. Locks our row first so two
-- scores saved at the same moment cannot each total the games without the
-- other (the second waits, then totals with the first one committed).
create or replace function onzio_private.refresh_club_league_row(p_club_id uuid, p_season_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only seasons that work out our row from scores. A season whose row was
  -- typed by hand (every season that existed before this migration) is left as it is.
  if not exists (
    select 1
    from onzio.seasons s
    where s.club_id = p_club_id and s.id = p_season_id and s.standings_from_scores
  ) then
    return;
  end if;

  perform 1
  from onzio.league_standings l
  where l.club_id = p_club_id and l.season_id = p_season_id and l.is_club
  for update;
  if not found then
    return;
  end if;

  perform set_config('onzio.league_refresh', 'on', true);
  update onzio.league_standings l
  set played = t.played,
      wins = t.wins,
      draws = t.draws,
      losses = t.losses,
      goal_difference = t.goal_difference,
      points = t.wins * 3 + t.draws
  from (
    select
      count(*)::int as played,
      (count(*) filter (where m.rose_city_score > m.opponent_score))::int as wins,
      (count(*) filter (where m.rose_city_score = m.opponent_score))::int as draws,
      (count(*) filter (where m.rose_city_score < m.opponent_score))::int as losses,
      coalesce(sum(m.rose_city_score - m.opponent_score), 0)::int as goal_difference
    from onzio.matches m
    where m.club_id = p_club_id
      and m.season_id = p_season_id
      and m.league_game
      and m.rose_city_score is not null
      and m.opponent_score is not null
  ) t
  where l.club_id = p_club_id
    and l.season_id = p_season_id
    and l.is_club
    and (l.played, l.wins, l.draws, l.losses, l.goal_difference, l.points)
      is distinct from (t.played, t.wins, t.draws, t.losses, t.goal_difference, t.wins * 3 + t.draws);
  perform set_config('onzio.league_refresh', 'off', true);
end;
$$;

create or replace function onzio_private.refresh_league_row_after_game()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform onzio_private.refresh_club_league_row(old.club_id, old.season_id);
  elsif tg_op = 'INSERT' then
    perform onzio_private.refresh_club_league_row(new.club_id, new.season_id);
  else
    if old.club_id = new.club_id and old.season_id <> new.season_id then
      -- Lower id first so two moves in opposite directions cannot deadlock.
      perform onzio_private.refresh_club_league_row(old.club_id, least(old.season_id, new.season_id));
      perform onzio_private.refresh_club_league_row(old.club_id, greatest(old.season_id, new.season_id));
    else
      perform onzio_private.refresh_club_league_row(new.club_id, new.season_id);
    end if;
  end if;
  return null;
end;
$$;

create trigger refresh_league_row_after_game
after insert or delete or update of season_id, league_game, rose_city_score, opponent_score
on onzio.matches
for each row execute function onzio_private.refresh_league_row_after_game();

-- 8. Our row's numbers in a season that works them out belong to the recompute.
-- Anything else writing them (a Standings page saved from an old snapshot, the
-- classic page, a script) keeps the stored numbers; every other column of the
-- row, and every other row, is written as sent. The recompute marks its own
-- transaction, so it is the one writer that gets through. Marking a different
-- team as ours, or unmarking ours, passes through unchanged.
create or replace function onzio_private.keep_computed_league_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('onzio.league_refresh', true), 'off') <> 'on'
     and old.is_club
     and new.is_club
     and exists (
       select 1
       from onzio.seasons s
       where s.club_id = old.club_id and s.id = old.season_id and s.standings_from_scores
     )
  then
    new.played := old.played;
    new.wins := old.wins;
    new.draws := old.draws;
    new.losses := old.losses;
    new.goal_difference := old.goal_difference;
    new.points := old.points;
  end if;
  return new;
end;
$$;

create trigger keep_computed_league_row
before update on onzio.league_standings
for each row execute function onzio_private.keep_computed_league_row();

revoke all on function onzio_private.default_league_standings_season() from public;
revoke all on function onzio_private.keep_computed_league_row() from public;
revoke all on function onzio_private.copy_league_standings_into_new_season() from public;
revoke all on function onzio_private.refresh_club_league_row(uuid, uuid) from public;
revoke all on function onzio_private.refresh_league_row_after_game() from public;

comment on column onzio.seasons.standings_from_scores is
  'True when the season''s league table works out the club''s own row from its saved league games. False (hand-typed) for seasons that existed before ADMIN-RE-11b; true for seasons created after.';
comment on column onzio.matches.league_game is
  'False for friendlies and cups: the game never touches the league table. Defaults to true.';
comment on column onzio.league_standings.season_id is
  'The season this table row belongs to. Every season has its own table; starting a season copies the teams at zero.';
