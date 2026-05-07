'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { translations } from './translations';
import type { Locale } from './translations';

type TranslationDict = typeof translations.en;
type TranslationValue = string | { [key: string]: TranslationValue };

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

function getNestedValue(obj: TranslationDict | { [key: string]: TranslationValue }, key: string): TranslationValue | undefined {
  const keys = key.split('.');
  let acc: TranslationValue | undefined = obj as TranslationValue;
  
  for (const k of keys) {
    if (acc && typeof acc === 'object' && k in acc) {
      acc = (acc as Record<string, TranslationValue>)[k];
    } else {
      return undefined;
    }
  }
  
  return acc;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = params[key];
    return value !== undefined ? String(value) : match;
  });
}

export function I18nProvider({ children, defaultLocale = 'en' }: { children: React.ReactNode; defaultLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === 'undefined') return defaultLocale;
    const saved = localStorage.getItem('locale') as Locale | null;
    return saved || defaultLocale;
  });

  useEffect(() => {
    localStorage.setItem('locale', locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const value = getNestedValue(translations[locale], key);
    
    if (value === undefined) {
      // Fallback to English
      const fallbackValue = getNestedValue(translations.en, key);
      if (fallbackValue !== undefined) {
        return interpolate(typeof fallbackValue === 'string' ? fallbackValue : key, params);
      }
      return key;
    }
    
    return interpolate(typeof value === 'string' ? value : key, params);
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context;
}

export type { Locale };
