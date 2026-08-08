begin;

create or replace function public.search_mobile_taxonomy_spots_v1(
  p_query text,
  p_locale text default 'de',
  p_limit integer default 100
)
returns table(
  spot_id uuid,
  matched_labels text[],
  match_score numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with input as (
    select lower(trim(coalesce(p_query, ''))) as query
  ),
  matching_nodes as (
    select
      n.id as taxonomy_node_id,
      coalesce(tr.label, de.label, n.slug) as matched_label,
      greatest(
        case
          when lower(coalesce(tr.label, de.label, n.slug)) = i.query then 1.00
          when lower(coalesce(tr.label, de.label, n.slug)) like i.query || '%' then 0.92
          when lower(coalesce(tr.label, de.label, n.slug)) like '%' || i.query || '%' then 0.82
          else 0
        end,
        case
          when lower(n.slug) = i.query then 0.95
          when lower(n.slug) like '%' || i.query || '%' then 0.75
          else 0
        end,
        coalesce((
          select max(
            case
              when lower(s.synonym) = i.query then 0.96 * s.weight
              when lower(s.synonym) like i.query || '%' then 0.88 * s.weight
              when lower(s.synonym) like '%' || i.query || '%' then 0.78 * s.weight
              else 0
            end
          )
          from public.taxonomy_synonyms s
          where s.taxonomy_node_id = n.id
            and s.locale in (coalesce(nullif(trim(p_locale), ''), 'de'), 'de')
        ), 0)
      ) * n.ml_weight as node_score
    from public.taxonomy_nodes n
    cross join input i
    left join public.taxonomy_node_translations tr
      on tr.taxonomy_node_id = n.id
     and tr.locale = coalesce(nullif(trim(p_locale), ''), 'de')
    left join public.taxonomy_node_translations de
      on de.taxonomy_node_id = n.id
     and de.locale = 'de'
    where n.is_active = true
      and char_length(i.query) >= 4
      and (
        lower(coalesce(tr.label, de.label, n.slug)) like '%' || i.query || '%'
        or lower(n.slug) like '%' || i.query || '%'
        or exists (
          select 1
          from public.taxonomy_synonyms s
          where s.taxonomy_node_id = n.id
            and s.locale in (coalesce(nullif(trim(p_locale), ''), 'de'), 'de')
            and lower(s.synonym) like '%' || i.query || '%'
        )
      )
  )
  select
    st.spot_id,
    array_agg(distinct mn.matched_label order by mn.matched_label),
    max(mn.node_score * greatest(st.confidence, 0.25))::numeric
  from matching_nodes mn
  join public.spot_taxonomies st on st.taxonomy_node_id = mn.taxonomy_node_id
  join public.spots sp on sp.id = st.spot_id
  where sp.status = 'approved'
  group by st.spot_id
  order by max(mn.node_score * greatest(st.confidence, 0.25)) desc, st.spot_id
  limit greatest(1, least(coalesce(p_limit, 100), 200));
$$;

grant execute on function public.search_mobile_taxonomy_spots_v1(text, text, integer)
to anon, authenticated;

commit;
