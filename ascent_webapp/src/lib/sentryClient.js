// Only the parts of the Sentry SDK the app uses, imported by name so the rest is left out of the
// bundle. Loaded on demand by monitoring.js.
export { init, captureException, setUser } from '@sentry/react';
