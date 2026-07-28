-- Phase 7: resolve verified tenant hosts for private-preview admin entry
-- without making preview tenant rows anonymously readable.

create or replace function onzio_private.resolve_verified_tenant(
  p_hostname text,
  p_environment text
)
returns table (
  id uuid,
  slug text,
  lifecycle text,
  public_access text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    club.id,
    club.slug,
    club.lifecycle,
    club.public_access
  from onzio.club_domains domain
  join onzio.clubs club
    on club.id = domain.club_id
  where domain.hostname = lower(trim(trailing '.' from p_hostname))
    and domain.environment = p_environment
    and p_environment in ('staging', 'production')
    and domain.active
    and domain.verified_at is not null
    and club.lifecycle <> 'archived'
  limit 1;
$$;

revoke all on function onzio_private.resolve_verified_tenant(text, text)
  from public;
grant execute on function onzio_private.resolve_verified_tenant(text, text)
  to anon, authenticated, service_role;

create or replace function onzio.resolve_verified_tenant(
  p_hostname text,
  p_environment text
)
returns table (
  id uuid,
  slug text,
  lifecycle text,
  public_access text
)
language sql
stable
security invoker
set search_path to ''
as $$
  select *
  from onzio_private.resolve_verified_tenant(p_hostname, p_environment);
$$;

revoke all on function onzio.resolve_verified_tenant(text, text) from public;
grant execute on function onzio.resolve_verified_tenant(text, text)
  to anon, authenticated, service_role;
