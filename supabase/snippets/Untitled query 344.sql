select
  u.id,
  u.email,
  p.id as profile_id,
  p.contact_email
from auth.users u
left join public.profiles p on p.id = u.id
where lower(u.email) = lower('testheylenny@gmail.com');