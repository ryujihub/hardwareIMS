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
