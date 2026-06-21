// UI labels for the Quran section in all 5 app languages.
// Content (Arabic Quran text) is from the API; these are only UI chrome
// strings. Kurdish ('ku') is prioritized as a complete first-class set.
import type { Language } from '@/lib/translations';

export interface QuranStrings {
  title: string;
  subtitle: string;
  back: string;
  surahListTab: string;
  readingTab: string;
  searchPlaceholder: string;
  ayahs: string;
  meccan: string;
  medinan: string;
  continueReading: string;
  fontSize: string;
  bookmark: string;
  bookmarked: string;
  noResults: string;
  loading: string;
  errorTitle: string;
  retry: string;
  playSurah: string;
  pause: string;
  reciter: string;
  surah: string;
  ayah: string;
  bismillah: string;
  translationNote: string;
  showTranslation: string;
  hideTranslation: string;
  translationLabel: string;
  translationError: string;
}

export const QURAN_I18N: Record<Language, QuranStrings> = {
  ku: {
    title: 'قورئانی پیرۆز',
    subtitle: 'خوێندنەوەی قورئان بە دەنگی مشاری ئەلعەفاسی',
    back: 'گەڕانەوە',
    surahListTab: 'سورەتەکان',
    readingTab: 'خوێندنەوە',
    searchPlaceholder: 'گەڕان بە ناوی سورەت...',
    ayahs: 'ئایەت',
    meccan: 'مەککی',
    medinan: 'مەدەنی',
    continueReading: 'بەردەوامبوون لە خوێندنەوە',
    fontSize: 'قەبارەی نووسین',
    bookmark: 'نیشانکردن',
    bookmarked: 'نیشانکراوە',
    noResults: 'هیچ ئەنجامێک نەدۆزرایەوە',
    loading: 'بارکردن...',
    errorTitle: 'هەڵە لە بارکردنی داتا',
    retry: 'دووبارە هەوڵبدەوە',
    playSurah: 'لێدانی سورەت',
    pause: 'وەستان',
    reciter: 'قاری',
    surah: 'سورەت',
    ayah: 'ئایەت',
    bismillah: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
    translationNote: 'وەرگێڕانی کوردی: تەفسیری ئاسان — بورهان محمد ئەمین.',
    showTranslation: 'پیشاندانی وەرگێڕان',
    hideTranslation: 'شاردنەوەی وەرگێڕان',
    translationLabel: 'وەرگێڕانی کوردی',
    translationError: 'وەرگێڕان بار نەکرا',
  },
  en: {
    title: 'The Holy Quran',
    subtitle: 'Read the Quran with recitation by Mishary Alafasy',
    back: 'Back',
    surahListTab: 'Surahs',
    readingTab: 'Reading',
    searchPlaceholder: 'Search by surah name...',
    ayahs: 'ayahs',
    meccan: 'Meccan',
    medinan: 'Medinan',
    continueReading: 'Continue reading',
    fontSize: 'Font size',
    bookmark: 'Bookmark',
    bookmarked: 'Bookmarked',
    noResults: 'No results found',
    loading: 'Loading...',
    errorTitle: 'Failed to load data',
    retry: 'Try again',
    playSurah: 'Play surah',
    pause: 'Pause',
    reciter: 'Reciter',
    surah: 'Surah',
    ayah: 'Ayah',
    bismillah: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
    translationNote: 'Kurdish translation will be added later.',
  },
  ar: {
    title: 'القرآن الكريم',
    subtitle: 'اقرأ القرآن بصوت مشاري العفاسي',
    back: 'رجوع',
    surahListTab: 'السور',
    readingTab: 'القراءة',
    searchPlaceholder: 'ابحث باسم السورة...',
    ayahs: 'آية',
    meccan: 'مكية',
    medinan: 'مدنية',
    continueReading: 'متابعة القراءة',
    fontSize: 'حجم الخط',
    bookmark: 'إشارة مرجعية',
    bookmarked: 'محفوظة',
    noResults: 'لا توجد نتائج',
    loading: 'جارٍ التحميل...',
    errorTitle: 'فشل تحميل البيانات',
    retry: 'حاول مرة أخرى',
    playSurah: 'تشغيل السورة',
    pause: 'إيقاف',
    reciter: 'القارئ',
    surah: 'سورة',
    ayah: 'آية',
    bismillah: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
    translationNote: 'ستتم إضافة الترجمة الكردية لاحقًا.',
  },
  fa: {
    title: 'قرآن کریم',
    subtitle: 'قرآن را با صدای مشاری العفاسی بخوانید',
    back: 'بازگشت',
    surahListTab: 'سوره‌ها',
    readingTab: 'خواندن',
    searchPlaceholder: 'جستجو بر اساس نام سوره...',
    ayahs: 'آیه',
    meccan: 'مکی',
    medinan: 'مدنی',
    continueReading: 'ادامه خواندن',
    fontSize: 'اندازه قلم',
    bookmark: 'نشانک',
    bookmarked: 'ذخیره شد',
    noResults: 'نتیجه‌ای یافت نشد',
    loading: 'در حال بارگذاری...',
    errorTitle: 'بارگذاری داده‌ها ناموفق بود',
    retry: 'تلاش دوباره',
    playSurah: 'پخش سوره',
    pause: 'توقف',
    reciter: 'قاری',
    surah: 'سوره',
    ayah: 'آیه',
    bismillah: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
    translationNote: 'ترجمه کردی بعداً اضافه خواهد شد.',
  },
  tr: {
    title: 'Kur’an-ı Kerim',
    subtitle: 'Mishary Alafasy okuyuşuyla Kur’an okuyun',
    back: 'Geri',
    surahListTab: 'Sureler',
    readingTab: 'Okuma',
    searchPlaceholder: 'Sure adıyla ara...',
    ayahs: 'ayet',
    meccan: 'Mekki',
    medinan: 'Medeni',
    continueReading: 'Okumaya devam et',
    fontSize: 'Yazı boyutu',
    bookmark: 'Yer imi',
    bookmarked: 'Kaydedildi',
    noResults: 'Sonuç bulunamadı',
    loading: 'Yükleniyor...',
    errorTitle: 'Veriler yüklenemedi',
    retry: 'Tekrar dene',
    playSurah: 'Sureyi oynat',
    pause: 'Duraklat',
    reciter: 'Okuyucu',
    surah: 'Sure',
    ayah: 'Ayet',
    bismillah: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
    translationNote: 'Kürtçe çeviri daha sonra eklenecektir.',
  },
};
