-- Let public Programs and Tryouts opt into one native registration form while
-- preserving their existing external CTA fields as the fail-closed fallback.

alter table onzio.programs
  add column registration_form_id uuid,
  add constraint programs_registration_form_tenant_fkey
    foreign key (club_id, registration_form_id)
    references onzio.registration_forms(club_id, id)
    on delete restrict;

alter table onzio.tryouts
  add column registration_form_id uuid,
  add constraint tryouts_registration_form_tenant_fkey
    foreign key (club_id, registration_form_id)
    references onzio.registration_forms(club_id, id)
    on delete restrict;

create index programs_registration_form_idx
  on onzio.programs (club_id, registration_form_id)
  where registration_form_id is not null;

create index tryouts_registration_form_idx
  on onzio.tryouts (club_id, registration_form_id)
  where registration_form_id is not null;
