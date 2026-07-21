import { useState } from 'react';
import { Send, Copy, Check, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { CEO_TELEGRAM_URL, CEO_TELEGRAM_HANDLE, CEO_EMAIL } from '@/lib/telegramContact';

type Lang = 'ku' | 'en' | 'ar' | 'fa' | 'tr';

const pickLang = (l: string): Lang =>
  (['ku', 'en', 'ar', 'fa', 'tr'].includes(l) ? l : 'en') as Lang;

const L = {
  title: {
    ku: 'پێشبینینی نامەی تەلەگرام',
    en: 'Telegram message preview',
    ar: 'معاينة رسالة تيليجرام',
    fa: 'پیش‌نمایش پیام تلگرام',
    tr: 'Telegram mesaj önizlemesi',
  },
  desc: {
    ku: 'ئەم نامەیە کۆپی دەکرێت و تەلەگرام دەکرێتەوە.',
    en: 'This message will be copied to your clipboard and Telegram will open.',
    ar: 'سيتم نسخ هذه الرسالة وسيُفتح تيليجرام.',
    fa: 'این پیام کپی می‌شود و تلگرام باز خواهد شد.',
    tr: 'Bu mesaj panoya kopyalanacak ve Telegram açılacak.',
  },
  copy: {
    ku: 'کۆپیکردنی پەیام',
    en: 'Copy message',
    ar: 'نسخ الرسالة',
    fa: 'کپی پیام',
    tr: 'Mesajı kopyala',
  },
  copied: {
    ku: 'کۆپی کرا',
    en: 'Copied',
    ar: 'تم النسخ',
    fa: 'کپی شد',
    tr: 'Kopyalandı',
  },
  copyHint: {
    ku: 'پەیامەکە کۆپی کرا',
    en: 'Message copied',
    ar: 'تم نسخ الرسالة',
    fa: 'پیام کپی شد',
    tr: 'Mesaj kopyalandı',
  },
  send: {
    ku: 'کۆپی و کردنەوەی تەلەگرام',
    en: 'Copy & open Telegram',
    ar: 'نسخ وفتح تيليجرام',
    fa: 'کپی و باز کردن تلگرام',
    tr: 'Kopyala ve Telegram\'ı aç',
  },
  cancel: {
    ku: 'پاشگەزبوونەوە',
    en: 'Cancel',
    ar: 'إلغاء',
    fa: 'لغو',
    tr: 'İptal',
  },
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: string;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand('copy'); } catch { /* noop */ }
    document.body.removeChild(ta);
  }
}

export function TelegramPreviewDialog({ open, onOpenChange, message }: Props) {
  const { language } = useLanguage();
  const lang = pickLang(language);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await copyText(message);
    setCopied(true);
    toast({ description: L.copyHint[lang] });
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSend = async () => {
    await copyText(message);
    window.open(CEO_TELEGRAM_URL, '_blank');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-[#229ED9]" />
            {L.title[lang]}
          </DialogTitle>
          <DialogDescription>{L.desc[lang]}</DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border/60 bg-secondary/40 p-4">
          <pre
            dir="auto"
            className="whitespace-pre-wrap break-words font-sans text-sm text-foreground leading-relaxed max-h-72 overflow-auto"
          >
            {message}
          </pre>
        </div>

        <div className="text-xs text-muted-foreground text-center space-y-1">
          <div>Telegram: <span dir="ltr" className="font-mono">@{CEO_TELEGRAM_HANDLE}</span></div>
          <div><span dir="ltr" className="font-mono">{CEO_EMAIL}</span></div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-1" />
            {L.cancel[lang]}
          </Button>
          <Button variant="secondary" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
            {copied ? L.copied[lang] : L.copy[lang]}
          </Button>
          <Button onClick={handleSend} className="bg-[#229ED9] hover:bg-[#1c8cc2] text-white">
            <Send className="h-4 w-4 mr-1" />
            {L.send[lang]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
