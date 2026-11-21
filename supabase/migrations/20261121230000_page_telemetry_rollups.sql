-- TELEMETRY-02: sponsor and engagement events, plus daily rollups (docs/onzio-platform-plan.md,
-- "First-party page telemetry"). Additive on top of 20261121060000_page_telemetry.sql.
--
-- * onzio.page_events                      event_type now allows 'logo_seen', 'click' and 'heartbeat';
--                                           new columns sponsor_id and engaged_ms with their checks
-- * onzio_private.record_page_event        redefined (same signature, grants and wrapper): accepts the
--                                           three new event types with per-type keys and a sponsor filter
-- * onzio.page_daily_totals                per club and club-local day: views, visitors, visits, entries,
--                                           engaged time and the events the abuse limits dropped
-- * onzio.page_daily_breakdowns            per club, day, dimension and value: views, visitors, engaged time
-- * onzio.sponsor_daily_rollups            per club, day and sponsor: logo views, logo viewers, clicks
-- * onzio_private.rollup_page_telemetry    recomputes the last p_days days of all three tables from the raw
--                                           events (security definer); service role only
-- * onzio.rollup_page_telemetry            exposed security-invoker wrapper for the service role
-- * onzio_private.purge_archived_club      redefined: the three rollup tables are purged first
--
-- sweep_page_telemetry is deliberately NOT changed. The rollup tables hold no visitor data (no
-- visitor_hash, visit_id or network data), so like the drop counts they outlive the 90-day raw
-- retention; they are kept indefinitely and only the club purge removes them.
--
-- ROLLBACK NOTES (in this order; nothing here is applied automatically):
--   1. drop function onzio.rollup_page_telemetry(integer);
--      drop function onzio_private.rollup_page_telemetry(integer);
--   2. drop table onzio.sponsor_daily_rollups, onzio.page_daily_breakdowns, onzio.page_daily_totals;
--   3. restore onzio_private.purge_archived_club and onzio_private.record_page_event to their
--      definitions in 20261121060000_page_telemetry.sql (create or replace with that text);
--   4. delete from onzio.page_events where event_type <> 'view';
--      alter table onzio.page_events drop constraint page_events_type,
--        add constraint page_events_type check (event_type in ('view'));
--   5. alter table onzio.page_events drop constraint page_events_engaged,
--        drop constraint page_events_sponsor, drop column engaged_ms, drop column sponsor_id;
--   6. notify pgrst, 'reload schema';

-- 1. page_events: new event types and their columns.
alter table onzio.page_events drop constraint page_events_type;
alter table onzio.page_events
  add constraint page_events_type check (event_type in ('view', 'logo_seen', 'click', 'heartbeat'));

-- No foreign key on sponsor_id: deleting a sponsor must never be blocked by its history, and the
-- rollups keep their numbers after the sponsor is gone.
alter table onzio.page_events
  add column sponsor_id uuid,
  add column engaged_ms integer;

alter table onzio.page_events
  add constraint page_events_sponsor check (
    (event_type in ('logo_seen', 'click')) = (sponsor_id is not null)
  ),
  add constraint page_events_engaged check (
    ((event_type = 'heartbeat') = (engaged_ms is not null))
    and (engaged_ms is null or engaged_ms between 1000 and 60000)
  );

comment on column onzio.page_events.sponsor_id is
  'Sponsor logo seen or clicked (event types logo_seen and click only). No foreign key on purpose.';
comment on column onzio.page_events.engaged_ms is
  'Visible, active time this heartbeat reports, 1000 to 60000 ms (event type heartbeat only).';

-- 2. The writer. Same order as before, with one new step: signature, JSON, freshness, field
-- validation (including the per-type keys), public club, add-on, then the sponsor filter (logo_seen
-- and click keep only sponsors that belong to this club and return 'unknown_sponsor' with nothing
-- written when none remain), then salt and the rate caps. One accepted beacon spends exactly one hit
-- of each applicable cap whatever its type, even when a logo_seen beacon writes several rows.
-- Cap constants, the headroom rule and the in-writer retention are unchanged from P1.
create or replace function onzio_private.record_page_event(
  p_club_id uuid,
  p_payload text,
  p_signature text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_network_limit constant integer := 120;
  c_visitor_limit constant integer := 60;
  c_club_limit constant integer := 1200;
  c_max_payload_bytes constant integer := 8192;
  c_max_skew_ms constant numeric := 300000;
  c_visit_gap constant interval := interval '30 minutes';
  c_retention constant interval := interval '90 days';
  c_retention_batch constant integer := 10000;
  c_sweep_batch constant integer := 5000;
  c_keys constant text[] := array[
    'type', 'visitorMaterial', 'networkMaterial', 'wideNetworkMaterial', 'ts', 'path', 'referrerHost', 'sourceType',
    'utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm',
    'device', 'country', 'city', 'isStaff',
    'sponsorIds', 'sponsorId', 'engagedMs'
  ];
  c_utm constant text := '^[^[:cntrl:]]{1,100}$';
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_now timestamptz := now();
  v_window timestamptz := date_trunc('minute', now());
  v_key bytea;
  v_expected text;
  v_valid boolean := false;
  v_event jsonb;
  v_ts numeric;
  v_type text;
  v_material text;
  v_network text;
  v_wide text;
  v_path text;
  v_referrer_host text;
  v_source_type text;
  v_device text;
  v_country text;
  v_city text;
  v_is_staff boolean;
  v_tz text;
  v_day date;
  v_salt bytea;
  v_hash text;
  v_network_bucket text;
  v_wide_bucket text;
  v_club_hits integer;
  v_hits integer;
  v_drop text;
  v_visit uuid;
  v_entry boolean;
  v_sponsors uuid[];
  v_engaged integer;
  v_engaged_num numeric;
begin
  -- Signature first: an unsigned or mis-signed call is parsed, read and written as nothing.
  if p_club_id is not null and p_payload is not null and p_signature is not null
     and octet_length(p_payload) <= c_max_payload_bytes then
    select k.key into v_key from onzio_private.telemetry_ingest_keys k where k.id = 1;
    if v_key is not null then
      v_expected := encode(
        extensions.hmac(convert_to(p_club_id::text || E'\n' || p_payload, 'UTF8'), v_key, 'sha256'),
        'hex'
      );
      -- Both sides are hashed before comparing, so timing says nothing about the signature.
      v_valid := sha256(convert_to(p_signature, 'UTF8')) = sha256(convert_to(v_expected, 'UTF8'));
    end if;
  end if;
  if not coalesce(v_valid, false) then
    return 'bad_signature';
  end if;

  begin
    v_event := p_payload::jsonb;
  exception
    when invalid_text_representation or untranslatable_character or character_not_in_repertoire then
      raise exception 'INVALID_PAGE_EVENT' using errcode = '22023', detail = 'payload';
  end;
  if jsonb_typeof(v_event) <> 'object' then
    raise exception 'INVALID_PAGE_EVENT' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(v_event) as k(key) where k.key <> all (c_keys)
  ) then
    raise exception 'INVALID_PAGE_EVENT' using errcode = '22023', detail = 'unknown key';
  end if;

  -- Freshness: the route stamps ts (epoch milliseconds) and never shows the signature to a
  -- browser, so a captured call stops working five minutes later.
  if jsonb_typeof(v_event -> 'ts') is distinct from 'number' then
    raise exception 'INVALID_PAGE_EVENT' using errcode = '22023', detail = 'ts';
  end if;
  v_ts := (v_event ->> 'ts')::numeric;
  if abs(extract(epoch from v_now) * 1000 - v_ts) > c_max_skew_ms then
    return 'stale';
  end if;

  v_type := onzio_private.page_event_text(v_event, 'type', '^(view|logo_seen|click|heartbeat)$', true);
  v_material := onzio_private.page_event_text(v_event, 'visitorMaterial', '^[0-9a-f]{64}$', true);
  v_network := onzio_private.page_event_text(v_event, 'networkMaterial', '^[0-9a-f]{64}$', true);
  -- Only IPv6 callers have a wide (/48) network key; for IPv4 the route omits it (null is accepted too).
  v_wide := onzio_private.page_event_text(v_event, 'wideNetworkMaterial', '^[0-9a-f]{64}$', false);
  -- PostgreSQL regex repetition counts stop at 255, so length is checked apart.
  v_path := onzio_private.page_event_text(v_event, 'path', '^/[^[:space:][:cntrl:]]*$', true);
  if char_length(v_path) > 512 or v_path ~ '^/(admin|api)(/|$)' then
    raise exception 'INVALID_PAGE_EVENT' using errcode = '22023', detail = 'path';
  end if;
  v_referrer_host := onzio_private.page_event_text(v_event, 'referrerHost', '^[a-z0-9.-]{1,253}$', false);
  v_source_type := onzio_private.page_event_text(
    v_event, 'sourceType', '^(direct|search|social|referral|campaign|internal)$', true
  );
  v_device := onzio_private.page_event_text(v_event, 'device', '^(mobile|tablet|desktop)$', true);
  v_country := onzio_private.page_event_text(v_event, 'country', '^[A-Z]{2}$', false);
  v_city := onzio_private.page_event_text(v_event, 'city', '^[^[:cntrl:]]{1,80}$', false);
  if jsonb_typeof(v_event -> 'isStaff') is distinct from 'boolean' then
    raise exception 'INVALID_PAGE_EVENT' using errcode = '22023', detail = 'isStaff';
  end if;
  v_is_staff := (v_event ->> 'isStaff')::boolean;

  -- Per-type keys. Each type requires its own key and rejects the other two; "absent" means the
  -- key is not in the payload at all, so a present null is rejected as well.
  if v_type = 'logo_seen' then
    if jsonb_typeof(v_event -> 'sponsorIds') is distinct from 'array'
       or jsonb_array_length(v_event -> 'sponsorIds') not between 1 and 10 then
      raise exception 'INVALID_PAGE_EVENT' using errcode = '22023', detail = 'sponsorIds';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(v_event -> 'sponsorIds') as el(value)
      where jsonb_typeof(el.value) <> 'string' or (el.value #>> '{}') !~* c_uuid
    ) then
      raise exception 'INVALID_PAGE_EVENT' using errcode = '22023', detail = 'sponsorIds';
    end if;
    select array_agg(distinct (el.value #>> '{}')::uuid)
    into v_sponsors
    from jsonb_array_elements(v_event -> 'sponsorIds') as el(value);
    if cardinality(v_sponsors) <> jsonb_array_length(v_event -> 'sponsorIds') then
      raise exception 'INVALID_PAGE_EVENT' using errcode = '22023', detail = 'sponsorIds';
    end if;
  elsif v_event ? 'sponsorIds' then
    raise exception 'INVALID_PAGE_EVENT' using errcode = '22023', detail = 'sponsorIds';
  end if;

  if v_type = 'click' then
    if jsonb_typeof(v_event -> 'sponsorId') is distinct from 'string'
       or (v_event ->> 'sponsorId') !~* c_uuid then
      raise exception 'INVALID_PAGE_EVENT' using errcode = '22023', detail = 'sponsorId';
    end if;
    v_sponsors := array[(v_event ->> 'sponsorId')::uuid];
  elsif v_event ? 'sponsorId' then
    raise exception 'INVALID_PAGE_EVENT' using errcode = '22023', detail = 'sponsorId';
  end if;

  if v_type = 'heartbeat' then
    if jsonb_typeof(v_event -> 'engagedMs') is distinct from 'number' then
      raise exception 'INVALID_PAGE_EVENT' using errcode = '22023', detail = 'engagedMs';
    end if;
    v_engaged_num := (v_event ->> 'engagedMs')::numeric;
    if v_engaged_num <> trunc(v_engaged_num) or v_engaged_num not between 1000 and 60000 then
      raise exception 'INVALID_PAGE_EVENT' using errcode = '22023', detail = 'engagedMs';
    end if;
    v_engaged := v_engaged_num::integer;
  elsif v_event ? 'engagedMs' then
    raise exception 'INVALID_PAGE_EVENT' using errcode = '22023', detail = 'engagedMs';
  end if;

  select club.time_zone
  into v_tz
  from onzio.clubs club
  where club.id = p_club_id
    and club.lifecycle = 'active'
    and club.public_access in ('live', 'grace');
  if not found then
    return 'not_public';
  end if;
  -- The real gate: telemetry is a paid add-on. Checked before any salt, rate
  -- window or event is written, so a club without it leaves no trace.
  if not onzio_private.club_has_addon(p_club_id, 'telemetry') then
    return 'not_entitled';
  end if;

  -- Sponsor filter (logo_seen and click): keep only sponsors that belong to this club. Nothing
  -- remains for a forged or stale id, which writes nothing at all: no salt, rate window, drop
  -- count or event.
  if v_type in ('logo_seen', 'click') then
    select coalesce(array_agg(s.id), '{}'::uuid[])
    into v_sponsors
    from onzio.site_sponsor_logos s
    where s.club_id = p_club_id and s.id = any (v_sponsors);
    if cardinality(v_sponsors) = 0 then
      return 'unknown_sponsor';
    end if;
  end if;
  v_day := (v_now at time zone v_tz)::date;

  select s.salt into v_salt
  from onzio_private.page_visitor_salts s
  where s.club_id = p_club_id and s.salt_day = v_day;
  if not found then
    insert into onzio_private.page_visitor_salts (club_id, salt_day, salt)
    values (
      p_club_id,
      v_day,
      decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex')
    )
    on conflict (club_id, salt_day) do nothing
    returning salt into v_salt;

    if v_salt is null then
      select s.salt into strict v_salt
      from onzio_private.page_visitor_salts s
      where s.club_id = p_club_id and s.salt_day = v_day;
    else
      -- First event of the club's day: forget earlier salts so nobody can
      -- link a visitor across days, then apply raw-event retention.
      delete from onzio_private.page_visitor_salts s
      where s.club_id = p_club_id and s.salt_day < v_day;
      delete from onzio.page_events e
      where e.id in (
        select old.id
        from onzio.page_events old
        where old.club_id = p_club_id
          and old.occurred_at < v_now - c_retention
        order by old.occurred_at
        limit c_retention_batch
      );
    end if;
  end if;

  v_hash := encode(sha256(v_salt || convert_to(v_material, 'UTF8')), 'hex');
  -- The network keys are salted like the visitor hash and stored only in rate windows, under
  -- their own prefixes ('n:' the IPv4 address or IPv6 /64, 'w:' the IPv6 /48), never in page_events.
  v_network_bucket := 'n:' || encode(sha256(v_salt || convert_to(v_network, 'UTF8')), 'hex');
  if v_wide is not null then
    v_wide_bucket := 'w:' || encode(sha256(v_salt || convert_to(v_wide, 'UTF8')), 'hex');
  end if;

  -- What the club has already used of this minute's budget. It decides whether a network over its
  -- 120 floor is still accepted (its own count plus this must stay under 1,320). It is read once,
  -- so concurrent calls can overshoot that headroom share by the number of calls in flight; the
  -- club cap below is atomic and is never overshot.
  v_club_hits := coalesce((
    select w.hits
    from onzio_private.page_event_rate_windows w
    where w.club_id = p_club_id and w.bucket = '*' and w.window_start = v_window
  ), 0);

  -- Exit this block on the first cap that says no, remembering which one; the drop is counted once,
  -- after the block. The block has no exception clause, so it costs no subtransaction.
  <<limits>>
  begin
    -- Cap 1, per network (IPv4 address or IPv6 /64): one machine rotating user agents is still one
    -- network. Headroom share: over c_network_limit it is accepted only while its own count plus the
    -- club's count is under c_club_limit + c_network_limit, so it takes at most half of the club's
    -- remaining headroom, and its counter stops there. A counter that says no is not written
    -- again, so a flood costs reads, not row versions.
    v_hits := null;
    insert into onzio_private.page_event_rate_windows as w (club_id, bucket, window_start, hits)
    values (p_club_id, v_network_bucket, v_window, 1)
    on conflict (club_id, bucket, window_start) do update set hits = w.hits + 1
      where w.hits < c_network_limit
         or w.hits + v_club_hits < c_club_limit + c_network_limit
    returning w.hits into v_hits;
    if v_hits is null then
      v_drop := 'network';
      exit limits;
    end if;

    -- Cap 1b, per IPv6 /48 (IPv6 callers only), same headroom share: one block rotating its /64s
    -- still shares one budget. An event must pass both this and cap 1.
    if v_wide_bucket is not null then
      v_hits := null;
      insert into onzio_private.page_event_rate_windows as w (club_id, bucket, window_start, hits)
      values (p_club_id, v_wide_bucket, v_window, 1)
      on conflict (club_id, bucket, window_start) do update set hits = w.hits + 1
        where w.hits < c_network_limit
           or w.hits + v_club_hits < c_club_limit + c_network_limit
      returning w.hits into v_hits;
      if v_hits is null then
        v_drop := 'network';
        exit limits;
      end if;
    end if;

    -- Cap 2, per visitor.
    v_hits := null;
    insert into onzio_private.page_event_rate_windows as w (club_id, bucket, window_start, hits)
    values (p_club_id, v_hash, v_window, 1)
    on conflict (club_id, bucket, window_start) do update set hits = w.hits + 1
      where w.hits < c_visitor_limit
    returning w.hits into v_hits;
    if v_hits is null then
      v_drop := 'visitor';
      exit limits;
    end if;

    -- Cap 3, club-wide. Only an event that passed every cap above spends this budget.
    v_hits := null;
    insert into onzio_private.page_event_rate_windows as w (club_id, bucket, window_start, hits)
    values (p_club_id, '*', v_window, 1)
    on conflict (club_id, bucket, window_start) do update set hits = w.hits + 1
      where w.hits < c_club_limit
    returning w.hits into v_hits;
    if v_hits is null then
      v_drop := 'club';
      exit limits;
    end if;
  end limits;

  if v_drop is not null then
    -- Counted, not silent: the report can say how many views the abuse limits dropped.
    insert into onzio_private.page_event_drop_counts as d (club_id, local_date, reason, dropped)
    values (p_club_id, v_day, v_drop, 1)
    on conflict (club_id, local_date, reason) do update set dropped = d.dropped + 1;
    return 'rate_limited';
  end if;
  if v_hits = 1 then
    -- A new minute for this club, on accepted traffic: prune its old counters, then run the
    -- bounded global sweep, so clubs that lost the add-on or went quiet are cleaned too.
    delete from onzio_private.page_event_rate_windows old
    where old.club_id = p_club_id and old.window_start < v_window - interval '5 minutes';
    -- Salts older than two UTC days cannot be any club's current day (offsets reach 14 hours).
    delete from onzio_private.page_visitor_salts s
    where s.salt_day < (v_now at time zone 'UTC')::date - 2;
    delete from onzio.page_events e
    where e.id in (
      select old.id
      from onzio.page_events old
      where old.occurred_at < v_now - c_retention
      order by old.occurred_at
      limit c_sweep_batch
      for update skip locked
    );
  end if;

  -- Any event type joins the visitor's open visit; only a view that opens a new visit is an entry.
  select e.visit_id into v_visit
  from onzio.page_events e
  where e.club_id = p_club_id
    and e.visitor_hash = v_hash
    and e.occurred_at > v_now - c_visit_gap
  order by e.occurred_at desc
  limit 1;
  v_entry := v_type = 'view' and v_visit is null;
  v_visit := coalesce(v_visit, gen_random_uuid());

  -- logo_seen writes one row per kept sponsor, all sharing the visit and every other field; the
  -- other types write one row (a null sponsor id for view and heartbeat).
  insert into onzio.page_events (
    club_id, occurred_at, local_date, event_type, visitor_hash, visit_id, is_entry,
    path, referrer_host, source_type,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    device, country, city, is_staff, sponsor_id, engaged_ms
  )
  select
    p_club_id, v_now, v_day, v_type, v_hash, v_visit, v_entry,
    v_path, v_referrer_host, v_source_type,
    onzio_private.page_event_text(v_event, 'utmSource', c_utm, false),
    onzio_private.page_event_text(v_event, 'utmMedium', c_utm, false),
    onzio_private.page_event_text(v_event, 'utmCampaign', c_utm, false),
    onzio_private.page_event_text(v_event, 'utmContent', c_utm, false),
    onzio_private.page_event_text(v_event, 'utmTerm', c_utm, false),
    v_device, v_country, v_city, v_is_staff, sp.id, v_engaged
  from unnest(
    case when v_type in ('logo_seen', 'click') then v_sponsors else array[null::uuid] end
  ) as sp(id);

  return 'recorded';
end;
$$;

revoke all on function onzio_private.record_page_event(uuid, text, text) from public;
grant execute on function onzio_private.record_page_event(uuid, text, text)
  to anon, authenticated;

-- 3. Rollup tables. Kept indefinitely: no visitor ids, so they outlive raw retention. Written only by
-- onzio_private.rollup_page_telemetry (no one has a write grant); staff-club members read their own
-- club through the same policy as page_events.
create table onzio.page_daily_totals (
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  local_date date not null,
  views integer not null default 0 constraint page_daily_totals_views check (views >= 0),
  visitors integer not null default 0 constraint page_daily_totals_visitors check (visitors >= 0),
  visits integer not null default 0 constraint page_daily_totals_visits check (visits >= 0),
  entries integer not null default 0 constraint page_daily_totals_entries check (entries >= 0),
  engaged_ms bigint not null default 0 constraint page_daily_totals_engaged_ms check (engaged_ms >= 0),
  engaged_views integer not null default 0
    constraint page_daily_totals_engaged_views check (engaged_views >= 0),
  dropped integer not null default 0 constraint page_daily_totals_dropped check (dropped >= 0),
  computed_at timestamptz not null default now(),
  primary key (club_id, local_date)
);

create table onzio.page_daily_breakdowns (
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  local_date date not null,
  dimension text not null
    constraint page_daily_breakdowns_dimension check (
      dimension in ('path', 'source', 'device', 'country', 'city', 'referrer', 'utm_campaign', 'utm_source')
    ),
  value text not null
    constraint page_daily_breakdowns_value check (char_length(value) between 1 and 512),
  views integer not null default 0 constraint page_daily_breakdowns_views check (views >= 0),
  visitors integer not null default 0 constraint page_daily_breakdowns_visitors check (visitors >= 0),
  engaged_ms bigint not null default 0 constraint page_daily_breakdowns_engaged_ms check (engaged_ms >= 0),
  primary key (club_id, local_date, dimension, value)
);

-- No foreign key on sponsor_id: a deleted sponsor keeps its history.
create table onzio.sponsor_daily_rollups (
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  local_date date not null,
  sponsor_id uuid not null,
  logo_views integer not null default 0 constraint sponsor_daily_rollups_logo_views check (logo_views >= 0),
  logo_viewers integer not null default 0
    constraint sponsor_daily_rollups_logo_viewers check (logo_viewers >= 0),
  clicks integer not null default 0 constraint sponsor_daily_rollups_clicks check (clicks >= 0),
  primary key (club_id, local_date, sponsor_id)
);

-- Per-sponsor monthly reports read one sponsor across many days.
create index sponsor_daily_rollups_sponsor_idx
  on onzio.sponsor_daily_rollups (club_id, sponsor_id, local_date);

comment on table onzio.page_daily_totals is
  'TELEMETRY-02 daily page totals per club and club-local day, recomputed from raw events by '
  'onzio_private.rollup_page_telemetry. Staff events never count. visitors is a count of that '
  'day''s visitor ids, which are daily by design: never add days up into monthly uniques. Holds '
  'no visitor data, so it is kept indefinitely.';
comment on table onzio.page_daily_breakdowns is
  'TELEMETRY-02 daily views, visitors and engaged time per club, dimension and value. Engaged time '
  'is filed under the dimensions of the page view its heartbeat belongs to. Kept indefinitely.';
comment on table onzio.sponsor_daily_rollups is
  'TELEMETRY-02 daily sponsor logo views, distinct logo viewers and clicks per club and sponsor. '
  'No foreign key to the sponsor list on purpose. Kept indefinitely.';

alter table onzio.page_daily_totals enable row level security;
alter table onzio.page_daily_breakdowns enable row level security;
alter table onzio.sponsor_daily_rollups enable row level security;

revoke all on table onzio.page_daily_totals from public, anon, authenticated, service_role;
revoke all on table onzio.page_daily_breakdowns from public, anon, authenticated, service_role;
revoke all on table onzio.sponsor_daily_rollups from public, anon, authenticated, service_role;
grant select on table onzio.page_daily_totals to authenticated;
grant select on table onzio.page_daily_breakdowns to authenticated;
grant select on table onzio.sponsor_daily_rollups to authenticated;

create policy page_daily_totals_club_staff_read
on onzio.page_daily_totals
for select
to authenticated
using (
  onzio_private.is_club_session_fresh()
  and onzio_private.has_club_role(club_id, array['owner', 'admin'])
);

create policy page_daily_breakdowns_club_staff_read
on onzio.page_daily_breakdowns
for select
to authenticated
using (
  onzio_private.is_club_session_fresh()
  and onzio_private.has_club_role(club_id, array['owner', 'admin'])
);

create policy sponsor_daily_rollups_club_staff_read
on onzio.sponsor_daily_rollups
for select
to authenticated
using (
  onzio_private.is_club_session_fresh()
  and onzio_private.has_club_role(club_id, array['owner', 'admin'])
);

-- 4. The rollup. Recomputes the last p_days club-local days of every club that has raw events or
-- drop counts in that window, deleting and re-inserting each club's rows for the window, so a run
-- is idempotent. The 1..7 cap keeps the window far inside the 90-day raw retention, so it can never
-- rewrite a date whose raw events the sweep may already have removed. Run daily by the cron route
-- as the service role. Staff events (is_staff) never count anywhere.
--
-- visitors counts distinct visitor ids over ALL of the day's non-staff events. Visitor ids are
-- daily by design (a new salt each club-local day), so days must never be summed into monthly uniques.
create function onzio_private.rollup_page_telemetry(
  p_days integer default 3
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_club record;
  v_start date;
  v_today date;
  v_clubs integer := 0;
  v_rows integer := 0;
  v_n integer;
begin
  if p_days is null or p_days not between 1 and 7 then
    raise exception 'INVALID_ROLLUP_WINDOW' using errcode = '22023', detail = coalesce(p_days::text, 'null');
  end if;

  -- One run at a time: two overlapping runs would delete and re-insert the same rows.
  perform pg_advisory_xact_lock(hashtextextended('onzio.rollup_page_telemetry', 0));

  for v_club in
    select c.id, c.time_zone
    from onzio.clubs c
    where exists (
        select 1 from onzio.page_events e
        where e.club_id = c.id
          and e.local_date between (now() at time zone c.time_zone)::date - (p_days - 1)
                               and (now() at time zone c.time_zone)::date
      )
      or exists (
        select 1 from onzio_private.page_event_drop_counts d
        where d.club_id = c.id
          and d.local_date between (now() at time zone c.time_zone)::date - (p_days - 1)
                               and (now() at time zone c.time_zone)::date
      )
  loop
    v_today := (now() at time zone v_club.time_zone)::date;
    v_start := v_today - (p_days - 1);
    v_clubs := v_clubs + 1;

    delete from onzio.page_daily_totals t
    where t.club_id = v_club.id and t.local_date between v_start and v_today;
    delete from onzio.page_daily_breakdowns b
    where b.club_id = v_club.id and b.local_date between v_start and v_today;
    delete from onzio.sponsor_daily_rollups r
    where r.club_id = v_club.id and r.local_date between v_start and v_today;

    insert into onzio.page_daily_totals (
      club_id, local_date, views, visitors, visits, entries, engaged_ms, engaged_views, dropped, computed_at
    )
    with ev as (
      select
        e.local_date,
        count(*) filter (where e.event_type = 'view') as views,
        count(distinct e.visitor_hash) as visitors,
        count(distinct e.visit_id) filter (where e.event_type = 'view') as visits,
        count(*) filter (where e.event_type = 'view' and e.is_entry) as entries,
        coalesce(sum(e.engaged_ms) filter (where e.event_type = 'heartbeat'), 0) as engaged_ms,
        count(distinct e.visit_id) filter (where e.event_type = 'heartbeat') as engaged_views
      from onzio.page_events e
      where e.club_id = v_club.id
        and not e.is_staff
        and e.local_date between v_start and v_today
      group by e.local_date
    ),
    dr as (
      select d.local_date, sum(d.dropped) as dropped
      from onzio_private.page_event_drop_counts d
      where d.club_id = v_club.id
        and d.local_date between v_start and v_today
      group by d.local_date
    )
    select
      v_club.id, local_date,
      coalesce(ev.views, 0), coalesce(ev.visitors, 0), coalesce(ev.visits, 0), coalesce(ev.entries, 0),
      coalesce(ev.engaged_ms, 0), coalesce(ev.engaged_views, 0), coalesce(dr.dropped, 0), now()
    from ev
    full join dr using (local_date);
    get diagnostics v_n = row_count;
    v_rows := v_rows + v_n;

    -- A heartbeat beacon carries no referrer or UTM, so it inherits every dimension value of its
    -- page view: the latest non-staff view of the same club, visit and path at or before it. Without
    -- an earlier view it uses its own fields. Views and heartbeats only; logo_seen and click rows
    -- never appear here.
    insert into onzio.page_daily_breakdowns (
      club_id, local_date, dimension, value, views, visitors, engaged_ms
    )
    with attributed as (
      select
        e.local_date, e.event_type, e.visitor_hash, e.engaged_ms,
        case when pv.found then pv.path else e.path end as path,
        case when pv.found then pv.source_type else e.source_type end as source_type,
        case when pv.found then pv.device else e.device end as device,
        case when pv.found then pv.country else e.country end as country,
        case when pv.found then pv.city else e.city end as city,
        case when pv.found then pv.referrer_host else e.referrer_host end as referrer_host,
        case when pv.found then pv.utm_campaign else e.utm_campaign end as utm_campaign,
        case when pv.found then pv.utm_source else e.utm_source end as utm_source
      from onzio.page_events e
      left join lateral (
        select true as found, v.path, v.source_type, v.device, v.country, v.city,
               v.referrer_host, v.utm_campaign, v.utm_source
        from onzio.page_events v
        where e.event_type = 'heartbeat'
          and v.club_id = e.club_id
          -- A visit belongs to one visitor; matching it lets page_events_club_visitor_idx find the view.
          and v.visitor_hash = e.visitor_hash
          and v.event_type = 'view'
          and not v.is_staff
          and v.visit_id = e.visit_id
          and v.path = e.path
          and v.occurred_at <= e.occurred_at
        order by v.occurred_at desc, v.id desc
        limit 1
      ) pv on true
      where e.club_id = v_club.id
        and not e.is_staff
        and e.event_type in ('view', 'heartbeat')
        and e.local_date between v_start and v_today
    ),
    dims as (
      select a.local_date, d.dimension, d.value, a.event_type, a.visitor_hash, a.engaged_ms
      from attributed a
      cross join lateral (
        values
          ('path', a.path),
          ('source', a.source_type),
          ('device', a.device),
          ('country', coalesce(a.country, 'unknown')),
          ('city', coalesce(a.city, 'unknown')),
          ('referrer', a.referrer_host),
          ('utm_campaign', a.utm_campaign),
          ('utm_source', a.utm_source)
      ) as d(dimension, value)
      where d.value is not null
    )
    select
      v_club.id, x.local_date, x.dimension, x.value,
      count(*) filter (where x.event_type = 'view'),
      count(distinct x.visitor_hash) filter (where x.event_type = 'view'),
      coalesce(sum(x.engaged_ms) filter (where x.event_type = 'heartbeat'), 0)
    from dims x
    group by x.local_date, x.dimension, x.value;
    get diagnostics v_n = row_count;
    v_rows := v_rows + v_n;

    insert into onzio.sponsor_daily_rollups (
      club_id, local_date, sponsor_id, logo_views, logo_viewers, clicks
    )
    select
      v_club.id, e.local_date, e.sponsor_id,
      count(*) filter (where e.event_type = 'logo_seen'),
      count(distinct e.visitor_hash) filter (where e.event_type = 'logo_seen'),
      count(*) filter (where e.event_type = 'click')
    from onzio.page_events e
    where e.club_id = v_club.id
      and not e.is_staff
      and e.sponsor_id is not null
      and e.local_date between v_start and v_today
    group by e.local_date, e.sponsor_id;
    get diagnostics v_n = row_count;
    v_rows := v_rows + v_n;
  end loop;

  return jsonb_build_object('clubs', v_clubs, 'days', p_days, 'rowsWritten', v_rows);
end;
$$;

revoke all on function onzio_private.rollup_page_telemetry(integer)
  from public, anon, authenticated, service_role;
grant execute on function onzio_private.rollup_page_telemetry(integer) to service_role;

create function onzio.rollup_page_telemetry(
  p_days integer default 3
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select onzio_private.rollup_page_telemetry(p_days);
$$;

revoke all on function onzio.rollup_page_telemetry(integer) from public, anon, authenticated;
grant execute on function onzio.rollup_page_telemetry(integer) to service_role;

-- 5. Archived-club hard purge: copied from 20261121060000_page_telemetry.sql unchanged except that the
-- three rollup tables come first in v_order (they are not referenced by any table), before page_events.
-- Same signature, security definer, search_path, lock_timeout and grants.

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
    -- TELEMETRY-02 rollups hold no visitor data and nothing references them.
    'onzio.page_daily_totals',
    'onzio.page_daily_breakdowns',
    'onzio.sponsor_daily_rollups',
    -- TELEMETRY-01 raw page events. Nothing references them.
    'onzio.page_events',
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
