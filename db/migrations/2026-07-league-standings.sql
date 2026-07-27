-- Rose City FC editable homepage league standings.
-- Date: 2026-07
--
-- Run manually in the Supabase SQL editor. This is additive and seeds a
-- starter standings table that can be edited from /admin/standings.

CREATE TABLE IF NOT EXISTS public.league_standings_settings (
  id         integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  eyebrow    text NOT NULL DEFAULT 'League standings',
  title      text NOT NULL DEFAULT 'UPSL SoCal North',
  intro      text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.league_standings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_name         text NOT NULL,
  team_abbreviation text,
  logo_url          text,
  played            integer NOT NULL DEFAULT 0 CHECK (played >= 0),
  wins              integer NOT NULL DEFAULT 0 CHECK (wins >= 0),
  draws             integer NOT NULL DEFAULT 0 CHECK (draws >= 0),
  losses            integer NOT NULL DEFAULT 0 CHECK (losses >= 0),
  goal_difference   integer NOT NULL DEFAULT 0,
  points            integer NOT NULL DEFAULT 0 CHECK (points >= 0),
  is_club           boolean NOT NULL DEFAULT false,
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS league_standings_order_idx
ON public.league_standings (points DESC, goal_difference DESC, sort_order ASC);

INSERT INTO public.league_standings_settings (id, eyebrow, title, intro)
VALUES (
  1,
  'League standings',
  'UPSL SoCal North',
  'Follow Rose City FC through the current league table. Club staff can update every row from the admin portal.'
)
ON CONFLICT (id) DO NOTHING;

WITH seed(team_name, team_abbreviation, played, wins, draws, losses, goal_difference, points, is_club, sort_order) AS (
  VALUES
    ('Rose City FC', 'RC', 7, 5, 1, 1, 12, 16, true, 0),
    ('Ocelot FC', 'OC', 7, 4, 2, 1, 7, 14, false, 1),
    ('LA Sol Athletics', 'LA', 7, 4, 0, 3, 3, 12, false, 2),
    ('AMSG FC', 'AM', 7, 3, 2, 2, 1, 11, false, 3),
    ('AYSD D1', 'AY', 7, 3, 1, 3, -2, 10, false, 4),
    ('Montclair FC', 'MO', 7, 2, 2, 3, -4, 8, false, 5)
)
INSERT INTO public.league_standings (
  team_name,
  team_abbreviation,
  played,
  wins,
  draws,
  losses,
  goal_difference,
  points,
  is_club,
  sort_order
)
SELECT *
FROM seed
WHERE NOT EXISTS (SELECT 1 FROM public.league_standings);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('standings', 'standings', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

GRANT SELECT ON public.league_standings_settings TO anon, authenticated;
GRANT ALL ON public.league_standings_settings TO authenticated;
GRANT SELECT ON public.league_standings TO anon, authenticated;
GRANT ALL ON public.league_standings TO authenticated;

ALTER TABLE public.league_standings_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_standings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_standings_settings'
      AND policyname = 'Public can read league standings settings'
  ) THEN
    CREATE POLICY "Public can read league standings settings"
    ON public.league_standings_settings
    FOR SELECT
    TO anon, authenticated
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_standings_settings'
      AND policyname = 'Authenticated users can manage league standings settings'
  ) THEN
    CREATE POLICY "Authenticated users can manage league standings settings"
    ON public.league_standings_settings
    FOR ALL
    TO authenticated
    USING (id = 1)
    WITH CHECK (id = 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_standings'
      AND policyname = 'Public can read league standings'
  ) THEN
    CREATE POLICY "Public can read league standings"
    ON public.league_standings
    FOR SELECT
    TO anon, authenticated
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'league_standings'
      AND policyname = 'Authenticated users can manage league standings'
  ) THEN
    CREATE POLICY "Authenticated users can manage league standings"
    ON public.league_standings
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can upload standings logos'
  ) THEN
    CREATE POLICY "Authenticated users can upload standings logos"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'standings'
      AND (storage.foldername(name))[1] = 'teams'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can read standings logo metadata'
  ) THEN
    CREATE POLICY "Authenticated users can read standings logo metadata"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (bucket_id = 'standings');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated users can delete standings logos'
  ) THEN
    CREATE POLICY "Authenticated users can delete standings logos"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'standings'
      AND (storage.foldername(name))[1] = 'teams'
    );
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';

SELECT *
FROM public.league_standings_settings
WHERE id = 1;

SELECT team_name, team_abbreviation, played, wins, draws, losses, goal_difference, points, is_club
FROM public.league_standings
ORDER BY points DESC, goal_difference DESC, sort_order ASC;
