import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { NumericKeypad } from './NumericKeypad';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface NumericInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  allowDecimal?: boolean;
  required?: boolean;
}

export function NumericInput({
  value,
  onChange,
  placeholder = "0.00",
  className,
  allowDecimal = true,
  required = false
}: NumericInputProps) {
  const [showKeypad, setShowKeypad] = useState(false);
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);

  // Close keypad when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowKeypad(false);
      }
    };

    if (showKeypad) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showKeypad]);

  const handleInputClick = () => {
    if (isMobile) {
      setShowKeypad(true);
    }
  };

  const handleDone = () => {
    setShowKeypad(false);
  };

  // Format display value
  const displayValue = value || '';

  return (
    <div ref={containerRef} className="relative">
      {/* Display Input */}
      <Input
        type={isMobile ? "text" : "text"}
        inputMode={isMobile ? "none" : "decimal"}
        placeholder={placeholder}
        value={displayValue}
        onChange={(e) => {
          if (!isMobile) {
            // Allow typing on desktop
            const newValue = e.target.value.replace(/[^0-9.]/g, '');
            // Only allow one decimal point
            const parts = newValue.split('.');
            if (parts.length > 2) {
              onChange(parts[0] + '.' + parts.slice(1).join(''));
            } else {
              onChange(newValue);
            }
          }
        }}
        onClick={handleInputClick}
        onFocus={handleInputClick}
        readOnly={isMobile && showKeypad}
        className={cn(
          "h-12 sm:h-14 text-base sm:text-lg bg-secondary/50 border-white/10 rounded-xl transition-all",
          showKeypad && "ring-2 ring-primary/50 border-primary/50",
          className
        )}
        required={required}
      />

      {/* Custom Keypad for Mobile */}
      {isMobile && showKeypad && (
        <div className="mt-2 animate-in slide-in-from-bottom-2 duration-200">
          <NumericKeypad
            value={value}
            onChange={onChange}
            onDone={handleDone}
            allowDecimal={allowDecimal}
          />
        </div>
      )}
    </div>
  );
}
