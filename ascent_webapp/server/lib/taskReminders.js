// Household task reminders, sent by the daily cron as push notifications: once when a task enters its
// reminder window ("in 7 days"), on the day it is due, and the day after if it is still open. Only the
// member it is assigned to hears about it; a task for anyone goes to every member.
import HouseTask from '../models/HouseTask.js';
import Workspace from '../models/Workspace.js';
import User from '../models/User.js';
import { notifyUser } from './push.js';
import { isSame } from '../../shared/workspaceAccess.js';

const DAY_MS = 86_400_000;
const dayNumber = (day) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
const fromNumber = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** Which reminder a task is due today, if any: 'ahead' | 'today' | 'late'. */
export function reminderFor(task, today) {
  if (task.status !== 'open' || !task.dueDate) return null;
  const days = dayNumber(task.dueDate) - dayNumber(today);
  if (days === 0) return 'today';
  if (days === -1) return 'late';
  if (days > 0 && task.remindDays > 0 && days === task.remindDays) return 'ahead';
  return null;
}

const COPY = {
  en: { ahead: 'In {n} days: {title}', today: 'Today: {title}', late: 'Still to do: {title}', cost: 'Usually {amount}' },
  he: { ahead: 'בעוד {n} ימים: {title}', today: 'היום: {title}', late: 'עדיין פתוח: {title}', cost: 'בדרך כלל {amount}' },
  ru: { ahead: 'Через {n} дн.: {title}', today: 'Сегодня: {title}', late: 'Ещё не сделано: {title}', cost: 'Обычно {amount}' },
};

function formatMoney(amount, currency, language) {
  const locale = language === 'he' ? 'he-IL' : language === 'ru' ? 'ru-RU' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: currency || 'ILS', maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency || ''}`.trim();
  }
}

/** The notification for one task, in the reader's language. */
export function reminderPush(task, kind, language = 'en') {
  const c = COPY[language] || COPY.en;
  const title = c[kind].replace('{n}', task.remindDays).replace('{title}', task.title);
  const body = task.amount > 0 ? c.cost.replace('{amount}', formatMoney(task.amount, task.currency, language)) : '';
  return { title, body, url: `/Tasks?task=${task._id}`, tag: `task-${task._id}-${kind}` };
}

/** The members who should hear about a task: its assignee, or every accepted member when it is anyone's. */
export function recipientsOf(task, workspace) {
  const members = (workspace?.members || []).filter((m) => m.userId && (m.status === 'accepted' || m.status == null));
  if (!task.assignee) return members;
  const assignee = members.filter((m) => String(m.email || '').toLowerCase() === task.assignee.toLowerCase());
  // Someone who has since left: tell the household rather than nobody
  return assignee.length ? assignee : members;
}

/** Sends today's reminders. Returns { tasks, sent }. `today` is the household's day (YYYY-MM-DD). */
export async function runTaskReminders({ today = new Date().toISOString().slice(0, 10), notify = notifyUser } = {}) {
  const n = dayNumber(today);
  // Late by a day, up to the longest reminder window ahead
  const tasks = await HouseTask.find({ status: 'open', dueDate: { $gte: fromNumber(n - 1), $lte: fromNumber(n + 90) } })
    .select('title dueDate remindDays amount currency assignee status workspaceId')
    .lean();
  const due = tasks.map((task) => ({ task, kind: reminderFor(task, today) })).filter((x) => x.kind);
  if (!due.length) return { tasks: 0, sent: 0 };

  const workspaces = await Workspace.find({ _id: { $in: [...new Set(due.map((x) => String(x.task.workspaceId)))] } }).select('members ownerId').lean();
  const byId = new Map(workspaces.map((w) => [String(w._id), w]));
  const people = due.flatMap(({ task }) => recipientsOf(task, byId.get(String(task.workspaceId))).map((m) => m.userId));
  const users = await User.find({ _id: { $in: people } }).select('language').lean();
  const language = (id) => users.find((u) => isSame(u._id, id))?.language || 'en';

  let sent = 0;
  for (const { task, kind } of due) {
    for (const member of recipientsOf(task, byId.get(String(task.workspaceId)))) {
      const outcome = await notify(member.userId, reminderPush(task, kind, language(member.userId)));
      sent += outcome?.sent || 0;
    }
  }
  return { tasks: due.length, sent };
}
