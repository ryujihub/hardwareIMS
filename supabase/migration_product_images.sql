-- =============================================================
-- Migration: Add image_url to products
-- =============================================================

alter table public.products
  add column if not exists image_url text;
