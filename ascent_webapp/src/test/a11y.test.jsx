// Accessibility of every main screen, through the real app against the in-memory API, checked with axe.
// jsdom has no layout, so colour contrast and anything that needs real rendering are left to a browser
// audit; this catches what the markup alone decides (names, roles, labels, ARIA, landmarks).
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { translations } from '@/lib/translations';
import axe from 'axe-core';
import { fakeFetch, seedData } from './fakeApi';

const idb = vi.hoisted(() => new Map());
vi.mock('idb-keyval', () => ({
  get: async (k) => idb.get(k),
  set: async (k, v) => { idb.set(k, v); },
  del: async (k) => { idb.delete(k); },
  keys: async () => [...idb.keys()],
}));
vi.mock('@vercel/analytics/react', () => ({ Analytics: () => null }));
vi.mock('@vercel/speed-insights/react', () => ({ SpeedInsights: () => null }));
vi.mock('@number-flow/react', () => ({
  default: ({ value, locales, format, className }) => <span className={className}>{new Intl.NumberFormat(locales, format).format(value)}</span>,
}));
vi.mock('@/components/charts/EChart', () => ({
  default: () => <div data-testid="chart" />,
  useChartTokens: () => ({ series: ['#111', '#222', '#333', '#444', '#555'], text: '#000', muted: '#666', grid: '#eee', card: '#fff' }),
  withAlpha: (c) => c,
}));

const { default: App } = await import('@/App');
const { queryClientInstance } = await import('@/lib/query-client');

beforeEach(() => {
  idb.clear();
  queryClientInstance.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

function openApp(path, { signedIn = true } = {}) {
  vi.stubGlobal('fetch', vi.fn(fakeFetch(seedData()).fetchImpl));
  if (signedIn) localStorage.setItem('ascent_access_token', 'test-token');
  window.history.pushState({}, '', path);
  return render(<App />);
}

const RULES_NEEDING_LAYOUT = ['color-contrast', 'target-size'];
// Serious and critical problems fail the test; the rest are listed in the failure message only if any fail
async function problems() {
  const result = await axe.run(document.body, {
    rules: Object.fromEntries(RULES_NEEDING_LAYOUT.map((id) => [id, { enabled: false }])),
    resultTypes: ['violations'],
  });
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.html.slice(0, 160)).join('\n    ')}`);
}

const SCREENS = {
  '/Dashboard': () => screen.findAllByText(/Rome|Car loan|₪/),
  '/Expenses': () => screen.findAllByText('Shufersal'),
  '/Income': () => screen.findAllByText('Salary'),
  '/Plans': () => screen.findAllByText('Rome'),
  '/Plans?plan=p1': () => screen.findAllByText('Hotel'),
  '/Commitments': () => screen.findAllByText('Car loan'),
  '/Notes': () => screen.findAllByText('milk'),
  '/Settings': () => screen.findAllByDisplayValue('Dana'),
};

test.each(Object.keys(SCREENS))('%s has no serious accessibility problems', async (path) => {
  openApp(path);
  await SCREENS[path]();
  expect(await problems()).toEqual([]);
}, 30000);

test('the sign-in page has no serious accessibility problems', async () => {
  localStorage.setItem('ascent_login_lang', 'he');
  openApp('/login', { signedIn: false });
  await screen.findAllByRole('textbox');
  expect(await problems()).toEqual([]);
}, 30000);

test('the add-expense dialog has no serious accessibility problems', async () => {
  const user = userEvent.setup();
  openApp('/Expenses');
  await screen.findAllByText('Shufersal');
  await user.click(screen.getAllByRole('button', { name: translations.en.addExpense })[0]);
  await screen.findByRole('dialog');
  expect(await problems()).toEqual([]);
}, 30000);
