import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';

interface ApprovalStatus {
  isApproved: boolean;
  expiresAt: Date | null;
  isExpired: boolean;
  daysUntilExpiry: number | null;
  companyName: string | null;
  isActive: boolean;
}

export function useUserRole(user: User | null) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setApprovalStatus(null);
      setIsLoading(false);
      return;
    }

    const checkUserStatus = async () => {
      setIsLoading(true);
      try {
        // Check if user is admin
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();

        const isUserAdmin = roleData?.role === 'admin';
        setIsAdmin(isUserAdmin);

        // Check approval status
        const { data: approvalData } = await supabase
          .from('user_approvals')
          .select('is_approved, expires_at, company_name, is_active')
          .eq('user_id', user.id)
          .maybeSingle();

        if (approvalData) {
          const expiresAt = approvalData.expires_at ? new Date(approvalData.expires_at) : null;
          const now = new Date();
          const isExpired = expiresAt ? expiresAt < now : false;
          const isActive = approvalData.is_active !== false; // Default to true if not set
          
          let daysUntilExpiry: number | null = null;
          if (expiresAt && !isExpired) {
            daysUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          }

          setApprovalStatus({
            isApproved: approvalData.is_approved && !isExpired && isActive,
            expiresAt,
            isExpired,
            daysUntilExpiry,
            companyName: approvalData.company_name,
            isActive,
          });
        } else {
          setApprovalStatus({
            isApproved: false,
            expiresAt: null,
            isExpired: false,
            daysUntilExpiry: null,
            companyName: null,
            isActive: true,
          });
        }
      } catch (error) {
        console.error('Error checking user status:', error);
        setApprovalStatus({
          isApproved: false,
          expiresAt: null,
          isExpired: false,
          daysUntilExpiry: null,
          companyName: null,
          isActive: true,
        });
      } finally {
        setIsLoading(false);
      }
    };

    checkUserStatus();
  }, [user]);

  return { isAdmin, approvalStatus, isLoading };
}
