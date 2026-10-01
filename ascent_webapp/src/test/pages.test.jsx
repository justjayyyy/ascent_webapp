// Every main screen renders in every language: the real app (router, auth, client, hooks, offline queue)
// against an in-memory API. Catches crashes, missing data wiring and right-to-left mistakes.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeFetch, seedData } from './fakeApi';
import { translations } from '@/lib/translations';

const idb = vi.hoisted(() => new Map());
vi.mock('idb-keyval', () => ({
  get: async (k) => idb.get(k),
  set: async (k, v) => { idb.set(k, v); },
  del: async (k) => { idb.delete(k); },
  keys: async () => [...idb.keys()],
}));
vi.mock('@vercel/analytics/react', () => ({ Analytics: () => null }));
// NumberFlow is a custom element jsdom cannot run; show the formatted number instead
vi.mock('@number-flow/react', () => ({
  default: ({ value, locales, format, className }) => <span className={className}>{new Intl.NumberFormat(locales, format).format(value)}</span>,
}));
vi.mock('@vercel/speed-insights/react', () => ({ SpeedInsights: () => null }));
// ECharts needs a real canvas; the charts' data is covered by the pages' own numbers
vi.mock('@/components/charts/EChart', () => ({
  default: () => <div data-testid="chart" />,
  useChartTokens: () => ({ series: ['#111', '#222', '#333', '#444', '#555'], text: '#000', muted: '#666', grid: '#eee', card: '#fff' }),
  withAlpha: (c) => c,
}));

const { default: App } = await import('@/App');
const { queryClientInstance } = await import('@/lib/query-client');

let api;
let consoleErrors;
beforeEach(() => {
  idb.clear();
  queryClientInstance.clear();
  consoleErrors = [];
  vi.spyOn(console, 'error').mockImplementation((...args) => consoleErrors.push(args.map(String).join(' ')));
});
afterEach(() => vi.unstubAllGlobals());

function openApp(path, language) {
  api = fakeFetch(seedData({ language }));
  vi.stubGlobal('fetch', vi.fn(api.fetchImpl));
  localStorage.setItem('ascent_access_token', 'test-token');
  window.history.pushState({}, '', path);
  return render(<App />);
}

// Something only that page shows once its data has loaded
const PAGES = {
  '/Dashboard': () => screen.findAllByText(/Rome|Car loan|₪/),
  '/Expenses': () => screen.findAllByText('Shufersal'),
  '/Income': () => screen.findAllByText('Salary'),
  '/Plans': () => screen.findAllByText('Rome'),
  '/Commitments': () => screen.findAllByText('Car loan'),
  '/Notes': () => screen.findAllByText('milk'),
  '/Settings': () => screen.findAllByDisplayValue('Dana'),
};

describe.each(['en', 'he', 'ru'])('in %s', (language) => {
  test.each(Object.keys(PAGES))('%s renders with its data', async (path) => {
    openApp(path, language);
    const found = await PAGES[path]();
    expect(found.length).toBeGreaterThan(0);
    await waitFor(() => expect(document.documentElement.lang).toBe(language));
    expect(document.documentElement.dir).toBe(language === 'he' ? 'rtl' : 'ltr');
    if (screen.queryByText(translations[language].errTitle)) throw new Error(`CRASH: ${consoleErrors.join(' | ').slice(0, 1500)}`);
    expect(screen.queryByText(translations[language].errTitle)).toBeNull();
    expect(consoleErrors.filter((e) => !/Warning:/.test(e))).toEqual([]);
  }, 20000);
});

test('the app asks only for the workspace it shows, and for a date window rather than everything', async () => {
  openApp('/Expenses', 'en');
  await screen.findAllByText('Shufersal');
  const txCalls = api.calls.filter((c) => c.path === '/api/entities/transactions');
  expect(txCalls.length).toBeGreaterThan(0);
  // a window, a link view, or the one-row lookup of the oldest date; never the whole history
  expect(txCalls.every((c) => c.query.from || c.query.has || c.query.limit === '1')).toBe(true);
  const dataCalls = api.calls.filter((c) => c.path.startsWith('/api/entities/'));
  expect(dataCalls.every((c) => c.workspace === 'w1')).toBe(true);
});

test('adding an expense through the dialog saves it to the open workspace and shows it', async () => {
  const user = userEvent.setup();
  openApp('/Expenses', 'en');
  await screen.findAllByText('Shufersal');
  await user.click(screen.getAllByRole('button', { name: translations.en.addExpense })[0]);
  const dialog = await screen.findByRole('dialog');
  await user.type(within(dialog).getByPlaceholderText('0.00'), '64.5');
  await user.type(within(dialog).getByPlaceholderText(translations.en.descriptionPlaceholder), 'Bakery');
  await user.click(within(dialog).getByRole('button', { name: translations.en.addTransaction }));
  await waitFor(() => expect(api.calls.some((c) => c.method === 'POST' && c.path === '/api/entities/transactions')).toBe(true));
  const post = api.calls.find((c) => c.method === 'POST' && c.path === '/api/entities/transactions');
  expect(post.workspace).toBe('w1');
  expect(post.body).toMatchObject({ amount: 64.5, description: 'Bakery', type: 'Expense', currency: 'ILS' });
  expect(post.body.dedupeKey).toMatch(/^app:/);
  expect(await screen.findAllByText('Bakery')).not.toHaveLength(0);
}, 20000);

test('a page someone may not open sends them to one they can', async () => {
  const data = seedData();
  data.workspaces[0].ownerId = 'u9';
  data.workspaces[0].members[0] = { _id: 'm1', userId: 'u1', email: 'dana@x.test', status: 'accepted', role: 'viewer', permissions: { viewNotes: true } };
  const fake = fakeFetch(data);
  vi.stubGlobal('fetch', vi.fn(fake.fetchImpl));
  localStorage.setItem('ascent_access_token', 'test-token');
  window.history.pushState({}, '', '/Expenses');
  render(<App />);
  await waitFor(() => expect(window.location.pathname).toBe('/Notes'));
  expect(await screen.findAllByText('milk')).not.toHaveLength(0);
});
