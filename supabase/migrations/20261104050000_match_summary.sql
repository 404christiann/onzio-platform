-- RC2027-MATCH-SUMMARY: optional per-match summary for the cinematic@2 Match Summary page
-- (timeline, statistics, officials, kit colors, lineups). Mirrors lib/match-summary.ts.
-- Null means no summary; every existing match is unaffected.
-- Each check confirms a value's type before reading inside it, because SQL does not promise to
-- evaluate AND/OR left to right.

-- An object with exactly these string keys, each within its length limit.
create function onzio_private.match_summary_strings(v jsonb, keys text[], limits int[]) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
begin
  if jsonb_typeof(v) is distinct from 'object' then return false; end if;
  if exists(select 1 from jsonb_object_keys(v) k where not k=any(keys)) or not v ?& keys then return false; end if;
  return not exists(select 1 from generate_subscripts(keys,1) i where jsonb_typeof(v->keys[i]) is distinct from 'string' or length(v->>keys[i])>limits[i]);
end $$;

create function onzio_private.match_summary_list(v jsonb, maximum int) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
begin
  if jsonb_typeof(v) is distinct from 'array' then return false; end if;
  return jsonb_array_length(v)<=maximum;
end $$;

create function onzio_private.match_summary_lineup_is_valid(v jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare item jsonb;
begin
  if jsonb_typeof(v) is distinct from 'object' then return false; end if;
  if exists(select 1 from jsonb_object_keys(v) k where k not in ('starting','bench','staff')) or not v ?& array['starting','bench','staff'] then return false; end if;
  if not onzio_private.match_summary_list(v->'starting',15) or not onzio_private.match_summary_list(v->'bench',15)
    or not onzio_private.match_summary_list(v->'staff',10) then return false; end if;
  for item in select * from jsonb_array_elements(v->'starting') union all select * from jsonb_array_elements(v->'bench') loop
    if not onzio_private.match_summary_strings(item,array['number','name'],array[3,60]) then return false; end if;
    if (item->>'number')!~'^[0-9]{0,3}$' then return false; end if;
  end loop;
  for item in select * from jsonb_array_elements(v->'staff') loop
    if not onzio_private.match_summary_strings(item,array['name','role'],array[60,40]) then return false; end if;
  end loop;
  return true;
end $$;

create function onzio_private.match_summary_is_valid(s jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare item jsonb;
begin
  if jsonb_typeof(s) is distinct from 'object' then return false; end if;
  if exists(select 1 from jsonb_object_keys(s) k where k not in ('events','stats','officials','kit','lineups'))
    or not s ?& array['events','stats','officials','kit','lineups'] then return false; end if;
  if not onzio_private.match_summary_list(s->'events',60) or not onzio_private.match_summary_list(s->'stats',24)
    or not onzio_private.match_summary_list(s->'officials',8) or not onzio_private.match_summary_list(s->'kit',6) then return false; end if;
  for item in select * from jsonb_array_elements(s->'events') loop
    if not onzio_private.match_summary_strings(item,array['minute','side','kind','player','detail'],array[12,8,6,80,80]) then return false; end if;
    if item->>'side' not in ('club','opponent') or item->>'kind' not in ('goal','yellow','red','sub') then return false; end if;
  end loop;
  for item in select * from jsonb_array_elements(s->'stats') loop
    if jsonb_typeof(item) is distinct from 'object' then return false; end if;
    if exists(select 1 from jsonb_object_keys(item) k where k not in ('label','club','opponent')) or not item ?& array['label','club','opponent'] then return false; end if;
    if jsonb_typeof(item->'label') is distinct from 'string' or length(item->>'label')>40
      or jsonb_typeof(item->'club') is distinct from 'number' or jsonb_typeof(item->'opponent') is distinct from 'number' then return false; end if;
    if (item->>'club')::numeric not between 0 and 100000 or (item->>'opponent')::numeric not between 0 and 100000 then return false; end if;
  end loop;
  for item in select * from jsonb_array_elements(s->'officials') loop
    if not onzio_private.match_summary_strings(item,array['role','name'],array[40,60]) then return false; end if;
  end loop;
  for item in select * from jsonb_array_elements(s->'kit') loop
    if not onzio_private.match_summary_strings(item,array['item','color'],array[20,30]) then return false; end if;
  end loop;
  if jsonb_typeof(s->'lineups') is distinct from 'object' then return false; end if;
  if exists(select 1 from jsonb_object_keys(s->'lineups') k where k not in ('club','opponent')) or not s->'lineups' ?& array['club','opponent'] then return false; end if;
  if not onzio_private.match_summary_lineup_is_valid(s#>'{lineups,club}') then return false; end if;
  return onzio_private.match_summary_lineup_is_valid(s#>'{lineups,opponent}');
end $$;

revoke all on function onzio_private.match_summary_strings(jsonb,text[],int[]) from public,anon;
revoke all on function onzio_private.match_summary_list(jsonb,int) from public,anon;
revoke all on function onzio_private.match_summary_lineup_is_valid(jsonb) from public,anon;
revoke all on function onzio_private.match_summary_is_valid(jsonb) from public,anon;
grant execute on function onzio_private.match_summary_strings(jsonb,text[],int[]) to authenticated,service_role;
grant execute on function onzio_private.match_summary_list(jsonb,int) to authenticated,service_role;
grant execute on function onzio_private.match_summary_lineup_is_valid(jsonb) to authenticated,service_role;
grant execute on function onzio_private.match_summary_is_valid(jsonb) to authenticated,service_role;

alter table onzio.matches
  add column summary jsonb,
  add constraint matches_summary_check check (summary is null or onzio_private.match_summary_is_valid(summary));

comment on column onzio.matches.summary is
  'Owner-edited Match Summary (timeline, statistics, officials, kit colors, lineups); see lib/match-summary.ts.';

notify pgrst, 'reload schema';
