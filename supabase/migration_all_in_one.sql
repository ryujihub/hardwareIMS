-- =============================================================
-- ALL-IN-ONE MIGRATION SCRIPT
-- Copy and run this ENTIRE script in your Supabase SQL Editor:
-- (Supabase Dashboard -> SQL Editor -> New Query -> Paste & Run)
-- =============================================================

-- 1. Customization Settings (Theme, Store Name, Dark Mode, Categories)
alter table public.settings add column if not exists store_name text not null default 'Metro Manila Hills';
alter table public.settings add column if not exists tagline text not null default 'Construction Supply & Trading — Inventory System';
alter table public.settings add column if not exists currency_symbol text not null default '₱';
alter table public.settings add column if not exists receipt_footer text not null default 'Salamat po! 🙏';
alter table public.settings add column if not exists primary_color text not null default '#1e3a5f';
alter table public.settings add column if not exists accent_color text not null default '#f59e0b';
alter table public.settings add column if not exists dark_mode boolean not null default false;
alter table public.settings add column if not exists payment_methods text[] not null default array['cash','card','gcash']::text[];
alter table public.settings add column if not exists low_stock_threshold integer not null default 5;
alter table public.settings add column if not exists categories text[] not null default array[]::text[];

-- 2. Barcodes & Phase 2-3 Columns
alter table public.products add column if not exists barcode text;
create unique index if not exists products_barcode_uidx on public.products (barcode);
create index if not exists products_barcode_idx on public.products (barcode);

alter table public.orders add column if not exists payment_status text not null default 'paid' check (payment_status in ('unpaid','partial','paid'));
alter table public.orders add column if not exists amount_paid numeric(12,2) not null default 0;

-- 3. Product Images
alter table public.products add column if not exists image_url text;

-- 4. RPC Helper Functions
create or replace function public.bulk_add_stock(p_delta int, p_ids uuid[])
returns void
language sql
security definer set search_path = public
as $$
  update public.products
     set stock = greatest(stock + p_delta, 0),
         updated_at = now()
   where id = any(p_ids);
$$;
grant execute on function public.bulk_add_stock(int, uuid[]) to authenticated;

-- 5. Account Management (Admin -> Roles -> Delete)
-- Without this, deleting an account fails with PGRST202:
--   "Could not find the function public.delete_user(p_user_id) in the schema cache"
create or replace function public.my_role()
returns text
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.delete_user(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if public.my_role() is distinct from 'admin' then
    raise exception 'Only admins can delete accounts';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;
  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.delete_user(uuid) from public;
revoke all on function public.delete_user(uuid) from anon;
grant execute on function public.delete_user(uuid) to authenticated;

-- Cancel / re-open an order and restore stock automatically
create or replace function public.set_order_status(p_order_id uuid, p_status text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  prev text;
begin
  if p_status not in ('pending','completed','cancelled') then
    raise exception 'Invalid status';
  end if;
  select status into prev from public.orders where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;

  update public.orders set status = p_status where id = p_order_id;

  if p_status = 'cancelled' and prev <> 'cancelled' then
    update public.products p
       set stock = p.stock + i.quantity
      from public.order_items i
     where i.order_id = p_order_id and i.product_id = p.id;
  end if;

  if prev = 'cancelled' and p_status in ('pending','completed') then
    update public.products p
       set stock = greatest(p.stock - i.quantity, 0)
      from public.order_items i
     where i.order_id = p_order_id and i.product_id = p.id;
  end if;
end;
$$;
grant execute on function public.set_order_status(uuid, text) to authenticated;

-- Make PostgREST pick the new functions up immediately
notify pgrst, 'reload schema';
