"use client";

/**
 * Global providers wrapper
 * Wraps the app with theme, i18n, and other context providers
 */

import { ThemeProvider } from "next-themes";
import { I18nProvider } from "@/lib/i18n";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <I18nProvider defaultLocale="en">
        {children}
      </I18nProvider>
    </ThemeProvider>
  );
}
