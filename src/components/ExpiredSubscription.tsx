import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, LogOut, Calendar, Shield, Send, Copy, Check } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '@/hooks/use-toast';

interface ExpiredSubscriptionProps {
  email: string;
  expiresAt: Date;
  onLogout: () => void;
}

const CEO_TELEGRAM = 'AndamAziz';

export function ExpiredSubscription({ email, expiresAt, onLogout }: ExpiredSubscriptionProps) {
  const { t, language } = useLanguage();
  const [copied, setCopied] = useState(false);

  const localeMap = {
    ku: 'ku-Arab',
    en: 'en-US',
    ar: 'ar-SA',
    fa: 'fa-IR',
    tr: 'tr-TR',
  } as const;

  const lang = (['ku', 'en', 'ar', 'fa', 'tr'].includes(language) ? language : 'en') as keyof typeof localeMap;

  const expiredDate = new Date(expiresAt).toLocaleDateString(localeMap[lang], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Ready-made per-reason message the user copies and sends to the CEO on Telegram.
  const ceoMessage = buildTelegramMessage({
    reason: 'expired',
    language,
    email,
    expiredDate,
  });


  const copyHints: Record<keyof typeof localeMap, string> = {
    ku: 'پەیامەکە کۆپی کرا — لە تەلەگرام پەیستی بکە و بینێرە بۆ CEO',
    en: 'Message copied — paste it in Telegram and send to the CEO',
    ar: 'تم نسخ الرسالة — الصقها في تيليجرام وأرسلها إلى الـ CEO',
    fa: 'پیام کپی شد — آن را در تلگرام بچسبانید و برای CEO بفرستید',
    tr: 'Mesaj kopyalandı — Telegram\'a yapıştırıp CEO\'ya gönderin',
  };

  const copyButtonLabels: Record<keyof typeof localeMap, string> = {
    ku: 'کۆپیکردنی پەیام',
    en: 'Copy message',
    ar: 'نسخ الرسالة',
    fa: 'کپی پیام',
    tr: 'Mesajı kopyala',
  };

  const templateTitles: Record<keyof typeof localeMap, string> = {
    ku: 'ئەم پەیامە بنێرە بۆ CEO 👇',
    en: 'Send this message to the CEO 👇',
    ar: 'أرسل هذه الرسالة إلى الـ CEO 👇',
    fa: 'این پیام را برای CEO بفرستید 👇',
    tr: 'Bu mesajı CEO\'ya gönderin 👇',
  };

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(ceoMessage);
    } catch {
      // Fallback for browsers/contexts without async clipboard
      const ta = document.createElement('textarea');
      ta.value = ceoMessage;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { document.execCommand('copy'); } catch { /* noop */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    toast({ description: copyHints[lang] });
    setTimeout(() => setCopied(false), 2500);
  };

  const handleTelegramContact = async () => {
    await copyMessage();
    window.open(`https://t.me/${CEO_TELEGRAM}`, '_blank');
  };

  // WhatsApp removed — Telegram-only contact.

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

            {/* CEO message template */}
            <div className="bg-secondary/40 rounded-2xl p-4 mb-4 border border-border/50">
              <p className="text-sm font-semibold text-foreground mb-2">{templateTitles[lang]}</p>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed font-sans bg-background/40 rounded-xl p-3 border border-border/40 mb-3">
{ceoMessage}
              </pre>
              <Button
                variant="outline"
                onClick={copyMessage}
                className="w-full rounded-xl border-primary/40 hover:bg-primary/10"
              >
                <div className="flex items-center gap-2">
                  {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  {copyButtonLabels[lang]}
                </div>
              </Button>
            </div>

            {/* Telegram (CEO) Contact Button */}
            <Button
              onClick={handleTelegramContact}
              className="w-full py-7 text-lg font-bold rounded-xl shadow-xl bg-[#229ED9] hover:bg-[#1c8cc2] text-white hover:scale-[1.02] transition-all duration-300 mb-2"
            >
              <div className="flex items-center gap-3">
                <Send className="h-6 w-6" />
                Telegram (CEO)
              </div>
            </Button>

            <p className="text-center text-xs text-muted-foreground mb-1">
              Telegram: <span dir="ltr" className="font-mono">@AndamAziz</span>
            </p>
            <p className="text-center text-xs text-muted-foreground mb-6">
              <span dir="ltr" className="font-mono">info@andam.uk</span>
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
