-- Create storage bucket for dumping report photos
-- Run this in Supabase SQL Editor or via CLI

-- 1. Create the storage bucket (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('dumping-photos', 'dumping-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS Policy: Allow authenticated users to upload photos
DROP POLICY IF EXISTS "Users can upload dumping photos" ON storage.objects;
CREATE POLICY "Users can upload dumping photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'dumping-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. RLS Policy: Allow public read access to photos
DROP POLICY IF EXISTS "Public can view dumping photos" ON storage.objects;
CREATE POLICY "Public can view dumping photos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'dumping-photos');

-- 4. RLS Policy: Allow users to delete their own photos
DROP POLICY IF EXISTS "Users can delete their own photos" ON storage.objects;
CREATE POLICY "Users can delete their own photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'dumping-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Note: Photos will be stored in structure: dumping-photos/{user_id}/{timestamp}_{random}.jpg
