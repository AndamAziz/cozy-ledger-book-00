import { useMemo } from 'react';
import { X, Trash2, TrendingUp, TrendingDown, Target, ShieldAlert, History } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDemoAccount, TradeRecord } from '@/contexts/DemoAccountContext';

interface TradeJournalModalProps {
  open: boolean;
  onClose: () => void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format an epoch-seconds timestamp as `D-MMM-YYYY HH:mm` with English numerals. */
const fmtDate = (secs: number): string => {
  const d = new Date(secs * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getDate()}-${MONTHS[d.getMonth()]}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fmtMoney = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtPrice = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 6 : 2 });

const fmtQty = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 });

/**
 * Trade history / journal (MT5 style): a full log of every CLOSED trade with
 * summary stats — total trades, win rate, net P/L, best & worst — plus a
 * per-trade table showing side, size, entry → exit and realised P/L.
 */
export function TradeJournalModal({ open, onClose }: TradeJournalModalProps) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' || language === 'tr' ? en : ku);
  const { journal, clearJournal } = useDemoAccount();

  const stats = useMemo(() => {
    const total = journal.length;
    const wins = journal.filter((t) => t.pnl >= 0).length;
    const net = journal.reduce((a, t) => a + t.pnl, 0);
    const best = journal.reduce((m, t) => Math.max(m, t.pnl), 0);
    const worst = journal.reduce((m, t) => Math.min(m, t.pnl), 0);
    const winRate = total ? Math.round((wins / total) * 100) : 0;
    return { total, wins, net, best, worst, winRate };
  }, [journal]);

  if (!open) return null;

  const reasonChip = (t: TradeRecord) => {
    if (t.reason === 'tp') return { icon: <Target className="h-3 w-3" />, label: bi('قازانج', 'TP'), color: '#0ecb81' };
    if (t.reason === 'sl') return { icon: <ShieldAlert className="h-3 w-3" />, label: bi('زیان', 'SL'), color: '#f6465d' };
    return { icon: null, label: bi('داخراو', 'Manual'), color: '#848e9c' };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 px-2 pb-2 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[88vh] flex flex-col rounded-xl border border-white/10 bg-[#0d1117] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10 bg-[#090c11]">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-[#f0b90b]" />
            <span className="text-sm font-bold text-white">{bi('تۆماری ترەید', 'Trade Journal')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {journal.length > 0 && (
              <button
                onClick={clearJournal}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-md border border-[#f6465d]/40 text-[#f6465d] hover:bg-[#f6465d]/10 active:scale-95 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
                {bi('سڕینەوە', 'Clear')}
              </button>
            )}
            <button
              onClick={onClose}
              aria-label={bi('داخستن', 'Close')}
              className="p-1.5 rounded-md text-[#848e9c] hover:text-white hover:bg-white/10 active:scale-95 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-2 p-3 border-b border-white/5">
          <div className="rounded-lg bg-[#0a0e17] border border-white/5 px-2 py-1.5">
            <p className="text-[9px] text-[#848e9c] uppercase tracking-wide">{bi('کۆی ترەید', 'Trades')}</p>
            <p className="text-sm font-bold text-white tabular-nums">{stats.total}</p>
          </div>
          <div className="rounded-lg bg-[#0a0e17] border border-white/5 px-2 py-1.5">
            <p className="text-[9px] text-[#848e9c] uppercase tracking-wide">{bi('ڕێژەی بردنەوە', 'Win Rate')}</p>
            <p className="text-sm font-bold text-white tabular-nums">{stats.winRate}%</p>
          </div>
          <div className="rounded-lg bg-[#0a0e17] border border-white/5 px-2 py-1.5">
            <p className="text-[9px] text-[#848e9c] uppercase tracking-wide">{bi('کۆی قازانج', 'Net P/L')}</p>
            <p className={`text-sm font-bold tabular-nums ${stats.net >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
              {stats.net >= 0 ? '+' : '−'}${fmtMoney(Math.abs(stats.net))}
            </p>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {journal.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-[#848e9c]">
              <History className="h-8 w-8 opacity-40" />
              <p className="text-xs">{bi('هێشتا هیچ ترەیدێکی داخراو نییە', 'No closed trades yet')}</p>
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {journal.map((t) => {
                const up = t.pnl >= 0;
                const isBuy = t.side === 'buy';
                const r = reasonChip(t);
                const pct = t.entryPrice > 0
                  ? ((isBuy ? t.exitPrice - t.entryPrice : t.entryPrice - t.exitPrice) / t.entryPrice) * 100
                  : 0;
                return (
                  <li key={t.id} className="px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="shrink-0 rounded px-1 py-px text-[9px] font-extrabold uppercase"
                          style={{ color: '#0a0e17', background: isBuy ? '#0ecb81' : '#f6465d' }}
                        >
                          {isBuy ? bi('کڕین', 'Buy') : bi('فرۆشتن', 'Sell')}
                        </span>
                        <span className="text-xs font-bold text-white truncate">{t.label}</span>
                        <span className="text-[10px] text-[#848e9c] tabular-nums">{fmtQty(t.qty)}</span>
                        {r.label && (
                          <span className="flex items-center gap-0.5 text-[9px] font-bold" style={{ color: r.color }}>
                            {r.icon}{r.label}
                          </span>
                        )}
                      </div>
                      <span className={`flex items-center gap-0.5 text-xs font-bold tabular-nums ${up ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                        {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {up ? '+' : '−'}${fmtMoney(Math.abs(t.pnl))}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-[#848e9c] tabular-nums">
                      <span>${fmtPrice(t.entryPrice)} → ${fmtPrice(t.exitPrice)} ({up ? '+' : '−'}{Math.abs(pct).toFixed(2)}%)</span>
                      <span>{fmtDate(t.closedAt)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
