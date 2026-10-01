// Sends the daily or weekly summary email to everyone who asked for it.
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';
import ExpenseTransaction from '../models/ExpenseTransaction.js';
import { sendEmail } from './email-helper.js';
import { periodFor, periodSummary, renderSummaryEmail } from './summaryEmail.js';
import { isSame } from '../../shared/workspaceAccess.js';

const PREF = { daily: 'dailySummary', weekly: 'weeklyReports' };

export const appUrl = (env = process.env) =>
  (env.FRONTEND_URL || env.NEXT_PUBLIC_APP_URL || 'https://ascentwebapp.vercel.app').replace(/\/+$/, '');

const canSeeExpenses = (workspace, member) =>
  member.role === 'owner' || member.role === 'admin' || isSame(workspace.ownerId, member.userId) || member.permissions?.viewExpenses === true;

/** The workspace a person's summary is about: their default one if they can still see its expenses, else the first that qualifies. */
export function summaryWorkspace(user, workspaces) {
  const usable = workspaces.filter((w) => {
    const me = (w.members || []).find((m) => m.status === 'accepted' && isSame(m.userId, user._id));
    return me && canSeeExpenses(w, me);
  });
  return usable.find((w) => isSame(w._id, user.defaultWorkspace)) || usable[0] || null;
}

/** Returns { sent, skipped, failed }. A period with no activity sends nothing. */
export async function runSummaryJob(kind, { now = new Date(), send = sendEmail } = {}) {
  const period = periodFor(kind, now);
  const users = await User.find({ [PREF[kind]]: true, emailNotifications: true, email: { $nin: [null, ''] } })
    .select('email full_name language currency defaultWorkspace')
    .lean();

  const result = { sent: 0, skipped: 0, failed: 0 };
  for (const user of users) {
    try {
      const workspaces = await Workspace.find({ members: { $elemMatch: { userId: user._id, status: 'accepted' } } })
        .select('ownerId members')
        .lean();
      const workspace = summaryWorkspace(user, workspaces);
      if (!workspace) { result.skipped += 1; continue; }

      const rows = await ExpenseTransaction.find({ workspaceId: workspace._id, date: { $gte: period.from, $lte: `${period.to}￿` } })
        .select('type amount currency amountInGlobalCurrency globalCurrency category date status')
        .lean();
      const summary = periodSummary(rows, { ...period, currency: user.currency || 'USD' });
      if (summary.count === 0) { result.skipped += 1; continue; }

      const email = renderSummaryEmail({ kind, user, summary, period, appUrl: appUrl() });
      const outcome = await send({ to: user.email, subject: email.subject, body: email.text, html: email.html });
      if (outcome?.sent) result.sent += 1; else result.failed += 1;
    } catch (err) {
      result.failed += 1;
      console.error(`[Summary ${kind}] ${user._id}:`, err?.message);
    }
  }
  return result;
}

/** The cron route for one kind of summary. */
export function summaryHandler(kind, { authorized, connect }) {
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
    if (!authorized(req)) return res.status(401).json({ success: false, error: 'Unauthorized' });
    try {
      await connect();
      return res.status(200).json({ success: true, ...(await runSummaryJob(kind)) });
    } catch (err) {
      console.error(`[Summary ${kind}] failed:`, err?.message);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  };
}
