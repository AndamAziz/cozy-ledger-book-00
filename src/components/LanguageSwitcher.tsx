import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Globe } from 'lucide-react';

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  const toggleLanguage = () => {
    setLanguage(language === 'ku' ? 'en' : 'ku');
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLanguage}
      className="h-8 sm:h-9 px-2 sm:px-3 rounded-lg bg-info/10 text-info hover:bg-info hover:text-info-foreground transition-colors flex items-center gap-1.5 touch-manipulation"
    >
      <Globe className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      <span className="text-[10px] sm:text-xs md:text-sm font-medium">
        {language === 'ku' ? 'EN' : 'کو'}
      </span>
    </Button>
  );
}
