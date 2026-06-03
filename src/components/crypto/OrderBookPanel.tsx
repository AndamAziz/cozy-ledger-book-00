import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface OrderBookPanelProps {
  /** Display label, e.g. "BTC/USD". */
  symbol: string;
  /** Live mid price the ladder is centred on. */
  currentPrice: number;
  /** Hide the ladder. */
  onClose: () => void;
}

/** Number of price levels rendered on each side of the spread. */
const LEVELS = 7;

/**
 * MT5-style Depth of Market (DOM) / order-book ladder.
 *
 * These spot price feeds do not expose a real L2 order book, so the ladder is
 * a SIMULATED depth view centred on the live mid price: ask levels stacked
 * above and bid levels below, each with a volume and a depth bar. Volumes
 * re-roll on a short interval so it feels alive, exactly like the DOM panel in
 * desktop trading terminals.
 */
export function OrderBookPanel({ symbol, currentPrice, onClose }: OrderBookPanelProps) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' ? en : ku);

  // Re-roll the simulated volumes periodically for a live ladder feel.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1100);
    return () => window.clearInterval(id);
  }, []);

  // A "nice" price step derived from the current price (~4 bps, rounded).
  const step = useMemo(() => {
    if (currentPrice <= 0) return 1;
    const raw = currentPrice * 0.0004;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    return Math.max(mag, Math.round(raw / mag) * mag);
  }, [currentPrice]);

  const fmtPrice = (n: number) =>
    n.toLocaleString(undefined, {
      minimumFractionDigits: currentPrice < 1 ? 4 : 2,
      maximumFractionDigits: currentPrice < 1 ? 6 : 2,
    });

  const { asks, bids, maxVol } = useMemo(() => {
    const asks: { price: number; vol: number }[] = [];
    const bids: { price: number; vol: number }[] = [];
    let maxVol = 0;
    for (let i = 1; i <= LEVELS; i++) {
      const base = 0.2 + (LEVELS - i) * 0.06;
      const av = +(Math.random() * 2 + base).toFixed(3);
      const bv = +(Math.random() * 2 + base).toFixed(3);
      asks.push({ price: currentPrice + step * i, vol: av });
      bids.push({ price: currentPrice - step * i, vol: bv });
      maxVol = Math.max(maxVol, av, bv);
    }
    asks.reverse(); // highest ask at the top, nearest the spread at the bottom
    return { asks, bids, maxVol: maxVol || 1 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, currentPrice, step]);

  const Row = ({ price, vol, side }: { price: number; vol: number; side: 'ask' | 'bid' }) => {
    const isAsk = side === 'ask';
    const color = isAsk ? '#f6465d' : '#0ecb81';
    const w = Math.max(4, Math.round((vol / maxVol) * 100));
    return (
      <div className="relative flex items-center justify-between px-2 py-[3px] text-[10px] tabular-nums">
        <span
          className="absolute inset-y-0 end-0"
          style={{ width: `${w}%`, background: `${color}22` }}
        />
        <span className="relative font-bold" style={{ color }}>{fmtPrice(price)}</span>
        <span className="relative text-[#848e9c]">{vol.toFixed(2)}</span>
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-white/10 bg-[#0a0e17]/95 backdrop-blur-md shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-white/10 bg-[#0d1117]">
        <span className="text-[10px] font-bold text-[#f0b90b] truncate">{bi('قووڵایی بازاڕ', 'Depth of Market')}</span>
        <button
          onClick={onClose}
          aria-label={bi('داخستن', 'Close')}
          className="p-0.5 rounded text-[#848e9c] hover:text-white hover:bg-white/10 active:scale-95 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Column headers */}
      <div className="flex items-center justify-between px-2 py-1 text-[9px] font-bold text-[#848e9c] uppercase tracking-wide border-b border-white/5">
        <span>{bi('نرخ', 'Price')}</span>
        <span>{bi('بڕ', 'Size')}</span>
      </div>

      {asks.map((a, i) => <Row key={`a${i}`} price={a.price} vol={a.vol} side="ask" />)}

      {/* Mid / last price */}
      <div className="flex items-center justify-center gap-1 px-2 py-1 my-0.5 bg-[#1a1e2e] text-[11px] font-extrabold text-white tabular-nums border-y border-white/10">
        {fmtPrice(currentPrice)}
        <span className="text-[8px] font-bold text-[#848e9c]">{symbol}</span>
      </div>

      {bids.map((b, i) => <Row key={`b${i}`} price={b.price} vol={b.vol} side="bid" />)}
    </div>
  );
}
