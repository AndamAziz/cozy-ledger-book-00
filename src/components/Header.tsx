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
    <header className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card/80 to-transparent backdrop-blur-xl p-5 md:p-6 mb-8 animate-fade-in">
      {/* Background decorations */}
      <div className="absolute -top-20 -left-20 w-48 h-48 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -bottom-16 -right-16 w-40 h-40 rounded-full bg-success/10 blur-3xl" />
      
      <div className="relative flex flex-col gap-4">
        {/* Real-time Date & Time */}
        <div className="flex items-center justify-center gap-3 py-2 px-4 rounded-xl bg-secondary/30 border border-border/30 backdrop-blur-sm">
          <Clock className="h-4 w-4 text-primary animate-pulse" />
          <span className="text-sm font-medium text-foreground">{formatDate(currentTime)}</span>
          <span className="text-sm font-mono font-bold text-primary">{formatTime(currentTime)}</span>
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Logo & Title */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-primary to-success flex items-center justify-center shadow-lg shadow-primary/30">
                <Wallet className="h-7 w-7 md:h-8 md:w-8 text-primary-foreground" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-success border-2 border-background flex items-center justify-center">
                <span className="text-[8px] text-success-foreground font-bold">✓</span>
              </div>
            </div>
            <div>
              {companyName && (
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-primary">{companyName}</span>
                </div>
              )}
              <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-l from-primary via-success to-foreground bg-clip-text text-transparent">
                بەڕێوەبردنی داراییی
              </h1>
              <div className="flex items-center gap-2 text-muted-foreground text-sm mt-1">
                <Calendar className="h-3.5 w-3.5" />
                <span>{currentMonthLabel}</span>
              </div>
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-3">
            <MonthPicker value={currentMonthKey} onChange={onMonthChange} />
            
            <Button
              variant="ghost"
              onClick={onLogout}
              className="group flex items-center gap-2 px-3 py-2 md:px-4 md:py-2.5 h-auto min-h-[44px] rounded-xl bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground hover:scale-105 active:scale-95 transition-all duration-300 shadow-sm hover:shadow-lg hover:shadow-destructive/25"
            >
              <LogOut className="h-5 w-5 transition-transform group-hover:-translate-x-0.5" />
              <span className="hidden sm:inline font-medium text-sm">چوونەدەرەوە</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
