-- Optional per-match league artwork, using the existing Schedule/media owners.
alter table onzio.matches
  add column league_logo_url text,
  add column league_logo_asset_id uuid,
  add constraint matches_league_logo_url_check check (
    league_logo_url is null or (
      length(league_logo_url) <= 2048
      and league_logo_url ~ '^(https?://|/[^/\\])'
    )
  ),
  add constraint matches_club_id_league_logo_asset_id_fkey
    foreign key (club_id, league_logo_asset_id)
    references onzio.media_assets(club_id, id);

-- Retain the existing tenant policies/grants and reference-safe retirement.
create trigger guard_league_logo_asset_id_media_reference
  before insert or update of league_logo_asset_id on onzio.matches
  for each row execute function onzio_private.guard_media_reference('league_logo_asset_id','asset');
create trigger guard_league_logo_url_media_url
  before insert or update of league_logo_url on onzio.matches
  for each row execute function onzio_private.guard_media_reference('league_logo_url','url');

comment on column onzio.matches.league_logo_asset_id is
  'Editable league image for Schedule; must reference published media owned by the same club.';
