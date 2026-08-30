-- DCFC-304: persist the already-registered academy@1 presentation as a normal
-- tenant template. DCFC-203 registered and contract-tested the application
-- template; local admin-to-public acceptance exposed the remaining database
-- constraint that still allowed only the three older template ids.

alter table onzio.presentation_documents
  drop constraint presentation_documents_template_id_check;

alter table onzio.presentation_documents
  add constraint presentation_documents_template_id_check
  check (template_id in ('cinematic', 'heritage', 'clubhouse', 'academy'));

notify pgrst, 'reload schema';
