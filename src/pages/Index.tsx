import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useFinanceData } from '@/hooks/useFinanceData';
import { useLanguage } from '@/contexts/LanguageContext';
import { LoginForm } from '@/components/LoginForm';
import { PendingApproval } from '@/components/PendingApproval';
import { ExpiredSubscription } from '@/components/ExpiredSubscription';
import { DeactivatedAccount } from '@/components/DeactivatedAccount';
import { ExpiryWarningBanner } from '@/components/ExpiryWarningBanner';
import { isCeoEmail } from '@/lib/ceo';
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
import { Tv, Film, Bitcoin, Moon, BookOpen, Radio, Wallet } from 'lucide-react';
import { SportLivePlayer } from '@/components/sport/SportLivePlayer';


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
  const [financeOpen, setFinanceOpen] = useState(false);
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
        <meta name="description" content="Manage expenses, income, inventory, and sales with multi-currency PDF reports — plus live markets, prayer times, Quran, movies, and sports in one hub." />
        <link rel="canonical" href="https://andam.uk/" />
        <meta property="og:url" content="https://andam.uk/" />
      </Helmet>

      <main className="min-h-screen min-h-[100dvh] py-1.5 sm:py-3 md:py-6 page-shell">
        <div className="page-content">

          {/* Live price ticker */}
          <PriceTickerBar />

          {/* Expiry Warning Banner — never shown to the CEO / owner account */}
          {!isCeoEmail(userEmail) &&
            daysUntilExpiry !== null && daysUntilExpiry !== undefined && daysUntilExpiry <= 10 && userEmail && (
            <ExpiryWarningBanner daysUntilExpiry={daysUntilExpiry} email={userEmail} />
          )}

          <Header
            currentMonthKey={financeData.currentMonthKey}
            currentMonthLabel={financeData.getCurrentMonthLabel()}
            onMonthChange={financeData.changeMonth}
            onLogout={logout}
            onOpenAdmin={onOpenAdmin}
            isAdmin={isAdmin}
            companyName={companyName}
          />

          <AlertBox lowStockItems={lowStockItems} />


          {/* Elegant glass dashboard grid */}
          <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-5 no-print">
            {/* The Holy Quran — featured full-width card */}
            <button
              onClick={() => navigate('/quran')}
              className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-gold via-primary to-gold p-[1px] shadow-xl transition-all duration-200 ease-out hover:shadow-2xl hover:shadow-gold/20 active:scale-95 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            >
              <div className="flex items-center gap-4 rounded-[15px] bg-card/90 backdrop-blur-xl p-4 sm:p-5 transition-colors duration-200 group-hover:bg-card/95">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-gold to-primary shadow-[0_0_20px_hsl(var(--gold)/0.3)] transition-all duration-200 group-hover:scale-110 group-hover:shadow-[0_0_28px_hsl(var(--gold)/0.4)]">
                  <BookOpen className="h-6 w-6 text-gold-foreground transition-transform duration-200 group-hover:scale-110" />
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-base sm:text-lg font-bold text-foreground transition-colors duration-200 group-hover:text-gold-foreground">{QURAN_LABEL[language] || QURAN_LABEL.en}</span>
                </div>
              </div>
            </button>

            {/* Main launcher grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-4 gap-2.5 sm:gap-3 lg:gap-4">
              {/* TV */}
              <div className="rounded-2xl bg-gradient-to-br from-info to-primary p-[1px] shadow-lg transition-all duration-200 ease-out hover:shadow-xl hover:shadow-info/20 active:scale-95 active:brightness-95">
                <a
                  href="https://famelack.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative flex flex-col items-center justify-center rounded-[15px] bg-card/90 backdrop-blur-xl p-4 sm:p-5 transition-colors duration-200 hover:bg-card/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                >
                  <div className="mb-3 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-info to-primary shadow-[0_0_20px_hsl(var(--info)/0.3)] transition-all duration-200 group-hover:scale-110 group-hover:shadow-[0_0_28px_hsl(var(--info)/0.4)]">
                    <Tv className="h-6 w-6 text-white transition-transform duration-200 group-hover:scale-110" />
                  </div>
                  <span className="text-sm font-bold text-foreground text-center transition-colors duration-200 group-hover:text-info">TV</span>
                </a>
              </div>

              {/* Sport Live */}
              <div className="rounded-2xl bg-gradient-to-br from-success to-primary p-[1px] shadow-lg transition-all duration-200 ease-out hover:shadow-xl hover:shadow-success/20 active:scale-95 active:brightness-95">
                <button
                  onClick={() => setSportOpen(true)}
                  className="group relative flex flex-col items-center justify-center rounded-[15px] bg-card/90 backdrop-blur-xl w-full h-full p-4 sm:p-5 transition-colors duration-200 hover:bg-card/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                >
                  <div className="mb-3 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-success to-primary shadow-[0_0_20px_hsl(var(--success)/0.3)] transition-all duration-200 group-hover:scale-110 group-hover:shadow-[0_0_28px_hsl(var(--success)/0.4)]">
                    <Radio className="h-6 w-6 text-white transition-transform duration-200 group-hover:scale-110" />
                  </div>
                  <span className="text-sm font-bold text-foreground text-center transition-colors duration-200 group-hover:text-success">Sport Live</span>
                </button>
              </div>

              {/* Movies */}
              <div className="rounded-2xl bg-gradient-to-br from-accent to-primary p-[1px] shadow-lg transition-all duration-200 ease-out hover:shadow-xl hover:shadow-accent/20 active:scale-95 active:brightness-95">
                <button
                  onClick={() => navigate('/movies')}
                  className="group relative flex flex-col items-center justify-center rounded-[15px] bg-card/90 backdrop-blur-xl w-full h-full p-4 sm:p-5 transition-colors duration-200 hover:bg-card/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                >
                  <div className="mb-3 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-primary shadow-[0_0_20px_hsl(var(--accent)/0.3)] transition-all duration-200 group-hover:scale-110 group-hover:shadow-[0_0_28px_hsl(var(--accent)/0.4)]">
                    <Film className="h-6 w-6 text-white transition-transform duration-200 group-hover:scale-110" />
                  </div>
                  <span className="text-sm font-bold text-foreground text-center transition-colors duration-200 group-hover:text-accent">Movies</span>
                </button>
              </div>

              {/* Live TV */}
              <div className="rounded-2xl bg-gradient-to-br from-destructive to-primary p-[1px] shadow-lg transition-all duration-200 ease-out hover:shadow-xl hover:shadow-destructive/20 active:scale-95 active:brightness-95">
                <button
                  onClick={() => navigate('/live-tv')}
                  className="group relative flex flex-col items-center justify-center rounded-[15px] bg-card/90 backdrop-blur-xl w-full h-full p-4 sm:p-5 transition-colors duration-200 hover:bg-card/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                >
                  <div className="mb-3 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-destructive to-primary shadow-[0_0_20px_hsl(var(--destructive)/0.3)] transition-all duration-200 group-hover:scale-110 group-hover:shadow-[0_0_28px_hsl(var(--destructive)/0.4)]">
                    <Tv className="h-6 w-6 text-white transition-transform duration-200 group-hover:scale-110" />
                  </div>
                  <span className="text-sm font-bold text-foreground text-center transition-colors duration-200 group-hover:text-destructive">Live TV</span>
                </button>
              </div>

              {/* IPTV M3U */}
              <div className="rounded-2xl bg-gradient-to-br from-primary to-gold p-[1px] shadow-lg transition-all duration-200 ease-out hover:shadow-xl hover:shadow-primary/20 active:scale-95 active:brightness-95">
                <button
                  onClick={() => navigate('/iptv')}
                  className="group relative flex flex-col items-center justify-center rounded-[15px] bg-card/90 backdrop-blur-xl w-full h-full p-4 sm:p-5 transition-colors duration-200 hover:bg-card/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                >
                  <div className="mb-3 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-gold shadow-[0_0_20px_hsl(var(--primary)/0.3)] transition-all duration-200 group-hover:scale-110 group-hover:shadow-[0_0_28px_hsl(var(--primary)/0.4)]">
                    <Tv className="h-6 w-6 text-white transition-transform duration-200 group-hover:scale-110" />
                  </div>
                  <span className="text-sm font-bold text-foreground text-center transition-colors duration-200 group-hover:text-primary">IPTV M3U</span>
                </button>
              </div>

              {/* Crypto Tracker */}
              <div className="rounded-2xl bg-gradient-to-br from-warning to-primary p-[1px] shadow-lg transition-all duration-200 ease-out hover:shadow-xl hover:shadow-warning/20 active:scale-95 active:brightness-95">
                <button
                  onClick={() => navigate('/crypto')}
                  className="group relative flex flex-col items-center justify-center rounded-[15px] bg-card/90 backdrop-blur-xl w-full h-full p-4 sm:p-5 transition-colors duration-200 hover:bg-card/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                >
                  <div className="mb-3 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-warning to-primary shadow-[0_0_20px_hsl(var(--warning)/0.3)] transition-all duration-200 group-hover:scale-110 group-hover:shadow-[0_0_28px_hsl(var(--warning)/0.4)]">
                    <Bitcoin className="h-6 w-6 text-white transition-transform duration-200 group-hover:scale-110" />
                  </div>
                  <span className="text-sm font-bold text-foreground text-center transition-colors duration-200 group-hover:text-warning">{t('cryptoTracker')}</span>
                </button>
              </div>

              {/* Prayer Times & Qibla */}
              <div className="rounded-2xl bg-gradient-to-br from-primary to-secondary p-[1px] shadow-lg transition-all duration-200 ease-out hover:shadow-xl hover:shadow-primary/20 active:scale-95 active:brightness-95">
                <button
                  onClick={() => navigate('/prayer')}
                  className="group relative flex flex-col items-center justify-center rounded-[15px] bg-card/90 backdrop-blur-xl w-full h-full p-4 sm:p-5 transition-colors duration-200 hover:bg-card/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                >
                  <div className="mb-3 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary shadow-[0_0_20px_hsl(var(--primary)/0.3)] transition-all duration-200 group-hover:scale-110 group-hover:shadow-[0_0_28px_hsl(var(--primary)/0.4)]">
                    <Moon className="h-6 w-6 text-white transition-transform duration-200 group-hover:scale-110" />
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-foreground text-center leading-tight transition-colors duration-200 group-hover:text-primary">{PRAYER_LABEL[language] || PRAYER_LABEL.en}</span>
                </button>
              </div>

              {/* Financial Management */}
              <div className="rounded-2xl bg-gradient-to-br from-success to-primary p-[1px] shadow-lg transition-all duration-200 ease-out hover:shadow-xl hover:shadow-success/20 active:scale-95 active:brightness-95">
                <button
                  onClick={() => setFinanceOpen((v) => !v)}
                  aria-expanded={financeOpen}
                  className="group relative flex flex-col items-center justify-center rounded-[15px] bg-card/90 backdrop-blur-xl w-full h-full p-4 sm:p-5 transition-colors duration-200 hover:bg-card/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                >
                  <div className="mb-3 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-success to-primary shadow-[0_0_20px_hsl(var(--success)/0.3)] transition-all duration-200 group-hover:scale-110 group-hover:shadow-[0_0_28px_hsl(var(--success)/0.4)]">
                    <Wallet className="h-6 w-6 text-white transition-transform duration-200 group-hover:scale-110" />
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-foreground text-center leading-tight transition-colors duration-200 group-hover:text-success">{t('financialManagement')}</span>
                </button>
              </div>
            </div>
          </div>









          {/* Footer links */}
          <div className="mb-6 flex items-center justify-center gap-3 text-xs no-print">
            <Link to="/about" className="text-muted-foreground transition-colors hover:text-primary">
              About Us
            </Link>
            <span className="text-muted-foreground/40">·</span>
            <Link to="/contact" className="text-muted-foreground transition-colors hover:text-primary">
              Contact Us
            </Link>
          </div>

          {financeOpen && (
            <>
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
                <ReportsTab incomeData={financeData.incomeData} expenseData={financeData.expenseData} cigaretteData={financeData.cigaretteData} salesData={financeData.salesData} summary={summary} currentMonthLabel={financeData.getCurrentMonthLabel()} currentMonthKey={financeData.currentMonthKey} locations={financeData.locations} getSummary={financeData.getSummary} />
              )}
            </>
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
            
          </div>
        </div>
      </main>

      {/* Sport Live player with auto-failover + health monitoring */}
      <SportLivePlayer open={sportOpen} onClose={() => setSportOpen(false)} />

    </>
  );
};

const ONBOARDING_SEEN_KEY = 'central-tech-platform-onboarding-seen';

// Returns a safe same-origin relative path from ?next=..., or null.
const readSafeNext = (): string | null => {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('next');
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
};

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

  // If we came here from an OAuth consent redirect (?next=/.lovable/oauth/consent?...),
  // send the user back to the original URL as soon as they're signed in.
  useEffect(() => {
    if (!isAuthenticated) return;
    const next = readSafeNext();
    if (next) window.location.replace(next);
  }, [isAuthenticated]);

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
