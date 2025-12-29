-- Create the qr_codes table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  pickup_id UUID REFERENCES public.scheduled_pickups(id) ON DELETE CASCADE NOT NULL,
  qr_code_url TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_active_qr_per_pickup UNIQUE (pickup_id, is_active) 
    WHERE (is_active = true)
);

-- Add RLS policies
ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;

-- Allow users to see their own QR codes
CREATE POLICY "Users can view their own QR codes"
  ON public.qr_codes
  FOR SELECT
  USING (auth.uid() = user_id);

-- Allow users to create QR codes
CREATE POLICY "Users can create QR codes"
  ON public.qr_codes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own QR codes
CREATE POLICY "Users can update their own QR codes"
  ON public.qr_codes
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_qr_codes_user_id ON public.qr_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_pickup_id ON public.qr_codes(pickup_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_expires_at ON public.qr_codes(expires_at);

-- Function to clean up expired QR codes
CREATE OR REPLACE FUNCTION public.cleanup_expired_qr_codes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM public.qr_codes
    WHERE expires_at < NOW()
    OR is_active = false
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;

-- Create a trigger to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER update_qr_codes_updated_at
BEFORE UPDATE ON public.qr_codes
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Create a function to automatically create a QR code when a pickup is created
CREATE OR REPLACE FUNCTION public.create_qr_code_for_pickup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  qr_code_url TEXT;
  qr_code_id UUID;
BEGIN
  -- Generate a QR code URL (in a real app, this would be more sophisticated)
  qr_code_url := 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=trashdrop-' || NEW.id;
  
  -- Insert the QR code
  INSERT INTO public.qr_codes (
    user_id,
    pickup_id,
    qr_code_url,
    expires_at,
    is_active
  ) VALUES (
    NEW.user_id,
    NEW.id,
    qr_code_url,
    NOW() + INTERVAL '7 days',  -- Default 7-day expiration
    true
  )
  RETURNING id INTO qr_code_id;
  
  -- Update the pickup with the QR code URL
  UPDATE public.scheduled_pickups
  SET qr_code_url = qr_code_url
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$;

-- Create the trigger for new pickups
CREATE TRIGGER trigger_create_qr_code_after_pickup
AFTER INSERT ON public.scheduled_pickups
FOR EACH ROW
EXECUTE FUNCTION public.create_qr_code_for_pickup();
