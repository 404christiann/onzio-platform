-- ADMIN-PLATFORM-FIXES-02: a kit's buy link may be an email address
-- ("order by email", admin redesign decision 0008 as amended).
--
-- Diverse City's Shop-page kit was imported with a `mailto:` order link, but
-- validate_shop_section only accepted http(s) or a local path. Because a Shop
-- save sends the whole kit section, every Shop-page edit for that club failed
-- until the owner replaced the email with a web address.
--
-- This replaces only the kit-section validator (same signature, same
-- immutable invoker execution, empty search path and grants). It additionally
-- accepts `mailto:` with one address and an optional query such as
-- `?subject=`. The purchase-details closing button keeps its http(s)-only rule,
-- and load_shop_page/save_shop_page are unchanged.
create or replace function onzio_private.validate_shop_section(p_section jsonb) returns void
language plpgsql immutable security invoker set search_path='' as $$
declare key text; value jsonb; bullet jsonb;
begin
  perform onzio_private.check_shop_object(p_section,array['eyebrow','title','description','bullet_points','store_note','cta_label','cta_link'],
    array['eyebrow','title','description','bullet_points','store_note','cta_label','cta_link']);
  for key,value in select * from jsonb_each(p_section) loop
    if key='bullet_points' then
      if jsonb_typeof(value)<>'array' or jsonb_array_length(value)>8 then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
      for bullet in select * from jsonb_array_elements(value) loop
        if jsonb_typeof(bullet)<>'string' or char_length(bullet#>>'{}')>80 then raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023'; end if;
      end loop;
    elsif jsonb_typeof(value)<>'string' or char_length(value#>>'{}') > (case key when 'description' then 3000 when 'cta_link' then 2048 when 'store_note' then 180 when 'title' then 240 else 160 end) then
      raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023';
    end if;
  end loop;
  if (p_section->>'cta_link')<>'' and (p_section->>'cta_link')!~*'^https?://[^[:space:]]+$'
    and (p_section->>'cta_link')!~'^/[-A-Za-z0-9_/?#=&%.]*$'
    and (p_section->>'cta_link')!~*'^mailto:[^[:space:]@?/]+@[^[:space:]@?/]+\.[^[:space:]@?/]+(\?[^[:space:]]*)?$' then
    raise exception 'INVALID_SHOP_PAYLOAD' using errcode='22023';
  end if;
end $$;
revoke all on function onzio_private.validate_shop_section(jsonb) from public,anon;
grant execute on function onzio_private.validate_shop_section(jsonb) to authenticated;

notify pgrst,'reload schema';
