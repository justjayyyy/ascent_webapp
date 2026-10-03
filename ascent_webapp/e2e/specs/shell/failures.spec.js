// When the server cannot give a page its transactions, the page says so instead of drawing an empty month as if it
// were the household's money (DSH-N02, NAV-N02-N04), and Try again recovers once the server answers.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { expense } from '../../support/factories.js';
import { L } from '../../support/i18n.js';

const FAILURES = {
  'a server error': { status: 500, json: { success: false, error: 'Internal server error' } },
  'a broken answer': { status: 200, contentType: 'application/json', body: '{"success": tr' },
  'too many requests': { status: 429, json: { success: false, error: 'Too many requests. Please try again later.' } },
  'the database unavailable': { status: 503, json: { success: false, error: 'Database connection failed' } },
};

/** Lists of transactions fail while `failing.on`; everything else goes through */
async function failTransactions(page, answer) {
  const failing = { on: true };
  await page.route(/\/api\/entities\/transactions/, (route) => (failing.on && route.request().method() === 'GET' ? route.fulfill(answer) : route.continue()));
  return failing;
}

for (const [name, answer] of Object.entries(FAILURES)) {
  test(`with ${name}, the Dashboard says its numbers are not complete, and Try again recovers @critical`, async ({ page, api }) => {
    await api.create('transactions', expense({ description: 'Coffee beans', amount: 25 }));
    const failing = await failTransactions(page, answer);
    await openApp(page, '/Dashboard');
    const banner = page.getByRole('alert').filter({ hasText: L('loadFailedTransactions') });
    await expect(banner).toBeVisible({ timeout: 20_000 });

    failing.on = false;
    await banner.getByRole('button', { name: L('loadFailedRetry') }).click();
    await expect(banner).toBeHidden();
    await expect(page.getByText('Coffee beans').first()).toBeVisible();
  });
}

test('Expenses and the monthly review say so too @critical', async ({ page, api }) => {
  await api.create('transactions', expense({ description: 'Coffee beans', amount: 25 }));
  await failTransactions(page, FAILURES['a server error']);
  for (const path of ['/Expenses', '/Review']) {
    await openApp(page, path);
    await expect(page.getByRole('alert').filter({ hasText: L('loadFailedTransactions') }), path).toBeVisible({ timeout: 20_000 });
  }
});
