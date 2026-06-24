import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import type { AssetClass } from '@/lib/botAssets';
import {
  getMarketStatus,
  getMarketSchedule,
  countdownDigits,
} from '@/lib/marketHours';

interface MarketStatusBadgeProps {
  /** Which market this badge represents: 'metal' | 'forex' | 'crypto'. */
  assetClass: AssetClass;
  /** Compact pill (chart headers) vs. full card with the weekly schedule. */
  variant?: 'pill' | 'card';
  className?: string;
}

/**
 * Live open / closed indicator for one of the three markets:
 *   • Metals (Gold/Silver) and Forex follow the FX week: Sun 22:00 → Fri 22:00 UTC.
 *   • Crypto is 24/7.
 * When a market is closed it shows a 1-second digital countdown to the exact
 * reopen instant. The clock and weekly-hours summary are identical to the trade
 * blocking logic so users always know when (and why) trading is paused.
 */
export function MarketStatusBadge({
  assetClass,
  variant = 'pill',
  className = '',
}: MarketStatusBadgeProps) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string, tr?: string) =>
    language === 'tr' ? (tr ?? en) : language === 'en' ? en : ku;

  // Tick every second so both the open/closed state and the countdown stay live.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const status = getMarketStatus(assetClass, now);
  const schedule = getMarketSchedule(assetClass);
  const countdown = status.open ? '' : countdownDigits(status.nextChange, now);

  const dot = status.open ? '#0ecb81' : '#f6465d';
  const stateLabel = schedule.alwaysOpen
    ? bi('کراوەیە ٢٤/٧', 'Open 24/7', 'Açık 24/7')
    : status.open
      ? bi('بازاڕ کراوەیە', 'Market open', 'Piyasa açık')
      : bi('بازاڕ داخراوە', 'Market closed', 'Piyasa kapalı');

  if (variant === 'pill') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums ${className}`}
        style={{
          color: dot,
          borderColor: `${dot}55`,
          backgroundColor: `${dot}14`,
        }}
        title={
          schedule.alwaysOpen
            ? bi('کریپتۆ هەمیشە کراوەیە', 'Crypto trades 24/7', 'Kripto 7/24 açık')
            : `${bi('دەکرێتەوە', 'Opens', 'Açılış')} ${schedule.opensLabel} · ${bi('دادەخرێت', 'Closes', 'Kapanış')} ${schedule.closesLabel} · ${schedule.weeklyHours}${bi('کاتژمێر/هەفتە', 'h/week', 'sa/hafta')}`
        }
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />
        {status.open ? stateLabel : countdown ? `${bi('دەکرێتەوە', 'Opens', 'Açılış')} ${countdown}` : stateLabel}
      </span>
    );
  }

  return (
    <div
      className={`rounded-lg border px-3 py-2 ${className}`}
      style={{ borderColor: `${dot}33`, backgroundColor: `${dot}10` }}
    >
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dot }} />
        <span className="text-xs font-bold" style={{ color: dot }}>
          {stateLabel}
        </span>
        {!status.open && countdown && (
          <span className="ml-auto flex items-center gap-1 text-xs font-bold tabular-nums" style={{ color: dot }}>
            <Clock className="h-3.5 w-3.5" />
            {countdown}
          </span>
        )}
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-[#848e9c]">
        {schedule.alwaysOpen ? (
          <>
            {bi('کریپتۆ بێ وەستان مامەڵەی پێدەکرێت', 'Crypto trades non-stop', 'Kripto kesintisiz işlem görür')} ·{' '}
            {schedule.weeklyHours}
            {bi(' کاتژمێر/هەفتە', 'h/week', ' sa/hafta')}
          </>
        ) : (
          <>
            {bi('دەکرێتەوە', 'Opens', 'Açılış')} <span className="text-white/80">{schedule.opensLabel}</span> ·{' '}
            {bi('دادەخرێت', 'Closes', 'Kapanış')} <span className="text-white/80">{schedule.closesLabel}</span> ·{' '}
            {schedule.weeklyHours}
            {bi(' کاتژمێر/هەفتە', 'h/week', ' sa/hafta')}
          </>
        )}
      </p>
    </div>
  );
}
