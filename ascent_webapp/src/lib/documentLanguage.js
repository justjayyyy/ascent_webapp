// The one place that sets <html lang dir>. The app sets its language (the signed-in person's); a page can
// put its own on top for as long as it is open (the sign-in page follows its language picker) and
// release it, which brings back whatever the app's language is by then.
let appLanguage = null;
let pageLanguage = null;

export const directionOf = (language) => (language === 'he' ? 'rtl' : 'ltr');

function apply(root = typeof document === 'undefined' ? null : document.documentElement) {
  const language = pageLanguage || appLanguage;
  if (!root || !language) return;
  root.lang = language;
  root.dir = directionOf(language);
}

export function setAppLanguage(language, root) {
  appLanguage = language;
  apply(root);
}

/** A page's own language while it is open; pass null when it closes. */
export function setPageLanguage(language, root) {
  pageLanguage = language;
  apply(root);
}
