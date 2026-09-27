-- =============================================================
-- PHASE 2–3 MIGRATION — run once in Supabase SQL Editor
-- (Fresh installs: schema.sql already includes all of this.)
-- =============================================================

-- Barcode support (scan-to-add in New Order)
alter table public.products add column if not exists barcode text;
create unique index if not exists products_barcode_uidx on public.products (barcode);
create index if not exists products_barcode_idx on public.products (barcode);

-- Payment tracking (unpaid / partial / paid + amount received)
alter table public.orders add column if not exists payment_status text not null default 'paid'
  check (payment_status in ('unpaid','partial','paid'));
alter table public.orders add column if not exists amount_paid numeric(12,2) not null default 0;

-- Daily analytics summary view for reports
create or replace view public.daily_sales as
select
  date_trunc('day', created_at) as day,
  count(*)::int                 as total_orders,
  coalesce(sum(total), 0)       as total_revenue,
  coalesce(sum(subtotal), 0)    as total_subtotal,
  coalesce(sum(delivery_fee), 0) as total_delivery
from public.orders
where status <> 'cancelled'
group by 1
order by 1 desc;

-- Cancel / re-open an order with automatic stock restoration.
-- Pass 'cancelled' to restore stock, or any other status to re-apply it.
create or replace function public.set_order_status(p_order_id uuid, p_status text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  item record;
begin
  if p_status not in ('pending','completed','cancelled') then
    raise exception 'Invalid status';
  end if;

  select status into item from public.orders where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;

  update public.orders set status = p_status where id = p_order_id;

  -- Restock when cancelling an active order
  if p_status = 'cancelled' and item.status <> 'cancelled' then
    update public.products p
       set stock = p.stock + i.quantity
      from public.order_items i
     where i.order_id = p_order_id and i.product_id = p.id;
  end if;

  -- Re-apply stock deduction if a cancelled order is reactivated
  if item.status = 'cancelled' and p_status in ('pending','completed') then
    update public.products p
       set stock = greatest(p.stock - i.quantity, 0)
      from public.order_items i
     where i.order_id = p_order_id and i.product_id = p.id;
  end if;
end;
$$;

-- Managers/admins can change order status (adds a dedicated policy path)
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
