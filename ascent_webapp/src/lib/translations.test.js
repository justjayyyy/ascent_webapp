// Every UI string must exist in English, Hebrew and Russian (see PRODUCT.md).
import { describe, expect, test } from 'vitest';
import { translations } from './translations';

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
