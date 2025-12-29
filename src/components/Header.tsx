import { MONTH_OPTIONS } from '@/types/finance';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { LogOut, Calendar, Wallet, ChevronDown } from 'lucide-react';

interface HeaderProps {
  currentMonthKey: string;
  currentMonthLabel: string;
  onMonthChange: (month: string) => void;
  onLogout: () => void;
}

export function Header({ currentMonthKey, currentMonthLabel, onMonthChange, onLogout }: HeaderProps) {
  return (
    <header className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card/80 to-transparent backdrop-blur-xl p-5 md:p-6 mb-8 animate-fade-in">
      {/* Background decorations */}
      <div className="absolute -top-20 -left-20 w-48 h-48 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -bottom-16 -right-16 w-40 h-40 rounded-full bg-success/10 blur-3xl" />
      
      <div className="relative flex items-center justify-between gap-4 flex-wrap">
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
          <Select value={currentMonthKey} onValueChange={onMonthChange}>
            <SelectTrigger className="w-[150px] md:w-[180px] bg-secondary/50 border-border/50 rounded-xl hover:bg-secondary/80 transition-colors">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <SelectValue placeholder="مانگ هەڵبژێرە" />
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border/50 bg-card/95 backdrop-blur-xl">
              {MONTH_OPTIONS.map((month) => (
                <SelectItem 
                  key={month.key} 
                  value={month.key}
                  className="rounded-lg focus:bg-primary/10 focus:text-foreground"
                >
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={onLogout}
            className="w-11 h-11 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 hover:scale-105 transition-all duration-300"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
