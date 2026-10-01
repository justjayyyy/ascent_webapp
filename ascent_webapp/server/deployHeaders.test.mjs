// The web pages' security headers (vercel.json) still fit the app: every inline script is allowed by hash,
// and the outside services the browser talks to are allowed, so a change to either is caught here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const vercel = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'));
const html = await readFile(new URL('index.html', root), 'utf8');
const pageHeaders = vercel.headers.find((h) => h.source === '/((?!api/).*)').headers;
const header = (key) => pageHeaders.find((h) => h.key === key)?.value || '';
const csp = Object.fromEntries(header('Content-Security-Policy').split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));

test('every inline script in index.html is allowed by its hash, and nothing else inline is', () => {
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(inline.length > 0);
  for (const code of inline) {
    const hash = `'sha256-${createHash('sha256').update(code).digest('base64')}'`;
    assert.ok(csp['script-src'].includes(hash), `index.html changed: put ${hash} in script-src`);
  }
  assert.ok(!csp['script-src'].includes("'unsafe-inline'"));
  assert.ok(!csp['script-src'].includes("'unsafe-eval'"));
});

test('pages cannot be framed or turned into something else', () => {
  assert.deepEqual(csp['frame-ancestors'], ["'none'"]);
  assert.deepEqual(csp['object-src'], ["'none'"]);
  assert.deepEqual(csp['base-uri'], ["'self'"]);
  assert.equal(header('X-Frame-Options'), 'DENY');
  assert.equal(header('X-Content-Type-Options'), 'nosniff');
});

test('the outside services the browser uses are allowed', async () => {
  const rates = await readFile(new URL('src/hooks/useWorkspaceData.js', root), 'utf8');
  for (const origin of rates.match(/https:\/\/[a-z0-9.-]+/g)) assert.ok(csp['connect-src'].includes(origin), origin);
  assert.ok(csp['script-src'].includes('https://accounts.google.com/gsi/client'), 'Google sign-in');
  assert.ok(csp['frame-src'].some((s) => s.startsWith('https://accounts.google.com/')), 'Google sign-in popup');
});
