import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, MapPin, Moon, Sunrise, Sun, Sunset, CloudMoon, Clock, RefreshCw, Loader2, Info } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Language } from '@/lib/translations';
import { usePrayerTimes, PRAYER_ORDER, PrayerKey, CALC_METHODS } from '@/hooks/usePrayerTimes';
import { qiblaBearing, qiblaDistanceKm, magneticDeclination } from '@/lib/qibla';
import { QiblaCompass } from '@/components/prayer/QiblaCompass';
import {
  getStoredPrayerTz,
  setStoredPrayerTz,
  resolveTimezone,
  detectTimezone,
  listTimezones,
  nowMinutesInTz,
  tzShortLabel,
  AUTO_TZ,
} from '@/lib/prayerTz';

const PRAYER_ICONS: Record<PrayerKey, typeof Moon> = {
  Fajr: Moon,
  Sunrise: Sunrise,
  Dhuhr: Sun,
  Asr: Sun,
  Maghrib: Sunset,
  Isha: CloudMoon,
};

interface PageStrings {
  title: string;
  subtitle: string;
  prayers: Record<PrayerKey, string>;
  methods: Record<string, string>;
  next: string;
  remaining: string;
  hijri: string;
  source: (method: string) => string;
  methodLabel: string;
  // location
  locTitle: string;
  locDesc: string;
  allow: string;
  deniedTitle: string;
  deniedDesc: string;
  city: string;
  country: string;
  search: string;
  cityError: string;
  fetchError: string;
  loading: string;
  retry: string;
  back: string;
  gpsLocation: string;
  // qibla
  qiblaTitle: string;
  qiblaDesc: string;
  bearingFromNorth: (deg: number, point: string) => string;
  enableCompass: string;
  compassActive: string;
  compassNotSupported: string;
  pointPhone: string;
  distance: (km: string) => string;
  aligned: string;
  // compass accuracy / calibration
  accuracyLabel: string;
  accuracyGood: string;
  accuracyLow: string;
  accuracyUnstable: string;
  calibrationTip: string;
  // timezone
  tzLabel: string;
  tzAuto: (zone: string) => string;
}

const STR: Record<Language, PageStrings> = {
  en: {
    title: 'Prayer Times & Qibla',
    subtitle: 'Accurate daily prayer times and Qibla direction',
    prayers: { Fajr: 'Fajr', Sunrise: 'Sunrise', Dhuhr: 'Dhuhr', Asr: 'Asr', Maghrib: 'Maghrib', Isha: 'Isha' },
    methods: { mwl: 'Muslim World League', ummAlQura: 'Umm Al-Qura', isna: 'ISNA', egypt: 'Egyptian Authority', karachi: 'Karachi' },
    next: 'Next Prayer',
    remaining: 'remaining',
    hijri: 'Hijri',
    source: (m) => `Times from Aladhan API · ${m} method`,
    methodLabel: 'Calculation method',
    locTitle: 'Enable location',
    locDesc: 'To show accurate prayer times and Qibla direction for your area, we need your location.',
    allow: 'Allow location',
    deniedTitle: 'Location unavailable',
    deniedDesc: 'Location was denied. Enter your city manually instead.',
    city: 'City',
    country: 'Country',
    search: 'Search',
    cityError: 'City not found. Check the spelling and try again.',
    fetchError: 'Could not load prayer times. Please retry.',
    loading: 'Loading…',
    retry: 'Retry',
    back: 'Back',
    gpsLocation: 'Your location',
    qiblaTitle: 'Qibla Direction',
    qiblaDesc: 'Direction to the Kaaba in Mecca from your location.',
    bearingFromNorth: (d, p) => `Qibla is ${d}° from North (${p})`,
    enableCompass: 'Enable live compass',
    compassActive: 'Compass active',
    compassNotSupported: 'Live compass not available on this device — use the bearing above.',
    pointPhone: 'Turn your phone until the arrow points up',
    distance: (km) => `${km} km to Mecca`,
    aligned: 'Facing Qibla',
    accuracyLabel: 'Compass accuracy',
    accuracyGood: 'Good',
    accuracyLow: 'Low accuracy',
    accuracyUnstable: 'Needs calibration',
    calibrationTip: 'Heading is unstable. Move your phone in a figure-8 motion a few times, away from metal, magnets and electronics, to calibrate the compass.',
    tzLabel: 'Time zone',
    tzAuto: (z) => `Auto-detected (${z})`,
  },
  ku: {
    title: 'کاتەکانی نوێژ و قیبلە',
    subtitle: 'کاتی وردی نوێژی ڕۆژانە و ئاراستەی قیبلە',
    prayers: { Fajr: 'بەیانی', Sunrise: 'خۆرهەڵاتن', Dhuhr: 'نیوەڕۆ', Asr: 'عەسر', Maghrib: 'ئێوارە', Isha: 'عیشا' },
    methods: { mwl: 'کۆمەڵەی جیهانی ئیسلامی', ummAlQura: 'ئوم القورا', isna: 'ئیسنا', egypt: 'دەسەڵاتی میسر', karachi: 'کاراچی' },
    next: 'نوێژی داهاتوو',
    remaining: 'ماوە',
    hijri: 'کۆچی',
    source: (m) => `کاتەکان لە Aladhan API · شێوازی ${m}`,
    methodLabel: 'شێوازی ژماردن',
    locTitle: 'چالاککردنی شوێن',
    locDesc: 'بۆ پیشاندانی کاتی وردی نوێژ و ئاراستەی قیبلە بۆ ناوچەکەت، پێویستمان بە شوێنی تۆیە.',
    allow: 'ڕێگەدان بە شوێن',
    deniedTitle: 'شوێن بەردەست نییە',
    deniedDesc: 'ڕێگە بە شوێن نەدرا. لەجیاتی ئەوە شارەکەت بە دەستی بنووسە.',
    city: 'شار',
    country: 'وڵات',
    search: 'گەڕان',
    cityError: 'شار نەدۆزرایەوە. ڕێنووسەکە بپشکنە و دووبارە هەوڵ بدە.',
    fetchError: 'کاتەکانی نوێژ بارنەکرا. تکایە دووبارە هەوڵ بدە.',
    loading: 'بارکردن…',
    retry: 'دووبارە',
    back: 'گەڕانەوە',
    gpsLocation: 'شوێنی تۆ',
    qiblaTitle: 'ئاراستەی قیبلە',
    qiblaDesc: 'ئاراستە بەرەو کەعبە لە مەککە لە شوێنی تۆوە.',
    bearingFromNorth: (d, p) => `قیبلە ${d}° لە باکوورەوەیە (${p})`,
    enableCompass: 'چالاککردنی قیبلەنمای زیندوو',
    compassActive: 'قیبلەنما چالاکە',
    compassNotSupported: 'قیبلەنمای زیندوو لەسەر ئەم ئامێرە بەردەست نییە — ئاراستەی سەرەوە بەکاربهێنە.',
    pointPhone: 'مۆبایلەکەت بسووڕێنە تا تیرەکە بەرەو سەرەوە ئاماژە بکات',
    distance: (km) => `${km} کم بۆ مەککە`,
    aligned: 'ڕووەو قیبلە',
    accuracyLabel: 'وردی قیبلەنما',
    accuracyGood: 'باش',
    accuracyLow: 'وردی کەم',
    accuracyUnstable: 'پێویستی بە کالیبرەکردنە',
    calibrationTip: 'ئاراستەکە جێگیر نییە. مۆبایلەکەت چەند جارێک بە شێوەی ژمارەی ٨ بجووڵێنە، دوور لە ئاسن و موگناتیس و ئامێری ئەلیکترۆنی، بۆ کالیبرەکردنی قیبلەنما.',
    tzLabel: 'ناوچەی کات',
    tzAuto: (z) => `خۆکارانە دۆزرایەوە (${z})`,
  },
  ar: {
    title: 'أوقات الصلاة والقبلة',
    subtitle: 'أوقات صلاة يومية دقيقة واتجاه القبلة',
    prayers: { Fajr: 'الفجر', Sunrise: 'الشروق', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' },
    methods: { mwl: 'رابطة العالم الإسلامي', ummAlQura: 'أم القرى', isna: 'الجمعية الإسلامية لأمريكا الشمالية', egypt: 'الهيئة المصرية', karachi: 'كراتشي' },
    next: 'الصلاة القادمة',
    remaining: 'متبقٍ',
    hijri: 'هجري',
    source: (m) => `الأوقات من Aladhan API · طريقة ${m}`,
    methodLabel: 'طريقة الحساب',
    locTitle: 'تفعيل الموقع',
    locDesc: 'لعرض أوقات الصلاة واتجاه القبلة بدقة لمنطقتك، نحتاج إلى موقعك.',
    allow: 'السماح بالموقع',
    deniedTitle: 'الموقع غير متاح',
    deniedDesc: 'تم رفض الموقع. أدخل مدينتك يدوياً بدلاً من ذلك.',
    city: 'المدينة',
    country: 'الدولة',
    search: 'بحث',
    cityError: 'لم يتم العثور على المدينة. تحقق من الإملاء وحاول مجدداً.',
    fetchError: 'تعذّر تحميل أوقات الصلاة. يرجى إعادة المحاولة.',
    loading: 'جارٍ التحميل…',
    retry: 'إعادة',
    back: 'رجوع',
    gpsLocation: 'موقعك',
    qiblaTitle: 'اتجاه القبلة',
    qiblaDesc: 'الاتجاه نحو الكعبة في مكة من موقعك.',
    bearingFromNorth: (d, p) => `القبلة ${d}° من الشمال (${p})`,
    enableCompass: 'تفعيل البوصلة الحية',
    compassActive: 'البوصلة مفعّلة',
    compassNotSupported: 'البوصلة الحية غير متاحة على هذا الجهاز — استخدم الاتجاه أعلاه.',
    pointPhone: 'أدر هاتفك حتى يشير السهم للأعلى',
    distance: (km) => `${km} كم إلى مكة`,
    aligned: 'باتجاه القبلة',
    accuracyLabel: 'دقة البوصلة',
    accuracyGood: 'جيدة',
    accuracyLow: 'دقة منخفضة',
    accuracyUnstable: 'تحتاج إلى معايرة',
    calibrationTip: 'الاتجاه غير مستقر. حرّك هاتفك على شكل الرقم ٨ عدة مرات، بعيداً عن المعادن والمغناطيس والأجهزة الإلكترونية، لمعايرة البوصلة.',
    tzLabel: 'المنطقة الزمنية',
    tzAuto: (z) => `تم اكتشافها تلقائياً (${z})`,
  },
  fa: {
    title: 'اوقات نماز و قبله',
    subtitle: 'اوقات دقیق نماز روزانه و جهت قبله',
    prayers: { Fajr: 'فجر', Sunrise: 'طلوع آفتاب', Dhuhr: 'ظهر', Asr: 'عصر', Maghrib: 'مغرب', Isha: 'عشا' },
    methods: { mwl: 'اتحادیه جهانی اسلامی', ummAlQura: 'ام القری', isna: 'ایسنا', egypt: 'سازمان مصر', karachi: 'کراچی' },
    next: 'نماز بعدی',
    remaining: 'باقی‌مانده',
    hijri: 'هجری',
    source: (m) => `اوقات از Aladhan API · روش ${m}`,
    methodLabel: 'روش محاسبه',
    locTitle: 'فعال‌سازی موقعیت',
    locDesc: 'برای نمایش دقیق اوقات نماز و جهت قبله برای منطقه شما، به موقعیت شما نیاز داریم.',
    allow: 'اجازه موقعیت',
    deniedTitle: 'موقعیت در دسترس نیست',
    deniedDesc: 'موقعیت رد شد. در عوض شهر خود را دستی وارد کنید.',
    city: 'شهر',
    country: 'کشور',
    search: 'جستجو',
    cityError: 'شهر یافت نشد. املا را بررسی کرده و دوباره تلاش کنید.',
    fetchError: 'بارگیری اوقات نماز ممکن نشد. لطفاً دوباره تلاش کنید.',
    loading: 'در حال بارگیری…',
    retry: 'تلاش مجدد',
    back: 'بازگشت',
    gpsLocation: 'موقعیت شما',
    qiblaTitle: 'جهت قبله',
    qiblaDesc: 'جهت به سمت کعبه در مکه از موقعیت شما.',
    bearingFromNorth: (d, p) => `قبله ${d}° از شمال (${p})`,
    enableCompass: 'فعال‌سازی قطب‌نمای زنده',
    compassActive: 'قطب‌نما فعال است',
    compassNotSupported: 'قطب‌نمای زنده روی این دستگاه در دسترس نیست — از جهت بالا استفاده کنید.',
    pointPhone: 'گوشی را بچرخانید تا فلش رو به بالا قرار گیرد',
    distance: (km) => `${km} کیلومتر تا مکه`,
    aligned: 'رو به قبله',
    accuracyLabel: 'دقت قطب‌نما',
    accuracyGood: 'خوب',
    accuracyLow: 'دقت پایین',
    accuracyUnstable: 'نیاز به کالیبراسیون',
    calibrationTip: 'جهت ناپایدار است. گوشی را چند بار به شکل عدد ۸ حرکت دهید، دور از فلز، آهنربا و وسایل الکترونیکی، تا قطب‌نما کالیبره شود.',
    tzLabel: 'منطقه زمانی',
    tzAuto: (z) => `به‌طور خودکار شناسایی شد (${z})`,
  },
  tr: {
    title: 'Namaz Vakitleri ve Kıble',
    subtitle: 'Doğru günlük namaz vakitleri ve kıble yönü',
    prayers: { Fajr: 'İmsak', Sunrise: 'Güneş', Dhuhr: 'Öğle', Asr: 'İkindi', Maghrib: 'Akşam', Isha: 'Yatsı' },
    methods: { mwl: 'İslam Dünyası Birliği', ummAlQura: 'Umm Al-Qura', isna: 'ISNA', egypt: 'Mısır Kurumu', karachi: 'Karaçi' },
    next: 'Sonraki Namaz',
    remaining: 'kaldı',
    hijri: 'Hicri',
    source: (m) => `Vakitler Aladhan API · ${m} yöntemi`,
    methodLabel: 'Hesaplama yöntemi',
    locTitle: 'Konumu etkinleştir',
    locDesc: 'Bölgeniz için doğru namaz vakitleri ve kıble yönünü göstermek için konumunuza ihtiyacımız var.',
    allow: 'Konuma izin ver',
    deniedTitle: 'Konum kullanılamıyor',
    deniedDesc: 'Konum reddedildi. Bunun yerine şehrinizi elle girin.',
    city: 'Şehir',
    country: 'Ülke',
    search: 'Ara',
    cityError: 'Şehir bulunamadı. Yazımı kontrol edip tekrar deneyin.',
    fetchError: 'Namaz vakitleri yüklenemedi. Lütfen tekrar deneyin.',
    loading: 'Yükleniyor…',
    retry: 'Tekrar dene',
    back: 'Geri',
    gpsLocation: 'Konumunuz',
    qiblaTitle: 'Kıble Yönü',
    qiblaDesc: 'Konumunuzdan Mekke\'deki Kâbe\'ye yön.',
    bearingFromNorth: (d, p) => `Kıble Kuzeyden ${d}° (${p})`,
    enableCompass: 'Canlı pusulayı etkinleştir',
    compassActive: 'Pusula aktif',
    compassNotSupported: 'Bu cihazda canlı pusula yok — yukarıdaki yönü kullanın.',
    pointPhone: 'Ok yukarıyı gösterene kadar telefonu çevirin',
    distance: (km) => `Mekke\'ye ${km} km`,
    aligned: 'Kıbleye dönük',
    accuracyLabel: 'Pusula doğruluğu',
    accuracyGood: 'İyi',
    accuracyLow: 'Düşük doğruluk',
    accuracyUnstable: 'Kalibrasyon gerekli',
    calibrationTip: 'Yön kararsız. Pusulayı kalibre etmek için telefonunuzu metal, mıknatıs ve elektronik cihazlardan uzakta birkaç kez 8 şeklinde hareket ettirin.',
    tzLabel: 'Saat dilimi',
    tzAuto: (z) => `Otomatik algılandı (${z})`,
  },
};

const METHOD_STORAGE_KEY = 'prayer:method';

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Format a 24h "HH:MM" string as 12-hour time with AM/PM (e.g. "9:46 PM"). */
function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (!isFinite(h) || !isFinite(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export default function PrayerTimes() {
  const navigate = useNavigate();
  const { language, dir } = useLanguage();
  const s = STR[language] ?? STR.en;
  const BackIcon = dir === 'rtl' ? ArrowRight : ArrowLeft;

  const [method, setMethod] = useState<number>(() => {
    const v = Number(localStorage.getItem(METHOD_STORAGE_KEY));
    return CALC_METHODS.some((m) => m.id === v) ? v : 3;
  });
  useEffect(() => { localStorage.setItem(METHOD_STORAGE_KEY, String(method)); }, [method]);

  // Time zone: stored preference ('auto' or an IANA id) → resolved concrete zone.
  const [tzPref, setTzPref] = useState<string>(() => getStoredPrayerTz());
  useEffect(() => { setStoredPrayerTz(tzPref); }, [tzPref]);
  const resolvedTz = useMemo(() => resolveTimezone(tzPref), [tzPref]);
  const detectedTz = useMemo(() => detectTimezone(), []);
  const tzList = useMemo(() => listTimezones(), []);

  const { location, data, loading, permissionDenied, error, requestGps, setManualCity } = usePrayerTimes(method, resolvedTz);

  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [now, setNow] = useState(() => new Date());

  // tick every second for the countdown
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const methodName = useMemo(() => {
    const m = CALC_METHODS.find((x) => x.id === method);
    return m ? s.methods[m.key] : s.methods.mwl;
  }, [method, s]);

  // Determine next prayer + countdown
  const { nextKey, countdown } = useMemo(() => {
    if (!data) return { nextKey: null as PrayerKey | null, countdown: '' };
    const nowMin = nowMinutesInTz(resolvedTz, now);
    // Only the 5 obligatory prayers count for "next" (skip Sunrise as a prayer but keep it for highlight logic order)
    const order: PrayerKey[] = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
    let next: PrayerKey | null = null;
    for (const k of order) {
      if (toMinutes(data.timings[k]) > nowMin) { next = k; break; }
    }
    if (!next) next = 'Fajr'; // tomorrow's Fajr
    let diff = toMinutes(data.timings[next]) - nowMin;
    if (diff < 0) diff += 24 * 60;
    const h = Math.floor(diff / 60);
    const m = Math.floor(diff % 60);
    const sec = Math.floor((diff * 60) % 60);
    const cd = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return { nextKey: next, countdown: cd };
  }, [data, now, resolvedTz]);

  const qibla = location ? qiblaBearing(location.latitude, location.longitude) : 0;
  const distance = location ? qiblaDistanceKm(location.latitude, location.longitude) : 0;
  const declination = useMemo(
    () => (location ? magneticDeclination(location.latitude, location.longitude) : 0),
    [location]
  );

  const handleCity = (e: React.FormEvent) => {
    e.preventDefault();
    if (city.trim() && country.trim()) setManualCity(city.trim(), country.trim(), method);
  };

  return (
    <>
      <Helmet>
        <title>{s.title} — CITY TAXPERTS</title>
        <meta name="description" content={s.subtitle} />
      </Helmet>

      <div className="min-h-screen min-h-[100dvh] p-1.5 sm:p-3 md:p-6 safe-area-inset" dir={dir}>
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => navigate('/')}
              className="flex-shrink-0 w-10 h-10 rounded-xl bg-secondary/40 border border-white/10 flex items-center justify-center active:scale-95 transition-transform"
              aria-label={s.back}
            >
              <BackIcon className="h-5 w-5 text-foreground" />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-extrabold text-foreground truncate">🕌 {s.title}</h1>
              <p className="text-xs text-muted-foreground truncate">{s.subtitle}</p>
            </div>
          </div>

          {/* No location yet */}
          {!location && (
            <div className="rounded-2xl bg-gradient-to-br from-secondary/40 to-transparent border border-white/10 p-6 text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center mb-3">
                {loading ? <Loader2 className="h-6 w-6 text-primary-foreground animate-spin" /> : <MapPin className="h-6 w-6 text-primary-foreground" />}
              </div>
              <h2 className="font-bold text-foreground mb-1">{permissionDenied ? s.deniedTitle : s.locTitle}</h2>
              <p className="text-sm text-muted-foreground mb-4">{permissionDenied ? s.deniedDesc : s.locDesc}</p>

              {!permissionDenied ? (
                <button
                  onClick={requestGps}
                  disabled={loading}
                  className="rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground font-bold py-2.5 px-6 active:scale-95 transition-transform disabled:opacity-60"
                >
                  {s.allow}
                </button>
              ) : (
                <form onSubmit={handleCity} className="space-y-2 text-start">
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder={s.city}
                    className="w-full rounded-xl bg-background/60 border border-white/10 px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                  />
                  <input
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder={s.country}
                    className="w-full rounded-xl bg-background/60 border border-white/10 px-3 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                  />
                  <button
                    type="submit"
                    disabled={loading || !city.trim() || !country.trim()}
                    className="w-full rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground font-bold py-2.5 active:scale-95 transition-transform disabled:opacity-60"
                  >
                    {loading ? s.loading : s.search}
                  </button>
                  {error === 'city' && <p className="text-xs text-destructive">{s.cityError}</p>}
                </form>
              )}
            </div>
          )}

          {location && (
            <div className="space-y-4">
              {/* Next prayer card */}
              {data && nextKey && (
                <div className="rounded-2xl bg-gradient-to-br from-primary/25 via-primary/10 to-transparent border border-primary/30 p-4 sm:p-5 shadow-xl">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {s.next}</p>
                      <p className="text-2xl sm:text-3xl font-extrabold text-foreground mt-0.5">{s.prayers[nextKey]}</p>
                      <p className="text-sm text-primary font-semibold mt-0.5">{formatTime12(data.timings[nextKey])}</p>
                    </div>
                    <div className="text-end">
                      <p className="text-3xl sm:text-4xl font-extrabold text-gold tabular-nums">{countdown}</p>
                      <p className="text-xs text-muted-foreground">{s.remaining}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Prayer times list */}
              <div className="rounded-2xl bg-gradient-to-br from-secondary/40 via-secondary/20 to-transparent backdrop-blur-xl border border-white/10 p-4 sm:p-5 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">
                      <MapPin className="inline h-3.5 w-3.5 text-primary me-1" />
                      {location.label || s.gpsLocation}
                    </p>
                    {data && <p className="text-xs text-muted-foreground">{data.dateReadable} · {s.hijri} {data.hijri}</p>}
                  </div>
                  <button
                    onClick={() => location && requestGps()}
                    className="flex-shrink-0 w-9 h-9 rounded-lg bg-background/50 border border-white/10 flex items-center justify-center active:scale-95"
                    aria-label={s.retry}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <RefreshCw className="h-4 w-4 text-muted-foreground" />}
                  </button>
                </div>

                {error === 'fetch' && !data ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-destructive mb-3">{s.fetchError}</p>
                    <button onClick={requestGps} className="rounded-xl bg-primary/20 border border-primary/30 text-primary font-semibold px-4 py-2">{s.retry}</button>
                  </div>
                ) : !data ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : (
                  <div className="space-y-1.5">
                    {PRAYER_ORDER.map((k) => {
                      const Icon = PRAYER_ICONS[k];
                      const isNext = k === nextKey;
                      return (
                        <div
                          key={k}
                          className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors ${isNext ? 'bg-gradient-to-r from-gold/20 to-transparent border border-gold/30' : 'bg-background/30 border border-transparent'}`}
                        >
                          <span className="flex items-center gap-2.5">
                            <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${isNext ? 'bg-gradient-to-br from-gold to-amber-500 text-white' : 'bg-primary/15 text-primary'}`}>
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className={`font-semibold ${isNext ? 'text-gold' : 'text-foreground'}`}>{s.prayers[k]}</span>
                          </span>
                          <span className={`tabular-nums font-bold ${isNext ? 'text-gold' : 'text-foreground'}`}>{formatTime12(data.timings[k])}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Method selector + source citation */}
                <div className="mt-4 pt-3 border-t border-white/10">
                  <label className="text-xs text-muted-foreground block mb-1.5">{s.methodLabel}</label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(Number(e.target.value))}
                    className="w-full rounded-xl bg-background/60 border border-white/10 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50"
                  >
                    {CALC_METHODS.map((m) => (
                      <option key={m.id} value={m.id}>{s.methods[m.key]}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground mt-2 flex items-start gap-1.5">
                    <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    {s.source(methodName)}
                  </p>
                </div>
              </div>

              {/* Qibla compass */}
              <QiblaCompass
                bearing={qibla}
                distanceKm={distance}
                declination={declination}
                dir={dir}
                i18n={{
                  qiblaTitle: s.qiblaTitle,
                  qiblaDesc: s.qiblaDesc,
                  bearingFromNorth: s.bearingFromNorth,
                  enableCompass: s.enableCompass,
                  compassActive: s.compassActive,
                  compassNotSupported: s.compassNotSupported,
                  pointPhone: s.pointPhone,
                  distance: s.distance,
                  aligned: s.aligned,
                }}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
