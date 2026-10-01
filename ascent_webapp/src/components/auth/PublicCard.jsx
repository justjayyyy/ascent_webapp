import React, { useLayoutEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { setPageLanguage } from '@/lib/documentLanguage';
import { translations } from '@/lib/translations';

const LANG_KEY = 'ascent_login_lang';

/** The language for a page someone may open signed out: theirs if known, else the sign-in page's, else the device's. */
export function usePublicLanguage(userLanguage) {
  const language = useMemo(() => {
    if (translations[userLanguage]) return userLanguage;
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (translations[saved]) return saved;
    } catch { /* storage unavailable */ }
    const device = (navigator.language || 'en').slice(0, 2);
    return translations[device] ? device : 'en';
  }, [userLanguage]);
  useLayoutEffect(() => { setPageLanguage(language); }, [language]);
  useLayoutEffect(() => () => setPageLanguage(null), []);
  const t = useMemo(() => (key, vars) => {
    let s = translations[language]?.[key] || translations.en[key] || key;
    if (vars) Object.entries(vars).forEach(([k, v]) => { s = s.replace(`{${k}}`, v); });
    return s;
  }, [language]);
  return { language, t };
}

/** A single centred card, for pages reached from an email link. */
export function PublicCard({ children }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4 pt-[calc(1rem+var(--safe-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <Card className="w-full max-w-md border-border bg-card">{children}</Card>
    </div>
  );
}
