// The kitchen check reminder, sent by the daily cron as a push notification to every member of a household
// that asked for one: on the day the check is due, and once more two days later if nobody has done it yet.
// Whoever does the check does it for everyone, so a check by one member stops the reminders for all.
import Workspace from '../models/Workspace.js';
import User from '../models/User.js';
import { notifyUser } from './push.js';
import { isSame } from '../../shared/workspaceAccess.js';

const DAY_MS = 86_400_000;
const dayNumber = (day) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
const dayOfMoment = (value) => new Date(value).toISOString().slice(0, 10);
const LATE_DAYS = 2;

/**
 * Which kitchen check reminder is due today, if any: 'due' | 'late'. Counted from the last check, or from
 * when the reminder was set before there was one. `today` is YYYY-MM-DD.
 */
export function kitchenReminderFor(check, today) {
  const every = check?.everyDays;
  if (!(every >= 1)) return null;
  const from = check.lastAt || check.since;
  if (!from) return null;
  const days = dayNumber(today) - dayNumber(dayOfMoment(from));
  if (days === every) return 'due';
  if (days === every + LATE_DAYS) return 'late';
  return null;
}

const COPY = {
  en: {
    due: 'Time for the kitchen check',
    late: 'The kitchen check is still waiting',
    body: 'Say how much is left of each thing. Once one of you does it, it is done for everyone.',
  },
  he: {
    due: 'הגיע הזמן לבדיקת המטבח',
    late: 'בדיקת המטבח עדיין מחכה',
    body: 'סמנו כמה נשאר מכל דבר. מספיק שאחד מכם יעשה את זה.',
  },
  ru: {
    due: 'Пора проверить кухню',
    late: 'Проверка кухни всё ещё ждёт',
    body: 'Отметьте, сколько чего осталось. Достаточно, чтобы это сделал один из вас.',
  },
};

/** The notification, in the reader's language. */
export function kitchenPush(workspaceId, kind, language = 'en') {
  const c = COPY[language] || COPY.en;
  return { title: c[kind], body: c.body, url: '/Groceries?view=check', tag: `kitchen-${workspaceId}` };
}

/** Sends today's kitchen check reminders. Returns { households, sent }. */
export async function runKitchenReminders({ today = new Date().toISOString().slice(0, 10), notify = notifyUser } = {}) {
  const workspaces = await Workspace.find({ 'kitchenCheck.everyDays': { $gte: 1 } }).select('members kitchenCheck').lean();
  const due = workspaces.map((w) => ({ w, kind: kitchenReminderFor(w.kitchenCheck, today) })).filter((x) => x.kind);
  if (!due.length) return { households: 0, sent: 0 };

  const membersOf = (w) => (w.members || []).filter((m) => m.userId && (m.status === 'accepted' || m.status == null));
  const users = await User.find({ _id: { $in: due.flatMap(({ w }) => membersOf(w).map((m) => m.userId)) } }).select('language').lean();
  const language = (id) => users.find((u) => isSame(u._id, id))?.language || 'en';

  let sent = 0;
  for (const { w, kind } of due) {
    for (const member of membersOf(w)) {
      const outcome = await notify(member.userId, kitchenPush(String(w._id), kind, language(member.userId)));
      sent += outcome?.sent || 0;
    }
  }
  return { households: due.length, sent };
}
