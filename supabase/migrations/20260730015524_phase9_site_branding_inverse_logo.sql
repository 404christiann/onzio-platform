alter table onzio.site_branding
  add column inverse_logo_path text not null default '',
  add column inverse_logo_asset_id uuid;

alter table onzio.site_branding
  add constraint site_branding_club_id_inverse_logo_asset_id_fkey
  foreign key (club_id, inverse_logo_asset_id)
  references onzio.media_assets(club_id, id)
  on delete restrict;

notify pgrst, 'reload schema';
