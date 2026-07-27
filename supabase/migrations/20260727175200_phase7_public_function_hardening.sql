-- Phase 7: Supabase's public-schema RLS event-trigger helper runs as the
-- postgres owner and is not an application RPC. Keep it unavailable to API
-- roles while preserving its automatic event-trigger behavior.

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public;
    revoke execute on function public.rls_auto_enable()
      from anon, authenticated, service_role;
  end if;
end;
$$;
