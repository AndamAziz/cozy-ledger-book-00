import { useState, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
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
  /** Called when the user selects a day in a different month/year than monthKey. */
  onMonthChange?: (monthKey: string) => void;
  className?: string;
}

function buildMonthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function DayPicker({ value, onChange, maxDays, monthKey, onMonthChange, className }: DayPickerProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'days' | 'monthYear'>('days');
  const { t, dir } = useLanguage();

  const [selYearStr, selMonthStr] = monthKey.split('-');
  const selYear = parseInt(selYearStr);
  const selMonth = parseInt(selMonthStr);

  // The month/year currently displayed in the calendar (may differ from the
  // selected transaction month while the user navigates).
  const [viewYear, setViewYear] = useState(selYear);
  const [viewMonth, setViewMonth] = useState(selMonth); // 1-12

  // Keep the view in sync with the selected month whenever it changes or the
  // popover is (re)opened.
  useEffect(() => {
    setViewYear(selYear);
    setViewMonth(selMonth);
  }, [selYear, selMonth, open]);

  const daysInViewMonth = new Date(viewYear, viewMonth, 0).getDate();

  // Day of week for the first day of the viewed month (0 = Sunday)
  const firstDayOfMonth = new Date(viewYear, viewMonth - 1, 1).getDay();
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

  const goPrevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleDaySelect = (day: number) => {
    const newMonthKey = buildMonthKey(viewYear, viewMonth);
    if (newMonthKey !== monthKey && onMonthChange) {
      onMonthChange(newMonthKey);
    }
    onChange(day);
    setOpen(false);
  };

  const handleMonthSelect = (monthIndex: number) => {
    setViewMonth(monthIndex + 1);
    setMode('days');
  };

  const displayLabel = formatDate(value, monthKey);

  // Generate calendar grid
  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) calendarDays.push(null);
  for (let day = 1; day <= daysInViewMonth; day++) calendarDays.push(day);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7));
  }
  const lastWeek = weeks[weeks.length - 1];
  while (lastWeek && lastWeek.length < 7) lastWeek.push(null);

  const today = new Date();
  const isTodayMonth = today.getFullYear() === viewYear && today.getMonth() + 1 === viewMonth;
  const currentDay = isTodayMonth ? today.getDate() : null;
  // The selected day is only highlighted when we're viewing the selected month.
  const viewingSelectedMonth = viewYear === selYear && viewMonth === selMonth;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setMode('days'); }}>
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
        className="w-[320px] p-0 rounded-xl border-border/50 bg-card/95 backdrop-blur-xl pointer-events-auto max-h-[80vh] overflow-auto
          data-[state=open]:animate-in data-[state=closed]:animate-out
          data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
          data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-4
          data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95
          duration-200" 
        align="center"
        sideOffset={8}
        collisionPadding={16}
      >
        <div className="p-3">
          {/* Month/Year Header with navigation */}
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/40">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={dir === 'rtl' ? goNextMonth : goPrevMonth}
              className="h-8 w-8 rounded-lg hover:bg-primary/10"
              aria-label="previous month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <button
              type="button"
              onClick={() => setMode((m) => (m === 'days' ? 'monthYear' : 'days'))}
              className="text-base font-bold text-foreground px-3 py-1 rounded-lg hover:bg-primary/10 transition-colors"
            >
              {String(viewMonth).padStart(2, '0')} / {viewYear}
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={dir === 'rtl' ? goPrevMonth : goNextMonth}
              className="h-8 w-8 rounded-lg hover:bg-primary/10"
              aria-label="next month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>

          {mode === 'monthYear' ? (
            <div>
              {/* Year Navigation */}
              <div className="flex items-center justify-between mb-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={dir === 'rtl' ? () => setViewYear((y) => y + 1) : () => setViewYear((y) => y - 1)}
                  className="h-8 w-8 rounded-lg hover:bg-primary/10"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <span className="text-lg font-bold text-foreground">{viewYear}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={dir === 'rtl' ? () => setViewYear((y) => y - 1) : () => setViewYear((y) => y + 1)}
                  className="h-8 w-8 rounded-lg hover:bg-primary/10"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
              {/* Month Grid */}
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 12 }, (_, i) => {
                  const isSelected = viewMonth === i + 1;
                  const isCurrent = today.getFullYear() === viewYear && today.getMonth() === i;
                  return (
                    <Button
                      key={i}
                      type="button"
                      variant="ghost"
                      onClick={() => handleMonthSelect(i)}
                      className={cn(
                        "h-10 text-sm rounded-lg transition-all duration-200",
                        isSelected && "bg-primary text-primary-foreground hover:bg-primary/90",
                        !isSelected && isCurrent && "bg-accent text-accent-foreground",
                        !isSelected && !isCurrent && "hover:bg-primary/10"
                      )}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              {/* Day Names Header */}
              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {dayNames.map((name, index) => (
                  <div 
                    key={index} 
                    className="h-7 flex items-center justify-center text-xs font-medium text-muted-foreground"
                  >
                    {name}
                  </div>
                ))}
              </div>
              
              {/* Calendar Grid */}
              <div className="space-y-0.5">
                {weeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="grid grid-cols-7 gap-0.5">
                    {week.map((day, dayIndex) => {
                      if (day === null) {
                        return <div key={dayIndex} className="h-8" />;
                      }
                      
                      const isSelected = viewingSelectedMonth && day === value;
                      const isToday = day === currentDay;
                      
                      return (
                        <Button
                          key={dayIndex}
                          type="button"
                          variant="ghost"
                          onClick={() => handleDaySelect(day)}
                          className={cn(
                            "h-8 w-full p-0 text-sm font-medium rounded-md transition-all duration-200",
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
              <div className="mt-3 pt-3 border-t border-border/50 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setViewYear(today.getFullYear());
                    setViewMonth(today.getMonth() + 1);
                    handleDaySelect(today.getDate());
                  }}
                  className="flex-1 rounded-md text-xs h-8"
                >
                  {t('today')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleDaySelect(1)}
                  className="flex-1 rounded-md text-xs h-8"
                >
                  {t('firstDay')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleDaySelect(daysInViewMonth)}
                  className="flex-1 rounded-md text-xs h-8"
                >
                  {t('day')} {daysInViewMonth}
                </Button>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
