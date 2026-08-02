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
  -- before tier is ever consulted. Charlie also receives a local active
  -- subscription fixture below because Phase 6 derives public access from the
  -- subscription projection rather than trusting this public_access column by
  -- itself. Without both rows, no test can exercise anonymous public reads at
  -- Starter tier -- exactly the blind spot that let PF-002 go unnoticed. Do
  -- not change its tier, lifecycle, public_access, or subscription fixture
  -- without reading docs/platform-findings.md first.
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
values
  (
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
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'cus_charlie_seed',
    'sub_charlie_seed',
    'price_test_starter',
    'starter',
    'active',
    false,
    now() + interval '30 days',
    null,
    null,
    null
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

-- DCFC-304 local-only public acceptance content. These conspicuously synthetic
-- Alpha and Bravo values exist to prove admin-to-public reads and tenant
-- isolation; they are not Diverse City production content.
insert into onzio.programs (
  id,
  club_id,
  slug,
  nav_label,
  display_title,
  kicker,
  summary,
  body,
  highlights,
  layout_variant,
  external_cta_label,
  external_cta_href,
  status,
  sort_order
)
values
  (
    'd3040000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'alpha-academy-pathway',
    'Alpha Pathway',
    'Alpha Academy Pathway',
    'Synthetic Alpha program',
    'A local-only program used to verify Alpha public rendering.',
    'This synthetic content proves that tenant-scoped admin edits reach the matching public route.',
    '["Alpha technical development", "Alpha team environment"]'::jsonb,
    'statement_band',
    'Alpha external information',
    'https://alpha-registration.example.test/program',
    'active',
    0
  ),
  (
    'd3040000-0000-4000-8000-000000000002',
    '22222222-2222-4222-8222-222222222222',
    'bravo-development-pathway',
    'Bravo Pathway',
    'Bravo Development Pathway',
    'Synthetic Bravo program',
    'A local-only program that must never appear on Alpha routes.',
    'This synthetic Bravo content exists only for cross-tenant isolation checks.',
    '["Bravo-only development"]'::jsonb,
    'detail_focus',
    '',
    '',
    'active',
    0
  )
on conflict (club_id, slug) do update
set
  nav_label = excluded.nav_label,
  display_title = excluded.display_title,
  kicker = excluded.kicker,
  summary = excluded.summary,
  body = excluded.body,
  highlights = excluded.highlights,
  layout_variant = excluded.layout_variant,
  external_cta_label = excluded.external_cta_label,
  external_cta_href = excluded.external_cta_href,
  status = excluded.status,
  sort_order = excluded.sort_order;

insert into onzio.contact_profile (
  club_id,
  public_email,
  public_phone,
  service_area,
  hours
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'alpha-public@example.test',
    '+1 555 010 1101',
    'Alpha local service area',
    'By appointment'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'bravo-public@example.test',
    '+1 555 010 2202',
    'Bravo local service area',
    ''
  )
on conflict (club_id) do update
set
  public_email = excluded.public_email,
  public_phone = excluded.public_phone,
  service_area = excluded.service_area,
  hours = excluded.hours;

insert into onzio.contact_page_content (
  club_id,
  eyebrow,
  headline,
  intro
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'Alpha public acceptance contact',
    'Talk with Alpha FC',
    'Synthetic local-only contact copy for the Alpha tenant.'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'Bravo public acceptance contact',
    'Talk with Bravo United',
    'Synthetic local-only contact copy that must never appear for Alpha.'
  )
on conflict (club_id) do update
set
  eyebrow = excluded.eyebrow,
  headline = excluded.headline,
  intro = excluded.intro;

insert into onzio.tryouts (
  id,
  club_id,
  program_id,
  status,
  eyebrow,
  headline,
  intro,
  eligibility_copy,
  event_date,
  location,
  cost_text,
  cta_label,
  registration_href,
  closed_message,
  sort_order
)
values
  (
    'd3040000-0000-4000-8000-000000000101',
    '11111111-1111-4111-8111-111111111111',
    'd3040000-0000-4000-8000-000000000001',
    'open',
    'Synthetic Alpha tryout',
    'Alpha Open Evaluation',
    'A local-only open state used for browser and database acceptance.',
    'Eligibility details supplied by the external provider.',
    null,
    '',
    '',
    'Continue to external registration',
    'https://alpha-registration.example.test/tryouts',
    'Alpha registration is closed.',
    0
  ),
  (
    'd3040000-0000-4000-8000-000000000102',
    '22222222-2222-4222-8222-222222222222',
    'd3040000-0000-4000-8000-000000000002',
    'closed',
    'Synthetic Bravo tryout',
    'Bravo Closed Evaluation',
    'A local-only closed state that must never appear on Alpha routes.',
    '',
    null,
    'Bravo-only location',
    '',
    '',
    '',
    'Bravo registration is closed.',
    0
  )
on conflict (id) do update
set
  program_id = excluded.program_id,
  status = excluded.status,
  eyebrow = excluded.eyebrow,
  headline = excluded.headline,
  intro = excluded.intro,
  eligibility_copy = excluded.eligibility_copy,
  event_date = excluded.event_date,
  location = excluded.location,
  cost_text = excluded.cost_text,
  cta_label = excluded.cta_label,
  registration_href = excluded.registration_href,
  closed_message = excluded.closed_message,
  sort_order = excluded.sort_order;

-- dcfc-304-alpha-academy: a published Academy document makes the reusable
-- template selection deterministic on alpha.localhost after every db reset.
insert into onzio.presentation_documents (
  id,
  club_id,
  version,
  schema_version,
  template_id,
  template_version,
  configuration,
  configuration_digest,
  created_by
)
values (
  '88888888-8888-4888-8888-888888888804',
  '11111111-1111-4111-8111-111111111111',
  1,
  1,
  'academy',
  1,
  jsonb_build_object(
    'schemaVersion', 1,
    'template', jsonb_build_object('id', 'academy', 'version', 1),
    'fontPack', 'montserrat-inter-dmsans',
    'theme', jsonb_build_object(
      'surface', jsonb_build_object('canvas', '#141414', 'elevated', '#FFFFFF', 'subtle', '#F5F5F5', 'inverse', '#FFFFFF'),
      'text', jsonb_build_object('primary', '#FFFFFF', 'secondary', '#E5E5E5', 'muted', '#A3A3A3', 'inverse', '#141414'),
      'action', jsonb_build_object('primary', '#E7001B', 'primaryHover', '#B80016', 'primaryText', '#FFFFFF', 'secondary', '#141414'),
      'border', jsonb_build_object('subtle', '#3A3A3A', 'strong', '#FFFFFF'),
      'status', jsonb_build_object('success', '#16803A', 'warning', '#B7791F', 'danger', '#E7001B'),
      'accent', jsonb_build_object('one', '#E7001B', 'two', '#FFFFFF')
    ),
    'modules', jsonb_build_object(
      'roster', true, 'schedule', true, 'store', true, 'sponsors', true,
      'standings', true, 'programs', true, 'tryouts', true, 'contact', true,
      'affiliations', true
    ),
    'homepage', jsonb_build_object(
      'sections', jsonb_build_array(
        jsonb_build_object('id', 'hero-main', 'type', 'academy.hero', 'enabled', true, 'emptyBehavior', 'hide', 'config', '{}'::jsonb),
        jsonb_build_object('id', 'programs-pathway', 'type', 'academy.programs-pathway', 'enabled', true, 'emptyBehavior', 'hide', 'config', '{}'::jsonb)
      )
    ),
    'navigation', jsonb_build_object(
      'groups', jsonb_build_array(
        jsonb_build_object('id', 'main', 'label', null, 'routes', jsonb_build_array('home', 'roster', 'schedule', 'club', 'programs', 'store', 'contact', 'tryouts', 'sponsors'))
      )
    ),
    'metadata', jsonb_build_object(
      'recommendationId', null,
      'createdBy', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'createdAt', '2026-08-02T03:00:00.000Z',
      'sourceArtifact', 'dcfc-304-local-acceptance'
    )
  ),
  repeat('d', 64),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
)
on conflict (id) do nothing;

insert into onzio.presentation_state (
  club_id,
  draft_document_id,
  published_document_id,
  updated_by
)
values (
  '11111111-1111-4111-8111-111111111111',
  '88888888-8888-4888-8888-888888888804',
  '88888888-8888-4888-8888-888888888804',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
)
on conflict (club_id) do update
set
  draft_document_id = excluded.draft_document_id,
  published_document_id = excluded.published_document_id,
  updated_by = excluded.updated_by;
