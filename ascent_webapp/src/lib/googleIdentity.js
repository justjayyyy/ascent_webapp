// Google Identity Services (accounts.google.com/gsi/client), loaded once, on demand. The sign-in page loads
// it for "Continue with Google", but the app often opens without passing through sign-in (a saved session,
// Face ID), so anything else that needs Google (the calendar) asks for it here first.
const GSI_SRC = 'https://accounts.google.com/gsi/client';
let loading = null;

const ready = () => !!window.google?.accounts?.oauth2;

/** Resolves once `window.google.accounts` is usable; rejects if the script cannot load (offline, blocked). */
export function loadGoogleIdentity() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no_window'));
  if (ready()) return Promise.resolve(window.google);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const done = () => (ready() ? resolve(window.google) : reject(new Error('gsi_unavailable')));
    let script = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = GSI_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', done, { once: true });
    script.addEventListener('error', () => reject(new Error('gsi_unavailable')), { once: true });
    // A tag another screen added may already have loaded
    if (ready()) resolve(window.google);
  }).catch((err) => {
    loading = null; // let the next attempt try again (back online, say)
    throw err;
  });
  return loading;
}
