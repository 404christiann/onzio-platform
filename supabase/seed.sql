-- Deterministic synthetic Phase 2 fixtures. Never run this seed against a
-- hosted project.

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'authenticated',
    'authenticated',
    'owner-aal2@alpha.local',
    crypt('local-contract-only', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"fixture":"owner-aal2"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    'authenticated',
    'authenticated',
    'owner-aal1@alpha.local',
    crypt('local-contract-only', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"fixture":"owner-aal1"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    'authenticated',
    'authenticated',
    'admin-aal2@alpha.local',
    crypt('local-contract-only', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"fixture":"admin-aal2"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
    'authenticated',
    'authenticated',
    'removed@alpha.local',
    crypt('local-contract-only', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"fixture":"removed"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',
    'authenticated',
    'authenticated',
    'unaffiliated@local.test',
    crypt('local-contract-only', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"fixture":"unaffiliated"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6',
    'authenticated',
    'authenticated',
    'multiclub@local.test',
    crypt('local-contract-only', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"fixture":"multi-club"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7',
    'authenticated',
    'authenticated',
    'admin@bravo.local',
    crypt('local-contract-only', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"fixture":"bravo-admin"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
on conflict (id) do nothing;

insert into onzio.clubs (
  id,
  slug,
  name,
  lifecycle,
  public_access,
  tier,
  primary_color,
  secondary_color
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'alpha',
    'Alpha FC',
    'active',
    'live',
    'pro',
    '#111111',
    '#FFFFFF'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'bravo',
    'Bravo United',
    'onboarding',
    'preview',
    'starter',
    '#222222',
    '#FFFFFF'
  )
on conflict (id) do update
set
  slug = excluded.slug,
  name = excluded.name,
  lifecycle = excluded.lifecycle,
  public_access = excluded.public_access,
  tier = excluded.tier;

insert into onzio.stripe_events (
  id,
  club_id,
  environment,
  event_type,
  stripe_created_at,
  applied_at,
  outcome,
  payload_digest
)
values (
  'evt_alpha_seed_active',
  '11111111-1111-4111-8111-111111111111',
  'test',
  'customer.subscription.updated',
  now(),
  now(),
  'applied',
  repeat('a', 64)
)
on conflict (id) do nothing;

insert into onzio.club_subscriptions (
  club_id,
  stripe_customer_id,
  stripe_subscription_id,
  price_id,
  tier,
  status,
  cancel_at_period_end,
  paid_through,
  grace_ends_at,
  last_applied_stripe_event_id,
  last_applied_stripe_event_created_at
)
values (
  '11111111-1111-4111-8111-111111111111',
  'cus_alpha_seed',
  'sub_alpha_seed',
  'price_test_pro',
  'pro',
  'active',
  false,
  now() + interval '30 days',
  null,
  'evt_alpha_seed_active',
  now()
)
on conflict (club_id) do update
set
  stripe_customer_id = excluded.stripe_customer_id,
  stripe_subscription_id = excluded.stripe_subscription_id,
  price_id = excluded.price_id,
  tier = excluded.tier,
  status = excluded.status,
  cancel_at_period_end = excluded.cancel_at_period_end,
  paid_through = excluded.paid_through,
  grace_ends_at = excluded.grace_ends_at,
  last_applied_stripe_event_id = excluded.last_applied_stripe_event_id,
  last_applied_stripe_event_created_at =
    excluded.last_applied_stripe_event_created_at;

insert into onzio.club_domains (
  id,
  club_id,
  hostname,
  is_primary,
  verified_at,
  environment,
  active
)
values
  (
    '11111111-1111-4111-8111-111111111101',
    '11111111-1111-4111-8111-111111111111',
    'alpha-onzio.vercel.app',
    true,
    now(),
    'production',
    true
  ),
  (
    '11111111-1111-4111-8111-111111111102',
    '11111111-1111-4111-8111-111111111111',
    'www.alphafc.example',
    false,
    now(),
    'production',
    true
  ),
  (
    '22222222-2222-4222-8222-222222222201',
    '22222222-2222-4222-8222-222222222222',
    'bravo-onzio.vercel.app',
    true,
    now(),
    'production',
    true
  )
on conflict (id) do nothing;

insert into onzio.club_members (
  user_id,
  club_id,
  role,
  status,
  removed_at
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '11111111-1111-4111-8111-111111111111',
    'owner',
    'active',
    null
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    '11111111-1111-4111-8111-111111111111',
    'owner',
    'active',
    null
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    '11111111-1111-4111-8111-111111111111',
    'admin',
    'active',
    null
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
    '11111111-1111-4111-8111-111111111111',
    'admin',
    'removed',
    now()
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6',
    '11111111-1111-4111-8111-111111111111',
    'admin',
    'active',
    null
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6',
    '22222222-2222-4222-8222-222222222222',
    'owner',
    'active',
    null
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7',
    '22222222-2222-4222-8222-222222222222',
    'admin',
    'active',
    null
  )
on conflict (user_id, club_id) do update
set
  role = excluded.role,
  status = excluded.status,
  removed_at = excluded.removed_at;

insert into onzio.media_assets (
  id,
  club_id,
  storage_bucket,
  storage_path,
  surface,
  media_kind,
  mime_type,
  byte_size,
  width,
  height,
  checksum_sha256,
  status,
  created_by,
  published_at
)
values
  (
    '44444444-4444-4444-8444-444444444441',
    '11111111-1111-4111-8111-111111111111',
    'onzio-media',
    '11111111-1111-4111-8111-111111111111/branding/44444444-4444-4444-8444-444444444441.png',
    'branding',
    'graphic',
    'image/png',
    128,
    64,
    64,
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'published',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    now()
  ),
  (
    '44444444-4444-4444-8444-444444444442',
    '22222222-2222-4222-8222-222222222222',
    'onzio-media',
    '22222222-2222-4222-8222-222222222222/branding/44444444-4444-4444-8444-444444444442.png',
    'branding',
    'graphic',
    'image/png',
    128,
    64,
    64,
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'published',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6',
    now()
  ),
  (
    '44444444-4444-4444-8444-444444444443',
    '11111111-1111-4111-8111-111111111111',
    'onzio-upload-staging',
    '11111111-1111-4111-8111-111111111111/homepage/44444444-4444-4444-8444-444444444443.webp',
    'homepage',
    'photograph',
    'image/webp',
    1024,
    800,
    600,
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    'staged',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    null
  )
on conflict (id) do nothing;

insert into onzio.seasons (
  id,
  club_id,
  label,
  start_year,
  end_year,
  active
)
values
  (
    '33333333-3333-4333-8333-333333333331',
    '11111111-1111-4111-8111-111111111111',
    '2026',
    2026,
    2026,
    true
  ),
  (
    '33333333-3333-4333-8333-333333333332',
    '22222222-2222-4222-8222-222222222222',
    '2026',
    2026,
    2026,
    true
  )
on conflict (id) do nothing;

insert into onzio.site_branding (
  club_id,
  club_logo_path,
  club_logo_asset_id
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111/branding/44444444-4444-4444-8444-444444444441.png',
    '44444444-4444-4444-8444-444444444441'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    '22222222-2222-4222-8222-222222222222/branding/44444444-4444-4444-8444-444444444442.png',
    '44444444-4444-4444-8444-444444444442'
  )
on conflict (club_id) do update
set
  club_logo_path = excluded.club_logo_path,
  club_logo_asset_id = excluded.club_logo_asset_id;

-- ---------------------------------------------------------------------------
-- Lions Football Club: synthetic local-dev-only Starter tenant rendered with
-- the editorial site template. Roster, staff, fixtures, identity, story, and
-- contact content are transcribed from the sales-mockup Lions configuration.
-- Branding and homepage media are published by scripts/seed-lions-media.mjs,
-- which processes the checked-in originals under supabase/fixtures/lions-media
-- through the real media pipeline and wires the resulting asset rows here.
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8',
    'authenticated',
    'authenticated',
    'owner@lions.local',
    crypt('local-contract-only', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"fixture":"lions-owner"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
on conflict (id) do nothing;

insert into onzio.clubs (
  id,
  slug,
  name,
  lifecycle,
  public_access,
  tier,
  site_template,
  primary_color,
  secondary_color,
  accent_color
)
values
  (
    '55555555-5555-4555-8555-555555555555',
    'lions',
    'Lions Football Club',
    'active',
    'live',
    'starter',
    'editorial',
    '#1B2958',
    '#AD3234',
    '#F0F0F0'
  )
on conflict (id) do update
set
  slug = excluded.slug,
  name = excluded.name,
  lifecycle = excluded.lifecycle,
  public_access = excluded.public_access,
  tier = excluded.tier,
  site_template = excluded.site_template,
  primary_color = excluded.primary_color,
  secondary_color = excluded.secondary_color,
  accent_color = excluded.accent_color;

insert into onzio.stripe_events (
  id,
  club_id,
  environment,
  event_type,
  stripe_created_at,
  applied_at,
  outcome,
  payload_digest
)
values (
  'evt_lions_seed_active',
  '55555555-5555-4555-8555-555555555555',
  'test',
  'customer.subscription.updated',
  now(),
  now(),
  'applied',
  repeat('c', 64)
)
on conflict (id) do nothing;

insert into onzio.club_subscriptions (
  club_id,
  stripe_customer_id,
  stripe_subscription_id,
  price_id,
  tier,
  status,
  cancel_at_period_end,
  paid_through,
  grace_ends_at,
  last_applied_stripe_event_id,
  last_applied_stripe_event_created_at
)
values (
  '55555555-5555-4555-8555-555555555555',
  'cus_lions_seed',
  'sub_lions_seed',
  'price_test_starter',
  'starter',
  'active',
  false,
  now() + interval '30 days',
  null,
  'evt_lions_seed_active',
  now()
)
on conflict (club_id) do update
set
  stripe_customer_id = excluded.stripe_customer_id,
  stripe_subscription_id = excluded.stripe_subscription_id,
  price_id = excluded.price_id,
  tier = excluded.tier,
  status = excluded.status,
  cancel_at_period_end = excluded.cancel_at_period_end,
  paid_through = excluded.paid_through,
  grace_ends_at = excluded.grace_ends_at,
  last_applied_stripe_event_id = excluded.last_applied_stripe_event_id,
  last_applied_stripe_event_created_at =
    excluded.last_applied_stripe_event_created_at;

insert into onzio.club_domains (
  id,
  club_id,
  hostname,
  is_primary,
  verified_at,
  environment,
  active
)
values
  (
    '55555555-5555-4555-8555-555555555501',
    '55555555-5555-4555-8555-555555555555',
    'lions-onzio.vercel.app',
    true,
    now(),
    'production',
    true
  )
on conflict (id) do nothing;

insert into onzio.club_members (
  user_id,
  club_id,
  role,
  status,
  removed_at
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8',
    '55555555-5555-4555-8555-555555555555',
    'owner',
    'active',
    null
  )
on conflict (user_id, club_id) do update
set
  role = excluded.role,
  status = excluded.status,
  removed_at = excluded.removed_at;

insert into onzio.seasons (
  id,
  club_id,
  label,
  start_year,
  end_year,
  active
)
values
  (
    '33333333-3333-4333-8333-333333333333',
    '55555555-5555-4555-8555-555555555555',
    '2026 Season',
    2026,
    2026,
    true
  )
on conflict (id) do nothing;

insert into onzio.club_identity (
  club_id,
  short_name,
  initials,
  founded_year,
  league,
  division,
  city,
  state,
  venue,
  time_zone,
  contact_email,
  contact_phone,
  contact_address,
  hero_headline_top,
  hero_headline_em,
  hero_intro,
  slideshow_heading_top,
  slideshow_heading_em,
  identity_heading_top,
  identity_heading_em,
  story_heading_top,
  story_heading_em,
  mission,
  highlights
)
values
  (
    '55555555-5555-4555-8555-555555555555',
    'Lions FC',
    'LFC',
    2014,
    'Midwest Premier League',
    'Ohio Valley Division',
    'Columbus',
    'OH',
    'Scioto Field',
    'America/New_York',
    'hello@lionsfc.example',
    '(614) 555-0142',
    '1814 W Broad St, Columbus, OH 43223',
    'Capital City.',
    'Roar as One.',
    'Columbus-built football, carried by a club that plays for the city and every supporter behind it.',
    'This is how',
    'Columbus roars.',
    'A club shaped by',
    'Columbus.',
    'From Columbus.',
    'For the Capital City.',
    'Roar as one for Columbus.',
    '["2025 Ohio Valley Division Champions","Three connected player pathways","Columbus-owned and community-backed"]'::jsonb
  )
on conflict (club_id) do update
set
  short_name = excluded.short_name,
  initials = excluded.initials,
  founded_year = excluded.founded_year,
  league = excluded.league,
  division = excluded.division,
  city = excluded.city,
  state = excluded.state,
  venue = excluded.venue,
  time_zone = excluded.time_zone,
  contact_email = excluded.contact_email,
  contact_phone = excluded.contact_phone,
  contact_address = excluded.contact_address,
  hero_headline_top = excluded.hero_headline_top,
  hero_headline_em = excluded.hero_headline_em,
  hero_intro = excluded.hero_intro,
  slideshow_heading_top = excluded.slideshow_heading_top,
  slideshow_heading_em = excluded.slideshow_heading_em,
  identity_heading_top = excluded.identity_heading_top,
  identity_heading_em = excluded.identity_heading_em,
  story_heading_top = excluded.story_heading_top,
  story_heading_em = excluded.story_heading_em,
  mission = excluded.mission,
  highlights = excluded.highlights;

insert into onzio.site_social_links (
  club_id,
  id,
  label,
  href,
  icon,
  sort_order
)
values
  (
    '55555555-5555-4555-8555-555555555555',
    'instagram',
    'Instagram',
    'https://www.instagram.com/columbuslionsfc',
    '/images/logo/instagramLogo.svg',
    0
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    'youtube',
    'YouTube',
    'https://www.youtube.com/@lionsfootballclub-q3p',
    '/images/logo/youtubeLogo.svg',
    1
  )
on conflict (club_id, id) do update
set
  label = excluded.label,
  href = excluded.href,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

-- Ages are synthetic (21 + roster index % 9): the mockup configuration does
-- not define player ages, and onzio.players.age is required.
insert into onzio.players (
  id,
  club_id,
  number,
  name,
  position,
  height,
  hometown,
  age,
  bio
)
values
  (
    '77777777-7777-4777-8777-777777777701',
    '55555555-5555-4555-8555-555555555555',
    1,
    'Jonah Reed',
    'Goalkeeper',
    '6''2"',
    'Columbus, OH',
    21,
    'Jonah brings composure, work rate, and a team-first edge to Lions Football Club. A Columbus competitor built for decisive moments.'
  ),
  (
    '77777777-7777-4777-8777-777777777702',
    '55555555-5555-4555-8555-555555555555',
    13,
    'Mateo Silva',
    'Goalkeeper',
    '6''2"',
    'Dublin, OH',
    22,
    'Mateo brings composure, work rate, and a team-first edge to Lions Football Club. A Columbus competitor built for decisive moments.'
  ),
  (
    '77777777-7777-4777-8777-777777777703',
    '55555555-5555-4555-8555-555555555555',
    2,
    'Elias Ford',
    'Defender',
    '6''0"',
    'Westerville, OH',
    23,
    'Elias brings composure, work rate, and a team-first edge to Lions Football Club. A Columbus competitor built for decisive moments.'
  ),
  (
    '77777777-7777-4777-8777-777777777704',
    '55555555-5555-4555-8555-555555555555',
    3,
    'Andre Kouyaté',
    'Defender',
    '5''11"',
    'Columbus, OH',
    24,
    'Andre brings composure, work rate, and a team-first edge to Lions Football Club. A Columbus competitor built for decisive moments.'
  ),
  (
    '77777777-7777-4777-8777-777777777705',
    '55555555-5555-4555-8555-555555555555',
    4,
    'Noah Chen',
    'Defender',
    '6''0"',
    'Dublin, OH',
    25,
    'Noah brings composure, work rate, and a team-first edge to Lions Football Club. A Columbus competitor built for decisive moments.'
  ),
  (
    '77777777-7777-4777-8777-777777777706',
    '55555555-5555-4555-8555-555555555555',
    5,
    'Luca Bennett',
    'Defender',
    '5''11"',
    'Westerville, OH',
    26,
    'Luca brings composure, work rate, and a team-first edge to Lions Football Club. A Columbus competitor built for decisive moments.'
  ),
  (
    '77777777-7777-4777-8777-777777777707',
    '55555555-5555-4555-8555-555555555555',
    15,
    'Darius Cole',
    'Defender',
    '6''0"',
    'Columbus, OH',
    27,
    'Darius brings composure, work rate, and a team-first edge to Lions Football Club. A Columbus competitor built for decisive moments.'
  ),
  (
    '77777777-7777-4777-8777-777777777708',
    '55555555-5555-4555-8555-555555555555',
    22,
    'Owen Park',
    'Defender',
    '5''11"',
    'Dublin, OH',
    28,
    'Owen brings composure, work rate, and a team-first edge to Lions Football Club. A Columbus competitor built for decisive moments.'
  ),
  (
    '77777777-7777-4777-8777-777777777709',
    '55555555-5555-4555-8555-555555555555',
    6,
    'Miles Okafor',
    'Midfielder',
    '6''0"',
    'Westerville, OH',
    29,
    'Miles brings composure, work rate, and a team-first edge to Lions Football Club. A Columbus competitor built for decisive moments.'
  ),
  (
    '77777777-7777-4777-8777-777777777710',
    '55555555-5555-4555-8555-555555555555',
    8,
    'Nico Valdez',
    'Midfielder',
    '5''11"',
    'Columbus, OH',
    21,
    'Nico brings composure, work rate, and a team-first edge to Lions Football Club. A Columbus competitor built for decisive moments.'
  ),
  (
    '77777777-7777-4777-8777-777777777711',
    '55555555-5555-4555-8555-555555555555',
    10,
    'Theo Santos',
    'Midfielder',
    '6''0"',
    'Dublin, OH',
    22,
    'Theo brings composure, work rate, and a team-first edge to Lions Football Club. A Columbus competitor built for decisive moments.'
  ),
  (
    '77777777-7777-4777-8777-777777777712',
    '55555555-5555-4555-8555-555555555555',
    14,
    'Caleb Wright',
    'Midfielder',
    '5''11"',
    'Westerville, OH',
    23,
    'Caleb brings composure, work rate, and a team-first edge to Lions Football Club. A Columbus competitor built for decisive moments.'
  ),
  (
    '77777777-7777-4777-8777-777777777713',
    '55555555-5555-4555-8555-555555555555',
    18,
    'Isaac Amini',
    'Midfielder',
    '6''0"',
    'Columbus, OH',
    24,
    'Isaac brings composure, work rate, and a team-first edge to Lions Football Club. A Columbus competitor built for decisive moments.'
  ),
  (
    '77777777-7777-4777-8777-777777777714',
    '55555555-5555-4555-8555-555555555555',
    21,
    'Rowan Kim',
    'Midfielder',
    '5''11"',
    'Dublin, OH',
    25,
    'Rowan brings composure, work rate, and a team-first edge to Lions Football Club. A Columbus competitor built for decisive moments.'
  ),
  (
    '77777777-7777-4777-8777-777777777715',
    '55555555-5555-4555-8555-555555555555',
    7,
    'Malik Johnson',
    'Forward',
    '6''0"',
    'Westerville, OH',
    26,
    'Malik brings composure, work rate, and a team-first edge to Lions Football Club. A Columbus competitor built for decisive moments.'
  ),
  (
    '77777777-7777-4777-8777-777777777716',
    '55555555-5555-4555-8555-555555555555',
    9,
    'Santiago Ruiz',
    'Forward',
    '5''11"',
    'Columbus, OH',
    27,
    'Santiago brings composure, work rate, and a team-first edge to Lions Football Club. A Columbus competitor built for decisive moments.'
  ),
  (
    '77777777-7777-4777-8777-777777777717',
    '55555555-5555-4555-8555-555555555555',
    11,
    'Adrian Brooks',
    'Forward',
    '6''0"',
    'Dublin, OH',
    28,
    'Adrian brings composure, work rate, and a team-first edge to Lions Football Club. A Columbus competitor built for decisive moments.'
  ),
  (
    '77777777-7777-4777-8777-777777777718',
    '55555555-5555-4555-8555-555555555555',
    19,
    'Kenji Tanaka',
    'Forward',
    '5''11"',
    'Westerville, OH',
    29,
    'Kenji brings composure, work rate, and a team-first edge to Lions Football Club. A Columbus competitor built for decisive moments.'
  )
on conflict (id) do nothing;

insert into onzio.goalkeeper_season_stats (
  club_id,
  player_id,
  season_id,
  goals_against,
  saves,
  clean_sheets,
  starts,
  yellow,
  red,
  mins
)
values
  (
    '55555555-5555-4555-8555-555555555555',
    '77777777-7777-4777-8777-777777777701',
    '33333333-3333-4333-8333-333333333333',
    0,
    24,
    2,
    4,
    0,
    0,
    414
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    '77777777-7777-4777-8777-777777777702',
    '33333333-3333-4333-8333-333333333333',
    0,
    27,
    2,
    5,
    1,
    0,
    437
  )
on conflict (club_id, player_id, season_id) do update
set
  goals_against = excluded.goals_against,
  saves = excluded.saves,
  clean_sheets = excluded.clean_sheets,
  starts = excluded.starts,
  yellow = excluded.yellow,
  red = excluded.red,
  mins = excluded.mins;

insert into onzio.player_season_stats (
  club_id,
  player_id,
  season_id,
  goals,
  assists,
  starts,
  yellow,
  red,
  mins
)
values
  ('55555555-5555-4555-8555-555555555555', '77777777-7777-4777-8777-777777777703', '33333333-3333-4333-8333-333333333333', 0, 0, 6, 2, 0, 460),
  ('55555555-5555-4555-8555-555555555555', '77777777-7777-4777-8777-777777777704', '33333333-3333-4333-8333-333333333333', 0, 1, 7, 0, 0, 483),
  ('55555555-5555-4555-8555-555555555555', '77777777-7777-4777-8777-777777777705', '33333333-3333-4333-8333-333333333333', 0, 0, 4, 1, 0, 506),
  ('55555555-5555-4555-8555-555555555555', '77777777-7777-4777-8777-777777777706', '33333333-3333-4333-8333-333333333333', 0, 1, 5, 2, 0, 529),
  ('55555555-5555-4555-8555-555555555555', '77777777-7777-4777-8777-777777777707', '33333333-3333-4333-8333-333333333333', 0, 0, 6, 0, 0, 552),
  ('55555555-5555-4555-8555-555555555555', '77777777-7777-4777-8777-777777777708', '33333333-3333-4333-8333-333333333333', 0, 1, 7, 1, 0, 575),
  ('55555555-5555-4555-8555-555555555555', '77777777-7777-4777-8777-777777777709', '33333333-3333-4333-8333-333333333333', 2, 1, 4, 2, 0, 598),
  ('55555555-5555-4555-8555-555555555555', '77777777-7777-4777-8777-777777777710', '33333333-3333-4333-8333-333333333333', 0, 2, 5, 0, 0, 621),
  ('55555555-5555-4555-8555-555555555555', '77777777-7777-4777-8777-777777777711', '33333333-3333-4333-8333-333333333333', 1, 3, 6, 1, 0, 644),
  ('55555555-5555-4555-8555-555555555555', '77777777-7777-4777-8777-777777777712', '33333333-3333-4333-8333-333333333333', 2, 4, 7, 2, 0, 667),
  ('55555555-5555-4555-8555-555555555555', '77777777-7777-4777-8777-777777777713', '33333333-3333-4333-8333-333333333333', 0, 1, 4, 0, 0, 690),
  ('55555555-5555-4555-8555-555555555555', '77777777-7777-4777-8777-777777777714', '33333333-3333-4333-8333-333333333333', 1, 2, 5, 1, 0, 713),
  ('55555555-5555-4555-8555-555555555555', '77777777-7777-4777-8777-777777777715', '33333333-3333-4333-8333-333333333333', 4, 0, 6, 2, 0, 736),
  ('55555555-5555-4555-8555-555555555555', '77777777-7777-4777-8777-777777777716', '33333333-3333-4333-8333-333333333333', 5, 1, 7, 0, 0, 759),
  ('55555555-5555-4555-8555-555555555555', '77777777-7777-4777-8777-777777777717', '33333333-3333-4333-8333-333333333333', 2, 0, 4, 1, 0, 782),
  ('55555555-5555-4555-8555-555555555555', '77777777-7777-4777-8777-777777777718', '33333333-3333-4333-8333-333333333333', 3, 1, 5, 2, 0, 805)
on conflict (club_id, player_id, season_id) do update
set
  goals = excluded.goals,
  assists = excluded.assists,
  starts = excluded.starts,
  yellow = excluded.yellow,
  red = excluded.red,
  mins = excluded.mins;

insert into onzio.staff (
  id,
  club_id,
  name,
  role,
  bio
)
values
  (
    '88888888-8888-4888-8888-888888888801',
    '55555555-5555-4555-8555-555555555555',
    'Marcus Hale',
    'Head Coach',
    'A detail-led coach committed to brave, front-foot soccer.'
  ),
  (
    '88888888-8888-4888-8888-888888888802',
    '55555555-5555-4555-8555-555555555555',
    'Elena Torres',
    'Assistant Coach',
    'Leads player development and match preparation.'
  ),
  (
    '88888888-8888-4888-8888-888888888803',
    '55555555-5555-4555-8555-555555555555',
    'David Kim',
    'Goalkeeper Coach',
    null
  ),
  (
    '88888888-8888-4888-8888-888888888804',
    '55555555-5555-4555-8555-555555555555',
    'Dr. Maya Brooks',
    'Athletic Trainer',
    null
  ),
  (
    '88888888-8888-4888-8888-888888888805',
    '55555555-5555-4555-8555-555555555555',
    'Renee Walker',
    'Club General Manager',
    null
  )
on conflict (id) do nothing;

-- First-team 2026 fixtures transcribed from the mockup configuration: seven
-- played (with attendance and scorers) and four upcoming. The mockup uses
-- Scioto Field for every first-team fixture regardless of home/away, marks
-- played fixtures as competition 'League' and upcoming fixtures with the full
-- league name, and alternates home/away by numeric fixture-id parity.
insert into onzio.matches (
  id,
  club_id,
  season_id,
  date,
  time,
  opponent,
  competition,
  home,
  venue,
  rose_city_score,
  opponent_score,
  attendance,
  scorers
)
values
  (
    '99999999-9999-4999-8999-999999999901',
    '55555555-5555-4555-8555-555555555555',
    '33333333-3333-4333-8333-333333333333',
    '2026-05-09',
    '19:00',
    'Dayton Rovers SC',
    'League',
    true,
    'Scioto Field',
    2,
    0,
    842,
    '["M. Johnson 34''","S. Ruiz 71''"]'::jsonb
  ),
  (
    '99999999-9999-4999-8999-999999999902',
    '55555555-5555-4555-8555-555555555555',
    '33333333-3333-4333-8333-333333333333',
    '2026-05-16',
    '18:00',
    'Queen City FC',
    'League',
    false,
    'Scioto Field',
    1,
    1,
    615,
    '["M. Johnson 34''","S. Ruiz 71''"]'::jsonb
  ),
  (
    '99999999-9999-4999-8999-999999999903',
    '55555555-5555-4555-8555-555555555555',
    '33333333-3333-4333-8333-333333333333',
    '2026-05-30',
    '19:30',
    'Lake Erie Athletic',
    'League',
    true,
    'Scioto Field',
    3,
    1,
    911,
    '["M. Johnson 34''","S. Ruiz 71''"]'::jsonb
  ),
  (
    '99999999-9999-4999-8999-999999999904',
    '55555555-5555-4555-8555-555555555555',
    '33333333-3333-4333-8333-333333333333',
    '2026-06-06',
    '18:00',
    'Toledo Harbor FC',
    'League',
    false,
    'Scioto Field',
    0,
    1,
    702,
    '[]'::jsonb
  ),
  (
    '99999999-9999-4999-8999-999999999905',
    '55555555-5555-4555-8555-555555555555',
    '33333333-3333-4333-8333-333333333333',
    '2026-06-20',
    '19:00',
    'Akron Union',
    'League',
    true,
    'Scioto Field',
    2,
    2,
    788,
    '["M. Johnson 34''","S. Ruiz 71''"]'::jsonb
  ),
  (
    '99999999-9999-4999-8999-999999999906',
    '55555555-5555-4555-8555-555555555555',
    '33333333-3333-4333-8333-333333333333',
    '2026-06-27',
    '19:00',
    'Franklinton 1909',
    'League',
    false,
    'Scioto Field',
    4,
    1,
    1044,
    '["M. Johnson 34''","S. Ruiz 71''"]'::jsonb
  ),
  (
    '99999999-9999-4999-8999-999999999907',
    '55555555-5555-4555-8555-555555555555',
    '33333333-3333-4333-8333-333333333333',
    '2026-07-11',
    '19:00',
    'Scioto Valley FC',
    'League',
    true,
    'Scioto Field',
    2,
    1,
    1186,
    '["M. Johnson 34''","S. Ruiz 71''"]'::jsonb
  ),
  (
    '99999999-9999-4999-8999-999999999908',
    '55555555-5555-4555-8555-555555555555',
    '33333333-3333-4333-8333-333333333333',
    '2026-08-15',
    '19:00',
    'Capital City Athletic',
    'Midwest Premier League',
    false,
    'Scioto Field',
    null,
    null,
    null,
    '[]'::jsonb
  ),
  (
    '99999999-9999-4999-8999-999999999909',
    '55555555-5555-4555-8555-555555555555',
    '33333333-3333-4333-8333-333333333333',
    '2026-08-22',
    '18:00',
    'Dayton Rovers SC',
    'Midwest Premier League',
    true,
    'Scioto Field',
    null,
    null,
    null,
    '[]'::jsonb
  ),
  (
    '99999999-9999-4999-8999-999999999910',
    '55555555-5555-4555-8555-555555555555',
    '33333333-3333-4333-8333-333333333333',
    '2026-09-05',
    '19:00',
    'Queen City FC',
    'Midwest Premier League',
    false,
    'Scioto Field',
    null,
    null,
    null,
    '[]'::jsonb
  ),
  (
    '99999999-9999-4999-8999-999999999911',
    '55555555-5555-4555-8555-555555555555',
    '33333333-3333-4333-8333-333333333333',
    '2026-09-12',
    '18:30',
    'Toledo Harbor FC',
    'Midwest Premier League',
    true,
    'Scioto Field',
    null,
    null,
    null,
    '[]'::jsonb
  )
on conflict (id) do nothing;

insert into onzio.about_page_content (
  club_id,
  story_paragraphs
)
values
  (
    '55555555-5555-4555-8555-555555555555',
    '["Lions Football Club was founded to give Columbus a club that competes with ambition and belongs to its community. From Scioto Field to every neighborhood training ground, we wear the badge for the Capital City with purpose.","Our first team, U23s, and academy share one pathway: local players, brave soccer, and standards that travel beyond matchday. One pathway, one badge, one city behind it."]'::jsonb
  )
on conflict (club_id) do update
set
  story_paragraphs = excluded.story_paragraphs;

-- Slideshow rows are created here in gallery order with deterministic ids;
-- scripts/seed-lions-media.mjs publishes the processed photographs and fills
-- in url and media_asset_id.
insert into onzio.homepage_slideshow_photos (
  id,
  club_id,
  url,
  media_asset_id,
  alt,
  sort_order
)
values
  (
    '66666666-6666-4666-8666-666666666601',
    '55555555-5555-4555-8555-555555555555',
    '',
    null,
    'Lions Football Club matchday photo 1',
    0
  ),
  (
    '66666666-6666-4666-8666-666666666602',
    '55555555-5555-4555-8555-555555555555',
    '',
    null,
    'Lions Football Club matchday photo 2',
    1
  ),
  (
    '66666666-6666-4666-8666-666666666603',
    '55555555-5555-4555-8555-555555555555',
    '',
    null,
    'Lions Football Club matchday photo 3',
    2
  ),
  (
    '66666666-6666-4666-8666-666666666604',
    '55555555-5555-4555-8555-555555555555',
    '',
    null,
    'Lions Football Club matchday photo 4',
    3
  )
on conflict (id) do nothing;

-- The crest and dark-surface crest are published and wired by
-- scripts/seed-lions-media.mjs after db reset.
insert into onzio.site_branding (
  club_id,
  club_logo_path,
  club_logo_asset_id
)
values
  (
    '55555555-5555-4555-8555-555555555555',
    '',
    null
  )
on conflict (club_id) do nothing;
