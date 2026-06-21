ALTER TABLE public.user_approvals DISABLE TRIGGER enforce_admin_approval_scope_trigger;

UPDATE public.user_approvals
SET company_name = 'Central Tech Platform'
WHERE company_name ILIKE '%city%taxpert%'
   OR company_name ILIKE '%taxpert%';

ALTER TABLE public.user_approvals ENABLE TRIGGER enforce_admin_approval_scope_trigger;