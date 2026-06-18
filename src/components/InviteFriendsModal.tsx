import { useState } from 'react';
import { X, Share2, Copy, Check, Users } from 'lucide-react';
import { toast } from 'sonner';
import { TelegramIcon } from '@/components/TelegramIcon';
import {
  TELEGRAM_BLUE,
  TELEGRAM_CHANNEL_URL,
  telegramShortLink,
  buildInviteText,
  shareText,
  copyToClipboard,
} from '@/lib/telegram';
import { useTelegramSubscribers, formatSubs } from '@/hooks/useTelegramSubscribers';

interface Props {
  open: boolean;
  onClose: () => void;
  bi: (ku: string, en: string) => string;
}

const haptic = () => {
  try { navigator.vibrate?.(12); } catch { /* noop */ }
};

/** "Invite Friends" sheet: share + copy the channel link to grow the channel. */
export function InviteFriendsModal({ open, onClose, bi }: Props) {
  const subs = useTelegramSubscribers();
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const onShare = async () => {
    haptic();
    const method = await shareText(buildInviteText());
    if (method === 'telegram') {
      toast.success(bi('ئامادەیە بۆ هاوبەشکردن', 'Ready to share'));
    }
  };

  const onCopy = async () => {
    haptic();
    const ok = await copyToClipboard(TELEGRAM_CHANNEL_URL);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast.success(bi('لینک کۆپی کرا', 'Link copied'));
    } else {
      toast.error(bi('کۆپیکردن سەرکەوتوو نەبوو', 'Could not copy'));
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[80] animate-fade-in" onClick={onClose} />
      <div className="fixed bottom-0 inset-x-0 z-[90] bg-[#0d1117] border-t border-[#1a1e2e] rounded-t-3xl p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <span className="flex items-center gap-2 text-sm font-bold text-white">
            <TelegramIcon size={18} /> {bi('بانگهێشتی هاوڕێکان', 'Invite Friends')}
          </span>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[#848e9c] hover:text-white hover:bg-[#1a1e2e] active:scale-90 transition"
            aria-label={bi('داخستن', 'Close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className="rounded-2xl p-4 mb-4 text-center"
          style={{ background: `linear-gradient(135deg, ${TELEGRAM_BLUE}26, ${TELEGRAM_BLUE}0d)` }}
        >
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: `${TELEGRAM_BLUE}2e` }}>
            <TelegramIcon size={26} />
          </div>
          <div className="text-base font-extrabold text-white">{bi('چەناڵی CTP هاوبەش بکە', 'Share CTP Channel')}</div>
          <div className="text-xs text-[#c7cdd9] mt-1">{bi('یارمەتی هاوڕێکانت بدە باشتر ترەید بکەن!', 'Help your friends trade better!')}</div>

          {subs != null && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#0a0e17] px-3 py-1 text-[11px] font-bold text-[#c7cdd9]">
              <Users className="h-3.5 w-3.5" style={{ color: TELEGRAM_BLUE }} />
              {formatSubs(subs)} {bi('ئەندام', 'members')}
            </div>
          )}
        </div>

        <div className="mb-4 flex items-center justify-between gap-2 rounded-xl bg-[#0a0e17] border border-[#1a1e2e] px-3 py-2.5">
          <span className="truncate text-xs font-mono text-[#c7cdd9]">{telegramShortLink()}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onShare}
            className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white active:scale-95 transition-transform"
            style={{ backgroundColor: TELEGRAM_BLUE }}
          >
            <Share2 className="h-4 w-4" /> {bi('هاوبەشکردن', 'Share Link')}
          </button>
          <button
            onClick={onCopy}
            className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white bg-[#161b26] hover:bg-[#1f2533] active:scale-95 transition"
          >
            {copied ? <Check className="h-4 w-4 text-[#0ecb81]" /> : <Copy className="h-4 w-4" />}
            {copied ? bi('کۆپی کرا', 'Copied') : bi('کۆپی لینک', 'Copy Link')}
          </button>
        </div>
      </div>
    </>
  );
}
