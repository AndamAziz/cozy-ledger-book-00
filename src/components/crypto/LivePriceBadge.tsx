import { useEffect, useRef, useState } from 'react';

interface LivePriceBadgeProps {
  /** Short asset label, e.g. "XAU", "BTC", "USD/EUR" */
  label: string;
  /** Current live price */
  price: number;
  /** 24h percentage change */
  change: number;
  /** Number of decimals for the price */
  decimals?: number;
  /** Prefix before the price, e.g. "$" (empty for forex) */
  prefix?: string;
  /** Accent color for the label text */
  accentColor?: string;
}

/**
 * Compact live price badge designed to sit next to the Pro/Crown button.
 * - Price/percentage are green when up, red when down.
 * - Subtle fade pulse whenever the price changes.
 * - A small dot reflects the price direction over the last 30 seconds
 *   (green = up, red = down, grey = no change).
 */
export function LivePriceBadge({
  label,
  price,
  change,
  decimals = 2,
  prefix = '$',
  accentColor = '#f0b90b',
}: LivePriceBadgeProps) {
  const [flash, setFlash] = useState(false);
  const [dot, setDot] = useState<'up' | 'down' | 'none'>('none');
  const prevPrice = useRef(price);
  const priceRef = useRef(price);
  const snapshotRef = useRef(price);

  priceRef.current = price;

  // Subtle fade pulse whenever the price changes
  useEffect(() => {
    if (price > 0 && prevPrice.current > 0 && price !== prevPrice.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 400);
      prevPrice.current = price;
      return () => clearTimeout(t);
    }
    prevPrice.current = price;
  }, [price]);

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

  const up = change >= 0;
  const priceColor = up ? '#0ecb81' : '#f6465d';
  const dotColor = dot === 'up' ? '#0ecb81' : dot === 'down' ? '#f6465d' : '#5b6472';

  return (
    <div
      className={`flex items-center gap-1 shrink-0 rounded-lg bg-[#1a1e2e] px-2 py-1 text-[11px] leading-none whitespace-nowrap transition-opacity duration-300 ${
        flash ? 'opacity-50' : 'opacity-100'
      }`}
      title={`${label} ${prefix}${price.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`}
    >
      <span
        className="h-1.5 w-1.5 rounded-full transition-colors duration-300"
        style={{ backgroundColor: dotColor }}
      />
      <span className="font-bold" style={{ color: accentColor }}>{label}</span>
      <span className="font-semibold tabular-nums" style={{ color: priceColor }}>
        {prefix}
        {price.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      </span>
      <span className="font-medium tabular-nums" style={{ color: priceColor }}>
        {up ? '▲' : '▼'}
        {Math.abs(change).toFixed(2)}%
      </span>
    </div>
  );
}
