// The recap plays every story without crashing, whatever the month holds.
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { loadLanguage, translations } from '@/lib/translations';

// NumberFlow is a custom element jsdom cannot run; show the number instead
vi.mock('@number-flow/react', () => ({ default: ({ value, className }) => <span className={className}>{value}</span> }));
const { default: RecapStories } = await import('./RecapStories');

afterEach(cleanup);

const play = async (rows) => {
  await loadLanguage('en');
  const t = (k) => translations.en[k] ?? k;
  const errors = [];
  vi.spyOn(console, 'error').mockImplementation((...args) => errors.push(args.map(String).join(' ')));
  render(<RecapStories open onClose={() => {}} month={new Date(2026, 8, 1)} rows={rows} members={[]} t={t} language="en" isRTL={false} currency="ILS" blur={false} />);
  for (let i = 0; i < 12; i++) fireEvent.keyDown(window, { key: 'ArrowRight' });
  expect(errors).toEqual([]);
  expect(screen.getByRole('dialog')).toBeTruthy();
};

test('a month with income and no spending', () => play([{ type: 'Income', date: '2026-09-30', _amount: 9000 }]));

test('a month with spending and no income', () => play([
  { type: 'Expense', date: '2026-08-03', _amount: 50, category: 'food' },
  { type: 'Expense', date: '2026-09-05', _amount: 80, category: 'food' },
]));
