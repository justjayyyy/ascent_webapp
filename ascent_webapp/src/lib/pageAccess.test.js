import { expect, test } from 'vitest';
import { PAGE_PERMISSIONS, firstAllowedPage } from './pageAccess';

const can = (...perms) => (p) => perms.includes(p);

test('money pages need permission to view expenses; Notes and Settings do not', () => {
  for (const page of ['Dashboard', 'Expenses', 'Income', 'Plans', 'Commitments']) expect(PAGE_PERMISSIONS[page]).toBe('viewExpenses');
  expect(PAGE_PERMISSIONS.Notes).toBeUndefined();
  expect(PAGE_PERMISSIONS.Settings).toBeUndefined();
});

test('someone who cannot open a page is sent to the first one they can', () => {
  expect(firstAllowedPage(can('viewExpenses'))).toBe('Dashboard');
  expect(firstAllowedPage(can())).toBe('Notes');
});
