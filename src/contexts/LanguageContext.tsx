import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { translations, Language, TranslationKey } from '@/lib/translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
  dir: 'rtl' | 'ltr';
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LANGUAGE_STORAGE_KEY = 'city-taxperts-language';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (stored === 'en' || stored === 'ku') {
        return stored;
      }
    }
    return 'ku'; // Default to Kurdish
  });

  useEffect(() => {
    // Save to localStorage
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    
    // Update document direction
    document.documentElement.dir = language === 'ku' ? 'rtl' : 'ltr';
    document.documentElement.lang = language === 'ku' ? 'ckb' : 'en';
    
    // Update font family based on language
    if (language === 'en') {
      document.body.style.fontFamily = "'Inter', 'Segoe UI', sans-serif";
    } else {
      document.body.style.fontFamily = "'Noto Sans Arabic', sans-serif";
    }
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const t = (key: TranslationKey): string => {
    return translations[language][key] || translations.ku[key] || key;
  };

  const dir = language === 'ku' ? 'rtl' : 'ltr';

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, dir }}>
      {children}
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
