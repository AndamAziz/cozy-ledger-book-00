import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { Send, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Activity, Zap } from 'lucide-react';

type Health = 'healthy' | 'degraded' | 'down' | 'idle' | 'unknown';

interface ChannelStat {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  lastSentAt: string | null;
  lastFailedAt: string | null;
  lastError: string | null;
}

interface AssetStat {
  asset: string;
  sent: number;
  failed: number;
  pending: number;
  lastSentAt: string | null;
  lastFailedAt: string | null;
  lastError: string | null;
}

interface HealthData {
  reports: ChannelStat;
  signals: ChannelStat;
  byAsset: AssetStat[];
}

const emptyStat = (): ChannelStat => ({
  total: 0,
  sent: 0,
  failed: 0,
  pending: 0,
  lastSentAt: null,
  lastFailedAt: null,
  lastError: null,
});

// Assets we surface per-asset delivery diagnostics for.
const ASSET_META: { key: string; label: string; emoji: string }[] = [
  { key: 'GOLD', label: 'Gold', emoji: '🥇' },
  { key: 'SILVER', label: 'Silver', emoji: '🥈' },
  { key: 'OIL', label: 'Oil', emoji: '🛢️' },
  { key: 'BITCOIN', label: 'Bitcoin', emoji: '₿' },
  { key: 'ETHEREUM', label: 'Ethereum', emoji: 'Ξ' },
  { key: 'EUR/USD', label: 'EUR/USD', emoji: '💶' },
  { key: 'GBP/USD', label: 'GBP/USD', emoji: '💷' },
  { key: 'USD/JPY', label: 'USD/JPY', emoji: '💴' },
];

// Local bilingual labels (component is self-contained, not in global translations)
const L = {
  ku: {
    title: 'تەندروستی بۆتی تەلەگرام',
    subtitle: 'دۆخی ناردنی سیگنال و راپۆرتەکان (٢٤ کاتژمێری ڕابردوو)',
    reports: 'راپۆرتە خۆکارەکان',
    signals: 'سیگنالی دەستی',
    sent: 'نێردراو',
    failed: 'سەرکەوتوو نەبوو',
    pending: 'چاوەڕوان',
    lastSent: 'دوا ناردنی سەرکەوتوو',
    lastError: 'دوا هەڵە',
    none: 'هیچ',
    refresh: 'نوێکردنەوە',
    healthy: 'تەندروست',
    degraded: 'لاواز',
    down: 'ناکارا',
    idle: 'چالاک نییە',
    unknown: 'نەزانراو',
    overall: 'دۆخی گشتی',
    perAsset: 'ناردن بەپێی ئەسێت',
    noAsset: 'هیچ ناردنێک لە ٢٤ کاتژمێری ڕابردوو',
    gatewayError: '⚠️ هەڵەی گەیتوەی',
    telegramBlocked: '❌ تەلەگرام بلۆککراوە',
  },
  en: {
    title: 'Telegram Bot Health',
    subtitle: 'Signal & report delivery status (last 24h)',
    reports: 'Automated reports',
    signals: 'Manual signals',
    sent: 'Sent',
    failed: 'Failed',
    pending: 'Pending',
    lastSent: 'Last successful post',
    lastError: 'Last error',
    none: 'None',
    refresh: 'Refresh',
    healthy: 'Healthy',
    degraded: 'Degraded',
    down: 'Down',
    idle: 'Idle',
    unknown: 'Unknown',
    overall: 'Overall status',
    perAsset: 'Per-asset delivery',
    noAsset: 'No deliveries in last 24h',
    gatewayError: '⚠️ Gateway error',
    telegramBlocked: '❌ Telegram blocked',
  },
  ar: {
    title: 'صحة بوت تيليجرام',
    subtitle: 'حالة إرسال الإشارات والتقارير (آخر ٢٤ ساعة)',
    reports: 'التقارير التلقائية',
    signals: 'الإشارات اليدوية',
    sent: 'مُرسل',
    failed: 'فشل',
    pending: 'قيد الانتظار',
    lastSent: 'آخر إرسال ناجح',
    lastError: 'آخر خطأ',
    none: 'لا يوجد',
    refresh: 'تحديث',
    healthy: 'سليم',
    degraded: 'ضعيف',
    down: 'متوقف',
    idle: 'خامل',
    unknown: 'غير معروف',
    overall: 'الحالة العامة',
    perAsset: 'الإرسال حسب الأصل',
    noAsset: 'لا إرسال خلال آخر ٢٤ ساعة',
    gatewayError: '⚠️ خطأ البوابة',
    telegramBlocked: '❌ محظور من تيليجرام',
  },
  fa: {
    title: 'سلامت ربات تلگرام',
    subtitle: 'وضعیت ارسال سیگنال و گزارش (۲۴ ساعت اخیر)',
    reports: 'گزارش‌های خودکار',
    signals: 'سیگنال‌های دستی',
    sent: 'ارسال‌شده',
    failed: 'ناموفق',
    pending: 'در انتظار',
    lastSent: 'آخرین ارسال موفق',
    lastError: 'آخرین خطا',
    none: 'هیچ',
    refresh: 'بازخوانی',
    healthy: 'سالم',
    degraded: 'ضعیف',
    down: 'قطع',
    idle: 'غیرفعال',
    unknown: 'نامشخص',
    overall: 'وضعیت کلی',
    perAsset: 'ارسال بر اساس دارایی',
    noAsset: 'ارسالی در ۲۴ ساعت اخیر نبود',
    gatewayError: '⚠️ خطای دروازه',
    telegramBlocked: '❌ مسدود در تلگرام',
  },
  tr: {
    title: 'Telegram Bot Durumu',
    subtitle: 'Sinyal ve rapor gönderim durumu (son 24 sa)',
    reports: 'Otomatik raporlar',
    signals: 'Manuel sinyaller',
    sent: 'Gönderildi',
    failed: 'Başarısız',
    pending: 'Bekliyor',
    lastSent: 'Son başarılı gönderim',
    lastError: 'Son hata',
    none: 'Yok',
    refresh: 'Yenile',
    healthy: 'Sağlıklı',
    degraded: 'Düşük',
    down: 'Çevrimdışı',
    idle: 'Boşta',
    unknown: 'Bilinmiyor',
    overall: 'Genel durum',
    perAsset: 'Varlık bazında gönderim',
    noAsset: 'Son 24 saatte gönderim yok',
    gatewayError: '⚠️ Ağ geçidi hatası',
    telegramBlocked: '❌ Telegram engelledi',
  },
} as const;

function computeHealth(s: ChannelStat): Health {
  if (s.total === 0) return 'idle';
  if (s.sent === 0 && s.failed > 0) return 'down';
  if (s.failed > 0) return 'degraded';
  if (s.sent > 0) return 'healthy';
  return 'unknown';
}

function worst(a: Health, b: Health): Health {
  const order: Health[] = ['down', 'degraded', 'unknown', 'idle', 'healthy'];
  return order.indexOf(a) <= order.indexOf(b) ? a : b;
}

// Classify a 403 failure. A real Telegram 403 returns a JSON body with an
// `error_code` (e.g. bot blocked / not admin). A Lovable connector-gateway 403
// rejects the request before it reaches Telegram, so its body is empty (`{}`).
type ErrKind = 'gateway' | 'telegram' | null;
function classifyError(error: string | null): ErrKind {
  if (!error) return null;
  if (!/\b403\b/.test(error)) return null;
  // Real Telegram error bodies always include an error_code field.
  return /error_code/.test(error) ? 'telegram' : 'gateway';
}


const healthStyles: Record<Health, string> = {
  healthy: 'bg-success/15 text-success border-success/30',
  degraded: 'bg-warning/15 text-warning border-warning/30',
  down: 'bg-destructive/15 text-destructive border-destructive/30',
  idle: 'bg-muted/40 text-muted-foreground border-border/40',
  unknown: 'bg-muted/40 text-muted-foreground border-border/40',
};

export function TelegramHealthCard() {
  const { language } = useLanguage();
  const tl = L[language as keyof typeof L] ?? L.en;
  const { toast } = useToast();
  const rl = language === 'ku' ? {
    title: 'ناردنەوەی سیگنال',
    gold: '🥇 Gold',
    oil: '🛢️ Oil',
    btc: '₿ Bitcoin',
    success: 'سیگنال نێدرا بۆ چەنال',
    error: 'ناردن سەرکەوتوو نەبوو',
    sending: 'چاوەڕوان بە...',
  } : {
    title: 'Resend Signal',
    gold: '🥇 Gold',
    oil: '🛢️ Oil',
    btc: '₿ Bitcoin',
    success: 'Signal sent to channel',
    error: 'Send failed',
    sending: 'Sending...',
  };
  const [data, setData] = useState<HealthData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [resending, setResending] = useState<string | null>(null);

  const fmtTime = useCallback(
    (iso: string | null) => {
      if (!iso) return tl.none;
      const d = new Date(iso);
      const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
      const rel =
        diffMin < 1
          ? 'now'
          : diffMin < 60
          ? `${diffMin}m`
          : diffMin < 1440
          ? `${Math.round(diffMin / 60)}h`
          : `${Math.round(diffMin / 1440)}d`;
      return `${d.toLocaleString()} · ${rel}`;
    },
    [tl.none],
  );

  const fetchHealth = useCallback(async () => {
    setIsLoading(true);
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [logsRes, signalsRes] = await Promise.all([
        supabase
          .from('telegram_logs')
          .select('status, error, created_at, asset')
          .gte('created_at', since)
          .order('created_at', { ascending: false }),
        supabase
          .from('telegram_signals')
          .select('status, error, created_at')
          .gte('created_at', since)
          .order('created_at', { ascending: false }),
      ]);

      const build = (rows: { status: string | null; error: string | null; created_at: string }[] | null): ChannelStat => {
        const stat = emptyStat();
        (rows ?? []).forEach((r) => {
          stat.total += 1;
          if (r.status === 'sent') {
            stat.sent += 1;
            if (!stat.lastSentAt) stat.lastSentAt = r.created_at;
          } else if (r.status === 'failed') {
            stat.failed += 1;
            if (!stat.lastFailedAt) {
              stat.lastFailedAt = r.created_at;
              stat.lastError = r.error;
            }
          } else {
            stat.pending += 1;
          }
        });
        return stat;
      };

      // Per-asset breakdown (rows are already newest-first).
      const logRows = (logsRes.data ?? []) as {
        status: string | null;
        error: string | null;
        created_at: string;
        asset: string | null;
      }[];
      const byAsset: AssetStat[] = ASSET_META.map(({ key }) => {
        const a: AssetStat = {
          asset: key,
          sent: 0,
          failed: 0,
          pending: 0,
          lastSentAt: null,
          lastFailedAt: null,
          lastError: null,
        };
        logRows
          .filter((r) => (r.asset ?? '').toUpperCase() === key.toUpperCase())
          .forEach((r) => {
            if (r.status === 'sent') {
              a.sent += 1;
              if (!a.lastSentAt) a.lastSentAt = r.created_at;
            } else if (r.status === 'failed') {
              a.failed += 1;
              if (!a.lastFailedAt) {
                a.lastFailedAt = r.created_at;
                a.lastError = r.error;
              }
            } else {
              a.pending += 1;
            }
          });
        return a;
      }).filter((a) => a.sent + a.failed + a.pending > 0);

      setData({
        reports: build(logsRes.data as never),
        signals: build(signalsRes.data as never),
        byAsset,
      });
    } catch (e) {
      console.error('Error fetching telegram health:', e);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleResend = async (name: string) => {
    setResending(name);
    try {
      const { data: res, error } = await supabase.functions.invoke('market-intel', {
        body: { force: [name] },
      });
      if (error) throw error;
      if (res?.ok) {
        toast({ title: rl.success, description: `${name} · ${res.sent} sent · ${res.scheduled} scheduled` });
      } else {
        toast({ title: rl.error, description: String(res?.error ?? 'Unknown'), variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: rl.error, description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setResending(null);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const reportsHealth = data ? computeHealth(data.reports) : 'unknown';
  const signalsHealth = data ? computeHealth(data.signals) : 'unknown';
  const overall = data ? worst(reportsHealth, signalsHealth) : 'unknown';

  const StatBlock = ({ label, stat, health }: { label: string; stat: ChannelStat; health: Health }) => (
    <div className="rounded-xl bg-secondary/30 border border-border/40 p-3 flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-sm font-medium text-foreground truncate">{label}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${healthStyles[health]}`}>
          {tl[health]}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <div className="flex flex-col items-center rounded-lg bg-success/10 py-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          <span className="text-sm font-bold text-foreground">{stat.sent}</span>
          <span className="text-[9px] text-muted-foreground">{tl.sent}</span>
        </div>
        <div className="flex flex-col items-center rounded-lg bg-destructive/10 py-1.5">
          <XCircle className="h-3.5 w-3.5 text-destructive" />
          <span className="text-sm font-bold text-foreground">{stat.failed}</span>
          <span className="text-[9px] text-muted-foreground">{tl.failed}</span>
        </div>
        <div className="flex flex-col items-center rounded-lg bg-muted/40 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-bold text-foreground">{stat.pending}</span>
          <span className="text-[9px] text-muted-foreground">{tl.pending}</span>
        </div>
      </div>
      <div className="text-[11px] text-muted-foreground space-y-0.5">
        <p className="truncate">
          <span className="text-foreground/70">{tl.lastSent}:</span> {fmtTime(stat.lastSentAt)}
        </p>
        {stat.lastError && (
          <p className="truncate text-destructive/80" title={stat.lastError}>
            <span className="text-foreground/70">{tl.lastError}:</span> {stat.lastError}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-card/80 to-card/60 backdrop-blur-lg p-4 mb-6 shadow-lg">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
            <Send className="h-4.5 w-4.5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground truncate">{tl.title}</h2>
            <p className="text-[11px] text-muted-foreground truncate">{tl.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className={`hidden sm:inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border font-medium ${healthStyles[overall]}`}
          >
            <Activity className="h-3 w-3" />
            {tl[overall]}
          </span>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg" onClick={fetchHealth}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2.5">
        <StatBlock label={tl.reports} stat={data?.reports ?? emptyStat()} health={reportsHealth} />
        <StatBlock label={tl.signals} stat={data?.signals ?? emptyStat()} health={signalsHealth} />
      </div>

      <div className="mt-3 pt-3 border-t border-border/40">
        <p className="text-[11px] font-medium text-muted-foreground mb-2">{tl.perAsset}</p>
        {data && data.byAsset.length > 0 ? (
          <div className="space-y-1.5">
            {data.byAsset.map((a) => {
              const meta = ASSET_META.find((m) => m.key === a.asset);
              const stuck = a.failed > 0 && a.sent === 0;
              return (
                <div
                  key={a.asset}
                  className="rounded-lg bg-secondary/30 border border-border/40 px-2.5 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5 min-w-0">
                      <span>{meta?.emoji}</span>
                      <span className="truncate">{meta?.label ?? a.asset}</span>
                    </span>
                    <span className="flex items-center gap-2 text-[10px] flex-shrink-0">
                      <span className="inline-flex items-center gap-0.5 text-success">
                        <CheckCircle2 className="h-3 w-3" />
                        {a.sent}
                      </span>
                      <span
                        className={`inline-flex items-center gap-0.5 ${
                          a.failed > 0 ? 'text-destructive' : 'text-muted-foreground'
                        }`}
                      >
                        <XCircle className="h-3 w-3" />
                        {a.failed}
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                        <AlertTriangle className="h-3 w-3" />
                        {a.pending}
                      </span>
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate mt-1">
                    <span className="text-foreground/70">{tl.lastSent}:</span> {fmtTime(a.lastSentAt)}
                  </p>
                  {(stuck || a.lastError) && a.lastError && (
                    <p className="text-[10px] text-destructive/80 truncate mt-0.5" title={a.lastError}>
                      <span className="text-foreground/70">{tl.lastError}:</span> {a.lastError}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">{tl.noAsset}</p>
        )}
      </div>


      <div className="mt-3 pt-3 border-t border-border/40">
        <p className="text-[11px] font-medium text-muted-foreground mb-2">{rl.title}</p>
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'GOLD', label: rl.gold, cls: 'bg-gold/10 text-gold border-gold/30 hover:bg-gold/20' },
            { key: 'OIL', label: rl.oil, cls: 'bg-accent/10 text-accent border-accent/30 hover:bg-accent/20' },
            { key: 'BITCOIN', label: rl.btc, cls: 'bg-warning/10 text-warning border-warning/30 hover:bg-warning/20' },
          ].map((a) => (
            <Button
              key={a.key}
              variant="outline"
              size="sm"
              disabled={!!resending}
              onClick={() => handleResend(a.key)}
              className={`rounded-lg text-xs font-bold px-3 py-2 h-auto ${a.cls}`}
            >
              <Zap className={`h-3.5 w-3.5 mr-1.5 ${resending === a.key ? 'animate-pulse' : ''}`} />
              {resending === a.key ? rl.sending : a.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
