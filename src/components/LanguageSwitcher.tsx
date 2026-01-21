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
import ukFlag from '@/assets/flags/uk.png';
import saudiFlag from '@/assets/flags/saudi.png';
import iranFlag from '@/assets/flags/iran.png';

interface LanguageOption {
  code: Language;
  label: string;
  flag: string;
}

const languages: LanguageOption[] = [
  { code: 'ku', label: 'کوردی', flag: kurdistanFlag },
  { code: 'en', label: 'English', flag: ukFlag },
  { code: 'ar', label: 'العربية', flag: saudiFlag },
  { code: 'fa', label: 'فارسی', flag: iranFlag },
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
          <img 
            src={currentLang.flag} 
            alt={currentLang.label} 
            className="h-4 w-5 sm:h-5 sm:w-6 rounded-sm object-cover shadow-sm" 
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px] bg-background border border-border">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => setLanguage(lang.code)}
            className={`flex items-center gap-2 cursor-pointer ${
              language === lang.code ? 'bg-primary/10 text-primary' : ''
            }`}
          >
            <img 
              src={lang.flag} 
              alt={lang.label} 
              className="h-4 w-5 rounded-sm object-cover shadow-sm" 
            />
            <span className="font-medium">{lang.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
