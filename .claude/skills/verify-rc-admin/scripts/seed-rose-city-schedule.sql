-- Synthetic Rose City 2027 season, roster and schedule for verify-rc-admin (local DB only).
-- Plain text only: no logos, assets, photos or storage objects. Run by seed-local.sh right after
-- a db reset; it fails loudly (and writes nothing) if Rose City already has a season, player or match.
do $seed$
declare
  v_club uuid;
  v_season uuid;
begin
  select id into v_club from onzio.clubs where slug = 'rose-city';
  if v_club is null then raise exception 'seed-rose-city-schedule: club rose-city not found'; end if;
  if exists (select 1 from onzio.seasons where club_id = v_club)
     or exists (select 1 from onzio.players where club_id = v_club)
     or exists (select 1 from onzio.matches where club_id = v_club) then
    raise exception 'seed-rose-city-schedule: Rose City already has seasons, players or matches; refusing to duplicate';
  end if;

  insert into onzio.seasons (club_id, label, start_year, end_year, active)
    values (v_club, '2027', 2027, 2027, true) returning id into v_season;

  insert into onzio.players (club_id, number, name, nationality, position, height, weight, hometown, age, active)
  values
    (v_club, 1,  'Mateo Alvarez',  'USA', 'Goalkeeper', '6''2"', '185 lbs', 'Pasadena, CA',    26, true),
    (v_club, 2,  'Diego Ramos',    'USA', 'Defender',   '5''11"', '170 lbs', 'Alhambra, CA',    24, true),
    (v_club, 4,  'Noah Bennett',   'USA', 'Defender',   '6''0"', '175 lbs', 'Glendale, CA',    27, true),
    (v_club, 5,  'Luis Herrera',   'MEX', 'Defender',   '6''1"', '180 lbs', 'Monterrey, MX',   25, true),
    (v_club, 6,  'Ethan Cole',     'USA', 'Midfielder', '5''9"', '160 lbs', 'Burbank, CA',     23, true),
    (v_club, 8,  'Marco Silva',    'BRA', 'Midfielder', '5''10"', '165 lbs', 'Sao Paulo, BR',   28, true),
    (v_club, 10, 'Jonah Reyes',    'USA', 'Midfielder', '5''8"', '158 lbs', 'Los Angeles, CA', 22, true),
    (v_club, 7,  'Andre Walker',   'USA', 'Forward',    '5''11"', '168 lbs', 'Altadena, CA',    24, true),
    (v_club, 9,  'Tomas Ortega',   'ARG', 'Forward',    '6''0"', '172 lbs', 'Rosario, AR',     29, true),
    (v_club, 11, 'Kai Nakamura',   'USA', 'Forward',    '5''7"', '155 lbs', 'Torrance, CA',    21, true);

  insert into onzio.player_season_stats (club_id, player_id, season_id)
    select club_id, id, v_season from onzio.players where club_id = v_club and position <> 'Goalkeeper';
  insert into onzio.goalkeeper_season_stats (club_id, player_id, season_id)
    select club_id, id, v_season from onzio.players where club_id = v_club and position = 'Goalkeeper';

  insert into onzio.matches (club_id, season_id, date, time, opponent, opponent_short_name, competition, home, venue, city, state, rose_city_score, opponent_score)
  values
    (v_club, v_season, '2027-03-06', '19:00', 'Foothill United',     'FTH', 'UPSL', true,  'Rose City Field',  'Pasadena',    'CA', 2, 1),
    (v_club, v_season, '2027-03-13', '18:30', 'Harbor Athletic',     'HAR', 'UPSL', false, 'Harbor Stadium',   'Long Beach',  'CA', 0, 0),
    (v_club, v_season, '2027-03-27', '19:00', 'Valley Strikers',     'VAL', 'UPSL', true,  'Rose City Field',  'Pasadena',    'CA', null, null),
    (v_club, v_season, '2027-04-10', '17:00', 'Canyon City FC',      'CAN', 'UPSL', false, 'Canyon Park',      'Santa Clarita','CA', null, null),
    (v_club, v_season, '2027-04-24', '19:30', 'Eastside Rovers',     'EAS', 'Friendly', true, 'Rose City Field', 'Pasadena',   'CA', null, null);
end
$seed$;
