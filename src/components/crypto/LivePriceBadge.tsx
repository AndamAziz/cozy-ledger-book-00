import { useEffect, useRef, useState } from 'react';

interface LivePriceBadgeProps {
  /** Short asset label, e.g. "XAU", "BTC", "USD/EUR" */
  label: string;
  /** Current live price */
  price: number;
  /** 24h percentage change (used only for the dot fallback color) */
  change?: number;
  /** Number of decimals for the price */
  decimals?: number;
  /** Prefix before the price, e.g. "$" (empty for forex) */
  prefix?: string;
  /** Accent color for the label text */
  accentColor?: string;
}

/**
 * Tiny live price badge that floats over the TOP-LEFT corner of the chart.
 * - position: absolute, so it overlays the chart without affecting layout.
 * - Very small (10px), max ~20px tall, semi-transparent dark background.
 * - Shows only: dot + symbol + price (no percentage).
 * - The dot reflects the price direction over the last 30 seconds
 *   (green = up, red = down, grey = no change).
 */
export function LivePriceBadge({
  label,
  price,
  decimals = 2,
  prefix = '$',
  accentColor = '#f0b90b',
}: LivePriceBadgeProps) {
  const [dot, setDot] = useState<'up' | 'down' | 'none'>('none');
  const priceRef = useRef(price);
  const snapshotRef = useRef(price);

  priceRef.current = price;

  // 30-second direction dot (independent of render-cycle props via refs)
  useEffect(() => {
    const id = window.setInterval(() => {
      const cur = priceRef.current;
      const snap = snapshotRef.current;
      if (cur > 0 && snap > 0) {
        if (cur > snap) setDot('up');
        else if (cur < snap) setDot('down');
        else setDot('none');
      }
      snapshotRef.current = cur;
    }, 30000);
    return () => window.clearInterval(id);
  }, []);

  if (!price || price <= 0) return null;

  const dotColor = dot === 'up' ? '#0ecb81' : dot === 'down' ? '#f6465d' : '#5b6472';
  const priceText = price.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  return (
    <div
      className="pointer-events-none absolute left-2 top-2 z-20 flex h-5 items-center gap-1 rounded-md bg-black/70 px-1.5 text-[10px] leading-none whitespace-nowrap backdrop-blur-sm opacity-85"
      title={`${label} ${prefix}${priceText}`}
    >
      <span
        className="h-1 w-1 rounded-full transition-colors duration-300"
        style={{ backgroundColor: dotColor }}
      />
      <span className="font-bold" style={{ color: accentColor }}>{label}</span>
      <span className="font-semibold tabular-nums text-white">
        {prefix}{priceText}
      </span>
    </div>
  );
}
