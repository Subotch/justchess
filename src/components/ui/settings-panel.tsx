"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslation } from "@/lib/i18n";
import { useUserStore } from "@/stores/user-store";
import { useAutoTheme } from "@/hooks/use-auto-theme";
import type { Locale } from "@/lib/i18n";
import { Moon, Sun, Clock, Globe, Volume2, VolumeX, Settings, Palette } from "lucide-react";
import * as Switch from "@radix-ui/react-switch";

export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { t, locale, setLocale } = useTranslation();
  const { preferences, updatePreferences } = useUserStore();
  const { storedTheme, setTheme, toggleAuto, isAuto, mounted } = useAutoTheme();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (open && panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        suppressHydrationWarning
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 dark:text-white transition-colors hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-green-600 dark:hover:text-green-400"
        aria-label={t('settings.title')}
        title={t('settings.title')}
      >
        <Settings className="h-5 w-5 flex-shrink-0" />
        <span className="hidden sm:inline">{t('settings.title')}</span>
      </button>

      {open && (
        <div
          className="absolute left-0 mt-2 w-72 sm:w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-600 dark:bg-slate-800 z-[60]"
          suppressHydrationWarning
        >
          <h3 className="mb-4 text-base font-semibold text-slate-900 dark:text-white" suppressHydrationWarning>
            {t('settings.title')}
          </h3>

          <div className="space-y-4 text-sm">
            {/* Theme */}
            <div>
              <label className="mb-2 flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300" suppressHydrationWarning>
                <Palette className="h-4 w-4" />
                {t('settings.theme')}
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTheme("light")}
                  className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs transition-colors ${
                    !mounted || storedTheme === "light"
                      ? "border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-blue-900/20 dark:text-blue-400"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                  }`}
                >
                  <Sun className="h-4 w-4" />
                  <span suppressHydrationWarning>{t('settings.themeLight')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTheme("dark")}
                  className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs transition-colors ${
                    !mounted || storedTheme === "dark"
                      ? "border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-blue-900/20 dark:text-blue-400"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                  }`}
                >
                  <Moon className="h-4 w-4" />
                  <span suppressHydrationWarning>{t('settings.themeDark')}</span>
                </button>
                <button
                  type="button"
                  onClick={toggleAuto}
                  className={`flex flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-2 text-xs transition-colors ${
                    !mounted || isAuto
                      ? "border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-blue-900/20 dark:text-blue-400"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                  }`}
                >
                  <Clock className="h-4 w-4" />
                  <span suppressHydrationWarning>{t('settings.themeAuto')}</span>
                </button>
              </div>
              {mounted && isAuto && (
                <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500" suppressHydrationWarning>
                  {t('settings.themeAutoHint')}
                </p>
              )}
            </div>

            {/* Language */}
            <div>
              <label className="mb-2 flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300" suppressHydrationWarning>
                <Globe className="h-4 w-4" />
                {t('settings.language')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setLocale("en")}
                  className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${
                    locale === "en"
                      ? "border-blue-500 bg-blue-50 text-blue-600 ring-2 ring-blue-500/30 dark:border-blue-400 dark:bg-blue-900/20 dark:text-blue-400"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                  }`}
                >
                  <span className="text-xl leading-none">EN</span>
                  <span suppressHydrationWarning>{t('settings.languageEnglish')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLocale("ru")}
                  className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${
                    locale === "ru"
                      ? "border-blue-500 bg-blue-50 text-blue-600 ring-2 ring-blue-500/30 dark:border-blue-400 dark:bg-blue-900/20 dark:text-blue-400"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                  }`}
                >
                  <span className="text-xl leading-none">RU</span>
                  <span suppressHydrationWarning>{t('settings.languageRussian')}</span>
                </button>
              </div>
            </div>

            {/* Sound */}
            <div>
              <label className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                  {preferences.soundEnabled ? (
                    <Volume2 className="h-4 w-4" />
                  ) : (
                    <VolumeX className="h-4 w-4" />
                  )}
                  <span suppressHydrationWarning>{t('settings.sound')}</span>
                </span>
                <Switch.Root
                  checked={preferences.soundEnabled}
                  onCheckedChange={(checked) => updatePreferences({ soundEnabled: checked })}
                  className="relative h-6 w-11 rounded-full bg-slate-300 data-[state=checked]:bg-blue-500 dark:bg-slate-600 transition-colors"
                >
                  <Switch.Thumb className="block h-5 w-5 rounded-full bg-white shadow transition-transform translate-x-0.5 data-[state=checked]:translate-x-5" />
                </Switch.Root>
              </label>
            </div>

            {/* Board settings */}
            <div className="border-t border-slate-200 pt-4 dark:border-slate-600">
              <label className="mb-2 block font-medium text-slate-700 dark:text-slate-300" suppressHydrationWarning>
                {t('settings.board')}
              </label>

              <label className="mb-3 flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400" suppressHydrationWarning>{t('settings.coordinates')}</span>
                <Switch.Root
                  checked={preferences.showCoordinates}
                  onCheckedChange={(checked) => updatePreferences({ showCoordinates: checked })}
                  className="relative h-6 w-11 rounded-full bg-slate-300 data-[state=checked]:bg-blue-500 dark:bg-slate-600 transition-colors"
                >
                  <Switch.Thumb className="block h-5 w-5 rounded-full bg-white shadow transition-transform translate-x-0.5 data-[state=checked]:translate-x-5" />
                </Switch.Root>
              </label>

              <label className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400" suppressHydrationWarning>{t('settings.autoPromote')}</span>
                <Switch.Root
                  checked={preferences.autoPromoteToQueen}
                  onCheckedChange={(checked) => updatePreferences({ autoPromoteToQueen: checked })}
                  className="relative h-6 w-11 rounded-full bg-slate-300 data-[state=checked]:bg-blue-500 dark:bg-slate-600 transition-colors"
                >
                  <Switch.Thumb className="block h-5 w-5 rounded-full bg-white shadow transition-transform translate-x-0.5 data-[state=checked]:translate-x-5" />
                </Switch.Root>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}