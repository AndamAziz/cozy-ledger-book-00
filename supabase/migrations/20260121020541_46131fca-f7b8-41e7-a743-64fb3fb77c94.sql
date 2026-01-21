-- Add is_active column to user_approvals for manual deactivation
ALTER TABLE public.user_approvals 
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Update RLS policy to check is_active status for data access
-- Users must be active to access their data