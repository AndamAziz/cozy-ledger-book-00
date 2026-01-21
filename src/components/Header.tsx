import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { LogOut, Calendar, Building2, Clock } from 'lucide-react';
import { MonthPicker } from '@/components/MonthPicker';

interface HeaderProps {
  currentMonthKey: string;
  currentMonthLabel: string;
  onMonthChange: (month: string) => void;
  onLogout: () => void;
  companyName?: string | null;
}

export function Header({ currentMonthKey, currentMonthLabel, onMonthChange, onLogout, companyName }: HeaderProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

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

  const formatTime = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
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

        {/* Date & Time Row */}
        <div className="flex items-center justify-between gap-2 sm:gap-3 py-2 sm:py-2.5 px-2.5 sm:px-3 rounded-lg sm:rounded-xl bg-secondary/40 border border-border/20">
          <span className="text-[10px] sm:text-xs md:text-sm text-foreground truncate">{formatDate(currentTime)}</span>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <span className="text-base sm:text-lg md:text-xl font-mono font-bold text-primary">{formatTime(currentTime)}</span>
            <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
          </div>
        </div>

        {/* Title & Actions Row */}
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          {/* Title Only */}
          <h1 className="text-base sm:text-lg md:text-xl font-bold text-foreground truncate">
            بەڕێوەبردنی داراییی
          </h1>
          
          {/* Actions - Improved */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <MonthPicker value={currentMonthKey} onChange={onMonthChange} />
            
            <Button
              variant="ghost"
              onClick={onLogout}
              size="sm"
              className="h-8 sm:h-9 px-2 sm:px-2.5 md:px-3 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors flex items-center gap-1 sm:gap-1.5 touch-manipulation"
            >
              <LogOut className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="text-[10px] sm:text-xs md:text-sm font-medium hidden xs:inline">خروج</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
