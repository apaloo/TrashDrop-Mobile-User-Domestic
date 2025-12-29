-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable PostGIS for geographic data
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE public.illegal_dumping_mobile (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    reported_by uuid NOT NULL,
    location text NOT NULL,
    coordinates geometry(Point, 4326) NOT NULL,
    waste_type text NOT NULL DEFAULT 'mixed',
    severity text NOT NULL DEFAULT 'medium' CHECK (severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])),
    size text NOT NULL DEFAULT 'medium' CHECK (size = ANY (ARRAY['small'::text, 'medium'::text, 'large'::text])),
    photos text[] DEFAULT ARRAY[]::text[],
    status text NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending'::text, 'verified'::text, 'in_progress'::text, 'completed'::text])),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT illegal_dumping_mobile_pkey PRIMARY KEY (id),
    CONSTRAINT illegal_dumping_mobile_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES auth.users(id)
);

-- Create index for spatial queries
CREATE INDEX illegal_dumping_mobile_coordinates_idx ON public.illegal_dumping_mobile USING gist (coordinates);

-- Create table for additional report details
CREATE TABLE public.dumping_reports_mobile (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    dumping_id uuid NOT NULL,
    estimated_volume text,
    hazardous_materials boolean DEFAULT false,
    accessibility_notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT dumping_reports_mobile_pkey PRIMARY KEY (id),
    CONSTRAINT dumping_reports_mobile_dumping_id_fkey FOREIGN KEY (dumping_id) REFERENCES public.illegal_dumping_mobile(id)
);

-- Create history table for tracking status changes
CREATE TABLE public.illegal_dumping_history_mobile (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    dumping_id uuid NOT NULL,
    status text NOT NULL,
    notes text,
    updated_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT illegal_dumping_history_mobile_pkey PRIMARY KEY (id),
    CONSTRAINT illegal_dumping_history_mobile_dumping_id_fkey FOREIGN KEY (dumping_id) REFERENCES public.illegal_dumping_mobile(id),
    CONSTRAINT illegal_dumping_history_mobile_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id)
);
