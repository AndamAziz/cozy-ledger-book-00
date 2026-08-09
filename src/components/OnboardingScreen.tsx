import { useRef, useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { ReviewsShowcase } from '@/components/reviews/ReviewsShowcase';
import {
  Wallet,
  Film,
  Bitcoin,
  Coins,
  BrainCircuit,
  Globe,
  ChevronRight,
  ChevronLeft,
  type LucideIcon,
} from 'lucide-react';

interface OnboardingScreenProps {
  onComplete: () => void;
}

type Lang = 'ku' | 'en' | 'ar' | 'fa' | 'tr';

interface Feature {
  icon: LucideIcon;
  accent: string; // tailwind gradient classes
  glow: string;
  title: Record<Lang, string>;
  points: Record<Lang, string[]>;
}

const FEATURES: Feature[] = [
  {
    icon: Wallet,
    accent: 'from-primary to-success',
    glow: 'shadow-primary/40',
    title: {
      ku: 'بەڕێوەبردنی دارایی',
      en: 'Financial Management',
      ar: 'الإدارة المالية',
      fa: 'مدیریت مالی',
      tr: 'Finansal Yönetim',
    },
    points: {
      ku: [
        'داهات، خەرجی، فرۆشتن، کۆگا و ڕاپۆرتەکان بەدواداچوون بکە',
        'باڵانسی کارت و کاش و تۆمارەکانی داهاتی ڕۆژانە',
        'دروستکردن و داگرتنی ڕاپۆرتی مانگانە وەک PDF',
      ],
      en: [
        'Track income, expenses, sales, inventory, and reports',
        'Manage Card and Cash balances and daily income records',
        'Generate and download monthly financial reports as PDF',
      ],
      ar: [
        'تتبع الدخل والمصروفات والمبيعات والمخزون والتقارير',
        'إدارة أرصدة البطاقة والنقد وسجلات الدخل اليومية',
        'إنشاء وتنزيل التقارير المالية الشهرية بصيغة PDF',
      ],
      fa: [
        'پیگیری درآمد، هزینه‌ها، فروش، موجودی و گزارش‌ها',
        'مدیریت موجودی کارت و نقد و سوابق درآمد روزانه',
        'ساخت و دانلود گزارش‌های مالی ماهانه به صورت PDF',
      ],
      tr: [
        'Gelir, gider, satış, envanter ve raporları takip edin',
        'Kart ve Nakit bakiyeleri ile günlük gelir kayıtlarını yönetin',
        'Aylık finansal raporları PDF olarak oluşturup indirin',
      ],
    },
  },
  {
    icon: Film,
    accent: 'from-accent to-amber-400',
    glow: 'shadow-accent/40',
    title: {
      ku: 'فیلم و زنجیرە',
      en: 'Movies & TV Shows',
      ar: 'الأفلام والمسلسلات',
      fa: 'فیلم و سریال',
      tr: 'Filmler ve Diziler',
    },
    points: {
      ku: [
        'فیلم و زنجیرەی بەناوبانگ ببینە',
        'گەڕان بەدوای نوێترین بەرهەم، تۆپ ١٠ و وردەکاری هەر بەرهەمێک',
      ],
      en: [
        'Stream trending movies and TV series',
        'Browse latest releases, top 10 trending titles, and details for each title',
      ],
      ar: [
        'بث الأفلام والمسلسلات الرائجة',
        'تصفح أحدث الإصدارات وأفضل 10 عناوين رائجة وتفاصيل كل عنوان',
      ],
      fa: [
        'تماشای فیلم‌ها و سریال‌های پرطرفدار',
        'مرور جدیدترین‌ها، ۱۰ عنوان برتر و جزئیات هر عنوان',
      ],
      tr: [
        'Popüler filmleri ve dizileri izleyin',
        'Yeni çıkanları, en iyi 10 başlığı ve her başlığın detaylarını görün',
      ],
    },
  },
  {
    icon: Bitcoin,
    accent: 'from-warning to-accent',
    glow: 'shadow-warning/40',
    title: {
      ku: 'شوێنکەوتنی کریپتۆ (مەشقی دیمۆ)',
      en: 'Crypto Tracker (Demo Trading)',
      ar: 'متتبع العملات الرقمية (تداول تجريبي)',
      fa: 'ردیاب کریپتو (معامله دمو)',
      tr: 'Kripto Takibi (Demo İşlem)',
    },
    points: {
      ku: [
        'نرخی ڕاستەوخۆی بیتکۆین، ئیسیریەم، XRP و زیاتر',
        'مەشقی بازرگانی بە هەژماری دیمۆ',
        'ئاماژەی کڕین/فرۆشتن بۆ هەر دراوێک',
      ],
      en: [
        'Live cryptocurrency prices for Bitcoin, Ethereum, XRP, and more',
        'Practice trading with a demo account',
        'Buy/Sell signal indicators for each coin',
      ],
      ar: [
        'أسعار مباشرة للبيتكوين والإيثيريوم وXRP والمزيد',
        'تدرب على التداول بحساب تجريبي',
        'مؤشرات إشارات الشراء/البيع لكل عملة',
      ],
      fa: [
        'قیمت زنده بیت‌کوین، اتریوم، XRP و بیشتر',
        'تمرین معامله با حساب دمو',
        'نشانگرهای سیگنال خرید/فروش برای هر سکه',
      ],
      tr: [
        'Bitcoin, Ethereum, XRP ve daha fazlası için canlı fiyatlar',
        'Demo hesabıyla işlem pratiği yapın',
        'Her coin için Al/Sat sinyal göstergeleri',
      ],
    },
  },
  {
    icon: Coins,
    accent: 'from-gold to-amber-500',
    glow: 'shadow-amber-500/40',
    title: {
      ku: 'زێڕ، زیو و کاڵا',
      en: 'Gold, Silver & Commodities',
      ar: 'الذهب والفضة والسلع',
      fa: 'طلا، نقره و کالاها',
      tr: 'Altın, Gümüş ve Emtialar',
    },
    points: {
      ku: [
        'نرخی ڕاستەوخۆی زێڕ (XAU)، زیو (XAG)، پلاتین (XPT) و کاڵای تر',
        'ئاماژەی کڕین/فرۆشتن لەگەڵ ڕێژەی دڵنیایی',
      ],
      en: [
        'Live prices for Gold (XAU), Silver (XAG), Platinum (XPT), and other commodities',
        'Buy/Sell signal indicators with confidence percentage',
      ],
      ar: [
        'أسعار مباشرة للذهب (XAU) والفضة (XAG) والبلاتين (XPT) وسلع أخرى',
        'مؤشرات إشارات الشراء/البيع مع نسبة الثقة',
      ],
      fa: [
        'قیمت زنده طلا (XAU)، نقره (XAG)، پلاتین (XPT) و سایر کالاها',
        'نشانگرهای سیگنال خرید/فروش با درصد اطمینان',
      ],
      tr: [
        'Altın (XAU), Gümüş (XAG), Platin (XPT) ve diğer emtialar için canlı fiyatlar',
        'Güven yüzdesiyle birlikte Al/Sat sinyal göstergeleri',
      ],
    },
  },
  {
    icon: BrainCircuit,
    accent: 'from-info to-primary',
    glow: 'shadow-info/40',
    title: {
      ku: 'ئاماژەی بازرگانی AI',
      en: 'AI Trading Signals',
      ar: 'إشارات التداول بالذكاء الاصطناعي',
      fa: 'سیگنال‌های معاملاتی هوش مصنوعی',
      tr: 'AI Alım-Satım Sinyalleri',
    },
    points: {
      ku: [
        'ئاماژەی ڕاستەوخۆ بە کۆکردنەوەی شیکاری تەکنیکی + هەواڵ + کاتی بازاڕ، نوێبوونەوە هەر ٥ خولەک',
        'شیکاری ترێندی فرە-کاتی (M5, M15, M30, H1, H4, D1) بۆ زێڕ، بیتکۆین و جووتە فۆرێکسەکان',
        'هەر ئاماژەیەک نرخی چوونەژوورەوە، Stop Loss، Take Profit، ڕێژەی مەترسی/قازانج و ڕوونکردنەوەی هۆکار',
        'دۆخی ڕاستەوخۆی دانیشتنەکانی فۆرێکس (نیویۆرک، لەندەن، ئاسیا)',
      ],
      en: [
        'Live signals combining Technical analysis + News + Market session data, auto-updating every 5 minutes',
        'Multi-timeframe trend analysis (M5, M15, M30, H1, H4, D1) for Gold, Bitcoin, and Forex pairs',
        'Each signal includes Entry, Stop Loss, Take Profit, Risk/Reward ratio, and a plain-language explanation',
        'Real-time status of Forex market sessions (New York, London, Asian)',
      ],
      ar: [
        'إشارات مباشرة تجمع التحليل الفني + الأخبار + بيانات جلسات السوق، تتحدث كل 5 دقائق',
        'تحليل اتجاه متعدد الأطر (M5, M15, M30, H1, H4, D1) للذهب والبيتكوين وأزواج الفوركس',
        'كل إشارة تتضمن سعر الدخول ووقف الخسارة وجني الأرباح ونسبة المخاطرة/العائد وشرحًا مبسطًا',
        'الحالة الفورية لجلسات سوق الفوركس (نيويورك، لندن، آسيا)',
      ],
      fa: [
        'سیگنال‌های زنده با ترکیب تحلیل تکنیکال + اخبار + داده جلسات بازار، به‌روزرسانی هر ۵ دقیقه',
        'تحلیل روند چند تایم‌فریمی (M5, M15, M30, H1, H4, D1) برای طلا، بیت‌کوین و جفت‌های فارکس',
        'هر سیگنال شامل قیمت ورود، حد ضرر، حد سود، نسبت ریسک/بازده و توضیح ساده است',
        'وضعیت لحظه‌ای جلسات بازار فارکس (نیویورک، لندن، آسیا)',
      ],
      tr: [
        'Teknik analiz + Haberler + Piyasa seansı verilerini birleştiren, her 5 dakikada bir güncellenen canlı sinyaller',
        'Altın, Bitcoin ve Forex çiftleri için çoklu zaman dilimi trend analizi (M5, M15, M30, H1, H4, D1)',
        'Her sinyal Giriş, Stop Loss, Take Profit, Risk/Ödül oranı ve sade bir açıklama içerir',
        'Forex piyasa seanslarının gerçek zamanlı durumu (New York, Londra, Asya)',
      ],
    },
  },
  {
    icon: Globe,
    accent: 'from-success to-info',
    glow: 'shadow-success/40',
    title: {
      ku: 'تێڕوانینی بازاڕەکان',
      en: 'Markets Overview',
      ar: 'نظرة عامة على الأسواق',
      fa: 'نمای کلی بازارها',
      tr: 'Piyasalara Genel Bakış',
    },
    points: {
      ku: [
        'دراوە جیهانییەکان، کریپتۆ، زێڕ، نەوت و کاڵای تر لە یەک شوێندا بەدواداچوون بکە',
        'ئامرازی گۆڕینی دراو لەگەڵدایە',
      ],
      en: [
        'Track global currencies, crypto, gold, oil, and other commodities in one place',
        'Currency converter tool included',
      ],
      ar: [
        'تتبع العملات العالمية والعملات الرقمية والذهب والنفط والسلع في مكان واحد',
        'أداة تحويل العملات مضمّنة',
      ],
      fa: [
        'پیگیری ارزهای جهانی، کریپتو، طلا، نفت و سایر کالاها در یک مکان',
        'ابزار تبدیل ارز نیز موجود است',
      ],
      tr: [
        'Küresel para birimleri, kripto, altın, petrol ve diğer emtiaları tek yerde takip edin',
        'Döviz çevirici aracı dahildir',
      ],
    },
  },
];

const UI: Record<Lang, { welcome: string; subtitle: string; skip: string; next: string; getStarted: string }> = {
  ku: {
    welcome: 'بەخێربێیت بۆ Central Tech Platform',
    subtitle: 'هەموو ئامرازەکانت لە یەک شوێندا',
    skip: 'پەڕاندن',
    next: 'دواتر',
    getStarted: 'دەست پێبکە',
  },
  en: {
    welcome: 'Welcome to Central Tech Platform',
    subtitle: 'All your tools in one place',
    skip: 'Skip',
    next: 'Continue',
    getStarted: 'Get Started',
  },
  ar: {
    welcome: 'مرحبًا بك في Central Tech Platform',
    subtitle: 'كل أدواتك في مكان واحد',
    skip: 'تخطٍ',
    next: 'متابعة',
    getStarted: 'ابدأ الآن',
  },
  fa: {
    welcome: 'به Central Tech Platform خوش آمدید',
    subtitle: 'همه ابزارهای شما در یک مکان',
    skip: 'رد کردن',
    next: 'ادامه',
    getStarted: 'شروع کنید',
  },
  tr: {
    welcome: "Central Tech Platform'e Hoş Geldiniz",
    subtitle: 'Tüm araçlarınız tek yerde',
    skip: 'Atla',
    next: 'Devam',
    getStarted: 'Başla',
  },
};

export const OnboardingScreen = ({ onComplete }: OnboardingScreenProps) => {
  const { language, dir } = useLanguage();
  const lang = (['ku', 'en', 'ar', 'fa', 'tr'].includes(language) ? language : 'en') as Lang;
  const ui = UI[lang];
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const isLast = activeIndex >= FEATURES.length - 1;

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    // Scroll container is forced LTR, so scrollLeft is always standard/positive
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActiveIndex(Math.min(FEATURES.length - 1, Math.max(0, idx)));
  };

  const goTo = (index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const clamped = Math.min(FEATURES.length - 1, Math.max(0, index));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: 'smooth' });
  };

  const handleNext = () => {
    if (isLast) {
      onComplete();
      return;
    }
    const next = activeIndex + 1;
    setActiveIndex(next);
    goTo(next);
    // Bring the carousel back into view in case the page was scrolled down
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Keep active index in sync on resize
  useEffect(() => {
    const onResize = () => goTo(activeIndex);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  const NextIcon = dir === 'rtl' ? ChevronLeft : ChevronRight;

  return (
    <div className="relative min-h-screen min-h-[100dvh] flex flex-col overflow-x-hidden overflow-y-auto bg-gradient-to-br from-background via-background to-primary/5 safe-area-inset">
      {/* Decorative orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 -start-20 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute -bottom-24 -end-16 w-80 h-80 bg-accent/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '5s', animationDelay: '1s' }} />
      </div>

      {/* Top bar: logo + skip */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-5 sm:px-8 sm:pt-7">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-success flex items-center justify-center shadow-lg shadow-primary/30 overflow-hidden">
            <img src="/logo.png" alt="ANDAM logo" className="w-6 h-6 object-contain" />
          </div>
          <span className="font-bold text-sm text-foreground">Central Tech Platform</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onComplete}
          className="text-muted-foreground hover:text-foreground rounded-full"
        >
          {ui.skip}
        </Button>
      </div>

      {/* Header */}
      <div className="relative z-10 text-center px-6 pt-4 pb-2 sm:pt-6">
        <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-foreground via-foreground to-primary bg-clip-text text-transparent">
          {ui.welcome}
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">{ui.subtitle}</p>
      </div>

      {/* Swipeable feature cards (container forced LTR for reliable scroll math) */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        dir="ltr"
        className="relative z-10 flex min-h-[360px] flex-shrink-0 overflow-x-auto snap-x snap-mandatory no-scrollbar"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {FEATURES.map((feature, i) => {
          const Icon = feature.icon;
          return (
            <div
              key={i}
              dir={dir}
              className="snap-center shrink-0 w-full h-full flex items-center justify-center px-5 sm:px-8 py-4"
            >
              <div className="glass-card w-full max-w-md p-6 sm:p-8 animate-fade-in">
                <div
                  className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br ${feature.accent} flex items-center justify-center shadow-xl ${feature.glow} mb-5 mx-auto`}
                >
                  <Icon className="w-8 h-8 sm:w-10 sm:h-10 text-background" strokeWidth={2.2} />
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-foreground text-center mb-4">
                  {feature.title[lang]}
                </h2>
                <ul className="space-y-3">
                  {feature.points[lang].map((point, p) => (
                    <li key={p} className="flex items-start gap-2.5">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      <span className="text-sm text-muted-foreground leading-relaxed">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dots (forced LTR to match the carousel order) */}
      <div dir="ltr" className="relative z-10 flex items-center justify-center gap-2 py-4">
        {FEATURES.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={`h-2 rounded-full transition-all duration-300 ${
              i === activeIndex ? 'w-6 bg-primary' : 'w-2 bg-muted-foreground/30'
            }`}
          />
        ))}
      </div>

      {/* Customer reviews section */}
      <div className="relative z-10 px-5 sm:px-8 pb-2">
        <div className="max-w-md mx-auto w-full">
          <ReviewsShowcase limit={2} />
        </div>
      </div>

      {/* CTA */}
      <div className="relative z-10 px-5 pb-7 sm:px-8 sm:pb-9">
        <Button
          onClick={handleNext}
          className="btn-gradient-primary w-full h-12 sm:h-14 rounded-2xl text-base font-bold shadow-lg shadow-primary/30"
        >
          <span>{isLast ? ui.getStarted : ui.next}</span>
          {!isLast && <NextIcon className="w-5 h-5 ms-1" />}
        </Button>
      </div>
    </div>
  );
};
