import { expect, test, vi } from 'vitest';
import { durationText, kindOf, commitmentEmoji, monthYear } from './commitmentUtils';

vi.mock('@/hooks/useWorkspaceData', () => ({ useMoney: () => ({}) }));

const t = (k) => ({ cmYears: '{n} yrs', cmMonths: '{n} mo' }[k]);

test('durations read as years and months', () => {
  expect(durationText(53, t)).toBe('4 yrs 5 mo');
  expect(durationText(24, t)).toBe('2 yrs');
  expect(durationText(0, t)).toBe('0 mo');
  expect(durationText(null, t)).toBe('');
});

test('kinds and emoji', () => {
  expect(kindOf('car').category).toBe('transportation');
  expect(kindOf('???').key).toBe('other');
  expect(commitmentEmoji({ kind: 'mortgage' })).toBe('🏠');
  expect(commitmentEmoji({ kind: 'mortgage', emoji: '🏡' })).toBe('🏡');
  expect(monthYear('2026-12-01', 'en-US')).toBe('Dec 2026');
  expect(monthYear(null, 'en-US')).toBe('');
});
