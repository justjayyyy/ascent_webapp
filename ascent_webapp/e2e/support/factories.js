// Rows for setting up a test, with sensible defaults; pass only what the test is about.
// Dates are relative to today, never fixed, so a test means the same thing on any day it runs.
import { format, subDays, addDays } from 'date-fns';

export const day = (offset = 0) => format(offset >= 0 ? addDays(new Date(), offset) : subDays(new Date(), -offset), 'yyyy-MM-dd');
export const today = () => day(0);

let n = 0;
const uid = (label) => `${label}-${Date.now().toString(36)}-${(n++).toString(36)}`;

/** An expense. Default categories are stored by key ('food_dining', 'groceries', ...) and translated on screen. */
export const expense = (over = {}) => ({
  type: 'Expense', amount: 25, currency: 'USD', category: 'food_dining', description: uid('Expense'), date: today(), ...over,
});

export const income = (over = {}) => ({
  type: 'Income', amount: 3000, currency: 'USD', category: 'salary', description: uid('Income'), date: today(), ...over,
});

export const budget = (over = {}) => {
  const now = new Date();
  return { category: 'food_dining', monthlyLimit: 1000, currency: 'USD', period: 'monthly', year: now.getFullYear(), month: now.getMonth() + 1, alertThreshold: 80, ...over };
};
