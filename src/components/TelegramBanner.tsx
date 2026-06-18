import { useState } from 'react';
import { X, Users } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { TelegramIcon } from '@/components/TelegramIcon';
import { TELEGRAM_BLUE, TELEGRAM_BLUE_DARK, openTelegramChannel } from '@/lib/telegram';
import { useTelegramSubscribers, formatSubs } from '@/hooks/useTelegramSubscribers';

const DISMISS_KEY = 'telegramBannerDismissed_v1';
const DISMISS_DAYS = 7;

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/** Promotional banner inviting users to join the Telegram channel. */
export function TelegramBanner() {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' || language === 'tr' ? en : ku);
  const subs = useTelegramSubscribers();
  const [hidden, setHidden] = useState(isDismissed);

  if (hidden) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    setHidden(true);
  };

  return (
    <div
      className="relative m-3 rounded-2xl p-4 overflow-hidden animate-fade-in"
      style={{
        background: `linear-gradient(135deg, ${TELEGRAM_BLUE}, ${TELEGRAM_BLUE_DARK})`,
        boxShadow: `0 8px 24px ${TELEGRAM_BLUE}44`,
      }}
    >
      {/* Dismiss */}
      <button
        onClick={dismiss}
        aria-label={bi('داخستن', 'Dismiss')}
        className="absolute top-2 end-2 p-1.5 rounded-full bg-black/20 text-white/90 hover:bg-black/30 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-2 text-white">
        <span className="flex items-center justify-center h-9 w-9 rounded-xl bg-white/20">
          <TelegramIcon size={22} />
        </span>
        <div>
          <div className="text-sm font-extrabold tracking-tight">📱 CTP TELEGRAM CHANNEL</div>
          {subs != null && (
            <div className="flex items-center gap-1 text-[11px] text-white/85 font-bold">
              <Users className="h-3 w-3" /> {formatSubs(subs)} {bi('بەشداربوو', 'subscribers')}
            </div>
          )}
        </div>
      </div>

      <p className="mt-2 text-[13px] text-white/95 font-semibold leading-snug">
        {bi('دەمەوێ سیگناڵی ڕاستەوخۆ بگری بۆ گۆلد، نەوت، BTC', 'Get live signals for Gold, Oil & BTC')}
      </p>

      <ul className="mt-2 space-y-1 text-[12px] text-white/95 font-semibold">
        <li>✅ {bi('سیگناڵی ڕاستەوخۆ', 'Live signals')}</li>
        <li>✅ {bi('هەواڵی گرنگ', 'Important news')}</li>
        <li>✅ {bi('ئاگاداری FOMC/NFP', 'FOMC/NFP alerts')}</li>
      </ul>

      <button
        onClick={openTelegramChannel}
        className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl bg-white py-2.5 font-extrabold text-sm active:scale-95 transition-transform"
        style={{ color: TELEGRAM_BLUE_DARK }}
      >
        🔔 {bi('بچۆ بۆ کەناڵ', 'Join Channel')}
      </button>
    </div>
  );
}
