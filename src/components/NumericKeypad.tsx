import { Delete, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NumericKeypadProps {
  value: string;
  onChange: (value: string) => void;
  onDone?: () => void;
  allowDecimal?: boolean;
  className?: string;
}

export function NumericKeypad({ 
  value, 
  onChange, 
  onDone,
  allowDecimal = true,
  className 
}: NumericKeypadProps) {
  const handleKeyPress = (key: string) => {
    if (key === 'backspace') {
      onChange(value.slice(0, -1));
    } else if (key === '.') {
      // Only allow one decimal point
      if (allowDecimal && !value.includes('.')) {
        onChange(value + '.');
      }
    } else if (key === 'done') {
      onDone?.();
    } else {
      onChange(value + key);
    }
  };

  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    [allowDecimal ? '.' : '', '0', 'backspace'],
  ];

  return (
    <div className={cn("grid grid-cols-3 gap-2 p-3 bg-secondary/30 rounded-xl border border-white/10", className)}>
      {keys.map((row, rowIndex) => (
        row.map((key, keyIndex) => {
          if (key === '') {
            return <div key={`empty-${rowIndex}-${keyIndex}`} className="h-12" />;
          }
          
          const isBackspace = key === 'backspace';
          
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleKeyPress(key)}
              className={cn(
                "h-12 rounded-xl font-bold text-lg transition-all active:scale-95",
                "flex items-center justify-center",
                isBackspace
                  ? "bg-destructive/20 text-destructive hover:bg-destructive/30 active:bg-destructive/40"
                  : "bg-secondary/50 text-foreground hover:bg-secondary/70 active:bg-secondary/90 border border-white/10"
              )}
            >
              {isBackspace ? <Delete className="h-5 w-5" /> : key}
            </button>
          );
        })
      ))}
      
      {/* Done button - full width */}
      {onDone && (
        <button
          type="button"
          onClick={() => handleKeyPress('done')}
          className="col-span-3 h-12 rounded-xl font-bold text-lg bg-primary/20 text-primary hover:bg-primary/30 active:bg-primary/40 transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-1"
        >
          <Check className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
