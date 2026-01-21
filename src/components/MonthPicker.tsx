import { useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

interface MonthPickerProps {
  value: string; // Format: 'YYYY-MM'
  onChange: (value: string) => void;
  className?: string;
}

export function MonthPicker({ value, onChange, className }: MonthPickerProps) {
  const [open, setOpen] = useState(false);
  const { t, dir } = useLanguage();
  
  // Parse current value
  const [yearStr, monthStr] = value.split('-');
  const currentYear = parseInt(yearStr) || new Date().getFullYear();
  const currentMonth = parseInt(monthStr) - 1 || 0; // 0-indexed
  
  const [viewYear, setViewYear] = useState(currentYear);
  
  const handleMonthSelect = (monthIndex: number) => {
    const newValue = `${viewYear}-${String(monthIndex + 1).padStart(2, '0')}`;
    onChange(newValue);
    setOpen(false);
  };
  
  const handlePrevYear = () => {
    setViewYear(prev => prev - 1);
  };
  
  const handleNextYear = () => {
    setViewYear(prev => prev + 1);
  };
  
  const displayLabel = `${String(currentMonth + 1).padStart(2, '0')} / ${currentYear}`;
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-[110px] sm:w-[150px] md:w-[180px] bg-secondary/50 border-border/50 rounded-lg sm:rounded-xl hover:bg-secondary/80 transition-colors justify-start text-right font-normal h-8 sm:h-9 px-2 sm:px-3 touch-manipulation",
            className
          )}
        >
          <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 ml-1.5 sm:ml-2 text-primary flex-shrink-0" />
          <span className="text-xs sm:text-sm truncate">{displayLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[280px] p-0 rounded-xl border-border/50 bg-card/95 backdrop-blur-xl pointer-events-auto" 
        align="start"
      >
        <div className="p-4">
          {/* Year Navigation */}
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={dir === 'rtl' ? handleNextYear : handlePrevYear}
              className="h-8 w-8 rounded-lg hover:bg-primary/10"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-lg font-bold text-foreground">{viewYear}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={dir === 'rtl' ? handlePrevYear : handleNextYear}
              className="h-8 w-8 rounded-lg hover:bg-primary/10"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Month Grid */}
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 12 }, (_, i) => {
              const isSelected = viewYear === currentYear && i === currentMonth;
              const isCurrentMonth = viewYear === new Date().getFullYear() && i === new Date().getMonth();
              
              return (
                <Button
                  key={i}
                  variant="ghost"
                  onClick={() => handleMonthSelect(i)}
                  className={cn(
                    "h-10 text-sm rounded-lg transition-all duration-200",
                    isSelected && "bg-primary text-primary-foreground hover:bg-primary/90",
                    !isSelected && isCurrentMonth && "bg-accent text-accent-foreground",
                    !isSelected && !isCurrentMonth && "hover:bg-primary/10"
                  )}
                >
                  {String(i + 1).padStart(2, '0')}
                </Button>
              );
            })}
          </div>
          
          {/* Quick Actions */}
          <div className="mt-4 pt-4 border-t border-border/50 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const now = new Date();
                setViewYear(now.getFullYear());
                handleMonthSelect(now.getMonth());
              }}
              className="flex-1 rounded-lg text-xs"
            >
              {t('thisMonth')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const now = new Date();
                const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
                const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
                setViewYear(prevYear);
                handleMonthSelect(prevMonth);
              }}
              className="flex-1 rounded-lg text-xs"
            >
              {t('previousMonth')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
