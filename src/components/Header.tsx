import { MONTH_OPTIONS } from '@/types/finance';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

interface HeaderProps {
  currentMonthKey: string;
  currentMonthLabel: string;
  onMonthChange: (month: string) => void;
  onLogout: () => void;
}

export function Header({ currentMonthKey, currentMonthLabel, onMonthChange, onLogout }: HeaderProps) {
  return (
    <header className="glass-card p-4 mb-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="text-center flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-foreground mb-1">بەڕێوەبردنی داراییی</h1>
          <p className="text-primary text-sm md:text-base">{currentMonthLabel}</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={currentMonthKey} onValueChange={onMonthChange}>
            <SelectTrigger className="w-[140px] md:w-[180px] bg-secondary/50 border-border">
              <SelectValue placeholder="مانگ هەڵبژێرە" />
            </SelectTrigger>
            <SelectContent>
              {MONTH_OPTIONS.map((month) => (
                <SelectItem key={month.key} value={month.key}>
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={onLogout}
            className="text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
