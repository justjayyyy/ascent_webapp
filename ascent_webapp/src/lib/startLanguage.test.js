import { describe, it, expect } from 'vitest';
import { likelyLanguage } from './startLanguage';
import { LOGIN_LANG_KEY, SESSION_CACHE_KEY } from './storageKeys';

const storeWith = (entries) => ({ getItem: (k) => entries[k] ?? null });

describe('likelyLanguage', () => {
  it("prefers the signed-in person's language", () => {
    const store = storeWith({ [SESSION_CACHE_KEY]: JSON.stringify({ user: { language: 'ru' }, workspaces: [] }), [LOGIN_LANG_KEY]: 'en' });
    expect(likelyLanguage(store, 'he-IL')).toBe('ru');
  });

  it("then the sign-in page's choice, then the device's", () => {
    expect(likelyLanguage(storeWith({ [LOGIN_LANG_KEY]: 'en' }), 'ru-RU')).toBe('en');
    expect(likelyLanguage(storeWith({}), 'ru-RU')).toBe('ru');
  });

  it('falls back to Hebrew, also when storage is unavailable', () => {
    expect(likelyLanguage(storeWith({}), 'fr-FR')).toBe('he');
    expect(likelyLanguage({ getItem() { throw new Error('blocked'); } }, null)).toBe('he');
  });
});
