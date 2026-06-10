"use client";

/**
 * Global providers wrapper
 * Wraps the app with theme, i18n, and other context providers
 */

import { I18nProvider } from "@/lib/i18n";
import { AutoThemeProvider } from "@/hooks/use-auto-theme";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AutoThemeProvider>
      {/* Russian is the default language. Browser language detection
          happens client-side inside I18nProvider to avoid SSR mismatch. */}
      <I18nProvider defaultLocale="ru">
        {children}
      </I18nProvider>
    </AutoThemeProvider>
  );
}
