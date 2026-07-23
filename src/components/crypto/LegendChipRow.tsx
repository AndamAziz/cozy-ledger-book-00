import { useEffect, useRef, useState, useCallback } from 'react';
import { TrendingUp, TrendingDown, Info, Settings, ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  goldPrice: number;
  goldPct: number;
  tickFlash: 'up' | 'down' | null;
  liveGoldDir: 'up' | 'down' | 'impact';
  todayHighCount: number;
  bi: (ku: string, en: string) => string;
  onToggleInfo: () => void;
  onToggleSettings: () => void;
}

export function LegendChipRow({
  goldPrice, goldPct, tickFlash, liveGoldDir, todayHighCount, bi, onToggleInfo, onToggleSettings,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  const updateFades = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setShowLeftFade(scrollLeft > 4);
    setShowRightFade(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  // Always start at the very beginning so the XAU price chip is fully visible.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollLeft = 0;
    updateFades();
    const ro = new ResizeObserver(updateFades);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateFades]);

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(80, el.clientWidth * 0.6), behavior: 'smooth' });
  };

  const chipBase =
    'shrink-0 inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-1 whitespace-nowrap tabular-nums';

  return (
    <div className="relative">
      <div
        ref={scrollerRef}
        onScroll={updateFades}
        className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-nowrap scroll-smooth"
      >
        {/* Live XAU/USD price ticker */}
        <span
          className={`${chipBase} border transition-colors duration-500 motion-reduce:transition-none ${
            tickFlash === 'up'
              ? 'bg-red-500/20 text-red-300 border-red-500/50'
              : tickFlash === 'down'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                : 'bg-[#1a1e2e] text-[#f0b90b] border-[#f0b90b]/30'
          }`}
          aria-label="XAU/USD live price"
        >
          <span className="text-[9px] opacity-70">XAU</span>
          {goldPrice > 0
            ? `$${goldPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : '—'}
          {tickFlash === 'up' && <TrendingUp className="h-3 w-3" />}
          {tickFlash === 'down' && <TrendingDown className="h-3 w-3" />}
        </span>

        <span
          className={`${chipBase} bg-red-500/10 text-red-400 transition-all motion-reduce:transition-none motion-reduce:animate-none ${
            liveGoldDir === 'up'
              ? 'ring-1 ring-red-500/60 animate-pulse shadow-[0_0_10px_rgba(246,70,93,0.35)]'
              : 'opacity-60'
          }`}
        >
          <TrendingUp className="h-3 w-3" />
          {goldPrice > 0 ? `${goldPct >= 0 ? '+' : ''}${goldPct.toFixed(2)}%` : ''}
        </span>
        <span
          className={`${chipBase} bg-emerald-500/10 text-emerald-400 transition-all motion-reduce:transition-none motion-reduce:animate-none ${
            liveGoldDir === 'down'
              ? 'ring-1 ring-emerald-500/60 animate-pulse shadow-[0_0_10px_rgba(14,203,129,0.35)]'
              : 'opacity-60'
          }`}
        >
          <TrendingDown className="h-3 w-3" />
          {goldPrice > 0 ? `${goldPct.toFixed(2)}%` : ''}
        </span>
        <span
          className={`${chipBase} bg-amber-500/10 text-amber-400 transition-all motion-reduce:transition-none motion-reduce:animate-none ${
            liveGoldDir === 'impact'
              ? 'ring-1 ring-amber-500/60 animate-pulse shadow-[0_0_10px_rgba(240,185,11,0.35)]'
              : 'opacity-60'
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          {bi('کاریگەری', 'Impact')} {todayHighCount}
        </span>
        <button
          onClick={onToggleInfo}
          aria-label={bi('زانیاری زیاتر', 'More info')}
          className="shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full text-[#848e9c] hover:text-white hover:bg-[#1a1e2e] transition-colors"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onToggleSettings}
          aria-label={bi('ڕێکخستنی فلاش', 'Flash settings')}
          className="shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full text-[#848e9c] hover:text-white hover:bg-[#1a1e2e] transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Left edge fade + chevron */}
      {showLeftFade && (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-[#0b0e17] to-transparent" />
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            aria-label="Scroll left"
            className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-[#1a1e2e]/90 text-[#c7ccd6] flex items-center justify-center shadow border border-white/10"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
        </>
      )}
      {/* Right edge fade + chevron */}
      {showRightFade && (
        <>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-[#0b0e17] to-transparent" />
          <button
            type="button"
            onClick={() => scrollBy(1)}
            aria-label="Scroll right"
            className="absolute right-0 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-[#1a1e2e]/90 text-[#c7ccd6] flex items-center justify-center shadow border border-white/10"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </>
      )}
    </div>
  );
}
