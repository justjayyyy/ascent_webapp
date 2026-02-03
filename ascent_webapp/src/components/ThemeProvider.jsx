import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ascent } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import { translations, translateCategory } from '../lib/translations';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const { user, setUser, checkAppState } = useAuth();

  // Legacy loading state compatibility - though mostly handled by AuthContext now
  const loading = false;

  // Function to refresh user data (called after settings update)
  const refreshUser = useCallback(async () => {
    console.log('[ThemeProvider] refreshUser called - delegating to AuthContext');
    await checkAppState();
    return user;
  }, [checkAppState, user]);

  // Function to update user locally (for instant UI feedback)
  const updateUserLocal = useCallback((updates) => {
    setUser(prev => prev ? { ...prev, ...updates } : null);
  }, [setUser]);

  const theme = user?.theme || 'dark';

  // Determine language: user preference > browser preference > default 'en'
  const getBrowserLanguage = () => {
    if (typeof navigator === 'undefined') return 'en';
    const browserLang = navigator.language?.split('-')[0];
    return ['en', 'he', 'ru'].includes(browserLang) ? browserLang : 'en';
  };

  const language = user?.language || getBrowserLanguage();
  const isRTL = language === 'he';

  const t = useCallback((key) => translations[language]?.[key] || translations.en[key] || key, [language]);

  const colors = React.useMemo(() => theme === 'light' ? {
    bgPrimary: 'bg-slate-50',
    bgSecondary: 'bg-white',
    bgTertiary: 'bg-slate-100',
    textPrimary: 'text-slate-900',
    textSecondary: 'text-slate-700',
    textTertiary: 'text-slate-500',
    border: 'border-slate-200',
    borderLight: 'border-slate-100',
    accent: 'bg-[#5C8374]',
    accentHover: 'hover:bg-[#4a6b5e]',
    accentText: 'text-[#5C8374]',
    cardBg: 'bg-white',
    cardBorder: 'border-slate-200',
  } : {
    bgPrimary: 'bg-[#092635]',
    bgSecondary: 'bg-[#1B4242]',
    bgTertiary: 'bg-[#092635]',
    textPrimary: 'text-white',
    textSecondary: 'text-[#9EC8B9]',
    textTertiary: 'text-[#9EC8B9]/70',
    border: 'border-[#5C8374]/20',
    borderLight: 'border-[#5C8374]/10',
    accent: 'bg-[#5C8374]',
    accentHover: 'hover:bg-[#5C8374]/80',
    accentText: 'text-[#9EC8B9]',
    cardBg: 'bg-[#1B4242]',
    cardBorder: 'border-[#5C8374]/20',
  }, [theme]);

  const value = React.useMemo(() => ({
    user,
    setUser,
    theme,
    language,
    isRTL,
    colors,
    t,
    loading,
    refreshUser,
    updateUserLocal,
  }), [user, setUser, theme, language, isRTL, colors, t, loading, refreshUser, updateUserLocal]);

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

