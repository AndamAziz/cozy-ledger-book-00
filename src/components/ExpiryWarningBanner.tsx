import { AlertTriangle, Send, X, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { buildTelegramMessage } from '@/lib/telegramContact';
import { TelegramPreviewDialog } from '@/components/TelegramPreviewDialog';

interface ExpiryWarningBannerProps {
  daysUntilExpiry: number;
  email: string;
}

export function ExpiryWarningBanner({ daysUntilExpiry, email }: ExpiryWarningBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { t, language } = useLanguage();
  const navigate = useNavigate();

  if (isDismissed || daysUntilExpiry > 10) {
    return null;
  }

  const previewMessage = buildTelegramMessage({
    reason: 'expiring',
    language,
    email,
    daysUntilExpiry,
  });

  const handleTelegramContact = () => setPreviewOpen(true);




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

  const isRTL = language === 'ku' || language === 'ar' || language === 'fa';

  return (
    <>
    <TelegramPreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} message={previewMessage} />
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      className={`relative rounded-xl border p-4 mb-4 animate-fade-in ${bgColor} ${isRTL ? 'text-right' : 'text-left'}`}
    >

      <button
        onClick={() => setIsDismissed(true)}
        className={`absolute top-2 ${isRTL ? 'left-2' : 'right-2'} p-1 rounded-full hover:bg-secondary/50 transition-colors`}
      >
        <X className="h-4 w-4 text-muted-foreground" />
      </button>

      <div className={`flex flex-col sm:flex-row items-start sm:items-center gap-4 ${isRTL ? 'pr-6' : 'pl-6'}`}>
        <div className={`flex-shrink-0 w-12 h-12 rounded-full bg-background/50 flex items-center justify-center ${iconColor}`}>
          <AlertTriangle className="h-6 w-6 animate-pulse" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-foreground mb-1">
            {daysUntilExpiry === 1
              ? `⚠️ ${t('expiryTomorrow')}`
              : isRTL
                ? `${daysUntilExpiry} ${t('expiryWarning')}`
                : `${t('expiryWarning')} ${daysUntilExpiry}`
            }
          </h3>
          <p className="text-sm text-muted-foreground">
            {t('contactAdmin')}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0 w-full sm:w-auto">
          <Button
            onClick={() => navigate('/subscribe')}
            size="sm"
            className="bg-gradient-to-r from-primary to-gold hover:opacity-90 text-white"
          >
            <Crown className={`h-4 w-4 ${isRTL ? 'ml-2' : 'mr-2'}`} />
            £7/mo
          </Button>
          <Button
            onClick={handleTelegramContact}
            size="sm"
            variant="outline"
            className="border-[#229ED9]/40 text-[#229ED9] hover:bg-[#229ED9]/10"
          >
            <Send className={`h-4 w-4 ${isRTL ? 'ml-2' : 'mr-2'}`} />
            {t('contact')}
          </Button>
        </div>
      </div>
    </div>
    </>
  );

}
