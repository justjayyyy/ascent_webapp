import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { nextOccurrence, noteToText } from './noteUtils';

const STORE = 'ascent_notes_notified';

const readNotified = () => {
  try { return new Set(JSON.parse(localStorage.getItem(STORE) || '[]')); } catch { return new Set(); }
};
const writeNotified = (set) => {
  try { localStorage.setItem(STORE, JSON.stringify([...set].slice(-200))); } catch { /* private mode */ }
};

/** Ask once, from a tap, so the browser lets us show reminders as system notifications. */
export function askNotificationPermission() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
  try { Notification.requestPermission(); } catch { /* older Safari */ }
}

async function systemNotify(note, key, title, body) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker?.ready;
    const options = { body, tag: key, icon: '/icon-192.png', badge: '/icon-192.png', data: { url: `/Notes?open=${note.id}` } };
    if (reg?.showNotification) await reg.showNotification(title, options);
    else new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fires each due reminder once: a system notification when allowed, plus an in-app toast.
 * Reminders live on the server per person, and are checked while the app is open or comes
 * back to the foreground (there is no push service behind this yet).
 */
export function useReminders(notes, { t, onOpen, onDismiss, onRepeat }) {
  const latest = useRef({ notes, t, onOpen, onDismiss, onRepeat });
  latest.current = { notes, t, onOpen, onDismiss, onRepeat };

  useEffect(() => {
    const check = () => {
      const { notes: list, t: tr, onOpen: open, onDismiss: dismiss, onRepeat: repeat } = latest.current;
      const notified = readNotified();
      const now = Date.now();
      let changed = false;
      list.forEach((n) => {
        if (!n.reminder || n.trashedAt || new Date(n.reminder).getTime() > now) return;
        const key = `${n.id}@${n.reminder}`;
        if (notified.has(key)) return;
        notified.add(key);
        changed = true;
        const title = n.title || tr('ntReminder');
        const body = noteToText(n, { withTitle: false }).slice(0, 140) || tr('ntReminderDue');
        systemNotify(n, key, title, body);
        // A repeating reminder moves on to its next time straight away
        const next = nextOccurrence(n.reminder, n.reminderRepeat, now);
        if (next && repeat) repeat(n.id, next, n.reminderRepeat);
        toast(`${tr('ntReminder')}: ${title}`, {
          description: body,
          duration: 15000,
          action: { label: tr('ntOpen'), onClick: () => open(n.id) },
          ...(next ? {} : { cancel: { label: tr('ntDismiss'), onClick: () => dismiss(n.id) } }),
        });
      });
      if (changed) writeNotified(notified);
    };
    check();
    const timer = setInterval(check, 30000);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [notes.length]);
}
