begin;

create or replace function public.get_mobile_spot_taxonomy_v1(
  p_spot_id uuid,
  p_locale text default 'de'
)
returns table(
  taxonomy_node_id uuid,
  slug text,
  node_type text,
  label text,
  icon text,
  color text,
  sort_order integer,
  source text,
  confidence numeric,
  is_verified boolean,
  ml_weight numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    n.id,
    n.slug,
    n.node_type,
    coalesce(tr.label, de.label, n.slug),
    n.icon,
    n.color,
    n.sort_order,
    st.source,
    st.confidence,
    st.is_verified,
    n.ml_weight
  from public.spot_taxonomies st
  join public.taxonomy_nodes n on n.id = st.taxonomy_node_id
  left join public.taxonomy_node_translations tr
    on tr.taxonomy_node_id = n.id
   and tr.locale = coalesce(nullif(trim(p_locale), ''), 'de')
  left join public.taxonomy_node_translations de
    on de.taxonomy_node_id = n.id and de.locale = 'de'
  where st.spot_id = p_spot_id
    and n.is_active = true
  order by
    case n.node_type
      when 'subcategory' then 1
      when 'feature' then 2
      when 'offering' then 3
      when 'service' then 4
      else 5
    end,
    st.is_verified desc,
    n.ml_weight desc,
    n.sort_order,
    coalesce(tr.label, de.label, n.slug);
$$;

grant execute on function public.get_mobile_spot_taxonomy_v1(uuid, text)
to anon, authenticated;

commit;
