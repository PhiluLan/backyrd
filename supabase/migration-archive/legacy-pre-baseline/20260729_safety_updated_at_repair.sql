-- Repair missing timestamp columns on existing Safety tables.
-- CREATE TABLE IF NOT EXISTS does not add columns to tables that already exist.

alter table public.safety_content_items
  add column if not exists updated_at timestamptz not null default now();

alter table public.safety_cases
  add column if not exists updated_at timestamptz not null default now();

update public.safety_content_items
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

update public.safety_cases
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;
