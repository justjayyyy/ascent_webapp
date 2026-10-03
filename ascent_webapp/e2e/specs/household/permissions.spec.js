// What each member may do: the screens hide what they may not, and the API refuses it all the same.
import { test, expect } from '../../fixtures.js';
import { openApp } from '../../support/app.js';
import { expense } from '../../support/factories.js';
import { L } from '../../support/i18n.js';
import { ExpensesScreen } from '../../screens/ExpensesScreen.js';

const nav = (page) => page.getByRole('navigation', { name: L('mainNavigation') });

test('a viewer sees the money but cannot change it, on screen or through the API @critical', async ({ api, member }) => {
  await api.create('transactions', expense({ description: 'Owner lunch', amount: 40 }));
  const viewer = await member('viewer');

  await openApp(viewer.page, '/Expenses');
  await expect(viewer.page.getByText('Owner lunch').first()).toBeVisible();
  await expect(viewer.page.getByRole('button', { name: L('addExpense') })).toHaveCount(0);
  // Its drawer offers nothing to change
  await viewer.page.getByRole('button', { name: /Owner lunch/ }).first().click();
  const drawer = viewer.page.getByRole('dialog', { name: 'Owner lunch' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('button', { name: L('edit') })).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: L('delete') })).toHaveCount(0);

  expect((await viewer.api.send('POST', '/entities/transactions', expense({ description: 'Sneaky' }))).status()).toBe(403);
  const [row] = await api.list('transactions');
  expect((await viewer.api.send('DELETE', `/entities/transactions?id=${row.id}`)).status()).toBe(403);
  expect((await api.list('transactions')).map((t) => t.description)).toEqual(['Owner lunch']);

  // Notes: may read, may not write
  await openApp(viewer.page, '/Notes');
  await expect(viewer.page.getByText(L('ntTakeNote'))).toHaveCount(0);
  expect((await viewer.api.send('POST', '/entities/notes', { title: 'x', content: 'y' })).status()).toBe(403);
});

test('an editor adds and changes money but does not manage people or cards @critical', async ({ api, member }) => {
  const editor = await member('editor');
  await openApp(editor.page, '/Expenses');
  await new ExpensesScreen(editor.page).addExpense({ amount: 12, description: 'By the editor' });
  await expect.poll(async () => (await api.list('transactions')).length).toBe(1);

  await openApp(editor.page, '/Settings');
  await expect(editor.page.getByText(L('wsReadOnlyHint'))).toBeVisible();
  await expect(editor.page.getByRole('button', { name: L('wsInviteMember') })).toHaveCount(0);
  await expect(editor.page.getByRole('button', { name: L('addCard') })).toHaveCount(0);
  const invite = await editor.api.send('POST', `/workspaces?id=${editor.workspaceId}&action=invite`, { email: 'friend@e2e.test', role: 'viewer' });
  expect(invite.status()).toBe(403);
  expect((await editor.api.send('POST', '/entities/cards', { name: 'Mine', lastFourDigits: '1234', cardType: 'credit' })).status()).toBe(403);
});

test('a member with notes only sees no money at all: no pages, no data @critical', async ({ member }) => {
  const notesOnly = await member('editor', { permissions: { viewNotes: true, editNotes: true } });
  await openApp(notesOnly.page, '/Notes');
  for (const key of ['dashboard', 'expenses', 'income', 'plans', 'cmNavShort', 'svTitle']) {
    await expect(nav(notesOnly.page).getByRole('link', { name: L(key), exact: true })).toHaveCount(0);
  }
  // Asking for a money page by its address lands on the first page they may open
  await notesOnly.page.goto('/Expenses');
  await expect(notesOnly.page).toHaveURL(/\/Notes$/);
  for (const entity of ['transactions', 'budgets', 'plans', 'commitments', 'goals']) {
    expect((await notesOnly.api.send('GET', `/entities/${entity}`)).status(), entity).toBe(403);
  }
});

test('without the goals permission, Savings is hidden and its address leads to the Dashboard @critical', async ({ member }) => {
  const noGoals = await member('editor', { permissions: { viewExpenses: true, editExpenses: true, viewBudgets: true, viewNotes: true } });
  await openApp(noGoals.page, '/Dashboard');
  await expect(nav(noGoals.page).getByRole('link', { name: L('svTitle'), exact: true })).toHaveCount(0);
  await noGoals.page.goto('/Savings');
  await expect(noGoals.page).toHaveURL(/\/Dashboard$/);
  expect((await noGoals.api.send('GET', '/entities/goals')).status()).toBe(403);
});
