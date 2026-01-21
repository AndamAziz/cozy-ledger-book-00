import { Button } from '@/components/ui/button';
import { Ban, MessageCircle, LogOut, Shield } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface DeactivatedAccountProps {
  email: string;
  onLogout: () => void;
}

export function DeactivatedAccount({ email, onLogout }: DeactivatedAccountProps) {
  const { t, language } = useLanguage();
  
  const handleWhatsAppContact = () => {
    const messages = {
      ku: `سڵاو، من ${email} هەژمارەکەم ناچالاک کراوە، تکایە چالاکی بکەرەوە.`,
      en: `Hello, my account (${email}) has been deactivated. Please reactivate it.`,
      ar: `مرحباً، تم تعطيل حسابي (${email})، يرجى إعادة تفعيله.`,
      fa: `سلام، حساب من (${email}) غیرفعال شده است. لطفاً آن را مجدداً فعال کنید.`,
    };
    const message = encodeURIComponent(messages[language]);
    window.open(`https://wa.me/447482828237?text=${message}`, '_blank');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-0 left-0 w-full h-full">
        <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-destructive/20 blur-[100px] animate-pulse" />
        <div className="absolute bottom-20 right-10 w-80 h-80 rounded-full bg-muted/20 blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Floating elements */}
      <div className="absolute top-20 right-20 w-16 h-16 rounded-2xl bg-gradient-to-br from-destructive/20 to-transparent border border-destructive/20 flex items-center justify-center animate-bounce" style={{ animationDuration: '3s' }}>
        <span className="text-2xl">🚫</span>
      </div>
      <div className="absolute bottom-32 left-16 w-14 h-14 rounded-xl bg-gradient-to-br from-muted/20 to-transparent border border-muted/20 flex items-center justify-center animate-bounce" style={{ animationDuration: '4s', animationDelay: '0.5s' }}>
        <span className="text-xl">📱</span>
      </div>

      <div className="w-full max-w-md relative z-10 animate-scale-in">
        <div className="relative overflow-hidden rounded-3xl border border-destructive/30 bg-card/60 backdrop-blur-2xl shadow-2xl shadow-destructive/10">
          {/* Top gradient bar */}
          <div className="h-1.5 bg-gradient-to-l from-destructive via-muted to-foreground" />
          
          <div className="p-8 md:p-10">
            {/* Deactivated Icon */}
            <div className="text-center mb-8">
              <div className="relative inline-block mb-6">
                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-destructive/20 to-destructive/5 mx-auto flex items-center justify-center border-4 border-destructive/30 shadow-2xl shadow-destructive/20">
                  <Ban className="h-14 w-14 text-destructive" />
                </div>
                {/* Pulsing ring */}
                <div className="absolute inset-0 w-28 h-28 mx-auto rounded-full border-4 border-destructive/30 animate-ping" style={{ animationDuration: '2s' }} />
              </div>

              <h1 className="text-2xl md:text-3xl font-bold text-destructive mb-3">
                {t('accountDeactivated')}
              </h1>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/50 border border-border/50">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-foreground">{email}</span>
              </div>
            </div>

            {/* Message */}
            <div className="bg-destructive/10 rounded-2xl p-6 mb-6 border border-destructive/20 animate-pulse">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-destructive/20 flex items-center justify-center flex-shrink-0">
                  <Ban className="h-6 w-6 text-destructive" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive"></span>
                    </span>
                    {t('accountDeactivatedTitle')}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t('accountDeactivatedMessage')}
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
          <div className="w-2 h-2 rounded-full bg-destructive/50 animate-pulse" />
          <div className="w-2 h-2 rounded-full bg-muted/50 animate-pulse" style={{ animationDelay: '0.3s' }} />
          <div className="w-2 h-2 rounded-full bg-foreground/30 animate-pulse" style={{ animationDelay: '0.6s' }} />
        </div>
      </div>
    </div>
  );
}
