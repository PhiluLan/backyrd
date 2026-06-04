insert into public.profiles (
  id,
  contact_email,
  created_at,
  updated_at
)
values (
  '2cb0f982-2da1-4c18-a2de-10c064e1de2a',
  'testheylenny@gmail.com',
  now(),
  now()
)
on conflict (id) do nothing;