-- Adds cost_price tracking for accurate profit calculation

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS cost_price numeric(10,2) DEFAULT 0;

ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS cost_price numeric(10,2) DEFAULT 0;

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS total_cost numeric(10,2) DEFAULT 0;
