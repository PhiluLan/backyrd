-- 20260411100108_reservations.sql
-- Reservation Requests als erste Commerce-/Owner-Basis

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),

  spot_id uuid not null references public.spots(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,

  date timestamptz not null,
  persons integer not null default 2,
  status text not null default 'pending',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reservations_persons_check check (persons >= 1 and persons <= 50),
  constraint reservations_status_check check (
    status in ('pending', 'confirmed', 'declined', 'cancelled')
  )
);

create index if not exists idx_reservations_spot_id on public.reservations(spot_id);
create index if not exists idx_reservations_user_id on public.reservations(user_id);
create index if not exists idx_reservations_date on public.reservations(date);

drop trigger if exists trg_reservations_set_updated_at on public.reservations;
create trigger trg_reservations_set_updated_at
before update on public.reservations
for each row
execute function public.set_updated_at();