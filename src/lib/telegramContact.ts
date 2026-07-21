// Shared helper for building rich, per-reason Telegram contact messages.
// Each reason has its own tailored message in all 5 supported languages.

export const CEO_TELEGRAM_HANDLE = 'AndamAziz';
export const CEO_TELEGRAM_URL = `https://t.me/${CEO_TELEGRAM_HANDLE}`;
export const CEO_EMAIL = 'info@andam.uk';

export type ContactReason = 'pending' | 'deactivated' | 'expired' | 'expiring';
export type ContactLang = 'ku' | 'en' | 'ar' | 'fa' | 'tr';

interface BuildArgs {
  reason: ContactReason;
  language: string;
  email: string;
  /** For 'expired' — formatted expiry date string. */
  expiredDate?: string;
  /** For 'expiring' — days remaining until expiry. */
  daysUntilExpiry?: number;
}

function pickLang(language: string): ContactLang {
  return (['ku', 'en', 'ar', 'fa', 'tr'].includes(language) ? language : 'en') as ContactLang;
}

export function buildTelegramMessage({
  reason,
  language,
  email,
  expiredDate,
  daysUntilExpiry,
}: BuildArgs): string {
  const lang = pickLang(language);

  const templates: Record<ContactReason, Record<ContactLang, string>> = {
    // ────────────── Pending approval (new signup) ──────────────
    pending: {
      ku: `سڵاو CEO 👋\nمن ئەکاونتێکی نوێم دروست کردووە لە Central Tech Platform و داوای ئەپروڤکردن دەکەم.\n\n📧 ئیمەیل: ${email}\n📝 داواکاری: ئەپروڤکردنی ئەکاونت\n\nسوپاس 🙏`,
      en: `Hello CEO 👋\nI have just created a new account on Central Tech Platform and would like to request approval.\n\n📧 Email: ${email}\n📝 Request: Account approval\n\nThank you 🙏`,
      ar: `مرحباً CEO 👋\nلقد أنشأت حساباً جديداً في Central Tech Platform وأطلب الموافقة عليه.\n\n📧 البريد الإلكتروني: ${email}\n📝 الطلب: الموافقة على الحساب\n\nشكراً 🙏`,
      fa: `سلام CEO 👋\nحساب جدیدی در Central Tech Platform ایجاد کرده‌ام و درخواست تأیید آن را دارم.\n\n📧 ایمیل: ${email}\n📝 درخواست: تأیید حساب\n\nسپاس 🙏`,
      tr: `Merhaba CEO 👋\nCentral Tech Platform üzerinde yeni bir hesap oluşturdum ve onay talep ediyorum.\n\n📧 E-posta: ${email}\n📝 Talep: Hesap onayı\n\nTeşekkürler 🙏`,
    },

    // ────────────── Deactivated account ──────────────
    deactivated: {
      ku: `سڵاو CEO 👋\nئەکاونتەکەم ناچالاک کراوە و داوای چالاککردنەوەی دەکەم.\n\n📧 ئیمەیل: ${email}\n📝 داواکاری: چالاککردنەوەی ئەکاونت\n\nتکایە یارمەتیم بدە. سوپاس 🙏`,
      en: `Hello CEO 👋\nMy account has been deactivated and I would like it reactivated.\n\n📧 Email: ${email}\n📝 Request: Reactivate account\n\nPlease help. Thank you 🙏`,
      ar: `مرحباً CEO 👋\nتم تعطيل حسابي وأرغب في إعادة تفعيله.\n\n📧 البريد الإلكتروني: ${email}\n📝 الطلب: إعادة تفعيل الحساب\n\nيرجى المساعدة. شكراً 🙏`,
      fa: `سلام CEO 👋\nحساب من غیرفعال شده و درخواست فعال‌سازی مجدد آن را دارم.\n\n📧 ایمیل: ${email}\n📝 درخواست: فعال‌سازی مجدد حساب\n\nلطفاً کمک کنید. سپاس 🙏`,
      tr: `Merhaba CEO 👋\nHesabım devre dışı bırakıldı ve yeniden etkinleştirilmesini rica ediyorum.\n\n📧 E-posta: ${email}\n📝 Talep: Hesabı yeniden etkinleştir\n\nLütfen yardım edin. Teşekkürler 🙏`,
    },

    // ────────────── Expired subscription ──────────────
    expired: {
      ku: `سڵاو CEO 👋\nکاتی بەکارهێنانی ئەکاونتم بەسەرچووە و داوای نوێکردنەوەی دەکەم.\n\n📧 ئیمەیل: ${email}\n📅 بەرواری بەسەرچوون: ${expiredDate ?? '-'}\n📝 داواکاری: نوێکردنەوەی بەشداری\n\nتکایە ئەکاونتەکەم چالاک بکەرەوە. سوپاس 🙏`,
      en: `Hello CEO 👋\nMy account subscription has expired and I would like to renew it.\n\n📧 Email: ${email}\n📅 Expiry date: ${expiredDate ?? '-'}\n📝 Request: Renew subscription\n\nPlease reactivate my account. Thank you 🙏`,
      ar: `مرحباً CEO 👋\nانتهت صلاحية اشتراك حسابي وأرغب في تجديده.\n\n📧 البريد الإلكتروني: ${email}\n📅 تاريخ الانتهاء: ${expiredDate ?? '-'}\n📝 الطلب: تجديد الاشتراك\n\nيرجى إعادة تفعيل حسابي. شكراً 🙏`,
      fa: `سلام CEO 👋\nاشتراک حساب من منقضی شده و می‌خواهم آن را تمدید کنم.\n\n📧 ایمیل: ${email}\n📅 تاریخ انقضا: ${expiredDate ?? '-'}\n📝 درخواست: تمدید اشتراک\n\nلطفاً حساب من را دوباره فعال کنید. سپاس 🙏`,
      tr: `Merhaba CEO 👋\nHesap aboneliğimin süresi doldu ve yenilemek istiyorum.\n\n📧 E-posta: ${email}\n📅 Bitiş tarihi: ${expiredDate ?? '-'}\n📝 Talep: Aboneliği yenile\n\nLütfen hesabımı yeniden etkinleştirin. Teşekkürler 🙏`,
    },

    // ────────────── Expiring soon (warning banner) ──────────────
    expiring: {
      ku: `سڵاو CEO 👋\nکاتی بەکارهێنانی ئەکاونتم نزیکە لە بەسەرچوون و داوای درێژکردنەوەی دەکەم.\n\n📧 ئیمەیل: ${email}\n⏳ ماوە: ${daysUntilExpiry ?? '-'} ڕۆژ\n📝 داواکاری: درێژکردنەوەی بەشداری\n\nسوپاس 🙏`,
      en: `Hello CEO 👋\nMy account on Central Tech Platform is about to expire. I would like to renew it.\n\n📧 Email: ${email}\n⏳ Remaining: ${daysUntilExpiry ?? '-'} days\n📝 Request: Extend subscription\n\nThank you 🙏`,
      ar: `مرحباً CEO 👋\nاشتراك حسابي في Central Tech Platform على وشك الانتهاء. أرغب في تجديده.\n\n📧 البريد الإلكتروني: ${email}\n⏳ المتبقي: ${daysUntilExpiry ?? '-'} يوم\n📝 الطلب: تمديد الاشتراك\n\nشكراً 🙏`,
      fa: `سلام CEO 👋\nاشتراک حساب من در Central Tech Platform در حال انقضا است. درخواست تمدید دارم.\n\n📧 ایمیل: ${email}\n⏳ باقی‌مانده: ${daysUntilExpiry ?? '-'} روز\n📝 درخواست: تمدید اشتراک\n\nسپاس 🙏`,
      tr: `Merhaba CEO 👋\nCentral Tech Platform hesabımın aboneliği yakında sona eriyor, yenilemek istiyorum.\n\n📧 E-posta: ${email}\n⏳ Kalan: ${daysUntilExpiry ?? '-'} gün\n📝 Talep: Aboneliği uzat\n\nTeşekkürler 🙏`,
    },
  };

  return templates[reason][lang];
}

/** Copy message to clipboard (with legacy fallback) and open Telegram DM. */
export async function openTelegramWithMessage(message: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(message);
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = message;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch {
      /* noop */
    }
  }
  window.open(CEO_TELEGRAM_URL, '_blank');
}
