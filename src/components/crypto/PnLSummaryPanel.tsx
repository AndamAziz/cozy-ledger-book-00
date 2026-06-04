import { TrendingUp, TrendingDown, Wallet, Eye, Activity } from 'lucide-react';

interface PnLSummaryPanelProps {
  realizedPnl: number;
  unrealizedPnl: number;
  language: string;
}

const fmtMoney = (n: number) => {
  const abs = Math.abs(n);
  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: digits });
};

export function PnLSummaryPanel({ realizedPnl, unrealizedPnl, language }: PnLSummaryPanelProps) {
  const bi = (ku: string, en: string, tr?: string) =>
    language === 'tr' ? (tr ?? en) : language === 'en' ? en : ku;
  const net = realizedPnl + unrealizedPnl;
  const up = (n: number) => n >= 0;

  const color = (n: number) => (up(n) ? '#0ecb81' : '#f6465d');
  const bg = (n: number) => (up(n) ? 'rgba(14,203,129,0.08)' : 'rgba(246,70,93,0.08)');
  const border = (n: number) => (up(n) ? 'rgba(14,203,129,0.35)' : 'rgba(246,70,93,0.35)');

  const Row = ({
    icon: Icon,
    label,
    value,
    accent,
  }: {
    icon: React.ElementType;
    label: string;
    value: number;
    accent: string;
  }) => {
    const positive = up(value);
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3 w-3 shrink-0" style={{ color: accent }} />
          <span className="text-[10px] font-semibold text-[#848e9c]">{label}</span>
        </div>
        <span
          className="text-[11px] font-extrabold tabular-nums"
          style={{ color: accent }}
        >
          {positive ? '+' : '−'}${fmtMoney(Math.abs(value))}
        </span>
      </div>
    );
  };

  return (
    <div
      className="absolute top-2 right-2 z-20 pointer-events-none rounded-xl border backdrop-blur-md bg-[#0a0e17]/90 px-3 py-2.5 min-w-[160px]"
      style={{
        borderColor: border(net),
        boxShadow: `0 6px 24px -8px ${color(net)}44, inset 0 0 0 1px ${color(net)}18`,
      }}
    >
      {/* Net header */}
      <div
        className="flex items-center justify-between gap-2 mb-2 pb-2 border-b"
        style={{ borderColor: `${color(net)}22` }}
      >
        <div className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 shrink-0" style={{ color: color(net) }} />
          <span className="text-[10px] font-bold text-white uppercase tracking-wide">
            {bi('کۆی P/L', 'Total P/L', 'Toplam K/Z')}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {up(net) ? (
            <TrendingUp className="h-3 w-3 text-[#0ecb81]" />
          ) : (
            <TrendingDown className="h-3 w-3 text-[#f6465d]" />
          )}
          <span
            className="text-sm font-extrabold tabular-nums leading-none"
            style={{ color: color(net) }}
          >
            {up(net) ? '+' : '−'}${fmtMoney(Math.abs(net))}
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        <Row icon={Wallet} label={bi('قازانجی ڕەنگین', 'Realized', 'Gerçekleşen')} value={realizedPnl} accent={color(realizedPnl)} />
        <Row icon={Eye} label={bi('قازانجی ناڕەنگین', 'Unrealized', 'Gerçekleşmemiş')} value={unrealizedPnl} accent={color(unrealizedPnl)} />
      </div>
    </div>
  );
}
