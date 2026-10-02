// The app's own words, so tests find controls by the same text people see and a copy change does not break
// them. L('addExpense') → 'Add expense'; L('lockUnlockWith', { method: 'Face ID' }); L('save', {}, 'he').
import en from '../../src/lib/i18n/en.js';
import he from '../../src/lib/i18n/he.js';
import ru from '../../src/lib/i18n/ru.js';

const DICTS = { en, he, ru };

export function L(key, vars = {}, lang = 'en') {
  const text = DICTS[lang]?.[key];
  if (typeof text !== 'string') throw new Error(`No ${lang} string for "${key}"`);
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

/** A RegExp for a string with {placeholders}, matching any value in their place. */
export function Lre(key, lang = 'en') {
  const escaped = L(key, {}, lang).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{\w+\\\}/g, '.+');
  return new RegExp(escaped);
}

// Shown in each language's own name on the sign-in page (not translated)
export const LANGUAGE_NAMES = { he: 'עברית', en: 'English', ru: 'Русский' };
