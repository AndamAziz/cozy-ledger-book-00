import { useState } from 'react';
import { Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatDate } from '@/lib/format';

interface DayPickerProps {
  value: number;
  onChange: (day: number) => void;
  maxDays: number;
  monthKey: string; // Format: 'YYYY-MM'
  className?: string;
}

export function DayPicker({ value, onChange, maxDays, monthKey, className }: DayPickerProps) {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();
  
  const [yearStr, monthStr] = monthKey.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  
  // Get day of week for the first day of the month (0 = Sunday, 1 = Monday, etc.)
  const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
  // Adjust for calendar (Saturday = first day)
  const startOffset = (firstDayOfMonth + 1) % 7;
  
  const dayNames = [
    t('satAbbr'),
    t('sunAbbr'),
    t('monAbbr'),
    t('tueAbbr'),
    t('wedAbbr'),
    t('thuAbbr'),
    t('friAbbr'),
  ];
  
  const handleDaySelect = (day: number) => {
    onChange(day);
    setOpen(false);
  };
  
  const displayLabel = formatDate(value, monthKey);
  
  // Generate calendar grid
  const calendarDays = [];
  
  // Empty cells for offset
  for (let i = 0; i < startOffset; i++) {
    calendarDays.push(null);
  }
  
  // Days of the month
  for (let day = 1; day <= maxDays; day++) {
    calendarDays.push(day);
  }
  
  // Calculate weeks
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }
  
  // Pad last week if needed
  const lastWeek = weeks[weeks.length - 1];
  while (lastWeek.length < 7) {
    lastWeek.push(null);
  }
  
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const currentDay = isCurrentMonth ? today.getDate() : null;
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full h-14 text-lg bg-secondary/50 border-white/10 rounded-xl hover:bg-secondary/80 transition-colors justify-start text-right font-normal",
            className
          )}
        >
          <Calendar className="h-5 w-5 ml-3 text-primary" />
          <span className="font-semibold font-mono">{displayLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[320px] p-0 rounded-xl border-border/50 bg-card/95 backdrop-blur-xl pointer-events-auto" 
        align="start"
      >
        <div className="p-4">
          {/* Month Header */}
          <div className="flex items-center justify-center mb-4 pb-3 border-b border-border/40">
            <span className="text-lg font-bold text-foreground">
              {month} / {year}
            </span>
          </div>
          
          {/* Day Names Header */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {dayNames.map((name, index) => (
              <div 
                key={index} 
                className="h-8 flex items-center justify-center text-xs font-medium text-muted-foreground"
              >
                {name}
              </div>
            ))}
          </div>
          
          {/* Calendar Grid */}
          <div className="space-y-1">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-cols-7 gap-1">
                {week.map((day, dayIndex) => {
                  if (day === null) {
                    return <div key={dayIndex} className="h-10" />;
                  }
                  
                  const isSelected = day === value;
                  const isToday = day === currentDay;
                  
                  return (
                    <Button
                      key={dayIndex}
                      type="button"
                      variant="ghost"
                      onClick={() => handleDaySelect(day)}
                      className={cn(
                        "h-10 w-full p-0 font-medium rounded-lg transition-all duration-200",
                        isSelected && "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md",
                        !isSelected && isToday && "bg-accent text-accent-foreground",
                        !isSelected && !isToday && "hover:bg-primary/10"
                      )}
                    >
                      {day}
                    </Button>
                  );
                })}
              </div>
            ))}
          </div>
          
          {/* Quick Actions */}
          <div className="mt-4 pt-4 border-t border-border/50 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleDaySelect(currentDay || 1)}
              disabled={!isCurrentMonth}
              className="flex-1 rounded-lg text-xs"
            >
              {t('today')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleDaySelect(1)}
              className="flex-1 rounded-lg text-xs"
            >
              {t('firstDay')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleDaySelect(maxDays)}
              className="flex-1 rounded-lg text-xs"
            >
              {t('day')} {maxDays}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
