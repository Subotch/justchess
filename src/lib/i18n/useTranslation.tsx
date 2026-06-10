'use client';

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
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

/**
 * Detect browser language preference.
 * Returns 'ru' if any ru-* locale is preferred, otherwise 'en'.
 */
function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return 'ru';
  
  const browserLang = navigator.language || (navigator as any).userLanguage || '';
  
  // Check for Russian language
  if (browserLang.toLowerCase().startsWith('ru')) {
    return 'ru';
  }
  
  // Check Accept-Language header for Russian preference
  const langs = (navigator as any).languages as string[] | undefined;
  if (langs && Array.isArray(langs)) {
    for (const lang of langs) {
      if (lang.toLowerCase().startsWith('ru')) {
        return 'ru';
      }
    }
  }
  
  return 'en';
}

export function I18nProvider({ children, defaultLocale = 'ru' }: { children: React.ReactNode; defaultLocale?: Locale }) {
  // SSR-safe initial state: always render with defaultLocale on the server
  // to ensure consistent hydration. Client useEffect will update after mount.
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Priority: localStorage > browser language > default
    const saved = localStorage.getItem('locale') as Locale | null;
    
    if (saved && (saved === 'en' || saved === 'ru')) {
      // User already chose a language — use it
      setLocaleState(saved);
    } else {
      // No saved preference — detect browser language
      const browserLocale = detectBrowserLocale();
      setLocaleState(browserLocale);
    }
  }, [defaultLocale]);

  useEffect(() => {
    if (!mounted) return;
    
    // Persist to localStorage whenever locale changes (after mount)
    localStorage.setItem('locale', locale);
    document.documentElement.lang = locale;
  }, [locale, mounted]);

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

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return (
    <I18nContext.Provider value={value}>
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
