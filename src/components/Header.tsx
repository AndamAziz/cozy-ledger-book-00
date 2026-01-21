import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { LogOut, Calendar, Wallet, Building2, Clock } from 'lucide-react';
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
    <header className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-card/90 to-card/70 backdrop-blur-lg p-4 md:p-5 mb-6 animate-fade-in shadow-xl">
      {/* Subtle background glow */}
      <div className="absolute -top-16 -right-16 w-32 h-32 rounded-full bg-primary/10 blur-2xl" />
      
      <div className="relative flex flex-col gap-3">
        {/* Compact Date & Time Row */}
        <div className="flex items-center justify-between gap-2 py-2 px-3 rounded-xl bg-secondary/40 border border-border/20">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-base font-mono font-bold text-primary">{formatTime(currentTime)}</span>
          </div>
          <span className="text-xs md:text-sm text-muted-foreground">{formatDate(currentTime)}</span>
        </div>

        {/* Main Header Row */}
        <div className="flex items-center justify-between gap-3">
          {/* Logo & Title */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="relative flex-shrink-0">
              <div className="w-11 h-11 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-primary to-success flex items-center justify-center shadow-lg">
                <Wallet className="h-5 w-5 md:h-6 md:w-6 text-primary-foreground" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-success border-2 border-card flex items-center justify-center">
                <span className="text-[7px] text-white font-bold">✓</span>
              </div>
            </div>
            <div className="min-w-0">
              {companyName && (
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Building2 className="h-3 w-3 text-primary flex-shrink-0" />
                  <span className="text-xs font-semibold text-primary truncate">{companyName}</span>
                </div>
              )}
              <h1 className="text-base md:text-lg font-bold text-foreground truncate">
                بەڕێوەبردنی داراییی
              </h1>
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs mt-0.5">
                <Calendar className="h-3 w-3 flex-shrink-0" />
                <span>{currentMonthLabel}</span>
              </div>
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <MonthPicker value={currentMonthKey} onChange={onMonthChange} />
            
            <Button
              variant="ghost"
              onClick={onLogout}
              size="sm"
              className="h-9 w-9 md:h-10 md:w-auto md:px-3 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden md:inline mr-1.5 text-xs font-medium">خروج</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
