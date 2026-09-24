-- MLA P1: register the pathway@1 presentation template as a valid
-- template_id for onzio.presentation_documents. Schema-only; the TS registry
-- and the pathway pages land in sibling Phase 1 steps.

alter table onzio.presentation_documents
  drop constraint presentation_documents_template_id_check;

alter table onzio.presentation_documents
  add constraint presentation_documents_template_id_check
  check (template_id in ('cinematic', 'heritage', 'clubhouse', 'academy', 'editorial', 'pathway'));

notify pgrst, 'reload schema';
