import { useState, useMemo, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { calculateRisk, RiskSide, GOLD_CONTRACT_SIZE, GOLD_PIP_SIZE } from '@/lib/risk';
import { Calculator } from 'lucide-react';

interface Props {
  /** Live price used to pre-fill the entry field. */
  defaultEntry: number;
  /** Units per 1 lot. Gold = 100 oz; crypto = 1 coin. */
  contractSize?: number;
  /** Price size of one pip. Gold = 0.1. */
  pipSize?: number;
  /** Decimal places for price inputs/results. */
  priceDecimals?: number;
  /** Label for the raw units row (e.g. oz / coins). */
  unitLabel?: { ku: string; en: string };
  /** Label for the position-size row (lots vs coins). */
  sizeLabel?: { ku: string; en: string };
  /** When false, hides the SL-pips stat (not meaningful for crypto). */
  showPips?: boolean;
}

const RR_OPTIONS = [1, 1.5, 2, 3];

const fmt = (n: number, d = 2) =>
  n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

export function RiskCalculator({
  defaultEntry,
  contractSize = GOLD_CONTRACT_SIZE,
  pipSize = GOLD_PIP_SIZE,
  priceDecimals = 2,
  unitLabel = { ku: 'قەبارە (ئۆنسی)', en: 'Units (oz)' },
  sizeLabel = { ku: 'قەبارەی Lot', en: 'Position Size' },
  showPips = true,
}: Props) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' || language === 'tr' ? en : ku);

  const [balance, setBalance] = useState('5000');
  const [riskPct, setRiskPct] = useState('1');
  const [entry, setEntry] = useState(defaultEntry ? defaultEntry.toFixed(priceDecimals) : '');
  const [stopLoss, setStopLoss] = useState('');
  const [rr, setRr] = useState(2);
  const [side, setSide] = useState<RiskSide>('buy');

  // Keep entry synced with the live price until the user edits it.
  const [entryTouched, setEntryTouched] = useState(false);
  useEffect(() => {
    if (!entryTouched && defaultEntry) setEntry(defaultEntry.toFixed(priceDecimals));
  }, [defaultEntry, entryTouched, priceDecimals]);

  const result = useMemo(() => {
    const e = parseFloat(entry);
    const sl = parseFloat(stopLoss);
    return calculateRisk({
      balance: parseFloat(balance) || 0,
      riskPct: parseFloat(riskPct) || 0,
      entry: Number.isFinite(e) ? e : 0,
      stopLoss: Number.isFinite(sl) ? sl : 0,
      rr,
      side,
      contractSize,
      pipSize,
    });
  }, [balance, riskPct, entry, stopLoss, rr, side, contractSize, pipSize]);

  const hasInputs = parseFloat(entry) > 0 && parseFloat(stopLoss) > 0 && parseFloat(balance) > 0;

  const inputCls =
    'w-full bg-[#0a0e17] border border-[#1a1e2e] rounded-lg px-3 py-2 text-sm text-white tabular-nums focus:outline-none focus:border-[#3b82f6]';
  const labelCls = 'text-[11px] text-[#848e9c] mb-1 block';

  return (
    <div className="bg-[#0d1117] border border-[#1a1e2e] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Calculator className="h-4 w-4 text-[#0ecb81]" />
        <h3 className="text-sm font-bold text-white">{bi('هەژماردنی مەترسی و قەبارەی Lot', 'Risk & Lot Calculator')}</h3>
      </div>

      {/* Side toggle */}
      <div className="flex bg-[#0a0e17] p-1 rounded-lg mb-3">
        <button
          onClick={() => setSide('buy')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${side === 'buy' ? 'bg-[#0ecb81] text-black' : 'text-[#848e9c]'}`}
        >
          {bi('کڕین', 'Buy / Long')}
        </button>
        <button
          onClick={() => setSide('sell')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${side === 'sell' ? 'bg-[#f6465d] text-white' : 'text-[#848e9c]'}`}
        >
          {bi('فرۆشتن', 'Sell / Short')}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className={labelCls}>{bi('باڵانسی هەژمار ($)', 'Account Balance ($)')}</label>
          <input className={inputCls} inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>{bi('مەترسی (%)', 'Risk (%)')}</label>
          <input className={inputCls} inputMode="decimal" value={riskPct} onChange={(e) => setRiskPct(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>{bi('نرخی داخڵبوون', 'Entry Price')}</label>
          <input
            className={inputCls}
            inputMode="decimal"
            value={entry}
            onChange={(e) => { setEntry(e.target.value); setEntryTouched(true); }}
          />
        </div>
        <div>
          <label className={labelCls}>{bi('Stop Loss', 'Stop Loss')}</label>
          <input className={inputCls} inputMode="decimal" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} />
        </div>
      </div>

      {/* R:R */}
      <div className="mb-3">
        <label className={labelCls}>{bi('ڕێژەی قازانج:مەترسی (R:R)', 'Reward:Risk (R:R)')}</label>
        <div className="flex gap-1.5">
          {RR_OPTIONS.map((o) => (
            <button
              key={o}
              onClick={() => setRr(o)}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${rr === o ? 'bg-[#3b82f6] text-white' : 'bg-[#0a0e17] text-[#848e9c] border border-[#1a1e2e]'}`}
            >
              1:{o}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {hasInputs && !result.valid ? (
        <div className="text-xs text-[#f6465d] bg-[#f6465d14] rounded-lg px-3 py-2">
          {side === 'buy'
            ? bi('بۆ کڕین، Stop Loss دەبێ خوارتر لە نرخی داخڵبوون بێت.', 'For a Buy, the Stop Loss must be below the entry price.')
            : bi('بۆ فرۆشتن، Stop Loss دەبێ بەرزتر لە نرخی داخڵبوون بێت.', 'For a Sell, the Stop Loss must be above the entry price.')}
        </div>
      ) : hasInputs ? (
        <div className="grid grid-cols-2 gap-2">
          <Stat label={bi('قەبارەی Lot', 'Position Size')} value={`${fmt(result.lots, 2)} ${bi('لۆت', 'lots')}`} color="#0ecb81" />
          <Stat label={bi('بڕی مەترسی', 'Risk Amount')} value={`$${fmt(result.riskAmount)}`} color="#f6465d" />
          <Stat label={bi('Take Profit', 'Take Profit')} value={`$${fmt(result.takeProfit)}`} color="#0ecb81" />
          <Stat label={bi('قازانجی چاوەڕوانکراو', 'Potential Profit')} value={`$${fmt(result.rewardAmount)}`} color="#0ecb81" />
          <Stat label={bi('دووری SL (پێنت)', 'SL Distance (pips)')} value={fmt(result.slPips, 0)} color="#f0b90b" />
          <Stat label={bi('قەبارە (ئۆنسی)', 'Units (oz)')} value={fmt(result.units, 2)} color="#d4af37" />
        </div>
      ) : (
        <p className="text-xs text-[#848e9c]">{bi('نرخی داخڵبوون و Stop Loss بنووسە بۆ هەژماردن.', 'Enter entry and stop-loss to calculate.')}</p>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-[#0a0e17] border border-[#1a1e2e] rounded-lg p-2">
      <div className="text-[10px] text-[#848e9c] mb-0.5">{label}</div>
      <div className="text-sm font-bold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}
