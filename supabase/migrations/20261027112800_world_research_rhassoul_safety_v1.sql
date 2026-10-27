-- Rhassoul is a clay treatment, not the German safety term inside its name.
-- Ignore only that exact standalone word before applying the unchanged detector.
-- Existing held claims remain held and require the normal explicit Admin review.
begin;
create or replace function world_knowledge_private.text_requires_shadow_v1(p_attribute_key text,p_value jsonb)
returns boolean language sql immutable security invoker set search_path='' as $$
  select p_attribute_key in ('description.highlight','description.discovery_source','discovery.profile','experience.profile')
    and pg_catalog.regexp_replace(
      case when p_attribute_key in ('discovery.profile','experience.profile') then coalesce(p_value::text,'') else coalesce(p_value#>>'{}','') end,
      '\mRhassoul\M','','gi'
    ) ~* '(rassist|nazi|\mhate(s|d|rs?|ful(ly|ness)?|speech)?\M|hass|kill|illegal|verboten)';
$$;
comment on function world_knowledge_private.text_requires_shadow_v1(text,jsonb) is
  'Existing safety scope and terms; ignore only standalone Rhassoul treatment name to prevent its internal hass substring from holding legitimate wellness profiles. Other safety terms and existing held claims remain unchanged.';
commit;
