-- Optional per-match replay video for the cinematic@2 Home page.
-- Stored only in the canonical embed form produced by lib/youtube-embed.ts;
-- blank (null or '') means no replay yet and the Home page shows its placeholder.
alter table onzio.matches
  add column replay_video_url text,
  add constraint matches_replay_video_url_check check (
    replay_video_url is null
    or replay_video_url = ''
    or replay_video_url ~ '^https://www\.youtube\.com/embed/[A-Za-z0-9_-]{11}\?rel=0$'
  );

comment on column onzio.matches.replay_video_url is
  'Owner-edited YouTube replay for a played match, as https://www.youtube.com/embed/<id>?rel=0.';

notify pgrst, 'reload schema';
