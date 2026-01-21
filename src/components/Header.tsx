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
    <header className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-card/95 via-card/80 to-primary/5 backdrop-blur-xl p-6 md:p-8 mb-8 animate-fade-in shadow-2xl shadow-primary/10">
      {/* Background decorations */}
      <div className="absolute -top-32 -left-32 w-64 h-64 rounded-full bg-primary/15 blur-3xl animate-pulse" />
      <div className="absolute -bottom-24 -right-24 w-56 h-56 rounded-full bg-success/15 blur-3xl" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-gradient-to-br from-primary/5 to-success/5 blur-3xl" />
      
      <div className="relative flex flex-col gap-6">
        {/* Real-time Date & Time - Enhanced */}
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-4 md:gap-6 py-3 px-6 md:px-8 rounded-2xl bg-gradient-to-r from-secondary/50 via-secondary/30 to-secondary/50 border border-primary/20 backdrop-blur-md shadow-lg">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <span className="text-xl md:text-2xl font-mono font-bold text-primary tracking-wider">{formatTime(currentTime)}</span>
            </div>
            <div className="w-px h-8 bg-border/50" />
            <span className="text-sm md:text-base font-medium text-foreground">{formatDate(currentTime)}</span>
          </div>
        </div>

        {/* Main Content Row */}
        <div className="flex items-center justify-between gap-6 flex-wrap">
          {/* Logo & Title - Enhanced */}
          <div className="flex items-center gap-5">
            <div className="relative group">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary to-success blur-lg opacity-50 group-hover:opacity-75 transition-opacity" />
              <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-primary via-primary to-success flex items-center justify-center shadow-xl shadow-primary/40 border border-white/10">
                <Wallet className="h-8 w-8 md:h-10 md:w-10 text-primary-foreground drop-shadow-lg" />
              </div>
              <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-gradient-to-br from-success to-emerald-400 border-2 border-background flex items-center justify-center shadow-lg">
                <span className="text-[10px] text-white font-bold">✓</span>
              </div>
            </div>
            <div className="space-y-1">
              {companyName && (
                <div className="flex items-center gap-2 mb-2 py-1.5 px-3 rounded-lg bg-primary/10 border border-primary/20 w-fit">
                  <Building2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-bold text-primary">{companyName}</span>
                </div>
              )}
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-l from-primary via-emerald-400 to-foreground bg-clip-text text-transparent drop-shadow-sm">
                بەڕێوەبردنی داراییی
              </h1>
              <div className="flex items-center gap-2 text-muted-foreground text-sm mt-2">
                <Calendar className="h-4 w-4" />
                <span className="font-medium">{currentMonthLabel}</span>
              </div>
            </div>
          </div>
          
          {/* Actions - Enhanced */}
          <div className="flex items-center gap-4">
            <MonthPicker value={currentMonthKey} onChange={onMonthChange} />
            
            <Button
              variant="ghost"
              onClick={onLogout}
              className="group flex items-center gap-2.5 px-4 py-3 md:px-5 md:py-3.5 h-auto min-h-[48px] rounded-xl bg-gradient-to-br from-destructive/15 to-destructive/5 text-destructive border border-destructive/20 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive hover:scale-105 active:scale-95 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-destructive/30"
            >
              <LogOut className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
              <span className="hidden sm:inline font-semibold text-sm">چوونەدەرەوە</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
