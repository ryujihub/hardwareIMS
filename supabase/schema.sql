-- =============================================================
-- METRO MANILA HILLS — HardwareIMS Schema (Supabase / Postgres)
-- Paste this whole file into: Supabase Dashboard > SQL Editor > New query > Run
-- =============================================================

-- ---------- 1. TABLES ----------

-- User profiles (extends Supabase auth users; auto-created on signup)
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  name          text not null,
  role          text not null default 'staff' check (role in ('staff','manager','admin')),
  checked_in    boolean not null default false,
  last_check_in timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  sku           text unique,
  barcode       text unique,
  category      text,
  price         numeric(12,2) not null check (price >= 0),
  stock         integer not null default 0 check (stock >= 0),
  reorder_point integer not null default 10,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.customers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text,
  address    text,
  created_at timestamptz not null default now()
);

-- Single-row settings table
create table if not exists public.settings (
  id           int primary key default 1 check (id = 1),
  delivery_fee numeric(10,2) not null default 50,
  updated_at   timestamptz not null default now()
);

create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  customer_name  text not null,
  customer_phone text,
  staff_id       uuid references public.profiles (id),
  subtotal       numeric(12,2) not null default 0,
  delivery_fee   numeric(10,2) not null default 0,
  total          numeric(12,2) not null default 0,
  payment_method text not null default 'cash' check (payment_method in ('cash','card','gcash')),
  payment_status text not null default 'paid' check (payment_status in ('unpaid','partial','paid')),
  amount_paid    numeric(12,2) not null default 0,
  status         text not null default 'completed' check (status in ('pending','completed','cancelled')),
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);

create table if not exists public.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id),
  name       text not null,
  price      numeric(12,2) not null,
  quantity   integer not null check (quantity > 0)
);

create table if not exists public.stock_adjustments (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  delta      integer not null,
  reason     text,
  staff_id   uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_logs (
  id       uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles (id) on delete cascade,
  action   text not null check (action in ('check_in','check_out')),
  at       timestamptz not null default now()
);

-- ---------- 2. INDEXES ----------
create index if not exists orders_created_idx    on public.orders (created_at desc);
create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists products_name_idx     on public.products (name);
create index if not exists products_barcode_idx  on public.products (barcode);
create index if not exists attendance_staff_idx  on public.attendance_logs (staff_id, at desc);
create index if not exists attendance_at_idx     on public.attendance_logs (at desc);

-- ---------- 3. AUTO-CREATE PROFILE ON SIGNUP ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'staff'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: current user's role (security definer avoids RLS recursion)
create or replace function public.my_role()
returns text
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

-- ---------- 4. STOCK DECREMENT ON ORDER ITEM INSERT ----------
create or replace function public.handle_order_item_stock()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  order_status text;
begin
  select status into order_status from public.orders where id = new.order_id;
  if order_status is distinct from 'cancelled' and new.product_id is not null then
    update public.products
       set stock = greatest(stock - new.quantity, 0),
           updated_at = now()
     where id = new.product_id;
    insert into public.stock_adjustments (product_id, delta, reason)
    values (new.product_id, -new.quantity, 'order');
  end if;
  return new;
end;
$$;

drop trigger if exists on_order_item_inserted on public.order_items;
create trigger on_order_item_inserted
  after insert on public.order_items
  for each row execute function public.handle_order_item_stock();

-- Cancel / re-open an order with automatic stock restoration
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

-- Bulk stock adjustment in one atomic request (admin bulk operations)
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

-- Admin-only account deletion (cascades to profile + logs)
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
grant execute on function public.delete_user(uuid) to authenticated;

-- ---------- 5. ROW LEVEL SECURITY ----------
alter table public.profiles          enable row level security;
alter table public.products          enable row level security;
alter table public.customers         enable row level security;
alter table public.settings          enable row level security;
alter table public.orders            enable row level security;
alter table public.order_items       enable row level security;
alter table public.stock_adjustments enable row level security;
alter table public.attendance_logs  enable row level security;

-- Profiles: read self (admins read all), update self, admins manage all
create policy "profiles_read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.my_role() in ('admin','manager'));
create policy "profiles_update_self" on public.profiles for update to authenticated
  using (id = auth.uid());
create policy "profiles_admin_all" on public.profiles for all to authenticated
  using (public.my_role() = 'admin');

-- Products: all authenticated read; admins/managers write
create policy "products_read" on public.products for select to authenticated using (true);
create policy "products_write" on public.products for all to authenticated
  using (public.my_role() in ('admin','manager'))
  with check (public.my_role() in ('admin','manager'));

-- Customers
create policy "customers_read" on public.customers for select to authenticated using (true);
create policy "customers_write" on public.customers for all to authenticated
  using (true) with check (true);

-- Settings: all authenticated read; admins write
create policy "settings_read" on public.settings for select to authenticated using (true);
create policy "settings_write" on public.settings for all to authenticated
  using (public.my_role() in ('admin','manager'))
  with check (public.my_role() in ('admin','manager'));

-- Orders: all authenticated read; staff insert own; admins manage
create policy "orders_read" on public.orders for select to authenticated using (true);
create policy "orders_insert" on public.orders for insert to authenticated
  with check (staff_id = auth.uid());
create policy "orders_update" on public.orders for update to authenticated
  using (public.my_role() in ('admin','manager'));
create policy "orders_delete" on public.orders for delete to authenticated
  using (public.my_role() = 'admin');

-- Order items: follow the parent order
create policy "order_items_read" on public.order_items for select to authenticated using (true);
create policy "order_items_insert" on public.order_items for insert to authenticated with check (true);
create policy "order_items_delete" on public.order_items for delete to authenticated
  using (public.my_role() = 'admin');

-- Stock adjustments: log-style
create policy "adjustments_read" on public.stock_adjustments for select to authenticated using (true);
create policy "adjustments_insert" on public.stock_adjustments for insert to authenticated with check (true);

-- Attendance: everyone reads; staff log their own in/out
create policy "attendance_read" on public.attendance_logs for select to authenticated using (true);
create policy "attendance_insert" on public.attendance_logs for insert to authenticated
  with check (staff_id = auth.uid());

-- ---------- 6. SEED DATA ----------
insert into public.settings (id, delivery_fee) values (1, 50) on conflict (id) do nothing;

insert into public.products (name, sku, category, price, stock, reorder_point) values
  ('Cement 40kg',        'CEM-40-001', 'Cement',      350.00, 145,  50),
  ('Cement 50kg',        'CEM-50-001', 'Cement',      420.00,  78,  40),
  ('Cement Color-Grey',  'CEM-CG-001', 'Cement',      480.00,  12,  25),
  ('Nails 2" (per kg)',  'NAIL-2-001', 'Fasteners',    85.00,   5,  20),
  ('Paint Brush 3"',     'PB-3-001',   'Paint Tools',  45.00,  60,  15),
  ('Paint White 1L',     'PNT-W-001',  'Paint',       290.00,  30,  10),
  ('Hollow Blocks 6"',   'HB-6-001',   'Masonry',      18.00, 500, 100),
  ('Sand (per cubic)',   'SAND-CU-01', 'Aggregates', 1200.00,  25,   5),
  ('Gravel (per cubic)', 'GRV-CU-01',  'Aggregates', 1500.00,  18,   5),
  ('Steel Bar 12mm',     'STL-12-001', 'Steel',       210.00,  90,  30)
on conflict (sku) do nothing;

-- ---------- 7. DAILY SALES VIEW (reports) ----------
create or replace view public.daily_sales as
select
  date_trunc('day', created_at)  as day,
  count(*)::int                  as total_orders,
  coalesce(sum(total), 0)        as total_revenue,
  coalesce(sum(subtotal), 0)     as total_subtotal,
  coalesce(sum(delivery_fee), 0) as total_delivery
from public.orders
where status <> 'cancelled'
group by 1
order by 1 desc;

-- ---------- 8. REALTIME (live updates for stock & orders) ----------
alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.orders;

-- =============================================================
-- AFTER SETUP: create your admin login in Dashboard > Authentication > Users,
-- then run:  update public.profiles set role = 'admin' where id = '<user-uuid>';
-- =============================================================
