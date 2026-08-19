-- CV United C1: register the crest@1 presentation template as a valid template_id
-- for onzio.presentation_documents. Schema-only; the TS registry lands with
-- this step and the crest@1 sections and pages land in sibling steps.

alter table onzio.presentation_documents
  drop constraint presentation_documents_template_id_check;

alter table onzio.presentation_documents
  add constraint presentation_documents_template_id_check
  check (template_id in ('cinematic', 'heritage', 'clubhouse', 'academy', 'editorial', 'pathway', 'crest'));

notify pgrst, 'reload schema';
