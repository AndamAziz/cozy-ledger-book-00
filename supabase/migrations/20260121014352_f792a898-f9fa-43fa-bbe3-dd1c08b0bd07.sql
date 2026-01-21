-- Add company_name column to user_approvals table
ALTER TABLE public.user_approvals 
ADD COLUMN company_name TEXT;