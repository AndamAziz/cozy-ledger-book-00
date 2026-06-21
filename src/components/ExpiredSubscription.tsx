import { Button } from '@/components/ui/button';
import { AlertTriangle, MessageCircle, LogOut, Calendar, Shield, Send } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface ExpiredSubscriptionProps {
  email: string;
  expiresAt: Date;
  onLogout: () => void;
}

export function ExpiredSubscription({ email, expiresAt, onLogout }: ExpiredSubscriptionProps) {
  const { t, language } = useLanguage();
  
  const handleWhatsAppContact = () => {
    const messages = {
      ku: `سڵاو، کاتی بەکارهێنانی ئەکاونتم (${email}) لە Central Tech Platform ئەپ بەسەرچووە و داوای درێژکردنەوەی دەکەم.`,
      en: `Hello, my subscription for account (${email}) on Central Tech Platform app has expired. I request a renewal.`,
      ar: `مرحباً، انتهت صلاحية اشتراك حسابي (${email}) في تطبيق Central Tech Platform. أطلب التجديد.`,
      fa: `سلام، اشتراک حساب من (${email}) در اپلیکیشن Central Tech Platform منقضی شده است. درخواست تمدید دارم.`,
    };
    const message = encodeURIComponent(messages[language]);
    window.open(`https://wa.me/447482828237?text=${message}`, '_blank');
  };

  const localeMap = {
    ku: 'ku-Arab',
    en: 'en-US',
    ar: 'ar-SA',
    fa: 'fa-IR',
  };

  const expiredDate = new Date(expiresAt).toLocaleDateString(localeMap[language], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-0 left-0 w-full h-full">
        <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-destructive/20 blur-[100px] animate-pulse" />
        <div className="absolute bottom-20 right-10 w-80 h-80 rounded-full bg-warning/20 blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="w-full max-w-md relative z-10 animate-scale-in">
        <div className="relative overflow-hidden rounded-3xl border border-destructive/30 bg-card/60 backdrop-blur-2xl shadow-2xl shadow-destructive/10">
          {/* Top gradient bar */}
          <div className="h-1.5 bg-gradient-to-l from-destructive via-warning to-primary" />
          
          <div className="p-8 md:p-10">
            {/* Warning Icon */}
            <div className="text-center mb-8">
              <div className="relative inline-block mb-6">
                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-destructive/20 to-destructive/5 mx-auto flex items-center justify-center border-4 border-destructive/30 shadow-2xl shadow-destructive/20">
                  <AlertTriangle className="h-14 w-14 text-destructive animate-pulse" />
                </div>
              </div>

              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-l from-destructive via-warning to-foreground bg-clip-text text-transparent mb-3">
                {t('accountExpired')}
              </h1>
              
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/50 border border-border/50 mb-4">
                <Shield className="h-4 w-4 text-primary" />
                <span className="text-sm text-foreground">{email}</span>
              </div>
            </div>

            {/* Expired Message */}
            <div className="bg-destructive/10 rounded-2xl p-6 mb-6 border border-destructive/20">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-destructive/20 flex items-center justify-center flex-shrink-0">
                  <Calendar className="h-6 w-6 text-destructive" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-2">{t('expiryDate')}: {expiredDate}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t('accountExpiredMessage')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-3 bg-secondary/50 p-2 rounded-lg">
                    ⚠️ {t('dataPreserved')}
                  </p>
                </div>
              </div>
            </div>

            {/* WhatsApp Contact Button */}
            <Button 
              onClick={handleWhatsAppContact}
              className="w-full py-7 text-lg font-bold rounded-xl shadow-xl bg-[#25D366] hover:bg-[#20BD5A] text-white hover:scale-[1.02] transition-all duration-300 mb-4"
            >
              <div className="flex items-center gap-3">
                <MessageCircle className="h-6 w-6" />
                {t('contactForRenewalBtn')}
              </div>
            </Button>

            <p className="text-center text-xs text-muted-foreground mb-6">
              {t('phoneNumber')}: <span dir="ltr" className="font-mono">+44 7482 828 237</span>
            </p>

            {/* Logout Button */}
            <Button 
              variant="outline"
              onClick={onLogout}
              className="w-full py-5 rounded-xl border-border/50 hover:bg-secondary/50"
            >
              <div className="flex items-center gap-2">
                <LogOut className="h-4 w-4" />
                {t('logout')}
              </div>
            </Button>

            {/* Footer */}
            <div className="mt-8 pt-6 border-t border-border/30 text-center">
              <p className="text-xs text-muted-foreground">
                {t('adminEmail')}: andam@outlook.com
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
