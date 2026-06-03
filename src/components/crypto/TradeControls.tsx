import { RefreshCw, X, Target, ShieldAlert } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export type TradeSide = 'buy' | 'sell' | null;

export interface TradePct {
  hasData: boolean;
  buyPct: number;
  sellPct: number;
}

export const TRADE_AMOUNTS = [0.001, 0.05, 0.1];

interface TradeControlsProps {
  activeSide: TradeSide;
  amount: number;
  pct: TradePct | null;
  /** Average entry price of the open position. */
  entryPrice: number | null;
  /** Total accumulated quantity of the open position. */
  positionQty: number;
  /** Live moving price used to compute profit / loss. */
  currentPrice: number;
  /** Take-profit price of the open position (or null). */
  takeProfit: number | null;
  /** Stop-loss price of the open position (or null). */
  stopLoss: number | null;
  /** Label of an OPEN position that belongs to a DIFFERENT asset (or null). */
  otherPositionLabel: string | null;
  /** Label of the selected chart timeframe (e.g. 1m / 5m / 15m). */
  timeframeLabel?: string;
  /** Virtual demo account balance ($). */
  balance: number;
  /** Reset the demo balance back to the starting amount. */
  onRenew: () => void;
  onBuy: () => void;
  onSell: () => void;
  /** Close the whole open position and realise its profit / loss. */
  onClose: () => void;
  onRefresh: () => void;
  onAmountChange: (amount: number) => void;
  /** Set / clear the take-profit and stop-loss levels. */
  onSetTpSl: (takeProfit: number | null, stopLoss: number | null) => void;
}

const fmtMoney = (n: number) => {
  const abs = Math.abs(n);
  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: digits });
};

const fmtQty = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 });

// Symmetric TP/SL preset based on a percentage of the entry price.
const presetTpSl = (side: 'buy' | 'sell', entry: number, pct: number): [number, number] => {
  const delta = entry * (pct / 100);
  const tp = side === 'buy' ? entry + delta : entry - delta;
  const sl = side === 'buy' ? entry - delta : entry + delta;
  return [+tp.toFixed(6), +sl.toFixed(6)];
};

/**
 * Buy / Refresh / Sell control strip rendered directly above a chart.
 *  - Buy / Sell open or ADD to a position on that side (stacking, averaged).
 *  - A dedicated Close button realises the whole position's P/L.
 *  - A Take-Profit / Stop-Loss panel lets the user arm automatic exits.
 *  - The position survives navigation: it only closes manually or via TP/SL.
 */
export function TradeControls({
  activeSide,
  amount,
  pct,
  entryPrice,
  positionQty,
  currentPrice,
  takeProfit,
  stopLoss,
  otherPositionLabel,
  timeframeLabel,
  balance,
  onRenew,
  onBuy,
  onSell,
  onClose,
  onRefresh,
  onAmountChange,
  onSetTpSl,
}: TradeControlsProps) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' ? en : ku);

  const depleted = balance <= 0;
  const hasPosition = !!activeSide && positionQty > 0;

  // Profit / loss vs the average entry price, in the chosen timeframe.
  let pnl: { value: number; pct: number; positive: boolean } | null = null;
  if (hasPosition && entryPrice && entryPrice > 0 && currentPrice > 0) {
    const diff = activeSide === 'buy' ? currentPrice - entryPrice : entryPrice - currentPrice;
    pnl = { value: diff * positionQty, pct: (diff / entryPrice) * 100, positive: diff >= 0 };
  }

  const parseNum = (v: string): number | null => {
    if (v.trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  return (
    <div className="border-b border-white/5 bg-[#090c11] px-3 py-2.5">
      {/* Demo account balance + live profit/loss */}
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="text-[10px] sm:text-xs">
          <span className="text-[#848e9c]">{bi('باڵانسی دیمۆ', 'Demo Balance')}: </span>
          <span className={`font-bold tabular-nums ${depleted ? 'text-[#f6465d]' : 'text-white'}`}>${fmtMoney(balance)}</span>
          {pnl && (
            <span className={`ms-2 font-bold tabular-nums ${pnl.positive ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
              ({pnl.positive ? '+' : '−'}${fmtMoney(Math.abs(pnl.value))})
            </span>
          )}
        </div>
        {depleted && (
          <button
            onClick={onRenew}
            className="px-2.5 py-1 text-[10px] sm:text-xs font-bold rounded-md bg-[#f0b90b] text-black hover:bg-[#f0b90b]/90 active:scale-95 transition-colors"
          >
            {bi('نوێکردنەوەی $200', 'Renew $200')}
          </button>
        )}
      </div>

      {/* Banner: an open position lives on a different asset */}
      {otherPositionLabel && (
        <div className="mb-2 flex items-center gap-2 rounded-md bg-[#f0b90b]/10 border border-[#f0b90b]/30 px-2.5 py-1.5 text-[10px] sm:text-xs text-[#f0b90b]">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          <span>
            {bi('پۆزیشنێکی کراوەت هەیە لەسەر', 'You have an open position on')}{' '}
            <span className="font-bold">{otherPositionLabel}</span>{' '}
            {bi('— سەرەتا دایبخە', '— close it first')}
          </span>
        </div>
      )}

      {/* Position summary — avg entry + total qty */}
      {hasPosition && entryPrice && (
        <div className="mb-2 flex items-center justify-between rounded-md bg-[#0d1117] border border-white/5 px-2.5 py-1.5">
          <div className="flex items-center gap-2 text-[10px] sm:text-xs">
            <span className={`font-bold ${activeSide === 'buy' ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
              {activeSide === 'buy' ? bi('کڕین', 'Buy') : bi('فرۆشتن', 'Sell')}
            </span>
            <span className="text-[#848e9c]">·</span>
            <span className="text-[#848e9c]">{bi('ناوەندی', 'Avg')}</span>
            <span className="text-white font-bold tabular-nums">{fmtMoney(entryPrice)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] sm:text-xs">
            <span className="text-[#848e9c]">{bi('بڕ', 'Size')}</span>
            <span className="text-white font-bold tabular-nums">{fmtQty(positionQty)}</span>
          </div>
        </div>
      )}

      {/* Buttons row: Buy | Refresh (centre) | Sell — Buy/Sell stack on each press */}
      <div className="flex items-stretch gap-2">
        <button
          onClick={onBuy}
          disabled={depleted || activeSide === 'sell' || !!otherPositionLabel}
          className={`flex-1 py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors active:scale-95 border disabled:opacity-40 disabled:pointer-events-none ${
            activeSide === 'buy'
              ? 'bg-[#0ecb81] text-black border-white ring-2 ring-white/70 shadow-lg'
              : 'bg-[#0ecb81]/10 text-[#0ecb81] border-[#0ecb81]/40 hover:bg-[#0ecb81]/20'
          }`}
        >
          {bi('کڕین', 'Buy')}{activeSide === 'buy' ? ' +' : ''}
        </button>


        <div className="flex flex-col items-center justify-start gap-1.5 shrink-0">
          <button
            onClick={onRefresh}
            aria-label={bi('نوێکردنەوە', 'Refresh')}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-[#1a1e2e] text-[#f0b90b] border border-white/10 hover:bg-[#252a3a] active:scale-95 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          {/* Amount alternatives under the refresh button */}
          <div className="flex items-center gap-1">
            {TRADE_AMOUNTS.map((a) => (
              <button
                key={a}
                onClick={() => onAmountChange(a)}
                className={`px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold rounded border transition-colors tabular-nums ${
                  amount === a
                    ? 'bg-[#f0b90b] text-black border-[#f0b90b]'
                    : 'text-[#848e9c] border-white/10 hover:text-white'
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onSell}
          disabled={depleted || activeSide === 'buy' || !!otherPositionLabel}
          className={`flex-1 py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors active:scale-95 border disabled:opacity-40 disabled:pointer-events-none ${
            activeSide === 'sell'
              ? 'bg-[#f6465d] text-white border-white ring-2 ring-white/70 shadow-lg'
              : 'bg-[#f6465d]/10 text-[#f6465d] border-[#f6465d]/40 hover:bg-[#f6465d]/20'
          }`}
        >
          {bi('فرۆشتن', 'Sell')}{activeSide === 'sell' ? ' +' : ''}
        </button>
      </div>

      {/* Take-Profit / Stop-Loss panel — only while a position is open */}
      {hasPosition && entryPrice && (
        <div className="mt-2 rounded-lg bg-[#0d1117] border border-white/5 px-2.5 py-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-[#848e9c]">{bi('داخستنی خۆکار', 'Auto Exit')} · TP / SL</span>
            {(takeProfit != null || stopLoss != null) && (
              <button
                onClick={() => onSetTpSl(null, null)}
                className="text-[9px] sm:text-[10px] font-bold text-[#848e9c] hover:text-white transition-colors"
              >
                {bi('سڕینەوە', 'Clear')}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-1.5 rounded-md bg-[#090c11] border border-[#0ecb81]/30 px-2 py-1.5">
              <Target className="h-3.5 w-3.5 text-[#0ecb81] shrink-0" />
              <input
                type="number"
                inputMode="decimal"
                value={takeProfit ?? ''}
                onChange={(e) => onSetTpSl(parseNum(e.target.value), stopLoss)}
                placeholder={bi('قازانج', 'Take Profit')}
                className="w-full bg-transparent text-[11px] sm:text-xs font-bold text-[#0ecb81] placeholder:text-[#0ecb81]/40 outline-none tabular-nums"
              />
            </label>
            <label className="flex items-center gap-1.5 rounded-md bg-[#090c11] border border-[#f6465d]/30 px-2 py-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-[#f6465d] shrink-0" />
              <input
                type="number"
                inputMode="decimal"
                value={stopLoss ?? ''}
                onChange={(e) => onSetTpSl(takeProfit, parseNum(e.target.value))}
                placeholder={bi('زیان', 'Stop Loss')}
                className="w-full bg-transparent text-[11px] sm:text-xs font-bold text-[#f6465d] placeholder:text-[#f6465d]/40 outline-none tabular-nums"
              />
            </label>
          </div>

          {/* Quick symmetric presets relative to the entry price */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] sm:text-[10px] text-[#848e9c]">{bi('خێرا', 'Quick')}</span>
            {[0.5, 1, 2].map((p) => {
              const [tp, sl] = presetTpSl(activeSide as 'buy' | 'sell', entryPrice, p);
              return (
                <button
                  key={p}
                  onClick={() => onSetTpSl(tp, sl)}
                  className="px-2 py-0.5 text-[9px] sm:text-[10px] font-bold rounded border border-white/10 text-[#848e9c] hover:text-white hover:bg-white/5 active:scale-95 transition-colors tabular-nums"
                >
                  ±{p}%
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Dedicated Close button — only while a position is open */}
      {hasPosition && (
        <button
          onClick={onClose}
          className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs sm:text-sm font-bold bg-[#f0b90b] text-black border border-[#f0b90b] hover:bg-[#f0b90b]/90 active:scale-95 transition-colors"
        >
          <X className="h-4 w-4" />
          {activeSide === 'buy'
            ? bi('داخستنی کڕین', 'Close Buy')
            : bi('داخستنی فرۆشتن', 'Close Sell')}
          <span className="tabular-nums opacity-80">· {fmtQty(positionQty)}</span>
        </button>
      )}


      {/* Live profit / loss vs entry — shown while a position is open */}
      {pnl && entryPrice && (
        <div className="mt-2 rounded-lg bg-[#0d1117] border border-white/5 px-2.5 py-2">
          <div className="flex items-center justify-between text-[10px] sm:text-xs">
            <span className="text-[#848e9c]">
              {activeSide === 'buy' ? bi('کڕین', 'Buy') : bi('فرۆشتن', 'Sell')}
              {timeframeLabel ? ` · ${timeframeLabel}` : ''}
            </span>
            <span className="text-[#848e9c]">
              {bi('ناوەند', 'Avg')}: <span className="text-white tabular-nums">{fmtMoney(entryPrice)}</span>
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className={`text-sm sm:text-base font-bold tabular-nums ${pnl.positive ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
              {pnl.positive ? '+' : '−'}{fmtMoney(Math.abs(pnl.value))}
            </span>
            <span className={`text-[11px] sm:text-xs font-bold tabular-nums ${pnl.positive ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
              {pnl.positive ? '+' : '−'}{Math.abs(pnl.pct).toFixed(2)}%
            </span>
          </div>
          <p className="mt-0.5 text-[9px] sm:text-[10px] text-[#848e9c]">
            {pnl.positive ? bi('قازانج', 'Profit') : bi('زیان', 'Loss')} · {bi('بڕ', 'Qty')} {fmtQty(positionQty)}
          </p>
        </div>
      )}


      {/* Buy/Sell percentages — shown after pressing refresh */}
      {pct && (
        pct.hasData ? (
          <div className="mt-2">
            <div className="flex items-center justify-between text-[10px] sm:text-xs font-bold mb-1">
              <span className="text-[#0ecb81]">{bi('کڕین', 'Buy')} {pct.buyPct}%</span>
              <span className="text-[#f6465d]">{pct.sellPct}% {bi('فرۆشتن', 'Sell')}</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-[#1a1e2e]">
              <div className="bg-[#0ecb81]" style={{ width: `${pct.buyPct}%` }} />
              <div className="bg-[#f6465d]" style={{ width: `${pct.sellPct}%` }} />
            </div>
          </div>
        ) : (
          <p className="mt-2 text-center text-[10px] sm:text-xs text-[#848e9c]">
            {bi('داتای پێویست نییە بۆ شیکاری', 'Not enough data to analyse yet')}
          </p>
        )
      )}
    </div>
  );
}
