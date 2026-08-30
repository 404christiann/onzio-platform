-- Lions E1: register the editorial@1 presentation template as a valid
-- template_id for onzio.presentation_documents. This phase is schema-only;
-- the TS registry and the actual editorial pages land in later phases.

alter table onzio.presentation_documents
  drop constraint presentation_documents_template_id_check;

alter table onzio.presentation_documents
  add constraint presentation_documents_template_id_check
  check (template_id in ('cinematic', 'heritage', 'clubhouse', 'academy', 'editorial'));

notify pgrst, 'reload schema';
