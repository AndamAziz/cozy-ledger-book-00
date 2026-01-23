-- Add unit_type column to cigarettes table
ALTER TABLE public.cigarettes 
ADD COLUMN unit_type text NOT NULL DEFAULT 'box';

-- Add comment for documentation
COMMENT ON COLUMN public.cigarettes.unit_type IS 'Type of unit: box, meter, piece, kg, liter, pack';