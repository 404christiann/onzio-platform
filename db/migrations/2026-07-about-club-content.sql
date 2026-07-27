-- Editable About Club and Club Logo page content.

create table if not exists about_page_content (
  id integer primary key default 1 check (id = 1),
  hero_title text not null default 'About Club',
  story_paragraphs text[] not null default '{}',
  feature_image_url text not null,
  values_heading text not null default 'Our Values',
  values jsonb not null default '[]'::jsonb,
  closing_text text not null,
  closing_cta_label text not null,
  closing_cta_href text not null,
  updated_at timestamptz not null default now()
);

create table if not exists club_logo_page_content (
  id integer primary key default 1 check (id = 1),
  annotated_image_url text not null,
  features jsonb not null default '[]'::jsonb,
  map_image_url text not null,
  color_cards jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table club_logo_page_content
  add column if not exists color_cards jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('about-page', 'about-page', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table about_page_content enable row level security;
alter table club_logo_page_content enable row level security;

grant select on about_page_content to anon, authenticated;
grant all on about_page_content to authenticated;
grant select on club_logo_page_content to anon, authenticated;
grant all on club_logo_page_content to authenticated;

drop policy if exists "Public can read about page content" on about_page_content;
create policy "Public can read about page content"
  on about_page_content for select
  using (true);

drop policy if exists "Authenticated admins can manage about page content" on about_page_content;
create policy "Authenticated admins can manage about page content"
  on about_page_content for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Public can read club logo page content" on club_logo_page_content;
create policy "Public can read club logo page content"
  on club_logo_page_content for select
  using (true);

drop policy if exists "Authenticated admins can manage club logo page content" on club_logo_page_content;
create policy "Authenticated admins can manage club logo page content"
  on club_logo_page_content for all
  to authenticated
  using (true)
  with check (true);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can upload about page images'
  ) then
    create policy "Authenticated users can upload about page images"
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'about-page'
      and (storage.foldername(name))[1] = 'content'
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can read about page image metadata'
  ) then
    create policy "Authenticated users can read about page image metadata"
    on storage.objects
    for select
    to authenticated
    using (bucket_id = 'about-page');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can update about page images'
  ) then
    create policy "Authenticated users can update about page images"
    on storage.objects
    for update
    to authenticated
    using (
      bucket_id = 'about-page'
      and (storage.foldername(name))[1] = 'content'
    )
    with check (
      bucket_id = 'about-page'
      and (storage.foldername(name))[1] = 'content'
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can delete about page images'
  ) then
    create policy "Authenticated users can delete about page images"
    on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'about-page'
      and (storage.foldername(name))[1] = 'content'
    );
  end if;
end
$$;

insert into about_page_content (
  id,
  hero_title,
  story_paragraphs,
  feature_image_url,
  values_heading,
  values,
  closing_text,
  closing_cta_label,
  closing_cta_href
) values (
  1,
  'About Club',
  array[
    'Rose City FC was founded to give Pasadena a semi-professional club it could call its own. What started as a small group with a shared idea has grown into a full roster, a coaching staff, and a matchday community that fills the stands at Arcadia City Hall Stadium.',
    'Since our first season in the UPSL, the club has built its identity on disciplined, attacking soccer and a refusal to be outworked. That identity carried us to a UPSL Championship in 2024 - a milestone we treat as a beginning, not a destination.',
    'Today, Rose City FC is building toward the next level - investing in player development, deepening our roots in the Pasadena community, and giving local talent a real pathway forward in the sport.'
  ],
  '/images/home/homepageSlideShowPic1.jpeg',
  'Our Values',
  '[
    {
      "title": "Community",
      "description": "Rose City FC belongs to Pasadena - every matchday is a reason for this city to gather."
    },
    {
      "title": "Competition",
      "description": "We compete to win. Every season, every match, every training session is a step toward silverware."
    },
    {
      "title": "Character",
      "description": "On the pitch and off it, the club is built by players and staff who represent this crest with pride."
    }
  ]'::jsonb,
  'Join us at Arcadia City Hall Stadium this season.',
  'See the Schedule',
  '/schedule'
) on conflict (id) do nothing;

insert into club_logo_page_content (
  id,
  annotated_image_url,
  features,
  map_image_url,
  color_cards
) values (
  1,
  'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/Aboutassets/ClubLogo_initial_image.png',
  jsonb_build_array(
    jsonb_build_object(
      'title', 'The Name',
      'icon_url', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/Aboutassets/Rose%20City%20FC%20Rose%20City%20Futbol%20Club.png',
      'icon_size', 70,
      'icon_scale', 2.25,
      'patch_url', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/Aboutassets/Rose%20City%20FC%20Patch%20Rose%20City%20Futbol%20Club.png',
      'description', 'Rose City''s crest reflects Pasadena''s rich history and what makes the city special as a global city.'
    ),
    jsonb_build_object(
      'title', 'The Rose',
      'icon_url', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/Aboutassets/Rose%20City%20FC%20Red%20Rose.png',
      'icon_size', 50,
      'icon_scale', 2.25,
      'patch_url', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/Aboutassets/Rose%20City%20FC%20Patch%20Rose.png',
      'description', 'The rose symbolizes the world-famous Rose Parade that began January 1, 1890 and has run every year since. Residents, many from the snowy Midwest, covered their horse-drawn wagons in roses to display the area''s vitality in winter.'
    ),
    jsonb_build_object(
      'title', 'The #23',
      'icon_url', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/Aboutassets/Rose%20City%20FC%2023.png',
      'icon_size', 90,
      'icon_scale', 1.22,
      'patch_url', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/Aboutassets/Rose%20City%20FC%20Patch_23.png',
      'description', 'Pasadena''s 23 square miles is home to 138,000 residents, the Rose Bowl stadium, and is located at the northern origin of the 110 freeway, the first freeway in the U.S.'
    ),
    jsonb_build_object(
      'title', 'The Crown',
      'icon_url', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/Aboutassets/Rose%20City%20FC%20Crown.png',
      'icon_size', 70,
      'icon_scale', 1.45,
      'patch_url', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/Aboutassets/Rose%20City%20FC%20Patch%20Crown.png',
      'description', 'The San Gabriel Mountains crown the area with rugged majesty. Hiking trails lead to mountain peaks overseeing the entire Los Angeles basin.'
    ),
    jsonb_build_object(
      'title', 'The Key',
      'icon_url', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/Aboutassets/Rose%20City%20FC%20Key.png',
      'icon_size', 50,
      'icon_scale', 2.25,
      'patch_url', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/Aboutassets/Rose%20City%20FC%20Patch%20Key.png',
      'description', 'Pasadena is the most prominent city in the San Gabriel Valley and derives its name from the Chippewa language meaning "Key of the Valley" and "Crown of the Valley." Pasadena is "key" to artistic, educational, and scientific institutions of global renown.'
    )
  ),
  'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/Aboutassets/Rose%20City%20FC%20Official%20Pasadena%20Map%202027.png',
  jsonb_build_array(
    jsonb_build_object(
      'label', 'Rose Parade Red',
      'image_url', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/Aboutassets/hexColors/Rose%20CIty%20FC%20Brand%20Identity%20Rose%20Parade%20Red%20Color%20Black.png'
    ),
    jsonb_build_object(
      'label', '12AM Midnight',
      'image_url', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/Aboutassets/hexColors/Rose%20CIty%20FC%20Brand%20Identity%2012am%20at%20Midnight%20Color%20Black.png'
    ),
    jsonb_build_object(
      'label', 'Faded White',
      'image_url', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/Aboutassets/hexColors/Rose%20CIty%20FC%20Brand%20Identity%20Faded%20White%20Color%20Black.png'
    ),
    jsonb_build_object(
      'label', 'Rose Stem Green',
      'image_url', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/Aboutassets/hexColors/Rose%20CIty%20FC%20Brand%20Identity%20Rose%20Stem%20Color%20Black.png'
    ),
    jsonb_build_object(
      'label', 'Steel',
      'image_url', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/Aboutassets/hexColors/Rose%20CIty%20FC%20Brand%20Identity%20Steel%20Color%20Black.png'
    ),
    jsonb_build_object(
      'label', 'Parrot',
      'image_url', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/Aboutassets/hexColors/Rose%20CIty%20FC%20Brand%20Identity%20Parrot%20Colors%20Black.png'
    )
  )
) on conflict (id) do nothing;

update club_logo_page_content
set color_cards = jsonb_build_array(
  jsonb_build_object(
    'label', 'Rose Parade Red',
    'image_url', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/Aboutassets/hexColors/Rose%20CIty%20FC%20Brand%20Identity%20Rose%20Parade%20Red%20Color%20Black.png'
  ),
  jsonb_build_object(
    'label', '12AM Midnight',
    'image_url', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/Aboutassets/hexColors/Rose%20CIty%20FC%20Brand%20Identity%2012am%20at%20Midnight%20Color%20Black.png'
  ),
  jsonb_build_object(
    'label', 'Faded White',
    'image_url', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/Aboutassets/hexColors/Rose%20CIty%20FC%20Brand%20Identity%20Faded%20White%20Color%20Black.png'
  ),
  jsonb_build_object(
    'label', 'Rose Stem Green',
    'image_url', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/Aboutassets/hexColors/Rose%20CIty%20FC%20Brand%20Identity%20Rose%20Stem%20Color%20Black.png'
  ),
  jsonb_build_object(
    'label', 'Steel',
    'image_url', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/Aboutassets/hexColors/Rose%20CIty%20FC%20Brand%20Identity%20Steel%20Color%20Black.png'
  ),
  jsonb_build_object(
    'label', 'Parrot',
    'image_url', 'https://nsgtkwqkbyxkiwrhzsje.supabase.co/storage/v1/object/public/Aboutassets/hexColors/Rose%20CIty%20FC%20Brand%20Identity%20Parrot%20Colors%20Black.png'
  )
)
where id = 1
  and (color_cards is null or jsonb_array_length(color_cards) = 0);

notify pgrst, 'reload schema';
