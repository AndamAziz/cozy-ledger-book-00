import { useEffect, useState } from 'react';
import { Download, X, Share } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'ctp-install-dismissed-at';
// Re-show after 7 days if dismissed (not installed)
const DISMISS_TTL = 7 * 24 * 60 * 60 * 1000;

type Lang = 'en' | 'ku' | 'ar' | 'fa' | 'tr';

const COPY: Record<Lang, {
  title: string;
  desc: string;
  install: string;
  later: string;
  iosTitle: string;
  iosStep1: string;
  iosStep2: string;
}> = {
  en: {
    title: 'Install the app',
    desc: 'Add to your home screen for a faster, full-screen app experience.',
    install: 'Install',
    later: 'Not now',
    iosTitle: 'Install on iPhone / iPad',
    iosStep1: 'Tap the Share button',
    iosStep2: 'Choose "Add to Home Screen"',
  },
  ku: {
    title: 'دامەزراندنی ئەپ',
    desc: 'بیخە سەر ڕووی سەرەکی بۆ ئەزموونێکی خێراتر و تەواو-شاشە وەک ئەپ.',
    install: 'دامەزراندن',
    later: 'ئێستا نا',
    iosTitle: 'دامەزراندن لەسەر ئایفۆن / ئایپاد',
    iosStep1: 'دوگمەی هاوبەشکردن (Share) لێبدە',
    iosStep2: 'هەڵبژێرە «زیادکردن بۆ ڕووی سەرەکی»',
  },
  ar: {
    title: 'تثبيت التطبيق',
    desc: 'أضِفه إلى الشاشة الرئيسية لتجربة أسرع وبملء الشاشة كتطبيق.',
    install: 'تثبيت',
    later: 'ليس الآن',
    iosTitle: 'التثبيت على iPhone / iPad',
    iosStep1: 'اضغط على زر المشاركة',
    iosStep2: 'اختر «إضافة إلى الشاشة الرئيسية»',
  },
  fa: {
    title: 'نصب اپلیکیشن',
    desc: 'به صفحه اصلی اضافه کنید تا تجربه‌ای سریع‌تر و تمام‌صفحه داشته باشید.',
    install: 'نصب',
    later: 'اکنون نه',
    iosTitle: 'نصب روی iPhone / iPad',
    iosStep1: 'دکمه اشتراک‌گذاری را بزنید',
    iosStep2: '«افزودن به صفحه اصلی» را انتخاب کنید',
  },
  tr: {
    title: 'Uygulamayı yükle',
    desc: 'Daha hızlı, tam ekran uygulama deneyimi için ana ekrana ekleyin.',
    install: 'Yükle',
    later: 'Şimdi değil',
    iosTitle: 'iPhone / iPad’e yükle',
    iosStep1: 'Paylaş düğmesine dokunun',
    iosStep2: '“Ana Ekrana Ekle”yi seçin',
  },
};

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua) ||
    // iPadOS reports as Mac with touch
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export default function InstallPrompt() {
  const { language, dir } = useLanguage();
  const t = COPY[(language as Lang)] ?? COPY.en;

  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isStandalone()) return; // already installed

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL) return;

    // Android / desktop Chromium
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };
    window.addEventListener('appinstalled', onInstalled);

    // iOS has no beforeinstallprompt — show manual instructions banner
    let iosTimer: ReturnType<typeof setTimeout> | undefined;
    if (isIos()) {
      iosTimer = setTimeout(() => setVisible(true), 1500);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    setShowIosHelp(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  const handleInstall = async () => {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'accepted') {
        setVisible(false);
      } else {
        dismiss();
      }
      setDeferred(null);
      return;
    }
    // iOS path: show instructions
    if (isIos()) {
      setShowIosHelp(true);
    }
  };

  if (!visible) return null;

  return (
    <div
      dir={dir}
      className="fixed inset-x-0 bottom-0 z-[100] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-4 duration-300"
    >
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card/95 backdrop-blur-md shadow-2xl">
        {!showIosHelp ? (
          <div className="flex items-center gap-3 p-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Download className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{t.title}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">{t.desc}</p>
            </div>
            <button
              onClick={handleInstall}
              className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              {t.install}
            </button>
            <button
              onClick={dismiss}
              aria-label={t.later}
              className="shrink-0 rounded-lg p-2 text-muted-foreground transition hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">{t.iosTitle}</p>
              <button
                onClick={dismiss}
                aria-label={t.later}
                className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">1</span>
                <span className="flex items-center gap-1">{t.iosStep1} <Share className="h-4 w-4 text-primary" /></span>
              </li>
              <li className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">2</span>
                <span>{t.iosStep2}</span>
              </li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
