select
  s.id,
  s.name,
  s.city,

  c.name as category,

  -- Spot Photos
  (
    select json_agg(sp.url)
    from spot_photos sp
    where sp.spot_id = s.id
    limit 5
  ) as photos,

  -- Review Count
  (
    select count(*)
    from reviews r
    where r.spot_id = s.id
  ) as review_count,

  -- Sample Reviews
  (
    select json_agg(
      json_build_object(
        'text', r.text,
        'mood_a', r.mood_a,
        'mood_b', r.mood_b
      )
    )
    from (
      select *
      from reviews
      where spot_id = s.id
      order by created_at desc
      limit 3
    ) r
  ) as sample_reviews

from spots s
left join categories c on c.id = s.category_id

order by random()
limit 20;