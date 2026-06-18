// Shared Telegram channel promotion constants.
export const TELEGRAM_CHANNEL_URL = 'https://t.me/goldmarketai';
export const TELEGRAM_CHANNEL_HANDLE = '@goldmarketai';
export const TELEGRAM_BLUE = '#0088cc';
export const TELEGRAM_BLUE_DARK = '#0077b5';

export function openTelegramChannel() {
  window.open(TELEGRAM_CHANNEL_URL, '_blank', 'noopener,noreferrer');
}
