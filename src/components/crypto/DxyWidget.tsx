import { useLanguage } from '@/contexts/LanguageContext';
import { DollarSign, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

export interface DxyData {
  price: number | null;
  changePct: number | null;
  available: boolean;
}

interface Props {
  dxy: DxyData;
  goldBias: 'bullish' | 'bearish' | 'neutral';
  loading: boolean;
  /** Which asset the bias text refers to. Default: gold. */
  asset?: 'gold' | 'crypto' | 'forex';
}

const C_UP = '#0ecb81';
const C_DOWN = '#f6465d';
const C_FLAT = '#f0b90b';

export function DxyWidget({ dxy, goldBias, loading, asset = 'gold' }: Props) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' || language === 'tr' ? en : ku);

  const up = (dxy.changePct ?? 0) > 0;
  const flat = !dxy.changePct;
  const dxyColor = flat ? C_FLAT : up ? C_UP : C_DOWN;
  const goldColor = goldBias === 'bullish' ? C_UP : goldBias === 'bearish' ? C_DOWN : C_FLAT;

  return (
    <div className="bg-[#0d1117] border border-[#1a1e2e] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <DollarSign className="h-4 w-4 text-[#2962ff]" />
        <h3 className="text-sm font-bold text-white">{bi('ئەندێکسی دۆلار (DXY)', 'Dollar Index (DXY)')}</h3>
      </div>

      {loading ? (
        <div className="h-12 animate-pulse bg-[#1a1e2e] rounded-lg" />
      ) : !dxy.available ? (
        <p className="text-xs text-[#848e9c]">{bi('داتای DXY بەردەست نییە.', 'DXY data unavailable.')}</p>
      ) : (
        <>
          <div className="flex items-end justify-between">
            <div className="text-2xl font-bold tabular-nums text-white">
              {dxy.price?.toFixed(3)}
            </div>
            <div className="flex items-center gap-1 text-sm font-bold" style={{ color: dxyColor }}>
              {flat ? <Minus className="h-4 w-4" /> : up ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
              {dxy.changePct! >= 0 ? '+' : ''}{dxy.changePct!.toFixed(2)}%
            </div>
          </div>
          <div className="mt-3 text-xs font-semibold rounded-lg px-3 py-2" style={{ color: goldColor, backgroundColor: goldColor + '14' }}>
            {asset === 'forex' ? (
              goldBias === 'bullish'
                ? bi('🟢 دۆلار بەهێز → USD/جووت بەرز دەبێت', '🟢 USD strong → USD pairs likely up')
                : goldBias === 'bearish'
                  ? bi('🔴 دۆلار لاواز → USD/جووت دادەبەزێت', '🔴 USD weak → USD pairs likely down')
                  : bi('🟠 دۆلار نزیکەی بێگۆڕانە → بێ ئاراستە', '🟠 USD roughly flat → no clear edge')
            ) : asset === 'crypto' ? (
              goldBias === 'bullish'
                ? bi('🟢 دۆلار نزم → پارەی ئازاد بۆ کریپتۆ (پاڵپشتی)', '🟢 USD down → risk-on, supports crypto')
                : goldBias === 'bearish'
                  ? bi('🔴 دۆلار بەرز → فشار لەسەر کریپتۆ (دادەبەزێت)', '🔴 USD up → risk-off, pressure on crypto')
                  : bi('🟠 دۆلار نزیکەی بێگۆڕانە → کریپتۆ بێ ئاراستە', '🟠 USD roughly flat → crypto undecided')
            ) : (
              goldBias === 'bullish'
                ? bi('🟢 دۆلار نزم → زێڕ پاڵپشتی (بەرز دەبێتەوە)', '🟢 USD down → gold supported (likely up)')
                : goldBias === 'bearish'
                  ? bi('🔴 دۆلار بەرز → فشار لەسەر زێڕ (دادەبەزێت)', '🔴 USD up → pressure on gold (likely down)')
                  : bi('🟠 دۆلار نزیکەی بێگۆڕانە → زێڕ بێ ئاراستە', '🟠 USD roughly flat → gold undecided')
            )}
          </div>
        </>
      )}
    </div>
  );
}
