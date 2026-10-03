// Plans: a big event paid for over months, its costs, and two people adding to it at once.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { day } from '../../support/factories.js';
import { L } from '../../support/i18n.js';
import { PlansScreen } from '../../screens/PlansScreen.js';

const plan = (over = {}) => ({ name: 'Summer trip', kind: 'vacation', startDate: day(90), budget: 0, currency: 'USD', items: [], ...over });

test('a vacation plan starts with the usual costs, each due before the trip @critical', async ({ page, api }) => {
  await openApp(page, '/Plans');
  const plans = new PlansScreen(page);
  const tripDay = day(120);
  await plans.createFromKind('vacation', { name: 'Japan', date: tripDay, budget: 8000 });

  await expect(page.getByRole('heading', { name: /Japan/ })).toBeVisible();
  await expect.poll(async () => (await api.list('plans')).length).toBe(1);
  const [saved] = await api.list('plans');
  expect(saved).toMatchObject({ name: 'Japan', kind: 'vacation', startDate: tripDay, budget: 8000 });
  expect(saved.items.length).toBeGreaterThan(0);
  expect(saved.items.every((i) => !i.dueDate || i.dueDate <= tripDay)).toBe(true);
});

test('adding a cost puts it on the plan and in what is still to pay @critical', async ({ page, api }) => {
  await api.create('plans', plan());
  await openApp(page, '/Plans');
  const plans = new PlansScreen(page);
  await plans.open('Summer trip');
  await plans.addCost({ name: 'Flights', amount: 900, dueDate: day(30) });

  await expect(page.getByText('Flights').first()).toBeVisible();
  await expect.poll(async () => (await api.list('plans'))[0].items.map((i) => [i.name, i.amount, i.dueDate, i.status]))
    .toEqual([['Flights', 900, day(30), 'planned']]);
  const summary = page.getByRole('region', { name: L('planSummary') }).or(page.getByLabel(L('planSummary')));
  await expect(summary.first()).toContainText('$900');
});

test('two people adding costs to one plan at the same time keep both @critical @multiuser', async ({ page, api, member }) => {
  const saved = await api.create('plans', plan());
  const partner = await member('editor');
  await openApp(page, '/Plans');
  const plans = new PlansScreen(page);
  await plans.open('Summer trip');

  // The partner adds a cost from their phone while this page is open, then this person adds another
  await partner.api.call('PATCH', `/entities/plans?id=${saved.id}&list=items`, { op: 'put', item: { id: 'car-1', name: 'Car rental', amount: 400, status: 'planned' } });
  await plans.addCost({ name: 'Hotel', amount: 1200 });

  await expect.poll(async () => (await api.list('plans'))[0].items.map((i) => i.name).sort()).toEqual(['Car rental', 'Hotel']);
  await expect(page.getByText('Car rental').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Hotel').first()).toBeVisible();
});
