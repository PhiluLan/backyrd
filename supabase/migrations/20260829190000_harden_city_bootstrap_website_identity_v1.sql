-- Fail closed when bootstrap contact evidence identifies another brand,
-- tenant, operator or stale venue. Existing Product history is preserved; the
-- server-only worker audits existing rows and requires explicit remediation.

create or replace function public.backyrd_city_bootstrap_website_matches_name_v1(p_name text,p_url text)
returns boolean language plpgsql stable set search_path=public,pg_catalog as $$
declare v_name text;v_url_identity text;v_tokens text[];v_host text;v_path text;v_all_match boolean;v_any_match boolean;v_strict_host boolean;v_path_has_competing_identity boolean;
begin
  if p_url is null or btrim(p_url)='' then return true;end if;
  v_host:=public.backyrd_research_public_host_v1(p_url);
  if v_host is null or p_url!~'^https://[^[:space:]]+$' then return false;end if;
  v_name:=regexp_replace(lower(public.unaccent(coalesce(p_name,''))),'[^a-z0-9]+',' ','g');
  v_url_identity:=regexp_replace(lower(public.unaccent(p_url)),'[^a-z0-9]+','','g');
  v_tokens:=array(select token from unnest(regexp_split_to_array(v_name,' +')) token
    where length(token)>=2 and token not in ('basel','restaurant','restaurants','cafe','bar','bars','hotel','hotels','hostel','museum','museums','theater','theatre','fitness','studio','club','zentrum','center','centre','schweiz','switzerland','official','page','about','www','com','ch','de','und','and','am','an','der','die','das','zum','zur','im','in','of','at','place','brewery','kitchen','soulfood','pizza','pizzeria','sushi','food','confiserie','konditorei','tea','room','bistrot','gasthof','restauration'));
  if coalesce(cardinality(v_tokens),0)=0 then return false;end if;
  select bool_and(position(token in v_url_identity)>0),bool_or(position(token in v_url_identity)>0)
    into v_all_match,v_any_match from unnest(v_tokens) token;
  if v_all_match then return true;end if;
  v_strict_host:=exists(select 1 from unnest(array['facebook.com','instagram.com','linkedin.com','tiktok.com','twitter.com','x.com','linktr.ee','wixsite.com']) expected
    where v_host=expected or v_host like '%.'||expected);
  if v_strict_host then return false;end if;
  if not v_any_match then return true;end if;
  v_path:=split_part(regexp_replace(lower(public.unaccent(p_url)),'^https://[^/]+/?','','i'),'?',1);
  v_path_has_competing_identity:=exists(
    select 1 from unnest(regexp_split_to_array(regexp_replace(v_path,'[^a-z0-9]+',' ','g'),' +')) token
    where token~'^[a-z]{2,}$' and token<>all(v_tokens)
      and token not in ('basel','restaurant','restaurants','cafe','bar','bars','hotel','hotels','hostel','museum','museums','theater','theatre','fitness','studio','club','zentrum','center','centre','schweiz','switzerland','official','page','about','www','com','ch','de','und','and','am','an','der','die','das','zum','zur','im','in','of','at','place','brewery','kitchen','soulfood','pizza','pizzeria','sushi','food','confiserie','konditorei','tea','room','bistrot','gasthof','restauration','angebot','angebote','location','locations','standort','standorte','detail','index','html','php','store','locator','search','spielplatz','spielplaetze','schwimmbad','reservieren','suite','suites','stadt'));
  -- Partial overlap plus another concrete path identity identifies a sibling or
  -- subentity. Zero overlap is only unknown, never positive evidence.
  return not v_path_has_competing_identity;
end $$;
revoke all on function public.backyrd_city_bootstrap_website_matches_name_v1(text,text) from public,anon,authenticated,service_role;

create or replace function public.backyrd_city_bootstrap_enforce_website_identity_v1()
returns trigger language plpgsql set search_path=public,pg_catalog as $$
begin
  if new.lifecycle_state in ('PRODUCT_ELIGIBLE','PUBLISHED') and not public.backyrd_city_bootstrap_website_matches_name_v1(new.display_name,new.website) then
    raise exception 'city_bootstrap_website_identity_ambiguous' using errcode='22023';
  end if;
  return new;
end $$;
revoke all on function public.backyrd_city_bootstrap_enforce_website_identity_v1() from public,anon,authenticated,service_role;
drop trigger if exists trg_backyrd_city_bootstrap_website_identity_v1 on public.backyrd_city_bootstrap_candidates_v1;
create trigger trg_backyrd_city_bootstrap_website_identity_v1 before insert or update of lifecycle_state,display_name,website on public.backyrd_city_bootstrap_candidates_v1 for each row execute function public.backyrd_city_bootstrap_enforce_website_identity_v1();
