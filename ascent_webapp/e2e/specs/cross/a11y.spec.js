// Accessibility of the main screens in the real browser (WCAG 2.2 A/AA with axe), in every palette, light and dark.
// The colours come from the rendered page, so this is where contrast is checked.
import { test } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { expectAccessible } from '../../support/a11y.js';
import { expense, income } from '../../support/factories.js';
import { L } from '../../support/i18n.js';
import { settleAnimations, waitForPageReady } from '../../support/layout.js';

// src/components/ThemeProvider.jsx (PALETTES) × the account's light or dark theme
const PALETTES = ['indigo', 'gold', 'graphite', 'ivory', 'burgundy', 'slate', 'twilight'];

async function settled(page, path) {
  await openApp(page, path);
  // axe is heavy: with several of these running side by side, pages take longer to settle
  await waitForPageReady(page, { timeout: 30_000 });
  await settleAnimations(page);
}

for (const palette of PALETTES) {
  for (const theme of ['light', 'dark']) {
    test(`main screens and the expense dialog meet WCAG AA: ${palette} ${theme} @a11y`, async ({ page, api }) => {
      test.slow();
      await page.request.put('/api/auth/me', { data: { theme } });
      await page.addInitScript((p) => { try { localStorage.setItem('ascent_palette', p); } catch { /* storage unavailable */ } }, palette);
      await api.create('transactions', income({ amount: 5000, category: 'freelance' }));
      await api.create('transactions', expense({ amount: 120, description: 'Groceries run', category: 'groceries' }));

      for (const path of ['/Dashboard', '/Expenses', '/Plans', '/Notes', '/Settings']) {
        await settled(page, path);
        await expectAccessible(page, `${path} ${palette} ${theme}`);
      }
      await settled(page, '/Expenses');
      await page.getByRole('button', { name: L('addExpense') }).first().click();
      await settleAnimations(page);
      await expectAccessible(page, `add expense dialog ${palette} ${theme}`, { include: '[role=dialog]' });
    });
  }
}
