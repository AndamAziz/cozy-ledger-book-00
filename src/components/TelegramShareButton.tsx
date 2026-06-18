import { useState } from 'react';
import { Share2, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  TELEGRAM_BLUE,
  buildSignalShareText,
  shareText,
  type SignalShareInput,
} from '@/lib/telegram';

interface Props extends SignalShareInput {
  /** Bilingual helper from the parent. */
  bi: (ku: string, en: string) => string;
  className?: string;
}

const haptic = () => {
  try { navigator.vibrate?.(12); } catch { /* noop */ }
};

/** Share button that broadcasts a pre-written signal message to grow the channel. */
export function TelegramShareButton({ bi, className = '', ...signal }: Props) {
  const [done, setDone] = useState(false);

  const onShare = async () => {
    haptic();
    const text = buildSignalShareText(signal);
    const method = await shareText(text);
    setDone(true);
    setTimeout(() => setDone(false), 1800);
    if (method === 'telegram') {
      toast.success(bi('سیگناڵ بۆ هاوبەشکردن ئامادەیە', 'Signal ready to share'));
    }
  };

  return (
    <button
      onClick={onShare}
      className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-3 text-xs font-bold active:scale-95 transition-transform ${className}`}
      style={{ backgroundColor: `${TELEGRAM_BLUE}1f`, color: TELEGRAM_BLUE }}
      aria-label={bi('هاوبەشکردنی سیگناڵ', 'Share signal')}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
      {bi('هاوبەشکردن', 'Share')}
    </button>
  );
}
