import { AlertTriangle, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

interface ExpiryWarningBannerProps {
  daysUntilExpiry: number;
  email: string;
}

export function ExpiryWarningBanner({ daysUntilExpiry, email }: ExpiryWarningBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const { t, language } = useLanguage();

  if (isDismissed || daysUntilExpiry > 10) {
    return null;
  }

  const handleTelegramContact = () => {
    const messages = {
      ku: `سڵاو، کاتی بەکارهێنانی ئەکاونتم (${email}) لە Central Tech Platform ئەپ نزیکە لە بەسەرچوون و داوای درێژکردنەوەی دەکەم.`,
      en: `Hello, my subscription for account (${email}) on Central Tech Platform app is about to expire. I request a renewal.`,
      ar: `مرحباً، اشتراك حسابي (${email}) في تطبيق Central Tech Platform على وشك الانتهاء. أطلب التجديد.`,
      fa: `سلام، اشتراک حساب من (${email}) در اپلیکیشن Central Tech Platform در حال انقضا است. درخواست تمدید دارم.`,
    };
    try { navigator.clipboard.writeText(messages[language] ?? messages.en); } catch { /* noop */ }
    window.open('https://t.me/AndamAziz', '_blank');
  };

  const urgencyLevel = daysUntilExpiry <= 3 ? 'critical' : daysUntilExpiry <= 7 ? 'warning' : 'info';
  
  const bgColor = {
    critical: 'bg-destructive/15 border-destructive/30',
    warning: 'bg-warning/15 border-warning/30',
    info: 'bg-info/15 border-info/30',
  }[urgencyLevel];

  const iconColor = {
    critical: 'text-destructive',
    warning: 'text-warning',
    info: 'text-info',
  }[urgencyLevel];

  return (
    <div className={`relative rounded-xl border p-4 mb-4 animate-fade-in ${bgColor}`}>
      <button
        onClick={() => setIsDismissed(true)}
        className="absolute top-2 left-2 p-1 rounded-full hover:bg-secondary/50 transition-colors"
      >
        <X className="h-4 w-4 text-muted-foreground" />
      </button>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pr-6">
        <div className={`flex-shrink-0 w-12 h-12 rounded-full bg-background/50 flex items-center justify-center ${iconColor}`}>
          <AlertTriangle className="h-6 w-6 animate-pulse" />
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-foreground mb-1">
            {daysUntilExpiry === 1 
              ? `⚠️ ${t('expiryTomorrow')}` 
              : `${daysUntilExpiry} ${t('expiryWarning')}`
            }
          </h3>
          <p className="text-sm text-muted-foreground">
            {t('contactAdmin')}
          </p>
        </div>

        <Button
          onClick={handleTelegramContact}
          size="sm"
          className="bg-[#229ED9] hover:bg-[#1c8cc2] text-white flex-shrink-0"
        >
          <Send className="h-4 w-4 ml-2" />
          {t('contact')}
        </Button>
      </div>
    </div>
  );
}
