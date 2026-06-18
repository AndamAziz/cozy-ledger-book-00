// Shared Telegram channel promotion constants.
export const TELEGRAM_CHANNEL_URL = 'https://t.me/goldmarketai';
export const TELEGRAM_CHANNEL_HANDLE = '@goldmarketai';
export const TELEGRAM_BLUE = '#0088cc';
export const TELEGRAM_BLUE_DARK = '#0077b5';

export function openTelegramChannel() {
  window.open(TELEGRAM_CHANNEL_URL, '_blank', 'noopener,noreferrer');
}

/** Short link without the protocol, e.g. "t.me/goldmarketai". */
export function telegramShortLink(): string {
  return TELEGRAM_CHANNEL_URL.replace(/^https?:\/\//, '');
}

function fmtNum(n: number, decimals: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export interface SignalShareInput {
  emoji?: string;
  /** Display name, e.g. "GOLD" or "XAU/USD". */
  label: string;
  /** 'buy' | 'sell' | 'wait' | 'neutral' */
  action: string;
  entry?: number | null;
  tp?: number | null;
  decimals?: number;
}

/**
 * Builds the pre-written share message for a signal, e.g.:
 *   🥇 CTP GOLD Signal Alert!
 *   BUY @ $4,335 | TP: $4,360
 *   Free signals → t.me/goldmarketai
 */
export function buildSignalShareText(input: SignalShareInput): string {
  const { emoji = '📊', label, action, entry, tp, decimals = 2 } = input;
  const act = action.toUpperCase();
  const directional = action === 'buy' || action === 'sell';

  const lines = [`${emoji} CTP ${label} Signal Alert!`];

  if (directional && entry != null && Number.isFinite(entry)) {
    let l = `${act} @ $${fmtNum(entry, decimals)}`;
    if (tp != null && Number.isFinite(tp)) l += ` | TP: $${fmtNum(tp, decimals)}`;
    lines.push(l);
  } else {
    lines.push(`${act} signal`);
  }

  lines.push(`Free signals → ${telegramShortLink()}`);
  return lines.join('\n');
}

/** Default invite message used by the "Invite Friends" section. */
export function buildInviteText(): string {
  return [
    '📱 CTP — Kurdish Trading Signals',
    'دەمەوێ سیگناڵی ڕاستەوخۆ بۆ گۆلد، نەوت و BTC؟',
    'Free real-time Gold / Oil / BTC signals 👇',
    telegramShortLink(),
  ].join('\n');
}

/**
 * Shares text via the native share sheet when available, otherwise falls back
 * to Telegram's share dialog. Returns the method used.
 */
export async function shareText(
  text: string,
  url: string = TELEGRAM_CHANNEL_URL,
): Promise<'native' | 'telegram'> {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text, url });
      return 'native';
    } catch (err) {
      // User aborted the native sheet — don't fall back in that case.
      if (err instanceof DOMException && err.name === 'AbortError') return 'native';
    }
  }
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  window.open(shareUrl, '_blank', 'noopener,noreferrer');
  return 'telegram';
}

/** Copies text to the clipboard. Returns success. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
