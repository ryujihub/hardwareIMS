-- =============================================================
-- CUSTOMIZATION MIGRATION — run once in Supabase SQL Editor
-- Enables admin-configurable branding, theme, ordering rules,
-- and product categories. (Fresh installs: schema.sql already
-- includes all of this.)
-- =============================================================

alter table public.settings
  add column if not exists store_name           text    not null default 'Metro Manila Hills',
  add column if not exists tagline              text    not null default 'Construction Supply & Trading — Inventory System',
  add column if not exists currency_symbol      text    not null default '₱',
  add column if not exists receipt_footer       text    not null default 'Salamat po! 🙏',
  add column if not exists primary_color        text    not null default '#1e3a5f',
  add column if not exists accent_color         text    not null default '#f59e0b',
  add column if not exists dark_mode            boolean not null default false,
  add column if not exists payment_methods      text[]  not null default '{cash,card,gcash}',
  add column if not exists low_stock_threshold  integer not null default 5,
  add column if not exists categories           text[]  not null default '{}';

-- One-time convenience: seed the category list from existing products
update public.settings s
set categories = sub.cats
from (
  select array_agg(distinct category order by category) as cats
  from public.products
  where category is not null and category <> ''
) sub
where s.id = 1
  and (s.categories is null or s.categories = '{}')
  and sub.cats is not null;
