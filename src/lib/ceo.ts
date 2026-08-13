/**
 * The single owner/CEO account. The CEO account never has a subscription
 * lifecycle, so no expiry warning, expired-subscription screen, or renewal
 * prompt may ever be shown to it — on any session, any device, any route.
 */
export const CEO_ACCOUNT_EMAIL = 'andam@outlook.com';

export function isCeoEmail(email?: string | null): boolean {
  return !!email && email.trim().toLowerCase() === CEO_ACCOUNT_EMAIL;
}
