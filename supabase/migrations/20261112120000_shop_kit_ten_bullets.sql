-- RC2027-HOME-UPDATE: jersey sections may list up to ten bullet points (Sam's 2027 Home lists nine).
-- Mirrors MAX_KIT_BULLET_POINTS in lib/shop-kit.ts and the Shop editor contract.
create or replace function onzio_private.validate_shop_section(p_section jsonb,p_editorial boolean) returns void
language plpgsql immutable security invoker set search_path='' as $$
declare key text; value jsonb; bullet jsonb;
begin
  perform onzio_private.check_shop_object(p_section,array['eyebrow','title','description','bullet_points','store_note','cta_label','cta_link'],
    array['eyebrow','title','description','bullet_points','store_note','cta_label','cta_link']);
  for key,value in select * from jsonb_each(p_section) loop
    if key='bullet_points' then
      if jsonb_typeof(value)<>'array' or jsonb_array_length(value)>10 then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
      for bullet in select * from jsonb_array_elements(value) loop
        if jsonb_typeof(bullet)<>'string' or char_length(bullet#>>'{}')>80 then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
      end loop;
      if not p_editorial and jsonb_array_length(value)=0 then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
    elsif jsonb_typeof(value)<>'string' or char_length(value#>>'{}') > (case key when 'description' then 3000 when 'cta_link' then 2048 when 'store_note' then 180 when 'title' then 240 else 160 end) then
      raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023';
    end if;
  end loop;
  if (p_section->>'cta_link')<>'' and (p_section->>'cta_link')!~*'^https?://[^[:space:]]+$'
    and (p_section->>'cta_link')!~'^/[-A-Za-z0-9_/?#=&%.]*$' then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
end $$;
revoke all on function onzio_private.validate_shop_section(jsonb,boolean) from public,anon;
grant execute on function onzio_private.validate_shop_section(jsonb,boolean) to authenticated;

notify pgrst,'reload schema';
