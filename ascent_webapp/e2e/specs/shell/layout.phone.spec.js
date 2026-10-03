// Phone layout (iPhone 13 size, touch), in each language: every main screen fits the width, every control is big
// enough to tap (44px, DESIGN.md), Hebrew reads right to left, and no untranslated key shows. The menu moves between
// screens.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { expense } from '../../support/factories.js';
import { L } from '../../support/i18n.js';
import { offScreen, settleAnimations, smallTouchTargets, waitForPageReady } from '../../support/layout.js';
import en from '../../../src/lib/i18n/en.js';
import { Shell } from '../../screens/Shell.js';

// Every page in src/pages.config.js
const PAGES = ['Dashboard', 'Review', 'Expenses', 'Income', 'Plans', 'Commitments', 'Savings', 'Notes', 'Groceries', 'Tasks', 'Settings'];
// Translation keys that read like words could show legitimately; the ones checked look like code (camelCase)
const KEYS = Object.keys(en).filter((k) => /[a-z][A-Z]/.test(k));

/** Runs in the page: visible text that is exactly a translation key, i.e. a string that was never translated. */
function untranslated(keys) {
  const set = new Set(keys);
  const found = new Set();
  const walker = document.createTreeWalker(document.querySelector('main') || document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (const word of node.textContent.split(/[\s.,:;!?()"'«»]+/)) if (set.has(word)) found.add(word);
  }
  return [...found].slice(0, 5);
}

for (const language of ['en', 'he', 'ru']) {
  for (const name of PAGES) {
    test(`${name} in ${language}: fits the phone, 44px to tap, nothing untranslated @critical`, async ({ page, api }) => {
      await page.request.put('/api/auth/me', { data: { language } });
      await api.create('transactions', expense({ description: 'Coffee', amount: 14 }));
      await openApp(page, `/${name}`);
      await waitForPageReady(page);
      await settleAnimations(page);

      await expect(page.locator('html')).toHaveAttribute('dir', language === 'he' ? 'rtl' : 'ltr');
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      expect(await page.evaluate(offScreen), `${name} is wider than the phone`).toEqual({ page: 0, cut: [] });
      expect.soft(await page.evaluate(smallTouchTargets), `controls on ${name} under 44px to tap`).toEqual([]);
      expect.soft(await page.evaluate(untranslated, KEYS), `untranslated strings on ${name}`).toEqual([]);
    });
  }
}

test('the menu moves between screens @smoke @critical', async ({ page, owner: _owner }) => {
  await openApp(page, '/Dashboard');
  const shell = new Shell(page);
  for (const [key, path] of [['expenses', /\/Expenses/], ['notes', /\/Notes/], ['dashboard', /\/Dashboard/]]) {
    await shell.goByMenu(key);
    await expect(page).toHaveURL(path);
    await expect(shell.menuButton).toHaveAttribute('aria-expanded', 'false');
  }
});

for (const language of ['en', 'he', 'ru']) {
  test(`the sign-in page fits the phone in ${language} @critical`, async ({ page }) => {
    // The language the page was last shown in (src/lib/storageKeys.js LOGIN_LANG_KEY)
    await page.addInitScript((lang) => { try { localStorage.setItem('ascent_login_lang', lang); } catch { /* storage unavailable */ } }, language);
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('dir', language === 'he' ? 'rtl' : 'ltr');
    await expect(page.getByRole('button', { name: L('authContinue', {}, language), exact: true }).first()).toBeVisible();
    expect(await page.evaluate(offScreen), `sign-in in ${language}`).toEqual({ page: 0, cut: [] });
  });
}
