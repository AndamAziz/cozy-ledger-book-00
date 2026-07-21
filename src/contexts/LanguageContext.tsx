import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { translations, Language, TranslationKey } from '@/lib/translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
  dir: 'rtl' | 'ltr';
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LANGUAGE_STORAGE_KEY = 'central-tech-platform-language';

// RTL languages
const RTL_LANGUAGES: Language[] = ['ku', 'ar', 'fa'];

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (stored === 'en' || stored === 'ku' || stored === 'ar' || stored === 'fa' || stored === 'tr') {
        return stored;
      }
    }
    return 'en'; // Default to English
  });

  const isRTL = RTL_LANGUAGES.includes(language);
  const dir: 'rtl' | 'ltr' = isRTL ? 'rtl' : 'ltr';

  useEffect(() => {
    // Save to localStorage
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);

    // Update document direction (global, cascades to all pages/components)
    document.documentElement.dir = dir;
    document.body.dir = dir;

    // Update language attribute
    const langAttr = {
      ku: 'ckb',
      en: 'en',
      ar: 'ar',
      fa: 'fa',
      tr: 'tr',
    }[language];
    document.documentElement.lang = langAttr;

    // Update font family based on language
    if (language === 'en' || language === 'tr') {
      document.body.style.fontFamily = "'Inter', 'Segoe UI', sans-serif";
    } else {
      document.body.style.fontFamily = "'Noto Sans Arabic', sans-serif";
    }
  }, [language, dir]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const t = (key: TranslationKey): string => {
    return translations[language][key] || translations.ku[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, dir }}>
      {/* Wrapper ensures dir cascades to every page/component in the tree,
          even when portals or nested layouts override html-level dir. */}
      <div dir={dir} lang={language} className="contents">
        {children}
      </div>
    </LanguageContext.Provider>
  );
}


export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
