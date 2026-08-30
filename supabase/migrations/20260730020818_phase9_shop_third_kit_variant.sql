alter table onzio.shop_kit_section
  drop constraint shop_kit_section_kit_variant_check;

alter table onzio.shop_kit_section
  add constraint shop_kit_section_kit_variant_check
  check (kit_variant in ('home', 'third', 'away'));

alter table onzio.shop_kit_photos
  drop constraint shop_kit_photos_kit_variant_check;

alter table onzio.shop_kit_photos
  add constraint shop_kit_photos_kit_variant_check
  check (kit_variant in ('home', 'third', 'away'));

alter table onzio.shop_carousel_photos
  drop constraint shop_carousel_photos_kit_variant_check;

alter table onzio.shop_carousel_photos
  add constraint shop_carousel_photos_kit_variant_check
  check (kit_variant in ('home', 'third', 'away'));

notify pgrst, 'reload schema';
