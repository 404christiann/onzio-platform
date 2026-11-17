-- Allow owner-edited HTTPS form destinations while preserving older homepage rows.
create or replace function onzio_private.check_cinematic_homepage(v jsonb) returns void
language plpgsql immutable security invoker set search_path='' as $$
declare k text; r jsonb; a jsonb; ids text[]:='{}'; asset uuid;
begin
 perform onzio_private.check_homepage_object(v,array['raffle','ticket','match','prices','championship','navigation','sponsors'],array['raffle','ticket','match','prices','championship','navigation','sponsors']);
 for a in select value from jsonb_each(jsonb_build_object('raffle',v->'raffle','ticket',v->'ticket','trophy',v#>'{championship,trophy}')) loop
  perform onzio_private.check_homepage_object(a,array['assetId','alt','visible'],array['assetId','alt']);
  if jsonb_typeof(a->'assetId') not in ('string','null') then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
  begin asset:=(a->>'assetId')::uuid; exception when invalid_text_representation then raise exception 'INVALID_PHOTO' using errcode='22023'; end;
  perform onzio_private.check_cinematic_text(a->'alt',1000);
 end loop;
 perform onzio_private.check_homepage_object(v->'raffle',array['assetId','alt'],array['assetId','alt']);
 perform onzio_private.check_homepage_object(v#>'{championship,trophy}',array['assetId','alt'],array['assetId','alt']);
 perform onzio_private.check_homepage_object(v->'ticket',array['assetId','alt','visible'],array['assetId','alt','visible']);
 if jsonb_typeof(v#>'{ticket,visible}') is distinct from 'boolean' then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
 perform onzio_private.check_homepage_object(v->'sponsors',array['heading'],array['heading']);
 perform onzio_private.check_cinematic_text(v#>'{sponsors,heading}',120);
 perform onzio_private.check_homepage_object(v->'match',array['heading','buttonLabel','buttonHref','emptyMessage'],array['heading','buttonLabel','buttonHref','emptyMessage']);
 perform onzio_private.check_cinematic_text(v#>'{match,heading}',120);
 perform onzio_private.check_cinematic_text(v#>'{match,buttonLabel}',60);
 perform onzio_private.check_cinematic_text(v#>'{match,buttonHref}',2000);
 perform onzio_private.check_cinematic_text(v#>'{match,emptyMessage}',1200);
 if (v#>>'{match,buttonHref}')!~'^/[-A-Za-z0-9_/?#=&%.]*$' or left(v#>>'{match,buttonHref}',2)='//' then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
 perform onzio_private.check_homepage_object(v->'prices',array['heading','rows','footnote'],array['heading','rows','footnote']);
 perform onzio_private.check_cinematic_text(v#>'{prices,heading}',120);
 perform onzio_private.check_cinematic_text(v#>'{prices,footnote}',1200);
 if jsonb_typeof(v#>'{prices,rows}') is distinct from 'array' or jsonb_array_length(v#>'{prices,rows}')>10 then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
 for r in select * from jsonb_array_elements(v#>'{prices,rows}') loop
  perform onzio_private.check_homepage_object(r,array['id','label','price','description','note','accent'],array['id','label','price','description','note','accent']);
  perform onzio_private.check_cinematic_text(r->'id',60);
  if length(r->>'id')=0 or (r->>'id')=any(ids) then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
  ids:=array_append(ids,r->>'id');
  perform onzio_private.check_cinematic_text(r->'label',120);
  perform onzio_private.check_cinematic_text(r->'price',60);
  perform onzio_private.check_cinematic_text(r->'description',1200);
  perform onzio_private.check_cinematic_text(r->'note',1200);
  if jsonb_typeof(r->'accent') is distinct from 'string' or (r->>'accent') not in ('none','aqua','lime') then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
 end loop;
 perform onzio_private.check_homepage_object(v->'championship',array['league','year','title','body','trophy'],array['league','year','title','body','trophy']);
 for k in select unnest(array['league','title']) loop perform onzio_private.check_cinematic_text(v#>array['championship',k],120); end loop;
 perform onzio_private.check_cinematic_text(v#>'{championship,year}',20);
 perform onzio_private.check_cinematic_text(v#>'{championship,body}',1200);
 perform onzio_private.check_homepage_object(v->'navigation',array['labels','destinations'],array['labels']);
 if v#>'{navigation,destinations}' is not null then
  perform onzio_private.check_homepage_object(v#>'{navigation,destinations}',array['tryouts','mediaCredentials'],array['tryouts','mediaCredentials']);
  for k,r in select * from jsonb_each(v#>'{navigation,destinations}') loop
   perform onzio_private.check_cinematic_text(r,2000);
   if r#>>'{}' <> '' and (r#>>'{}' !~ '^https://[^/[:space:]@?#]+([/?#][^[:space:]]*)?$' or btrim(r#>>'{}') is distinct from r#>>'{}') then
    raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023';
   end if;
  end loop;
 end if;
 perform onzio_private.check_homepage_object(v#>'{navigation,labels}',array['home','club','about','roster','club-crest','partners','tryouts','shop','stadium-group','stadium','stadium-parking','stadium-guidelines','chick-fil-a','know-before-you','fan-code','foothill-transit','media-credentials','tickets','schedule','news','injury-report','news-page','community','partnership','national-anthem','contact']);
 for k,r in select * from jsonb_each(v#>'{navigation,labels}') loop
  perform onzio_private.check_cinematic_text(r,60);
  if btrim(r#>>'{}')='' or btrim(r#>>'{}') is distinct from r#>>'{}' then raise exception 'INVALID_HOMEPAGE_PAYLOAD' using errcode='22023'; end if;
 end loop;
end $$;
