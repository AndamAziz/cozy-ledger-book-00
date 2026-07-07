import { useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

/**
 * Shared "moved up / down / unchanged since the last refresh" indicator used by
 * every gold-related metric (XAU price, DXY, VIX, S&P 500, US10Y, Fear/Greed and
 * the S/R levels). Keeps the visual language identical across all panels.
 */
export type Dir = 'up' | 'down' | 'flat';

const C_UP = '#0ecb81';
const C_DOWN = '#f6465d';
const C_FLAT = '#848e9c';

export function dirColor(dir: Dir): string {
  return dir === 'up' ? C_UP : dir === 'down' ? C_DOWN : C_FLAT;
}

/**
 * Tracks whether `value` moved up/down/flat versus the previous non-null value
 * it was called with. Purely presentational — it never touches data fetching.
 */
export function useValueDirection(value: number | null | undefined): Dir {
  const prevRef = useRef<number | null>(null);
  const [dir, setDir] = useState<Dir>('flat');
  useEffect(() => {
    if (value == null || !Number.isFinite(value)) return;
    const prev = prevRef.current;
    if (prev != null) {
      if (value > prev) setDir('up');
      else if (value < prev) setDir('down');
      else setDir('flat');
    }
    prevRef.current = value;
  }, [value]);
  return dir;
}

interface DirArrowProps {
  dir: Dir;
  size?: number;
  className?: string;
}

/** Green ▲ (up), red ▼ (down) or gray — (unchanged). */
export function DirArrow({ dir, size = 14, className }: DirArrowProps) {
  const Icon = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : Minus;
  return (
    <Icon
      aria-hidden
      className={className}
      style={{ color: dirColor(dir), width: size, height: size }}
    />
  );
}
