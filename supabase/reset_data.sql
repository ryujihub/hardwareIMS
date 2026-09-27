-- =============================================================
-- FRESH START — wipes ALL business data
-- Run once in Supabase SQL Editor (Dashboard > SQL Editor > New query > Run)
--
-- KEPT:   user accounts + profiles (you can still log in),
--         settings row (delivery fee)
-- WIPED:  orders, order items, stock adjustment logs, products,
--         customers
-- =============================================================

begin;

-- Children first (foreign keys)
delete from public.order_items;
delete from public.orders;

-- Inventory + audit trail + customers
delete from public.stock_adjustments;
delete from public.products;
delete from public.customers;

commit;

-- Verify: all four queries should return 0
select 'order_items' as t, count(*) from public.order_items
union all select 'orders', count(*) from public.orders
union all select 'stock_adjustments', count(*) from public.stock_adjustments
union all select 'products', count(*) from public.products
union all select 'customers', count(*) from public.customers;
