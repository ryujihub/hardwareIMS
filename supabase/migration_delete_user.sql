-- =============================================================
-- ACCOUNT MANAGEMENT MIGRATION
-- Run once in: Supabase Dashboard -> SQL Editor -> New query -> Paste & Run
--
-- WHY THIS FILE EXISTS
-- Deleting an account means deleting a row from auth.users. The app can never
-- do that with the anon key, so it calls this SECURITY DEFINER function instead.
-- If this file is never run, Admin -> Roles -> Delete fails with:
--   "Could not find the function public.delete_user(p_user_id) in the schema cache"
-- (that is a PostgREST PGRST202: the function is not in the API schema at all).
--
-- Safe to re-run: it uses create or replace.
-- =============================================================

-- Helper: current user's role (created by the base schema; re-declared here so
-- this file also works on a database where only the all-in-one migration ran).
create or replace function public.my_role()
returns text
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

-- Admin-only account deletion. Cascades to the profile, attendance logs, etc.
create or replace function public.delete_user(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  -- Only admins may delete accounts.
  if public.my_role() is distinct from 'admin' then
    raise exception 'Only admins can delete accounts';
  end if;

  -- Never let an admin delete themselves.
  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;

  -- Cascades via `on delete cascade` on public.profiles.
  delete from auth.users where id = p_user_id;
end;
$$;

-- Only signed-in users may call it; the function body enforces admin-only.
revoke all on function public.delete_user(uuid) from public;
revoke all on function public.delete_user(uuid) from anon;
grant execute on function public.delete_user(uuid) to authenticated;

-- Ask PostgREST to rebuild its schema cache now, instead of waiting for the
-- next automatic reload. Without this the app can still see PGRST202 for a
-- short while after the function is created.
notify pgrst, 'reload schema';

-- ---------- VERIFY ----------
-- This final SELECT should return exactly one row: delete_user / p_user_id uuid.
-- If it returns no rows, the statement above did not apply.
select
  p.proname                    as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid)    as returns
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'delete_user';
