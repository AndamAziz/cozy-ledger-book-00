import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, BookMarked } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { QURAN_I18N } from '@/lib/quranI18n';
import {
  useSurahList,
  useSurahDetail,
  useQuranFontSize,
  useQuranBookmarks,
  useLastRead,
} from '@/hooks/useQuran';
import type { SurahMeta } from '@/lib/quran';
import { SurahList } from '@/components/quran/SurahList';
import { SurahReader } from '@/components/quran/SurahReader';

const Quran = () => {
  const navigate = useNavigate();
  const { language, dir } = useLanguage();
  const s = QURAN_I18N[language] ?? QURAN_I18N.en;
  const isRTL = dir === 'rtl';
  const HomeIcon = isRTL ? ArrowRight : ArrowLeft;

  const [selected, setSelected] = useState<number | null>(null);

  const list = useSurahList();
  const detail = useSurahDetail(selected);
  const { fontSize, setFontSize, MIN_FONT, MAX_FONT } = useQuranFontSize();
  const { isBookmarked, toggleBookmark } = useQuranBookmarks();
  const { lastRead, saveLastRead } = useLastRead();

  // Persist last-read position whenever a surah opens.
  useEffect(() => {
    if (selected && detail.data) {
      saveLastRead({
        surah: detail.data.number,
        ayah: 1,
        surahName: detail.data.englishName,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, detail.data?.number]);

  const handleSelect = (su: SurahMeta) => {
    setSelected(su.number);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="quran-scope min-h-screen min-h-[100dvh]" dir={dir}>
      <Helmet>
        <title>{s.title} — City Taxperts</title>
        <meta name="description" content={s.subtitle} />
        <html lang={language} />
      </Helmet>

      <div className="max-w-3xl mx-auto p-3 sm:p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="text-foreground">
            <HomeIcon className="h-4 w-4 me-1" />
            {s.back}
          </Button>
          <div className="flex items-center gap-2 text-primary">
            <BookOpen className="h-5 w-5" />
            <span className="font-bold">{s.title}</span>
          </div>
        </div>

        {/* Title block */}
        {selected == null && (
          <div className="text-center mb-5">
            <h1 className="quran-arabic text-4xl text-primary mb-2" style={{ lineHeight: 1.5 }}>
              ٱلْقُرْآنُ ٱلْكَرِيمُ
            </h1>
            <p className="text-sm text-muted-foreground">{s.subtitle}</p>
            <div className="quran-divider rounded-full w-32 mx-auto mt-3" />
          </div>
        )}

        {/* Continue reading */}
        {selected == null && lastRead && (
          <button
            onClick={() => setSelected(lastRead.surah)}
            className="w-full mb-4 flex items-center gap-3 rounded-xl border border-gold/50 bg-gold/10 hover:bg-gold/20 p-3 text-start transition-colors"
          >
            <BookMarked className="h-5 w-5 text-gold flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{s.continueReading}</p>
              <p className="font-semibold text-foreground truncate">{lastRead.surahName}</p>
            </div>
          </button>
        )}

        {/* Content */}
        {selected == null ? (
          <SurahList
            surahs={list.data}
            isLoading={list.isLoading}
            isError={list.isError}
            onRetry={() => list.refetch()}
            onSelect={handleSelect}
            s={s}
          />
        ) : (
          <SurahReader
            surah={detail.data}
            isLoading={detail.isLoading}
            isError={detail.isError}
            onRetry={() => detail.refetch()}
            onBack={() => setSelected(null)}
            fontSize={fontSize}
            setFontSize={setFontSize}
            minFont={MIN_FONT}
            maxFont={MAX_FONT}
            isBookmarked={isBookmarked}
            toggleBookmark={toggleBookmark}
            isRTL={isRTL}
            s={s}
          />
        )}

        <p className="text-center text-[10px] text-muted-foreground mt-8">
          Source: alquran.cloud · Quran text (public domain) · Audio: Islamic Network CDN
        </p>
      </div>
    </div>
  );
};

export default Quran;
