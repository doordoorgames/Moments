-- Run on the connected Moments Supabase database before using Shoug 2.0.
-- Existing rooms remain classic; only explicitly selected rooms use Shoug 2.0.
ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS presentation text NOT NULL DEFAULT 'classic';
ALTER TABLE public.rooms
DROP CONSTRAINT IF EXISTS rooms_presentation_check;
ALTER TABLE public.rooms
ADD CONSTRAINT rooms_presentation_check CHECK (presentation IN ('classic', 'shoug2'));
