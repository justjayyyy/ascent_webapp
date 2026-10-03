// The app opens on the numbers it saved on the device, then brings them up to date.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { expense } from '../../support/factories.js';
import { ExpensesScreen } from '../../screens/ExpensesScreen.js';

const savedOnDevice = (page) => page.evaluate(() => new Promise((resolve) => {
  const open = indexedDB.open('keyval-store');
  open.onsuccess = () => {
    const req = open.result.transaction('keyval').objectStore('keyval').get('ascent:rq-cache');
    req.onsuccess = () => resolve(JSON.stringify(req.result?.clientState?.queries?.map((q) => q.queryKey[0]) || []));
    req.onerror = () => resolve('[]');
  };
  open.onerror = () => resolve('[]');
}));

test('reopening the app shows what was added elsewhere meanwhile, not only what this device saved @critical @multiuser', async ({ page, member }) => {
  const partner = await member('editor');
  await openApp(page, '/Expenses');
  const expenses = new ExpensesScreen(page);
  await expenses.addExpense({ amount: 12, description: 'Coffee before' });
  await expect(expenses.row('Coffee before')).toBeVisible();
  // This device has saved its lists, as it does for opening offline next time
  await expect.poll(() => savedOnDevice(page)).toContain('transactions');

  // Meanwhile the partner adds an expense on their phone
  await partner.api.create('transactions', expense({ amount: 64, description: 'Added on the other phone' }));

  // Opened again (another page of the app, so its lists mount after the saved ones were restored)
  await openApp(page, '/Dashboard');
  await openApp(page, '/Expenses');
  await expect(expenses.row('Added on the other phone')).toBeVisible();
});
