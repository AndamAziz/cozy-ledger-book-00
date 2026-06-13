import { useLanguage } from '@/contexts/LanguageContext';
import { Gauge } from 'lucide-react';

export interface SentimentData {
  value: number | null;
  classification: string;
  available: boolean;
}

interface Props {
  sentiment: SentimentData;
  loading: boolean;
  /** Which asset the helper text refers to. Default: gold. */
  asset?: 'gold' | 'crypto';
}

function colorFor(v: number): string {
  if (v <= 25) return '#f6465d';      // extreme fear
  if (v <= 45) return '#f6a14d';      // fear
  if (v <= 55) return '#f0b90b';      // neutral
  if (v <= 75) return '#9ccc65';      // greed
  return '#0ecb81';                   // extreme greed
}

export function SentimentGauge({ sentiment, loading }: Props) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' || language === 'tr' ? en : ku);

  const v = sentiment.value ?? 0;
  const col = colorFor(v);

  const classKu = (c: string): string => {
    const m: Record<string, string> = {
      'Extreme Fear': 'ترسی زۆر',
      'Fear': 'ترس',
      'Neutral': 'ناوەند',
      'Greed': 'چاوبەستن',
      'Extreme Greed': 'چاوبەستنی زۆر',
    };
    return m[c] ?? c;
  };

  return (
    <div className="bg-[#0d1117] border border-[#1a1e2e] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Gauge className="h-4 w-4 text-[#f0b90b]" />
        <h3 className="text-sm font-bold text-white">{bi('هەستی بازار (ترس و چاوبەستن)', 'Market Sentiment (Fear & Greed)')}</h3>
      </div>

      {loading ? (
        <div className="h-16 animate-pulse bg-[#1a1e2e] rounded-lg" />
      ) : !sentiment.available ? (
        <p className="text-xs text-[#848e9c]">{bi('داتای هەست بەردەست نییە.', 'Sentiment data unavailable.')}</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="text-3xl font-bold tabular-nums" style={{ color: col }}>{v}</div>
            <div className="text-sm font-semibold" style={{ color: col }}>
              {language === 'en' || language === 'tr' ? sentiment.classification : classKu(sentiment.classification)}
            </div>
          </div>
          <div className="mt-3 h-2.5 rounded-full bg-gradient-to-r from-[#f6465d] via-[#f0b90b] to-[#0ecb81] relative">
            <div
              className="absolute -top-1 w-1.5 bg-white rounded-full shadow"
              style={{ left: `calc(${Math.min(100, Math.max(0, v))}% - 3px)`, height: '18px' }}
            />
          </div>
          <p className="mt-3 text-[11px] text-[#848e9c] leading-relaxed">
            {v <= 25
              ? bi('ترسی زۆر لە بازار — زۆرجار زێڕ وەک پەناگای سەلامەت بەرز دەبێتەوە.', 'Extreme fear — gold often rises as a safe haven.')
              : v >= 75
                ? bi('چاوبەستنی زۆر — مەترسی زیادە، وریابە لە گەڕانەوەی بازار.', 'Extreme greed — risk is high, watch for reversals.')
                : bi('هەستی بازار ناوەندە — ئاراستە ڕوون نییە.', 'Sentiment is mixed — no strong directional edge.')}
          </p>
        </>
      )}
    </div>
  );
}
