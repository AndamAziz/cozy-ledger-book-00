import { TelegramIcon } from '@/components/TelegramIcon';
import { TELEGRAM_BLUE, openTelegramChannel } from '@/lib/telegram';

interface Props {
  /** Override the label text. */
  label?: string;
  className?: string;
}

/** Compact inline "get this on Telegram" call-to-action link. */
export function TelegramSignalCta({ label, className = '' }: Props) {
  return (
    <button
      onClick={openTelegramChannel}
      className={`w-full flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold active:scale-95 transition-transform ${className}`}
      style={{ backgroundColor: `${TELEGRAM_BLUE}1f`, color: TELEGRAM_BLUE }}
    >
      <TelegramIcon size={14} />
      {label ?? '📱 Get this signal on Telegram free'}
      <span aria-hidden>→</span>
    </button>
  );
}
