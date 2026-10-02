// UI strings. Each language is its own file (./i18n), downloaded only when someone uses it: main.jsx loads
// the likely one before the first render, and a switch loads the next one in the background while the
// current language stays on screen.
import { useEffect, useSyncExternalStore } from 'react';

export const LANGUAGES = ['en', 'he', 'ru'];
export const isLanguage = (language) => LANGUAGES.includes(language);

const LOADERS = {
  en: () => import('./i18n/en.js'),
  he: () => import('./i18n/he.js'),
  ru: () => import('./i18n/ru.js'),
};

/** The languages loaded so far, by code. */
export const translations = {};
let lastLoaded = null;
let version = 0;
const listeners = new Set();
const pending = {};

/** Loads a language's strings once; resolves when they can be used. */
export function loadLanguage(language) {
  const code = isLanguage(language) ? language : 'en';
  if (translations[code]) return Promise.resolve(translations[code]);
  pending[code] ??= LOADERS[code]().then((m) => {
    translations[code] = m.default;
    lastLoaded = code;
    version += 1;
    listeners.forEach((fn) => fn());
    return m.default;
  }).finally(() => { delete pending[code]; });
  return pending[code];
}

/** The strings for `language`, or while it is still loading, the last language that did. */
export const stringsFor = (language) => translations[language] || translations[lastLoaded] || translations.en || {};

/** `key` in `language`, with {name} placeholders filled from `vars`; the key itself if there is no such string. */
export function translate(language, key, vars) {
  let s = stringsFor(language)[key] || key;
  if (vars) Object.entries(vars).forEach(([k, v]) => { s = s.replace(`{${k}}`, v); });
  return s;
}

const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** Re-renders once `language` has loaded, starting the download if needed. */
export function useLanguage(language) {
  useSyncExternalStore(subscribe, () => version, () => version);
  useEffect(() => { loadLanguage(language).catch(() => {}); }, [language]);
  return stringsFor(language);
}

export function translateCategory(categoryNameOrKey, language = 'en') {
  // Translation keys (used by default categories from API)
  const keyMap = {
    // Expense categories
    'food_dining': { en: 'Food & Dining', he: 'אוכל ומסעדות', ru: 'Еда и рестораны' },
    'groceries': { en: 'Groceries', he: 'מכולת', ru: 'Продукты' },
    'transportation': { en: 'Transportation', he: 'תחבורה', ru: 'Транспорт' },
    'utilities': { en: 'Utilities', he: 'חשבונות שוטפים', ru: 'Коммунальные услуги' },
    'rent_housing': { en: 'Rent & Housing', he: 'שכירות ודיור', ru: 'Аренда и жилье' },
    'healthcare': { en: 'Healthcare', he: 'בריאות', ru: 'Здравоохранение' },
    'entertainment': { en: 'Entertainment', he: 'בידור', ru: 'Развлечения' },
    'shopping': { en: 'Shopping', he: 'קניות', ru: 'Покупки' },
    'insurance': { en: 'Insurance', he: 'ביטוח', ru: 'Страхование' },
    'education': { en: 'Education', he: 'חינוך', ru: 'Образование' },
    'personal_care': { en: 'Personal Care', he: 'טיפוח אישי', ru: 'Личный уход' },
    'subscriptions': { en: 'Subscriptions', he: 'מנויים', ru: 'Подписки' },
    'travel': { en: 'Travel', he: 'נסיעות', ru: 'Путешествия' },
    'gifts': { en: 'Gifts', he: 'מתנות', ru: 'Подарки' },
    'taxes': { en: 'Taxes', he: 'מיסים', ru: 'Налоги' },
    'other_expense': { en: 'Other', he: 'אחר', ru: 'Другое' },
    // Income categories
    'salary': { en: 'Salary', he: 'משכורת', ru: 'Зарплата' },
    'freelance': { en: 'Freelance', he: 'פרילנס', ru: 'Фриланс' },
    'investments': { en: 'Investment Income', he: 'הכנסות מהשקעות', ru: 'Инвестиционный доход' },
    'rental_income': { en: 'Rental Income', he: 'הכנסות משכירות', ru: 'Доход от аренды' },
    'gifts_received': { en: 'Gifts Received', he: 'מתנות שהתקבלו', ru: 'Полученные подарки' },
    'refunds': { en: 'Refunds', he: 'החזרים', ru: 'Возвраты' },
    'other_income': { en: 'Other Income', he: 'הכנסה אחרת', ru: 'Другой доход' },
    // Legacy name mappings for backwards compatibility
    'Food & Dining': { en: 'Food & Dining', he: 'אוכל ומסעדות', ru: 'Еда и рестораны' },
    'Groceries': { en: 'Groceries', he: 'מכולת', ru: 'Продукты' },
    'Rent & Housing': { en: 'Rent & Housing', he: 'שכירות ודיור', ru: 'Аренда и жилье' },
    'Transportation': { en: 'Transportation', he: 'תחבורה', ru: 'Транспорт' },
    'Healthcare': { en: 'Healthcare', he: 'בריאות', ru: 'Здравоохранение' },
    'Entertainment': { en: 'Entertainment', he: 'בידור', ru: 'Развлечения' },
    'Shopping': { en: 'Shopping', he: 'קניות', ru: 'Покупки' },
    'Utilities': { en: 'Utilities', he: 'חשבונות', ru: 'Коммунальные услуги' },
    'Insurance': { en: 'Insurance', he: 'ביטוח', ru: 'Страхование' },
    'Investment Fees': { en: 'Investment Fees', he: 'עמלות השקעה', ru: 'Инвестиционные сборы' },
    'Taxes': { en: 'Taxes', he: 'מיסים', ru: 'Налоги' },
    'Salary': { en: 'Salary', he: 'משכורת', ru: 'Зарплата' },
    'Investment Income': { en: 'Investment Income', he: 'הכנסות מהשקעות', ru: 'Инвестиционный доход' },
    'Other': { en: 'Other', he: 'אחר', ru: 'Другое' }
  };
  return keyMap[categoryNameOrKey]?.[language] || categoryNameOrKey;
}
