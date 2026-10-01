import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { periodFor, periodSummary, renderSummaryEmail, amountIn } from './summaryEmail.js';
import { cronAuthorized } from './cronAuth.js';
import { getEmailTemplate } from './email-templates.js';

const at = (p) => pathToFileURL(new URL(p, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href;
const NOW = new Date('2026-10-05T09:00:00Z'); // a Monday, when the weekly cron runs

test('daily covers yesterday; weekly covers the seven days ending yesterday', () => {
  assert.deepEqual(periodFor('daily', NOW), { from: '2026-10-04', to: '2026-10-04' });
  assert.deepEqual(periodFor('weekly', NOW), { from: '2026-09-28', to: '2026-10-04' });
});

test('dates are compared as the strings transactions store, not as Date objects', () => {
  const rows = [
    { type: 'Expense', amount: 10, currency: 'ILS', category: 'groceries', date: '2026-09-28' },
    { type: 'Expense', amount: 5, currency: 'ILS', category: 'groceries', date: '2026-10-04' },
    { type: 'Expense', amount: 99, currency: 'ILS', category: 'groceries', date: '2026-09-27' }, // before
    { type: 'Expense', amount: 99, currency: 'ILS', category: 'groceries', date: '2026-10-05' }, // today, not yet over
    { type: 'Income', amount: 100, currency: 'ILS', category: 'salary', date: '2026-10-01' },
  ];
  const s = periodSummary(rows, { from: '2026-09-28', to: '2026-10-04', currency: 'ILS' });
  assert.deepEqual([s.expenses, s.income, s.net, s.count], [15, 100, 85, 3]);
  assert.deepEqual(s.topCategories, [{ category: 'groceries', amount: 15 }]);
});

test('pending (unreviewed) rows are left out, and other currencies use their stored conversion', () => {
  const rows = [
    { type: 'Expense', amount: 10, currency: 'USD', amountInGlobalCurrency: 37, category: 'travel', date: '2026-10-04' },
    { type: 'Expense', amount: 10, currency: 'EUR', category: 'travel', date: '2026-10-04' }, // no conversion
    { type: 'Expense', amount: 50, currency: 'ILS', category: 'travel', date: '2026-10-04', status: 'pending' },
  ];
  const s = periodSummary(rows, { from: '2026-10-04', to: '2026-10-04', currency: 'ILS' });
  assert.equal(s.expenses, 37);
  assert.equal(s.unconverted, 1);
  assert.equal(amountIn({ amount: 4, currency: 'ILS' }, 'ILS'), 4);
  assert.equal(amountIn({ amount: 4 }, 'ILS'), 4, 'old rows without a currency are in the default one');
});

test('the email reads in the person\'s language, with their currency and translated categories', () => {
  const summary = { expenses: 1234, income: 0, net: -1234, count: 2, unconverted: 1, topCategories: [{ category: 'groceries', amount: 1234 }] };
  const period = { from: '2026-09-28', to: '2026-10-04' };
  for (const [language, word] of [['en', 'Groceries'], ['he', 'מכולת'], ['ru', 'Продукты']]) {
    const mail = renderSummaryEmail({ kind: 'weekly', user: { language, currency: 'ILS', full_name: 'Dana' }, summary, period, appUrl: 'https://app.test' });
    assert.ok(mail.text.includes(word), language);
    assert.ok(mail.html.includes(word), language);
    assert.ok(mail.text.includes('https://app.test'));
    assert.match(mail.text, /1/);
  }
  const he = renderSummaryEmail({ kind: 'daily', user: { language: 'he', currency: 'ILS', full_name: 'Dana' }, summary, period: { from: '2026-10-04', to: '2026-10-04' }, appUrl: 'https://app.test' });
  assert.match(he.html, /dir="rtl"/);
  const unknown = renderSummaryEmail({ kind: 'daily', user: { language: 'xx', currency: 'NOPE', email: 'a@b.c' }, summary, period, appUrl: 'https://app.test' });
  assert.match(unknown.subject, /Your day in money/, 'unknown language falls back to English, bad currency does not throw');
});

test('names and categories cannot inject HTML into the email', () => {
  const summary = { expenses: 1, income: 0, net: -1, count: 1, unconverted: 0, topCategories: [{ category: '<img src=x onerror=alert(1)>', amount: 1 }] };
  const mail = renderSummaryEmail({ kind: 'daily', user: { full_name: '<script>x</script>', currency: 'USD' }, summary, period: { from: '2026-10-04', to: '2026-10-04' }, appUrl: 'https://app.test' });
  assert.doesNotMatch(mail.html, /<script>|<img src=x/);
});

test('the template escapes its title and button, and speaks Russian too', () => {
  const html = getEmailTemplate({ language: 'ru', title: '<b>t</b>', body: '<p>ok</p>', cta: { text: 'go', link: 'https://x.test/?a=1&b="2"' } });
  assert.ok(html.includes('&lt;b&gt;t&lt;/b&gt;'));
  assert.ok(html.includes('<p>ok</p>'));
  assert.ok(html.includes('&amp;b=&quot;2&quot;'));
  assert.ok(html.includes('Если кнопка выше не работает'));
});

test('cron routes need the secret; without one they only run locally', () => {
  const req = (authorization) => ({ headers: { authorization } });
  assert.equal(cronAuthorized(req('Bearer s3cret'), { CRON_SECRET: 's3cret' }), true);
  assert.equal(cronAuthorized(req('Bearer wrong!'), { CRON_SECRET: 's3cret' }), false);
  assert.equal(cronAuthorized(req(undefined), { CRON_SECRET: 's3cret' }), false);
  assert.equal(cronAuthorized(req(undefined), { NODE_ENV: 'development' }), true);
  assert.equal(cronAuthorized(req(undefined), { NODE_ENV: 'production' }), false);
  assert.equal(cronAuthorized(req(undefined), { VERCEL: '1' }), false);
});

// The job, against stand-in models
const chain = (v) => ({ select() { return this; }, lean: async () => v });
const db = { users: [], workspaces: [], rows: [], txQueries: [] };
mock.module(at('../models/User.js'), { exports: { default: { find: () => chain(db.users) } } });
mock.module(at('../models/Workspace.js'), {
  exports: { default: { find: (q) => chain(db.workspaces.filter((w) => w.members.some((m) => m.userId === q.members.$elemMatch.userId && m.status === 'accepted'))) } },
});
mock.module(at('../models/ExpenseTransaction.js'), {
  exports: { default: { find: (q) => { db.txQueries.push(q); return chain(db.rows.filter((r) => r.workspaceId === q.workspaceId)); } } },
});
mock.module(at('./rates.js'), { exports: { getRates: async () => ({ USD: 1, ILS: 3.7, EUR: 0.9 }) } });
mock.module(at('./email-helper.js'), { exports: { sendEmail: async () => ({ sent: true }) } });
const { runSummaryJob, summaryWorkspace, summaryHandler, eachLimited } = await import('./summaryJob.js');

test('the job sends to people with activity, skips quiet ones, and reads their own workspace', async () => {
  db.users = [
    { _id: 'u1', email: 'a@x.test', currency: 'ILS', defaultWorkspace: 'w1' },
    { _id: 'u2', email: 'b@x.test', currency: 'ILS', defaultWorkspace: 'w2' },
    { _id: 'u3', email: 'c@x.test', currency: 'ILS' }, // in no workspace
  ];
  db.workspaces = [
    { _id: 'w1', ownerId: 'u1', members: [{ userId: 'u1', status: 'accepted', role: 'owner' }] },
    { _id: 'w2', ownerId: 'u2', members: [{ userId: 'u2', status: 'accepted', role: 'owner' }] },
  ];
  db.rows = [{ workspaceId: 'w1', type: 'Expense', amount: 20, currency: 'ILS', date: '2026-10-03', category: 'groceries' }];
  const sent = [];
  const result = await runSummaryJob('weekly', { now: NOW, send: async (m) => { sent.push(m); return { sent: true }; } });
  assert.deepEqual(result, { sent: 1, skipped: 2, failed: 0 });
  assert.equal(sent[0].to, 'a@x.test');
  assert.deepEqual(db.txQueries[0].date, { $gte: '2026-09-28', $lte: '2026-10-04￿' });
});

test('a failed send is counted, not thrown', async () => {
  db.users = [{ _id: 'u1', email: 'a@x.test', currency: 'ILS', defaultWorkspace: 'w1' }];
  const result = await runSummaryJob('weekly', { now: NOW, send: async () => ({ sent: false }) });
  assert.deepEqual(result, { sent: 0, skipped: 0, failed: 1 });
});

test('a member without permission to see expenses gets no summary of that workspace', () => {
  const user = { _id: 'u2', defaultWorkspace: 'w1' };
  const w1 = { _id: 'w1', ownerId: 'u1', members: [{ userId: 'u2', status: 'accepted', role: 'viewer', permissions: { viewExpenses: false } }] };
  const w2 = { _id: 'w2', ownerId: 'u9', members: [{ userId: 'u2', status: 'accepted', role: 'editor', permissions: { viewExpenses: true } }] };
  assert.equal(summaryWorkspace(user, [w1]), null);
  assert.equal(summaryWorkspace(user, [w1, w2]), w2);
});

test('the cron handler refuses without authorization and reports counts with it', async () => {
  const res = () => ({ status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
  const denied = res();
  await summaryHandler('daily', { authorized: () => false, connect: async () => {} })({ method: 'GET' }, denied);
  assert.equal(denied.code, 401);
  db.users = [];
  const ok = res();
  await summaryHandler('daily', { authorized: () => true, connect: async () => {} })({ method: 'POST' }, ok);
  assert.equal(ok.code, 200);
  assert.deepEqual(ok.body, { success: true, sent: 0, skipped: 0, failed: 0 });
});

test('everyone is handled, a few at a time', async () => {
  let running = 0;
  let most = 0;
  const done = [];
  await eachLimited([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 4, async (n) => {
    running += 1;
    most = Math.max(most, running);
    await new Promise((r) => setTimeout(r, 2));
    done.push(n);
    running -= 1;
  });
  assert.equal(done.length, 12);
  assert.equal(most, 4);
  await eachLimited([], 4, async () => { throw new Error('never'); });
});

test('a row in another currency saved without a conversion counts at the rate of today', async () => {
  db.users = [{ _id: 'u1', email: 'a@x.test', currency: 'ILS', defaultWorkspace: 'w1' }];
  db.workspaces = [{ _id: 'w1', ownerId: 'u1', members: [{ userId: 'u1', status: 'accepted', role: 'owner' }] }];
  db.rows = [{ workspaceId: 'w1', type: 'Expense', amount: 10, currency: 'USD', amountInGlobalCurrency: null, date: '2026-10-03', category: 'food' }];
  const sent = [];
  await runSummaryJob('weekly', { now: NOW, send: async (m) => { sent.push(m); return { sent: true }; } });
  assert.match(sent[0].body, /37/);
  const without = await runSummaryJob('weekly', { now: NOW, rates: null, send: async () => ({ sent: true }) });
  assert.deepEqual(without, { sent: 0, skipped: 1, failed: 0 }, 'no rate: nothing it can count');
});
