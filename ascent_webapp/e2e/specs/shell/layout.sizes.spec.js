// The sizes between a phone and a desktop, where the layout switches between the dock and the sidebar: every main
// screen fits the width.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { expense } from '../../support/factories.js';
import { offScreen, settleAnimations, waitForPageReady } from '../../support/layout.js';

const PAGES = ['Dashboard', 'Review', 'Expenses', 'Income', 'Plans', 'Commitments', 'Savings', 'Notes', 'Groceries', 'Tasks', 'Settings'];
// Settings stops Playwright's WebKit (Windows and Linux builds) about a second after it opens; it is checked in
// Chromium here and waits for a real iPhone in WebKit (TEST_PLAN.md §0.2.3)
const pagesFor = (browserName) => (browserName === 'webkit' ? PAGES.filter((p) => p !== 'Settings') : PAGES);
const SIZES = { 'tablet portrait': { width: 768, height: 1024 }, 'tablet landscape': { width: 1024, height: 768 }, 'small laptop': { width: 1280, height: 720 } };

for (const [label, size] of Object.entries(SIZES)) {
  test(`every screen fits a ${label} (${size.width}px) @critical`, async ({ page, api, browserName }) => {
    test.slow();
    await page.setViewportSize(size);
    await api.create('transactions', expense({ description: 'Coffee', amount: 14 }));
    for (const name of pagesFor(browserName)) {
      await openApp(page, `/${name}`);
      await waitForPageReady(page);
      await settleAnimations(page);
      expect.soft(await page.evaluate(offScreen), `${name} at ${size.width}px`).toEqual({ page: 0, cut: [] });
    }
  });
}
