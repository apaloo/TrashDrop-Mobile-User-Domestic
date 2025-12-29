-- Allow batch scanning by authenticated users
-- This enables QR code scanning for batch activation while maintaining security

DO $$ 
BEGIN
  -- Add policy to allow authenticated users to read active batches for scanning
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'batches') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'batches' AND policyname = 'Authenticated users can scan active batches') THEN
      CREATE POLICY "Authenticated users can scan active batches" 
      ON batches FOR SELECT 
      USING (
        auth.uid() IS NOT NULL AND 
        status = 'active'
      );
    END IF;
  END IF;
END $$;
