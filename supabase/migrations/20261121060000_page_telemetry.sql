-- TELEMETRY-01 P1: first-party page telemetry (docs/onzio-platform-plan.md,
-- "First-party page telemetry").
--
-- * onzio.page_events                     one row per accepted beacon event; no IP, user agent,
--                                          user id or full referrer is ever stored
-- * onzio_private.page_visitor_salts       one random salt per club per club-local day
-- * onzio_private.page_event_rate_windows  per-minute rate-limit counters (club, network, wide network, visitor)
-- * onzio_private.page_event_drop_counts   how many events the abuse limits dropped per club, local day and
--                                          reason; holds no visitor data, so it outlives the add-on
-- * onzio_private.telemetry_ingest_keys    the single HMAC key that signs every beacon write;
--                                          generated here, so it is never in the repository
-- * onzio_private.club_addons            per-club paid add-ons; empty, so telemetry starts OFF everywhere
-- * onzio_private.club_has_addon         the single reader of club_addons (security definer)
-- * onzio.club_has_addon                 exposed security-invoker wrapper (early-skip optimisation only)
-- * onzio_private.forget_telemetry_when_addon_removed
--                                          trigger: removing a club's telemetry add-on deletes its salts
-- * onzio_private.record_page_event        the ONLY writer of page events (security definer); takes the
--                                          exact payload text the route signed, rejects anything unsigned
--                                          or stale, and drops events for clubs without the add-on
-- * onzio.record_page_event                exposed security-invoker wrapper for the anon beacon
-- * onzio_private.sweep_page_telemetry     the daily retention sweep for ALL clubs (security definer), so
--                                          retention never depends on traffic; service role only
-- * onzio.sweep_page_telemetry             exposed security-invoker wrapper for the retention cron
-- * onzio_private.purge_archived_club      redefined with onzio.page_events in its delete order
--
-- Additive only: no drops, renames, or data changes to existing tables.

-- Supabase installs pgcrypto in the extensions schema; this is a no-op there and a
-- loud failure elsewhere (the key below and the signature check both need it).
create extension if not exists pgcrypto with schema extensions;

create table onzio.page_events (
  id bigint generated always as identity primary key,
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  local_date date not null,
  event_type text not null
    constraint page_events_type check (event_type in ('view')),
  visitor_hash text not null
    constraint page_events_visitor_hash check (visitor_hash ~ '^[0-9a-f]{64}$'),
  visit_id uuid not null,
  is_entry boolean not null,
  path text not null
    constraint page_events_path check (
      char_length(path) <= 512
      and path ~ '^/[^[:space:][:cntrl:]]*$'
      and path !~ '^/(admin|api)(/|$)'
    ),
  referrer_host text
    constraint page_events_referrer_host check (referrer_host ~ '^[a-z0-9.-]{1,253}$'),
  source_type text not null
    constraint page_events_source_type check (
      source_type in ('direct', 'search', 'social', 'referral', 'campaign', 'internal')
    ),
  utm_source text constraint page_events_utm_source check (utm_source ~ '^[^[:cntrl:]]{1,100}$'),
  utm_medium text constraint page_events_utm_medium check (utm_medium ~ '^[^[:cntrl:]]{1,100}$'),
  utm_campaign text constraint page_events_utm_campaign check (utm_campaign ~ '^[^[:cntrl:]]{1,100}$'),
  utm_content text constraint page_events_utm_content check (utm_content ~ '^[^[:cntrl:]]{1,100}$'),
  utm_term text constraint page_events_utm_term check (utm_term ~ '^[^[:cntrl:]]{1,100}$'),
  device text not null
    constraint page_events_device check (device in ('mobile', 'tablet', 'desktop')),
  country text constraint page_events_country check (country ~ '^[A-Z]{2}$'),
  city text constraint page_events_city check (city ~ '^[^[:cntrl:]]{1,80}$'),
  is_staff boolean not null default false
);

create index page_events_club_occurred_idx
  on onzio.page_events (club_id, occurred_at);
create index page_events_club_visitor_idx
  on onzio.page_events (club_id, visitor_hash, occurred_at desc);
-- The global retention sweep deletes the oldest expired rows of any club.
create index page_events_occurred_idx
  on onzio.page_events (occurred_at);

comment on table onzio.page_events is
  'TELEMETRY-01 raw page events, kept 90 days. Written only by onzio_private.record_page_event. '
  'Holds no IP address, user agent, user id or full referrer URL.';

alter table onzio.page_events enable row level security;

revoke all on table onzio.page_events from public, anon, authenticated, service_role;
grant select on table onzio.page_events to authenticated;

create policy page_events_club_staff_read
on onzio.page_events
for select
to authenticated
using (
  onzio_private.is_club_session_fresh()
  and onzio_private.has_club_role(club_id, array['owner', 'admin'])
);

create table onzio_private.page_visitor_salts (
  club_id uuid not null references onzio.clubs(id) on delete cascade,
  salt_day date not null,
  salt bytea not null constraint page_visitor_salts_length check (octet_length(salt) = 32),
  created_at timestamptz not null default now(),
  primary key (club_id, salt_day)
);

create table onzio_private.page_event_rate_windows (
  club_id uuid not null references onzio.clubs(id) on delete cascade,
  -- '*' is the club-wide counter; a bare 64-hex bucket is a salted visitor hash;
  -- 'n:' + 64 hex is a salted network hash (an IPv4 address or an IPv6 /64) and
  -- 'w:' + 64 hex a salted wide network hash (an IPv6 /48). The prefixes keep the kinds apart.
  bucket text not null
    constraint page_event_rate_windows_bucket check (bucket = '*' or bucket ~ '^([nw]:)?[0-9a-f]{64}$'),
  window_start timestamptz not null,
  hits integer not null constraint page_event_rate_windows_hits check (hits > 0),
  primary key (club_id, bucket, window_start)
);

-- Events the abuse limits dropped, by the club's own day and the limit that dropped them, so a
-- report can say how many views were dropped instead of silently undercounting. A count holds
-- no visitor, network or event data, so removing the add-on does not clear it; the retention
-- sweep deletes it after 90 days and the club purge cascades it. A dropped event touches this
-- one row per (club, day, reason), so the table keeps spare room on each page for HOT updates.
create table onzio_private.page_event_drop_counts (
  club_id uuid not null references onzio.clubs(id) on delete cascade,
  local_date date not null,
  reason text not null
    constraint page_event_drop_counts_reason check (reason in ('network', 'visitor', 'club')),
  dropped integer not null constraint page_event_drop_counts_dropped check (dropped > 0),
  primary key (club_id, local_date, reason)
) with (fillfactor = 50);

alter table onzio_private.page_event_drop_counts enable row level security;

revoke all on table onzio_private.page_visitor_salts from public, anon, authenticated, service_role;
revoke all on table onzio_private.page_event_rate_windows from public, anon, authenticated, service_role;
revoke all on table onzio_private.page_event_drop_counts from public, anon, authenticated, service_role;

comment on table onzio_private.page_event_drop_counts is
  'TELEMETRY-01 events dropped by the abuse limits (network, visitor, club) per club and club-local day. '
  'Holds no visitor data; deleted after 90 days by onzio_private.sweep_page_telemetry.';

-- The key that signs every beacon write. One row, random, created here and read
-- once by an operator (select encode(key, 'hex') ...) to set TELEMETRY_INGEST_SECRET
-- in Vercel. Without a valid signature record_page_event writes nothing, so the
-- anon key alone (which is public) cannot forge events. Rotate by updating this
-- row and the env var together, then redeploying.
create table onzio_private.telemetry_ingest_keys (
  id smallint primary key default 1
    constraint telemetry_ingest_keys_single_row check (id = 1),
  key bytea not null
    constraint telemetry_ingest_keys_length check (octet_length(key) = 32),
  created_at timestamptz not null default now()
);

alter table onzio_private.telemetry_ingest_keys enable row level security;
revoke all on table onzio_private.telemetry_ingest_keys from public, anon, authenticated, service_role;

insert into onzio_private.telemetry_ingest_keys (key) values (extensions.gen_random_bytes(32));

comment on table onzio_private.telemetry_ingest_keys is
  'TELEMETRY-01 HMAC key for signed beacon writes. One row, never granted to any API role, never in the repository.';

-- Paid add-ons granted per club by an operator. A row means the add-on is on;
-- no row means off. The migration grants nothing, so every club starts off.
-- This is not a tier: PLAT-102's tier-free rule stands, and the RLS feature
-- wrappers (can_read_feature, can_mutate_feature) still ignore features.
create table onzio_private.club_addons (
  club_id uuid not null references onzio.clubs(id) on delete cascade,
  addon text not null constraint club_addons_known check (addon in ('telemetry')),
  granted_at timestamptz not null default now(),
  primary key (club_id, addon)
);

revoke all on table onzio_private.club_addons from public, anon, authenticated, service_role;

comment on table onzio_private.club_addons is
  'TELEMETRY-01 per-club paid add-ons. Read only through onzio_private.club_has_addon; '
  'written only by audited operator SQL.';

-- Removing a club's telemetry add-on forgets its daily salts and rate counters at once, so a
-- club that stops paying (or is suspended and then revoked) keeps nothing that can link
-- visitors. Its raw events are still deleted by the 90-day retention sweeps (the one inside
-- record_page_event and the daily onzio_private.sweep_page_telemetry cron).
create function onzio_private.forget_telemetry_when_addon_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.addon = 'telemetry' then
    delete from onzio_private.page_visitor_salts s where s.club_id = old.club_id;
    delete from onzio_private.page_event_rate_windows w where w.club_id = old.club_id;
  end if;
  return old;
end;
$$;

revoke all on function onzio_private.forget_telemetry_when_addon_removed()
  from public, anon, authenticated, service_role;

create trigger club_addons_forget_telemetry
after delete on onzio_private.club_addons
for each row execute function onzio_private.forget_telemetry_when_addon_removed();

-- The single reader of club_addons. Unknown add-on names raise instead of
-- returning false, so this can never become a silent content gate.
create function onzio_private.club_has_addon(
  p_club_id uuid,
  p_addon text
) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_addon is null or p_addon not in ('telemetry') then
    raise exception 'UNKNOWN_CLUB_ADDON' using errcode = '22023', detail = coalesce(p_addon, 'null');
  end if;
  return exists (
    select 1
    from onzio_private.club_addons addon
    where addon.club_id = p_club_id
      and addon.addon = p_addon
  );
end;
$$;

revoke all on function onzio_private.club_has_addon(uuid, text) from public;
grant execute on function onzio_private.club_has_addon(uuid, text)
  to anon, authenticated, service_role;

-- Exposed so the beacon route and the club layout can skip early. That is only
-- an optimisation; record_page_event enforces the add-on itself.
create function onzio.club_has_addon(
  p_club_id uuid,
  p_addon text
) returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select onzio_private.club_has_addon(p_club_id, p_addon);
$$;

revoke all on function onzio.club_has_addon(uuid, text) from public;
grant execute on function onzio.club_has_addon(uuid, text) to anon, authenticated, service_role;

-- Strict reader for one optional/required string field of the event payload.
create function onzio_private.page_event_text(
  p_event jsonb,
  p_key text,
  p_pattern text,
  p_required boolean
) returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value jsonb := p_event -> p_key;
begin
  if v_value is null or jsonb_typeof(v_value) = 'null' then
    if p_required then
      raise exception 'INVALID_PAGE_EVENT' using errcode = '22023', detail = p_key;
    end if;
    return null;
  end if;
  if jsonb_typeof(v_value) <> 'string' or (v_value #>> '{}') !~ p_pattern then
    raise exception 'INVALID_PAGE_EVENT' using errcode = '22023', detail = p_key;
  end if;
  return v_value #>> '{}';
end;
$$;

revoke all on function onzio_private.page_event_text(jsonb, text, text, boolean)
  from public, anon, authenticated, service_role;

-- The writer. It receives the event as the exact text the route signed, in this order:
-- signature, JSON, freshness, field validation, public club, add-on, then salt and the
-- rate caps (network, wide network, visitor, club). Nothing before the add-on gate writes
-- anything, and an event rejected by a network or visitor cap never spends club-wide budget.
--
-- Headroom share: a network (an IPv4 address or IPv6 /64, and for IPv6 also its /48) is entitled to
-- 120 events a minute. Over that, an event is still accepted only while the network's own count
-- plus the club's count stays under c_club_limit + c_network_limit (1,320), so a network can take
-- at most half of the club's remaining headroom. Alone on a quiet club, a stadium's shared Wi-Fi
-- records 660 a minute. When the rest of the club has already used y events, it is held to about
-- (1,320 - y) / 2, a share that shrinks smoothly to the 120 floor as y reaches 1,080, while other
-- networks keep the room that is left up to the club cap. So a busy shared network is not cut
-- back to 120 in the middle of a match day, and one network (or one /48 rotating /64s) can never
-- take all of the club budget. Every limited event is counted per club, local day and reason.
create function onzio_private.record_page_event(
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
    'device', 'country', 'city', 'isStaff'
  ];
  c_utm constant text := '^[^[:cntrl:]]{1,100}$';
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

  v_type := onzio_private.page_event_text(v_event, 'type', '^view$', true);
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

  select e.visit_id into v_visit
  from onzio.page_events e
  where e.club_id = p_club_id
    and e.visitor_hash = v_hash
    and e.occurred_at > v_now - c_visit_gap
  order by e.occurred_at desc
  limit 1;

  insert into onzio.page_events (
    club_id, occurred_at, local_date, event_type, visitor_hash, visit_id, is_entry,
    path, referrer_host, source_type,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    device, country, city, is_staff
  ) values (
    p_club_id, v_now, v_day, v_type, v_hash, coalesce(v_visit, gen_random_uuid()), v_visit is null,
    v_path, v_referrer_host, v_source_type,
    onzio_private.page_event_text(v_event, 'utmSource', c_utm, false),
    onzio_private.page_event_text(v_event, 'utmMedium', c_utm, false),
    onzio_private.page_event_text(v_event, 'utmCampaign', c_utm, false),
    onzio_private.page_event_text(v_event, 'utmContent', c_utm, false),
    onzio_private.page_event_text(v_event, 'utmTerm', c_utm, false),
    v_device, v_country, v_city, v_is_staff
  );

  return 'recorded';
end;
$$;

revoke all on function onzio_private.record_page_event(uuid, text, text) from public;
grant execute on function onzio_private.record_page_event(uuid, text, text)
  to anon, authenticated;

-- Callable by the public anon key, which is harmless: the definer rejects any call whose
-- signature does not match, so only the beacon route (which holds the key) can write.
create function onzio.record_page_event(
  p_club_id uuid,
  p_payload text,
  p_signature text
) returns text
language sql
security invoker
set search_path = ''
as $$
  select onzio_private.record_page_event(p_club_id, p_payload, p_signature);
$$;

revoke all on function onzio.record_page_event(uuid, text, text) from public;
grant execute on function onzio.record_page_event(uuid, text, text) to anon, authenticated;

-- The daily retention sweep, for every club, run by /api/cron/telemetry-retention as the service role.
-- record_page_event also sweeps, but only when some club has accepted traffic, so a club that drops
-- the add-on (or every club going quiet) would otherwise keep raw events past 90 days. This one never
-- depends on traffic. Same grant pattern as onzio.media_orphan_sweep_scan: a private definer that only
-- the service role may execute, behind an exposed security-invoker wrapper.
--
-- Deletes, for ALL clubs: salts older than two UTC days (no club's current local day can be that old);
-- rate-limit windows older than an hour; raw events older than 90 days, oldest first, in batches of
-- 5,000 and never more than p_max_events in one call; and drop counts older than 90 days.
-- Returns what it deleted per table and whether expired events remain for the next run.
create function onzio_private.sweep_page_telemetry(
  p_max_events integer default 100000
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_batch constant integer := 5000;
  c_retention constant interval := interval '90 days';
  v_now timestamptz := now();
  v_utc_today date := (now() at time zone 'UTC')::date;
  v_batch integer;
  v_events integer := 0;
  v_salts integer;
  v_windows integer;
  v_drops integer;
  v_more boolean;
begin
  if p_max_events is null or p_max_events < 0 then
    raise exception 'INVALID_SWEEP_LIMIT' using errcode = '22023', detail = coalesce(p_max_events::text, 'null');
  end if;

  delete from onzio_private.page_visitor_salts s
  where s.salt_day < v_utc_today - 2;
  get diagnostics v_salts = row_count;

  delete from onzio_private.page_event_rate_windows w
  where w.window_start < v_now - interval '1 hour';
  get diagnostics v_windows = row_count;

  -- local_date is the club's own day, which is within a day of the UTC date.
  delete from onzio_private.page_event_drop_counts d
  where d.local_date < v_utc_today - 90;
  get diagnostics v_drops = row_count;

  -- Bounded: each pass deletes at most the batch size or what is left of p_max_events, and the loop
  -- ends when a pass deletes nothing. Rows locked by a concurrent writer are skipped, not waited for.
  while v_events < p_max_events loop
    delete from onzio.page_events e
    where e.id in (
      select old.id
      from onzio.page_events old
      where old.occurred_at < v_now - c_retention
      order by old.occurred_at
      limit least(c_batch, p_max_events - v_events)
      for update skip locked
    );
    get diagnostics v_batch = row_count;
    exit when v_batch = 0;
    v_events := v_events + v_batch;
  end loop;

  v_more := exists (
    select 1 from onzio.page_events e where e.occurred_at < v_now - c_retention
  );

  return jsonb_build_object(
    'maxEvents', p_max_events,
    'eventsDeleted', v_events,
    'saltsDeleted', v_salts,
    'rateWindowsDeleted', v_windows,
    'dropCountsDeleted', v_drops,
    'moreEventsRemain', v_more
  );
end;
$$;

revoke all on function onzio_private.sweep_page_telemetry(integer)
  from public, anon, authenticated, service_role;
grant execute on function onzio_private.sweep_page_telemetry(integer) to service_role;

create function onzio.sweep_page_telemetry(
  p_max_events integer default 100000
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select onzio_private.sweep_page_telemetry(p_max_events);
$$;

revoke all on function onzio.sweep_page_telemetry(integer) from public, anon, authenticated;
grant execute on function onzio.sweep_page_telemetry(integer) to service_role;

-- Archived-club hard purge: copied from 20261117020000_cinematic_purge_tables.sql unchanged except that
-- onzio.page_events is first in v_order (nothing references it). Same signature, security definer,
-- search_path, lock_timeout and grants. The public onzio.purge_archived_club wrapper is unchanged.

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
