-- Allow admins to delete user approvals
CREATE POLICY "Admins can delete approvals"
ON public.user_approvals
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));