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
      
      <div className="relative flex flex-col gap-4">
        {/* Company Name - Full Width on Mobile */}
        {companyName && (
          <div className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-primary/15 via-primary/10 to-primary/15 border border-primary/20">
            <Building2 className="h-5 w-5 text-primary flex-shrink-0" />
            <span className="text-base md:text-lg font-bold text-primary">{companyName}</span>
          </div>
        )}

        {/* Date & Time Row */}
        <div className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-xl bg-secondary/40 border border-border/20">
          <span className="text-xs md:text-sm text-foreground">{formatDate(currentTime)}</span>
          <div className="flex items-center gap-2">
            <span className="text-lg md:text-xl font-mono font-bold text-primary">{formatTime(currentTime)}</span>
            <Clock className="h-4 w-4 text-primary" />
          </div>
        </div>

        {/* Title & Actions Row */}
        <div className="flex items-center justify-between gap-3">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-gradient-to-br from-primary to-success flex items-center justify-center shadow-lg">
                <Wallet className="h-6 w-6 md:h-7 md:w-7 text-primary-foreground" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-success border-2 border-card flex items-center justify-center">
                <span className="text-[8px] text-white font-bold">✓</span>
              </div>
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-foreground">
                بەڕێوەبردنی داراییی
              </h1>
              <div className="flex items-center gap-1.5 text-muted-foreground text-sm mt-1">
                <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
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
              className="h-10 w-10 md:h-10 md:w-auto md:px-3 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden md:inline mr-2 text-sm font-medium">خروج</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
