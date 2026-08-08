-- 20260411100109_rls.sql
-- Erste saubere RLS-Basis für Multi-Client-Betrieb

alter table public.profiles enable row level security;
alter table public.spots enable row level security;
alter table public.spot_photos enable row level security;
alter table public.reviews enable row level security;
alter table public.review_photos enable row level security;
alter table public.mood_tokens enable row level security;
alter table public.spot_moods enable row level security;
alter table public.favorites enable row level security;
alter table public.follows enable row level security;
alter table public.reservations enable row level security;
alter table public.categories enable row level security;

-- PROFILES
drop policy if exists profiles_select_public on public.profiles;
create policy profiles_select_public
on public.profiles
for select
to public
using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

-- CATEGORIES
drop policy if exists categories_select_public on public.categories;
create policy categories_select_public
on public.categories
for select
to public
using (true);

-- SPOTS
drop policy if exists spots_select_public on public.spots;
create policy spots_select_public
on public.spots
for select
to public
using (status = 'approved' or created_by = auth.uid() or owner_id = auth.uid());

drop policy if exists spots_insert_authenticated on public.spots;
create policy spots_insert_authenticated
on public.spots
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists spots_update_owner_or_creator on public.spots;
create policy spots_update_owner_or_creator
on public.spots
for update
to authenticated
using (owner_id = auth.uid() or created_by = auth.uid())
with check (owner_id = auth.uid() or created_by = auth.uid());

-- SPOT PHOTOS
drop policy if exists spot_photos_select_public on public.spot_photos;
create policy spot_photos_select_public
on public.spot_photos
for select
to public
using (true);

drop policy if exists spot_photos_insert_authenticated on public.spot_photos;
create policy spot_photos_insert_authenticated
on public.spot_photos
for insert
to authenticated
with check (uploaded_by = auth.uid());

-- REVIEWS
drop policy if exists reviews_select_public on public.reviews;
create policy reviews_select_public
on public.reviews
for select
to public
using (true);

drop policy if exists reviews_insert_authenticated on public.reviews;
create policy reviews_insert_authenticated
on public.reviews
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists reviews_update_own on public.reviews;
create policy reviews_update_own
on public.reviews
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists reviews_delete_own on public.reviews;
create policy reviews_delete_own
on public.reviews
for delete
to authenticated
using (user_id = auth.uid());

-- REVIEW PHOTOS
drop policy if exists review_photos_select_public on public.review_photos;
create policy review_photos_select_public
on public.review_photos
for select
to public
using (true);

drop policy if exists review_photos_insert_authenticated on public.review_photos;
create policy review_photos_insert_authenticated
on public.review_photos
for insert
to authenticated
with check (uploaded_by = auth.uid());

-- MOOD TOKENS
drop policy if exists mood_tokens_select_public on public.mood_tokens;
create policy mood_tokens_select_public
on public.mood_tokens
for select
to public
using (true);

drop policy if exists mood_tokens_insert_authenticated on public.mood_tokens;
create policy mood_tokens_insert_authenticated
on public.mood_tokens
for insert
to authenticated
with check (true);

-- SPOT MOODS
drop policy if exists spot_moods_select_public on public.spot_moods;
create policy spot_moods_select_public
on public.spot_moods
for select
to public
using (true);

-- FAVORITES
drop policy if exists favorites_select_own on public.favorites;
create policy favorites_select_own
on public.favorites
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists favorites_insert_own on public.favorites;
create policy favorites_insert_own
on public.favorites
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists favorites_delete_own on public.favorites;
create policy favorites_delete_own
on public.favorites
for delete
to authenticated
using (user_id = auth.uid());

-- FOLLOWS
drop policy if exists follows_select_public on public.follows;
create policy follows_select_public
on public.follows
for select
to public
using (true);

drop policy if exists follows_insert_own on public.follows;
create policy follows_insert_own
on public.follows
for insert
to authenticated
with check (follower = auth.uid());

drop policy if exists follows_delete_own on public.follows;
create policy follows_delete_own
on public.follows
for delete
to authenticated
using (follower = auth.uid());

-- RESERVATIONS
drop policy if exists reservations_select_own on public.reservations;
create policy reservations_select_own
on public.reservations
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists reservations_insert_own on public.reservations;
create policy reservations_insert_own
on public.reservations
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists reservations_update_own on public.reservations;
create policy reservations_update_own
on public.reservations
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());