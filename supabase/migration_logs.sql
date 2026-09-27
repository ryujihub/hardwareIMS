-- =============================================================
-- LOGS MIGRATION — attendance history (check-in / check-out)
-- Run once in Supabase SQL Editor.
-- (Fresh installs: schema.sql already includes this.)
-- =============================================================

create table if not exists public.attendance_logs (
  id       uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles (id) on delete cascade,
  action   text not null check (action in ('check_in','check_out')),
  at       timestamptz not null default now()
);

alter table public.attendance_logs enable row level security;

create policy "attendance_read" on public.attendance_logs for select to authenticated using (true);
create policy "attendance_insert" on public.attendance_logs for insert to authenticated
  with check (staff_id = auth.uid());

create index if not exists attendance_staff_idx on public.attendance_logs (staff_id, at desc);
create index if not exists attendance_at_idx    on public.attendance_logs (at desc);
