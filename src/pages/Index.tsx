import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useFinanceData } from '@/hooks/useFinanceData';
import { useLanguage } from '@/contexts/LanguageContext';
import { LoginForm } from '@/components/LoginForm';
import { PendingApproval } from '@/components/PendingApproval';
import { ExpiredSubscription } from '@/components/ExpiredSubscription';
import { DeactivatedAccount } from '@/components/DeactivatedAccount';
import { ExpiryWarningBanner } from '@/components/ExpiryWarningBanner';
import { AdminPanel } from '@/components/admin/AdminPanel';
import { Header } from '@/components/Header';
import { TabButton } from '@/components/TabButton';
import { AlertBox } from '@/components/AlertBox';
import { FinanceTab } from '@/components/FinanceTab';
import { InventoryTab } from '@/components/InventoryTab';
import { SalesTab } from '@/components/SalesTab';
import { ReportsTab } from '@/components/ReportsTab';
import { SplashScreen } from '@/components/SplashScreen';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Users } from 'lucide-react';

type TabType = 'finance' | 'inventory' | 'sales' | 'reports';

interface DashboardProps {
  onOpenAdmin: () => void;
  isAdmin: boolean;
  companyName?: string | null;
  daysUntilExpiry?: number | null;
  userEmail?: string;
}

const Dashboard = ({ onOpenAdmin, isAdmin, companyName, daysUntilExpiry, userEmail }: DashboardProps) => {
  const { logout } = useAuth();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabType>('finance');
  const financeData = useFinanceData();

  const summary = financeData.getSummary();
  const lowStockItems = financeData.getLowStockItems();

  return (
    <>
      <Helmet>
        <title>{companyName ? `${companyName} - ` : ''}{t('financialManagement')} - {financeData.getCurrentMonthLabel()}</title>
        <meta name="description" content={t('splashSubtitle')} />
      </Helmet>

      <div className="min-h-screen p-2 sm:p-3 md:p-6 safe-area-inset">
        <div className="max-w-5xl mx-auto">
          {/* Admin Button - Styled like dashboard buttons */}
          {isAdmin && (
            <div className="mb-3 sm:mb-4 no-print">
              <Button
                onClick={onOpenAdmin}
                className="group relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-br from-info/20 via-info/10 to-transparent border border-info/30 hover:border-info/50 p-3 sm:p-4 h-auto w-full md:w-auto transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-info/20 touch-manipulation"
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-gradient-to-br from-info to-info/80 flex items-center justify-center shadow-lg shadow-info/30">
                    <Users className="h-5 w-5 sm:h-6 sm:w-6 text-info-foreground" />
                  </div>
                  <div className="text-start">
                    <p className="font-bold text-foreground text-sm sm:text-base">{t('adminPanel')}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">{t('users')}</p>
                  </div>
                </div>
                {/* Decorative gradient */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-info/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
            </div>
          )}

          {/* Expiry Warning Banner */}
          {daysUntilExpiry !== null && daysUntilExpiry !== undefined && daysUntilExpiry <= 10 && userEmail && (
            <ExpiryWarningBanner daysUntilExpiry={daysUntilExpiry} email={userEmail} />
          )}

          <Header
            currentMonthKey={financeData.currentMonthKey}
            currentMonthLabel={financeData.getCurrentMonthLabel()}
            onMonthChange={financeData.changeMonth}
            onLogout={logout}
            companyName={companyName}
          />

          <AlertBox lowStockItems={lowStockItems} />

          {/* Tab Navigation */}
          <div className="relative mb-4 sm:mb-6 md:mb-8 no-print">
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2 md:gap-3 p-2 sm:p-2.5 md:p-3 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-secondary/40 via-secondary/20 to-transparent backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/20">
              <TabButton active={activeTab === 'finance'} onClick={() => setActiveTab('finance')} icon="💰" label={t('finance')} />
              <TabButton active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} icon="📦" label={t('inventory')} />
              <TabButton active={activeTab === 'sales'} onClick={() => setActiveTab('sales')} icon="🛒" label={t('sales')} />
              <TabButton active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} icon="📊" label={t('reports')} />
            </div>
          </div>

          {activeTab === 'finance' && (
            <FinanceTab incomeData={financeData.incomeData} expenseData={financeData.expenseData} summary={summary} maxDays={financeData.getMaxDays()} defaultDay={financeData.getDefaultDay()} currentMonthKey={financeData.currentMonthKey} prevMonthSummary={financeData.prevMonthSummary} onAddIncome={financeData.addIncome} onUpdateIncome={financeData.updateIncome} onDeleteIncome={financeData.deleteIncome} onAddExpense={financeData.addExpense} onUpdateExpense={financeData.updateExpense} onDeleteExpense={financeData.deleteExpense} onClearAll={financeData.clearAllData} />
          )}
          {activeTab === 'inventory' && (
            <InventoryTab cigaretteData={financeData.cigaretteData} summary={summary} onAddCigarette={financeData.addCigarette} onUpdateCigarette={financeData.updateCigarette} onDeleteCigarette={financeData.deleteCigarette} onAddStock={financeData.addStock} onUpdateStock={financeData.updateStock} />
          )}
          {activeTab === 'sales' && (
            <SalesTab salesData={financeData.salesData} cigaretteData={financeData.cigaretteData} summary={summary} maxDays={financeData.getMaxDays()} defaultDay={financeData.getDefaultDay()} currentMonthKey={financeData.currentMonthKey} onAddSale={financeData.addSale} onDeleteSale={financeData.deleteSale} />
          )}
          {activeTab === 'reports' && (
            <ReportsTab incomeData={financeData.incomeData} expenseData={financeData.expenseData} cigaretteData={financeData.cigaretteData} salesData={financeData.salesData} summary={summary} currentMonthLabel={financeData.getCurrentMonthLabel()} currentMonthKey={financeData.currentMonthKey} />
          )}
        </div>
      </div>
    </>
  );
};

const Index = () => {
  const { user, isAuthenticated, isLoading, login, signup, logout } = useAuth();
  const { isAdmin, approvalStatus, isLoading: roleLoading } = useUserRole(user);
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  if (isLoading || (isAuthenticated && roleLoading)) {
    return <SplashScreen />;
  }

  if (!isAuthenticated) {
    return <LoginForm onLogin={login} onSignup={signup} />;
  }

  // Check if user is approved (admin is always approved)
  if (!isAdmin && approvalStatus) {
    // Check if account is deactivated
    if (!approvalStatus.isActive) {
      return <DeactivatedAccount email={user?.email || ''} onLogout={logout} />;
    }
    if (approvalStatus.isExpired && approvalStatus.expiresAt) {
      return <ExpiredSubscription email={user?.email || ''} expiresAt={approvalStatus.expiresAt} onLogout={logout} />;
    }
    if (!approvalStatus.isApproved) {
      return <PendingApproval email={user?.email || ''} onLogout={logout} />;
    }
  }

  if (showAdminPanel && isAdmin) {
    return <AdminPanel onBack={() => setShowAdminPanel(false)} />;
  }

  return (
    <Dashboard 
      onOpenAdmin={() => setShowAdminPanel(true)} 
      isAdmin={isAdmin} 
      companyName={approvalStatus?.companyName}
      daysUntilExpiry={approvalStatus?.daysUntilExpiry}
      userEmail={user?.email}
    />
  );
};

export default Index;
