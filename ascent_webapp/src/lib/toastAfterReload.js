// A confirmation that has to outlive a full page load (leaving a household reloads the app on its home page, and
// the toast went with the old page): kept for this tab in sessionStorage and shown once the app is back.
import { toast } from 'sonner';

const KEY = 'ascent_toast_after_reload';

export function toastAfterReload(message) {
  try { sessionStorage.setItem(KEY, message); } catch { /* storage unavailable: no confirmation, nothing worse */ }
}

/** Shows the confirmation the previous page left, once. Call after the toaster has mounted. */
export function showToastFromBeforeReload() {
  let message = null;
  try {
    message = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch { /* storage unavailable */ }
  if (message) toast.success(message);
}
