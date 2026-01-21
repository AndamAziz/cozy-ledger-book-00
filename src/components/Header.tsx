import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { LogOut, Building2, Globe } from 'lucide-react';
import { MonthPicker } from '@/components/MonthPicker';
import { useLanguage } from '@/contexts/LanguageContext';

interface HeaderProps {
  currentMonthKey: string;
  currentMonthLabel: string;
  onMonthChange: (month: string) => void;
  onLogout: () => void;
  companyName?: string | null;
}

export function Header({ currentMonthKey, currentMonthLabel, onMonthChange, onLogout, companyName }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const { t, language, setLanguage } = useLanguage();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute for date only

    return () => clearInterval(timer);
  }, []);

  const formatDate = (date: Date) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    const dayName = days[date.getDay()];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    
    return `${dayName}, ${day} ${month} ${year}`;
  };

  const toggleLanguage = () => {
    setLanguage(language === 'ku' ? 'en' : 'ku');
  };

  return (
    <header className="relative overflow-hidden rounded-xl sm:rounded-2xl border border-primary/20 bg-gradient-to-br from-card/90 to-card/70 backdrop-blur-lg p-3 sm:p-4 md:p-5 mb-4 sm:mb-6 animate-fade-in shadow-xl">
      {/* Subtle background glow */}
      <div className="absolute -top-16 -right-16 w-24 sm:w-32 h-24 sm:h-32 rounded-full bg-primary/10 blur-2xl" />
      
      <div className="relative flex flex-col gap-2.5 sm:gap-4">
        {/* Company Name - Full Width on Mobile */}
        {companyName && (
          <div className="flex items-center justify-center gap-2 py-2 sm:py-2.5 px-3 sm:px-4 rounded-lg sm:rounded-xl bg-gradient-to-r from-primary/15 via-primary/10 to-primary/15 border border-primary/20">
            <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
            <span className="text-sm sm:text-base md:text-lg font-bold text-primary truncate">{companyName}</span>
          </div>
        )}

        {/* Date & Language Row */}
        <div className="flex items-center justify-between gap-2 sm:gap-3 py-2 sm:py-2.5 px-2.5 sm:px-3 rounded-lg sm:rounded-xl bg-secondary/40 border border-border/20">
          <span className="text-[10px] sm:text-xs md:text-sm text-foreground truncate">{formatDate(currentTime)}</span>
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 px-3 py-1.5 rounded-lg bg-info/15 hover:bg-info/25 border border-info/30 transition-all duration-200 hover:scale-105 active:scale-95"
          >
            <Globe className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-info" />
            <span className="text-sm sm:text-base font-bold text-info">
              {language === 'ku' ? 'EN' : 'کو'}
            </span>
          </button>
        </div>

        {/* Title & Actions Row */}
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          {/* Title Only */}
          <h1 className="text-base sm:text-lg md:text-xl font-bold text-foreground truncate">
            {t('financialManagement')}
          </h1>
          
          {/* Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <MonthPicker value={currentMonthKey} onChange={onMonthChange} />
            
            <Button
              variant="ghost"
              onClick={onLogout}
              size="sm"
              className="h-8 sm:h-9 px-2 sm:px-2.5 md:px-3 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors flex items-center gap-1 sm:gap-1.5 touch-manipulation"
            >
              <LogOut className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="text-[10px] sm:text-xs md:text-sm font-medium hidden xs:inline">{t('logout')}</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
