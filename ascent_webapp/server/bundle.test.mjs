// Vercel's bundler does not reliably follow the handlers' import() into node_modules, so api/index.js
// lists every package they use. This keeps that list complete: a package missing there only fails in
// production ("Cannot find package ...").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const builtins = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));

function sources(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'scripts' ? [] : sources(p);
    return /\.m?js$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

const packagesIn = (file) => [...fs.readFileSync(file, 'utf8').matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'".][^'"]*)['"]/g)]
  .map((m) => m[1])
  .filter((spec) => !builtins.has(spec) && !builtins.has(spec.split('/')[0]));

test('every package the API uses is listed in api/index.js', () => {
  const listed = new Set(packagesIn(path.join(root, 'api/index.js')));
  const used = new Set([...sources(path.join(root, 'server')), ...sources(path.join(root, 'shared'))].flatMap(packagesIn));
  const missing = [...used].filter((spec) => !listed.has(spec)).sort();
  assert.deepEqual(missing, [], `add to api/index.js: ${missing.join(', ')}`);
});
