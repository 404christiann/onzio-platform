-- Hosted Supabase security-advisor hardening for the two exposed-schema
-- PLAT-102 service-role RPC wrappers. Their bodies already fully qualify every
-- referenced object; pinning an empty path removes role-dependent resolution.

alter function onzio.apply_stripe_projection(
  text, text, timestamptz, text, uuid, text, text, text, text,
  boolean, timestamptz, timestamptz, text, text
) set search_path = '';

alter function onzio.run_billing_lifecycle(
  timestamptz, boolean, boolean
) set search_path = '';
