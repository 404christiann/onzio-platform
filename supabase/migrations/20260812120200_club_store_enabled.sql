-- Lions E1: operator-only toggle for the public store surface.

alter table onzio.clubs
  add column store_enabled boolean not null default false;

comment on column onzio.clubs.store_enabled is
  'Operator-only switch for the public store surface. Not tier-derived, not club-self-service; set via operator script/SQL only.';

-- Existing clubs keep their live stores: this is provably not a behavior change.
update onzio.clubs set store_enabled = true;

notify pgrst, 'reload schema';
