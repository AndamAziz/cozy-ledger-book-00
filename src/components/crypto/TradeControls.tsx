import { RefreshCw, X, Target, ShieldAlert, ArrowUp, ArrowDown } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export type TradeSide = 'buy' | 'sell' | null;

export interface TradePct {
  hasData: boolean;
  buyPct: number;
  sellPct: number;
}

/** One directional leg of the open position. */
export interface LegInfo {
  entryPrice: number;
  qty: number;
  takeProfit: number | null;
  stopLoss: number | null;
}

export const TRADE_AMOUNTS = [0.001, 0.05, 0.1];

interface TradeControlsProps {
  amount: number;
  pct: TradePct | null;
  /** Live moving price used to compute profit / loss + shown on the buttons. */
  currentPrice: number;
  /** Direction of the last live price move (drives the colour + arrow). */
  priceDir: 'up' | 'down' | null;
  /** The open BUY leg of this asset, or null. */
  buyLeg: LegInfo | null;
  /** The open SELL leg of this asset, or null. */
  sellLeg: LegInfo | null;
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
  /** Close one leg and realise its profit / loss. */
  onClose: (side: 'buy' | 'sell') => void;
  onRefresh: () => void;
  onAmountChange: (amount: number) => void;
  /** Set / clear the take-profit and stop-loss levels of one leg. */
  onSetTpSl: (side: 'buy' | 'sell', takeProfit: number | null, stopLoss: number | null) => void;
}

const fmtMoney = (n: number) => {
  const abs = Math.abs(n);
  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: digits });
};

const fmtPrice = (n: number) => {
  const digits = n >= 1 ? 2 : 6;
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

const legPnl = (side: 'buy' | 'sell', leg: LegInfo, price: number) => {
  if (!leg.entryPrice || leg.entryPrice <= 0 || price <= 0) return null;
  const diff = side === 'buy' ? price - leg.entryPrice : leg.entryPrice - price;
  return { value: diff * leg.qty, pct: (diff / leg.entryPrice) * 100, positive: diff >= 0 };
};

/**
 * Buy / Refresh / Sell control strip rendered directly above a chart.
 *  - Buy and Sell can BOTH be open at the same time (hedge mode).
 *  - Each side shows its own live P/L, average entry, size, TP/SL and Close.
 *  - The Buy / Sell buttons display the live price with an up/down indicator.
 *  - Positions survive navigation: they only close manually or via TP/SL.
 */
export function TradeControls({
  amount,
  pct,
  currentPrice,
  priceDir,
  buyLeg,
  sellLeg,
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

  const buyPnl = buyLeg && buyLeg.qty > 0 ? legPnl('buy', buyLeg, currentPrice) : null;
  const sellPnl = sellLeg && sellLeg.qty > 0 ? legPnl('sell', sellLeg, currentPrice) : null;
  const totalPnl = (buyPnl?.value ?? 0) + (sellPnl?.value ?? 0);
  const hasAny = !!(buyPnl || sellPnl);

  const parseNum = (v: string): number | null => {
    if (v.trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const priceUp = priceDir === 'up';
  const priceDown = priceDir === 'down';

  // Reusable open-leg panel (avg entry · size · live P/L · TP/SL · close).
  const LegPanel = ({ side, leg }: { side: 'buy' | 'sell'; leg: LegInfo }) => {
    const isBuy = side === 'buy';
    const accent = isBuy ? '#0ecb81' : '#f6465d';
    const pnl = legPnl(side, leg, currentPrice);
    return (
      <div className="rounded-lg bg-[#0d1117] border px-2.5 py-2 space-y-2" style={{ borderColor: `${accent}33` }}>
        {/* Header: side + avg + size + live P/L */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] sm:text-xs">
            <span className="font-bold" style={{ color: accent }}>
              {isBuy ? bi('کڕین', 'Buy') : bi('فرۆشتن', 'Sell')}
            </span>
            <span className="text-[#848e9c]">{bi('ناوەند', 'Avg')}</span>
            <span className="text-white font-bold tabular-nums">{fmtMoney(leg.entryPrice)}</span>
            <span className="text-[#848e9c]">· {bi('بڕ', 'Size')}</span>
            <span className="text-white font-bold tabular-nums">{fmtQty(leg.qty)}</span>
          </div>
          {pnl && (
            <span className={`text-[11px] sm:text-xs font-bold tabular-nums ${pnl.positive ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
              {pnl.positive ? '+' : '−'}${fmtMoney(Math.abs(pnl.value))} ({pnl.positive ? '+' : '−'}{Math.abs(pnl.pct).toFixed(2)}%)
            </span>
          )}
        </div>

        {/* TP / SL inputs */}
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-1.5 rounded-md bg-[#090c11] border border-[#0ecb81]/30 px-2 py-1.5">
            <Target className="h-3.5 w-3.5 text-[#0ecb81] shrink-0" />
            <input
              type="number"
              inputMode="decimal"
              value={leg.takeProfit ?? ''}
              onChange={(e) => onSetTpSl(side, parseNum(e.target.value), leg.stopLoss)}
              placeholder={bi('قازانج', 'Take Profit')}
              className="w-full bg-transparent text-[11px] sm:text-xs font-bold text-[#0ecb81] placeholder:text-[#0ecb81]/40 outline-none tabular-nums"
            />
          </label>
          <label className="flex items-center gap-1.5 rounded-md bg-[#090c11] border border-[#f6465d]/30 px-2 py-1.5">
            <ShieldAlert className="h-3.5 w-3.5 text-[#f6465d] shrink-0" />
            <input
              type="number"
              inputMode="decimal"
              value={leg.stopLoss ?? ''}
              onChange={(e) => onSetTpSl(side, leg.takeProfit, parseNum(e.target.value))}
              placeholder={bi('زیان', 'Stop Loss')}
              className="w-full bg-transparent text-[11px] sm:text-xs font-bold text-[#f6465d] placeholder:text-[#f6465d]/40 outline-none tabular-nums"
            />
          </label>
        </div>

        {/* Quick presets + clear + close */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] sm:text-[10px] text-[#848e9c]">{bi('خێرا', 'Quick')}</span>
            {[0.5, 1, 2].map((p) => {
              const [tp, sl] = presetTpSl(side, leg.entryPrice, p);
              return (
                <button
                  key={p}
                  onClick={() => onSetTpSl(side, tp, sl)}
                  className="px-2 py-0.5 text-[9px] sm:text-[10px] font-bold rounded border border-white/10 text-[#848e9c] hover:text-white hover:bg-white/5 active:scale-95 transition-colors tabular-nums"
                >
                  ±{p}%
                </button>
              );
            })}
            {(leg.takeProfit != null || leg.stopLoss != null) && (
              <button
                onClick={() => onSetTpSl(side, null, null)}
                className="text-[9px] sm:text-[10px] font-bold text-[#848e9c] hover:text-white transition-colors"
              >
                {bi('سڕینەوە', 'Clear')}
              </button>
            )}
          </div>
        </div>

        {/* Close this leg */}
        <button
          onClick={() => onClose(side)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] sm:text-xs font-bold bg-[#f0b90b] text-black border border-[#f0b90b] hover:bg-[#f0b90b]/90 active:scale-95 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
          {isBuy ? bi('داخستنی کڕین', 'Close Buy') : bi('داخستنی فرۆشتن', 'Close Sell')}
          <span className="tabular-nums opacity-80">· {fmtQty(leg.qty)}</span>
        </button>
      </div>
    );
  };

  return (
    <div className="border-b border-white/5 bg-[#090c11] px-3 py-2.5">
      {/* Demo account balance + combined live profit/loss */}
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="text-[10px] sm:text-xs">
          <span className="text-[#848e9c]">{bi('باڵانسی دیمۆ', 'Demo Balance')}: </span>
          <span className={`font-bold tabular-nums ${depleted ? 'text-[#f6465d]' : 'text-white'}`}>${fmtMoney(balance)}</span>
          {hasAny && (
            <span className={`ms-2 font-bold tabular-nums ${totalPnl >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
              ({totalPnl >= 0 ? '+' : '−'}${fmtMoney(Math.abs(totalPnl))})
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

      {/* Buy | Refresh (centre) | Sell — both sides can be open at once.
          Each button shows the LIVE price with an up/down indicator. */}
      <div className="flex items-stretch gap-2">
        <button
          onClick={onBuy}
          disabled={depleted || !!otherPositionLabel}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 rounded-lg font-bold transition-colors active:scale-95 border disabled:opacity-40 disabled:pointer-events-none ${
            buyLeg && buyLeg.qty > 0
              ? 'bg-[#0ecb81] text-black border-white ring-2 ring-white/60 shadow-lg'
              : 'bg-[#0ecb81]/10 text-[#0ecb81] border-[#0ecb81]/40 hover:bg-[#0ecb81]/20'
          }`}
        >
          <span className="text-xs sm:text-sm">{bi('کڕین', 'Buy')}{buyLeg && buyLeg.qty > 0 ? ' +' : ''}</span>
          {currentPrice > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] sm:text-[11px] tabular-nums opacity-90">
              {priceUp && <ArrowUp className="h-3 w-3" />}
              {priceDown && <ArrowDown className="h-3 w-3" />}
              ${fmtPrice(currentPrice)}
            </span>
          )}
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
          disabled={depleted || !!otherPositionLabel}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 rounded-lg font-bold transition-colors active:scale-95 border disabled:opacity-40 disabled:pointer-events-none ${
            sellLeg && sellLeg.qty > 0
              ? 'bg-[#f6465d] text-white border-white ring-2 ring-white/60 shadow-lg'
              : 'bg-[#f6465d]/10 text-[#f6465d] border-[#f6465d]/40 hover:bg-[#f6465d]/20'
          }`}
        >
          <span className="text-xs sm:text-sm">{bi('فرۆشتن', 'Sell')}{sellLeg && sellLeg.qty > 0 ? ' +' : ''}</span>
          {currentPrice > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] sm:text-[11px] tabular-nums opacity-90">
              {priceUp && <ArrowUp className="h-3 w-3" />}
              {priceDown && <ArrowDown className="h-3 w-3" />}
              ${fmtPrice(currentPrice)}
            </span>
          )}
        </button>
      </div>

      {/* Open leg panels — buy and/or sell, shown while open */}
      {(buyLeg && buyLeg.qty > 0) || (sellLeg && sellLeg.qty > 0) ? (
        <div className="mt-2 space-y-2">
          {timeframeLabel && (
            <p className="text-[9px] sm:text-[10px] text-[#848e9c] text-center">{bi('کاتبەندی', 'Timeframe')}: {timeframeLabel}</p>
          )}
          {buyLeg && buyLeg.qty > 0 && <LegPanel side="buy" leg={buyLeg} />}
          {sellLeg && sellLeg.qty > 0 && <LegPanel side="sell" leg={sellLeg} />}
        </div>
      ) : null}

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
