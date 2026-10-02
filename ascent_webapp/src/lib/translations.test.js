// Every UI string must exist in English, Hebrew and Russian (see PRODUCT.md).
import { describe, expect, test } from 'vitest';
import en from './i18n/en';
import he from './i18n/he';
import ru from './i18n/ru';

const translations = { en, he, ru };

const LANGS = ['en', 'he', 'ru'];
const keysOf = (lang) => new Set(Object.keys(translations[lang]));
const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort();

describe('translations', () => {
  test.each(LANGS)('%s has every key the other languages have', (lang) => {
    const mine = keysOf(lang);
    const missing = LANGS.filter((l) => l !== lang).flatMap((l) => [...keysOf(l)].filter((k) => !mine.has(k)));
    expect([...new Set(missing)].sort()).toEqual([]);
  });

  test('no string is empty', () => {
    const empty = LANGS.flatMap((lang) =>
      Object.entries(translations[lang]).filter(([, v]) => typeof v === 'string' && !v.trim()).map(([k]) => `${lang}.${k}`));
    expect(empty).toEqual([]);
  });

  test('a string keeps its {placeholders} in every language', () => {
    const wrong = Object.keys(translations.en).filter((k) => {
      const want = placeholders(translations.en[k]).join();
      return ['he', 'ru'].some((l) => translations[l][k] !== undefined && placeholders(translations[l][k]).join() !== want);
    });
    expect(wrong).toEqual([]);
  });
});

describe('keys used in the code', () => {
  // Every t('literal') in the app (portfolio pages are hidden and keep their own strings)
  const sources = import.meta.glob(['/src/**/*.{js,jsx}', '!/src/**/*.test.*', '!/src/components/portfolio/**', '!/src/pages/Portfolio.jsx', '!/src/pages/AccountDetail.jsx'], { query: '?raw', import: 'default', eager: true });
  const used = new Map();
  for (const [file, text] of Object.entries(sources)) {
    for (const m of text.matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'\s*[,)]/g)) {
      if (!used.has(m[1])) used.set(m[1], file);
    }
  }

  test('the scan finds the app\'s strings', () => {
    expect(used.size).toBeGreaterThan(300);
  });

  test('every key the app asks for exists (a missing one shows its raw key on screen)', () => {
    const missing = [...used].filter(([k]) => !(k in translations.en)).map(([k, f]) => `${k} (${f})`);
    expect(missing).toEqual([]);
  });
});
