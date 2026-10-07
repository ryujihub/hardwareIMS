-- =============================================================
-- SQL MIGRATION FOR STORAGE (PRODUCT IMAGES)
-- =============================================================

-- Ensure the product-images bucket exists
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;-- Drop existing policies if any
drop policy if exists "Public Access" on storage.objects;
drop policy if exists "Authenticated Uploads" on storage.objects;
drop policy if exists "Authenticated Deletes" on storage.objects;

-- Allow public read access (anyone can view product images)
create policy "Public Access"
on storage.objects for select
using ( bucket_id = 'product-images' );

-- Allow authenticated users to upload and delete files
create policy "Authenticated Uploads"
on storage.objects for insert
with check ( bucket_id = 'product-images' and auth.role() = 'authenticated' );

create policy "Authenticated Deletes"
on storage.objects for delete
using ( bucket_id = 'product-images' and auth.role() = 'authenticated' );
