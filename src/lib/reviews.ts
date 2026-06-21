export type ReviewLang = 'ku' | 'en' | 'ar' | 'fa' | 'tr';

export interface Review {
  id: string;
  user_id?: string;
  reviewer_name: string;
  rating: number;
  comment: string;
  is_approved: boolean;
  created_at: string;
  updated_at?: string;
}

export const REVIEW_COMMENT_MIN = 10;
export const REVIEW_COMMENT_MAX = 500;
export const REVIEWS_PER_PAGE = 10;

/**
 * Remove any HTML tags / angle brackets to prevent stored XSS.
 * React escapes output on display, but we also sanitize before storing.
 */
export function sanitizeText(input: string): string {
  return input
    .replace(/<[^>]*>/g, '') // strip tags
    .replace(/[<>]/g, '') // strip stray angle brackets
    .replace(/\u0000/g, '') // strip null bytes
    .trim();
}

export function clampRating(rating: number): number {
  if (Number.isNaN(rating)) return 0;
  return Math.min(5, Math.max(1, Math.round(rating)));
}

const RELATIVE_STRINGS: Record<
  ReviewLang,
  {
    justNow: string;
    minute: (n: number) => string;
    hour: (n: number) => string;
    day: (n: number) => string;
    week: (n: number) => string;
    month: (n: number) => string;
    year: (n: number) => string;
  }
> = {
  en: {
    justNow: 'just now',
    minute: (n) => `${n} minute${n === 1 ? '' : 's'} ago`,
    hour: (n) => `${n} hour${n === 1 ? '' : 's'} ago`,
    day: (n) => `${n} day${n === 1 ? '' : 's'} ago`,
    week: (n) => `${n} week${n === 1 ? '' : 's'} ago`,
    month: (n) => `${n} month${n === 1 ? '' : 's'} ago`,
    year: (n) => `${n} year${n === 1 ? '' : 's'} ago`,
  },
  ku: {
    justNow: 'ئێستا',
    minute: (n) => `${n} خولەک لەمەوبەر`,
    hour: (n) => `${n} کاتژمێر لەمەوبەر`,
    day: (n) => `${n} ڕۆژ لەمەوبەر`,
    week: (n) => `${n} هەفتە لەمەوبەر`,
    month: (n) => `${n} مانگ لەمەوبەر`,
    year: (n) => `${n} ساڵ لەمەوبەر`,
  },
  ar: {
    justNow: 'الآن',
    minute: (n) => `قبل ${n} دقيقة`,
    hour: (n) => `قبل ${n} ساعة`,
    day: (n) => `قبل ${n} يوم`,
    week: (n) => `قبل ${n} أسبوع`,
    month: (n) => `قبل ${n} شهر`,
    year: (n) => `قبل ${n} سنة`,
  },
  fa: {
    justNow: 'هم‌اکنون',
    minute: (n) => `${n} دقیقه پیش`,
    hour: (n) => `${n} ساعت پیش`,
    day: (n) => `${n} روز پیش`,
    week: (n) => `${n} هفته پیش`,
    month: (n) => `${n} ماه پیش`,
    year: (n) => `${n} سال پیش`,
  },
  tr: {
    justNow: 'az önce',
    minute: (n) => `${n} dakika önce`,
    hour: (n) => `${n} saat önce`,
    day: (n) => `${n} gün önce`,
    week: (n) => `${n} hafta önce`,
    month: (n) => `${n} ay önce`,
    year: (n) => `${n} yıl önce`,
  },
};

export function relativeTime(dateStr: string, lang: ReviewLang = 'en'): string {
  const s = RELATIVE_STRINGS[lang] ?? RELATIVE_STRINGS.en;
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return s.justNow;
  const min = Math.floor(sec / 60);
  if (min < 60) return s.minute(min);
  const hr = Math.floor(min / 60);
  if (hr < 24) return s.hour(hr);
  const day = Math.floor(hr / 24);
  if (day < 7) return s.day(day);
  const week = Math.floor(day / 7);
  if (week < 5) return s.week(week);
  const month = Math.floor(day / 30);
  if (month < 12) return s.month(month);
  const year = Math.floor(day / 365);
  return s.year(year);
}

export interface ReviewsI18n {
  customerReviews: string;
  subtitle: string;
  basedOn: (n: number) => string;
  noReviews: string;
  beFirst: string;
  seeAll: string;
  writeReview: string;
  yourRating: string;
  yourReview: string;
  commentPlaceholder: string;
  submit: string;
  submitting: string;
  thankYou: string;
  pendingNote: string;
  loginRequired: string;
  tooShort: string;
  rateLimit: string;
  errorGeneric: string;
  selectRating: string;
  pending: string;
  approve: string;
  reject: string;
  pendingReviews: string;
  noPending: string;
  approved: string;
  rejected: string;
  allReviews: string;
  back: string;
  page: (cur: number, total: number) => string;
  prev: string;
  next: string;
}

export const REVIEWS_I18N: Record<ReviewLang, ReviewsI18n> = {
  en: {
    customerReviews: 'Customer Reviews',
    subtitle: 'What our users say',
    basedOn: (n) => `Based on ${n} review${n === 1 ? '' : 's'}`,
    noReviews: 'No reviews yet',
    beFirst: 'Be the first to share your experience',
    seeAll: 'See all reviews',
    writeReview: 'Write a Review',
    yourRating: 'Your rating',
    yourReview: 'Your review',
    commentPlaceholder: 'Share your experience with the platform...',
    submit: 'Submit Review',
    submitting: 'Submitting...',
    thankYou: 'Thank you! Your review is pending approval and will appear soon.',
    pendingNote: 'Your review is pending approval.',
    loginRequired: 'Please log in to submit a review.',
    tooShort: `Comment must be between ${REVIEW_COMMENT_MIN} and ${REVIEW_COMMENT_MAX} characters.`,
    rateLimit: 'You can only submit one review every 24 hours.',
    errorGeneric: 'Could not submit your review. Please try again.',
    selectRating: 'Please select a star rating.',
    pending: 'Pending',
    approve: 'Approve',
    reject: 'Reject',
    pendingReviews: 'Pending Reviews',
    noPending: 'No pending reviews.',
    approved: 'Review approved',
    rejected: 'Review rejected',
    allReviews: 'All Reviews',
    back: 'Back',
    page: (cur, total) => `Page ${cur} of ${total}`,
    prev: 'Previous',
    next: 'Next',
  },
  ku: {
    customerReviews: 'پێداچوونەوەی کڕیاران',
    subtitle: 'بەکارهێنەرانمان چی دەڵێن',
    basedOn: (n) => `لەسەر بنەمای ${n} پێداچوونەوە`,
    noReviews: 'هێشتا هیچ پێداچوونەوەیەک نییە',
    beFirst: 'یەکەم کەس بە بۆ هاوبەشکردنی ئەزموونت',
    seeAll: 'بینینی هەموو پێداچوونەوەکان',
    writeReview: 'نووسینی پێداچوونەوە',
    yourRating: 'هەڵسەنگاندنت',
    yourReview: 'پێداچوونەوەکەت',
    commentPlaceholder: 'ئەزموونت لەگەڵ پلاتفۆرمەکە هاوبەش بکە...',
    submit: 'ناردنی پێداچوونەوە',
    submitting: 'دەنێردرێت...',
    thankYou: 'سوپاس! پێداچوونەوەکەت چاوەڕێی پەسەندکردنە و بەم زووانە دەردەکەوێت.',
    pendingNote: 'پێداچوونەوەکەت چاوەڕێی پەسەندکردنە.',
    loginRequired: 'تکایە بچۆ ژوورەوە بۆ ناردنی پێداچوونەوە.',
    tooShort: `سەرنج دەبێت لە نێوان ${REVIEW_COMMENT_MIN} و ${REVIEW_COMMENT_MAX} پیت بێت.`,
    rateLimit: 'تەنها دەتوانیت هەر ٢٤ کاتژمێر جارێک پێداچوونەوە بنێریت.',
    errorGeneric: 'نەتوانرا پێداچوونەوەکەت بنێردرێت. تکایە دووبارە هەوڵبدەوە.',
    selectRating: 'تکایە هەڵسەنگاندنێک هەڵبژێرە.',
    pending: 'چاوەڕوان',
    approve: 'پەسەندکردن',
    reject: 'ڕەتکردنەوە',
    pendingReviews: 'پێداچوونەوە چاوەڕوانەکان',
    noPending: 'هیچ پێداچوونەوەیەکی چاوەڕوان نییە.',
    approved: 'پێداچوونەوە پەسەندکرا',
    rejected: 'پێداچوونەوە ڕەتکرایەوە',
    allReviews: 'هەموو پێداچوونەوەکان',
    back: 'گەڕانەوە',
    page: (cur, total) => `پەڕە ${cur} لە ${total}`,
    prev: 'پێشوو',
    next: 'دواتر',
  },
  ar: {
    customerReviews: 'آراء العملاء',
    subtitle: 'ماذا يقول مستخدمونا',
    basedOn: (n) => `بناءً على ${n} تقييم`,
    noReviews: 'لا توجد تقييمات بعد',
    beFirst: 'كن أول من يشارك تجربته',
    seeAll: 'عرض كل التقييمات',
    writeReview: 'اكتب تقييماً',
    yourRating: 'تقييمك',
    yourReview: 'مراجعتك',
    commentPlaceholder: 'شارك تجربتك مع المنصة...',
    submit: 'إرسال التقييم',
    submitting: 'جارٍ الإرسال...',
    thankYou: 'شكراً لك! تقييمك قيد المراجعة وسيظهر قريباً.',
    pendingNote: 'تقييمك قيد المراجعة.',
    loginRequired: 'يرجى تسجيل الدخول لإرسال تقييم.',
    tooShort: `يجب أن يكون التعليق بين ${REVIEW_COMMENT_MIN} و ${REVIEW_COMMENT_MAX} حرفاً.`,
    rateLimit: 'يمكنك إرسال تقييم واحد فقط كل 24 ساعة.',
    errorGeneric: 'تعذر إرسال تقييمك. يرجى المحاولة مرة أخرى.',
    selectRating: 'يرجى اختيار تقييم بالنجوم.',
    pending: 'قيد الانتظار',
    approve: 'موافقة',
    reject: 'رفض',
    pendingReviews: 'التقييمات المعلقة',
    noPending: 'لا توجد تقييمات معلقة.',
    approved: 'تمت الموافقة على التقييم',
    rejected: 'تم رفض التقييم',
    allReviews: 'جميع التقييمات',
    back: 'رجوع',
    page: (cur, total) => `الصفحة ${cur} من ${total}`,
    prev: 'السابق',
    next: 'التالي',
  },
  fa: {
    customerReviews: 'نظرات مشتریان',
    subtitle: 'کاربران ما چه می‌گویند',
    basedOn: (n) => `بر اساس ${n} نظر`,
    noReviews: 'هنوز نظری ثبت نشده است',
    beFirst: 'اولین نفری باشید که تجربه خود را به اشتراک می‌گذارد',
    seeAll: 'مشاهده همه نظرات',
    writeReview: 'نوشتن نظر',
    yourRating: 'امتیاز شما',
    yourReview: 'نظر شما',
    commentPlaceholder: 'تجربه خود را با پلتفرم به اشتراک بگذارید...',
    submit: 'ارسال نظر',
    submitting: 'در حال ارسال...',
    thankYou: 'متشکریم! نظر شما در انتظار تأیید است و به‌زودی نمایش داده می‌شود.',
    pendingNote: 'نظر شما در انتظار تأیید است.',
    loginRequired: 'برای ارسال نظر لطفاً وارد شوید.',
    tooShort: `نظر باید بین ${REVIEW_COMMENT_MIN} تا ${REVIEW_COMMENT_MAX} کاراکتر باشد.`,
    rateLimit: 'شما فقط می‌توانید هر ۲۴ ساعت یک نظر ارسال کنید.',
    errorGeneric: 'ارسال نظر ممکن نشد. لطفاً دوباره تلاش کنید.',
    selectRating: 'لطفاً امتیاز ستاره‌ای انتخاب کنید.',
    pending: 'در انتظار',
    approve: 'تأیید',
    reject: 'رد',
    pendingReviews: 'نظرات در انتظار',
    noPending: 'نظری در انتظار نیست.',
    approved: 'نظر تأیید شد',
    rejected: 'نظر رد شد',
    allReviews: 'همه نظرات',
    back: 'بازگشت',
    page: (cur, total) => `صفحه ${cur} از ${total}`,
    prev: 'قبلی',
    next: 'بعدی',
  },
  tr: {
    customerReviews: 'Müşteri Yorumları',
    subtitle: 'Kullanıcılarımız ne diyor',
    basedOn: (n) => `${n} yoruma göre`,
    noReviews: 'Henüz yorum yok',
    beFirst: 'Deneyimini paylaşan ilk kişi ol',
    seeAll: 'Tüm yorumları gör',
    writeReview: 'Yorum Yaz',
    yourRating: 'Puanınız',
    yourReview: 'Yorumunuz',
    commentPlaceholder: 'Platformla ilgili deneyiminizi paylaşın...',
    submit: 'Yorumu Gönder',
    submitting: 'Gönderiliyor...',
    thankYou: 'Teşekkürler! Yorumunuz onay bekliyor ve yakında görünecek.',
    pendingNote: 'Yorumunuz onay bekliyor.',
    loginRequired: 'Yorum göndermek için lütfen giriş yapın.',
    tooShort: `Yorum ${REVIEW_COMMENT_MIN} ile ${REVIEW_COMMENT_MAX} karakter arasında olmalıdır.`,
    rateLimit: '24 saatte yalnızca bir yorum gönderebilirsiniz.',
    errorGeneric: 'Yorumunuz gönderilemedi. Lütfen tekrar deneyin.',
    selectRating: 'Lütfen yıldız puanı seçin.',
    pending: 'Beklemede',
    approve: 'Onayla',
    reject: 'Reddet',
    pendingReviews: 'Bekleyen Yorumlar',
    noPending: 'Bekleyen yorum yok.',
    approved: 'Yorum onaylandı',
    rejected: 'Yorum reddedildi',
    allReviews: 'Tüm Yorumlar',
    back: 'Geri',
    page: (cur, total) => `Sayfa ${cur} / ${total}`,
    prev: 'Önceki',
    next: 'Sonraki',
  },
};

export function getReviewLang(language: string): ReviewLang {
  return (['ku', 'en', 'ar', 'fa', 'tr'].includes(language) ? language : 'en') as ReviewLang;
}
