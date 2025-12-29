import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFinanceData } from '@/hooks/useFinanceData';
import { LoginForm } from '@/components/LoginForm';
import { Header } from '@/components/Header';
import { TabButton } from '@/components/TabButton';
import { AlertBox } from '@/components/AlertBox';
import { FinanceTab } from '@/components/FinanceTab';
import { InventoryTab } from '@/components/InventoryTab';
import { SalesTab } from '@/components/SalesTab';
import { ReportsTab } from '@/components/ReportsTab';
import { Helmet } from 'react-helmet-async';

type TabType = 'finance' | 'inventory' | 'sales' | 'reports';

const Dashboard = () => {
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('finance');
  const financeData = useFinanceData();

  const summary = financeData.getSummary();
  const lowStockItems = financeData.getLowStockItems();

  return (
    <>
      <Helmet>
        <title>بەڕێوەبردنی داراییی - {financeData.getCurrentMonthLabel()}</title>
        <meta name="description" content="سیستەمی بەڕێوەبردنی داراییی و کۆگای جگەرە" />
      </Helmet>

      <div className="min-h-screen p-3 md:p-6">
        <div className="max-w-5xl mx-auto">
          <Header
            currentMonthKey={financeData.currentMonthKey}
            currentMonthLabel={financeData.getCurrentMonthLabel()}
            onMonthChange={financeData.changeMonth}
            onLogout={logout}
          />

          <AlertBox lowStockItems={lowStockItems} />

          {/* Tab Navigation */}
          <div className="relative mb-8 no-print">
            <div className="grid grid-cols-4 gap-2 md:gap-4 p-2 rounded-2xl bg-secondary/20 backdrop-blur-sm border border-border/30">
              <TabButton
                active={activeTab === 'finance'}
                onClick={() => setActiveTab('finance')}
                icon="💰"
                label="داراییی"
              />
              <TabButton
                active={activeTab === 'inventory'}
                onClick={() => setActiveTab('inventory')}
                icon="📦"
                label="کۆگا"
              />
              <TabButton
                active={activeTab === 'sales'}
                onClick={() => setActiveTab('sales')}
                icon="🛒"
                label="فرۆشتن"
              />
              <TabButton
                active={activeTab === 'reports'}
                onClick={() => setActiveTab('reports')}
                icon="📊"
                label="ڕاپۆرت"
              />
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === 'finance' && (
            <FinanceTab
              incomeData={financeData.incomeData}
              expenseData={financeData.expenseData}
              summary={summary}
              maxDays={financeData.getMaxDays()}
              defaultDay={financeData.getDefaultDay()}
              currentMonthKey={financeData.currentMonthKey}
              onAddIncome={financeData.addIncome}
              onUpdateIncome={financeData.updateIncome}
              onDeleteIncome={financeData.deleteIncome}
              onAddExpense={financeData.addExpense}
              onUpdateExpense={financeData.updateExpense}
              onDeleteExpense={financeData.deleteExpense}
              onClearAll={financeData.clearAllData}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryTab
              cigaretteData={financeData.cigaretteData}
              summary={summary}
              onAddCigarette={financeData.addCigarette}
              onUpdateCigarette={financeData.updateCigarette}
              onDeleteCigarette={financeData.deleteCigarette}
              onAddStock={financeData.addStock}
              onUpdateStock={financeData.updateStock}
            />
          )}

          {activeTab === 'sales' && (
            <SalesTab
              salesData={financeData.salesData}
              cigaretteData={financeData.cigaretteData}
              summary={summary}
              maxDays={financeData.getMaxDays()}
              defaultDay={financeData.getDefaultDay()}
              currentMonthKey={financeData.currentMonthKey}
              onAddSale={financeData.addSale}
              onDeleteSale={financeData.deleteSale}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsTab
              incomeData={financeData.incomeData}
              expenseData={financeData.expenseData}
              cigaretteData={financeData.cigaretteData}
              salesData={financeData.salesData}
              summary={summary}
              currentMonthLabel={financeData.getCurrentMonthLabel()}
            />
          )}
        </div>
      </div>
    </>
  );
};

const Index = () => {
  const { isAuthenticated, isLoading, login, signup } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-success mx-auto mb-4 flex items-center justify-center text-3xl animate-pulse">
            💰
          </div>
          <p className="text-muted-foreground">چاوەڕوانبە...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginForm onLogin={login} onSignup={signup} />;
  }

  return <Dashboard />;
};

export default Index;
