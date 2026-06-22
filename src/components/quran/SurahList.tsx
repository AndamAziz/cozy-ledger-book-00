import { useMemo, useState } from 'react';
import { Search, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { SurahMeta } from '@/lib/quran';
import type { QuranStrings } from '@/lib/quranI18n';

interface SurahListProps {
  surahs: SurahMeta[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onSelect: (surah: SurahMeta) => void;
  s: QuranStrings;
}

// Normalize Arabic/Kurdish text so search matches regardless of diacritics
// (harakat), tatweel, or letter-shape variants (alef/hamza/ya/ta-marbuta).
function normalizeArabic(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '') // harakat, superscript alef, tatweel
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627') // أ إ آ ٱ -> ا
    .replace(/\u0649/g, '\u064A') // ى -> ي
    .replace(/\u0629/g, '\u0647') // ة -> ه
    .replace(/\u06CC/g, '\u064A') // Kurdish/Persian ی -> ي
    .replace(/\u06A9/g, '\u0643') // Kurdish/Persian ک -> ك
    .replace(/\s+/g, ' ')
    .trim();
}

export function SurahList({ surahs, isLoading, isError, onRetry, onSelect, s }: SurahListProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!surahs) return [];
    const raw = query.trim();
    if (!raw) return surahs;
    const q = raw.toLowerCase();
    const qArabic = normalizeArabic(raw);
    return surahs.filter(
      (su) =>
        su.englishName.toLowerCase().includes(q) ||
        su.englishNameTranslation.toLowerCase().includes(q) ||
        normalizeArabic(su.name).includes(qArabic) ||
        String(su.number) === q,
    );
  }, [surahs, query]);

  if (isError) {
    return (
      <div className="text-center py-16">
        <p className="text-destructive font-semibold mb-4">{s.errorTitle}</p>
        <Button onClick={onRetry} variant="outline" className="border-gold/50">
          {s.retry}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={s.searchPlaceholder}
          className="ps-9 bg-card border-border"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">{s.noResults}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {filtered.map((su) => (
            <button
              key={su.number}
              onClick={() => onSelect(su)}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card hover:border-gold/60 hover:shadow-md p-3 text-start transition-all active:scale-[0.99]"
            >
              <div className="relative flex-shrink-0 w-10 h-10 flex items-center justify-center">
                <div className="absolute inset-0 rotate-45 rounded-md border border-gold/50 group-hover:bg-gold/10 transition-colors" />
                <span className="relative text-sm font-bold text-primary">{su.number}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-foreground truncate">{su.englishName}</p>
                  <p className="quran-arabic text-lg text-primary" style={{ lineHeight: 1.2 }}>
                    {su.name.replace('سُورَةُ ', '')}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  <span>{su.revelationType === 'Meccan' ? s.meccan : s.medinan}</span>
                  <span aria-hidden>•</span>
                  <span>
                    {su.numberOfAyahs} {s.ayahs}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
