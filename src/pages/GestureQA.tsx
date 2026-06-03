import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowLeft, Check, RotateCcw, Smartphone, Hand, ZoomIn, MoveVertical, MoveHorizontal,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

type OS = 'ios' | 'android';

interface CheckItem {
  id: string;
  icon: typeof Hand;
  ku: string;
  en: string;
  kuHint: string;
  enHint: string;
}

const CHECKS: CheckItem[] = [
  {
    id: 'vertical-scroll',
    icon: MoveVertical,
    ku: 'سواپی ستوونی (یەک پەنجە) → پەڕەکە دەشۆڕێتەوە',
    en: 'Vertical swipe (one finger) → the page scrolls',
    kuHint: 'پەنجەیەک بەسەر چارتەکەدا بەرز یان نزم بکەرەوە — دەبێ پەڕەکە بجووڵێت، نەک چارتەکە زووم ببێت.',
    enHint: 'Drag one finger up/down over the chart — the page should move, the chart must NOT zoom.',
  },
  {
    id: 'no-zoom-on-vertical',
    icon: ZoomIn,
    ku: 'سواپی ستوونی → چارتەکە هەرگیز زووم نابێت',
    en: 'Vertical swipe → the chart never zooms',
    kuHint: 'لە کاتی شۆڕبوونەوەدا نرخەکانی چارتەکە نابێ گەورە/بچووک ببنەوە.',
    enHint: 'While scrolling, the chart price scale must not stretch or shrink.',
  },
  {
    id: 'horizontal-pan',
    icon: MoveHorizontal,
    ku: 'سواپی ئاسۆیی (یەک پەنجە) → چارتەکە بە کاتدا دەجووڵێت',
    en: 'Horizontal swipe (one finger) → chart pans through time',
    kuHint: 'پەنجەیەک بەلای چەپ/راست بکێشە — مۆمەکان (candles) دەبێ بجووڵێن.',
    enHint: 'Drag one finger left/right — the candles should move.',
  },
  {
    id: 'pinch-zoom',
    icon: ZoomIn,
    ku: 'پینچ (دوو پەنجە) → چارتەکە زووم دەبێت',
    en: 'Pinch (two fingers) → chart zooms',
    kuHint: 'بە دوو پەنجە بیکەرەوە/کۆیبکەرەوە — تەنها ئەمە دەبێ زووم بکات.',
    enHint: 'Spread/close two fingers — only this should zoom.',
  },
  {
    id: 'price-axis-drag',
    icon: Hand,
    ku: 'کێشانی توێژی نرخ → پێوانەی نرخ دەگۆڕێت',
    en: 'Drag the price axis → price scale rescales',
    kuHint: 'لەسەر ژمارەکانی لای راست بەرەو سەرەوە/خوارەوە بیکێشە.',
    enHint: 'Drag up/down directly on the right-side numbers.',
  },
  {
    id: 'momentum',
    icon: Hand,
    ku: 'دوای سواپی خێرا → شۆڕبوونەوە بە نەرمی دەوەستێت',
    en: 'After a fast flick → scrolling settles smoothly',
    kuHint: 'سواپێکی خێرا بکە و بەریبدە — نابێ بپشێوێت یان بلیکێت.',
    enHint: 'Flick fast and release — it should not jitter or stutter.',
  },
];

const STORAGE_KEY = 'gesture-qa-checklist';

type ChartKind = 'crypto' | 'metals';

export default function GestureQA() {
  const { language, dir } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' ? en : ku);

  const [os, setOs] = useState<OS>(() => {
    if (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)) return 'android';
    return 'ios';
  });

  // Each chart (Crypto / Metals) gets its own independent checklist per OS.
  const [chart, setChart] = useState<ChartKind>('crypto');

  const keyFor = (o: OS, c: ChartKind) => `${STORAGE_KEY}-${o}-${c}`;

  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(keyFor(os, chart));
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // Reload saved state whenever the selected OS or chart changes.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(keyFor(os, chart));
      setChecked(raw ? JSON.parse(raw) : {});
    } catch {
      setChecked({});
    }
  }, [os, chart]);

  useEffect(() => {
    try {
      localStorage.setItem(keyFor(os, chart), JSON.stringify(checked));
    } catch {
      /* ignore */
    }
  }, [checked, os, chart]);

  const toggle = (id: string) => setChecked((c) => ({ ...c, [id]: !c[id] }));
  const reset = () => setChecked({});

  const doneCount = useMemo(() => CHECKS.filter((c) => checked[c.id]).length, [checked]);
  const allDone = doneCount === CHECKS.length;


  // Live gesture sandbox: a pinch-zoomable / pan box inside a scrollable page,
  // so the user can feel scroll-vs-zoom before testing the real chart.
  const zoneRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [lastGesture, setLastGesture] = useState<string>('');
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const dist = (t: TouchList) =>
    Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchStart.current = { dist: dist(e.touches as unknown as TouchList), scale };
    } else if (e.touches.length === 1) {
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStart.current) {
      e.preventDefault(); // only block default for a real two-finger pinch
      const d = dist(e.touches as unknown as TouchList);
      const next = Math.min(3, Math.max(0.5, (d / pinchStart.current.dist) * pinchStart.current.scale));
      setScale(next);
      setLastGesture(bi('پینچ → زووم', 'Pinch → zoom'));
    } else if (e.touches.length === 1 && touchStart.current) {
      const dx = e.touches[0].clientX - touchStart.current.x;
      const dy = e.touches[0].clientY - touchStart.current.y;
      if (Math.abs(dy) > Math.abs(dx)) {
        setLastGesture(bi('ستوونی → پەڕە دەشۆڕێت', 'Vertical → page scrolls'));
        // Do NOT preventDefault: let the page scroll vertically.
      } else {
        setLastGesture(bi('ئاسۆیی → پان', 'Horizontal → pan'));
      }
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchStart.current = null;
    if (e.touches.length === 0) touchStart.current = null;
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground" dir={dir}>
      <Helmet>
        <title>{bi('پشکنینی سواپ/پینچ', 'Swipe / Pinch QA')} — City Taxperts</title>
        <meta
          name="description"
          content={bi(
            'لیستی پشکنینی سواپ و پینچ بۆ iOS و Android بۆ دڵنیابوون لە شۆڕبوونەوە بەرامبەر زووم.',
            'iOS & Android swipe/pinch QA checklist to validate scroll vs zoom behavior.',
          )}
        />
        <link rel="canonical" href="/gesture-qa" />
      </Helmet>

      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Link
          to="/crypto"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={bi('گەڕانەوە', 'Back')}
        >
          <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
        </Link>
        <h1 className="flex-1 text-base font-bold">
          {bi('پشکنینی سواپ و پینچ', 'Swipe & Pinch QA')}
        </h1>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {bi('سڕینەوە', 'Reset')}
        </button>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-5 pb-24">
        {/* OS selector */}
        <div className="grid grid-cols-2 gap-2">
          {(['ios', 'android'] as OS[]).map((o) => {
            const active = os === o;
            return (
              <button
                key={o}
                onClick={() => setOs(o)}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-bold transition-colors ${
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <Smartphone className="h-4 w-4" />
                {o === 'ios' ? bi('ئەی ئۆ ئێس (iOS)', 'iOS') : bi('ئەندرۆید', 'Android')}
              </button>
            );
          })}
        </div>

        {/* Progress */}
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-bold">{bi('پێشکەوتن', 'Progress')}</span>
            <span className={`font-bold tabular-nums ${allDone ? 'text-[#0ecb81]' : 'text-muted-foreground'}`}>
              {doneCount}/{CHECKS.length}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${allDone ? 'bg-[#0ecb81]' : 'bg-primary'}`}
              style={{ width: `${(doneCount / CHECKS.length) * 100}%` }}
            />
          </div>
          {allDone && (
            <p className="mt-2 text-center text-xs font-bold text-[#0ecb81]">
              {bi('هەموو پشکنینەکان سەرکەوتوون ✓', 'All checks passed ✓')}
            </p>
          )}
        </div>

        {/* Live gesture sandbox */}
        <section className="rounded-lg border border-border bg-card p-3">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-bold">
            <Hand className="h-4 w-4 text-primary" />
            {bi('مەیدانی تاقیکردنەوەی زیندوو', 'Live gesture sandbox')}
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            {bi(
              'لێرە سواپ و پینچ بکە. سواپی ستوونی دەبێ پەڕەکە بشۆڕێنێتەوە، پینچ تەنها ئەم بۆکسە زووم دەکات.',
              'Swipe and pinch here. A vertical swipe should scroll the page; pinch zooms only this box.',
            )}
          </p>
          <div
            ref={zoneRef}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            className="relative flex h-40 select-none items-center justify-center overflow-hidden rounded-lg border border-dashed border-primary/40 bg-gradient-to-br from-primary/10 to-transparent"
            style={{ touchAction: 'pan-y' }}
          >
            <div
              className="rounded-lg bg-primary/20 px-6 py-4 text-center text-sm font-bold text-primary"
              style={{ transform: `scale(${scale})`, transition: pinchStart.current ? 'none' : 'transform 0.15s' }}
            >
              {bi('پینچ بۆ زووم', 'Pinch to zoom')}
              <div className="mt-1 text-xs tabular-nums opacity-80">{scale.toFixed(2)}×</div>
            </div>
            {lastGesture && (
              <span className="absolute bottom-2 start-2 rounded bg-background/80 px-2 py-1 text-[10px] font-bold text-foreground">
                {lastGesture}
              </span>
            )}
          </div>
        </section>

        {/* Checklist */}
        <section className="space-y-2">
          {CHECKS.map((item) => {
            const Icon = item.icon;
            const on = !!checked[item.id];
            return (
              <button
                key={item.id}
                onClick={() => toggle(item.id)}
                className={`flex w-full items-start gap-3 rounded-lg border p-3 text-start transition-colors ${
                  on ? 'border-[#0ecb81]/50 bg-[#0ecb81]/5' : 'border-border bg-card hover:bg-muted/50'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                    on ? 'border-[#0ecb81] bg-[#0ecb81] text-background' : 'border-muted-foreground/40'
                  }`}
                >
                  {on && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className="flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-bold">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {bi(item.ku, item.en)}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {bi(item.kuHint, item.enHint)}
                  </span>
                </span>
              </button>
            );
          })}
        </section>

        <Link
          to="/crypto"
          className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
        >
          {bi('بڕۆ بۆ چارتی ڕاستەقینە بۆ تاقیکردنەوە', 'Go to the real chart to test')}
        </Link>
      </main>
    </div>
  );
}
