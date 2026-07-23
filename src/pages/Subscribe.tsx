import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Crown, Send, Mail, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useLanguage } from "@/contexts/LanguageContext";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { isPaymentsConfigured } from "@/lib/stripe";
import { CEO_TELEGRAM_HANDLE } from "@/lib/telegramContact";

const PRICE_ID = "ctp_pro_monthly";

const COPY = {
  en: {
    title: "Subscribe to CTP Pro",
    subtitle: "Unlock everything after your free trial",
    trial: "7 days free — no card required",
    price: "£7",
    per: "/ month",
    features: [
      "Full financial management (multi-currency)",
      "Inventory & sales tracking with PDF reports",
      "Live markets, signals & trading bots",
      "Prayer times, Quran, movies & sports live",
      "Priority support",
    ],
    subscribeBtn: "Subscribe with card",
    contactCeo: "Prefer manual renewal? Contact CEO on Telegram",
    back: "Back",
    successTitle: "Payment successful",
    successBody: "Your access has been extended. It may take a few seconds to appear.",
    goHome: "Go to app",
  },
  ku: {
    title: "بەشداربوون لە CTP Pro",
    subtitle: "دوای ٧ ڕۆژی فری، هەموو پلاتفۆرمەکە بکەرەوە",
    trial: "٧ ڕۆژ بەخۆڕایی — بەبێ کارت",
    price: "£٧",
    per: "/ مانگ",
    features: [
      "بەڕێوەبردنی دارایی بە دراوی جیاواز",
      "کۆگا و فرۆشتن + ڕاپۆرتی PDF",
      "بازاڕی زیندوو، سیگناڵ و بۆتی ترەید",
      "کاتەکانی نوێژ، قورئان، فیلم و سپۆرت زیندوو",
      "پشتگیری تایبەت",
    ],
    subscribeBtn: "بەشداربوون بە کارت",
    contactCeo: "دەتەوێت مانوێل نوێ بکەیتەوە؟ پەیوەندی بە CEO لە تەلەگرام",
    back: "گەڕانەوە",
    successTitle: "پارەدان سەرکەوتوو بوو",
    successBody: "دەستپێگەیشتنت درێژ کرایەوە. چەند چرکەیەک دەخایەنێت.",
    goHome: "چوونە پلاتفۆرم",
  },
  ar: {
    title: "اشترك في CTP Pro",
    subtitle: "افتح كل شيء بعد فترة التجربة المجانية",
    trial: "٧ أيام مجانًا — بدون بطاقة",
    price: "£7",
    per: "/ شهر",
    features: [
      "إدارة مالية بعملات متعددة",
      "المخزون والمبيعات مع تقارير PDF",
      "أسواق حية، إشارات وبوتات تداول",
      "أوقات الصلاة، القرآن، أفلام ورياضة مباشرة",
      "دعم أولوية",
    ],
    subscribeBtn: "اشترك بالبطاقة",
    contactCeo: "تفضل التجديد يدويًا؟ تواصل مع الـ CEO عبر تلغرام",
    back: "رجوع",
    successTitle: "تم الدفع بنجاح",
    successBody: "تم تمديد وصولك. قد يستغرق ظهوره بضع ثوانٍ.",
    goHome: "الذهاب للتطبيق",
  },
  fa: {
    title: "اشتراک CTP Pro",
    subtitle: "پس از ۷ روز رایگان، همه چیز را باز کنید",
    trial: "۷ روز رایگان — بدون کارت",
    price: "£۷",
    per: "/ ماه",
    features: [
      "مدیریت مالی چند ارزی",
      "انبار و فروش با گزارش PDF",
      "بازار زنده، سیگنال و ربات ترید",
      "اوقات نماز، قرآن، فیلم و ورزش زنده",
      "پشتیبانی ویژه",
    ],
    subscribeBtn: "اشتراک با کارت",
    contactCeo: "تمدید دستی؟ در تلگرام با CEO تماس بگیرید",
    back: "بازگشت",
    successTitle: "پرداخت موفق",
    successBody: "دسترسی شما تمدید شد. چند ثانیه صبر کنید.",
    goHome: "رفتن به برنامه",
  },
  tr: {
    title: "CTP Pro'ya abone ol",
    subtitle: "Ücretsiz denemeden sonra her şeyi aç",
    trial: "7 gün ücretsiz — kart gerekmez",
    price: "£7",
    per: "/ ay",
    features: [
      "Çoklu para birimi finans yönetimi",
      "PDF raporlu envanter ve satış",
      "Canlı piyasalar, sinyaller ve trade botları",
      "Namaz vakitleri, Kur'an, film ve spor",
      "Öncelikli destek",
    ],
    subscribeBtn: "Kart ile abone ol",
    contactCeo: "Manuel yenileme? Telegram'da CEO ile iletişime geç",
    back: "Geri",
    successTitle: "Ödeme başarılı",
    successBody: "Erişiminiz uzatıldı. Birkaç saniye içinde görünecek.",
    goHome: "Uygulamaya git",
  },
} as const;

export default function Subscribe() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { approvalStatus } = useUserRole(user);
  const { language } = useLanguage();
  const lang = (COPY as any)[language] ? language : "en";
  const t = (COPY as any)[lang] as typeof COPY.en;

  const [showCheckout, setShowCheckout] = useState(false);
  const isSuccess = params.get("status") === "success";
  const configured = isPaymentsConfigured();

  useEffect(() => {
    if (isSuccess) setShowCheckout(false);
  }, [isSuccess]);

  return (
    <>
      <Helmet>
        <title>{t.title} — CTP</title>
        <meta name="description" content="Subscribe to City Taxperts Pro for £7/month or contact the CEO for manual renewal." />
      </Helmet>

      <PaymentTestModeBanner />

      <main className="min-h-screen p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-4 gap-2"
          >
            <ArrowLeft className="h-4 w-4" /> {t.back}
          </Button>

          {isSuccess ? (
            <div className="rounded-3xl border border-success/30 bg-card/60 backdrop-blur-xl p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-success/20 mx-auto flex items-center justify-center mb-4">
                <Check className="h-8 w-8 text-success" />
              </div>
              <h1 className="text-2xl font-bold mb-2">{t.successTitle}</h1>
              <p className="text-muted-foreground mb-6">{t.successBody}</p>
              <Button onClick={() => navigate("/")} className="rounded-xl">{t.goHome}</Button>
            </div>
          ) : showCheckout && configured ? (
            <div className="rounded-3xl border border-border/40 bg-card/60 backdrop-blur-xl p-4 sm:p-6">
              <StripeEmbeddedCheckout
                priceId={PRICE_ID}
                customerEmail={user?.email}
                userId={user?.id}
              />
            </div>
          ) : (
            <div className="rounded-3xl border border-primary/30 bg-gradient-to-br from-card/80 via-card/60 to-transparent backdrop-blur-2xl shadow-2xl overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-primary via-gold to-accent" />
              <div className="p-6 sm:p-10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-gold flex items-center justify-center shadow-lg">
                    <Crown className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold">{t.title}</h1>
                    <p className="text-sm text-muted-foreground">{t.subtitle}</p>
                  </div>
                </div>

                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/15 border border-success/30 text-success text-xs sm:text-sm my-4">
                  <Sparkles className="h-3.5 w-3.5" />
                  {t.trial}
                </div>

                {approvalStatus?.expiresAt && !approvalStatus.isExpired && (
                  <p className="text-xs text-muted-foreground mb-4">
                    {new Date(approvalStatus.expiresAt).toLocaleDateString()}
                  </p>
                )}

                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-5xl font-bold bg-gradient-to-r from-primary to-gold bg-clip-text text-transparent">
                    {t.price}
                  </span>
                  <span className="text-muted-foreground">{t.per}</span>
                </div>

                <ul className="space-y-3 mb-8">
                  {t.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <div className="w-5 h-5 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check className="h-3 w-3 text-success" />
                      </div>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => setShowCheckout(true)}
                  disabled={!configured}
                  className="w-full py-6 text-base font-bold rounded-xl bg-gradient-to-r from-primary to-gold hover:opacity-90 transition-all"
                >
                  {t.subscribeBtn}
                </Button>

                <div className="mt-6 pt-6 border-t border-border/40 space-y-3">
                  <p className="text-xs text-center text-muted-foreground">{t.contactCeo}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <a
                      href={`https://t.me/${CEO_TELEGRAM_HANDLE}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#229ED9]/15 border border-[#229ED9]/30 hover:bg-[#229ED9]/25 transition-colors text-sm"
                    >
                      <Send className="h-4 w-4 text-[#229ED9]" />
                      Telegram
                    </a>
                    <a
                      href="mailto:info@andam.uk"
                      className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/15 border border-primary/30 hover:bg-primary/25 transition-colors text-sm"
                    >
                      <Mail className="h-4 w-4 text-primary" />
                      Email
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
