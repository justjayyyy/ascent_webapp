import { expect, test } from 'vitest';
import { NAV_SECTIONS, PAGE_LABELS, visibleSections } from './navSections';

const can = (...perms) => (p) => perms.includes(p);

test('every page but Settings is in exactly one section, and has a name', () => {
  const pages = NAV_SECTIONS.flatMap((s) => s.pages);
  expect(new Set(pages).size).toBe(pages.length);
  expect([...pages].sort()).toEqual(['Commitments', 'Dashboard', 'Expenses', 'Groceries', 'Income', 'Notes', 'Plans', 'Review', 'Savings', 'Tasks']);
  for (const page of pages) expect(PAGE_LABELS[page]).toBeTruthy();
});

test('expenses and income, the dashboard and its review, and plans, loans and savings share a section', () => {
  const all = visibleSections(() => true);
  expect(all.map((s) => s.id)).toEqual(['overview', 'money', 'planning', 'notes', 'groceries', 'tasks']);
  expect(all.find((s) => s.id === 'money').pages).toEqual(['Expenses', 'Income']);
  expect(all.find((s) => s.id === 'planning').pages).toEqual(['Plans', 'Commitments', 'Savings']);
});

test('a section keeps only the pages a member may open, and goes when there are none', () => {
  const noGoals = visibleSections(can('viewExpenses'));
  expect(noGoals.find((s) => s.id === 'planning').pages).toEqual(['Plans', 'Commitments']);

  const goalsOnly = visibleSections(can('viewGoals'));
  expect(goalsOnly.map((s) => s.id)).toEqual(['planning', 'notes', 'groceries', 'tasks']);
  expect(goalsOnly[0].pages).toEqual(['Savings']);

  expect(visibleSections(can()).map((s) => s.id)).toEqual(['notes', 'groceries', 'tasks']);
});
