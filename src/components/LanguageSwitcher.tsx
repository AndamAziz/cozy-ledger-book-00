import { Globe } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Language } from '@/lib/translations';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import kurdistanFlag from '@/assets/flags/kurdistan.png';

interface LanguageOption {
  code: Language;
  label: string;
  flag: string;
  isImage?: boolean;
}

const languages: LanguageOption[] = [
  { code: 'ku', label: 'کوردی', flag: kurdistanFlag, isImage: true },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  { code: 'fa', label: 'فارسی', flag: '🇮🇷' },
];

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  
  const currentLang = languages.find(l => l.code === language) || languages[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 rounded-lg bg-info/15 hover:bg-info/25 border border-info/30 transition-all duration-200 hover:scale-105 active:scale-95"
        >
          <Globe className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-info" />
          {currentLang.isImage ? (
            <img src={currentLang.flag} alt={currentLang.label} className="h-4 w-5 sm:h-5 sm:w-6 rounded-sm object-cover" />
          ) : (
            <span className="text-sm sm:text-base font-bold text-info">
              {currentLang.flag}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => setLanguage(lang.code)}
            className={`flex items-center gap-2 cursor-pointer ${
              language === lang.code ? 'bg-primary/10 text-primary' : ''
            }`}
          >
            {lang.isImage ? (
              <img src={lang.flag} alt={lang.label} className="h-4 w-5 rounded-sm object-cover" />
            ) : (
              <span className="text-lg">{lang.flag}</span>
            )}
            <span className="font-medium">{lang.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
