-- Create storage bucket for dumping report photos
-- NOTE: Storage bucket creation should be done via Supabase Dashboard or API
-- This migration handles RLS policies only for automated CI/CD compatibility

-- Storage bucket 'dumping-photos' should be created manually in Supabase Dashboard:
-- 1. Go to Storage section
-- 2. Create bucket named 'dumping-photos'
-- 3. Set as 'Public bucket'
-- 4. This migration will then apply the RLS policies

-- Only create RLS policies if storage.objects table exists
DO $$
BEGIN
  -- Check if storage schema exists
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    -- Check if bucket exists before creating policies
    IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'dumping-photos') THEN
      -- RLS Policy: Allow authenticated users to upload photos
      DROP POLICY IF EXISTS "Users can upload dumping photos" ON storage.objects;
      CREATE POLICY "Users can upload dumping photos"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'dumping-photos' AND
        (storage.foldername(name))[1] = auth.uid()::text
      );

      -- RLS Policy: Allow public read access to photos
      DROP POLICY IF EXISTS "Public can view dumping photos" ON storage.objects;
      CREATE POLICY "Public can view dumping photos"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'dumping-photos');

      -- RLS Policy: Allow users to delete their own photos
      DROP POLICY IF EXISTS "Users can delete their own photos" ON storage.objects;
      CREATE POLICY "Users can delete their own photos"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'dumping-photos' AND
        (storage.foldername(name))[1] = auth.uid()::text
      );

      RAISE NOTICE 'Storage bucket RLS policies created successfully';
    ELSE
      RAISE NOTICE 'Storage bucket "dumping-photos" does not exist yet. Please create it via Supabase Dashboard.';
    END IF;
  ELSE
    RAISE NOTICE 'Storage schema not accessible. Policies will be applied when bucket is created.';
  END IF;
END $$;

-- Note: Photos will be stored in structure: dumping-photos/{user_id}/{timestamp}_{random}.jpg
