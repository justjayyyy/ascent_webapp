import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import { LANGUAGES, loadLanguage } from '@/lib/translations';

// The app loads its language before the first render (main.jsx); tests have every language ready
await Promise.all(LANGUAGES.map(loadLanguage));

// Whole screens load lazily; on a busy machine (CI) that can take longer than the 1s default
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

// jsdom has no matchMedia; components read it for theme and reduced motion
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  });
}

// Browser APIs jsdom does not have; the app only needs them to exist
class NoopObserver { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
globalThis.ResizeObserver ??= NoopObserver;
globalThis.IntersectionObserver ??= NoopObserver;
window.scrollTo = () => {};
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
Element.prototype.scrollTo ??= function scrollTo() {};
Element.prototype.scrollBy ??= function scrollBy() {};
