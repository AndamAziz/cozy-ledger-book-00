import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import { toast } from '@/hooks/use-toast';
import { normalizeBrandText } from '@/lib/brand';

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
  const hasShownExpiryWarning = useRef(false);
  const previousExpiresAt = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setApprovalStatus(null);
      setIsLoading(false);
      hasShownExpiryWarning.current = false;
      previousExpiresAt.current = null;
      return;
    }

    const isCeo = isCeoEmail(user.email);

    const checkUserStatus = async (isInitialLoad = false) => {
      if (isInitialLoad) {
        setIsLoading(true);
      }
      try {
        // Check if user is admin
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();

        const isUserAdmin = roleData?.role === 'admin' || roleData?.role === 'owner';
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
          const isActive = approvalData.is_active !== false;
          
          let daysUntilExpiry: number | null = null;
          if (expiresAt && !isExpired) {
            daysUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          }

          // Show expiry warning notification on login (only once per session)
          if (isInitialLoad && !isUserAdmin && daysUntilExpiry !== null && daysUntilExpiry <= 10 && !hasShownExpiryWarning.current) {
            hasShownExpiryWarning.current = true;
            // Toast message shown in user's language context (handled by component)
          }

          // Check if expiry was extended (compare with previous value)
          if (previousExpiresAt.current && approvalData.expires_at) {
            const prevExpiry = new Date(previousExpiresAt.current);
            const newExpiry = new Date(approvalData.expires_at);
            
            if (newExpiry > prevExpiry) {
              const formattedDate = newExpiry.toLocaleDateString('ku-Arab', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              });
              // Toast shown at component level with proper translation
              hasShownExpiryWarning.current = false;
            }
          }
          
          previousExpiresAt.current = approvalData.expires_at;

          setApprovalStatus({
            isApproved: approvalData.is_approved && !isExpired && isActive,
            expiresAt,
            isExpired,
            daysUntilExpiry,
            companyName: normalizeBrandText(approvalData.company_name),
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
        if (isInitialLoad) {
          setIsLoading(false);
        }
      }
    };

    checkUserStatus(true);

    // Safety fallback: if the role/approval queries hang, stop loading after 8s
    // so the user isn't stuck on the splash screen forever.
    const safetyTimer = setTimeout(() => {
      setIsLoading(false);
    }, 8000);

    const channel = supabase
      .channel('user-approval-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_approvals',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          checkUserStatus(false);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(safetyTimer);
      supabase.removeChannel(channel);
    };
  }, [user]);

  return { isAdmin, approvalStatus, isLoading };
}
