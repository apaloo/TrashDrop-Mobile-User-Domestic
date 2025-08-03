-- Create the new tables
CREATE TABLE IF NOT EXISTS public.bin_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  location_name TEXT NOT NULL,
  address TEXT NOT NULL,
  coordinates GEOMETRY(Point, 4326) NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add RLS policies for bin_locations
ALTER TABLE public.bin_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own bin locations"
  ON public.bin_locations
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create bin locations"
  ON public.bin_locations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bin locations"
  ON public.bin_locations
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Create the digital_bins table
CREATE TABLE IF NOT EXISTS public.digital_bins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  location_id UUID REFERENCES public.bin_locations(id) ON DELETE CASCADE NOT NULL,
  qr_code_url TEXT NOT NULL,
  frequency VARCHAR(50) NOT NULL DEFAULT 'weekly',
  waste_type VARCHAR(50) NOT NULL DEFAULT 'general',
  bag_count INTEGER NOT NULL DEFAULT 1,
  special_instructions TEXT,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT check_frequency CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
  CONSTRAINT check_waste_type CHECK (waste_type IN ('general', 'recycling', 'organic')),
  CONSTRAINT check_bag_count CHECK (bag_count >= 1 AND bag_count <= 10)
);

-- Add RLS policies for digital_bins
ALTER TABLE public.digital_bins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own digital bins"
  ON public.digital_bins
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create digital bins"
  ON public.digital_bins
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own digital bins"
  ON public.digital_bins
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_bin_locations_user_id ON public.bin_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_digital_bins_user_id ON public.digital_bins(user_id);
CREATE INDEX IF NOT EXISTS idx_digital_bins_location_id ON public.digital_bins(location_id);
CREATE INDEX IF NOT EXISTS idx_digital_bins_expires_at ON public.digital_bins(expires_at);

-- Function to clean up expired digital bins
CREATE OR REPLACE FUNCTION public.cleanup_expired_digital_bins()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM public.digital_bins
    WHERE expires_at < NOW()
    OR is_active = false
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;

-- Create triggers to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_bin_locations_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_bin_locations_updated_at
BEFORE UPDATE ON public.bin_locations
FOR EACH ROW
EXECUTE FUNCTION update_bin_locations_updated_at_column();

CREATE OR REPLACE FUNCTION update_digital_bins_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_digital_bins_updated_at
BEFORE UPDATE ON public.digital_bins
FOR EACH ROW
EXECUTE FUNCTION update_digital_bins_updated_at_column();
