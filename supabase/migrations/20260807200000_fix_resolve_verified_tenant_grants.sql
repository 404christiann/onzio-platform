-- Restores the EXECUTE grant on onzio.resolve_verified_tenant(text, text)
-- that 20260727171658_phase7_private_preview_resolution.sql already intended
-- (its own GRANT statement is right there in that migration), but which is
-- not currently in effect in production.
--
-- Discovered 2026-08-07 while verifying DCFC-802: this RPC is middleware's
-- fallback tenant lookup, used only for admin/billing paths when the direct
-- (RLS-filtered) lookup comes back empty -- i.e. only for a non-live tenant.
-- Rose City has always been public_access=live, so its direct lookup always
-- succeeds and this fallback has never actually been exercised in production
-- until Diverse City (a preview tenant) needed it today, 404ing on
-- /admin/login for every visitor including its own owner. Not something this
-- rollout broke -- something it was first to expose.
--
-- onzio_private.resolve_verified_tenant (the security definer function this
-- wraps) already has the grant; only the onzio-schema public wrapper does
-- not. This statement is idempotent and safe to reapply.
grant execute on function onzio.resolve_verified_tenant(text, text)
  to anon, authenticated, service_role;
