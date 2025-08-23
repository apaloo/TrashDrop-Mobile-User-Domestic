-- Migration: Row Level Security (RLS) Policies for TrashDrops
-- Ensures users can only access and modify their own data

-- Enable RLS on core tables (with error handling for missing tables)
DO $$ 
BEGIN
  -- Enable RLS only on tables that exist
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'batches') THEN
    ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'batches_mobile') THEN
    ALTER TABLE batches_mobile ENABLE ROW LEVEL SECURITY;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bags') THEN
    ALTER TABLE bags ENABLE ROW LEVEL SECURITY;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_stats') THEN
    ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN
    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'illegal_dumping') THEN
    ALTER TABLE illegal_dumping ENABLE ROW LEVEL SECURITY;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'illegal_dumping_mobile') THEN
    ALTER TABLE illegal_dumping_mobile ENABLE ROW LEVEL SECURITY;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dumping_reports') THEN
    ALTER TABLE dumping_reports ENABLE ROW LEVEL SECURITY;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dumping_reports_mobile') THEN
    ALTER TABLE dumping_reports_mobile ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Create policies only if they don't exist
DO $$ 
BEGIN
  -- Batches policies
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'batches') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'batches' AND policyname = 'Users can view their own batches') THEN
      CREATE POLICY "Users can view their own batches" ON batches FOR SELECT USING (created_by = auth.uid());
    END IF;
    
    -- CRITICAL: Allow authenticated users to scan active batches for QR code functionality
    -- This addresses the issue where batches with created_by=null cannot be scanned
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'batches' AND policyname = 'Authenticated users can scan active batches') THEN
      CREATE POLICY "Authenticated users can scan active batches" ON batches FOR SELECT USING (auth.uid() IS NOT NULL AND status = 'active');
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'batches' AND policyname = 'Users can update their own batch status') THEN
      CREATE POLICY "Users can update their own batch status" ON batches FOR UPDATE USING (created_by = auth.uid());
    END IF;
    
    -- Allow authenticated users to update active batches to 'used' status (for scanning)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'batches' AND policyname = 'Authenticated users can activate batches') THEN
      CREATE POLICY "Authenticated users can activate batches" ON batches FOR UPDATE 
      USING (auth.uid() IS NOT NULL AND status = 'active') 
      WITH CHECK (auth.uid() IS NOT NULL);
    END IF;
  END IF;

  -- Batches mobile policies
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'batches_mobile') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'batches_mobile' AND policyname = 'Users can view their own batches mobile') THEN
      CREATE POLICY "Users can view their own batches mobile" ON batches_mobile FOR SELECT USING (created_by = auth.uid());
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'batches_mobile' AND policyname = 'Users can update their own batch status mobile') THEN
      CREATE POLICY "Users can update their own batch status mobile" ON batches_mobile FOR UPDATE USING (created_by = auth.uid());
    END IF;
  END IF;

  -- Bags policies
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bags') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bags' AND policyname = 'Users can view bags for their batches') THEN
      CREATE POLICY "Users can view bags for their batches" ON bags FOR SELECT USING (
        batch_id IN (SELECT id FROM batches WHERE created_by = auth.uid())
      );
    END IF;
  END IF;

  -- User stats policies
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_stats') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_stats' AND policyname = 'Users can view their own stats') THEN
      CREATE POLICY "Users can view their own stats" ON user_stats FOR SELECT USING (user_id = auth.uid());
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_stats' AND policyname = 'Users can update their own stats') THEN
      CREATE POLICY "Users can update their own stats" ON user_stats FOR ALL USING (user_id = auth.uid());
    END IF;
  END IF;

  -- Profiles policies
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can view their own profile') THEN
      CREATE POLICY "Users can view their own profile" ON profiles FOR SELECT USING (id = auth.uid());
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can update their own profile') THEN
      CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (id = auth.uid());
    END IF;
  END IF;

  -- Illegal dumping policies
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'illegal_dumping') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'illegal_dumping' AND policyname = 'Users can view their own reports') THEN
      CREATE POLICY "Users can view their own reports" ON illegal_dumping FOR SELECT USING (reported_by = auth.uid());
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'illegal_dumping' AND policyname = 'Users can create dumping reports') THEN
      CREATE POLICY "Users can create dumping reports" ON illegal_dumping FOR INSERT WITH CHECK (reported_by = auth.uid());
    END IF;
  END IF;

  -- Illegal dumping mobile policies
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'illegal_dumping_mobile') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'illegal_dumping_mobile' AND policyname = 'Users can view their own reports mobile') THEN
      CREATE POLICY "Users can view their own reports mobile" ON illegal_dumping_mobile FOR SELECT USING (reported_by = auth.uid());
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'illegal_dumping_mobile' AND policyname = 'Users can create dumping reports mobile') THEN
      CREATE POLICY "Users can create dumping reports mobile" ON illegal_dumping_mobile FOR INSERT WITH CHECK (reported_by = auth.uid());
    END IF;
  END IF;
END $$;

-- Dumping reports policies (conditional based on table existence)
DO $$ 
BEGIN
  -- Only create policies for tables that exist and policies that don't already exist
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dumping_reports') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dumping_reports' AND policyname = 'Users can view dumping reports') THEN
      CREATE POLICY "Users can view dumping reports" ON dumping_reports FOR SELECT USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dumping_reports' AND policyname = 'Users can insert dumping reports') THEN
      CREATE POLICY "Users can insert dumping reports" ON dumping_reports FOR INSERT WITH CHECK (true);
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dumping_reports_mobile') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dumping_reports_mobile' AND policyname = 'Users can view dumping reports mobile') THEN
      CREATE POLICY "Users can view dumping reports mobile" ON dumping_reports_mobile FOR SELECT USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dumping_reports_mobile' AND policyname = 'Users can insert dumping reports mobile') THEN
      CREATE POLICY "Users can insert dumping reports mobile" ON dumping_reports_mobile FOR INSERT WITH CHECK (true);
    END IF;
  END IF;
END $$;
