import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LogOut, Calendar, Crown, Users } from 'lucide-react';
import { MonthPicker } from '@/components/MonthPicker';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { HeaderAction, HEADER_ACTION_CLASSES, HEADER_ACTION_ICON_CLASSES, HEADER_ACTION_LABEL_CLASSES } from '@/components/HeaderAction';
import { useLanguage } from '@/contexts/LanguageContext';

interface HeaderProps {
  currentMonthKey: string;
  currentMonthLabel: string;
  onMonthChange: (month: string) => void;
  onLogout: () => void;
  onOpenAdmin?: () => void;
  isAdmin?: boolean;
  companyName?: string | null;
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function Header({ currentMonthKey, currentMonthLabel, onMonthChange, onLogout, onOpenAdmin, isAdmin, companyName }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const { t } = useLanguage();
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const formatDate = (date: Date) => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = MONTH_ABBR[date.getMonth()];
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  return (
    <header className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-card/90 to-card/70 backdrop-blur-lg mb-3 sm:mb-5 animate-fade-in shadow-xl">
      {/* Subtle background glow */}
      <div className="absolute -top-16 -right-16 w-28 h-28 rounded-full bg-primary/10 blur-2xl" />
      
      <div className="relative">
        {/* Company Name Banner */}
        {companyName && (
          <div className="flex items-center justify-center gap-2 py-2 px-3 bg-gradient-to-r from-primary/15 via-primary/10 to-primary/15 border-b border-primary/15">
            <img
              src="/logo.png"
              alt="ANDAM logo"
              width={32}
              height={32}
              className="h-5 w-5 sm:h-6 sm:w-6 rounded-md object-cover flex-shrink-0"
            />
            <span className="text-xs sm:text-sm md:text-base font-bold text-primary truncate">{companyName}</span>
          </div>
        )}


        {/* Main header content */}
        <div className="p-2.5 sm:p-3.5 md:p-5 flex flex-col gap-2 sm:gap-3">
          {/* Title + Logout row */}
          <div className="flex items-center justify-between">
            {isAdmin && onOpenAdmin ? (
              <HeaderAction onClick={onOpenAdmin}>
                <Users className={HEADER_ACTION_ICON_CLASSES} />
                <span className={HEADER_ACTION_LABEL_CLASSES}>{t('adminPanel')}</span>
              </HeaderAction>
            ) : (
              <h1 className="text-sm sm:text-base md:text-lg font-bold text-foreground truncate">
                {t('financialManagement')}
              </h1>
            )}
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                onClick={() => navigate('/subscribe')}
                size="sm"
                aria-label="Subscribe / Manage billing"
                className="h-7 sm:h-8 px-2 sm:px-2.5 rounded-lg bg-gradient-to-r from-primary/15 to-gold/15 text-primary hover:from-primary/25 hover:to-gold/25 transition-colors flex items-center gap-1 touch-manipulation"
              >
                <Crown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
              <Button
                variant="ghost"
                onClick={onLogout}
                size="sm"
                aria-label={t('logout') || 'Logout'}
                className="h-7 sm:h-8 px-2 sm:px-2.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors flex items-center gap-1 touch-manipulation"
              >
                <LogOut className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="text-[10px] sm:text-xs font-medium hidden xs:inline">{t('logout')}</span>
              </Button>
            </div>
          </div>

          {/* Date + Controls row */}
          <div className="flex items-center justify-between gap-1.5 py-1.5 sm:py-2 px-2 sm:px-2.5 rounded-xl bg-secondary/40 border border-border/20">
            <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
              <MonthPicker value={currentMonthKey} onChange={onMonthChange} />
            </div>
            <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
              <div className={cn(HEADER_ACTION_CLASSES, 'select-none cursor-default hover:scale-100 active:scale-100')}>
                <Calendar className={HEADER_ACTION_ICON_CLASSES} />
                <span className={HEADER_ACTION_LABEL_CLASSES}>{formatDate(currentTime)}</span>
              </div>
              <LanguageSwitcher />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
