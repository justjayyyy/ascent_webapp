import { expect, test } from 'vitest';
import { NAV_SECTIONS, PAGE_LABELS, visibleSections } from './navSections';

const can = (...perms) => (p) => perms.includes(p);

test('every page but Settings is in exactly one section, and has a name', () => {
  const pages = NAV_SECTIONS.flatMap((s) => s.pages);
  expect(new Set(pages).size).toBe(pages.length);
  expect([...pages].sort()).toEqual(['Commitments', 'Dashboard', 'Expenses', 'Groceries', 'Income', 'Notes', 'Plans', 'Review', 'Savings', 'Tasks']);
  for (const page of pages) expect(PAGE_LABELS[page]).toBeTruthy();
});

test('expenses and income are tabs, plans, loans and savings a sidebar group, and the review sits under the dashboard', () => {
  const all = visibleSections(() => true);
  const byId = Object.fromEntries(all.map((s) => [s.id, s]));
  expect(all.map((s) => s.id)).toEqual(['overview', 'money', 'longTerm', 'notes', 'groceries', 'tasks']);
  expect(byId.money).toMatchObject({ layout: 'tabs', pages: ['Expenses', 'Income'] });
  expect(byId.longTerm).toMatchObject({ layout: 'submenu', pages: ['Plans', 'Commitments', 'Savings'] });
  expect(byId.overview.pages).toEqual(['Dashboard', 'Review']);
  expect(byId.overview.layout).toBeUndefined();
});

test('a section keeps only the pages a member may open, and goes when there are none', () => {
  const noGoals = visibleSections(can('viewExpenses'));
  expect(noGoals.find((s) => s.id === 'longTerm').pages).toEqual(['Plans', 'Commitments']);

  const goalsOnly = visibleSections(can('viewGoals'));
  expect(goalsOnly.map((s) => s.id)).toEqual(['longTerm', 'notes', 'groceries', 'tasks']);
  expect(goalsOnly[0].pages).toEqual(['Savings']);

  expect(visibleSections(can()).map((s) => s.id)).toEqual(['notes', 'groceries', 'tasks']);
});
