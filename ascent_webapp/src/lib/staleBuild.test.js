import { beforeEach, expect, test, vi } from 'vitest';
import { isStaleBuildError, reloadForNewBuild } from './staleBuild';

beforeEach(() => sessionStorage.clear());

test('a missing module from an earlier release is told apart from other errors', () => {
  expect(isStaleBuildError(new SyntaxError("Unexpected token '<'"))).toBe(true);
  expect(isStaleBuildError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/pencil-1.js'))).toBe(true);
  expect(isStaleBuildError(new TypeError('error loading dynamically imported module'))).toBe(true);
  expect(isStaleBuildError(new TypeError('Importing a module script failed.'))).toBe(true);
  expect(isStaleBuildError(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(false);
  expect(isStaleBuildError(null)).toBe(false);
});

test('the page loads again once, and not again within a minute', () => {
  const reload = vi.fn();
  expect(reloadForNewBuild({ reload, now: 1_000_000 })).toBe(true);
  expect(reloadForNewBuild({ reload, now: 1_030_000 })).toBe(false);
  expect(reload).toHaveBeenCalledTimes(1);
  expect(reloadForNewBuild({ reload, now: 1_061_000 })).toBe(true);
  expect(reload).toHaveBeenCalledTimes(2);
});
