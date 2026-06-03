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
  onBuy: () => void;
  onSell: () => void;
  onRefresh: () => void;
  onAmountChange: (amount: number) => void;
}

/**
 * Buy / Refresh / Sell control strip rendered directly above a chart.
 * Identical behaviour for Crypto and Metals:
 *  - Buy / Sell draw a coloured line on the chart at the current price.
 *  - Refresh recomputes the analysed Buy/Sell percentages shown below the buttons.
 *  - Amount chips (0.001 / 0.05 / 0.1) sit under the centre refresh button.
 */
export function TradeControls({
  activeSide,
  amount,
  pct,
  onBuy,
  onSell,
  onRefresh,
  onAmountChange,
}: TradeControlsProps) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' ? en : ku);

  return (
    <div className="border-b border-white/5 bg-[#090c11] px-3 py-2.5">
      {/* Buttons row: Buy | Refresh (centre) | Sell */}
      <div className="flex items-stretch gap-2">
        <button
          onClick={onBuy}
          className={`flex-1 py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors active:scale-95 border ${
            activeSide === 'buy'
              ? 'bg-[#0ecb81] text-black border-[#0ecb81]'
              : 'bg-[#0ecb81]/10 text-[#0ecb81] border-[#0ecb81]/40 hover:bg-[#0ecb81]/20'
          }`}
        >
          {bi('کڕین', 'Buy')}
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
