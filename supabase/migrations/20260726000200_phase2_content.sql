-- Onzio Platform Phase 2: tenant-owned content schema
-- Every tenant relationship carries club_id and references a composite
-- (club_id, id) key so cross-club associations fail at the database boundary.

create table onzio.seasons (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  label text not null check (char_length(label) between 1 and 40),
  start_year integer not null check (start_year between 2000 and 2200),
  end_year integer not null check (end_year between start_year and start_year + 2),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, id),
  unique (club_id, label)
);

create unique index seasons_one_active_per_club
  on onzio.seasons (club_id)
  where active;

create table onzio.players (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  number integer not null check (number between 0 and 999),
  name text not null check (char_length(name) between 1 and 120),
  caption text,
  nationality text not null default '',
  position text not null
    check (position in ('Goalkeeper', 'Defender', 'Midfielder', 'Forward')),
  height text not null default '',
  weight text not null default '',
  hometown text not null default '',
  age integer not null check (age between 14 and 80),
  school text,
  previous_club text,
  photo_url text not null default '',
  photo_asset_id uuid,
  active boolean not null default true,
  bio text,
  pronunciation text,
  foot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, id),
  foreign key (club_id, photo_asset_id)
    references onzio.media_assets(club_id, id) on delete restrict
);

create index players_club_active_idx on onzio.players (club_id, active, number);

create table onzio.staff (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  initials text not null default '',
  name text not null check (char_length(name) between 1 and 120),
  role text not null,
  hometown text not null default '',
  nationality text not null default '',
  bio text,
  photo_url text not null default '',
  photo_asset_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, id),
  foreign key (club_id, photo_asset_id)
    references onzio.media_assets(club_id, id) on delete restrict
);

create table onzio.matches (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  season_id uuid not null,
  date date not null,
  time time not null,
  opponent text not null,
  opponent_short_name text,
  opponent_logo_url text,
  opponent_logo_asset_id uuid,
  competition text,
  sponsor_name text,
  sponsor_logo_url text,
  sponsor_logo_asset_id uuid,
  sponsor_link text,
  home boolean not null default true,
  venue text not null default '',
  address text,
  city text,
  state text,
  rose_city_score integer check (rose_city_score is null or rose_city_score >= 0),
  opponent_score integer check (opponent_score is null or opponent_score >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, id),
  foreign key (club_id, season_id)
    references onzio.seasons(club_id, id) on delete restrict,
  foreign key (club_id, opponent_logo_asset_id)
    references onzio.media_assets(club_id, id) on delete restrict,
  foreign key (club_id, sponsor_logo_asset_id)
    references onzio.media_assets(club_id, id) on delete restrict
);

create index matches_club_season_date_idx
  on onzio.matches (club_id, season_id, date, time);

create table onzio.player_photos (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  player_id uuid not null,
  url text not null,
  media_asset_id uuid,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (club_id, id),
  foreign key (club_id, player_id)
    references onzio.players(club_id, id) on delete cascade,
  foreign key (club_id, media_asset_id)
    references onzio.media_assets(club_id, id) on delete restrict
);

create table onzio.player_match_stats (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  player_id uuid not null,
  match_id uuid not null,
  starts boolean not null default false,
  mins integer not null default 0 check (mins between 0 and 300),
  goals integer not null default 0 check (goals >= 0),
  assists integer not null default 0 check (assists >= 0),
  tackles integer not null default 0 check (tackles >= 0),
  offsides integer not null default 0 check (offsides >= 0),
  fouls integer not null default 0 check (fouls >= 0),
  fouls_suffered integer not null default 0 check (fouls_suffered >= 0),
  yellow integer not null default 0 check (yellow >= 0),
  red integer not null default 0 check (red >= 0),
  rating numeric(3,1) check (rating is null or rating between 0 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, id),
  unique (club_id, player_id, match_id),
  foreign key (club_id, player_id)
    references onzio.players(club_id, id) on delete cascade,
  foreign key (club_id, match_id)
    references onzio.matches(club_id, id) on delete cascade
);

create table onzio.goalkeeper_match_stats (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  player_id uuid not null,
  match_id uuid not null,
  starts boolean not null default false,
  mins integer not null default 0 check (mins between 0 and 300),
  goals_against integer not null default 0 check (goals_against >= 0),
  saves integer not null default 0 check (saves >= 0),
  clean_sheets integer not null default 0 check (clean_sheets >= 0),
  yellow integer not null default 0 check (yellow >= 0),
  red integer not null default 0 check (red >= 0),
  rating numeric(3,1) check (rating is null or rating between 0 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, id),
  unique (club_id, player_id, match_id),
  foreign key (club_id, player_id)
    references onzio.players(club_id, id) on delete cascade,
  foreign key (club_id, match_id)
    references onzio.matches(club_id, id) on delete cascade
);

create table onzio.player_season_stats (
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  player_id uuid not null,
  season_id uuid not null,
  goals integer not null default 0 check (goals >= 0),
  assists integer not null default 0 check (assists >= 0),
  tackles integer not null default 0 check (tackles >= 0),
  starts integer not null default 0 check (starts >= 0),
  yellow integer not null default 0 check (yellow >= 0),
  red integer not null default 0 check (red >= 0),
  mins integer not null default 0 check (mins >= 0),
  offsides integer not null default 0 check (offsides >= 0),
  fouls integer not null default 0 check (fouls >= 0),
  fouls_suffered integer not null default 0 check (fouls_suffered >= 0),
  updated_at timestamptz not null default now(),
  primary key (club_id, player_id, season_id),
  foreign key (club_id, player_id)
    references onzio.players(club_id, id) on delete cascade,
  foreign key (club_id, season_id)
    references onzio.seasons(club_id, id) on delete cascade
);

create table onzio.goalkeeper_season_stats (
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  player_id uuid not null,
  season_id uuid not null,
  goals_against integer not null default 0 check (goals_against >= 0),
  saves integer not null default 0 check (saves >= 0),
  clean_sheets integer not null default 0 check (clean_sheets >= 0),
  starts integer not null default 0 check (starts >= 0),
  yellow integer not null default 0 check (yellow >= 0),
  red integer not null default 0 check (red >= 0),
  mins integer not null default 0 check (mins >= 0),
  updated_at timestamptz not null default now(),
  primary key (club_id, player_id, season_id),
  foreign key (club_id, player_id)
    references onzio.players(club_id, id) on delete cascade,
  foreign key (club_id, season_id)
    references onzio.seasons(club_id, id) on delete cascade
);

create table onzio.site_branding (
  club_id uuid primary key references onzio.clubs(id) on delete restrict,
  club_logo_path text not null default '',
  club_logo_asset_id uuid,
  updated_at timestamptz not null default now(),
  foreign key (club_id, club_logo_asset_id)
    references onzio.media_assets(club_id, id) on delete restrict
);

create table onzio.site_social_links (
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  id text not null,
  label text not null,
  href text not null,
  icon text not null,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (club_id, id)
);

create table onzio.site_sponsor_logos (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  placement text not null check (placement in ('carousel', 'footer')),
  name text not null,
  logo_url text not null,
  media_asset_id uuid,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (club_id, id),
  foreign key (club_id, media_asset_id)
    references onzio.media_assets(club_id, id) on delete restrict
);

create table onzio.about_page_content (
  club_id uuid primary key references onzio.clubs(id) on delete restrict,
  hero_title text not null default '',
  story_paragraphs jsonb not null default '[]'::jsonb,
  feature_image_url text not null default '',
  feature_image_asset_id uuid,
  values_heading text not null default '',
  values jsonb not null default '[]'::jsonb,
  closing_text text not null default '',
  closing_cta_label text not null default '',
  closing_cta_href text not null default '',
  updated_at timestamptz not null default now(),
  foreign key (club_id, feature_image_asset_id)
    references onzio.media_assets(club_id, id) on delete restrict
);

create table onzio.club_logo_page_content (
  club_id uuid primary key references onzio.clubs(id) on delete restrict,
  annotated_image_url text not null default '',
  annotated_image_asset_id uuid,
  features jsonb not null default '[]'::jsonb,
  map_image_url text not null default '',
  map_image_asset_id uuid,
  color_cards jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  foreign key (club_id, annotated_image_asset_id)
    references onzio.media_assets(club_id, id) on delete restrict,
  foreign key (club_id, map_image_asset_id)
    references onzio.media_assets(club_id, id) on delete restrict
);

create table onzio.behind_the_rose_section (
  club_id uuid primary key references onzio.clubs(id) on delete restrict,
  visible boolean not null default true,
  eyebrow text not null default '',
  title text not null default '',
  description text not null default '',
  video_url text not null default '',
  video_title text not null default '',
  caption text not null default '',
  updated_at timestamptz not null default now()
);

create table onzio.homepage_slideshow_settings (
  club_id uuid primary key references onzio.clubs(id) on delete restrict,
  season_label text not null default '',
  updated_at timestamptz not null default now()
);

create table onzio.homepage_slideshow_photos (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  url text not null,
  media_asset_id uuid,
  alt text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (club_id, id),
  foreign key (club_id, media_asset_id)
    references onzio.media_assets(club_id, id) on delete restrict
);

create table onzio.league_standings_settings (
  club_id uuid primary key references onzio.clubs(id) on delete restrict,
  eyebrow text not null default '',
  title text not null default '',
  intro text not null default '',
  updated_at timestamptz not null default now()
);

create table onzio.league_standings (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  team_name text not null,
  team_abbreviation text,
  logo_url text,
  logo_asset_id uuid,
  played integer not null default 0 check (played >= 0),
  wins integer not null default 0 check (wins >= 0),
  draws integer not null default 0 check (draws >= 0),
  losses integer not null default 0 check (losses >= 0),
  goal_difference integer not null default 0,
  points integer not null default 0,
  is_club boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, id),
  foreign key (club_id, logo_asset_id)
    references onzio.media_assets(club_id, id) on delete restrict
);

create table onzio.shop_kit_section (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  surface text not null check (surface in ('home', 'shop')),
  kit_variant text not null check (kit_variant in ('home', 'away')),
  eyebrow text not null default '',
  title text not null default '',
  description text not null default '',
  bullet_points jsonb not null default '[]'::jsonb,
  store_note text not null default '',
  cta_label text not null default '',
  cta_link text not null default '',
  updated_at timestamptz not null default now(),
  unique (club_id, id),
  unique (club_id, surface, kit_variant)
);

create table onzio.shop_kit_photos (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  surface text not null check (surface in ('home', 'shop')),
  kit_variant text not null check (kit_variant in ('home', 'away')),
  url text not null,
  media_asset_id uuid,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (club_id, id),
  foreign key (club_id, media_asset_id)
    references onzio.media_assets(club_id, id) on delete restrict
);

create table onzio.shop_carousel_photos (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  kit_variant text not null check (kit_variant in ('home', 'away')),
  url text not null,
  media_asset_id uuid,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (club_id, id),
  foreign key (club_id, media_asset_id)
    references onzio.media_assets(club_id, id) on delete restrict
);

create table onzio.shop_purchase_details (
  club_id uuid primary key references onzio.clubs(id) on delete restrict,
  heading text not null default '',
  cards jsonb not null default '[]'::jsonb,
  cta_eyebrow text not null default '',
  cta_text text not null default '',
  cta_label text not null default '',
  cta_link text not null default '',
  updated_at timestamptz not null default now()
);
