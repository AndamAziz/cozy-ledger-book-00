import { forwardRef } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StarRatingProps {
  value: number;
  /** When provided, stars become interactive */
  onChange?: (value: number) => void;
  size?: number;
  className?: string;
  ariaLabel?: string;
}

/**
 * forwardRef so consumers that clone the element with a ref (Radix `asChild`,
 * animation wrappers) do not trigger React's "function components cannot be
 * given refs" warning.
 */
export const StarRating = forwardRef<HTMLDivElement, StarRatingProps>(function StarRating(
  { value, onChange, size = 18, className, ariaLabel },
  ref,
) {
  const interactive = typeof onChange === 'function';

  return (
    <div ref={ref} className={cn('flex items-center gap-0.5', className)} role={interactive ? 'radiogroup' : 'img'} aria-label={ariaLabel}>

      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= Math.round(value);
        const StarEl = (
          <Star
            style={{ width: size, height: size }}
            className={cn(
              'transition-colors',
              filled ? 'fill-gold text-gold' : 'fill-transparent text-muted-foreground/40'
            )}
            strokeWidth={1.8}
          />
        );
        if (!interactive) {
          return <span key={star}>{StarEl}</span>;
        }
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={star === Math.round(value)}
            aria-label={`${star} star${star === 1 ? '' : 's'}`}
            onClick={() => onChange?.(star)}
            className="p-0.5 rounded hover:scale-110 active:scale-95 transition-transform touch-manipulation"
          >
            {StarEl}
          </button>
        );
      })}
    </div>
  );
});

