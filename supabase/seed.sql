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
  ),
  -- Charlie is the only Starter club that is also active and publicly live.
  -- That combination did not exist before DCFC-201: Alpha and Lions are Pro,
  -- and Bravo is Starter but onboarding/preview, so `can_read_club` rejects it
  -- before tier is ever consulted. Without Charlie, no test can exercise
  -- anonymous public reads at Starter tier -- which is exactly the blind spot
  -- that let PF-002 go unnoticed. Do not change its tier, lifecycle, or
  -- public_access without reading docs/platform-findings.md first.
  (
    '33333333-3333-4333-8333-333333333333',
    'charlie',
    'Charlie Athletic',
    'active',
    'live',
    'starter',
    '#333333',
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
