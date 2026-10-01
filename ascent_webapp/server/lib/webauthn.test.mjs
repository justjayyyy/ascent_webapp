import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relyingParty, deviceLabel } from './webauthn.js';

const req = (headers) => ({ headers });

test('the RP ID is the host the app is served from', () => {
  assert.deepEqual(relyingParty(req({ origin: 'https://ascentwebapp.vercel.app' })), {
    origin: 'https://ascentwebapp.vercel.app', rpID: 'ascentwebapp.vercel.app', rpName: 'Ascent',
  });
  assert.equal(relyingParty(req({ origin: 'http://localhost:5173' })).rpID, 'localhost');
  assert.equal(relyingParty(req({ origin: 'https://ascentwebapp-git-feat-x.vercel.app' })).rpID, 'ascentwebapp-git-feat-x.vercel.app');
});

test('origins we do not serve get nothing', () => {
  assert.equal(relyingParty(req({ origin: 'https://evil.example' })), null);
  assert.equal(relyingParty(req({ origin: 'https://someone-else.vercel.app' })), null);
  assert.equal(relyingParty(req({ origin: 'http://ascentwebapp.vercel.app' })), null);
  assert.equal(relyingParty(req({})), null);
});

test('Referer stands in for a missing Origin', () => {
  assert.equal(relyingParty(req({ referer: 'https://ascentwebapp.vercel.app/login?x=1' })).rpID, 'ascentwebapp.vercel.app');
});

test('new passkeys are named after the device', () => {
  assert.equal(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)'), 'iPhone');
  assert.equal(deviceLabel('Mozilla/5.0 (Linux; Android 16; Pixel 10)'), 'Android');
  assert.equal(deviceLabel(''), 'Passkey');
});
