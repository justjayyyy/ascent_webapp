import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getRates, forgetRates } from './rates.js';

const answer = (body, ok = true) => async () => ({ ok, status: ok ? 200 : 500, json: async () => body });
const RATES = { USD: 1, ILS: 3.7 };

beforeEach(() => forgetRates());

test('rates are fetched once and reused for an hour', async () => {
  let calls = 0;
  const fetchImpl = async (...args) => { calls += 1; return answer({ rates: RATES })(...args); };
  assert.deepEqual(await getRates({ fetchImpl, now: 0 }), RATES);
  assert.deepEqual(await getRates({ fetchImpl, now: 59 * 60 * 1000 }), RATES);
  assert.equal(calls, 1);
  await getRates({ fetchImpl, now: 61 * 60 * 1000 });
  assert.equal(calls, 2);
});

test('an unreachable or odd service gives null, or the last good answer', async () => {
  assert.equal(await getRates({ fetchImpl: async () => { throw new Error('offline'); }, now: 0 }), null);
  assert.equal(await getRates({ fetchImpl: answer({}, false), now: 0 }), null);
  assert.equal(await getRates({ fetchImpl: answer({ rates: { ILS: 3.7 } }), now: 0 }), null, 'not per USD');
  await getRates({ fetchImpl: answer({ rates: RATES }), now: 0 });
  assert.deepEqual(await getRates({ fetchImpl: answer({}, false), now: 2 * 60 * 60 * 1000 }), RATES);
});
