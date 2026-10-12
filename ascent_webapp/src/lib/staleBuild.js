// After a new release, a page still running the previous one can ask for code files that release no
// longer has (the new service worker takes over and clears the old files at once). The answer is to load
// the page again, which brings the new release. Guarded, so a file that is truly missing cannot reload
// the page in a loop.

const RELOADED_AT_KEY = 'ascent.staleBuildReloadAt';
const GUARD_MS = 60 * 1000;

// Chrome, Firefox and Safari word a failed module download differently; '<' is an HTML page served
// where a script was asked for
const STALE = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unexpected token '<'/i;

/** Whether an error comes from code of an earlier release that is no longer there. */
export const isStaleBuildError = (error) => STALE.test(String(error?.message ?? error ?? ''));

/** Load the page again for the new release; false when it just did (or cannot tell), to never loop. */
export function reloadForNewBuild({ reload = () => window.location.reload(), now = Date.now() } = {}) {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT_KEY)) || 0;
    if (now - last < GUARD_MS) return false;
    sessionStorage.setItem(RELOADED_AT_KEY, String(now));
  } catch {
    return false;
  }
  reload();
  return true;
}
