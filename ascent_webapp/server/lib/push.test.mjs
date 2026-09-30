import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const at = (p) => pathToFileURL(new URL(p, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href;

let subs;
let sent;
let deleted;
let behaviour; // (endpoint) => 'ok' | 'gone' | 'error' | 'hang'
mock.module('web-push', {
  exports: {
    default: {
      setVapidDetails() {},
      async sendNotification(sub, body) {
        sent.push({ endpoint: sub.endpoint, body });
        const b = behaviour(sub.endpoint);
        if (b === 'gone') throw Object.assign(new Error('gone'), { statusCode: 410 });
        if (b === 'error') throw Object.assign(new Error('boom'), { statusCode: 500 });
        if (b === 'hang') await new Promise(() => {});
      },
    },
  },
});
mock.module(at('../models/PushSubscription.js'), {
  exports: {
    default: {
      find: () => ({ lean: async () => subs }),
      deleteOne: async (q) => { deleted.push(String(q._id)); return {}; },
    },
  },
});

process.env.VAPID_PUBLIC_KEY = 'pub';
process.env.VAPID_PRIVATE_KEY = 'priv';
const { notifyUser } = await import('./push.js');
const { paymentPush } = await import('./ingest/notify.js');

beforeEach(() => {
  subs = [
    { _id: 'a', endpoint: 'https://push.example/a', p256dh: 'k', auth: 's' },
    { _id: 'b', endpoint: 'https://push.example/b', p256dh: 'k', auth: 's' },
  ];
  sent = [];
  deleted = [];
  behaviour = () => 'ok';
});

test('sends the payload to every subscribed device', async () => {
  const r = await notifyUser('u1', { title: 'T', body: 'B' });
  assert.equal(r.sent, 2);
  assert.deepEqual(sent.map((s) => s.endpoint), ['https://push.example/a', 'https://push.example/b']);
  assert.deepEqual(JSON.parse(sent[0].body), { title: 'T', body: 'B' });
});

test('a gone subscription is removed, other failures are kept, and nothing throws', async () => {
  behaviour = (e) => (e.endsWith('/a') ? 'gone' : 'error');
  const r = await notifyUser('u1', { title: 'T' });
  assert.equal(r.sent, 0);
  assert.deepEqual(deleted, ['a']);
});

test('a hanging push service cannot hold the caller up', async () => {
  behaviour = () => 'hang';
  const started = Date.now();
  const r = await notifyUser('u1', { title: 'T' }, { timeoutMs: 50 });
  assert.equal(r.sent, 0);
  assert.ok(Date.now() - started < 1000);
});

test('no subscriptions means nothing is sent', async () => {
  subs = [];
  assert.deepEqual(await notifyUser('u1', {}), { sent: 0 });
  assert.equal(sent.length, 0);
});

test('paymentPush formats the amount and speaks the user language', () => {
  const ev = { merchant: 'Aroma', amount: 18, currency: 'ILS' };
  assert.deepEqual(paymentPush(ev, 'en'), { title: 'Aroma', body: '₪18.00 · Needs review', url: '/Expenses', tag: 'tap-payment' });
  assert.match(paymentPush(ev, 'he').body, /ממתין לבדיקה$/);
  assert.match(paymentPush(ev, 'ru').body, /Нужна проверка$/);
  assert.equal(paymentPush({ ...ev, merchant: '' }, 'en').title, 'Apple Pay');
  assert.match(paymentPush(ev, 'xx').body, /Needs review$/);
  assert.match(paymentPush({ ...ev, currency: 'NOPE' }, 'en').body, /18 NOPE/);
});
