import { RefreshCw } from 'lucide-react';
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
  /** Price captured when Buy/Sell was pressed (the entry). */
  entryPrice: number | null;
  /** Live moving price used to compute profit / loss. */
  currentPrice: number;
  /** Label of the selected chart timeframe (e.g. 1m / 5m / 15m). */
  timeframeLabel?: string;
  /** Virtual demo account balance (£). */
  balance: number;
  /** Reset the demo balance back to the starting amount. */
  onRenew: () => void;
  onBuy: () => void;
  onSell: () => void;
  onRefresh: () => void;
  onAmountChange: (amount: number) => void;
}

const fmtMoney = (n: number) => {
  const abs = Math.abs(n);
  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: digits });
};

/**
 * Buy / Refresh / Sell control strip rendered directly above a chart.
 * Identical behaviour for Crypto and Metals:
 *  - Buy / Sell draw a coloured line on the chart at the current price.
 *  - Refresh recomputes the analysed Buy/Sell percentages shown below the buttons.
 *  - Amount chips (0.001 / 0.05 / 0.1) sit under the centre refresh button.
 *  - While a side is active, live profit / loss vs the entry is shown.
 */
export function TradeControls({
  activeSide,
  amount,
  pct,
  entryPrice,
  currentPrice,
  timeframeLabel,
  balance,
  onRenew,
  onBuy,
  onSell,
  onRefresh,
  onAmountChange,
}: TradeControlsProps) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' ? en : ku);

  const depleted = balance <= 0;



  // Profit / loss vs the entry price, in the chosen timeframe.
  let pnl: { value: number; pct: number; positive: boolean } | null = null;
  if (activeSide && entryPrice && entryPrice > 0 && currentPrice > 0) {
    const diff = activeSide === 'buy' ? currentPrice - entryPrice : entryPrice - currentPrice;
    pnl = { value: diff * amount, pct: (diff / entryPrice) * 100, positive: diff >= 0 };
  }

  return (
    <div className="border-b border-white/5 bg-[#090c11] px-3 py-2.5">
      {/* Demo account balance */}
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="text-[10px] sm:text-xs">
          <span className="text-[#848e9c]">{bi('باڵانسی دیمۆ', 'Demo Balance')}: </span>
          <span className={`font-bold tabular-nums ${depleted ? 'text-[#f6465d]' : 'text-white'}`}>£{fmtMoney(balance)}</span>
        </div>
        {depleted && (
          <button
            onClick={onRenew}
            className="px-2.5 py-1 text-[10px] sm:text-xs font-bold rounded-md bg-[#f0b90b] text-black hover:bg-[#f0b90b]/90 active:scale-95 transition-colors"
          >
            {bi('نوێکردنەوەی £100,000', 'Renew £100,000')}
          </button>
        )}
      </div>

      {/* Buttons row: Buy | Refresh (centre) | Sell */}
      <div className="flex items-stretch gap-2">
        <button
          onClick={onBuy}
          disabled={depleted && activeSide !== 'buy'}
          className={`flex-1 py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors active:scale-95 border disabled:opacity-40 disabled:pointer-events-none ${
            activeSide === 'buy'
              ? 'bg-[#0ecb81] text-black border-[#0ecb81]'
              : 'bg-[#0ecb81]/10 text-[#0ecb81] border-[#0ecb81]/40 hover:bg-[#0ecb81]/20'
          }`}
        >
          {activeSide === 'buy' ? bi('داخستنی کڕین', 'Close Buy') : bi('کڕین', 'Buy')}
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
          className={`flex-1 py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors active:scale-95 border ${
            activeSide === 'sell'
              ? 'bg-[#f6465d] text-white border-[#f6465d]'
              : 'bg-[#f6465d]/10 text-[#f6465d] border-[#f6465d]/40 hover:bg-[#f6465d]/20'
          }`}
        >
          {bi('فرۆشتن', 'Sell')}
        </button>
      </div>

      {/* Live profit / loss vs entry — shown while a side is active */}
      {pnl && entryPrice && (
        <div className="mt-2 rounded-lg bg-[#0d1117] border border-white/5 px-2.5 py-2">
          <div className="flex items-center justify-between text-[10px] sm:text-xs">
            <span className="text-[#848e9c]">
              {activeSide === 'buy' ? bi('کڕین', 'Buy') : bi('فرۆشتن', 'Sell')}
              {timeframeLabel ? ` · ${timeframeLabel}` : ''}
            </span>
            <span className="text-[#848e9c]">
              {bi('چوونەژوورەوە', 'Entry')}: <span className="text-white tabular-nums">{fmtMoney(entryPrice)}</span>
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
            {pnl.positive ? bi('قازانج', 'Profit') : bi('زیان', 'Loss')} · {bi('بڕ', 'Qty')} {amount}
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
