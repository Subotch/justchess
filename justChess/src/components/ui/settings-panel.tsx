"use client";

import { useState, useRef, useEffect } from "react";
import { useTheme } from "next-themes";
import { useTranslation } from "@/lib/i18n";
import { useUserStore } from "@/stores/user-store";
import type { Locale } from "@/lib/i18n";
import { Moon, Sun, Monitor, Globe, Volume2, VolumeX, Settings, Palette } from "lucide-react";
import * as Switch from "@radix-ui/react-switch";

export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();
  const { t, locale, setLocale } = useTranslation();
  const { preferences, updatePreferences, resetPreferences } = useUserStore();

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
    <div>
      <div className="relative" ref={panelRef}>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          suppressHydrationWarning
          className="flex items-center justify-center rounded-full border border-slate-700 bg-slate-800/95 px-4 py-3 text-sm font-medium text-white shadow-lg transition-colors hover:bg-slate-700 dark:border-slate-600 dark:bg-slate-700/95 dark:hover:bg-slate-600"
          aria-label={t('settings.title')}
          title={t('settings.title')}
        >
          <Settings className="h-5 w-5 sm:mr-2" />
          <span className="hidden sm:inline" suppressHydrationWarning>{t('settings.title')}</span>
        </button>

        {open && (
          <div
            className="absolute left-0 mt-2 w-80 rounded-xl border border-slate-700 bg-white p-4 shadow-2xl dark:border-slate-600 dark:bg-slate-800"
            suppressHydrationWarning
          >
            <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white" suppressHydrationWarning>
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
                    onClick={() => setTheme('light')}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                      theme === 'light'
                        ? 'border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-blue-900/20 dark:text-blue-400'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                    }`}
                  >
                    <Sun className="h-4 w-4" />
                    <span suppressHydrationWarning>{t('settings.themeLight')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                      theme === 'dark'
                        ? 'border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-blue-900/20 dark:text-blue-400'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                    }`}
                  >
                    <Moon className="h-4 w-4" />
                    <span suppressHydrationWarning>{t('settings.themeDark')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('system')}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                      theme === 'system'
                        ? 'border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-blue-900/20 dark:text-blue-400'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                    }`}
                  >
                    <Monitor className="h-4 w-4" />
                    <span suppressHydrationWarning>{t('settings.themeSystem')}</span>
                  </button>
                </div>
              </div>

              {/* Language */}
              <div>
                <label className="mb-2 flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300" suppressHydrationWarning>
                  <Globe className="h-4 w-4" />
                  {t('settings.language')}
                </label>
                <select
                  value={locale}
                  onChange={(e) => setLocale(e.target.value as Locale)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-700 font-medium transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                >
                  <option value="en">🇬🇧 {t('settings.languageEnglish')}</option>
                  <option value="ru">🇷🇺 {t('settings.languageRussian')}</option>
                </select>
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
    </div>
  );
}
