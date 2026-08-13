import { describe, expect, it } from 'vitest';
import { CEO_ACCOUNT_EMAIL, isCeoEmail } from './ceo';

describe('isCeoEmail', () => {
  it('matches the CEO account regardless of case or padding', () => {
    expect(isCeoEmail(CEO_ACCOUNT_EMAIL)).toBe(true);
    expect(isCeoEmail('ANDAM@Outlook.com')).toBe(true);
    expect(isCeoEmail('  andam@outlook.com  ')).toBe(true);
  });

  it('does not match other accounts or empty values', () => {
    expect(isCeoEmail('someone@outlook.com')).toBe(false);
    expect(isCeoEmail('')).toBe(false);
    expect(isCeoEmail(null)).toBe(false);
    expect(isCeoEmail(undefined)).toBe(false);
  });
});
