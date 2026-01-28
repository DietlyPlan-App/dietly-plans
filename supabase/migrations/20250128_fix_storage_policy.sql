-- FIX FOR PDF STORAGE (Run in Supabase Dashboard SQL Editor)
-- This creates the storage bucket and policies for PDF uploads

-- 1. Create the storage bucket 'plans' if it doesn't exist
insert into storage.buckets (id, name, public)
values ('plans', 'plans', false)
on conflict (id) do nothing;

-- 2. Policy: Allow Users to Upload (INSERT) to their own folder
create policy "Users can upload own plan PDFs"
on storage.objects for insert
with check (
  bucket_id = 'plans' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- 3. Policy: Allow Users to View (SELECT) their own PDFs
create policy "Users can view own plan PDFs"
on storage.objects for select
using (
  bucket_id = 'plans' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- 4. Policy: Allow Users to Update (Overwrite) their own PDFs
create policy "Users can update own plan PDFs"
on storage.objects for update
using (
  bucket_id = 'plans' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- 5. Policy: Allow Users to Delete their own PDFs
create policy "Users can delete own plan PDFs"
on storage.objects for delete
using (
  bucket_id = 'plans' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
