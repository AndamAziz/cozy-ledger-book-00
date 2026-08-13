import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { 
  Users, 
  Check, 
  X, 
  Clock, 
  Calendar,
  Shield,
  Key,
  RefreshCw,
  ChevronLeft,
  Search,
  AlertTriangle,
  UserCheck,
  UserX,
  TrendingUp,
  Building2,
  Ban,
  Power,
  Pencil,
  Trash2,
  Crown,
  History,
  Mail,
  MoreVertical
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TelegramHealthCard } from './TelegramHealthCard';
import { ReviewModeration } from './ReviewModeration';
import { StreamServerManager } from './StreamServerManager';
import { LiveTvUsersAdmin } from './LiveTvUsersAdmin';
import { normalizeBrandText } from '@/lib/brand';

interface UserApproval {
  id: string;
  user_id: string;
  email: string;
  is_approved: boolean;
  is_active: boolean;
  approved_at: string | null;
  expires_at: string | null;
  created_at: string;
  company_name: string | null;
  isAdmin?: boolean;
}

interface ActivityLog {
  id: string;
  admin_id: string;
  admin_email: string;
  action_type: string;
  target_user_id: string | null;
  target_user_email: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface AdminPanelProps {
  onBack: () => void;
}

export function AdminPanel({ onBack }: AdminPanelProps) {
  const { t } = useLanguage();
  const [users, setUsers] = useState<UserApproval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'pending' | 'inactive' | 'expired' | 'expiring' | 'admin'>('all');
  const [selectedUser, setSelectedUser] = useState<UserApproval | null>(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showCompanyDialog, setShowCompanyDialog] = useState(false);
  const [showExpiryDialog, setShowExpiryDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMakeAdminDialog, setShowMakeAdminDialog] = useState(false);
  const [showRemoveAdminDialog, setShowRemoveAdminDialog] = useState(false);
  const [showActivityLogDialog, setShowActivityLogDialog] = useState(false);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [expiryDuration, setExpiryDuration] = useState('30');
  const [customExpiryDate, setCustomExpiryDate] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  const [isCEO, setIsCEO] = useState(false);

  useEffect(() => {
    fetchUsers();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: owner } = await supabase.rpc('has_role', {
        _user_id: data.user.id,
        _role: 'owner',
      });
      setIsCEO(!!owner);
    });
  }, []);


  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_approvals')
        .select('id, user_id, email, is_approved, approved_at, expires_at, created_at, updated_at, company_name, is_active')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Filter out admin users based on email (keep for display but mark them)
      const { data: adminRoles } = await supabase
        .from('user_roles')
        .select('user_id, role');
      
      const adminUserIds = new Set(adminRoles?.filter(r => r.role === 'admin' || r.role === 'owner').map(r => r.user_id) || []);
      
      // Mark admins but KEEP them in the list so they appear under the Admin filter
      const usersWithAdminStatus = data?.map(u => ({
        ...u,
        company_name: normalizeBrandText(u.company_name),
        isAdmin: adminUserIds.has(u.user_id)
      })) || [];
      
      setUsers(usersWithAdminStatus);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: t('error'),
        description: t('errorFetchingUsers'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchActivityLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('admin_activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setActivityLogs((data || []) as ActivityLog[]);
    } catch (error) {
      console.error('Error fetching activity logs:', error);
      toast({
        title: t('error'),
        description: t('errorFetchingLogs'),
        variant: 'destructive',
      });
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const logActivity = async (actionType: string, targetUserId: string | null, targetUserEmail: string | null, details: { action: string }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('admin_activity_logs').insert([{
        admin_id: user.id,
        admin_email: user.email || '',
        action_type: actionType,
        target_user_id: targetUserId,
        target_user_email: targetUserEmail,
        details: details as unknown as Record<string, never>
      }]);
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  };

  const getActionTypeLabel = (actionType: string): string => {
    const labels: Record<string, string> = {
      'user_approved': t('actionApproved'),
      'user_revoked': t('actionRevoked'),
      'password_change': t('actionPasswordChanged'),
      'expiry_extended': t('actionExpiryExtended'),
      'expiry_changed': t('actionExpiryChanged'),
      'account_activated': t('actionActivated'),
      'account_deactivated': t('actionDeactivated'),
      'company_name_changed': t('actionCompanyChanged'),
      'account_deleted': t('actionDeleted'),
      'make_admin': t('actionMadeAdmin'),
      'remove_admin': t('actionRemovedAdmin'),
      'reset_email_sent': t('actionResetEmailSent'),
    };
    return labels[actionType] || actionType;
  };

  const handleApprove = async () => {
    if (!selectedUser) return;
    setIsUpdating(true);

    try {
      const days = parseInt(expiryDuration);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + days);

      const { error } = await supabase
        .from('user_approvals')
        .update({
          is_approved: true,
          approved_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedUser.id);

      if (error) throw error;

      // Log the activity
      await logActivity('user_approved', selectedUser.user_id, selectedUser.email, { action: `Approved for ${days} days` });

      toast({
        title: t('success'),
        description: `${t('approvedFor')} ${days} ${t('days')}`,
      });

      setShowApproveDialog(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error) {
      console.error('Error approving user:', error);
      toast({
        title: t('error'),
        description: t('errorApproving'),
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRevoke = async (user: UserApproval) => {
    try {
      const { error } = await supabase
        .from('user_approvals')
        .update({
          is_approved: false,
          approved_at: null,
          expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      // Log the activity
      await logActivity('user_revoked', user.user_id, user.email, { action: 'Permission revoked' });

      toast({
        title: t('success'),
        description: t('permissionRevoked'),
      });

      fetchUsers();
    } catch (error) {
      console.error('Error revoking user:', error);
      toast({
        title: t('error'),
        description: t('errorRevoking'),
        variant: 'destructive',
      });
    }
  };

  const handleChangePassword = async () => {
    if (!selectedUser || !newPassword) return;
    if (newPassword.length < 6) {
      toast({
        title: t('error'),
        description: t('passwordMin6'),
        variant: 'destructive',
      });
      return;
    }

    setIsUpdating(true);
    try {
      // Call edge function to change password (since we need service role)
      const { data, error } = await supabase.functions.invoke('admin-change-password', {
        body: { userId: selectedUser.user_id, newPassword, targetEmail: selectedUser.email },
      });

      if (error) throw error;

      if (data?.error) {
        toast({
          title: t('error'),
          description: data.error,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: t('success'),
        description: t('passwordChanged'),
      });

      setShowPasswordDialog(false);
      setSelectedUser(null);
      setNewPassword('');
    } catch (error) {
      console.error('Error changing password:', error);
      toast({
        title: t('error'),
        description: t('errorChangingPassword'),
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSendResetEmail = async (user: UserApproval) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      await logActivity('reset_email_sent', user.user_id, user.email, { action: 'Password reset email sent by admin' });
      toast({
        title: t('success'),
        description: t('resetEmailSent'),
      });
    } catch (error) {
      console.error('Error sending reset email:', error);
      toast({
        title: t('error'),
        description: t('errorOccurred'),
        variant: 'destructive',
      });
    }
  };

  const handleExtendExpiry = async (user: UserApproval, days: number) => {
    try {
      const currentExpiry = user.expires_at ? new Date(user.expires_at) : new Date();
      const newExpiry = new Date(Math.max(currentExpiry.getTime(), Date.now()));
      newExpiry.setDate(newExpiry.getDate() + days);

      const { error } = await supabase
        .from('user_approvals')
        .update({
          expires_at: newExpiry.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      await logActivity('expiry_extended', user.user_id, user.email, { action: `Extended for ${days} days` });

      toast({
        title: t('success'),
        description: `${t('extendedFor')} ${days} ${t('days')}`,
      });

      fetchUsers();
    } catch (error) {
      console.error('Error extending expiry:', error);
      toast({
        title: t('error'),
        description: t('errorExtending'),
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async (user: UserApproval) => {
    try {
      const newActiveState = !user.is_active;
      
      const { error } = await supabase
        .from('user_approvals')
        .update({
          is_active: newActiveState,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      await logActivity(newActiveState ? 'account_activated' : 'account_deactivated', user.user_id, user.email, { action: newActiveState ? 'Account activated' : 'Account deactivated' });

      toast({
        title: t('success'),
        description: newActiveState ? t('accountActivated') : t('accountDeactivatedAdmin'),
      });

      fetchUsers();
    } catch (error) {
      console.error('Error toggling user active status:', error);
      toast({
        title: t('error'),
        description: t('errorTogglingStatus'),
        variant: 'destructive',
      });
    }
  };

  const handleSetCustomExpiry = async () => {
    if (!selectedUser || !customExpiryDate) return;

    setIsUpdating(true);
    try {
      const newExpiry = new Date(customExpiryDate);
      newExpiry.setHours(23, 59, 59, 999); // Set to end of day

      const { error } = await supabase
        .from('user_approvals')
        .update({
          expires_at: newExpiry.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedUser.id);

      if (error) throw error;

      await logActivity('expiry_changed', selectedUser.user_id, selectedUser.email, { action: `Expiry set to ${newExpiry.toISOString().split('T')[0]}` });

      toast({
        title: t('success'),
        description: t('expiryChanged'),
      });

      setShowExpiryDialog(false);
      setSelectedUser(null);
      setCustomExpiryDate('');
      fetchUsers();
    } catch (error) {
      console.error('Error setting custom expiry:', error);
      toast({
        title: t('error'),
        description: t('errorChangingExpiry'),
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleChangeCompanyName = async () => {
    if (!selectedUser) return;

    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('user_approvals')
        .update({
          company_name: newCompanyName.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedUser.id);

      if (error) throw error;

      toast({
        title: t('success'),
        description: t('companyNameChanged'),
      });

      setShowCompanyDialog(false);
      setSelectedUser(null);
      setNewCompanyName('');
      fetchUsers();
    } catch (error) {
      console.error('Error changing company name:', error);
      toast({
        title: t('error'),
        description: t('errorChangingCompanyName'),
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!selectedUser) return;
    
    setIsUpdating(true);
    try {
      // Call edge function to completely delete user and all their data
      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: { userId: selectedUser.user_id, targetEmail: selectedUser.email },
      });

      if (error) throw error;

      toast({
        title: t('success'),
        description: t('accountDeleted'),
      });

      setShowDeleteDialog(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error) {
      console.error('Error deleting account:', error);
      toast({
        title: t('error'),
        description: t('errorDeletingAccount'),
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleMakeAdmin = async () => {
    if (!selectedUser) return;
    
    setIsUpdating(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-make-admin', {
        body: { userId: selectedUser.user_id, targetEmail: selectedUser.email },
      });

      if (error) throw error;

      toast({
        title: t('success'),
        description: t('adminMadeSuccess'),
      });

      setShowMakeAdminDialog(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error) {
      console.error('Error making admin:', error);
      toast({
        title: t('error'),
        description: t('errorMakingAdmin'),
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemoveAdmin = async () => {
    if (!selectedUser) return;
    
    setIsUpdating(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-remove-admin', {
        body: { userId: selectedUser.user_id, targetEmail: selectedUser.email },
      });

      if (error) throw error;

      toast({
        title: t('success'),
        description: t('adminRemovedSuccess'),
      });

      setShowRemoveAdminDialog(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error) {
      console.error('Error removing admin:', error);
      toast({
        title: t('error'),
        description: t('errorRemovingAdmin'),
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const displayCompanyName = normalizeBrandText(user.company_name);
    const matchesSearch = user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (displayCompanyName && displayCompanyName.toLowerCase().includes(searchQuery.toLowerCase()));
    
    if (!matchesSearch) return false;
    
    const now = new Date();
    const daysLeft = user.expires_at ? Math.ceil((new Date(user.expires_at).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
    const isExpiredUser = user.is_approved && user.expires_at && new Date(user.expires_at) < now;
    const isExpiringUser = user.is_approved && daysLeft !== null && daysLeft > 0 && daysLeft <= 7;
    const isActiveUser = user.is_approved && !isExpiredUser && user.is_active;
    
    switch (activeFilter) {
      case 'all': return true;
      case 'active': return isActiveUser;
      case 'pending': return !user.is_approved;
      case 'inactive': return !user.is_active;
      case 'expired': return isExpiredUser;
      case 'expiring': return isExpiringUser;
      case 'admin': return user.isAdmin === true;
      default: return true;
    }
  });

  const pendingUsers = filteredUsers.filter(u => !u.is_approved);
  const approvedUsers = filteredUsers.filter(u => u.is_approved);
  
  // Statistics calculations
  const totalUsers = users.length;
  const totalPending = users.filter(u => !u.is_approved).length;
  const totalApproved = users.filter(u => u.is_approved).length;
  const totalExpired = users.filter(u => u.is_approved && u.expires_at && new Date(u.expires_at) < new Date()).length;
  const totalInactive = users.filter(u => !u.is_active).length;
  const totalActive = users.filter(u => u.is_approved && u.is_active && (!u.expires_at || new Date(u.expires_at) >= new Date())).length;
  const expiringIn7Days = users.filter(u => {
    if (!u.is_approved || !u.expires_at) return false;
    const daysLeft = Math.ceil((new Date(u.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysLeft > 0 && daysLeft <= 7;
  }).length;
  const totalAdmins = users.filter(u => u.isAdmin === true).length;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ku-Arab', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const getDaysRemaining = (expiresAt: string | null) => {
    if (!expiresAt) return null;
    const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days;
  };

  return (
    <div className="min-h-screen p-3 md:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header - Improved Design */}
        <header className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-card/90 to-card/70 backdrop-blur-lg p-4 md:p-5 mb-6 animate-fade-in shadow-xl">
          <div className="absolute -top-16 -right-16 w-32 h-32 rounded-full bg-primary/10 blur-2xl" />
          
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={onBack}
                className="h-10 w-10 rounded-xl flex-shrink-0"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-lg md:text-xl font-bold text-foreground">
                  {t('adminPanel')}
                </h1>
                <p className="text-xs text-muted-foreground">{t('userManagement')}</p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={fetchUsers}
              size="sm"
              className="h-9 px-2.5 md:px-3 rounded-lg flex items-center gap-1.5"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="text-xs md:text-sm">{t('refresh')}</span>
            </Button>
          </div>
        </header>

        {/* Role context banner */}
        {isCEO ? (
            <div className="mb-6 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 to-primary/5 p-4 flex items-start gap-3">
              <Crown className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-primary">{t('ceoRoleBadge')}</p>
                <p className="text-xs text-muted-foreground">{t('ceoBannerDesc')}</p>
              </div>
            </div>
          ) : (
            <div className="mb-6 rounded-2xl border border-warning/30 bg-gradient-to-br from-warning/15 to-warning/5 p-4 flex items-start gap-3">
              <Shield className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">{t('adminBannerNote')}</p>
            </div>
          )}

        {/* Audit log trigger */}
        <div className="mb-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowActivityLogDialog(true);
              fetchActivityLogs();
            }}
            className="rounded-lg flex items-center gap-1.5"
          >
            <History className="h-4 w-4" />
            <span className="text-xs md:text-sm">{t('activityLog')}</span>
          </Button>
        </div>

        {/* Sport Live server management (CEO only) */}
        <StreamServerManager isCEO={isCEO} />

        {/* IPTV playlist server configuration */}
        <div className="mt-4">
          <LiveTvUsersAdmin />
        </div>






        {/* Statistics Cards - Compact & Clickable */}
        <div className="grid grid-cols-4 md:grid-cols-7 gap-2 md:gap-3 mb-6">
          <div 
            onClick={() => setActiveFilter(activeFilter === 'all' ? 'all' : 'all')}
            className={`rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border p-3 cursor-pointer transition-all hover:scale-105 ${activeFilter === 'all' ? 'border-primary ring-2 ring-primary/50' : 'border-primary/20'}`}
          >
            <div className="flex flex-col items-center gap-1 text-center">
              <Users className="h-5 w-5 text-primary" />
              <p className="text-xl font-bold text-foreground">{totalUsers}</p>
              <p className="text-[10px] text-muted-foreground">{t('totalAll')}</p>
            </div>
          </div>
          
          <div 
            onClick={() => setActiveFilter(activeFilter === 'active' ? 'all' : 'active')}
            className={`rounded-xl bg-gradient-to-br from-success/20 to-success/5 border p-3 cursor-pointer transition-all hover:scale-105 ${activeFilter === 'active' ? 'border-success ring-2 ring-success/50' : 'border-success/20'}`}
          >
            <div className="flex flex-col items-center gap-1 text-center">
              <UserCheck className="h-5 w-5 text-success" />
              <p className="text-xl font-bold text-foreground">{totalActive}</p>
              <p className="text-[10px] text-muted-foreground">{t('active')}</p>
            </div>
          </div>
          
          <div 
            onClick={() => setActiveFilter(activeFilter === 'pending' ? 'all' : 'pending')}
            className={`rounded-xl bg-gradient-to-br from-warning/20 to-warning/5 border p-3 cursor-pointer transition-all hover:scale-105 ${activeFilter === 'pending' ? 'border-warning ring-2 ring-warning/50' : 'border-warning/20'}`}
          >
            <div className="flex flex-col items-center gap-1 text-center">
              <Clock className="h-5 w-5 text-warning" />
              <p className="text-xl font-bold text-foreground">{totalPending}</p>
              <p className="text-[10px] text-muted-foreground">{t('waiting')}</p>
            </div>
          </div>
          
          <div 
            onClick={() => setActiveFilter(activeFilter === 'inactive' ? 'all' : 'inactive')}
            className={`rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-500/5 border p-3 cursor-pointer transition-all hover:scale-105 ${activeFilter === 'inactive' ? 'border-orange-500 ring-2 ring-orange-500/50' : 'border-orange-500/20'}`}
          >
            <div className="flex flex-col items-center gap-1 text-center">
              <Ban className="h-5 w-5 text-orange-500" />
              <p className="text-xl font-bold text-foreground">{totalInactive}</p>
              <p className="text-[10px] text-muted-foreground">{t('inactive')}</p>
            </div>
          </div>
          
          <div 
            onClick={() => setActiveFilter(activeFilter === 'expired' ? 'all' : 'expired')}
            className={`rounded-xl bg-gradient-to-br from-destructive/20 to-destructive/5 border p-3 cursor-pointer transition-all hover:scale-105 ${activeFilter === 'expired' ? 'border-destructive ring-2 ring-destructive/50' : 'border-destructive/20'}`}
          >
            <div className="flex flex-col items-center gap-1 text-center">
              <UserX className="h-5 w-5 text-destructive" />
              <p className="text-xl font-bold text-foreground">{totalExpired}</p>
              <p className="text-[10px] text-muted-foreground">{t('expired')}</p>
            </div>
          </div>
          
          <div 
            onClick={() => setActiveFilter(activeFilter === 'expiring' ? 'all' : 'expiring')}
            className={`rounded-xl bg-gradient-to-br from-info/20 to-info/5 border p-3 cursor-pointer transition-all hover:scale-105 ${activeFilter === 'expiring' ? 'border-info ring-2 ring-info/50' : 'border-info/20'}`}
          >
            <div className="flex flex-col items-center gap-1 text-center">
              <TrendingUp className="h-5 w-5 text-info" />
              <p className="text-xl font-bold text-foreground">{expiringIn7Days}</p>
              <p className="text-[10px] text-muted-foreground">{t('expiring')}</p>
            </div>
          </div>
          
          <div 
            onClick={() => setActiveFilter(activeFilter === 'admin' ? 'all' : 'admin')}
            className={`rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border p-3 cursor-pointer transition-all hover:scale-105 ${activeFilter === 'admin' ? 'border-primary ring-2 ring-primary/50' : 'border-primary/20'}`}
          >
            <div className="flex flex-col items-center gap-1 text-center">
              <Crown className="h-5 w-5 text-primary" />
              <p className="text-xl font-bold text-foreground">{totalAdmins}</p>
              <p className="text-[10px] text-muted-foreground">{t('adminBadge')}</p>
            </div>
          </div>
        </div>

        {/* Telegram Bot Health */}
        <TelegramHealthCard />

        {/* Customer Reviews Moderation */}
        <div className="mb-4">
          <ReviewModeration />
        </div>


        {/* Active Filter Indicator */}
        {activeFilter !== 'all' && (
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t('filter')}:</span>
            <span className="px-3 py-1 rounded-full bg-primary/20 text-primary text-sm font-medium">
              {activeFilter === 'active' && t('active')}
              {activeFilter === 'pending' && t('waiting')}
              {activeFilter === 'inactive' && t('inactive')}
              {activeFilter === 'expired' && t('expired')}
              {activeFilter === 'expiring' && t('expiring')}
              {activeFilter === 'admin' && t('adminBadge')}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveFilter('all')}
              className="h-7 px-2"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10 rounded-xl py-6 bg-secondary/30 border-border/50"
          />
        </div>

        {/* Pending Users - Only show when filter is 'all' or 'pending' */}
        {(activeFilter === 'all' || activeFilter === 'pending') && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-warning" />
              {t('pendingApproval')} ({pendingUsers.length})
            </h2>
            
            {pendingUsers.length === 0 ? (
              <div className="rounded-2xl bg-secondary/20 border border-border/30 p-8 text-center">
                <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-muted-foreground">{t('noPendingUsers')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingUsers.map((user) => (
                  <div
                    key={user.id}
                    className="rounded-2xl bg-card/60 backdrop-blur-xl border border-warning/30 p-4 md:p-5"
                  >
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Shield className="h-4 w-4 text-warning" />
                          <span className="font-medium">{user.email}</span>
                        </div>
                        {user.company_name && (
                          <div className="flex items-center gap-1.5 text-sm text-primary mb-1">
                            <Building2 className="h-3.5 w-3.5" />
                            <span>{user.company_name}</span>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {t('registeredAt')}: {formatDate(user.created_at)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => {
                            setSelectedUser(user);
                            setShowApproveDialog(true);
                          }}
                          size="sm"
                          className="bg-success hover:bg-success/90 rounded-lg text-xs"
                        >
                          <Check className="h-3 w-3 ml-1" />
                          {t('approve')}
                        </Button>
                        {isCEO && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedUser(user);
                              setShowDeleteDialog(true);
                            }}
                            className="rounded-lg text-xs text-destructive hover:bg-destructive hover:text-destructive-foreground border-destructive/30"
                          >
                            <Trash2 className="h-3 w-3 ml-1" />
                            {t('delete')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Approved Users - Only show when filter is not 'pending' */}
        {activeFilter !== 'pending' && (
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Users className="h-5 w-5 text-success" />
              {t('activeUsers')} ({approvedUsers.length})
            </h2>
            
            {approvedUsers.length === 0 ? (
              <div className="rounded-2xl bg-secondary/20 border border-border/30 p-8 text-center">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-muted-foreground">{t('noActiveUsers')}</p>
              </div>
            ) : (
            <div className="space-y-3">
              {approvedUsers.map((user) => {
                const expired = isExpired(user.expires_at);
                const daysRemaining = getDaysRemaining(user.expires_at);
                
                return (
                  <div
                    key={user.id}
                    className={`rounded-2xl bg-card/60 backdrop-blur-xl border p-4 md:p-5 ${
                      expired ? 'border-destructive/30' : 'border-success/30'
                    }`}
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col md:flex-row md:items-center gap-4">
                        <div className="flex-1">
                          {user.company_name && (
                            <div className="flex items-center gap-1.5 text-sm font-semibold text-primary mb-1">
                              <Building2 className="h-4 w-4" />
                              <span>{user.company_name}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Shield className={`h-4 w-4 ${expired ? 'text-destructive' : user.is_active === false ? 'text-muted-foreground' : 'text-success'}`} />
                            <span className={`font-medium ${user.is_active === false ? 'text-muted-foreground' : ''}`}>{user.email}</span>
                            {user.isAdmin && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary flex items-center gap-1">
                                <Crown className="h-3 w-3" />
                                {t('adminBadge')}
                              </span>
                            )}
                            {user.is_active === false && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground flex items-center gap-1">
                                <Ban className="h-3 w-3" />
                                {t('inactive')}
                              </span>
                            )}
                            {user.is_active !== false && expired && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/20 text-destructive">
                                {t('expired')}
                              </span>
                            )}
                            {user.is_active !== false && !expired && daysRemaining !== null && daysRemaining <= 10 && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-warning/20 text-warning flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                {daysRemaining} {t('daysRemaining')}
                              </span>
                            )}
                            {user.is_active !== false && !expired && daysRemaining !== null && daysRemaining > 10 && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-success/20 text-success">
                                {daysRemaining} {t('daysRemaining')}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Check className="h-3 w-3" />
                              {t('approvedAt')}: {formatDate(user.approved_at)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {t('expiresAt')}: {formatDate(user.expires_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {isCEO ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(user);
                            // Set current expiry date in the input
                            if (user.expires_at) {
                              const date = new Date(user.expires_at);
                              setCustomExpiryDate(date.toISOString().split('T')[0]);
                            } else {
                              setCustomExpiryDate(new Date().toISOString().split('T')[0]);
                            }
                            setShowExpiryDialog(true);
                          }}
                          className="rounded-lg text-xs border-primary/30 text-primary hover:text-primary"
                        >
                          <Calendar className="h-3 w-3 ml-1" />
                          {t('changeExpiry')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(user);
                            setNewCompanyName(user.company_name || '');
                            setShowCompanyDialog(true);
                          }}
                          className="rounded-lg text-xs"
                        >
                          <Pencil className="h-3 w-3 ml-1" />
                          {t('companyName')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(user);
                            setShowPasswordDialog(true);
                          }}
                          className="rounded-lg text-xs"
                        >
                          <Key className="h-3 w-3 ml-1" />
                          {t('changePasswordTitle')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleActive(user)}
                          className={`rounded-lg text-xs ${user.is_active === false ? 'text-success hover:text-success border-success/30' : 'text-warning hover:text-warning border-warning/30'}`}
                        >
                          {user.is_active === false ? (
                            <>
                              <Power className="h-3 w-3 ml-1" />
                              {t('activate')}
                            </>
                          ) : (
                            <>
                              <Ban className="h-3 w-3 ml-1" />
                              {t('deactivate')}
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRevoke(user)}
                          className="rounded-lg text-xs text-destructive hover:text-destructive"
                        >
                          <X className="h-3 w-3 ml-1" />
                          {t('revoke')}
                        </Button>
                        {!user.isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedUser(user);
                              setShowMakeAdminDialog(true);
                            }}
                            className="rounded-lg text-xs text-primary hover:text-primary border-primary/30"
                          >
                            <Crown className="h-3 w-3 ml-1" />
                            {t('makeAdmin')}
                          </Button>
                        )}
                        {isCEO && user.isAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedUser(user);
                              setShowRemoveAdminDialog(true);
                            }}
                            className="rounded-lg text-xs text-warning hover:text-warning border-warning/30"
                          >
                            <Crown className="h-3 w-3 ml-1" />
                            {t('removeAdmin')}
                          </Button>
                        )}
                        {(!user.isAdmin || isCEO) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedUser(user);
                              setShowDeleteDialog(true);
                            }}
                            className="rounded-lg text-xs text-destructive hover:bg-destructive hover:text-destructive-foreground border-destructive/30"
                          >
                            <Trash2 className="h-3 w-3 ml-1" />
                            {t('delete')}
                          </Button>
                        )}
                      </div>
                      ) : (
                        <div className="flex flex-wrap gap-2 items-center">
                          {!user.isAdmin && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedUser(user);
                                if (user.expires_at) {
                                  const date = new Date(user.expires_at);
                                  setCustomExpiryDate(date.toISOString().split('T')[0]);
                                } else {
                                  setCustomExpiryDate(new Date().toISOString().split('T')[0]);
                                }
                                setShowExpiryDialog(true);
                              }}
                              className="rounded-lg text-xs border-primary/30 text-primary hover:text-primary"
                            >
                              <Calendar className="h-3 w-3 ml-1" />
                              {t('renewExpiry')}
                            </Button>
                          )}
                          {!user.isAdmin && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSendResetEmail(user)}
                              className="rounded-lg text-xs border-info/30 text-info hover:text-info hover:bg-info/10"
                            >
                              <Mail className="h-3 w-3 ml-1" />
                              {t('sendResetEmail')}
                            </Button>
                          )}
                          <p className="text-xs text-muted-foreground italic w-full">
                            {t('adminRenewNote')}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </div>
        )}
      </div>

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t('approveUserTitle')}</DialogTitle>
            <DialogDescription>
              {t('approveUserDesc')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Label>{t('usageDuration')}</Label>
            <Select value={expiryDuration} onValueChange={setExpiryDuration}>
              <SelectTrigger className="mt-2 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t('oneDay')}</SelectItem>
                <SelectItem value="7">{t('oneWeek')}</SelectItem>
                <SelectItem value="30">{t('oneMonth')}</SelectItem>
                <SelectItem value="90">{t('threeMonths')}</SelectItem>
                <SelectItem value="180">{t('sixMonths')}</SelectItem>
                <SelectItem value="365">{t('oneYear')}</SelectItem>
                <SelectItem value="730">{t('twoYears')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowApproveDialog(false)}
              className="rounded-xl"
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleApprove}
              disabled={isUpdating}
              className="bg-success hover:bg-success/90 rounded-xl"
            >
              {isUpdating ? t('approving') : t('approve')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t('changePasswordTitle')}</DialogTitle>
            <DialogDescription>
              {t('newPasswordFor')} {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Label>{t('newPassword')}</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t('atLeast6Chars')}
              className="mt-2 rounded-xl"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowPasswordDialog(false);
                setNewPassword('');
              }}
              className="rounded-xl"
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleChangePassword}
              disabled={isUpdating || newPassword.length < 6}
              className="rounded-xl"
            >
              {isUpdating ? t('approving') : t('changing')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Company Name Dialog */}
      <Dialog open={showCompanyDialog} onOpenChange={setShowCompanyDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t('changeCompanyTitle')}</DialogTitle>
            <DialogDescription>
              {t('companyNameFor')} {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Label>{t('companyName')}</Label>
            <Input
              type="text"
              value={newCompanyName}
              onChange={(e) => setNewCompanyName(e.target.value)}
              placeholder={t('companyName')}
              className="mt-2 rounded-xl"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCompanyDialog(false);
                setNewCompanyName('');
              }}
              className="rounded-xl"
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleChangeCompanyName}
              disabled={isUpdating}
              className="rounded-xl"
            >
              {isUpdating ? t('approving') : t('changing')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Expiry Dialog */}
      <Dialog open={showExpiryDialog} onOpenChange={setShowExpiryDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t('changeExpiryTitle')}</DialogTitle>
            <DialogDescription>
              {t('expiryDateFor')} {selectedUser?.company_name || selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <div>
              <Label>{t('expiryDateLabel')}</Label>
              <Input
                type="date"
                value={customExpiryDate}
                onChange={(e) => setCustomExpiryDate(e.target.value)}
                className="mt-2 rounded-xl"
              />
            </div>
            
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const date = new Date();
                  date.setDate(date.getDate() + 7);
                  setCustomExpiryDate(date.toISOString().split('T')[0]);
                }}
                className="rounded-lg text-xs"
              >
                {t('oneWeek')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const date = new Date();
                  date.setDate(date.getDate() + 30);
                  setCustomExpiryDate(date.toISOString().split('T')[0]);
                }}
                className="rounded-lg text-xs"
              >
                {t('oneMonth')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const date = new Date();
                  date.setDate(date.getDate() + 90);
                  setCustomExpiryDate(date.toISOString().split('T')[0]);
                }}
                className="rounded-lg text-xs"
              >
                {t('threeMonths')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const date = new Date();
                  date.setFullYear(date.getFullYear() + 1);
                  setCustomExpiryDate(date.toISOString().split('T')[0]);
                }}
                className="rounded-lg text-xs"
              >
                {t('oneYear')}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowExpiryDialog(false);
                setCustomExpiryDate('');
              }}
              className="rounded-xl"
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleSetCustomExpiry}
              disabled={isUpdating || !customExpiryDate}
              className="rounded-xl"
            >
              {isUpdating ? t('approving') : t('changing')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Account Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-destructive">{t('deleteAccountTitle')}</DialogTitle>
            <DialogDescription>
              {t('deleteAccountConfirm')} {selectedUser?.company_name || selectedUser?.email}?
              <br />
              <span className="text-destructive font-medium">{t('actionNotReversible')}</span>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false);
                setSelectedUser(null);
              }}
              className="rounded-xl"
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleDeleteAccount}
              disabled={isUpdating}
              variant="destructive"
              className="rounded-xl"
            >
              {isUpdating ? t('approving') : t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Make Admin Dialog */}
      <Dialog open={showMakeAdminDialog} onOpenChange={setShowMakeAdminDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              {t('makeAdminTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('makeAdminConfirm')}
              <br />
              <span className="font-medium">{selectedUser?.company_name || selectedUser?.email}</span>
              <br />
              <span className="text-warning font-medium mt-2 block">{t('makeAdminWarning')}</span>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowMakeAdminDialog(false);
                setSelectedUser(null);
              }}
              className="rounded-xl"
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleMakeAdmin}
              disabled={isUpdating}
              className="rounded-xl bg-primary hover:bg-primary/90"
            >
              {isUpdating ? t('approving') : t('makeAdmin')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Admin Dialog */}
      <Dialog open={showRemoveAdminDialog} onOpenChange={setShowRemoveAdminDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-warning">
              <Crown className="h-5 w-5" />
              {t('removeAdminTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('removeAdminConfirm')}
              <br />
              <span className="font-medium">{selectedUser?.company_name || selectedUser?.email}</span>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowRemoveAdminDialog(false);
                setSelectedUser(null);
              }}
              className="rounded-xl"
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleRemoveAdmin}
              disabled={isUpdating}
              variant="destructive"
              className="rounded-xl"
            >
              {isUpdating ? t('approving') : t('removeAdmin')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audit Log Dialog */}
      <Dialog open={showActivityLogDialog} onOpenChange={setShowActivityLogDialog}>
        <DialogContent className="rounded-2xl max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              {t('activityLogTitle')}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto -mx-2 px-2">
            {isLoadingLogs ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : activityLogs.length === 0 ? (
              <div className="text-center py-12">
                <History className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-muted-foreground">{t('noActivityLogs')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activityLogs.map((log) => {
                  const isRoleChange = log.action_type === 'make_admin' || log.action_type === 'remove_admin';
                  return (
                    <div
                      key={log.id}
                      className={`rounded-xl border p-3 ${isRoleChange ? 'border-primary/30 bg-primary/5' : 'border-border/40 bg-secondary/20'}`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isRoleChange ? 'bg-primary/20 text-primary' : 'bg-success/20 text-success'}`}>
                          {getActionTypeLabel(log.action_type)}
                        </span>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(log.created_at)}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground space-y-1">
                        <p className="flex items-center gap-1.5">
                          <Shield className="h-3 w-3 text-primary" />
                          <span className="text-foreground font-medium">{log.admin_email || '—'}</span>
                        </p>
                        {log.target_user_email && (
                          <p className="flex items-center gap-1.5">
                            <UserCheck className="h-3 w-3" />
                            {log.target_user_email}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={fetchActivityLogs}
              className="rounded-xl flex items-center gap-1.5"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingLogs ? 'animate-spin' : ''}`} />
              {t('refresh')}
            </Button>
            <Button
              onClick={() => setShowActivityLogDialog(false)}
              className="rounded-xl"
            >
              {t('cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

  );
}
