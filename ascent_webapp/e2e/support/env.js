// Where the browser tests' servers listen. One knob each, so a second copy of the suite (or a dev server
// already holding the defaults) can run beside it: E2E_API_PORT=3302 E2E_APP_PORT=4390 npm run test:e2e
// Never a port on the browsers' blocked list (fetch.spec.whatwg.org/#bad-port): WebKit refuses to load a page from
// one. The default was 4190 (ManageSieve), so on Linux every WebKit page load hung while Chromium ran fine
export const APP_PORT = Number(process.env.E2E_APP_PORT) || 4180;
export const API_PORT = Number(process.env.E2E_API_PORT) || 3102;
// Started by e2e/serve-api.mjs next to the API
export const CONTROL_URL = `http://127.0.0.1:${API_PORT + 1}`;
export const APP_URL = `http://localhost:${APP_PORT}`;
