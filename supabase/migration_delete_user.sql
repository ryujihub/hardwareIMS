-- =============================================================
-- ACCOUNT MANAGEMENT MIGRATION — run once in Supabase SQL Editor
-- Adds: admin-only delete_user() (removes auth user + all data via cascade)
-- =============================================================

create or replace function public.delete_user(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  -- Only admins may delete accounts; refuse otherwise
  if public.my_role() is distinct from 'admin' then
    raise exception 'Only admins can delete accounts';
  end if;

  -- Prevent deleting yourself
  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;

  delete from auth.users where id = p_user_id;
  -- profiles, attendance logs, etc. cascade automatically
end;
$$;

grant execute on function public.delete_user(uuid) to authenticated;
