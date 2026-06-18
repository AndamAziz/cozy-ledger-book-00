import { TelegramIcon } from '@/components/TelegramIcon';
import { TELEGRAM_BLUE, openTelegramChannel } from '@/lib/telegram';
import { useTelegramSubscribers, formatSubs } from '@/hooks/useTelegramSubscribers';

interface Props {
  className?: string;
  /** Lower the button so it clears a bottom navigation bar. */
  aboveBottomNav?: boolean;
}

/** Floating Telegram button, fixed to the bottom-right of the screen. */
export function TelegramFloatingButton({ className = '', aboveBottomNav = true }: Props) {
  const subs = useTelegramSubscribers();
  return (
    <button
      onClick={openTelegramChannel}
      aria-label="Join our Telegram channel"
      title="Join our Telegram channel"
      className={`fixed end-4 z-[60] flex items-center gap-2 rounded-full pe-4 ps-3 py-2.5 text-white font-bold shadow-lg active:scale-95 transition-transform animate-fade-in ${
        aboveBottomNav ? 'bottom-20' : 'bottom-5'
      } ${className}`}
      style={{ backgroundColor: TELEGRAM_BLUE, boxShadow: `0 6px 20px ${TELEGRAM_BLUE}66` }}
    >
      <TelegramIcon size={20} />
      <span className="text-xs leading-none">
        {subs != null ? formatSubs(subs) : 'Telegram'}
      </span>
    </button>
  );
}
