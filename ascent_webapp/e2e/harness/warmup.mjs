// Gets the API through its cold start before the tests begin. On first use every route imports its handler,
// every model compiles and builds its indexes; with several test workers arriving at once that took long enough
// for the first tests to time out. Run before the API starts listening, so it is healthy only once warm.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import mongoose from 'mongoose';
import connectDB from '../../server/lib/mongodb.js';

const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../server');
const HANDLER_DIRS = ['models', 'auth', 'api', 'entities', 'integrations'];

const modulesIn = (dir) => fs.readdirSync(path.join(SERVER, dir))
  .filter((f) => f.endsWith('.js') && !f.includes('.test.'))
  .map((f) => pathToFileURL(path.join(SERVER, dir, f)).href);

export async function warmUp() {
  const started = Date.now();
  // Connected first: a model starts creating its collection and indexes as soon as it compiles, and the API turns
  // off Mongoose's command buffering
  await connectDB();
  for (const dir of HANDLER_DIRS) await Promise.all(modulesIn(dir).map((m) => import(m)));
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).init()));
  console.log(`[e2e] API warmed up in ${Date.now() - started} ms (${mongoose.modelNames().length} models)`);
}

/** Logs whenever the API's one thread was blocked long enough to make tests wait. */
export function watchEventLoop({ thresholdMs = 1000, everyMs = 5000 } = {}) {
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  setInterval(() => {
    const maxMs = Math.round(delay.max / 1e6);
    if (maxMs >= thresholdMs) console.warn(`[e2e] the API's event loop was blocked for ${maxMs} ms`);
    delay.reset();
  }, everyMs).unref();
}
