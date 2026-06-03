import { RefreshCw, X, Target, ShieldAlert, ArrowUp, ArrowDown, Clock } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { suggestHoldMinutes, suggestHoldAcrossTimeframes } from '@/lib/indicators';

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

export const TRADE_AMOUNTS = [0.01, 0.05, 0.1];

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
  /** Duration (minutes) of one candle of the selected timeframe — for the hold hint. */
  timeframeMinutes?: number;
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
  timeframeMinutes,
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

  // Suggested holding time after analysis (based on conviction + timeframe).
  const hold = pct && pct.hasData && timeframeMinutes
    ? suggestHoldMinutes(pct, timeframeMinutes)
    : null;

  // Human-readable duration in the active language (minutes / hours / days).
  const fmtDuration = (mins: number): string => {
    if (mins < 60) return `${mins} ${bi('خولەک', 'min')}`;
    if (mins < 1440) {
      const h = Math.round((mins / 60) * 10) / 10;
      return `${h} ${bi('کاتژمێر', 'hr')}`;
    }
    const d = Math.round((mins / 1440) * 10) / 10;
    return `${d} ${bi('ڕۆژ', 'day')}`;
  };

  // Recommended action + holding times across timeframes (M1..4H).
  const recommendation = pct && pct.hasData ? suggestHoldAcrossTimeframes(pct) : null;
  const recSide = recommendation?.side ?? 'neutral';
  const recIsBuy = recSide === 'buy';
  const recIsSell = recSide === 'sell';




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

        {/* Close this leg — shows the live P/L right on the button (green/red) */}
        <button
          onClick={() => onClose(side)}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-[11px] sm:text-xs font-bold bg-[#1a1e2e] text-white border border-white/10 hover:bg-[#252a3a] active:scale-95 transition-colors"
        >
          <X className="h-3.5 w-3.5 opacity-70" />
          <span>{isBuy ? bi('داخستنی کڕین', 'Close Buy') : bi('داخستنی فرۆشتن', 'Close Sell')}</span>
          {pnl && (
            <span
              className="px-1.5 py-0.5 rounded tabular-nums"
              style={{ color: pnl.positive ? '#0ecb81' : '#f6465d', background: `${pnl.positive ? '#0ecb81' : '#f6465d'}1f` }}
            >
              {pnl.positive ? '+' : '−'}${fmtMoney(Math.abs(pnl.value))}
            </span>
          )}
        </button>
      </div>
    );
  };

  // Batch close helpers — close legs by profit / loss / all at once.
  const profitSum = (buyPnl?.positive ? buyPnl.value : 0) + (sellPnl?.positive ? sellPnl.value : 0);
  const lossSum = (buyPnl && !buyPnl.positive ? buyPnl.value : 0) + (sellPnl && !sellPnl.positive ? sellPnl.value : 0);
  const hasProfit = !!(buyPnl?.positive || sellPnl?.positive);
  const hasLoss = !!((buyPnl && !buyPnl.positive) || (sellPnl && !sellPnl.positive));

  const closeBatch = (mode: 'profit' | 'loss' | 'all') => {
    const wantBuy = mode === 'all' ? !!(buyLeg && buyLeg.qty > 0) : buyPnl ? (mode === 'profit' ? buyPnl.positive : !buyPnl.positive) : false;
    const wantSell = mode === 'all' ? !!(sellLeg && sellLeg.qty > 0) : sellPnl ? (mode === 'profit' ? sellPnl.positive : !sellPnl.positive) : false;
    if (wantBuy) onClose('buy');
    if (wantSell) onClose('sell');
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

      {/* Sell (left) | Refresh (centre) | Buy (right) — MT5 layout, forced LTR
          so the sides stay fixed in both languages. Both can be open at once.
          Each button shows the LIVE price with an up/down indicator. */}
      <div dir="ltr" className="flex items-stretch gap-2">
        <button
          onClick={onSell}
          disabled={depleted || !!otherPositionLabel}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 rounded-lg font-bold transition-all active:scale-95 border disabled:opacity-40 disabled:pointer-events-none ${
            sellLeg && sellLeg.qty > 0
              ? 'bg-gradient-to-b from-[#f6465d] to-[#d12a40] text-white border-[#f6465d] ring-1 ring-white/40 shadow-[0_6px_22px_-6px_rgba(246,70,93,0.75)]'
              : 'bg-[#f6465d]/10 text-[#f6465d] border-[#f6465d]/40 hover:bg-[#f6465d]/20 hover:shadow-[0_4px_16px_-8px_rgba(246,70,93,0.6)]'
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
          onClick={onBuy}
          disabled={depleted || !!otherPositionLabel}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 rounded-lg font-bold transition-all active:scale-95 border disabled:opacity-40 disabled:pointer-events-none ${
            buyLeg && buyLeg.qty > 0
              ? 'bg-gradient-to-b from-[#0ecb81] to-[#0aa96b] text-black border-[#0ecb81] ring-1 ring-white/40 shadow-[0_6px_22px_-6px_rgba(14,203,129,0.75)]'
              : 'bg-[#0ecb81]/10 text-[#0ecb81] border-[#0ecb81]/40 hover:bg-[#0ecb81]/20 hover:shadow-[0_4px_16px_-8px_rgba(14,203,129,0.6)]'
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
      </div>

      {/* Open leg panels — buy and/or sell, shown while open */}
      {(buyLeg && buyLeg.qty > 0) || (sellLeg && sellLeg.qty > 0) ? (
        <div className="mt-2 space-y-2">
          {timeframeLabel && (
            <p className="text-[9px] sm:text-[10px] text-[#848e9c] text-center">{bi('کاتبەندی', 'Timeframe')}: {timeframeLabel}</p>
          )}
          {buyLeg && buyLeg.qty > 0 && <LegPanel side="buy" leg={buyLeg} />}
          {sellLeg && sellLeg.qty > 0 && <LegPanel side="sell" leg={sellLeg} />}

          {/* Batch close: Close Profit / Close Loss / Close All (MT5 style) */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => closeBatch('profit')}
              disabled={!hasProfit}
              className="flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-md text-[10px] sm:text-[11px] font-bold border bg-[#0ecb81]/10 text-[#0ecb81] border-[#0ecb81]/40 hover:bg-[#0ecb81]/20 active:scale-95 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <span>{bi('داخستنی قازانج', 'Close Profit')}</span>
              <span className="tabular-nums text-[#0ecb81]">+${fmtMoney(Math.abs(profitSum))}</span>
            </button>
            <button
              onClick={() => closeBatch('loss')}
              disabled={!hasLoss}
              className="flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-md text-[10px] sm:text-[11px] font-bold border bg-[#f6465d]/10 text-[#f6465d] border-[#f6465d]/40 hover:bg-[#f6465d]/20 active:scale-95 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <span>{bi('داخستنی زیان', 'Close Loss')}</span>
              <span className="tabular-nums text-[#f6465d]">−${fmtMoney(Math.abs(lossSum))}</span>
            </button>
            <button
              onClick={() => closeBatch('all')}
              disabled={!hasAny}
              className="flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-md text-[10px] sm:text-[11px] font-bold border bg-[#1a1e2e] text-white border-white/10 hover:bg-[#252a3a] active:scale-95 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <span>{bi('داخستنی هەموو', 'Close All')}</span>
              <span className="tabular-nums" style={{ color: totalPnl >= 0 ? '#0ecb81' : '#f6465d' }}>
                {totalPnl >= 0 ? '+' : '−'}${fmtMoney(Math.abs(totalPnl))}
              </span>
            </button>
          </div>
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

            {/* Suggested holding time after analysis */}
            {hold && hold.side !== 'neutral' && hold.minutes > 0 && (
              <div className={`mt-2 flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] sm:text-xs font-bold ${
                hold.side === 'buy'
                  ? 'bg-[#0ecb81]/10 border-[#0ecb81]/30 text-[#0ecb81]'
                  : 'bg-[#f6465d]/10 border-[#f6465d]/30 text-[#f6465d]'
              }`}>
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {hold.side === 'buy' ? bi('کڕین', 'Buy') : bi('فرۆشتن', 'Sell')}{' '}
                  {bi('هۆڵدی بکە بۆ نزیکەی', 'hold for ~')}{' '}
                  <span className="tabular-nums">{fmtDuration(hold.minutes)}</span>
                </span>
              </div>
            )}

            {/* Recommended action button driven by the prediction */}
            {recommendation && recSide !== 'neutral' && (
              <button
                onClick={recIsBuy ? onBuy : onSell}
                disabled={depleted || !!otherPositionLabel}
                className={`mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs sm:text-sm font-bold border transition-colors active:scale-95 disabled:opacity-40 disabled:pointer-events-none ${
                  recIsBuy
                    ? 'bg-[#0ecb81] text-black border-[#0ecb81] hover:bg-[#0ecb81]/90'
                    : 'bg-[#f6465d] text-white border-[#f6465d] hover:bg-[#f6465d]/90'
                }`}
              >
                {recIsBuy ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                {bi('پێشنیار', 'Recommended')}: {recIsBuy ? bi('کڕین', 'Buy') : bi('فرۆشتن', 'Sell')}
                <span className="opacity-80">({Math.max(pct.buyPct, pct.sellPct)}%)</span>
              </button>
            )}

            {/* Suggested holding time across timeframes (M1..4H) */}
            {recommendation && recSide !== 'neutral' && recommendation.rows.length > 0 && (
              <div className="mt-2">
                <p className="text-[9px] sm:text-[10px] text-[#848e9c] mb-1 flex items-center gap-1">
                  <Clock className="h-3 w-3 shrink-0" />
                  {recIsBuy ? bi('کڕین هۆڵد بکە بۆ', 'Hold Buy for') : bi('فرۆشتن هۆڵد بکە بۆ', 'Hold Sell for')}
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {recommendation.rows.map((row) => (
                    <div
                      key={row.label}
                      className={`rounded-md border px-1.5 py-1 text-center ${
                        recIsBuy
                          ? 'bg-[#0ecb81]/5 border-[#0ecb81]/20'
                          : 'bg-[#f6465d]/5 border-[#f6465d]/20'
                      }`}
                    >
                      <div className={`text-[9px] sm:text-[10px] font-bold ${recIsBuy ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                        {row.label}
                      </div>
                      <div className="text-[10px] sm:text-xs font-bold text-white tabular-nums">
                        {fmtDuration(row.minutes)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
