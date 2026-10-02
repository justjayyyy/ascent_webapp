// Error reports from the app to Sentry. Off unless VITE_SENTRY_DSN is set at build time.
//
// The SDK is loaded a moment after start-up, in its own chunk, so it never slows the first screen; errors
// before then are kept and sent once it is ready. Reports go through /api/monitoring (the page's
// Content-Security-Policy only lets it talk to its own API, and ad blockers often drop Sentry's address).
// Nothing personal leaves the device: no query strings, form data, console output or emails.
const DSN = import.meta.env.VITE_SENTRY_DSN;
const LOAD_AFTER_MS = 3000;
const MAX_EARLY = 20;

let sentry = null;
let userId = null;
const early = [];

const withoutQuery = (url) => String(url || '').split('?')[0].split('#')[0];

/** Drops whatever could identify a person or their money from an event before it is sent. */
export function scrubEvent(event) {
  if (event.request) {
    event.request = { url: withoutQuery(event.request.url) };
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
  if (Array.isArray(event.breadcrumbs)) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb).filter(Boolean);
  return event;
}

export function scrubBreadcrumb(crumb) {
  if (!crumb) return null;
  if (crumb.category === 'console') return null; // logs can contain anything
  if (crumb.data?.url) crumb.data = { ...crumb.data, url: withoutQuery(crumb.data.url) };
  if (crumb.data?.from) crumb.data = { ...crumb.data, from: withoutQuery(crumb.data.from), to: withoutQuery(crumb.data.to) };
  return crumb;
}

const keepEarly = (error) => { if (early.length < MAX_EARLY) early.push(error); };
const onEarlyError = (e) => keepEarly(e.error || e.message);
const onEarlyRejection = (e) => keepEarly(e.reason);

/** Starts error reporting (call once at start-up). */
export function startMonitoring() {
  if (!DSN || typeof window === 'undefined') return;
  window.addEventListener('error', onEarlyError);
  window.addEventListener('unhandledrejection', onEarlyRejection);
  setTimeout(async () => {
    try {
      const S = await import('./sentryClient');
      S.init({
        dsn: DSN,
        tunnel: '/api/monitoring',
        environment: import.meta.env.MODE,
        release: import.meta.env.VITE_RELEASE || undefined,
        sendDefaultPii: false,
        beforeSend: scrubEvent,
        beforeBreadcrumb: scrubBreadcrumb,
      });
      sentry = S;
      if (userId) S.setUser({ id: userId });
    } catch {
      return; // reporting is never worth breaking the app for
    } finally {
      window.removeEventListener('error', onEarlyError);
      window.removeEventListener('unhandledrejection', onEarlyRejection);
    }
    early.splice(0).forEach((error) => sentry.captureException(error));
  }, LOAD_AFTER_MS);
}

/** Reports an error the app caught itself (an error screen, say). */
export function reportError(error, extra) {
  if (!DSN) return;
  if (sentry) sentry.captureException(error, extra ? { extra } : undefined);
  else keepEarly(error);
}

/** Who is signed in, by id only, so a problem can be counted per person without saying who. */
export function setMonitoringUser(id) {
  userId = id ? String(id) : null;
  if (sentry) sentry.setUser(userId ? { id: userId } : null);
}
