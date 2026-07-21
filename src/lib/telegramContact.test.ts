import { describe, it, expect } from 'vitest';
import {
  buildTelegramMessage,
  CEO_TELEGRAM_HANDLE,
  CEO_EMAIL,
  type ContactReason,
  type ContactLang,
} from './telegramContact';

const LANGS: ContactLang[] = ['ku', 'en', 'ar', 'fa', 'tr'];
const REASONS: ContactReason[] = ['pending', 'deactivated', 'expired', 'expiring'];
const EMAIL = 'user@example.com';

// Distinctive keyword expected in each (reason, lang) template — proves the
// dialog previews the correct reason-specific body, not another reason's copy.
const KEYWORD: Record<ContactReason, Record<ContactLang, RegExp>> = {
  pending: {
    ku: /ئەپروڤکردنی ئەکاونت/,
    en: /Account approval/,
    ar: /الموافقة على الحساب/,
    fa: /تأیید حساب/,
    tr: /Hesap onayı/,
  },
  deactivated: {
    ku: /چالاککردنەوەی ئەکاونت/,
    en: /Reactivate account/,
    ar: /إعادة تفعيل الحساب/,
    fa: /فعال‌سازی مجدد حساب/,
    tr: /yeniden etkinleştir/i,
  },
  expired: {
    ku: /نوێکردنەوەی بەشداری/,
    en: /Renew subscription/,
    ar: /تجديد الاشتراك/,
    fa: /تمدید اشتراک/,
    tr: /Aboneliği yenile/,
  },
  expiring: {
    ku: /درێژکردنەوەی بەشداری/,
    en: /Extend subscription/,
    ar: /تمديد الاشتراك/,
    fa: /تمدید اشتراک/,
    tr: /Aboneliği uzat/,
  },
};

describe('buildTelegramMessage — per-reason previews', () => {
  for (const reason of REASONS) {
    for (const lang of LANGS) {
      it(`[${reason}/${lang}] includes email and reason-specific wording`, () => {
        const msg = buildTelegramMessage({
          reason,
          language: lang,
          email: EMAIL,
          expiredDate: '2026-01-15',
          daysUntilExpiry: 5,
        });
        expect(msg).toContain(EMAIL);
        expect(msg).toMatch(KEYWORD[reason][lang]);
        // Header greeting present in every template.
        expect(msg).toMatch(/CEO/);
      });
    }
  }

  it('pending message does NOT leak keywords from other reasons', () => {
    const msg = buildTelegramMessage({ reason: 'pending', language: 'en', email: EMAIL });
    expect(msg).not.toMatch(/Reactivate|Renew|Extend/);
  });

  it('deactivated message does NOT leak keywords from other reasons', () => {
    const msg = buildTelegramMessage({ reason: 'deactivated', language: 'en', email: EMAIL });
    expect(msg).not.toMatch(/approval|Renew|Extend/i);
  });

  it('expiring message includes remaining days and no expired date line', () => {
    const msg = buildTelegramMessage({
      reason: 'expiring',
      language: 'en',
      email: EMAIL,
      daysUntilExpiry: 7,
    });
    expect(msg).toContain('7 days');
    expect(msg).toContain('⏳');
    expect(msg).not.toContain('Expiry date');
  });

  it('expired message includes expiry date and no remaining-days line', () => {
    const msg = buildTelegramMessage({
      reason: 'expired',
      language: 'en',
      email: EMAIL,
      expiredDate: '2026-02-01',
    });
    expect(msg).toContain('2026-02-01');
    expect(msg).toContain('📅');
    expect(msg).not.toContain('Remaining');
  });

  it('expiring falls back to "-" when daysUntilExpiry is omitted', () => {
    const msg = buildTelegramMessage({ reason: 'expiring', language: 'en', email: EMAIL });
    expect(msg).toContain('- days');
  });

  it('expired falls back to "-" when expiredDate is omitted', () => {
    const msg = buildTelegramMessage({ reason: 'expired', language: 'en', email: EMAIL });
    expect(msg).toMatch(/Expiry date:\s*-/);
  });

  it('unknown language falls back to English', () => {
    const msg = buildTelegramMessage({
      reason: 'pending',
      language: 'xx',
      email: EMAIL,
    });
    expect(msg).toMatch(/Hello CEO/);
    expect(msg).toMatch(/Account approval/);
  });

  it('email is injected verbatim (no escaping / truncation)', () => {
    const weird = 'a.b+tag@sub.example.co.uk';
    const msg = buildTelegramMessage({ reason: 'pending', language: 'ku', email: weird });
    expect(msg).toContain(weird);
  });

  it('exports the correct Telegram handle and CEO email constants', () => {
    expect(CEO_TELEGRAM_HANDLE).toBe('AndamAziz');
    expect(CEO_EMAIL).toBe('info@andam.uk');
  });
});
