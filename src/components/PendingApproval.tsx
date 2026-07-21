import { Button } from '@/components/ui/button';
import { Clock, Send, LogOut, Sparkles, Shield } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface PendingApprovalProps {
  email: string;
  onLogout: () => void;
}

export function PendingApproval({ email, onLogout }: PendingApprovalProps) {
  const { t, language } = useLanguage();
  
  const handleTelegramContact = () => {
    const messages = {
      ku: `سڵاو، من ${email} ئەکاونتم دروست کردووە لە Central Tech Platform ئەپ و داوای ئەپروڤکردن دەکەم.`,
      en: `Hello, I (${email}) have created an account on Central Tech Platform app and request approval.`,
      ar: `مرحباً، أنا ${email} أنشأت حساباً في تطبيق Central Tech Platform وأطلب الموافقة.`,
      fa: `سلام، من ${email} حسابی در اپلیکیشن Central Tech Platform ایجاد کردم و درخواست تأیید دارم.`,
    };
    try { navigator.clipboard.writeText(messages[language] ?? messages.en); } catch { /* noop */ }
    window.open('https://t.me/AndamAziz', '_blank');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-0 left-0 w-full h-full">
        <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-warning/20 blur-[100px] animate-pulse" />
        <div className="absolute bottom-20 right-10 w-80 h-80 rounded-full bg-primary/20 blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-info/10 blur-[120px]" />
      </div>

      {/* Floating elements */}
      <div className="absolute top-20 right-20 w-16 h-16 rounded-2xl bg-gradient-to-br from-warning/20 to-transparent border border-warning/20 flex items-center justify-center animate-bounce" style={{ animationDuration: '3s' }}>
        <span className="text-2xl">⏳</span>
      </div>
      <div className="absolute bottom-32 left-16 w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-transparent border border-primary/20 flex items-center justify-center animate-bounce" style={{ animationDuration: '4s', animationDelay: '0.5s' }}>
        <span className="text-xl">📱</span>
      </div>

      <div className="w-full max-w-md relative z-10 animate-scale-in">
        <div className="relative overflow-hidden rounded-3xl border border-warning/30 bg-card/60 backdrop-blur-2xl shadow-2xl shadow-warning/10">
          {/* Top gradient bar */}
          <div className="h-1.5 bg-gradient-to-l from-warning via-primary to-info" />
          
          <div className="p-8 md:p-10">
            {/* Waiting Animation */}
            <div className="text-center mb-8">
              <div className="relative inline-block mb-6">
                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-warning/20 to-warning/5 mx-auto flex items-center justify-center border-4 border-warning/30 shadow-2xl shadow-warning/20">
                  <div className="relative">
                    <Clock className="h-14 w-14 text-warning animate-pulse" />
                    <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-warning flex items-center justify-center animate-bounce">
                      <Sparkles className="h-3 w-3 text-warning-foreground" />
                    </div>
                  </div>
                </div>
                {/* Spinning ring */}
                <div className="absolute inset-0 w-28 h-28 mx-auto rounded-full border-4 border-transparent border-t-warning/50 animate-spin" style={{ animationDuration: '2s' }} />
              </div>

              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-l from-warning via-primary to-foreground bg-clip-text text-transparent mb-3">
                {t('welcome')} 🎉
              </h1>
              <p className="text-muted-foreground text-sm md:text-base mb-2">
                {t('accountCreatedSuccess')}
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/50 border border-border/50">
                <Shield className="h-4 w-4 text-primary" />
                <span className="text-sm text-foreground">{email}</span>
              </div>
            </div>

            {/* Waiting Message */}
            <div className="bg-warning/10 rounded-2xl p-6 mb-6 border border-warning/20 animate-pulse">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center flex-shrink-0 animate-bounce" style={{ animationDuration: '2s' }}>
                  <Clock className="h-6 w-6 text-warning" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-warning"></span>
                    </span>
                    {t('pendingApproval')}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t('accountPendingMessage')}
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
                {t('contactViaWhatsApp')}
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

        {/* Bottom decoration */}
        <div className="flex justify-center gap-2 mt-6">
          <div className="w-2 h-2 rounded-full bg-warning/50 animate-pulse" />
          <div className="w-2 h-2 rounded-full bg-primary/50 animate-pulse" style={{ animationDelay: '0.3s' }} />
          <div className="w-2 h-2 rounded-full bg-info/50 animate-pulse" style={{ animationDelay: '0.6s' }} />
        </div>
      </div>
    </div>
  );
}
