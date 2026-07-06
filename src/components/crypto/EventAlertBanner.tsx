import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { BellRing, Clock, CheckCircle2, TrendingUp, TrendingDown, Minus, Info, ShieldCheck, ShieldAlert, HelpCircle } from 'lucide-react';
import { explainEventResult, explainMethodLabel } from '@/lib/eventExplain';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface CalendarEvent {
  title: string;
  country: string;
  impact: string;
  date: string;
  forecast: string;
  previous: string;
  actual: string;
  /** Match confidence for the released actual figure, set by the market-news function. */
  actualConfidence?: 'high' | 'medium';
}

interface Props {
  events: CalendarEvent[];
  loading: boolean;
}

const FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', CHF: '🇨🇭', CAD: '🇨🇦', AUD: '🇦🇺', NZD: '🇳🇿',
};

export function EventAlertBanner({ events, loading }: Props) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' || language === 'tr' ? en : ku);

  // Tick every 30s so countdowns stay fresh.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  // Upcoming USD high/medium events that affect gold, sorted soonest-first.
  const upcoming = events
    .map((e) => ({ e, t: Date.parse(e.date) }))
    .filter(({ e, t }) => {
      if (Number.isNaN(t) || t < now) return false;
      const imp = (e.impact || '').toLowerCase();
      if (imp !== 'high' && imp !== 'medium') return false;
      return e.country === 'USD' || e.country === 'All';
    })
    .sort((a, b) => a.t - b.t)
    .slice(0, 5);

  // Recently released USD high/medium events (last 24h). Includes events whose
  // actual figure hasn't been confidently matched yet so we can surface a clear
  // "Actual unavailable" state rather than silently dropping them.
  const DAY = 86400000;
  const released = events
    .map((e) => ({ e, t: Date.parse(e.date) }))
    .filter(({ e, t }) => {
      if (Number.isNaN(t) || t > now || t < now - DAY) return false;
      const imp = (e.impact || '').toLowerCase();
      if (imp !== 'high' && imp !== 'medium') return false;
      return e.country === 'USD' || e.country === 'All';
    })
    .sort((a, b) => b.t - a.t)
    .slice(0, 4);

  const countdown = (t: number): { text: string; soon: boolean } => {
    const diff = t - now;
    const mins = Math.round(diff / 60000);
    if (mins <= 60) return { text: bi(`${mins} خولەک`, `${mins} min`), soon: true };
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    if (hrs < 24) return { text: bi(`${hrs} کاتژمێر ${rem} خ`, `${hrs}h ${rem}m`), soon: false };
    const days = Math.floor(hrs / 24);
    return { text: bi(`${days} ڕۆژ`, `${days}d`), soon: false };
  };

  return (
    <div className="bg-[#0d1117] border border-[#1a1e2e] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <BellRing className="h-4 w-4 text-[#f6465d]" />
        <h3 className="text-sm font-bold text-white">{bi('ئاگادارکەرەوەی ڕووداوی دۆلار', 'USD Event Alerts')}</h3>
      </div>

      {loading ? (
        <div className="h-12 animate-pulse bg-[#1a1e2e] rounded-lg" />
      ) : (
        <div className="space-y-3">
          {upcoming.length === 0 && released.length === 0 && (
            <p className="text-xs text-[#848e9c]">{bi('هیچ ڕووداوێکی گرنگی نزیک نییە.', 'No high-impact events coming up.')}</p>
          )}
          {upcoming.length > 0 && (
          <div className="space-y-1.5">
          {upcoming.map(({ e, t }, i) => {
            const cd = countdown(t);
            const high = (e.impact || '').toLowerCase() === 'high';
            return (
              <div
                key={`${e.title}-${i}`}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${cd.soon ? 'border-[#f6465d] bg-[#f6465d14] animate-pulse' : 'border-[#1a1e2e] bg-[#0a0e17]'}`}
              >
                <span className="text-base shrink-0">{FLAGS[e.country] ?? '🌐'}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: high ? '#f6465d' : '#f0b90b' }} />
                    <span className="text-sm text-white truncate">{e.title}</span>
                  </div>
                  {e.forecast && (
                    <span className="text-[10px] text-[#848e9c]">{bi('پێشبینی', 'Fcst')}: {e.forecast} · {bi('پێشتر', 'Prev')}: {e.previous}</span>
                  )}
                </div>
                <div className={`flex items-center gap-1 text-[11px] font-bold shrink-0 ${cd.soon ? 'text-[#f6465d]' : 'text-[#848e9c]'}`}>
                  <Clock className="h-3 w-3" />
                  {cd.text}
                </div>
              </div>
            );
          })}
          <p className="text-[10px] text-[#848e9c] pt-1">
            {bi('کاتی سور = لە ماوەی ٦٠ خولەکدا — زێڕ زۆر دەجوڵێت، وریابە.', 'Red = within 60 min — gold can move sharply, be careful.')}
          </p>
          </div>
          )}

          {released.length > 0 && (
            <div className="space-y-1.5 border-t border-[#1a1e2e] pt-3">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-[#0ecb81]" />
                <span className="text-xs font-bold text-white">{bi('ئەنجامی دوایین ڕووداوەکان', 'Latest results')}</span>
              </div>
              {released.map(({ e }, i) => {
                const exp = explainEventResult(e);
                const high = (e.impact || '').toLowerCase() === 'high';
                const goldUp = exp?.goldUp ?? null;
                const color = goldUp === true ? '#0ecb81' : goldUp === false ? '#f6465d' : '#f0b90b';
                const GoldIcon = goldUp === true ? TrendingUp : goldUp === false ? TrendingDown : Minus;
                return (
                  <div
                    key={`done-${e.title}-${i}`}
                    className="rounded-lg px-3 py-2 border border-[#1a1e2e] bg-[#0a0e17]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base shrink-0">{FLAGS[e.country] ?? '🌐'}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: high ? '#f6465d' : '#f0b90b' }} />
                          <span className="text-sm text-white truncate">{e.title}</span>
                        </div>
                        <div className="text-[10px] text-[#848e9c]">
                          <span className="font-bold text-white">{bi('ئەنجام', 'Actual')}: {e.actual}</span>
                          {e.forecast && <> · {bi('پێشبینی', 'Forecast')}: {e.forecast}</>}
                          {e.previous && <> · {bi('پێشتر', 'Previous')}: {e.previous}</>}
                        </div>
                      </div>
                      <span className="text-[9px] font-bold text-[#0ecb81] shrink-0 inline-flex items-center gap-0.5">
                        <CheckCircle2 className="h-3 w-3" />{bi('تەواوبوو', 'Done')}
                      </span>
                    </div>
                    {exp && (
                      <div
                        className="mt-1.5 flex items-start gap-1 rounded-md px-2 py-1"
                        style={{ backgroundColor: color + '14' }}
                      >
                        <GoldIcon className="h-3.5 w-3.5 mt-px shrink-0" style={{ color }} />
                        <span className="text-[11px] font-medium leading-snug" style={{ color }}>
                          {bi(exp.ku, exp.en)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
