import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { HelpGuide } from '@/components/HelpGuide';
import { SplashScreen } from '@/components/SplashScreen';
import { OnboardingScreen } from '@/components/OnboardingScreen';
import { ReviewForm } from '@/components/reviews/ReviewForm';
import { REVIEWS_I18N, getReviewLang } from '@/lib/reviews';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { PriceTickerBar } from '@/components/crypto/PriceTickerBar';
import { Users, Sparkles, Tv, Film, Bitcoin, Moon, BookOpen, Radio } from 'lucide-react';
import { SportLivePlayer } from '@/components/sport/SportLivePlayer';
import { AdSenseStatus } from '@/components/AdSenseStatus';

const PRAYER_LABEL: Record<string, string> = {
  en: 'Prayer Times & Qibla',
  ku: 'کاتەکانی نوێژ و قیبلە',
  ar: 'أوقات الصلاة والقبلة',
  fa: 'اوقات نماز و قبله',
  tr: 'Namaz Vakitleri ve Kıble',
};

const QURAN_LABEL: Record<string, string> = {
  en: 'The Holy Quran',
  ku: 'قورئانی پیرۆز',
  ar: 'القرآن الكريم',
  fa: 'قرآن کریم',
  tr: 'Kur’an-ı Kerim',
};

type TabType = 'finance' | 'inventory' | 'sales' | 'reports';

const SPORT_OPEN_KEY = 'ctp-sport-live-open';

interface DashboardProps {
  onOpenAdmin: () => void;
  isAdmin: boolean;
  companyName?: string | null;
  daysUntilExpiry?: number | null;
  userEmail?: string;
  user: import('@supabase/supabase-js').User | null;
}

const Dashboard = ({ onOpenAdmin, isAdmin, companyName, daysUntilExpiry, userEmail, user }: DashboardProps) => {
  const { logout } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('finance');
  const [sportOpen, setSportOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    // Restore the Sport Live view if an ad hijacked the tab / forced a reload.
    return sessionStorage.getItem(SPORT_OPEN_KEY) === '1';
  });
  const financeData = useFinanceData();

  // Persist open state so returning from an ad tab (or a forced reload) reopens
  // Sport Live automatically instead of forcing the user to click again.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sportOpen) sessionStorage.setItem(SPORT_OPEN_KEY, '1');
    else sessionStorage.removeItem(SPORT_OPEN_KEY);
  }, [sportOpen]);
  const reviewI18n = REVIEWS_I18N[getReviewLang(language)];

  const summary = financeData.getSummary();
  const lowStockItems = financeData.getLowStockItems();

  return (
    <>
      <Helmet>
        <title>{companyName ? `${companyName} - ` : ''}{t('financialManagement')} - {financeData.getCurrentMonthLabel()}</title>
        <meta name="description" content={t('splashSubtitle')} />
      </Helmet>

      <div className="min-h-screen min-h-[100dvh] p-1.5 sm:p-3 md:p-6 safe-area-inset">
        <div className="max-w-5xl mx-auto">
          {/* Live price ticker */}
          <PriceTickerBar />

          {/* Admin Button */}
          {isAdmin && (
            <div className="mb-2 sm:mb-3 no-print">
              <Button
                onClick={onOpenAdmin}
                className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-info/20 via-info/10 to-transparent border border-info/30 hover:border-info/50 p-2.5 sm:p-3.5 h-auto w-full md:w-auto transition-all duration-200 touch-manipulation"
              >
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-info to-info/80 flex items-center justify-center shadow-md shadow-info/30">
                    <Users className="h-4 w-4 sm:h-5 sm:w-5 text-info-foreground" />
                  </div>
                  <div className="text-start">
                    <p className="font-bold text-foreground text-xs sm:text-sm">{t('adminPanel')}</p>
                    <p className="text-[9px] sm:text-xs text-muted-foreground">{t('users')}</p>
                  </div>
                </div>
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

          {/* External link buttons */}
          <div className="mb-2 sm:mb-3 no-print">
            <a
              href="https://insta.kurdcloud.xyz/"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/30 hover:border-primary/50 p-2.5 sm:p-3.5 transition-all duration-200 touch-manipulation active:scale-95 flex items-center gap-2.5 sm:gap-3 w-full"
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-md shadow-primary/30 flex-shrink-0">
                <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-foreground text-xs sm:text-sm truncate">ALL IN ONE</span>
            </a>
          </div>

          {/* TV + Sport Live (compact) */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3 sm:mb-5 no-print items-stretch">
            <a
              href="https://famelack.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-info/20 via-info/10 to-transparent border border-info/30 hover:border-info/50 px-2 py-2 sm:px-2.5 sm:py-2.5 transition-all duration-200 touch-manipulation active:scale-95 flex items-center justify-center gap-1.5 sm:gap-2 w-full h-full min-h-[44px] sm:min-h-[48px]"
            >
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-gradient-to-br from-info to-info/80 flex items-center justify-center shadow-sm shadow-info/30 flex-shrink-0">
                <Tv className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-info-foreground" />
              </div>
              <span className="font-bold text-foreground text-[11px] sm:text-xs truncate">TV</span>
            </a>
            <button
              onClick={() => setSportOpen(true)}
              className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-success/20 via-success/10 to-transparent border border-success/30 hover:border-success/50 px-2 py-2 sm:px-2.5 sm:py-2.5 transition-all duration-200 touch-manipulation active:scale-95 flex items-center justify-center gap-1.5 sm:gap-2 w-full h-full min-h-[44px] sm:min-h-[48px]"
            >
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-gradient-to-br from-success to-success/80 flex items-center justify-center shadow-sm shadow-success/30 flex-shrink-0">
                <Radio className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-success-foreground" />
              </div>
              <span className="font-bold text-foreground text-[11px] sm:text-xs truncate">Sport Live</span>
            </button>
          </div>




          {/* Movies + Crypto Tracker (side by side) */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3 sm:mb-5 no-print">
            <button
              onClick={() => navigate('/movies')}
              className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-accent/20 via-accent/10 to-transparent border border-accent/30 hover:border-accent/50 p-2.5 sm:p-3.5 transition-all duration-200 touch-manipulation active:scale-95 flex items-center gap-2.5 sm:gap-3"
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-accent to-amber-400 flex items-center justify-center shadow-md shadow-accent/30 flex-shrink-0">
                <Film className="h-4 w-4 sm:h-5 sm:w-5 text-accent-foreground" />
              </div>
              <span className="font-bold text-foreground text-xs sm:text-sm truncate">Movies 🎬</span>
            </button>
            <button
              onClick={() => navigate('/crypto')}
              className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-[#f0b90b]/20 via-[#f0b90b]/10 to-transparent border border-[#f0b90b]/30 hover:border-[#f0b90b]/50 p-2.5 sm:p-3.5 transition-all duration-200 touch-manipulation active:scale-95 flex items-center gap-2.5 sm:gap-3"
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-[#f0b90b] to-[#f0b90b]/80 flex items-center justify-center shadow-md shadow-[#f0b90b]/30 flex-shrink-0">
                <Bitcoin className="h-4 w-4 sm:h-5 sm:w-5 text-black" />
              </div>
              <span className="font-bold text-foreground text-xs sm:text-sm truncate">{t('cryptoTracker')}</span>
            </button>
          </div>

          {/* Prayer Times & Qibla + Holy Quran */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3 sm:mb-5 no-print">
            <button
              onClick={() => navigate('/prayer')}
              className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/20 via-gold/10 to-transparent border border-primary/30 hover:border-gold/50 p-2.5 sm:p-3.5 transition-all duration-200 touch-manipulation active:scale-95 flex items-center gap-2.5 sm:gap-3 w-full"
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-primary to-gold flex items-center justify-center shadow-md shadow-primary/30 flex-shrink-0">
                <Moon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              <span className="font-bold text-foreground text-[10px] sm:text-xs whitespace-normal">🕌 {PRAYER_LABEL[language] || PRAYER_LABEL.en}</span>
            </button>
            <button
              onClick={() => navigate('/quran')}
              className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-gold/20 via-primary/10 to-transparent border border-gold/30 hover:border-gold/60 p-2.5 sm:p-3.5 transition-all duration-200 touch-manipulation active:scale-95 flex items-center gap-2.5 sm:gap-3 w-full"
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-gold to-primary flex items-center justify-center shadow-md shadow-gold/30 flex-shrink-0">
                <BookOpen className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              <span className="font-bold text-foreground text-[10px] sm:text-xs whitespace-normal">📖 {QURAN_LABEL[language] || QURAN_LABEL.en}</span>
            </button>
          </div>








          {/* Tab Navigation */}
          <div className="relative mb-3 sm:mb-5 md:mb-7 no-print">
            <div className="grid grid-cols-5 gap-1 sm:gap-1.5 md:gap-2.5 p-1.5 sm:p-2 md:p-2.5 rounded-xl sm:rounded-2xl bg-gradient-to-br from-secondary/40 via-secondary/20 to-transparent backdrop-blur-xl border border-white/10 shadow-xl shadow-black/10">
              <TabButton active={activeTab === 'finance'} onClick={() => setActiveTab('finance')} icon="💰" label={t('finance')} />
              <TabButton active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} icon="📦" label={t('inventory')} />
              <TabButton active={activeTab === 'sales'} onClick={() => setActiveTab('sales')} icon="🛒" label={t('sales')} />
              <TabButton active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} icon="📊" label={t('reports')} />
              <HelpGuide />
            </div>
          </div>

          {activeTab === 'finance' && (
            <FinanceTab incomeData={financeData.incomeData} expenseData={financeData.expenseData} summary={summary} maxDays={financeData.getMaxDays()} defaultDay={financeData.getDefaultDay()} currentMonthKey={financeData.currentMonthKey} onMonthChange={financeData.changeMonth} locations={financeData.locations} selectedLocationId={financeData.selectedLocationId} onSelectLocation={financeData.setSelectedLocationId} onAddLocation={financeData.addLocation} onAddIncome={financeData.addIncome} onUpdateIncome={financeData.updateIncome} onDeleteIncome={financeData.deleteIncome} onAddExpense={financeData.addExpense} onUpdateExpense={financeData.updateExpense} onDeleteExpense={financeData.deleteExpense} onClearAll={financeData.clearAllData} />
          )}
          {activeTab === 'inventory' && (
            <InventoryTab cigaretteData={financeData.cigaretteData} summary={summary} onAddCigarette={financeData.addCigarette} onUpdateCigarette={financeData.updateCigarette} onDeleteCigarette={financeData.deleteCigarette} onAddStock={financeData.addStock} onUpdateStock={financeData.updateStock} />
          )}
          {activeTab === 'sales' && (
            <SalesTab salesData={financeData.salesData} cigaretteData={financeData.cigaretteData} summary={summary} maxDays={financeData.getMaxDays()} defaultDay={financeData.getDefaultDay()} currentMonthKey={financeData.currentMonthKey} onMonthChange={financeData.changeMonth} locations={financeData.locations} onAddLocation={financeData.addLocation} onAddSale={financeData.addSale} onDeleteSale={financeData.deleteSale} />
          )}
          {activeTab === 'reports' && (
            <ReportsTab incomeData={financeData.incomeData} expenseData={financeData.expenseData} cigaretteData={financeData.cigaretteData} salesData={financeData.salesData} summary={summary} currentMonthLabel={financeData.getCurrentMonthLabel()} currentMonthKey={financeData.currentMonthKey} />
          )}

          {/* Customer reviews */}
          <div className="mt-4 sm:mt-6 grid gap-3 no-print">
            <ReviewForm user={user} reviewerName={companyName} />
            <Button
              variant="outline"
              onClick={() => navigate('/reviews')}
              className="w-full rounded-xl border-gold/40 text-foreground hover:bg-gold/10"
            >
              {reviewI18n.seeAll}
            </Button>
            <AdSenseStatus />
          </div>
        </div>
      </div>

      {/* Sport Live player with auto-failover + health monitoring */}
      <SportLivePlayer open={sportOpen} onClose={() => setSportOpen(false)} />

    </>
  );
};

const ONBOARDING_SEEN_KEY = 'central-tech-platform-onboarding-seen';

const Index = () => {
  const { user, isAuthenticated, isLoading, login, signup, logout } = useAuth();
  const { isAdmin, approvalStatus, isLoading: roleLoading } = useUserRole(user);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !localStorage.getItem(ONBOARDING_SEEN_KEY);
  });

  const completeOnboarding = () => {
    localStorage.setItem(ONBOARDING_SEEN_KEY, '1');
    setShowOnboarding(false);
  };

  // Safety net: never leave the user stuck on an infinite splash screen.
  // If auth/role checks haven't resolved after 10s, show a retry option.
  const isInitialLoading = isLoading || (isAuthenticated && roleLoading);
  const [loadTimedOut, setLoadTimedOut] = useState(false);

  useEffect(() => {
    if (!isInitialLoading) {
      setLoadTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setLoadTimedOut(true), 10000);
    return () => clearTimeout(timer);
  }, [isInitialLoading]);

  if (isInitialLoading) {
    return <SplashScreen timedOut={loadTimedOut} />;
  }

  if (!isAuthenticated) {
    if (showOnboarding) {
      return <OnboardingScreen onComplete={completeOnboarding} />;
    }
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
      user={user}
    />
  );
};

export default Index;
