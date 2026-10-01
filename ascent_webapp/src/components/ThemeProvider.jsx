import React, { createContext, useContext, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { translations } from '../lib/translations';
import { setAppLanguage } from '@/lib/documentLanguage';

export const PALETTES = ['indigo', 'gold', 'graphite', 'ivory', 'burgundy', 'slate', 'twilight'];

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const { user, setUser, checkAppState, saveUserPrefs } = useAuth();

  // Legacy loading state compatibility - though mostly handled by AuthContext now
  const loading = false;

  // Function to refresh user data (called after settings update)
  const refreshUser = useCallback(async () => {
    console.log('[ThemeProvider] refreshUser called - delegating to AuthContext');
    await checkAppState({ silent: true });
    return user;
  }, [checkAppState, user]);

  // Function to update user locally (for instant UI feedback)
  const updateUserLocal = useCallback((updates) => {
    setUser(prev => prev ? { ...prev, ...updates } : null);
  }, [setUser]);

  const theme = user?.theme || 'dark';

  // Language: user preference > default 'he'
  const language = user?.language || 'he';
  const isRTL = language === 'he';

  // Keep <html lang/dir> in sync with the selected language
  useLayoutEffect(() => { setAppLanguage(language); }, [language]);

  // Color palette, stored per device. Legacy ?palette=... URL param still works.
  const [palette, setPaletteState] = useState(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('palette');
      if (PALETTES.includes(q)) localStorage.setItem('ascent_palette', q);
      const saved = localStorage.getItem('ascent_palette');
      return PALETTES.includes(saved) ? saved : 'gold';
    } catch { return 'gold'; }
  });

  const setPalette = useCallback((next) => {
    setPaletteState(next);
    try { localStorage.setItem('ascent_palette', next); } catch { /* storage unavailable */ }
  }, []);

  useLayoutEffect(() => {
    if (palette !== 'indigo') document.documentElement.dataset.palette = palette;
    else delete document.documentElement.dataset.palette;
  }, [palette]);

  const t = useCallback((key) => translations[language]?.[key] || translations.en[key] || key, [language]);

  // Apply theme to <html> so shadcn CSS variable tokens switch
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme !== 'light');
    root.style.colorScheme = theme === 'light' ? 'light' : 'dark';
  }, [theme]);

  // Match the installed-app status bar / browser chrome to the rendered background
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const bg = getComputedStyle(document.body).backgroundColor;
    if (bg) meta.setAttribute('content', bg);
  }, [theme, palette]);

  // Token-based classes; values switch automatically via CSS variables (.dark)
  const colors = React.useMemo(() => ({
    bgPrimary: 'bg-background',
    bgSecondary: 'bg-card',
    bgTertiary: 'bg-muted',
    textPrimary: 'text-foreground',
    textSecondary: 'text-foreground/80',
    textTertiary: 'text-muted-foreground',
    border: 'border-border',
    borderLight: 'border-border/50',
    accent: 'bg-primary',
    accentHover: 'hover:bg-primary/85',
    accentText: 'text-primary',
    cardBg: 'bg-card',
    cardBorder: 'border-border',
  }), []);

  const value = React.useMemo(() => ({
    user,
    setUser,
    theme,
    language,
    isRTL,
    colors,
    palette,
    setPalette,
    t,
    loading,
    refreshUser,
    updateUserLocal,
    saveUserPrefs,
  }), [user, setUser, theme, language, isRTL, colors, palette, setPalette, t, loading, refreshUser, updateUserLocal, saveUserPrefs]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

