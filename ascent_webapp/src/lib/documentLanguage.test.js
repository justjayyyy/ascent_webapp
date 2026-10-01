import { beforeEach, expect, test } from 'vitest';
import { setAppLanguage, setPageLanguage, directionOf } from './documentLanguage';

const html = () => ({ lang: document.documentElement.lang, dir: document.documentElement.dir });

beforeEach(() => { setPageLanguage(null); setAppLanguage('en'); });

test('Hebrew reads right to left, the others left to right', () => {
  expect(directionOf('he')).toBe('rtl');
  expect(directionOf('ru')).toBe('ltr');
  expect(directionOf('en')).toBe('ltr');
});

test('the app sets <html lang dir>', () => {
  setAppLanguage('he');
  expect(html()).toEqual({ lang: 'he', dir: 'rtl' });
});

test('a page language wins while the page is open', () => {
  setAppLanguage('ru');
  setPageLanguage('he');
  expect(html()).toEqual({ lang: 'he', dir: 'rtl' });
});

test('closing the page restores the app language as it is NOW, not as it was when the page opened', () => {
  // the sign-in page opens while signed out (app default Hebrew), the person signs in as an English user
  setAppLanguage('he');
  setPageLanguage('en');
  setAppLanguage('en'); // the signed-in person's language arrives while the sign-in page is still up
  setPageLanguage(null); // the sign-in page closes
  expect(html()).toEqual({ lang: 'en', dir: 'ltr' });
});
