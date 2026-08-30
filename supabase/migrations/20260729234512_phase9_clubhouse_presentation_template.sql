-- Onzio Platform Phase 9: allow the Lions mockup-derived clubhouse template
-- to be persisted as a normal published presentation document.

alter table onzio.presentation_documents
  drop constraint presentation_documents_template_id_check;

alter table onzio.presentation_documents
  add constraint presentation_documents_template_id_check
  check (template_id in ('cinematic', 'heritage', 'clubhouse'));

notify pgrst, 'reload schema';
