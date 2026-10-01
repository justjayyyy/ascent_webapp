import '@fontsource-variable/inter';
import '@fontsource-variable/heebo';
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { ensureStandaloneTopInset } from '@/lib/safeArea'
import { trackVisualViewport } from '@/lib/viewport'
import { registerSW } from 'virtual:pwa-register'

ensureStandaloneTopInset();
trackVisualViewport();

ReactDOM.createRoot(document.getElementById('root')).render(<App />)

// Keep installed PWAs on the latest build. A new service worker installs in the background;
// it takes over the next time the app goes to the background (or right away if the page has
// only just opened), so an update never reloads the screen under someone's thumb halfway
// through typing an expense. We also re-check whenever the app returns to the foreground,
// because installed PWAs are rarely fully reloaded.
if (import.meta.env.PROD) {
  const openedAt = Date.now();
  let waiting = false;
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      if (Date.now() - openedAt < 4000 || document.visibilityState === 'hidden') { updateSW(true); return; }
      waiting = true;
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => registration.update().catch(() => {});
      setInterval(check, 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
        else if (waiting) updateSW(true);
      });
    },
  });
}

// Once the first screen is up, load every page's code in the background, so switching tabs in the
// dock never waits for a download or shows a skeleton
const prefetchPages = () => {
  import('./pages/Dashboard'); import('./pages/Expenses'); import('./pages/Income');
  import('./pages/Plans'); import('./pages/Notes'); import('./pages/Settings');
};
if ('requestIdleCallback' in window) requestIdleCallback(prefetchPages, { timeout: 4000 });
else setTimeout(prefetchPages, 2500);
